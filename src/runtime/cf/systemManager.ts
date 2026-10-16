import { net, type ITcpSocket, type IUdpSocket, type ITcpServer } from '../stdlib/net';
import { dgram } from '../stdlib/dgram';
import tls from '../stdlib/tls';
import http from '../stdlib/http';
import { getHost } from '../stdlib/host';
import { CFAPI } from './cf';
import { CFNode } from './parser';
import { TextIn, encodeText } from './textCodec';

// Track running macro timeouts for CF.stopMacro() support
const runningMacros: Map<string, ReturnType<typeof setTimeout>[]> = new Map();

export function runMacroByName(cfApi: CFAPI, macroName: string) {
    const macroObj = (cfApi as any).renderer?.project?.macros?.find(
        (m: any) => m.attributes?.name === macroName || m.name === macroName
    );
    if (!macroObj || !macroObj.children) {
        console.warn(`[Macro] "${macroName}" not found`);
        return;
    }

    // Clear any previously scheduled timeouts for this macro
    stopMacroByName(macroName);

    let delayAcc = 0;
    const handles: ReturnType<typeof setTimeout>[] = [];
    for (const action of macroObj.children) {
        if (action.type === 'cmd') {
            const delayStr = action.attributes?.delay || '0';
            delayAcc += parseInt(delayStr, 10);
            const targetCmd = action.attributes?.command || action.attributes?.name;
            if (targetCmd) {
                const h = setTimeout(() => {
                    // Remove handle from list once fired
                    const arr = runningMacros.get(macroName);
                    if (arr) {
                        const idx = arr.indexOf(h);
                        if (idx !== -1) arr.splice(idx, 1);
                    }
                    (cfApi as any).runCommand('', targetCmd, '');
                }, delayAcc);
                handles.push(h);
            }
        }
    }
    runningMacros.set(macroName, handles);
}

export function stopMacroByName(macroName: string | null) {
    if (macroName === null || macroName === '') {
        // Stop all running macros
        for (const [, handles] of runningMacros) {
            handles.forEach(h => clearTimeout(h));
        }
        runningMacros.clear();
    } else {
        const handles = runningMacros.get(macroName);
        if (handles) {
            handles.forEach(h => clearTimeout(h));
            runningMacros.delete(macroName);
        }
    }
}

/** \x41-style escapes (GUI Designer's EOM, heartbeat strings) as their chars */
const unescapeHex = (s: string) => s.replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

/** a string's chars a byte each (CF.BINARY: past 0xFF, stripped to a byte) */
const charBytes = (s: string) => {
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
    return bytes;
};

/** what a socket hands over, as bytes */
function bytesOf(msg: unknown): Uint8Array {
    if (typeof msg === 'string') return charBytes(msg);
    if (msg instanceof Uint8Array) return msg;
    if (ArrayBuffer.isView(msg)) return new Uint8Array(msg.buffer, msg.byteOffset, msg.byteLength);
    if (msg instanceof ArrayBuffer) return new Uint8Array(msg);
    if (msg && typeof msg === 'object' && typeof (msg as ArrayLike<number>).length === 'number') return Uint8Array.from(msg as ArrayLike<number>);
    return new Uint8Array(0);
}

/** GUI Designer's Mode (the alwayson attribute) */
export enum SystemMode {
    /** connected when there's something to send, closed once idle */
    Transitory = 0,
    /** connected from the start, again 3 s after a drop */
    AlwaysOn = 1,
    /** as Transitory, and each packet waits for its answer (up to the Answer Timeout) before the next */
    Dialog = 2,
}

/**
 * CF's heartbeat on a connection (Heartbeat Mode): Reply - Heartbeat Tx sent
 * whenever Heartbeat Rx comes; Initiate - Tx sent every 3 s, and with no Rx
 * in 15 s the connection is closed (to connect again).
 */
export class Heartbeat {
    private timer?: ReturnType<typeof setInterval>;
    private heard = 0;
    private warned = false;

    constructor(
        private readonly mode: number,
        private readonly rx: string,
        private readonly tx: string,
        private readonly name: string,
        private readonly write: (text: string) => void,
        private readonly drop: () => void,
    ) {}

    start() {
        this.stop();
        if (this.mode !== 1 || !this.tx) return;
        this.heard = Date.now();
        this.warned = false;
        this.timer = setInterval(() => {
            const quiet = Date.now() - this.heard;
            if (quiet > 15000) {
                console.warn(`[System ${this.name}] no heartbeat for 15 s: connecting again`);
                this.stop();
                this.drop();
                return;
            }
            if (quiet > 7000 && !this.warned) {
                this.warned = true;
                console.warn(`[System ${this.name}] no heartbeat reply in 7 s`);
            }
            this.write(this.tx);
        }, 3000);
    }

    stop() {
        clearInterval(this.timer);
        this.timer = undefined;
    }

    /** what came: Rx (with none set, anything) a sign of life; in Reply mode, Rx answered */
    hear(text: string) {
        const rx = !!this.rx && text.includes(this.rx);
        if (rx || !this.rx) {
            this.heard = Date.now();
            this.warned = false;
        }
        if (this.mode === 0 && rx && this.tx) this.write(this.tx);
    }
}

export class ControlSystem {
    public name: string;
    public type: string;           // 'tcp' | 'udp' | 'http'
    public address: string;
    public port: number;
    /** origin: a UDP system's own port (0: the remote's; -1: any), a TCP server's */
    public localPort: number;
    public enabled: boolean;
    public connectJoin: string;    // raw number string ("100") or "" for none
    public disconnectJoin: string;
    public connections: string[] = [];
    public eom: string;
    public offlineQueue: boolean;
    /** TCP: a server (TCP Server Mode); UDP: accepting incoming */
    public accept: boolean;
    public readonly mode: SystemMode;
    /** Transitory / Dialog: closed after this many ms with nothing going through (0: shortly after) */
    private readonly idleTimeout: number;
    /** Dialog: how long a packet waits for its answer (0: as long as it takes) */
    private readonly dialogTimeout: number;
    /** TLS (Enable SSL; an HTTP system's HTTPS) */
    public readonly ssl: boolean;
    /** Text Encoding: the bytes' text (see textCodec) */
    public readonly textEncoding: string;
    /** Javascript Send Handler: run with what commands send here, instead of sending it */
    private readonly sendHandler: string;
    private readonly maxConnections: number;
    private readonly acceptBroadcasts: boolean;
    private readonly heartbeat: { mode: number; rx: string; tx: string };

    private tcpSocket?: ITcpSocket;
    /** the TCP client's connection is up (not still connecting) */
    private connected = false;
    private udpSocket?: IUdpSocket;
    private tcpServer?: ITcpServer;
    /**
     * The clients connected to the TCP server, each with what it sent that no
     * feedback matched yet. What the system sends goes to every one of them
     * (CF.send: "the string will be sent to each connected system").
     */
    private tcpClients: { socket: ITcpSocket; buffer: string; text: TextIn; beat: Heartbeat }[] = [];
    private cfApi: CFAPI;
    public feedbackRules: CFNode[];
    private autoReconnect: boolean;
    /** alwayson: reconnect when the connection drops - from each start() on (stop() pauses it) */
    private readonly alwaysOn: boolean;
    private buffer: string = '';
    /** a UDP system's packets as text */
    private textIn: TextIn;

    /** what waits for the connection (Queue When Offline; Transitory: what it connects for) */
    private sendQueue: Uint8Array[] = [];
    /** Dialog: the packets still to send, one at a time */
    private dialog: Uint8Array[] = [];
    /** Dialog: a packet sent, its answer not in yet */
    private awaiting = false;
    private answerTimer?: ReturnType<typeof setTimeout>;
    private idleTimer?: ReturnType<typeof setTimeout>;
    private retryTimer?: ReturnType<typeof setTimeout>;
    /** an HTTP system's last request got an answer */
    private httpUp?: boolean;

    /** True for loopback (127.0.0.1) systems — all data is processed in-process, no real socket */
    public isLoopback: boolean;

    /** Command to run on system startup */
    private startupCmd: string;
    /** Macro to run on system startup */
    private startupMacro: string;

    constructor(cfApi: CFAPI, node: CFNode) {
        this.cfApi = cfApi;

        const a = node.attributes;
        this.name = a['name'] || '';
        // Protocol: tcp | udp | http | https
        const protocol = (a['protocol'] || a['type'] || 'tcp').toLowerCase();
        this.type = protocol === 'https' ? 'http' : protocol;

        this.address = a['ip'] || a['address'] || a['host'] || '127.0.0.1';
        this.port = parseInt(a['port'] || '0', 10);
        // 'origin' = source/local port in CF GUI
        this.localPort = parseInt(a['origin'] || a['localPort'] || a['srcPort'] || '0', 10) || 0;
        this.eom = unescapeHex(a['eom'] || '');
        this.mode = a['alwayson'] === '0' ? SystemMode.Transitory : a['alwayson'] === '2' ? SystemMode.Dialog : SystemMode.AlwaysOn;
        this.alwaysOn = this.mode === SystemMode.AlwaysOn;
        this.autoReconnect = this.alwaysOn;
        this.idleTimeout = Math.max(0, parseInt(a['idleTimeout'] || '0', 10) || 0);
        this.dialogTimeout = Math.max(0, parseInt(a['dialogTimeout'] || '0', 10) || 0);
        this.offlineQueue = a['offlinequeue'] === '1';
        this.enabled = true;
        this.accept = a['accept'] === '1';
        this.acceptBroadcasts = a['acceptBroadcasts'] === '1';
        this.maxConnections = Math.max(0, parseInt(a['maxconnections'] || '0', 10) || 0);
        this.ssl = a['ssl'] === '1' || protocol === 'https';
        this.textEncoding = (a['textEncoding'] || '').trim();
        this.textIn = new TextIn(this.textEncoding);
        this.sendHandler = (a['js'] || '').trim();

        // Join numbers: "0" means no join assigned
        const rawConnect = a['connectionStatus'] || a['connectJoin'] || a['connect'] || '0';
        const rawDisconnect = a['disconnectionStatus'] || a['disconnectJoin'] || a['disconnect'] || '0';
        this.connectJoin = (rawConnect !== '0' && rawConnect !== '') ? rawConnect : '';
        this.disconnectJoin = (rawDisconnect !== '0' && rawDisconnect !== '') ? rawDisconnect : '';

        // Heartbeat Mode: -1 none, 0 Reply, 1 Initiate
        this.heartbeat = {
            mode: parseInt(a['heartbeatMode'] || '-1', 10),
            rx: unescapeHex(a['heartbeatRx'] || ''),
            tx: unescapeHex(a['heartbeatTx'] || ''),
        };

        // Startup command / macro
        this.startupCmd = a['startupCmd'] || '';
        this.startupMacro = a['startupMacro'] || '';

        // Detect loopback: ip=127.0.0.1 OR name contains "loopback" (case-insensitive)
        this.isLoopback = this.type !== 'http' && (
            this.address === '127.0.0.1' ||
            this.address === 'localhost' ||
            this.name.toLowerCase().includes('loopback')
        );

        // Feedback rules are <fb> children of the system node
        this.feedbackRules = node.children.filter(c => c.type === 'fb');
    }

    // ──────────────────────────────────────────────────────────────
    // Lifecycle
    // ──────────────────────────────────────────────────────────────

    public start() {
        if (!this.enabled) return;
        // started again (re-enabled, a new address, the GUI awake again): reconnecting as configured
        this.autoReconnect = this.alwaysOn;

        if (this.isLoopback) {
            this._startLoopback();
            return;
        }
        // HTTP: a request a command, no connection to keep
        if (this.type === 'http') return;

        // not connected yet: the Disconnected join high
        this._setJoinPair(false);
        // Protocol wins over accept: UDP systems with accept=1 are still UDP
        // (bind localPort / join multicast). accept=1 only means TCP *listen*
        // for tcp systems — never open a TCP server for protocol="udp".
        if (this.type === 'udp') {
            this._startUdp();
        } else if (this.accept) {
            this._startTcpServer();
        } else if (this.alwaysOn) {
            this._connectTcp();
        } else if (this.sendQueue.length || this.dialog.length) {
            // Transitory / Dialog: connected for what waits
            this._connectTcp();
        }
    }

    public stop() {
        this.enabled = false;
        this.autoReconnect = false;
        clearTimeout(this.idleTimer);
        clearTimeout(this.answerTimer);
        clearTimeout(this.retryTimer);
        this.awaiting = false;

        if (this.isLoopback) {
            const remote = `${this.address}:${this.port}`;
            this.connections = this.connections.filter(c => c !== remote);
            this._setJoinPair(false);
            this.cfApi.dispatchEvent(this.cfApi.ConnectionStatusChangeEvent, this.name, false, remote);
            return;
        }

        if (this.tcpSocket) {
            try {
                this.tcpSocket.destroy();
            } catch (e) {
                console.warn(`[System ${this.name}] tcp destroy:`, e);
            }
            this.tcpSocket = undefined;
            this.connected = false;
        }
        if (this.udpSocket) {
            const socket = this.udpSocket;
            this.udpSocket = undefined;
            try {
                // drop multicast before close when possible
                if (this._isMulticastAddress(this.address) && socket.dropMembership) {
                    try {
                        socket.dropMembership(this.address);
                    } catch {
                        /* ignore */
                    }
                }
                socket.close();
            } catch (e) {
                console.warn(`[System ${this.name}] udp close:`, e);
            }
            this.connections = [];
            this._setJoinPair(false);
            this.cfApi.dispatchEvent(this.cfApi.ConnectionStatusChangeEvent, this.name, false, null);
        }
        if (this.tcpServer) {
            for (const c of this.tcpClients) c.beat.stop();
            try {
                this.tcpServer.closeAllConnections?.();
                this.tcpServer.close();
            } catch (e) {
                console.warn(`[System ${this.name}] tcp server close:`, e);
            }
            this.tcpServer = undefined;
        }
        this.tcpClients = [];
        this.connections = [];
    }

    // ──────────────────────────────────────────────────────────────
    // Loopback — in-process, no real socket needed
    // ──────────────────────────────────────────────────────────────

    private _startLoopback() {
        const remote = `${this.address}:${this.port}`;
        if (!this.connections.includes(remote)) this.connections.push(remote);

        this._setJoinPair(true);

        // Dispatch connected immediately — loopback is always available
        this.cfApi.dispatchEvent(this.cfApi.ConnectionStatusChangeEvent, this.name, true, remote);

        // its startup command / macro once scripts registered in userMain() are ready
        setTimeout(() => this._startup(), 0);
    }

    /** Connected to: the Startup Command and Macro ("every time the system is successfully connected to") */
    private _startup() {
        if (!this.enabled) return;
        if (this.startupCmd) this.cfApi.runCommand('', this.startupCmd);
        if (this.startupMacro) runMacroByName(this.cfApi, this.startupMacro);
    }

    // ──────────────────────────────────────────────────────────────
    // TCP Client
    // ──────────────────────────────────────────────────────────────

    private _connectTcp() {
        if (!this.enabled || (this.tcpSocket && !this.tcpSocket.destroyed)) return;
        clearTimeout(this.retryTimer);

        // Enable SSL: the same, over TLS (a self-signed certificate does: control gear has those)
        const socket: ITcpSocket = this.ssl
            ? tls.connect({ host: this.address, port: this.port, rejectUnauthorized: false })
            : new net.Socket();
        this.tcpSocket = socket;
        this.connected = false;
        if (!this.ssl) socket.connect(this.port, this.address);
        const remote = `${this.address}:${this.port}`;
        const text = new TextIn(this.textEncoding);
        const beat = new Heartbeat(this.heartbeat.mode, this.heartbeat.rx, this.heartbeat.tx, this.name,
            (s) => this._write(encodeText(s, this.textEncoding)), () => socket.destroy());

        socket.on('connect', () => {
            if (this.tcpSocket !== socket) return;
            this.connected = true;
            if (!this.connections.includes(remote)) this.connections.push(remote);
            this._setJoinPair(true);
            this.cfApi.dispatchEvent(this.cfApi.ConnectionStatusChangeEvent, this.name, true, remote);
            beat.start();
            this._startup();
            // what waited: sent now
            const queued = this.sendQueue;
            this.sendQueue = [];
            for (const bytes of queued) this._transmit(bytes);
            this._pump();
            this._idle();
        });

        socket.on('data', (data: unknown) => {
            if (this.tcpSocket !== socket) return;
            const str = text.decode(bytesOf(data));
            beat.hear(str);
            this.buffer += str;
            const messages = this._processBuffer();
            // Dialog: the answer to the packet sent (a message; without an EOM, anything)
            if (this.awaiting && (messages > 0 || !this.eom)) this._answered();
            this._idle();
        });

        socket.on('close', () => {
            beat.stop();
            // a socket stopped and since replaced (the system started again): the new one tells
            if (this.tcpSocket && this.tcpSocket !== socket) return;
            this.tcpSocket = undefined;
            this.connected = false;
            clearTimeout(this.idleTimer);
            clearTimeout(this.answerTimer);
            this.awaiting = false;
            this.connections = this.connections.filter(c => c !== remote);
            this._setJoinPair(false);
            this.cfApi.dispatchEvent(this.cfApi.ConnectionStatusChangeEvent, this.name, false, remote);

            // Always On: again in 3 s; Transitory / Dialog: again if something still waits
            const waiting = this.sendQueue.length > 0 || this.dialog.length > 0;
            if (this.enabled && (this.autoReconnect || (!this.alwaysOn && waiting))) {
                this.retryTimer = setTimeout(() => this._connectTcp(), 3000);
            }
        });

        socket.on('error', (err: any) => {
            console.warn(`[System ${this.name}] TCP error:`, err?.message ?? err);
        });
    }

    /** bytes out on the TCP client's connection (the idle clock starts over) */
    private _write(bytes: Uint8Array) {
        if (!this.tcpSocket || !this.connected) return;
        this.tcpSocket.write(bytes as any);
        this._idle();
    }

    /** Transitory / Dialog: closed once nothing's gone through for the Idle Timeout */
    private _idle() {
        if (this.alwaysOn || !this.tcpSocket || this.accept || this.type !== 'tcp') return;
        clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => {
            if (this.awaiting || this.dialog.length || this.sendQueue.length) return this._idle();
            this.tcpSocket?.end();
        }, this.idleTimeout || 1000);
    }

    /** Dialog: the next packet, once the one before got its answer */
    private _pump() {
        if (this.mode !== SystemMode.Dialog || this.awaiting || !this.dialog.length) return;
        if (!this.connected) {
            this._connectTcp();
            return;
        }
        const next = this.dialog.shift()!;
        this.awaiting = true;
        this._write(next);
        if (this.dialogTimeout > 0) this.answerTimer = setTimeout(() => this._answered(), this.dialogTimeout);
    }

    /** Dialog: the answer in (or the Answer Timeout up) */
    private _answered() {
        clearTimeout(this.answerTimer);
        this.answerTimer = undefined;
        if (!this.awaiting) return;
        this.awaiting = false;
        this._pump();
    }

    // ──────────────────────────────────────────────────────────────
    // TCP Server (accept mode)
    // ──────────────────────────────────────────────────────────────

    private _startTcpServer() {
        this.tcpServer = net.createServer();
        const bindPort = this.localPort > 0 ? this.localPort : this.port;
        this.tcpServer.listen(bindPort, '0.0.0.0');

        this.tcpServer.on('connection', (clientSocket: ITcpSocket) => {
            // Max Connections (0: any number)
            if (this.maxConnections > 0 && this.tcpClients.length >= this.maxConnections) {
                clientSocket.destroy();
                return;
            }
            const remote = `${clientSocket.remoteAddress || '?'}:${clientSocket.remotePort || 0}`;
            this.connections.push(remote);
            const beat = new Heartbeat(this.heartbeat.mode, this.heartbeat.rx, this.heartbeat.tx, this.name,
                (s) => clientSocket.write(encodeText(s, this.textEncoding) as any), () => clientSocket.destroy());
            const client = { socket: clientSocket, buffer: '', text: new TextIn(this.textEncoding), beat };
            this.tcpClients.push(client);

            this._setJoinPair(true);
            this.cfApi.dispatchEvent(this.cfApi.ConnectionStatusChangeEvent, this.name, true, remote);
            beat.start();
            this._startup();

            clientSocket.on('data', (data: unknown) => {
                const str = client.text.decode(bytesOf(data));
                beat.hear(str);
                // this client's own buffer: requests from two clients don't mix
                this.buffer = client.buffer + str;
                try {
                    this._processBuffer();
                } finally {
                    client.buffer = this.buffer;
                    this.buffer = '';
                }
            });

            clientSocket.on('close', () => {
                beat.stop();
                this.connections = this.connections.filter(c => c !== remote);
                this.tcpClients = this.tcpClients.filter(c => c !== client);
                if (!this.tcpClients.length) this._setJoinPair(false);
                this.cfApi.dispatchEvent(this.cfApi.ConnectionStatusChangeEvent, this.name, false, remote);
            });

            clientSocket.on('error', (err: any) => {
                console.warn(`[System ${this.name}] client error:`, err?.message ?? err);
            });
        });

        this.tcpServer.on('error', (err: any) => {
            console.warn(`[System ${this.name}] server error:`, err?.message ?? err);
        });
    }

    // ──────────────────────────────────────────────────────────────
    // UDP
    // ──────────────────────────────────────────────────────────────

    /**
     * Its own port: the origin; 0 - the remote's port (as GUI Designer has
     * it), -1 any. Taken (another system on it): any.
     */
    private _startUdp(port = this.localPort > 0 ? this.localPort : this.localPort < 0 ? 0 : this.port) {
        // reuseAddr helps SSDP / reload when previous socket is slow to release
        const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true } as any);
        this.udpSocket = socket;
        let bound = false;

        socket.on('message', (msg: unknown) => {
            if (this.udpSocket !== socket) return;
            this.buffer += this.textIn.decode(bytesOf(msg));
            this._processBuffer();
        });

        socket.on('close', () => {
            if (this.udpSocket !== socket) return;
            this.udpSocket = undefined;
            this.connections = [];
            this._setJoinPair(false);
            this.cfApi.dispatchEvent(this.cfApi.ConnectionStatusChangeEvent, this.name, false, null);
        });

        socket.on('error', (err: any) => {
            if (!bound && port !== 0 && this.udpSocket === socket) {
                console.warn(`[System ${this.name}] UDP :${port} taken, another port:`, err?.message ?? err);
                this.udpSocket = undefined;
                try {
                    socket.close();
                } catch {
                    /* ignore */
                }
                this._startUdp(0);
                return;
            }
            console.warn(`[System ${this.name}] UDP error:`, err?.message ?? err);
        });

        socket.bind(port, '0.0.0.0', () => {
            if (this.udpSocket !== socket) return;
            bound = true;
            try {
                // Multicast SSDP etc. (e.g. 239.255.255.250)
                if (this._isMulticastAddress(this.address) && socket.addMembership) {
                    socket.addMembership(this.address);
                }
                // Accept Broadcast Messages; a broadcast address to send to
                if ((this.accept || this.acceptBroadcasts || /\.255$/.test(this.address)) && socket.setBroadcast) {
                    socket.setBroadcast(true);
                }
            } catch (e) {
                console.warn(`[System ${this.name}] UDP post-bind setup:`, e);
            }

            const remote = `${this.address}:${this.port}`;
            if (!this.connections.includes(remote)) this.connections.push(remote);
            this._setJoinPair(true);
            this.cfApi.dispatchEvent(this.cfApi.ConnectionStatusChangeEvent, this.name, true, remote);
            this._startup();
            const queued = this.sendQueue;
            this.sendQueue = [];
            for (const bytes of queued) this._transmit(bytes);
        });
    }

    private _isMulticastAddress(ip: string): boolean {
        const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
        if (!m) return false;
        const a = parseInt(m[1], 10);
        return a >= 224 && a <= 239;
    }

    // ──────────────────────────────────────────────────────────────
    // HTTP / HTTPS: a GET a command
    // ──────────────────────────────────────────────────────────────

    /** what a command sends an HTTP system: the URL's path (/transport?action=playpause), or a whole URL */
    public httpUrl(path: string): string {
        if (/^https?:\/\//i.test(path)) return path;
        const scheme = this.ssl ? 'https' : 'http';
        const port = this.port && this.port !== (this.ssl ? 443 : 80) ? `:${this.port}` : '';
        return `${scheme}://${this.address}${port}${path.startsWith('/') ? '' : '/'}${path}`;
    }

    /** a GET; the answer's body to the feedback (each message, split at the EOM) */
    private _httpGet(path: string) {
        const url = this.httpUrl(path);
        const answered = (body: Uint8Array | null) => {
            if (!this.enabled) return;
            const up = body !== null;
            if (up !== this.httpUp) {
                this.httpUp = up;
                this.connections = up ? [`${this.address}:${this.port}`] : [];
                this._setJoinPair(up);
                this.cfApi.dispatchEvent(this.cfApi.ConnectionStatusChangeEvent, this.name, up, up ? this.connections[0] : null);
            }
            if (!body) return;
            const text = new TextIn(this.textEncoding).decode(body);
            for (const message of this.eom ? text.split(this.eom) : [text]) {
                if (message) this._matchFeedbacks(message);
            }
        };
        if (getHost()?.http) {
            const req = http.get({ url, rejectUnauthorized: false }, (res: any) => {
                const chunks: Uint8Array[] = [];
                res.on('data', (c: unknown) => chunks.push(bytesOf(c)));
                res.on('end', () => {
                    const body = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
                    chunks.reduce((at, c) => (body.set(c, at), at + c.length), 0);
                    answered(body);
                });
            });
            req.on('error', (err: any) => {
                console.warn(`[System ${this.name}] GET ${url}:`, err?.message ?? err);
                answered(null);
            });
            return;
        }
        fetch(url).then((r) => r.arrayBuffer()).then(
            (b) => answered(new Uint8Array(b)),
            (err) => {
                console.warn(`[System ${this.name}] GET ${url}:`, err?.message ?? err);
                answered(null);
            },
        );
    }

    // ──────────────────────────────────────────────────────────────
    // Buffer processing → feedback matching
    // ──────────────────────────────────────────────────────────────

    /** the messages in the buffer (split at the EOM; without one, all of it) matched: how many */
    private _processBuffer(): number {
        if (!this.eom) {
            if (!this.buffer.length) return 0;
            const message = this.buffer;
            this.buffer = '';
            this._matchFeedbacks(message);
            return 1;
        }

        let n = 0;
        let eomIndex: number;
        while ((eomIndex = this.buffer.indexOf(this.eom)) !== -1) {
            const message = this.buffer.substring(0, eomIndex);
            this.buffer = this.buffer.substring(eomIndex + this.eom.length);
            this._matchFeedbacks(message);
            n++;
        }
        return n;
    }

    private _matchFeedbacks(message: string) {
        for (const fb of this.feedbackRules) {
            const regexStr = fb.attributes['regex'];
            if (!regexStr) continue;

            try {
                const match = this._execFeedbackRegex(regexStr, message);
                if (match) {
                    const fbName = fb.attributes['name'] || '';
                    // Dispatch includes system name for watch() filtering
                    this.cfApi.dispatchEvent(this.cfApi.FeedbackMatchedEvent, this.name, fbName, match[0]);

                    if (fb.children) {
                        // First pass: process <group> elements to calculate values and collect named tokens
                        const tokens: Record<string, string> = {};
                        for (const child of fb.children) {
                            if (child.type === 'group') {
                                const val = this._processFeedbackItem(child, match, tokens);
                                const groupName = child.attributes['name'];
                                if (groupName && val !== undefined) {
                                    tokens[groupName] = String(val);
                                }
                            }
                        }

                        // Second pass: process <onmatch> elements using the collected tokens
                        for (const child of fb.children) {
                            if (child.type === 'onmatch') {
                                this._processFeedbackItem(child, match, tokens);
                            }
                        }
                    }
                }
            } catch (e) {
                console.error(`[System ${this.name}] Invalid regex "${regexStr}":`, e);
            }
        }
    }

    /**
     * Run a CF GUI Designer feedback regex against one message (packet / EOM frame).
     *
     * CF Designer's inline-flag syntax is a *leading* modifier group — e.g.
     * `(?ims)lastpage=(.*)` (see real .gui feedback patterns). It must be
     * matched precisely: scanning loosely for "a paren group containing the
     * letter i/m anywhere" (the previous approach) false-positives on ordinary
     * non-capturing groups like `(?:info)` or `(?:room)`, silently changing
     * matching behaviour for patterns that were never meant to carry flags.
     *
     * CF designers also write patterns like `(.*)` or `(.*?)` expecting the
     * *entire* multi-line message (SSDP, HTTP-ish payloads). Two JS footguns
     * break that:
     *
     * 1. Without the `s` (dotAll) flag, `.` does not match `\n` — greedy `(.*)`
     *    only captures the first line. CF feedback data has no real notion of
     *    "lines", so dotAll is applied by default here.
     * 2. Non-greedy `(.*?)` matches the empty string at index 0 of ANY input
     *    (`/(.*?)/s.exec("HTTP...")[0] === ""`) in every PCRE-compatible regex
     *    engine, including ICU — that pattern is arguably a typo in whatever
     *    authored the .gui, but we still need to run existing/third-party
     *    projects as shipped. That is exactly UPnP_test.gui ANSWER_BCAST
     *    (`regex="(.*?)"`) → FeedbackMatched with "" → script crash.
     *
     * Catch-all patterns are therefore treated as "whole message matches".
     */
    private _execFeedbackRegex(regexStr: string, message: string): RegExpExecArray | null {
        // Only a pure-letters modifier group at the very start of the pattern
        // counts as CF inline flags — never a mid-pattern or non-capturing group.
        const flagMatch = regexStr.match(/^\(\?([a-zA-Z]+)\)/);
        const flagLetters = flagMatch ? flagMatch[1].toLowerCase() : '';
        const isCaseInsensitive = flagLetters.includes('i');
        const isMultilineAnchors = flagLetters.includes('m');
        const cleanRegex = flagMatch ? regexStr.slice(flagMatch[0].length) : regexStr;

        // Whole-message catch-alls used all over CF projects (UPnP, raw TCP, …)
        const catchAll =
            /^\(\.\*\??\)$/.test(cleanRegex) ||
            /^\.\*\??$/.test(cleanRegex) ||
            /^\(\[\\s\\S\]\*\??\)$/.test(cleanRegex);

        if (catchAll) {
            // Synthesize a match as if the pattern consumed the whole message.
            // Group 1 (if pattern had a capturing group) = full message too.
            const hasGroup = cleanRegex.startsWith('(');
            const arr = (hasGroup ? [message, message] : [message]) as unknown as RegExpExecArray;
            arr.index = 0;
            arr.input = message;
            arr.groups = undefined;
            return message.length === 0 ? null : arr;
        }

        let flags = 's'; // default dotAll — multi-line CF feedback packets
        if (isCaseInsensitive) flags += 'i';
        if (isMultilineAnchors) flags += 'm';

        const parser = new RegExp(cleanRegex, flags);
        const match = parser.exec(message);
        // If a non-catch-all pattern produces a zero-length match on non-empty
        // input, it is almost always non-greedy nonsense — treat as no match.
        if (match && match[0] === '' && message.length > 0) {
            return null;
        }
        return match;
    }

    private _processFeedbackItem(item: CFNode, match: RegExpExecArray, tokens: Record<string, string>) {
        // ── <onmatch> ───────────────────────────────────────────────
        // <onmatch target="d1" value="0" />          → setJoin("d1", 0)
        // <onmatch target="e0" cmd="Room1" />        → run command "Room1"
        // target already includes type prefix (d/a/s/e)
        if (item.type === 'onmatch') {
            const target     = item.attributes['target'];
            const literalVal = item.attributes['value'];
            const cmdName    = item.attributes['cmd'];

            if (target && literalVal !== undefined) {
                // Resolve substitution tokens from capture groups ($output$, etc.)
                let resolvedTarget = target;
                let resolvedVal    = literalVal;
                
                // Substitute by name: $ch$ -> match[index]
                for (const [tokenName, tokenValue] of Object.entries(tokens)) {
                    const regex = new RegExp(`\\$${tokenName}\\$`, 'g');
                    resolvedTarget = resolvedTarget.replace(regex, tokenValue);
                    if (typeof resolvedVal === 'string') {
                        resolvedVal = resolvedVal.replace(regex, tokenValue);
                    }
                }

                // Substitute by index: $1$ -> match[1]
                for (let i = 1; i < match.length; i++) {
                    const regex = new RegExp(`\\$${i}\\$`, 'g');
                    resolvedTarget = resolvedTarget.replace(regex, match[i] || '');
                    if (typeof resolvedVal === 'string') {
                        resolvedVal = resolvedVal.replace(regex, match[i] || '');
                    }
                }
                
                const numVal = resolvedVal === '0' ? 0
                    : (resolvedVal === '1' ? 1
                    : (isNaN(Number(resolvedVal)) ? resolvedVal : Number(resolvedVal)));
                this.cfApi.setJoin(resolvedTarget, numVal, true);
            }

            if (cmdName) {
                // Chained command — run via CF.runCommand
                (this.cfApi as any).runCommand('', cmdName);
            }
            return;
        }

        // ── <group> ─────────────────────────────────────────────────
        // <group index="1" datatype="a" target="s2" transform="..." />
        const index        = parseInt(item.attributes['index'] || '0', 10);
        const capturedValue = match[index] || '';

        const target   = item.attributes['target'];
        const datatype = item.attributes['datatype'];
        const unit     = item.attributes['unit'];

        let processedValue: string | number | boolean = capturedValue;

        if (datatype === 'a') {
            if (unit === 'hex' || unit === 'hexb') {
                processedValue = parseInt(capturedValue, 16);
                if (isNaN(processedValue as number)) processedValue = 0;
            } else {
                processedValue = parseFloat(capturedValue);
                if (isNaN(processedValue as number)) processedValue = 0;
            }

            const transform = item.attributes['transform'];
            if (transform && typeof processedValue === 'number') {
                const mathExpr = transform.replace(/value/g, processedValue.toString());
                try {
                    processedValue = new Function(`return ${mathExpr};`)() as number;
                } catch (_) {}
            }

            // Apply min/max scaling: maps [min, max] range to CommandFusion's 16-bit analog scale [0, 65535]
            const minAttr = item.attributes['min'];
            const maxAttr = item.attributes['max'];
            if (minAttr !== undefined && maxAttr !== undefined && typeof processedValue === 'number') {
                const min = parseFloat(minAttr);
                const max = parseFloat(maxAttr);
                if (!isNaN(min) && !isNaN(max) && max !== min) {
                    processedValue = ((processedValue - min) / (max - min)) * 65535;
                    processedValue = Math.round(Math.max(0, Math.min(65535, processedValue)));
                }
            }
        } else if (datatype === 'd') {
            const decOff = (item.attributes['offVal'] || '').replace(/\\x([0-9A-Fa-f]{2})/g, (_, h) =>
                String.fromCharCode(parseInt(h, 16))
            );
            const decOn = (item.attributes['onVal'] || '').replace(/\\x([0-9A-Fa-f]{2})/g, (_, h) =>
                String.fromCharCode(parseInt(h, 16))
            );
            if (decOn !== '' && capturedValue === decOn) processedValue = 1;
            else if (decOff !== '' && capturedValue === decOff) processedValue = 0;
            else return;
        }

        // settoken: store captured value in a named token for later use in subsequent onmatch
        const setToken = item.attributes['settoken'] === '1';

        if (target && datatype) {
            // GUI Designer writes targets already prefixed ("d1", "s10",
            // "l1:0:s2"); only bare numbers ("10") take the datatype prefix.
            const finalJoin = /^[adsl]/i.test(target) ? target : datatype + target;
            this.cfApi.setJoin(finalJoin, processedValue, true);
        }

        // Suppress unused-variable warning — setToken used for future token interpolation
        void setToken;

        return processedValue;
    }


    // ──────────────────────────────────────────────────────────────
    // Send
    // ──────────────────────────────────────────────────────────────

    /**
     * CF.send: straight out (never through the send handler) - a char a byte
     * (CF.BINARY, the default) or UTF-8 (CF.UTF8).
     */
    public send(data: string, outputFormat?: number) {
        if (this.isLoopback) return this._loop(data);
        if (this.type === 'http') return this._httpGet(data);
        const utf8 = outputFormat === 1 || (outputFormat as unknown) === 'UTF8';
        this._transmit(utf8 ? new TextEncoder().encode(data) : charBytes(data));
    }

    /**
     * What a command sends here: to the Javascript Send Handler if there is
     * one (its code run with `system` and `data`; it CF.send()s, or not),
     * else out in the system's text encoding.
     */
    public deliver(data: string) {
        if (this.sendHandler) {
            try {
                new Function('system', 'data', this.sendHandler).call(globalThis, this.name, data);
            } catch (e) {
                console.error(`[System ${this.name}] send handler:`, e);
            }
            return;
        }
        if (this.isLoopback) return this._loop(data);
        if (this.type === 'http') return this._httpGet(data);
        this._transmit(encodeText(data, this.textEncoding));
    }

    /** Loopback: what's sent comes back in, to the feedback (no socket, works offline) */
    private _loop(data: string) {
        // the EOM after it, so _processBuffer splits it off
        this.buffer += data + this.eom;
        this._processBuffer();
    }

    private _transmit(bytes: Uint8Array) {
        if (this.udpSocket) {
            this.udpSocket.send(bytes, 0, bytes.length, this.port, this.address);
            return;
        }
        if (this.tcpServer) {
            for (const { socket } of this.tcpClients) {
                try {
                    socket.write(bytes as any);
                } catch (e) {
                    console.warn(`[System ${this.name}] write to client failed:`, e);
                }
            }
            return;
        }
        if (this.type === 'udp' || this.accept) {
            // not bound / listening (stopped, asleep)
            if (this.offlineQueue) this.sendQueue.push(bytes);
            return;
        }
        if (this.mode === SystemMode.Dialog) {
            this.dialog.push(bytes);
            this._pump();
            return;
        }
        if (this.connected) {
            this._write(bytes);
            return;
        }
        if (this.mode === SystemMode.Transitory) {
            // connected for it, sent once it is
            this.sendQueue.push(bytes);
            this._connectTcp();
            return;
        }
        if (this.offlineQueue) {
            this.sendQueue.push(bytes);
        } else {
            console.warn(`[System ${this.name}] not connected: not sent`);
        }
    }

    // ──────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────

    /** the Connected join high and the Disconnected one low, or the other way round */
    private _setJoinPair(isConnected: boolean) {
        // CF.setSystemProperties gives them as join strings ("d100")
        const connect = String(this.connectJoin || '').replace(/^d/i, '');
        const disconnect = String(this.disconnectJoin || '').replace(/^d/i, '');
        if (connect && connect !== '0') this.cfApi.setJoin('d' + connect, isConnected ? 1 : 0, true);
        if (disconnect && disconnect !== '0') this.cfApi.setJoin('d' + disconnect, isConnected ? 0 : 1, true);
    }
}
