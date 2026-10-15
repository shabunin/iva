import { net, type ITcpSocket, type IUdpSocket, type ITcpServer } from '../stdlib/net';
import { dgram } from '../stdlib/dgram';
import { CFAPI } from './cf';
import { CFNode } from './parser';

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

export class ControlSystem {
    public name: string;
    public type: string;           // 'tcp' | 'udp' | 'http' | 'cf'
    public address: string;
    public port: number;
    public localPort: number;
    public enabled: boolean;
    public connectJoin: string;    // raw number string ("100") or "0"/"" for none
    public disconnectJoin: string;
    public connections: string[] = [];
    public eom: string;
    public offlineQueue: boolean;

    /** True if this system accepts incoming connections (TCP server mode) */
    public accept: boolean;

    private tcpSocket?: ITcpSocket;
    private udpSocket?: IUdpSocket;
    private tcpServer?: ITcpServer;
    /**
     * The clients connected to the TCP server, each with what it sent that no
     * feedback matched yet. What the system sends goes to every one of them
     * (CF.send: "the string will be sent to each connected system").
     */
    private tcpClients: { socket: ITcpSocket; buffer: string }[] = [];
    private cfApi: CFAPI;
    public feedbackRules: CFNode[];
    private autoReconnect: boolean;
    private buffer: string = '';

    // Offline send queue
    private sendQueue: Array<{ data: string; outputFormat?: number }> = [];

    // Heartbeat
    private heartbeatRx: string;
    private heartbeatTx: string;
    private heartbeatMode: number;
    private heartbeatTimer?: ReturnType<typeof setInterval>;
    private heartbeatMissed = 0;

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
        // Protocol: tcp | udp | http | https | cf
        this.type = (a['protocol'] || a['type'] || 'tcp').toLowerCase();
        // Normalize http/https → 'http'
        if (this.type === 'https') this.type = 'http';

        this.address = a['ip'] || a['address'] || a['host'] || '127.0.0.1';
        this.port = parseInt(a['port'] || '0', 10);
        // 'origin' = source/local port in CF GUI
        this.localPort = parseInt(a['origin'] || a['localPort'] || a['srcPort'] || '0', 10);
        this.eom = a['eom'] || '';
        this.autoReconnect = a['alwayson'] !== '0';
        this.offlineQueue = a['offlinequeue'] === '1';
        this.enabled = true;
        this.accept = a['accept'] === '1';

        // Join numbers: "0" means no join assigned
        const rawConnect = a['connectionStatus'] || a['connectJoin'] || a['connect'] || '0';
        const rawDisconnect = a['disconnectionStatus'] || a['disconnectJoin'] || a['disconnect'] || '0';
        this.connectJoin = (rawConnect !== '0' && rawConnect !== '') ? rawConnect : '';
        this.disconnectJoin = (rawDisconnect !== '0' && rawDisconnect !== '') ? rawDisconnect : '';

        // Heartbeat config
        this.heartbeatRx = a['heartbeatRx'] || '';
        this.heartbeatTx = a['heartbeatTx'] || '';
        this.heartbeatMode = parseInt(a['heartbeatMode'] || '-1', 10);

        // Startup command / macro
        this.startupCmd = a['startupCmd'] || '';
        this.startupMacro = a['startupMacro'] || '';

        // Detect loopback: ip=127.0.0.1 OR name contains "loopback" (case-insensitive)
        this.isLoopback = (
            this.address === '127.0.0.1' ||
            this.address === 'localhost' ||
            this.name.toLowerCase().includes('loopback')
        );

        // Decode hex sequences in EOM
        try {
            this.eom = this.eom.replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) =>
                String.fromCharCode(parseInt(hex, 16))
            );
        } catch (_) {}

        // Feedback rules are <fb> children of the system node
        this.feedbackRules = node.children.filter(c => c.type === 'fb');
    }

    // ──────────────────────────────────────────────────────────────
    // Lifecycle
    // ──────────────────────────────────────────────────────────────

    public start() {
        if (!this.enabled) return;
        if (this.type === 'http') return; // HTTP: no persistent connection

        if (this.isLoopback) {
            this._startLoopback();
            return;
        }

        // Protocol wins over accept: UDP systems with accept=1 are still UDP
        // (bind localPort / join multicast). accept=1 only means TCP *listen*
        // for tcp/cf systems — never open a TCP server for protocol="udp".
        if (this.type === 'udp') {
            this._startUdp();
        } else if (this.accept) {
            this._startTcpServer();
        } else {
            // tcp or cf client
            this._connectTcp();
        }
    }

    public stop() {
        this.enabled = false;
        this.autoReconnect = false;
        this._stopHeartbeat();

        if (this.isLoopback) {
            const remote = `${this.address}:${this.port}`;
            this.connections = this.connections.filter(c => c !== remote);
            this._setJoinPair(this.connectJoin, false);
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
        }
        if (this.udpSocket) {
            try {
                // drop multicast before close when possible
                if (this._isMulticastAddress(this.address) && this.udpSocket.dropMembership) {
                    try {
                        this.udpSocket.dropMembership(this.address);
                    } catch {
                        /* ignore */
                    }
                }
                this.udpSocket.close();
            } catch (e) {
                console.warn(`[System ${this.name}] udp close:`, e);
            }
            this.udpSocket = undefined;
        }
        if (this.tcpServer) {
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

        this._setJoinPair(this.connectJoin, true);

        // Dispatch connected immediately — loopback is always available
        this.cfApi.dispatchEvent(this.cfApi.ConnectionStatusChangeEvent, this.name, true, remote);

        console.log(`[System ${this.name}] Loopback ready (in-process, no socket)`);

        // Execute startup command / macro
        if (this.startupCmd) {
            // Use setTimeout(0) so scripts registered in userMain() are ready
            setTimeout(() => {
                this._runStartupCmd(this.startupCmd);
            }, 0);
        }
        if (this.startupMacro) {
            setTimeout(() => {
                // runMacroByName is in module scope
                runMacroByName(this.cfApi, this.startupMacro);
            }, 0);
        }
    }

    // ──────────────────────────────────────────────────────────────
    // TCP Client
    // ──────────────────────────────────────────────────────────────

    private _connectTcp() {
        if (this.tcpSocket && !this.tcpSocket.destroyed) return;

        const socket = new net.Socket();
        this.tcpSocket = socket;
        socket.connect(this.port, this.address);

        socket.on('connect', () => {
            const remote = `${this.address}:${this.port}`;
            if (!this.connections.includes(remote)) this.connections.push(remote);

            this._setJoinPair(this.connectJoin, true);

            this.cfApi.dispatchEvent(this.cfApi.ConnectionStatusChangeEvent, this.name, true, remote);

            this._startHeartbeat();

            // Flush offline queue
            if (this.offlineQueue && this.sendQueue.length > 0) {
                for (const item of this.sendQueue) {
                    this._writeToSocket(item.data, item.outputFormat);
                }
                this.sendQueue = [];
            }
        });

        socket.on('data', (data: Uint8Array | string) => {
            const str = typeof data === 'string' ? data : new TextDecoder('utf-8').decode(data);
            this.buffer += str;
            this._onHeartbeatRx(str);
            this._processBuffer();
        });

        socket.on('close', () => {
            const remote = `${this.address}:${this.port}`;
            this.connections = this.connections.filter(c => c !== remote);

            this._setJoinPair(this.connectJoin, false);
            this._stopHeartbeat();

            this.cfApi.dispatchEvent(this.cfApi.ConnectionStatusChangeEvent, this.name, false, remote);

            if (this.enabled && this.autoReconnect) {
                setTimeout(() => this._connectTcp(), 3000);
            }
        });

        socket.on('error', (err: any) => {
            console.warn(`[System ${this.name}] TCP error:`, err);
        });
    }

    // ──────────────────────────────────────────────────────────────
    // TCP Server (accept mode)
    // ──────────────────────────────────────────────────────────────

    private _startTcpServer() {
        this.tcpServer = net.createServer();
        const bindPort = this.localPort > 0 ? this.localPort : this.port;
        this.tcpServer.listen(bindPort, '0.0.0.0');

        this.tcpServer.on('connection', (clientSocket: ITcpSocket) => {
            const remote = `${clientSocket.remoteAddress || '?'}:${clientSocket.remotePort || 0}`;
            this.connections.push(remote);
            const client = { socket: clientSocket, buffer: '' };
            this.tcpClients.push(client);

            this.cfApi.dispatchEvent(this.cfApi.ConnectionStatusChangeEvent, this.name, true, remote);

            clientSocket.on('data', (data: Uint8Array | string) => {
                // this client's own buffer: requests from two clients don't mix
                this.buffer = client.buffer + this._bytesToString(data);
                try {
                    this._processBuffer();
                } finally {
                    client.buffer = this.buffer;
                    this.buffer = '';
                }
            });

            clientSocket.on('close', () => {
                this.connections = this.connections.filter(c => c !== remote);
                this.tcpClients = this.tcpClients.filter(c => c !== client);
                this.cfApi.dispatchEvent(this.cfApi.ConnectionStatusChangeEvent, this.name, false, remote);
            });

            clientSocket.on('error', (err: any) => {
                console.warn(`[System ${this.name}] client error:`, err);
            });
        });

        this.tcpServer.on('error', (err: any) => {
            console.warn(`[System ${this.name}] server error:`, err);
        });
    }

    // ──────────────────────────────────────────────────────────────
    // UDP
    // ──────────────────────────────────────────────────────────────

    private _startUdp() {
        // reuseAddr helps SSDP / reload when previous socket is slow to release
        this.udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true } as any);
        const bindPort = this.localPort > 0 ? this.localPort : 0;

        this.udpSocket.on('message', (msg: Uint8Array | string, rinfo: any) => {
            // Prefer binary/latin1 decode: each byte → char (CF BINARY style).
            // UTF-8 is wrong for raw SSDP/control if we ever get non-ASCII; ASCII SSDP
            // is fine either way. Using latin1 avoids TextDecoder edge cases on views.
            const str = this._bytesToString(msg);
            this.buffer += str;
            this._processBuffer();
        });

        this.udpSocket.on('close', () => {
            this.connections = [];
            this.cfApi.dispatchEvent(this.cfApi.ConnectionStatusChangeEvent, this.name, false, null);
        });

        this.udpSocket.on('error', (err: any) => {
            console.warn(`[System ${this.name}] UDP error:`, err);
        });

        this.udpSocket.bind(bindPort, '0.0.0.0', () => {
            try {
                // Multicast SSDP etc. (e.g. 239.255.255.250)
                if (this._isMulticastAddress(this.address) && this.udpSocket?.addMembership) {
                    this.udpSocket.addMembership(this.address);
                    console.log(
                        `[System ${this.name}] UDP bound :${bindPort || 'ephemeral'}, joined multicast ${this.address}`
                    );
                } else {
                    console.log(`[System ${this.name}] UDP bound :${bindPort || 'ephemeral'}`);
                }
                if (this.accept && this.udpSocket?.setBroadcast) {
                    // acceptBroadcasts-style systems often need broadcast
                    this.udpSocket.setBroadcast(true);
                }
            } catch (e) {
                console.warn(`[System ${this.name}] UDP post-bind setup:`, e);
            }

            const remote = `${this.address}:${this.port}`;
            if (!this.connections.includes(remote)) this.connections.push(remote);

            this.cfApi.dispatchEvent(this.cfApi.ConnectionStatusChangeEvent, this.name, true, remote);
        });
    }

    private _isMulticastAddress(ip: string): boolean {
        const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
        if (!m) return false;
        const a = parseInt(m[1], 10);
        return a >= 224 && a <= 239;
    }

    /** Decode socket payload to a JS string for feedback matching. */
    private _bytesToString(msg: unknown): string {
        if (typeof msg === 'string') return msg;
        let u8: Uint8Array;
        if (msg instanceof Uint8Array) {
            u8 = msg;
        } else if (ArrayBuffer.isView(msg)) {
            const v = msg as ArrayBufferView;
            u8 = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
        } else if (Array.isArray(msg)) {
            u8 = Uint8Array.from(msg as number[]);
        } else if (msg && typeof msg === 'object' && typeof (msg as any).length === 'number') {
            u8 = Uint8Array.from(msg as ArrayLike<number>);
        } else {
            console.warn(`[System ${this.name}] unexpected message type:`, typeof msg, msg);
            return '';
        }
        // Latin-1: 1:1 byte↔char (matches CF BINARY semantics for regex matching)
        let s = '';
        for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
        return s;
    }

    // ──────────────────────────────────────────────────────────────
    // Heartbeat
    // ──────────────────────────────────────────────────────────────

    private _startHeartbeat() {
        if (this.heartbeatMode <= 0 || !this.heartbeatTx) return;
        this._stopHeartbeat();
        this.heartbeatMissed = 0;
        this.heartbeatTimer = setInterval(() => {
            this.heartbeatMissed++;
            if (this.heartbeatMode > 0 && this.heartbeatMissed > 3) {
                console.warn(`[System ${this.name}] Heartbeat timeout — reconnecting`);
                this._stopHeartbeat();
                this.tcpSocket?.destroy();
                return;
            }
            this._writeToSocket(this.heartbeatTx);
        }, this.heartbeatMode * 1000);
    }

    private _stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = undefined;
        }
    }

    private _onHeartbeatRx(data: string) {
        if (this.heartbeatRx && data.includes(this.heartbeatRx)) {
            this.heartbeatMissed = 0;
        }
    }

    // ──────────────────────────────────────────────────────────────
    // Buffer processing → feedback matching
    // ──────────────────────────────────────────────────────────────

    private _processBuffer() {
        if (!this.eom) {
            if (this.buffer.length > 0) {
                this._matchFeedbacks(this.buffer);
                this.buffer = '';
            }
            return;
        }

        let eomIndex: number;
        while ((eomIndex = this.buffer.indexOf(this.eom)) !== -1) {
            const message = this.buffer.substring(0, eomIndex);
            this.buffer = this.buffer.substring(eomIndex + this.eom.length);
            this._matchFeedbacks(message);
        }
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

    public send(data: string, outputFormat?: number) {
        // Loopback: feed data directly back into the feedback matching engine
        // (no socket, works completely offline)
        if (this.isLoopback) {
            if (this.eom) {
                // Append EOM so _processBuffer splits correctly
                this.buffer += data + this.eom;
            } else {
                this.buffer += data;
            }
            this._processBuffer();
            return;
        }

        const isConnected =
            (this.tcpSocket && !this.tcpSocket.destroyed) ||
            (this.udpSocket !== undefined) ||
            (this.tcpServer !== undefined);

        if (!isConnected) {
            if (this.offlineQueue) {
                this.sendQueue.push({ data, outputFormat });
                console.log(`[System ${this.name}] Offline — queued: "${data}"`);
            } else {
                console.warn(`[System ${this.name}] Cannot send — not connected. data="${data}"`);
            }
            return;
        }

        this._writeToSocket(data, outputFormat);
    }

    private _writeToSocket(data: string, outputFormat?: number) {
        // CF.UTF8 = 1, CF.BINARY = 0 (default); scripts pass the CF.UTF8 constant too
        const UTF8_FORMAT = 1;
        let payload: string | Uint8Array;

        if (outputFormat === UTF8_FORMAT || (outputFormat as unknown) === 'UTF8') {
            payload = new TextEncoder().encode(data);
        } else {
            // BINARY: each char → byte (strip to 0xFF)
            const bytes = new Uint8Array(data.length);
            for (let i = 0; i < data.length; i++) {
                bytes[i] = data.charCodeAt(i) & 0xFF;
            }
            payload = bytes;
        }

        if (this.udpSocket) {
            const buf = typeof payload === 'string'
                ? new TextEncoder().encode(payload)
                : payload;
            this.udpSocket.send(buf, 0, buf.length, this.port, this.address);
        } else if (this.tcpSocket) {
            this.tcpSocket.write(payload as any);
        } else if (this.tcpServer) {
            for (const { socket } of this.tcpClients) {
                try {
                    socket.write(payload as any);
                } catch (e) {
                    console.warn(`[System ${this.name}] write to client failed:`, e);
                }
            }
        }
    }

    // ──────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────

    private _setJoinPair(joinNum: string, isConnected: boolean) {
        if (!joinNum || joinNum === '0') return;
        // connectJoin goes HIGH on connect, LOW on disconnect
        this.cfApi.setJoin('d' + joinNum, isConnected ? 1 : 0, true);
        // disconnectJoin is the inverse
        if (this.disconnectJoin && this.disconnectJoin !== '0') {
            this.cfApi.setJoin('d' + this.disconnectJoin, isConnected ? 0 : 1, true);
        }
    }

    /**
     * Execute a startup command by name.
     * Startup commands can be JS-only (jsSendsCommand="True"), text commands
     * or both. Looks up the command in the system node's <cmd> children first,
     * then falls back to the global project.commands dict.
     */
    private _runStartupCmd(cmdName: string) {
        if (!cmdName) return;

        // Try system-local command first
        const api = this.cfApi as any;
        const systemNodes: any[] = api.renderer?.project?.systems || [];
        let cmdNode: any = null;

        for (const sysNode of systemNodes) {
            if (sysNode.attributes?.name === this.name || sysNode.name === this.name) {
                cmdNode = sysNode.children?.find(
                    (c: any) => c.type === 'cmd' && (c.attributes?.name === cmdName || c.name === cmdName)
                );
                if (cmdNode) break;
            }
        }

        // Fallback: global commands dict
        if (!cmdNode) {
            cmdNode = api.renderer?.project?.commands?.[cmdName];
        }

        if (!cmdNode) {
            console.warn(`[System ${this.name}] startupCmd "${cmdName}" not found`);
            return;
        }

        // Run JS portion
        if (cmdNode.js) {
            try {
                const fn = new Function('data', `try { ${cmdNode.js} } catch(e) { console.error(e); }`);
                fn.call(window, '');
            } catch (e) {
                console.error(`[System ${this.name}] Error in startupCmd JS:`, e);
            }
            if (cmdNode.attributes?.jsSendsCommand === 'True') return;
        }

        // Send text payload through loopback (triggers feedback matching)
        const rawText = cmdNode.text || '';
        if (rawText) {
            let msg = rawText;
            msg = msg.replace(/\\x([0-9A-Fa-f]{2})/g, (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16)));
            this.send(msg);
        }
    }
}
