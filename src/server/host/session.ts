/**
 * One preview page's backend: the host commands the runtime's sockets send
 * (src/runtime/host: tcp_connect, udp_bind, ... - the names and payloads of
 * agapi's Tauri host, where the runtime comes from), on Node sockets. Everything a session opens is closed when its
 * page goes away, so a reload never leaves a port bound.
 */

import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
import dns from 'node:dns/promises';
import os from 'node:os';
import { createHash } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';

export type Emit = (event: string, payload: unknown) => void;

type Args = Record<string, any>;

interface NetEvent {
  id: string;
  event: string;
  data: number[] | null;
  error: string | null;
  remote_address: string | null;
  remote_port: number | null;
  local_address?: string | null;
  local_port?: number | null;
  family?: string | null;
}

const bytes = (data: unknown): Buffer => Buffer.from((data as number[]) ?? []);
const errText = (e: any) => (e?.code && !String(e.message).includes(e.code) ? `${e.code}: ${e.message}` : String(e?.message ?? e));
const family = (f: string | number | undefined) => (f === 6 || f === 'IPv6' ? 'IPv6' : 'IPv4');

export class HostSession {
  private seq = 0;
  private tcp = new Map<string, net.Socket>();
  private servers = new Map<string, net.Server>();
  private udp = new Map<string, dgram.Socket>();
  private tlsSockets = new Map<string, tls.TLSSocket>();

  constructor(private emit: Emit, private log: (msg: string) => void = () => {}) {}

  private nextId(kind: string) {
    return `${kind}-${++this.seq}`;
  }

  async invoke(cmd: string, args: Args): Promise<unknown> {
    const fn = (this.commands as Record<string, (a: Args) => unknown>)[cmd];
    if (!fn) throw new Error(`iva host: command "${cmd}" is not implemented`);
    return fn(args);
  }

  /** A TCP server of this session's on that port (a panel's own server: the preview's web views reach it). */
  listening(port: number): boolean {
    for (const s of this.servers.values()) if ((s.address() as net.AddressInfo | null)?.port === port) return true;
    return false;
  }

  /** Close everything this session opened. */
  dispose() {
    for (const s of this.tcp.values()) s.destroy();
    for (const s of this.tlsSockets.values()) s.destroy();
    for (const s of this.servers.values()) s.close();
    for (const s of this.udp.values()) { try { s.close(); } catch { /* already closed */ } }
    this.tcp.clear();
    this.tlsSockets.clear();
    this.servers.clear();
    this.udp.clear();
  }

  // ── TCP ──────────────────────────────────────────────────────────

  /** Wire a connected stream socket's events to `channel` (plugin:net:tcp / plugin:net:tls). */
  private pipeStream(id: string, sock: net.Socket, channel: string, registry: Map<string, net.Socket>) {
    const base = () => ({
      id,
      remote_address: sock.remoteAddress ?? null,
      remote_port: sock.remotePort ?? null,
      local_address: sock.localAddress ?? null,
      local_port: sock.localPort ?? null,
      family: family(sock.remoteFamily),
    });
    const send = (event: string, extra: Partial<NetEvent> = {}) =>
      this.emit(channel, { ...base(), event, data: null, error: null, ...extra });
    let errored = false;
    sock.on('data', (chunk: Buffer) => send('data', { data: Array.from(chunk) }));
    sock.on('finish', () => send('finish'));
    sock.on('error', (e) => { errored = true; send('error', { error: errText(e) }); });
    sock.on('close', () => {
      registry.delete(id);
      if (!errored) send('close');
    });
  }

  private connectResult(id: string, sock: net.Socket) {
    return {
      id,
      remote_address: sock.remoteAddress ?? '',
      remote_port: sock.remotePort ?? 0,
      local_address: sock.localAddress ?? '',
      local_port: sock.localPort ?? 0,
      family: family(sock.remoteFamily),
    };
  }

  private commands = {
    tcp_connect: ({ host, port }: Args) =>
      new Promise((resolve, reject) => {
        const sock = net.connect({ host, port });
        const fail = (e: Error) => reject(errText(e));
        sock.once('error', fail);
        sock.once('connect', () => {
          sock.off('error', fail);
          const id = this.nextId('tcp');
          this.tcp.set(id, sock);
          this.pipeStream(id, sock, 'plugin:net:tcp', this.tcp);
          this.log(`tcp ${id} -> ${host}:${port}`);
          resolve(this.connectResult(id, sock));
        });
      }),
    tcp_write: ({ id, data }: Args) => this.write(this.tcp, id, data),
    tcp_shutdown: ({ id }: Args) => { this.get(this.tcp, id).end(); return null; },
    tcp_destroy: ({ id }: Args) => { this.tcp.get(id)?.destroy(); return null; },
    tcp_set_keep_alive: ({ id, enable, delay }: Args) => { this.get(this.tcp, id).setKeepAlive(!!enable, delay ?? 0); return null; },
    tcp_set_no_delay: ({ id, noDelay }: Args) => { this.get(this.tcp, id).setNoDelay(!!noDelay); return null; },

    tcp_listen: ({ host, port }: Args) =>
      new Promise((resolve, reject) => {
        const id = this.nextId('srv');
        const server = net.createServer((sock) => {
          const clientId = this.nextId('tcp');
          this.tcp.set(clientId, sock);
          this.pipeStream(clientId, sock, 'plugin:net:tcp', this.tcp);
          this.emit('plugin:net:tcpserver', {
            id,
            event: 'connection',
            data: Array.from(Buffer.from(clientId)),
            error: null,
            remote_address: sock.remoteAddress ?? null,
            remote_port: sock.remotePort ?? null,
            local_address: sock.localAddress ?? null,
            local_port: sock.localPort ?? null,
            family: family(sock.remoteFamily),
          } satisfies NetEvent);
        });
        server.once('error', (e) => reject(errText(e)));
        server.listen(port, host, () => {
          server.on('error', (e) =>
            this.emit('plugin:net:tcpserver', { id, event: 'error', data: null, error: errText(e), remote_address: null, remote_port: null }));
          server.on('close', () => {
            this.servers.delete(id);
            this.emit('plugin:net:tcpserver', { id, event: 'close', data: null, error: null, remote_address: null, remote_port: null });
          });
          this.servers.set(id, server);
          const a = server.address() as net.AddressInfo;
          this.log(`tcp server ${id} listening on ${a.address}:${a.port}`);
          resolve({ id, local_address: a.address, local_port: a.port, family: family(a.family) });
        });
      }),
    tcp_server_close: ({ id }: Args) => { this.servers.get(id)?.close(); return null; },

    // ── TLS (client) ───────────────────────────────────────────────

    tls_connect: ({ host, port, serverName, rejectUnauthorized, alpn }: Args) =>
      new Promise((resolve, reject) => {
        const sock = tls.connect({
          host,
          port,
          servername: net.isIP(serverName) ? undefined : serverName,
          rejectUnauthorized: rejectUnauthorized !== false,
          ALPNProtocols: alpn ?? undefined,
        });
        const fail = (e: Error) => reject(errText(e));
        sock.once('error', fail);
        sock.once('secureConnect', () => {
          sock.off('error', fail);
          const id = this.nextId('tls');
          this.tlsSockets.set(id, sock);
          this.pipeStream(id, sock, 'plugin:net:tls', this.tlsSockets as Map<string, net.Socket>);
          resolve({ ...this.connectResult(id, sock), authorized: sock.authorized, alpn_protocol: sock.alpnProtocol || null });
        });
      }),
    tls_write: ({ id, data }: Args) => this.write(this.tlsSockets as Map<string, net.Socket>, id, data),
    tls_shutdown: ({ id }: Args) => { this.get(this.tlsSockets as Map<string, net.Socket>, id).end(); return null; },
    tls_destroy: ({ id }: Args) => { this.tlsSockets.get(id)?.destroy(); return null; },
    tls_set_keep_alive: ({ id, enable, delay }: Args) => { this.get(this.tlsSockets, id).setKeepAlive(!!enable, delay ?? 0); return null; },

    // ── UDP ────────────────────────────────────────────────────────

    udp_bind: ({ host, port, reuseAddr, ipv6Only, recvBufferSize, sendBufferSize }: Args) =>
      new Promise((resolve, reject) => {
        const type = net.isIPv6(host ?? '') ? 'udp6' : 'udp4';
        const sock = dgram.createSocket({
          type,
          reuseAddr: !!reuseAddr,
          ipv6Only: !!ipv6Only,
          recvBufferSize: recvBufferSize ?? undefined,
          sendBufferSize: sendBufferSize ?? undefined,
        });
        const id = this.nextId('udp');
        const event = (ev: string, extra: Partial<NetEvent> = {}) =>
          this.emit('plugin:net:udp', { id, event: ev, data: null, error: null, remote_address: null, remote_port: null, ...extra });
        const fail = (e: Error) => reject(errText(e));
        sock.once('error', fail);
        sock.bind(port || 0, host || undefined, () => {
          sock.off('error', fail);
          sock.on('error', (e) => event('error', { error: errText(e) }));
          sock.on('message', (msg, rinfo) =>
            event('message', { data: Array.from(msg), remote_address: rinfo.address, remote_port: rinfo.port, family: rinfo.family }));
          sock.on('close', () => { this.udp.delete(id); event('close'); });
          this.udp.set(id, sock);
          const a = sock.address();
          this.log(`udp ${id} bound on ${a.address}:${a.port}`);
          resolve({ id, local_address: a.address, local_port: a.port, family: family(a.family) });
        });
      }),
    udp_send: ({ id, data, host, port }: Args) =>
      new Promise((resolve, reject) => {
        const sock = this.get(this.udp, id);
        const cb = (e: Error | null) => (e ? reject(errText(e)) : resolve(null));
        if (port) sock.send(bytes(data), port, host ?? undefined, cb);
        else sock.send(bytes(data), cb);
      }),
    udp_connect: ({ id, host, port }: Args) =>
      new Promise((resolve, reject) => {
        const sock = this.get(this.udp, id);
        sock.connect(port, host, () => resolve(null));
        sock.once('error', (e) => reject(errText(e)));
      }),
    udp_disconnect: ({ id }: Args) => { this.get(this.udp, id).disconnect(); return null; },
    udp_close: ({ id }: Args) => { this.udp.get(id)?.close(); return null; },
    udp_add_membership: ({ id, multicastAddress, multicastInterface }: Args) => {
      this.get(this.udp, id).addMembership(multicastAddress, multicastInterface ?? undefined);
      return null;
    },
    udp_drop_membership: ({ id, multicastAddress, multicastInterface }: Args) => {
      this.get(this.udp, id).dropMembership(multicastAddress, multicastInterface ?? undefined);
      return null;
    },
    udp_set_broadcast: ({ id, flag }: Args) => { this.get(this.udp, id).setBroadcast(!!flag); return null; },
    udp_set_ttl: ({ id, ttl }: Args) => { this.get(this.udp, id).setTTL(ttl); return null; },
    udp_set_multicast_ttl: ({ id, ttl }: Args) => { this.get(this.udp, id).setMulticastTTL(ttl); return null; },
    udp_set_multicast_loopback: ({ id, flag }: Args) => { this.get(this.udp, id).setMulticastLoopback(!!flag); return null; },
    udp_get_recv_buffer_size: ({ id }: Args) => this.get(this.udp, id).getRecvBufferSize(),
    udp_get_send_buffer_size: ({ id }: Args) => this.get(this.udp, id).getSendBufferSize(),
    udp_set_recv_buffer_size: ({ id, size }: Args) => { this.get(this.udp, id).setRecvBufferSize(size); return null; },
    udp_set_send_buffer_size: ({ id, size }: Args) => { this.get(this.udp, id).setSendBufferSize(size); return null; },

    // ── DNS ────────────────────────────────────────────────────────

    dns_lookup: async ({ hostname, family: fam, all }: Args) => {
      const opts = { family: fam ?? 0 };
      if (all) return dns.lookup(hostname, { ...opts, all: true });
      return dns.lookup(hostname, opts);
    },

    // ── HTTP client (what the browser can't do: no CORS, self-signed certs) ──

    http_fetch: (args: Args) => httpFetch(args as FetchArgs),

    // ── the device (CF.device, CF.ipv4address ...): this machine ──

    device_info: () => deviceInfo(),
  };

  private get<T>(map: Map<string, T>, id: string): T {
    const v = map.get(id);
    if (!v) throw new Error(`EBADF: socket not found (${id})`);
    return v;
  }

  private write(map: Map<string, net.Socket>, id: string, data: unknown) {
    return new Promise((resolve, reject) => {
      this.get(map, id).write(bytes(data), (e) => (e ? reject(errText(e)) : resolve(null)));
    });
  }
}

interface FetchArgs {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  /** base64 */
  body?: string | null;
  acceptInvalidCerts?: boolean;
  connectTimeout?: number | null;
  maxRedirections?: number;
}

/** One HTTP(S) request from Node; follows redirects like fetch does. */
function httpFetch(args: FetchArgs, redirects = 0): Promise<unknown> {
  const { url, method = 'GET', headers = {}, body, acceptInvalidCerts = true, connectTimeout, maxRedirections = 20 } = args;
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      u,
      { method, headers, rejectUnauthorized: !acceptInvalidCerts, timeout: connectTimeout ?? undefined },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (location && [301, 302, 303, 307, 308].includes(status) && redirects < maxRedirections) {
          res.resume();
          const next = new URL(location, u).toString();
          const keepBody = status === 307 || status === 308;
          resolve(httpFetch({ ...args, url: next, method: keepBody ? method : 'GET', body: keepBody ? body : null }, redirects + 1));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const outHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) outHeaders[k] = Array.isArray(v) ? v.join(', ') : v;
          resolve({ url, status, statusText: res.statusMessage ?? '', headers: outHeaders, body: Buffer.concat(chunks).toString('base64') });
        });
        res.on('error', (e) => reject(errText(e)));
      },
    );
    req.on('timeout', () => req.destroy(Object.assign(new Error('connect timed out'), { code: 'ETIMEDOUT' })));
    req.on('error', (e) => reject(errText(e)));
    if (body) req.write(Buffer.from(body, 'base64'));
    req.end();
  });
}

/**
 * The machine iva dev runs on, as a GUI's scripts see a device (CF.device,
 * CF.ipv4address ...): the main interface - Wi-Fi, then wired, then the rest
 * - told apart by name, as the panel app does; its ID from the machine.
 */
export function deviceInfo() {
  const rank = (name: string): [number, string] => {
    const n = name.toLowerCase();
    if (/^(wl|wi-?fi)/.test(n) || n.includes('wi-fi')) return [0, 'WiFi'];
    if (/^(eth|en)/.test(n) || n.includes('ethernet')) return [1, 'WiFi'];
    if (/^(tun|zt|wg|ppp|utun)/.test(n) || n.includes('tailscale')) return [2, 'VPN'];
    return [1, 'WiFi'];
  };
  const ifaces = Object.entries(os.networkInterfaces()).flatMap(([name, list]) => (list ?? []).filter((a) => !a.internal).map((a) => ({ name, ...a })));
  const main = ifaces.filter((a) => a.family === 'IPv4').sort((a, b) => rank(a.name)[0] - rank(b.name)[0])[0];
  const v6 = main ? ifaces.filter((a) => a.name === main.name && a.family === 'IPv6').sort((a, b) => Number(a.address.startsWith('fe80')) - Number(b.address.startsWith('fe80')))[0] : undefined;
  const platform = ({ linux: 'Linux', win32: 'Windows', darwin: 'macOS' } as Record<string, string>)[process.platform] ?? process.platform;
  const host = os.hostname();
  const id = createHash('sha1').update(`${host}|${main?.mac ?? ''}`).digest('hex').toUpperCase();
  return {
    platform,
    version: os.release(),
    model: host,
    name: host,
    uuid: `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20, 32)}`,
    ipv4address: main?.address ?? '',
    ipv4netmask: main?.netmask ?? '',
    ipv6address: v6?.address ?? '',
    ipv6netmask: v6?.netmask ?? '',
    MACaddress: main?.mac && main.mac !== '00:00:00:00:00:00' ? main.mac.toUpperCase() : '',
    networkType: main ? rank(main.name)[1] : 'None',
    networkSSID: '',
  };
}
