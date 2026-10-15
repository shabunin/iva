/**
 * `iva serve`: the project for iViewer on a real device, over the LAN, the
 * way GUI Designer's Upload Service serves it (port 8019; `/` and
 * `/<name>.gui` are the .gui, every other file by its path in the build, the same
 * headers), so iViewer loads it from "GUI File URL" = http://<this machine>:8019.
 *
 * A JSX project is rebuilt on save; a .gui is re-read when it changes (say,
 * saved from GUI Designer). With live reload on (default), the served .gui
 * carries one extra script that waits for the next build and reloads the
 * panel with CF.loadGUI, so the device follows your edits.
 */

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { compile, IvaError, scriptsDir, slug, type CompileResult } from '../compiler/index.js';
import { watchInputs, watchTree } from './watch.js';

export interface DeviceServerOptions {
  /** a JSX entry, or a .gui */
  target: string;
  port: number;
  host: string;
  /** reload the panel on the device after each build (default true) */
  live: boolean;
  /** build a JSX project for this screen instead of its own size ('1400x1400') */
  size?: string;
  log?: (msg: string) => void;
}

/** What GUI Designer's Upload Service answers with (v2.7.10.918). */
const CF_SERVER = 'v2.7.10.918;debug=launchmonitor;complete=cachecomplete';
const TYPES: Record<string, string> = {
  '.gui': 'text/xml', '.xml': 'text/xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  // GUI Designer sends scripts as text/html; iViewer takes them so
  '.js': 'text/html', '.html': 'text/html', '.htm': 'text/html',
};
const LIVE_SCRIPT = 'iva-live.js';

interface Served {
  name: string;
  /** the .gui as served (the live script added when live) */
  gui: Buffer;
  /** other files by lower-cased name */
  files: Map<string, { name: string; data?: Buffer; file?: string }>;
  version: string;
  modified: Date;
}

export interface Address {
  address: string;
  iface: string;
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
      out.push({ address: a.address, iface, kind: VIRTUAL.find(([re]) => re.test(iface))?.[1] });
    }
  }
  return out.sort((x, y) => Number(!!x.kind) - Number(!!y.kind));
}

/** The .gui with one more script: the live-reload one, last. */
function withLiveScript(xml: string): string {
  const tag = `<script name="${LIVE_SCRIPT}" />`;
  if (/<\/scripts>/.test(xml)) return xml.replace(/(\s*)<\/scripts>/, `$1  ${tag}$1</scripts>`);
  if (/<scripts\s*\/>/.test(xml)) return xml.replace(/<scripts\s*\/>/, `<scripts>${tag}</scripts>`);
  return xml.replace(/(\r?\n?\s*)<(page|subpage)\b/, `$1<scripts>${tag}</scripts>$1<$2`);
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
  // the log, a batch at a time
  var queue = [], sending = false;
  function flush() {
    if (sending || !queue.length) return;
    sending = true;
    var text = queue.splice(0, 20).join("\\n");
    CF.request(base + "/__iva/log?m=" + encodeURIComponent(text.slice(0, 1500)), function () {
      sending = false;
      flush();
    });
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
  // what's being served (replaced on each good build) and the last build error
  const state: { served: Served | null; error: string | null; inputs: CompileResult['inputs'] | null } = { served: null, error: null, inputs: null };
  const waiting = new Set<(v: string) => void>();

  const load = async (): Promise<void> => {
    const t0 = Date.now();
    let next: Omit<Served, 'version' | 'modified'>;
    if (isGui) {
      // a .gui and the files next to it (and in its folders: an image folder, scripts/), as GUI Designer serves them
      const dir = path.dirname(target);
      const files = new Map<string, { name: string; file: string }>();
      const walk = (sub: string, depth: number) => {
        for (const e of fs.readdirSync(path.join(dir, sub), { withFileTypes: true })) {
          const rel = sub ? `${sub}/${e.name}` : e.name;
          if (e.isFile()) files.set(rel.toLowerCase(), { name: rel, file: path.join(dir, rel) });
          else if (e.isDirectory() && depth < 4 && !e.name.startsWith('.') && e.name !== 'node_modules') walk(rel, depth + 1);
        }
      };
      walk('', 0);
      next = { name: path.basename(target), gui: fs.readFileSync(target), files };
    } else {
      let r: CompileResult;
      try {
        r = await compile(target, { size: opts.size });
      } catch (e) {
        state.error = e instanceof IvaError ? e.format(path.dirname(target)) : String((e as Error)?.stack ?? e);
        log(`build failed (the device keeps the last good build):\n${state.error}`);
        return;
      }
      for (const w of r.warnings) log(`warning: ${w}`);
      state.inputs = r.inputs;
      // where writeBuild puts them, iViewer asks for them: images/..., images/scripts/...
      const files = new Map<string, { name: string; data?: Buffer; file?: string }>();
      const at = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);
      for (const a of r.assets) files.set(at(r.layout.images, a.name).toLowerCase(), a);
      for (const s of r.scripts) {
        files.set(at(scriptsDir(r.layout), s.name).toLowerCase(), { name: s.name, file: s.file, data: s.code !== undefined ? Buffer.from(s.code) : undefined });
      }
      files.set('joins.json', { name: 'joins.json', data: Buffer.from(JSON.stringify(r.joins, null, 2) + '\n') });
      next = { name: `${slug(r.name)}.gui`, gui: Buffer.from('﻿' + r.xml), files };
      log(`built ${path.basename(target)} in ${Date.now() - t0} ms`);
    }
    state.error = null;
    const version = `${Date.now().toString(36)}`;
    if (opts.live) next.gui = Buffer.from(withLiveScript(next.gui.toString('utf8')));
    state.served = { ...next, version, modified: new Date() };
    for (const w of waiting) w(version);
    waiting.clear();
  };
  await load();
  if (!state.served) throw new Error(`can't serve: ${state.error}`);

  const server = http.createServer((req, res) => {
    // a path only ('//x' would read as a host): one slash in front
    const url = new URL((req.url ?? '/').replace(/^\/+/, '/'), 'http://x');
    const s = state.served!;
    const send = (status: number, body: Buffer | string, type: string, extra: Record<string, string> = {}) => {
      const data = typeof body === 'string' ? Buffer.from(body) : body;
      res.writeHead(status, {
        Server: 'iva (GUI Designer Upload Service compatible)',
        'Accept-Ranges': 'bytes',
        'Content-Length': String(data.length),
        'CF-Server': CF_SERVER,
        ...(status === 200 ? { 'Last-Modified': s.modified.toUTCString(), ETag: `"${s.version}"` } : {}),
        'Content-Type': type,
        ...extra,
      });
      res.end(req.method === 'HEAD' ? undefined : data);
      const who = `${req.socket.remoteAddress?.replace(/^::ffff:/, '')}`;
      const agent = req.headers['user-agent'] ? `  ${req.headers['user-agent']}` : '';
      if (!url.pathname.startsWith('/__iva/')) log(`${who} ${req.method} ${req.url} -> ${status} (${data.length} B)${agent}`);
    };

    // live reload: answer when the build changes (or after a while, with the same version)
    if (url.pathname === '/__iva/wait') {
      if (url.searchParams.get('v') !== s.version) return send(200, state.served!.version, 'text/plain');
      const timer = setTimeout(() => {
        waiting.delete(done);
        send(200, state.served!.version, 'text/plain');
      }, 15000);
      const done = (v: string) => {
        clearTimeout(timer);
        send(200, v, 'text/plain');
      };
      waiting.add(done);
      req.on('close', () => {
        clearTimeout(timer);
        waiting.delete(done);
      });
      return;
    }
    if (url.pathname === '/__iva/version') return send(200, s.version, 'text/plain');
    // the panel's log (the live script sends it)
    if (url.pathname === '/__iva/log') {
      const who = req.socket.remoteAddress?.replace(/^::ffff:/, '');
      for (const line of (url.searchParams.get('m') ?? '').split('\n')) log(`panel ${who}: ${line}`);
      return send(200, 'ok', 'text/plain');
    }

    const name = decodeURIComponent(url.pathname.slice(1));
    if (name === '' || name.toLowerCase() === s.name.toLowerCase() || (name.toLowerCase().endsWith('.gui') && !s.files.has(name.toLowerCase()))) {
      return send(200, s.gui, 'text/xml');
    }
    // the live script: in the image folder, as iViewer looks for scripts (images/iva-live.js)
    if (opts.live && name.toLowerCase().split('/').pop() === LIVE_SCRIPT) {
      const host = req.headers.host ?? `${lanAddresses()[0]?.address ?? '127.0.0.1'}:${opts.port}`;
      const xml = s.gui.toString('utf8');
      return send(200, liveScript(`http://${host}`, s.version, panelServers(xml), systemNames(xml)), TYPES['.js']);
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
  });

  // rebuild on a change to what the build read; a .gui: re-read on a change next to it
  const changed = async (file: string) => {
    log(`changed: ${file}`);
    await load();
    if (state.inputs) inputs?.set(state.inputs);
  };
  const inputs = isGui ? null : watchInputs(changed, log);
  if (inputs && state.inputs) inputs.set(state.inputs);
  const watcher = inputs ?? watchTree(path.dirname(target), false, changed, log);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, opts.host, resolve);
  });
  const port = (server.address() as import('node:net').AddressInfo).port;
  return {
    name: state.served.name,
    port,
    addresses: (opts.host === '0.0.0.0' || opts.host === '::' ? lanAddresses() : [{ address: opts.host, iface: '' } as Address]).map((a) => ({
      ...a,
      url: `http://${a.address}:${port}`,
    })),
    async close() {
      watcher.close();
      for (const w of waiting) w(state.served!.version);
      await new Promise((r) => server.close(r));
    },
  };
}
