/**
 * A fake UPnP MediaServer and MediaRenderer for the driver's tests, and to
 * try examples/upnp against without a real device: an HTTP server with
 * the two descriptions and their SOAP control URLs (ContentDirectory
 * Browse / Search over a small library, AVTransport, RenderingControl,
 * ConnectionManager), an SSDP responder answering M-SEARCH (and sending
 * NOTIFYs when asked), the tracks as seconds of silence (WAV) so a real
 * renderer can play them.
 *
 *   node --import tsx test/upnp-fake.ts            # on the LAN: SSDP on 239.255.255.250:1900, HTTP on 8300
 *   node --import tsx test/upnp-fake.ts --port 8301
 */
import http from 'node:http';
import dgram from 'node:dgram';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export interface FakeOptions {
  /** the address to bind (127.0.0.1 in tests; 0.0.0.0 on the LAN) */
  host?: string;
  /** the HTTP port (0: any) */
  httpPort?: number;
  /** the SSDP port (0: any; 1900 on the LAN, with the multicast group joined) */
  ssdpPort?: number;
  /** the address the descriptions name (what LOCATION says) */
  advertise?: string;
  /** ms before an M-SEARCH is answered */
  replyDelay?: number;
  /** a log line per request */
  log?: (line: string) => void;
}

export interface Item {
  id: string;
  parentId: string;
  kind: 'container' | 'item';
  title: string;
  class: string;
  artist?: string;
  album?: string;
  art?: string;
  duration?: string;
  childCount?: number;
}

export const SERVER_UDN = 'uuid:fa4e0000-0000-4000-8000-000000000001';
export const RENDERER_UDN = 'uuid:fa4e0000-0000-4000-8000-000000000002';
const ST = {
  root: 'upnp:rootdevice',
  server: 'urn:schemas-upnp-org:device:MediaServer:1',
  renderer: 'urn:schemas-upnp-org:device:MediaRenderer:1',
  cd: 'urn:schemas-upnp-org:service:ContentDirectory:1',
  avt: 'urn:schemas-upnp-org:service:AVTransport:1',
  rc: 'urn:schemas-upnp-org:service:RenderingControl:1',
  cm: 'urn:schemas-upnp-org:service:ConnectionManager:1',
};

const escape = (s: string | number) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescape = (s: string) => s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENTITIES[e]);

/** the library: folders and tracks (the tracks' URLs filled in once the server has a port) */
export function library(): Item[] {
  const track = (id: string, parentId: string, title: string, artist: string, album: string, duration: string): Item =>
    ({ id, parentId, kind: 'item', title, class: 'object.item.audioItem.musicTrack', artist, album, duration, art: `AlbumArt/${id}.jpg` });
  return [
    { id: '1', parentId: '0', kind: 'container', title: 'Music', class: 'object.container.storageFolder', childCount: 2 },
    { id: '2', parentId: '0', kind: 'container', title: 'Video', class: 'object.container.storageFolder', childCount: 1 },
    { id: '1$1', parentId: '1', kind: 'container', title: 'Kind of Blue', class: 'object.container.album.musicAlbum', childCount: 3, art: 'AlbumArt/kob.jpg' },
    { id: '1$2', parentId: '1', kind: 'container', title: 'Singles', class: 'object.container.storageFolder', childCount: 1 },
    track('1$1$1', '1$1', 'So What', 'Miles Davis', 'Kind of Blue', '0:00:02.000'),
    track('1$1$2', '1$1', 'Freddie Freeloader', 'Miles Davis', 'Kind of Blue', '0:00:02.000'),
    track('1$1$3', '1$1', 'Blue in Green & more', 'Miles Davis', 'Kind of Blue', '0:00:02.000'),
    track('1$2$1', '1$2', 'Lonely Woman', 'Ornette Coleman', 'The Shape of Jazz to Come', '0:00:02.000'),
    { id: '2$1', parentId: '2', kind: 'item', title: 'Holiday film', class: 'object.item.videoItem', duration: '0:00:02.000' },
  ];
}

export class FakeUpnp {
  readonly items = library();
  /** every SOAP action taken, in order */
  calls: { service: string; action: string; args: Record<string, string> }[] = [];
  /** every HTTP request's method and path */
  requests: string[] = [];
  /** every M-SEARCH heard: its ST and where from */
  searches: { st: string; from: { address: string; port: number } }[] = [];
  /** the renderer's state */
  renderer = { uri: '', metadata: '', nextUri: '', nextMetadata: '', state: 'NO_MEDIA_PRESENT', volume: 30, mute: 0, position: 0, playedAt: 0 };
  httpPort = 0;
  ssdpPort = 0;
  private httpServer?: http.Server;
  private socket?: dgram.Socket;
  private lastSearcher?: { address: string; port: number };
  private timers: NodeJS.Timeout[] = [];

  constructor(readonly o: FakeOptions = {}) {}

  get host() { return this.o.advertise ?? this.o.host ?? '127.0.0.1'; }
  get base() { return `http://${this.host}:${this.httpPort}`; }
  get serverLocation() { return `${this.base}/server.xml`; }
  get rendererLocation() { return `${this.base}/renderer.xml`; }

  async start(): Promise<this> {
    const bind = this.o.host ?? '127.0.0.1';
    this.httpServer = http.createServer((req, res) => this.http(req, res));
    await new Promise<void>((resolve) => this.httpServer!.listen(this.o.httpPort ?? 0, bind, resolve));
    this.httpPort = (this.httpServer.address() as { port: number }).port;
    const multicast = (this.o.ssdpPort ?? 0) === 1900;
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.socket.on('message', (msg, rinfo) => this.ssdp(msg.toString('latin1'), rinfo));
    await new Promise<void>((resolve) => this.socket!.bind(this.o.ssdpPort ?? 0, multicast ? '0.0.0.0' : bind, resolve));
    this.ssdpPort = this.socket.address().port;
    if (multicast) {
      this.socket.addMembership('239.255.255.250');
      this.socket.setMulticastTTL(2);
    }
    return this;
  }

  stop() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.socket?.close();
    this.httpServer?.close();
    this.httpServer?.closeAllConnections?.();
  }

  // ── SSDP ────────────────────────────────────────────────────────

  private devices() {
    return [
      { udn: SERVER_UDN, location: this.serverLocation, types: [ST.root, ST.server, ST.cd, ST.cm] },
      { udn: RENDERER_UDN, location: this.rendererLocation, types: [ST.root, ST.renderer, ST.avt, ST.rc, ST.cm] },
    ];
  }

  private ssdp(text: string, rinfo: { address: string; port: number }) {
    const m = /^M-SEARCH \* HTTP\/1\.1\r\n([\s\S]*?)\r\n\r\n/i.exec(text);
    if (!m) return;
    const headers: Record<string, string> = {};
    for (const line of m[1].split('\r\n')) {
      const at = line.indexOf(':');
      if (at > 0) headers[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim();
    }
    const st = headers.st ?? '';
    this.searches.push({ st, from: rinfo });
    this.lastSearcher = rinfo;
    this.o.log?.(`M-SEARCH ${st} from ${rinfo.address}:${rinfo.port}`);
    const replies: string[] = [];
    for (const dev of this.devices()) {
      const sts = st === 'ssdp:all' ? dev.types : st === 'uuid:' + dev.udn ? [dev.udn] : dev.types.includes(st) ? [st] : [];
      for (const t of sts) {
        const usn = t === dev.udn ? dev.udn : `${dev.udn}::${t}`;
        replies.push(`HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age=1800\r\nDATE: ${new Date().toUTCString()}\r\nEXT:\r\nLOCATION: ${dev.location}\r\nSERVER: Linux/6.0 UPnP/1.0 iva-fake/1.0\r\nST: ${t}\r\nUSN: ${usn}\r\n\r\n`);
      }
    }
    const send = () => { for (const r of replies) this.socket?.send(r, rinfo.port, rinfo.address); };
    if (this.o.replyDelay) this.timers.push(setTimeout(send, this.o.replyDelay));
    else send();
  }

  /** a NOTIFY (alive or byebye) for a device: to the last searcher, or to an address (239.255.255.250:1900 on the LAN) */
  notify(which: 'server' | 'renderer', nts: 'ssdp:alive' | 'ssdp:byebye', to?: { address: string; port: number }) {
    const dev = this.devices()[which === 'server' ? 0 : 1];
    const target = to ?? this.lastSearcher;
    if (!target) return;
    for (const t of dev.types) {
      const usn = `${dev.udn}::${t}`;
      const text = `NOTIFY * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nCACHE-CONTROL: max-age=1800\r\nLOCATION: ${dev.location}\r\nNT: ${t}\r\nNTS: ${nts}\r\nSERVER: Linux/6.0 UPnP/1.0 iva-fake/1.0\r\nUSN: ${usn}\r\n\r\n`;
      this.socket?.send(text, target.port, target.address);
    }
  }

  // ── HTTP: descriptions, control, media ──────────────────────────

  private http(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = req.url ?? '/';
    this.requests.push(`${req.method} ${url}`);
    this.o.log?.(`${req.method} ${url}`);
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      try {
        this.answer(req, res, url, body);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(String(e));
      }
    });
  }

  private answer(req: http.IncomingMessage, res: http.ServerResponse, url: string, body: string) {
    const xml = (status: number, text: string) => {
      res.writeHead(status, { 'Content-Type': 'text/xml; charset="utf-8"', EXT: '', Server: 'Linux/6.0 UPnP/1.0 iva-fake/1.0' });
      res.end(text);
    };
    if (req.method === 'GET' && url === '/server.xml') return xml(200, this.serverDescription());
    if (req.method === 'GET' && url === '/renderer.xml') return xml(200, this.rendererDescription());
    if (req.method === 'GET' && /^\/media\//.test(url)) {
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': String(SILENCE.length) });
      return res.end(SILENCE);
    }
    if (req.method === 'GET' && /^\/AlbumArt\//.test(url)) {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': String(PNG.length) });
      return res.end(PNG);
    }
    if (req.method === 'GET' && /^\/icons\//.test(url)) {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': String(PNG.length) });
      return res.end(PNG);
    }
    if (req.method === 'POST' && /^\/(cd|avt|rc|cm)\/control$/.test(url)) {
      const service = url.split('/')[1];
      const soapAction = String(req.headers.soapaction ?? '').replace(/"/g, '');
      const action = soapAction.split('#')[1] ?? '';
      const args: Record<string, string> = {};
      const inner = new RegExp(`<u:${action}[^>]*>([\\s\\S]*?)</u:${action}>`).exec(body);
      for (const m of (inner?.[1] ?? '').matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g)) args[m[1]] = unescape(m[2]);
      this.calls.push({ service, action, args });
      const r = this.action(service, action, args);
      if ('error' in r) return xml(500, fault(r.error[0], r.error[1]));
      const type = { cd: ST.cd, avt: ST.avt, rc: ST.rc, cm: ST.cm }[service]!;
      return xml(200, `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action}Response xmlns:u="${type}">${
        Object.entries(r.values).map(([k, v]) => `<${k}>${escape(v)}</${k}>`).join('')
      }</u:${action}Response></s:Body></s:Envelope>`);
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not here');
  }

  /** a SOAP action's answer: its out arguments, or a UPnPError */
  private action(service: string, action: string, a: Record<string, string>): { values: Record<string, string | number> } | { error: [number, string] } {
    const r = this.answerAction(service, action, a);
    return 'error' in r ? (r as { error: [number, string] }) : { values: r as Record<string, string | number> };
  }

  private answerAction(service: string, action: string, a: Record<string, string>): Record<string, string | number> | { error: [number, string] } {
    const r = this.renderer;
    const elapsed = () => r.state === 'PLAYING' ? r.position + (Date.now() - r.playedAt) / 1000 : r.position;
    switch (`${service}/${action}`) {
      case 'cd/Browse': {
        const id = a.ObjectID ?? '';
        if (a.BrowseFlag === 'BrowseMetadata') {
          const it = this.items.find((x) => x.id === id) ?? (id === '0' ? { id: '0', parentId: '-1', kind: 'container', title: 'root', class: 'object.container', childCount: 2 } as Item : null);
          if (!it) return { error: [701, 'No such object'] };
          return { Result: this.didl([it]), NumberReturned: 1, TotalMatches: 1, UpdateID: 1 };
        }
        if (id !== '0' && !this.items.some((x) => x.id === id)) return { error: [701, 'No such object'] };
        const all = this.items.filter((x) => x.parentId === id);
        const start = Number(a.StartingIndex) || 0;
        const count = Number(a.RequestedCount) || all.length;
        const page = all.slice(start, start + count);
        return { Result: this.didl(page), NumberReturned: page.length, TotalMatches: all.length, UpdateID: 1 };
      }
      case 'cd/Search': {
        const m = /dc:title contains "([^"]*)"/.exec(a.SearchCriteria ?? '');
        const found = this.items.filter((x) => x.kind === 'item' && (!m || x.title.toLowerCase().includes(m[1].toLowerCase())));
        return { Result: this.didl(found), NumberReturned: found.length, TotalMatches: found.length, UpdateID: 1 };
      }
      case 'cd/GetSearchCapabilities': return { SearchCaps: 'dc:title,upnp:class' };
      case 'cd/GetSortCapabilities': return { SortCaps: 'dc:title' };
      case 'cd/GetSystemUpdateID': return { Id: 1 };
      case 'cm/GetProtocolInfo': return { Source: service === 'cm' ? 'http-get:*:audio/mpeg:*,http-get:*:audio/wav:*' : '', Sink: 'http-get:*:audio/mpeg:*,http-get:*:audio/wav:*,http-get:*:video/mp4:*' };
      case 'cm/GetCurrentConnectionIDs': return { ConnectionIDs: '0' };
      case 'avt/SetAVTransportURI':
        r.uri = a.CurrentURI ?? '';
        r.metadata = a.CurrentURIMetaData ?? '';
        r.position = 0;
        r.state = r.uri ? 'STOPPED' : 'NO_MEDIA_PRESENT';
        return {};
      case 'avt/SetNextAVTransportURI':
        r.nextUri = a.NextURI ?? '';
        r.nextMetadata = a.NextURIMetaData ?? '';
        return {};
      case 'avt/Play':
        if (!r.uri) return { error: [701, 'Transition not available'] };
        r.playedAt = Date.now();
        r.state = 'PLAYING';
        return {};
      case 'avt/Pause':
        r.position = elapsed();
        r.state = 'PAUSED_PLAYBACK';
        return {};
      case 'avt/Stop':
        r.position = 0;
        r.state = r.uri ? 'STOPPED' : 'NO_MEDIA_PRESENT';
        return {};
      case 'avt/Next':
        if (!r.nextUri) return { error: [711, 'Illegal seek target'] };
        r.uri = r.nextUri;
        r.metadata = r.nextMetadata;
        r.nextUri = r.nextMetadata = '';
        r.position = 0;
        r.playedAt = Date.now();
        return {};
      case 'avt/Previous':
        r.position = 0;
        r.playedAt = Date.now();
        return {};
      case 'avt/Seek': {
        if (a.Unit !== 'REL_TIME') return { error: [710, 'Seek mode not supported'] };
        const m = /^(\d+):(\d+):(\d+)/.exec(a.Target ?? '');
        if (!m) return { error: [711, 'Illegal seek target'] };
        r.position = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
        r.playedAt = Date.now();
        return {};
      }
      case 'avt/GetTransportInfo': return { CurrentTransportState: r.state, CurrentTransportStatus: 'OK', CurrentSpeed: '1' };
      case 'avt/GetMediaInfo': return { NrTracks: r.uri ? 1 : 0, MediaDuration: '0:00:02', CurrentURI: r.uri, CurrentURIMetaData: r.metadata, NextURI: r.nextUri, NextURIMetaData: r.nextMetadata, PlayMedium: 'NETWORK', RecordMedium: 'NOT_IMPLEMENTED', WriteStatus: 'NOT_IMPLEMENTED' };
      case 'avt/GetPositionInfo': {
        const s = Math.floor(elapsed());
        const hms = (n: number) => `${Math.floor(n / 3600)}:${String(Math.floor(n / 60) % 60).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
        return { Track: r.uri ? 1 : 0, TrackDuration: r.uri ? '0:00:02' : '0:00:00', TrackMetaData: r.metadata, TrackURI: r.uri, RelTime: hms(s), AbsTime: hms(s), RelCount: 2147483647, AbsCount: 2147483647 };
      }
      case 'rc/GetVolume': return { CurrentVolume: r.volume };
      case 'rc/SetVolume': r.volume = Number(a.DesiredVolume) || 0; return {};
      case 'rc/GetMute': return { CurrentMute: r.mute };
      case 'rc/SetMute': r.mute = a.DesiredMute === '1' || a.DesiredMute === 'true' ? 1 : 0; return {};
      default: return { error: [401, 'Invalid Action'] };
    }
  }

  /** items as DIDL-Lite (the tracks' URLs on this server) */
  didl(items: Item[]): string {
    const one = (it: Item) => {
      const art = it.art ? `<upnp:albumArtURI>${this.base}/${it.art}</upnp:albumArtURI>` : '';
      if (it.kind === 'container') {
        return `<container id="${escape(it.id)}" parentID="${escape(it.parentId)}" restricted="1" childCount="${it.childCount ?? 0}"><dc:title>${escape(it.title)}</dc:title><upnp:class>${it.class}</upnp:class>${art}</container>`;
      }
      const mime = /videoItem/.test(it.class) ? 'video/mp4' : 'audio/wav';
      return `<item id="${escape(it.id)}" parentID="${escape(it.parentId)}" restricted="1"><dc:title>${escape(it.title)}</dc:title><upnp:class>${it.class}</upnp:class>${
        it.artist ? `<upnp:artist>${escape(it.artist)}</upnp:artist><dc:creator>${escape(it.artist)}</dc:creator>` : ''}${
        it.album ? `<upnp:album>${escape(it.album)}</upnp:album>` : ''}${art}<res size="${SILENCE.length}" duration="${it.duration ?? '0:00:02.000'}" protocolInfo="http-get:*:${mime}:*">${this.base}/media/${encodeURIComponent(it.id)}.wav</res></item>`;
    };
    return `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">${items.map(one).join('')}</DIDL-Lite>`;
  }

  serverDescription(): string {
    const service = (type: string, id: string, path: string) =>
      `<service><serviceType>${type}</serviceType><serviceId>urn:upnp-org:serviceId:${id}</serviceId><controlURL>/${path}/control</controlURL><eventSubURL>/${path}/event</eventSubURL><SCPDURL>/${path}/scpd.xml</SCPDURL></service>`;
    return `<?xml version="1.0"?><root xmlns="urn:schemas-upnp-org:device-1-0"><specVersion><major>1</major><minor>0</minor></specVersion><device><deviceType>${ST.server}</deviceType><friendlyName>iva fake server</friendlyName><manufacturer>iva</manufacturer><modelName>FakeServer</modelName><modelNumber>1</modelNumber><UDN>${SERVER_UDN}</UDN><iconList><icon><mimetype>image/png</mimetype><width>48</width><height>48</height><depth>24</depth><url>/icons/server.png</url></icon></iconList><serviceList>${service(ST.cd, 'ContentDirectory', 'cd')}${service(ST.cm, 'ConnectionManager', 'cm')}</serviceList></device></root>`;
  }

  rendererDescription(): string {
    const service = (type: string, id: string, path: string) =>
      `<service><serviceType>${type}</serviceType><serviceId>urn:upnp-org:serviceId:${id}</serviceId><controlURL>${path}/control</controlURL><eventSubURL>${path}/event</eventSubURL><SCPDURL>${path}/scpd.xml</SCPDURL></service>`;
    // relative control URLs against a URLBase, as some renderers write them
    return `<?xml version="1.0"?><root xmlns="urn:schemas-upnp-org:device-1-0"><specVersion><major>1</major><minor>0</minor></specVersion><URLBase>${this.base}/</URLBase><device><deviceType>${ST.renderer}</deviceType><friendlyName>iva fake renderer</friendlyName><manufacturer>iva</manufacturer><modelName>FakeRenderer</modelName><UDN>${RENDERER_UDN}</UDN><serviceList>${service(ST.avt, 'AVTransport', 'avt')}${service(ST.rc, 'RenderingControl', 'rc')}${service(ST.cm, 'ConnectionManager', 'cm')}</serviceList></device></root>`;
  }
}

function fault(code: number, description: string) {
  return `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><s:Fault><faultcode>s:Client</faultcode><faultstring>UPnPError</faultstring><detail><UPnPError xmlns="urn:schemas-upnp-org:control-1-0"><errorCode>${code}</errorCode><errorDescription>${escape(description)}</errorDescription></UPnPError></detail></s:Fault></s:Body></s:Envelope>`;
}

/** two seconds of silence: a WAV a renderer can play */
const SILENCE: Buffer = (() => {
  const rate = 8000, seconds = 2, data = rate * seconds * 2;
  const b = Buffer.alloc(44 + data);
  b.write('RIFF', 0); b.writeUInt32LE(36 + data, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(data, 40);
  return b;
})();

/** a 1x1 PNG, for icons and album art */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

/** the machine's LAN address (the first IPv4 that isn't loopback) */
export function lanAddress(): string {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return '127.0.0.1';
}

// run by itself: a server and a renderer on the LAN, found by SSDP
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const at = process.argv.indexOf('--port');
  const port = at > 0 ? Number(process.argv[at + 1]) : 8300;
  const fake = new FakeUpnp({ host: '0.0.0.0', advertise: lanAddress(), httpPort: port, ssdpPort: 1900, log: (l) => console.log(l) });
  fake.start().then(() => {
    console.log(`fake UPnP server and renderer: ${fake.serverLocation}, ${fake.rendererLocation}; SSDP on 239.255.255.250:1900`);
    const group = { address: '239.255.255.250', port: 1900 };
    const alive = () => { fake.notify('server', 'ssdp:alive', group); fake.notify('renderer', 'ssdp:alive', group); };
    alive();
    setInterval(alive, 60000);
    process.on('SIGINT', () => { fake.notify('server', 'ssdp:byebye', group); fake.notify('renderer', 'ssdp:byebye', group); setTimeout(() => process.exit(0), 200); });
  });
}
