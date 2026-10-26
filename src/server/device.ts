/**
 * `iva serve`: the project for iViewer on a real device, over the LAN, the
 * way GUI Designer's Upload Service serves it (port 8019; `/` and
 * `/<name>.gui` are the .gui, every other file by its path in the build, the same
 * headers), so iViewer loads it from "GUI File URL" = http://<this machine>:8019.
 * A project in several sizes (<Project sizes>): its own at /, each other at a
 * path of its own (/1400w1400h/, laid out as at /).
 *
 * A JSX project is rebuilt on save (every size, the one at / first); a .gui is
 * re-read when it changes (say, saved from GUI Designer). With live reload on
 * (default), the served .gui carries one extra script that waits for the next
 * build and reloads the panel with CF.loadGUI, so the device follows your edits.
 *
 * While it runs it's advertised on the network (mDNS / DNS-SD: mdns.ts), each
 * size of its own, so the iva panel's settings list them and load the one tapped.
 */

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { compile, IvaError, scriptsDir, slug, type CompileResult } from '../compiler/index.js';
import { sizeFolder, sizeLabel, type ScreenSize } from '../compiler/components.js';
import { VERSION } from '../create.js';
import { servedTxt } from '../runtime/cf/mdns/served.js';
import type { IUdpSocket } from '../runtime/stdlib/net/types.js';
import { advertise, type Advertised, type AdvertisedService } from './mdns.js';
import { watchInputs, watchTree } from './watch.js';
import { writeZip } from './zip.js';

export interface DeviceServerOptions {
  /** a JSX entry, or a .gui */
  target: string;
  port: number;
  host: string;
  /** reload the panel on the device after each build (default true) */
  live: boolean;
  /**
   * build a JSX project for this screen instead of its own size ('1400x1400'):
   * that size only, at / (as iva build --size); without it each other size of
   * <Project sizes> is served too, at a path of its own (/1400w1400h/), for a
   * device to choose
   */
  size?: string;
  /**
   * advertise it on the network while it runs - an _iva._tcp service (DNS-SD)
   * for each size served, on each address it serves at, for the iva panel's
   * settings to find (default true; iva serve --no-mdns: off)
   */
  mdns?: boolean;
  /** the mDNS sockets (default: Node's, on port 5353) - a fake network's in the tests */
  mdnsSocket?: () => IUdpSocket;
  log?: (msg: string) => void;
}

/** What GUI Designer's Upload Service answers with (v2.7.10.918). */
const CF_SERVER = 'v2.7.10.918;debug=launchmonitor;complete=cachecomplete';
const TYPES: Record<string, string> = {
  '.gui': 'text/xml', '.xml': 'text/xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  // GUI Designer sends scripts as text/html; iViewer takes them so
  '.js': 'text/html', '.html': 'text/html', '.htm': 'text/html',
};
/**
 * The live script's name in a build's .gui: the build's version in it. A page
 * that got a .gui before a rebuild asks for its scripts after; by its name, the
 * script it gets waits on that .gui's build (it sees the newer one, and reloads)
 * - not on the build served when it asks (it would wait on that, and stay on
 * the older .gui). It also makes each build's .gui another text, and its
 * script a file no cache has.
 */
const liveName = (version: string) => `iva-live-${version}.js`;
/** a live script asked for, its version (none: an older iva serve's .gui, iva-live.js - it sees the build served now at once) */
const LIVE_SCRIPT = /^iva-live(?:-([a-z0-9]+))?\.js$/;

interface Served {
  name: string;
  /** what it's called: the project's name, the .gui's, the folder's */
  title: string;
  /** the size it's built for ('1400x1400@3x'); '' for a .gui or a folder */
  label: string;
  /** the .gui as served (the live script added when live); a folder's: the page listing its GUIs */
  gui: Buffer;
  /** a folder served: what's at / is that page (HTML), there's no one build */
  html?: boolean;
  /** other files by lower-cased path: `path` as served (images/x.png) */
  files: Map<string, ServedFile>;
  /** the build at /: the project's other sizes (<Project sizes>; none with --size), each served at a path of its own */
  sizes?: ScreenSize[];
  /** the build's warnings (another size's that differ are logged when it's built) */
  warnings?: string[];
  version: string;
  modified: Date;
}

interface ServedFile {
  name: string;
  path: string;
  data?: Buffer;
  file?: string;
}

/** One size's build as served: its .gui (the live script added when live), its files by lower-cased path. */
type SizeBuild = Pick<Served, 'name' | 'gui' | 'files'>;

/**
 * A GUI served, at a path of its own: the one at / (the project's own size,
 * --size's, a .gui, a folder), or another size of <Project sizes> at
 * /<W>w<H>h/ - each its own build, live reload, archive and mDNS service, for
 * a device to choose.
 */
interface Site {
  /** where it's served: '' (/), '1400w1400h' (/1400w1400h/) */
  folder: string;
  /** another size: the one it's built for */
  size?: ScreenSize;
  /** its build as served (replaced on each good build); null until there's one */
  served: Served | null;
  /** why its last build failed */
  error: string | null;
  /** what its last good build read: watched, with the other sizes' */
  inputs: CompileResult['inputs'] | null;
  /** devices waiting for its next build (live reload) */
  waiting: Set<(v: string) => void>;
  /** what the live script of its last few builds has from its .gui (its servers, its systems), by version */
  recent: Map<string, { servers: PanelServer[]; systems: string[] }>;
  /** its build in one archive, made once a build (and host) */
  zipped: { key: string; data: Buffer } | null;
  /** its first build done, good or not: a request before it waits */
  tried: Promise<void>;
  done: () => void;
}

/** A GUI to serve at `folder` ('': at /), not built yet. */
function newSite(folder: string, size?: ScreenSize): Site {
  let done = () => {};
  const tried = new Promise<void>((r) => (done = r));
  return { folder, size, served: null, error: null, inputs: null, waiting: new Set(), recent: new Map(), zipped: null, tried, done };
}

/** An address --host gives as served at: one of this machine's (its interface and netmask), else as given. */
function hostAddress(host: string): Address {
  for (const [iface, list] of Object.entries(os.networkInterfaces())) {
    const a = list?.find((x) => x.family === 'IPv4' && x.address === host);
    if (a) return { address: host, iface, netmask: a.netmask, kind: VIRTUAL.find(([re]) => re.test(iface))?.[1] };
  }
  return { address: host, iface: '' };
}

export interface Address {
  address: string;
  iface: string;
  /** its network's netmask (where an mDNS query came from: which network) */
  netmask?: string;
  /** what kind of network, when the interface name tells (ZeroTier, Tailscale, ...) */
  kind?: string;
}

const VIRTUAL: [RegExp, string][] = [
  [/^zt/, 'ZeroTier'], [/^tailscale|^utun/, 'Tailscale / VPN'], [/^wg/, 'WireGuard'], [/^tun|^tap|^ppp/, 'VPN'],
  [/^docker|^br-|^veth/, 'Docker'], [/^virbr|^vmnet|^vboxnet|^lxc|^lxd/, 'virtual machines'],
];

/** The machine's IPv4 addresses a device could reach (not loopback); real networks first. */
export function lanAddresses(): Address[] {
  const out: Address[] = [];
  for (const [iface, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      out.push({ address: a.address, iface, netmask: a.netmask, kind: VIRTUAL.find(([re]) => re.test(iface))?.[1] });
    }
  }
  return out.sort((x, y) => Number(!!x.kind) - Number(!!y.kind));
}

/** The .gui with one more script: the live-reload one of this build, last. */
function withLiveScript(xml: string, version: string): string {
  const tag = `<script name="${liveName(version)}" />`;
  if (/<\/scripts>/.test(xml)) return xml.replace(/(\s*)<\/scripts>/, `$1  ${tag}$1</scripts>`);
  if (/<scripts\s*\/>/.test(xml)) return xml.replace(/<scripts\s*\/>/, `<scripts>${tag}</scripts>`);
  return xml.replace(/(\r?\n?\s*)<(page|subpage)\b/, `$1<scripts>${tag}</scripts>$1<$2`);
}

/** The page at / of a folder served: its GUIs (.gui files, zipped GUIs) as links, for a browser; the panel's address bar takes the same paths. */
function indexPage(folder: string, paths: string[]): string {
  const guis = paths.filter((p) => /\.(gui|zip)$/i.test(p)).sort();
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const link = (p: string) => `<li><a href="${esc(p.split('/').map(encodeURIComponent).join('/'))}">${esc(p)}</a></li>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(folder)}: GUIs</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:32px;color:#222}code{background:#eee;padding:1px 4px;border-radius:3px}</style></head>
<body><h1>${esc(folder)}</h1><p>${guis.length ? 'The GUIs in this folder; in the iva panel\'s address bar, one of these paths after this address (<code>?page=Name</code> for a page):' : 'No .gui or zipped GUI in this folder.'}</p>
<ul>${guis.map(link).join('')}</ul></body></html>
`;
}

/** A TCP system of the .gui accepting connections (a server on the panel): its name, port, feedback. */
interface PanelServer {
  name: string;
  port: number;
  feedback: string[];
}

/** Every system of the .gui, by name. */
export function systemNames(xml: string): string[] {
  return [...xml.matchAll(/<system\s[^>]*?\bname="([^"]*)"/g)].map((m) => m[1]);
}

/** The panel's servers: systems that accept connections (an <HttpServer>, the web server of web apps). */
export function panelServers(xml: string): PanelServer[] {
  const out: PanelServer[] = [];
  for (const m of xml.matchAll(/<system\s([^>]*?)(\/>|>([\s\S]*?)<\/system>)/g)) {
    const at = (k: string) => new RegExp(`\\s${k}="([^"]*)"`).exec(` ${m[1]}`)?.[1];
    if (at('accept') !== '1' || (at('protocol') ?? 'tcp') !== 'tcp') continue;
    const feedback = [...(m[3] ?? '').matchAll(/<fb\s[^>]*name="([^"]*)"/g)].map((f) => f[1]);
    out.push({ name: at('name') ?? '', port: Number(at('origin')) || Number(at('port')) || 0, feedback });
  }
  return out;
}

/**
 * Runs on the device: waits for a build newer than its own, then reloads the
 * panel - its systems switched off first: iViewer keeps a GUI's sockets past
 * a reload, and a server left listening holds its port from the next GUI's.
 * Meanwhile the panel's log (CF.log, errors) goes to iva serve's console too,
 * and the panel's servers say whether they're up: a request to each from the
 * panel (CF.request), what reaches it, what it sends.
 */
function liveScript(base: string, version: string, servers: PanelServer[], systems: string[]): string {
  return `// iva serve: reloads this panel when the project is rebuilt; its log in iva serve's console (only while served by iva).
(function () {
  var base = ${JSON.stringify(base)};
  var version = ${JSON.stringify(version)};
  var servers = ${JSON.stringify(servers)};
  var systems = ${JSON.stringify(systems)};
  // the log, a batch at a time; kept while iva serve is out of reach (a VPN off for a Bonjour test), sent when it's back
  var queue = [], sending = false, retry = null;
  function flush() {
    if (sending || retry || !queue.length) return;
    sending = true;
    var n = Math.min(queue.length, 20);
    var text = queue.slice(0, n).join("\\n");
    var done = false;
    var give = setTimeout(function () { finish(0); }, 10000);
    function finish(status) {
      if (done) return;
      done = true;
      clearTimeout(give);
      sending = false;
      if (status == 200) {
        queue.splice(0, n);
        flush();
        return;
      }
      if (queue.length > 2000) queue.splice(0, queue.length - 2000);
      retry = setTimeout(function () { retry = null; flush(); }, 3000);
    }
    CF.request(base + "/__iva/log?m=" + encodeURIComponent(text.slice(0, 1500)), function (status) { finish(status); });
  }
  function out(m) {
    try {
      queue.push(String(m));
      flush();
    } catch (e) {}
  }
  var log = CF.log;
  CF.log = function (m) {
    out(m);
    return log.apply(CF, arguments);
  };
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("error", function (e) { out("error: " + e.message + (e.filename ? " (" + e.filename + ":" + e.lineno + ")" : "")); });
  }
  var named = {};
  for (var i = 0; i < servers.length; i++) named[servers[i].name] = servers[i];
  var send = CF.send;
  CF.send = function (system, data) {
    if (named[system]) out(system + " sends " + String(data).split("\\r\\n")[0] + " (" + String(data).length + " B)");
    return send.apply(CF, arguments);
  };
  out("started: iViewer " + (CF.version || "?") + ", " + servers.length + " server(s)");
  // the page shown: where the panel was, should it stop
  CF.watch(CF.PageFlipEvent, function (from, to) { out("page: " + to); });
  servers.forEach(function (s) {
    CF.watch(CF.ConnectionStatusChangeEvent, s.name, function (system, connected, remote) {
      out(s.name + ": " + (connected ? "connected" : "not connected") + (remote ? " (" + remote + ")" : ""));
    }, true);
    s.feedback.forEach(function (fb) {
      CF.watch(CF.FeedbackMatchedEvent, s.name, fb, function (f, data) { out(s.name + " got " + String(data).split("\\r\\n")[0]); });
    });
  });
  // each server asked from the panel itself, once the scripts have started (iViewer connects its systems then)
  function probe(when) {
    servers.forEach(function (s) {
      var t0 = Date.now();
      CF.request("http://127.0.0.1:" + s.port + "/iva-color/000000", function (status, headers, body) {
        out(s.name + " on 127.0.0.1:" + s.port + " (" + when + "): " + status + " after " + (Date.now() - t0) + " ms" + (body ? ", " + String(body).length + " B: " + String(body).slice(0, 80) : ""));
      });
    });
  }
  CF.modules.push({ name: "iva-live", setup: function () {
    out("scripts started");
    if (!servers.length) return;
    setTimeout(function () { probe("5 s after start"); }, 5000);
    setTimeout(function () { probe("30 s after start"); }, 30000);
  } });
  function wait() {
    CF.request(base + "/__iva/wait?v=" + encodeURIComponent(version), function (status, headers, body) {
      if (status == 200 && body && body != version) {
        CF.log("iva: new build - reloading");
        // its systems let go of their sockets (a server its port), then the next build
        systems.forEach(function (n) { CF.setSystemProperties(n, { enabled: false }); });
        setTimeout(function () {
          CF.loadGUI(base + "/", { reloadGUI: true, reloadAssets: true, reloadAllAssets: true });
        }, systems.length ? 500 : 0);
        return;
      }
      setTimeout(wait, status == 200 ? 100 : 3000);
    });
  }
  setTimeout(wait, 1000);
})();
`;
}

export async function startDeviceServer(opts: DeviceServerOptions) {
  const target = path.resolve(opts.target);
  const log = opts.log ?? ((m: string) => console.log(`[iva] ${m}`));
  const isGui = target.toLowerCase().endsWith('.gui');
  // a folder of GUIs (builds linking to one another: iva build -o dist/<name> each): every file by its path, a page at / listing them
  const isDir = fs.statSync(target).isDirectory();
  // what's served at / (the project's own size, a .gui, a folder) and, by folder, each other size of <Project sizes>
  const root = newSite('');
  const others = new Map<string, Site>();
  let closed = false;
  const failure = (e: unknown) => (e instanceof IvaError ? e.format(path.dirname(target)) : String((e as Error)?.stack ?? e));
  const live = (gui: Buffer, version: string) => (opts.live ? Buffer.from(withLiveScript(gui.toString('utf8'), version)) : gui);
  /** A build as served: where writeBuild puts its files, iViewer asks for them (images/..., images/scripts/...). */
  const sizeBuild = (r: CompileResult): SizeBuild => {
    const files = new Map<string, ServedFile>();
    const at = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);
    for (const a of r.assets) files.set(at(r.layout.images, a.name).toLowerCase(), { ...a, path: at(r.layout.images, a.name) });
    for (const s of r.scripts) {
      const where = at(scriptsDir(r.layout), s.name);
      files.set(where.toLowerCase(), { name: s.name, path: where, file: s.file, data: s.code !== undefined ? Buffer.from(s.code) : undefined });
    }
    files.set('joins.json', { name: 'joins.json', path: 'joins.json', data: Buffer.from(JSON.stringify(r.joins, null, 2) + '\n') });
    return { name: `${slug(r.name)}.gui`, gui: Buffer.from('\ufeff' + r.xml), files };
  };

  const load = async (): Promise<void> => {
    const t0 = Date.now();
    let next: Omit<Served, 'version' | 'modified'>;
    if (isGui || isDir) {
      // a .gui and the files next to it (and in its folders: an image folder, scripts/), as GUI Designer serves them; a folder: all of it
      const dir = isDir ? target : path.dirname(target);
      const files = new Map<string, { name: string; path: string; file: string }>();
      const walk = (sub: string, depth: number) => {
        for (const e of fs.readdirSync(path.join(dir, sub), { withFileTypes: true })) {
          const rel = sub ? `${sub}/${e.name}` : e.name;
          if (e.isFile()) files.set(rel.toLowerCase(), { name: rel, path: rel, file: path.join(dir, rel) });
          else if (e.isDirectory() && depth < 4 && !e.name.startsWith('.') && e.name !== 'node_modules') walk(rel, depth + 1);
        }
      };
      walk('', 0);
      next = isDir
        ? { name: 'index.html', title: path.basename(target), label: '', gui: Buffer.from(indexPage(path.basename(target), [...files.values()].map((f) => f.path))), files, html: true }
        : { name: path.basename(target), title: path.basename(target).replace(/\.gui$/i, ''), label: '', gui: fs.readFileSync(target), files };
    } else {
      let r: CompileResult;
      try {
        r = await compile(target, { size: opts.size });
      } catch (e) {
        root.error = failure(e);
        log(`build failed (the device keeps the last good build):\n${root.error}`);
        root.done();
        return;
      }
      for (const w of r.warnings) log(`warning: ${w}`);
      root.inputs = r.inputs;
      const own = sizeFolder(r.size);
      const sizes = opts.size ? [] : r.sizes.filter((z) => sizeFolder(z) !== own);
      next = { ...sizeBuild(r), title: r.name, label: sizeLabel(r.size), sizes, warnings: r.warnings };
      log(`built ${path.basename(target)} in ${Date.now() - t0} ms`);
    }
    publish(root, next);
    // the other sizes, each at its own path: built again after this one
    if (next.sizes) otherSizes(next.sizes);
  };

  /** A GUI's new build served: its version (the live script's, in its .gui); the devices waiting on it told; on the network as it is now. */
  const publish = (s: Site, next: Omit<Served, 'version' | 'modified'>) => {
    s.error = null;
    const version = `${Date.now().toString(36)}`;
    if (!next.html) {
      next.gui = live(next.gui, version);
      const xml = next.gui.toString('utf8');
      s.recent.set(version, { servers: panelServers(xml), systems: systemNames(xml) });
      for (const v of s.recent.keys()) if (s.recent.size > 8) s.recent.delete(v);
    }
    s.served = { ...next, version, modified: new Date() };
    for (const w of s.waiting) w(version);
    s.waiting.clear();
    s.done();
    void advertised?.set(services());
  };

  /**
   * The other sizes now (<Project sizes>, as the build at / says): a GUI each
   * at its folder (/1400w1400h/), a size no longer asked for let go (a device
   * on it told: it finds it gone) - then built.
   */
  const otherSizes = (sizes: ScreenSize[]) => {
    const wanted = new Map(sizes.map((z) => [sizeFolder(z), z]));
    for (const [folder, s] of others) {
      if (wanted.has(folder)) continue;
      others.delete(folder);
      for (const w of s.waiting) w('gone');
      s.waiting.clear();
      s.done();
    }
    for (const [folder, size] of wanted) {
      const s = others.get(folder);
      if (s) s.size = size;
      else others.set(folder, newSite(folder, size));
    }
    void advertised?.set(services());
    void buildOthers();
  };

  /** The other sizes built, one after another, after the size at /; it built again meanwhile: them all again. */
  let othersAgain = false;
  let othersBusy = false;
  const buildOthers = async () => {
    othersAgain = true;
    if (othersBusy) return;
    othersBusy = true;
    try {
      while (othersAgain && !closed) {
        othersAgain = false;
        for (const s of [...others.values()]) {
          if (othersAgain || closed) break;
          if (others.get(s.folder) === s) await buildSize(s);
        }
      }
    } finally {
      othersBusy = false;
    }
  };
  const buildSize = async (s: Site) => {
    const t0 = Date.now();
    const label = sizeLabel(s.size!);
    try {
      const r = await compile(target, { size: s.size });
      // let go meanwhile (no longer in <Project sizes>), or stopped
      if (others.get(s.folder) !== s || closed) return;
      for (const w of r.warnings) if (!root.served?.warnings?.includes(w)) log(`warning: ${label}: ${w}`);
      s.inputs = r.inputs;
      publish(s, { ...sizeBuild(r), title: r.name, label });
      log(`built ${label} in ${Date.now() - t0} ms (at /${s.folder}/)`);
      watchAll();
    } catch (e) {
      s.error = failure(e);
      log(`build at ${label} failed (${s.served ? 'a device on it keeps the last good build' : 'not served'}):\n${s.error}`);
      s.done();
    }
  };

  /** what every size's last good build read: watched - a change to any of it builds them all again */
  let inputs: ReturnType<typeof watchInputs> | null = null;
  const watchAll = () => {
    if (!inputs || closed) return;
    const all = [root, ...others.values()].map((s) => s.inputs).filter((i): i is CompileResult['inputs'] => !!i);
    if (all.length) inputs.set({ files: [...new Set(all.flatMap((i) => i.files))], dirs: [...new Set(all.flatMap((i) => i.dirs))] });
  };

  /** where a GUI is: '/', '/1400w1400h/' */
  const pathOf = (s: Site) => (s.folder ? `/${s.folder}/` : '/');
  /** On the network: each GUI served once it's built, an _iva._tcp service each - named with its size when the project has several. */
  const services = (): AdvertisedService[] => {
    const project = root.served!.title;
    return [root, ...others.values()].filter((s) => s.served).map((s) => ({
      key: pathOf(s),
      name: others.size ? `${project} ${s.served!.label}` : project,
      txt: servedTxt({
        path: pathOf(s), version: VERSION, project, kind: isDir ? 'folder' : isGui ? 'gui' : 'project', sizes: s.served!.label ? [s.served!.label] : [], host: os.hostname(),
      }),
    }));
  };
  let advertised: Advertised | null = null;
  await load();
  if (!root.served) throw new Error(`can't serve: ${root.error}`);

  /** where a GUI's live script asks (its folder's /__iva/...) and what it reloads (its folder's /) */
  const baseOf = (s: Site, host: string) => `http://${host}${s.folder ? `/${s.folder}` : ''}`;
  /** the host a device asked for (the address it reached this machine at) */
  const hostOf = (req: http.IncomingMessage) => req.headers.host ?? `${lanAddresses()[0]?.address ?? '127.0.0.1'}:${opts.port}`;

  /** A GUI's entries in its archive: the .gui, its files at their paths, the live script. */
  const entriesOf = (s: Site, host: string): [string, Buffer][] => {
    const b = s.served!;
    const entries: [string, Buffer][] = [[b.name, b.gui]];
    for (const f of b.files.values()) {
      const data = f.data ?? (f.file && fs.existsSync(f.file) ? fs.readFileSync(f.file) : undefined);
      if (data) entries.push([f.path, data]);
    }
    if (opts.live) {
      const xml = b.gui.toString('utf8');
      entries.push([liveName(b.version), Buffer.from(liveScript(baseOf(s, host), b.version, panelServers(xml), systemNames(xml)))]);
    }
    return entries;
  };

  /**
   * A GUI as served, in one archive - what the iva panel keeps on the device
   * (the web pages and assets a script loads too, which the .gui doesn't name):
   * its size only, at the archive's root - another size is another GUI, at its
   * own path. Made once a build.
   */
  const zipOf = (s: Site, host: string) => {
    const key = `${s.served!.version} ${host}`;
    if (s.zipped?.key !== key) s.zipped = { key, data: writeZip(entriesOf(s, host)) };
    return s.zipped.data;
  };

  const server = http.createServer((req, res) => {
    // a path only ('//x' would read as a host): one slash in front
    const url = new URL((req.url ?? '/').replace(/^\/+/, '/'), 'http://x');
    // another size: its folder first in the path (/1400w1400h/...), the rest as at / - else the GUI at /
    const first = url.pathname.split('/')[1] ?? '';
    const other = others.get(first.toLowerCase());
    const site = other ?? root;
    const rest = other ? url.pathname.slice(first.length + 1) : url.pathname;
    const who = `${req.socket.remoteAddress?.replace(/^::ffff:/, '')}`;
    const send = (status: number, body: Buffer | string, type: string, extra: Record<string, string> = {}) => {
      const s = site.served;
      const data = typeof body === 'string' ? Buffer.from(body) : body;
      res.writeHead(status, {
        Server: 'iva (GUI Designer Upload Service compatible)',
        'Accept-Ranges': 'bytes',
        'Content-Length': String(data.length),
        'CF-Server': CF_SERVER,
        ...(status === 200 && s ? { 'Last-Modified': s.modified.toUTCString(), ETag: `"${s.version}"` } : {}),
        'Content-Type': type,
        // the iva panel app's page loads the images from here (another origin: WebGL needs CORS);
        // it tells iva serve (the whole build in one zip) and a build it has by these
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Server, ETag',
        ...extra,
      });
      res.end(req.method === 'HEAD' ? undefined : data);
      const agent = req.headers['user-agent'] ? `  ${req.headers['user-agent']}` : '';
      if (!rest.startsWith('/__iva/')) log(`${who} ${req.method} ${req.url} -> ${status} (${data.length} B)${agent}`);
    };

    const answer = () => {
      const s = site.served!;
      // live reload: answer when the build changes (or after a while, with the same version)
      if (rest === '/__iva/wait') {
        if (url.searchParams.get('v') !== s.version) return send(200, s.version, 'text/plain');
        const timer = setTimeout(() => {
          site.waiting.delete(done);
          send(200, site.served!.version, 'text/plain');
        }, 15000);
        const done = (v: string) => {
          clearTimeout(timer);
          send(200, v, 'text/plain');
        };
        site.waiting.add(done);
        req.on('close', () => {
          clearTimeout(timer);
          site.waiting.delete(done);
        });
        return;
      }
      if (rest === '/__iva/version') return send(200, s.version, 'text/plain');
      // the panel's log (the live script sends it) - another size's said so
      if (rest === '/__iva/log') {
        const on = site.folder ? ` (${s.label})` : '';
        for (const line of (url.searchParams.get('m') ?? '').split('\n')) log(`panel ${who}${on}: ${line}`);
        return send(200, 'ok', 'text/plain');
      }

      // the build the asker has already (the panel's saved copy): not again
      const unchanged = req.headers['if-none-match'] === `"${s.version}"`;
      if (rest === '/__iva/gui.zip') {
        // a folder served is not one build to keep as one archive: its GUIs come as .gui files with what's beside them
        if (s.html) return send(404, 'a folder of GUIs: no one build', 'text/plain');
        if (unchanged) return send(304, '', 'application/zip');
        return send(200, zipOf(site, hostOf(req)), 'application/zip');
      }

      let name: string;
      try {
        name = decodeURIComponent(rest.slice(1));
      } catch {
        // a '%' that starts no escape: a file named so, asked for as it is (100%.png), else a bad request - never a throw
        // (it ended iva serve)
        name = rest.slice(1);
        if (!s.files.has(name.toLowerCase())) return send(400, 'a malformed path', 'text/plain');
      }
      const type = s.html ? 'text/html; charset=utf-8' : 'text/xml';
      if (name === '' || name.toLowerCase() === s.name.toLowerCase() || (name.toLowerCase().endsWith('.gui') && !s.files.has(name.toLowerCase()) && !s.html)) {
        if (unchanged) return send(304, '', type);
        return send(200, s.gui, type);
      }
      // the live script: in the image folder, as iViewer looks for scripts (images/iva-live-<version>.js) - the one of
      // the build its name says, whatever is served now (a build it isn't: its .gui's servers and systems, else these)
      const liveAsked = opts.live && !s.html ? LIVE_SCRIPT.exec(name.toLowerCase().split('/').pop()!) : null;
      if (liveAsked) {
        const version = liveAsked[1] ?? '';
        const xml = s.gui.toString('utf8');
        const of = site.recent.get(version) ?? { servers: panelServers(xml), systems: systemNames(xml) };
        return send(200, liveScript(baseOf(site, hostOf(req)), version, of.servers, of.systems), TYPES['.js']);
      }
      // only what the map has: a path is a key, never a file system path
      const f = s.files.get(name.toLowerCase());
      if (f) {
        const data = f.data ?? (f.file && fs.existsSync(f.file) ? fs.readFileSync(f.file) : undefined);
        if (data) return send(200, data, TYPES[path.extname(f.name).toLowerCase()] ?? 'application/unknown');
      }
      // not a file: logged in full - iViewer's callbacks (cache complete, debugger) aren't documented
      log(`unknown request: ${req.method} ${req.url} ${JSON.stringify(req.headers)}`);
      send(404, '<H2>404 Error! File Does Not Exist...</H2>', 'text/html');
    };

    // a browser asking first whether it may ask for a build it has (the panel's page in a browser)
    if (req.method === 'OPTIONS') {
      return send(204, '', 'text/plain', { 'Access-Control-Allow-Methods': 'GET, HEAD', 'Access-Control-Allow-Headers': 'If-None-Match, If-Modified-Since' });
    }
    // another size's folder without its slash: with it - its .gui's files are named from beside it
    if (other && rest === '') return send(301, '', 'text/plain', { Location: `/${other.folder}/${url.search}` });
    if (site.served) return answer();
    // a size not built yet: once it is - or why not
    void site.tried.then(() => (site.served ? answer() : send(503, `${sizeLabel(site.size!)} isn't built: ${site.error ?? 'not yet'}`, 'text/plain')));
  });

  // rebuild on a change to what the builds read; a .gui: re-read on a change next to it
  const changed = async (file: string) => {
    log(`changed: ${file}`);
    await load();
    watchAll();
  };
  inputs = isGui || isDir ? null : watchInputs(changed, log);
  watchAll();
  const watcher = inputs ?? watchTree(isDir ? target : path.dirname(target), isDir, changed, log);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, opts.host, resolve);
  });
  const port = (server.address() as import('node:net').AddressInfo).port;
  const addresses = (opts.host === '0.0.0.0' || opts.host === '::' ? lanAddresses() : [hostAddress(opts.host)]).map((a) => ({
    ...a,
    url: `http://${a.address}:${port}`,
  }));
  // on the network: each address served at whose network is known (not loopback: no one else reaches it)
  const networks = addresses.filter((a) => a.netmask && !a.address.startsWith('127.')).map((a) => ({ address: a.address, netmask: a.netmask! }));
  if (opts.mdns !== false && networks.length) {
    advertised = await advertise({ services: services(), port, networks, host: os.hostname(), createSocket: opts.mdnsSocket, log });
    // a size built while that was published
    void advertised.set(services());
  }
  return {
    name: root.served.name,
    port,
    addresses,
    /** each GUI served, by its path: the one at / first, then each other size of <Project sizes> (served once it's built) */
    get sizes() {
      return [root, ...others.values()].map((s) => ({ path: pathOf(s), label: s.size ? sizeLabel(s.size) : root.served!.label }));
    },
    /** the name at / on the network (DNS-SD's): the project's, with its size when it has several - "Name (2)" if another has it; null: not advertised */
    get advertisedAs() {
      return advertised?.nameOf('/') ?? null;
    },
    async close() {
      closed = true;
      watcher.close();
      for (const s of [root, ...others.values()]) for (const w of s.waiting) w(s.served?.version ?? '');
      await advertised?.close();
      await new Promise((r) => server.close(r));
    },
  };
}
