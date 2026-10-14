import { invoke } from '../bridge/tauri-core';
import { listen, UnlistenFn } from '../bridge/tauri-event';
import { fetch as tauriFetch, type Proxy as HttpProxyConfig } from '../bridge/tauri-plugin-http';
import { EventEmitter } from '../../stdlib/events';
import { mapHostError } from '../../stdlib/errors';
import { AgapiWebSocket } from './websocket';

export type { Proxy as HttpProxyConfig } from '../bridge/tauri-plugin-http';
export { AgapiWebSocket as WebSocket } from './websocket';

export interface HttpRequestEvent {
    id: string;
    port: number;
    method: string;
    url: string;
    headers: Record<string, string>;
    body: number[];
}

export interface HttpResponsePayload {
    id: string;
    status: number;
    headers: Record<string, string>;
    body: number[];
}

export interface RequestOptions {
    method?: string;
    url?: string;
    hostname?: string;
    port?: number;
    path?: string;
    headers?: Record<string, string>;
    /**
     * TLS: when `false` (default for local gear), accept invalid cert + hostname.
     * When `true`, verify certificate and hostname. Maps to `ClientOptions.danger`.
     */
    rejectUnauthorized?: boolean;
    /** Alias: `insecure: true` → `rejectUnauthorized: false` */
    insecure?: boolean;
    /** Connect-phase timeout in ms. Maps to `ClientOptions.connectTimeout`. */
    connectTimeout?: number;
    /** Maps to `ClientOptions.maxRedirections` (0 disables redirects). */
    maxRedirections?: number;
    /** Maps to `ClientOptions.proxy`. */
    proxy?: HttpProxyConfig;
}

export class IncomingMessage extends EventEmitter {
    public method: string;
    public url: string;
    public headers: Record<string, string>;
    private body: Uint8Array;

    constructor(event: HttpRequestEvent) {
        super();
        this.method = event.method;
        this.url = event.url;
        this.headers = event.headers;
        this.body = new Uint8Array(event.body);
    }

    // Node.js compat for reading stream
    on(event: string, listener: (...args: any[]) => void): this {
        super.on(event, listener);
        if (event === 'data') {
            // Emulate stream by sending the whole chunk on next tick
            setTimeout(() => {
                this.emit('data', this.body);
                this.emit('end');
            }, 0);
        }
        return this;
    }
}

export class ServerResponse extends EventEmitter {
    private requestId: string;
    public statusCode: number = 200;
    private headers: Record<string, string> = {};
    private chunks: Uint8Array[] = [];
    private finished: boolean = false;

    constructor(requestId: string) {
        super();
        this.requestId = requestId;
    }

    writeHead(statusCode: number, headers?: Record<string, string>) {
        this.statusCode = statusCode;
        if (headers) {
            Object.assign(this.headers, headers);
        }
        return this;
    }

    setHeader(name: string, value: string) {
        this.headers[name] = value;
        return this;
    }

    getHeader(name: string): string | undefined {
        return this.headers[name];
    }

    write(chunk: Uint8Array | string | number[]) {
        if (typeof chunk === 'string') {
            const encoder = new TextEncoder();
            this.chunks.push(encoder.encode(chunk));
        } else if (chunk instanceof Uint8Array) {
            this.chunks.push(chunk);
        } else if (Array.isArray(chunk)) {
            this.chunks.push(new Uint8Array(chunk));
        }
        return true;
    }

    end(chunk?: Uint8Array | string | number[]) {
        if (this.finished) return;
        this.finished = true;
        if (chunk) {
            this.write(chunk);
        }

        const totalLength = this.chunks.reduce((acc, c) => acc + c.length, 0);
        const finalBody = new Uint8Array(totalLength);
        let offset = 0;
        for (const c of this.chunks) {
            finalBody.set(c, offset);
            offset += c.length;
        }

        invoke('http_server_respond', {
            args: {
                id: this.requestId,
                status: this.statusCode,
                headers: this.headers,
                body: Array.from(finalBody)
            }
        }).catch(err => console.error("Failed to send HTTP response to Rust", err));
    }
}

export class Server extends EventEmitter {
    private port: number | null = null;
    private unlisten: UnlistenFn | null = null;
    private requestListener?: (req: IncomingMessage, res: ServerResponse) => void;

    constructor(requestListener?: (req: IncomingMessage, res: ServerResponse) => void) {
        super();
        if (requestListener) {
            this.requestListener = requestListener;
            this.on('request', requestListener);
        }
    }

    public async listen(port: number, callback?: () => void) {
        try {
            await invoke('http_server_listen', { port });
            this.port = port;
            
            this.unlisten = await listen<HttpRequestEvent>('plugin:http:request', (event) => {
                if (event.payload.port === this.port) {
                    const req = new IncomingMessage(event.payload);
                    const res = new ServerResponse(event.payload.id);
                    this.emit('request', req, res);
                }
            });

            if (callback) callback();
            this.emit('listening');
        } catch (error) {
            this.emit('error', mapHostError(error, { syscall: 'listen', port }));
        }
    }

    public async close(callback?: () => void) {
        if (this.port) {
            try {
                await invoke('http_server_close', { port: this.port });
                if (this.unlisten) {
                    this.unlisten();
                    this.unlisten = null;
                }
                this.port = null;
                this.emit('close');
                if (callback) callback();
            } catch (error) {
                this.emit('error', mapHostError(error, { syscall: 'close', port: this.port ?? undefined }));
                if (callback) callback();
            }
        } else {
            if (callback) callback();
        }
    }
}

export class ClientRequest extends EventEmitter {
    private options: RequestOptions;
    private chunks: Uint8Array[] = [];
    private finished: boolean = false;

    constructor(options: RequestOptions, private callback?: (res: IncomingMessage) => void) {
        super();
        this.options = options;
    }

    write(chunk: Uint8Array | string | number[]) {
        if (typeof chunk === 'string') {
            const encoder = new TextEncoder();
            this.chunks.push(encoder.encode(chunk));
        } else if (chunk instanceof Uint8Array) {
            this.chunks.push(chunk);
        } else if (Array.isArray(chunk)) {
            this.chunks.push(new Uint8Array(chunk));
        }
        return true;
    }

    end(chunk?: Uint8Array | string | number[]) {
        if (this.finished) return;
        this.finished = true;
        if (chunk) {
            this.write(chunk);
        }

        const totalLength = this.chunks.reduce((acc, c) => acc + c.length, 0);
        const finalBody = new Uint8Array(totalLength);
        let offset = 0;
        for (const c of this.chunks) {
            finalBody.set(c, offset);
            offset += c.length;
        }

        let url = this.options.url || '';
        if (!url) {
            const protocol = 'http:';
            const hostname = this.options.hostname || 'localhost';
            const port = this.options.port ? `:${this.options.port}` : '';
            const path = this.options.path || '/';
            url = `${protocol}//${hostname}${port}${path}`;
        }

        // TLS: default rejectUnauthorized false (local/self-signed gear).
        let rejectUnauthorized = this.options.rejectUnauthorized;
        if (this.options.insecure === true) {
            rejectUnauthorized = false;
        }
        if (rejectUnauthorized === undefined) {
            rejectUnauthorized = false;
        }

        tauriFetch(url, {
            method: this.options.method || 'GET',
            headers: this.options.headers || {},
            body: totalLength > 0 ? finalBody : undefined,
            danger: {
                acceptInvalidCerts: !rejectUnauthorized,
                acceptInvalidHostnames: !rejectUnauthorized,
            },
            connectTimeout: this.options.connectTimeout,
            maxRedirections: this.options.maxRedirections,
            proxy: this.options.proxy,
        } as RequestInit).then(async (response) => {
            const headers: Record<string, string> = {};
            response.headers.forEach((v, k) => {
                headers[k] = v;
            });
            const body = Array.from(new Uint8Array(await response.arrayBuffer()));

            const incoming = new IncomingMessage({
                id: '',
                port: 0,
                method: '',
                url: '',
                headers,
                body
            });
            // We use IncomingMessage, but we also want a statusCode in Node compat
            (incoming as any).statusCode = response.status;
            (incoming as any).statusMessage = response.statusText;

            if (this.callback) {
                this.callback(incoming);
            }
            this.emit('response', incoming);
        }).catch((err) => {
            this.emit('error', mapHostError(err, { syscall: 'request', address: url }));
        });
    }
}

export class WebSocketConnection extends EventEmitter {
    public id: string;
    public url: string;
    public headers: Record<string, string>;
    private open: boolean = true;

    constructor(id: string, url: string, headers: Record<string, string>) {
        super();
        this.id = id;
        this.url = url;
        this.headers = headers;
    }

    send(data: string | Uint8Array | number[]) {
        if (!this.open) {
            this.emit('error', new Error('Connection is closed'));
            return;
        }
        let isBinary = false;
        let textData: string | null = null;
        let binaryData: number[] | null = null;

        if (typeof data === 'string') {
            textData = data;
        } else if (data instanceof Uint8Array) {
            isBinary = true;
            binaryData = Array.from(data);
        } else if (Array.isArray(data)) {
            isBinary = true;
            binaryData = data;
        }

        invoke('ws_send_message', {
            connectionId: this.id,
            messageType: isBinary ? 'binary' : 'text',
            textData,
            binaryData
        }).catch(err => {
            this.emit('error', new Error(String(err)));
        });
    }

    close() {
        if (!this.open) return;
        this.open = false;
        invoke('ws_close_connection', { connectionId: this.id })
            .catch(err => this.emit('error', new Error(String(err))));
    }

    _handleClose() {
        if (!this.open) return;
        this.open = false;
        this.emit('close');
    }
}

export class WebSocketServer extends EventEmitter {
    private port: number;
    private connections = new Map<string, WebSocketConnection>();
    private unlistenConn: UnlistenFn | null = null;
    private unlistenMsg: UnlistenFn | null = null;
    private unlistenClose: UnlistenFn | null = null;

    constructor(options: { port: number }) {
        super();
        this.port = options.port;
        this.init();
    }

    private async init() {
        try {
            // Try starting HTTP server on this port (if not already started)
            await invoke('http_server_listen', { port: this.port }).catch(err => {
                if (!String(err).includes('already listening')) {
                    throw err;
                }
            });

            // Listen for connections
            this.unlistenConn = await listen<{
                connectionId: string;
                port: number;
                url: string;
                headers: Record<string, string>;
            }>('plugin:ws:connection', (event) => {
                if (event.payload.port === this.port) {
                    const conn = new WebSocketConnection(
                        event.payload.connectionId,
                        event.payload.url,
                        event.payload.headers
                    );
                    this.connections.set(conn.id, conn);
                    this.emit('connection', conn);
                }
            });

            // Listen for messages
            this.unlistenMsg = await listen<{
                connectionId: string;
                type: 'text' | 'binary';
                data?: string;
                binary?: number[];
            }>('plugin:ws:message', (event) => {
                const conn = this.connections.get(event.payload.connectionId);
                if (conn) {
                    if (event.payload.type === 'text') {
                        conn.emit('message', event.payload.data);
                    } else if (event.payload.type === 'binary' && event.payload.binary) {
                        conn.emit('message', new Uint8Array(event.payload.binary));
                    }
                }
            });

            // Listen for closes
            this.unlistenClose = await listen<{ connectionId: string }>('plugin:ws:close', (event) => {
                const conn = this.connections.get(event.payload.connectionId);
                if (conn) {
                    this.connections.delete(conn.id);
                    conn._handleClose();
                }
            });

            this.emit('listening');
        } catch (error) {
            this.emit('error', new Error(String(error)));
        }
    }

    public async close(callback?: () => void) {
        if (this.unlistenConn) this.unlistenConn();
        if (this.unlistenMsg) this.unlistenMsg();
        if (this.unlistenClose) this.unlistenClose();

        for (const conn of this.connections.values()) {
            conn.close();
        }
        this.connections.clear();

        try {
            await invoke('http_server_close', { port: this.port });
        } catch (e) {
            // Ignore if port already closed
        }

        this.emit('close');
        if (callback) callback();
    }
}

export function createServer(requestListener?: (req: IncomingMessage, res: ServerResponse) => void): Server {
    return new Server(requestListener);
}

export function request(options: string | RequestOptions, callback?: (res: IncomingMessage) => void): ClientRequest {
    if (typeof options === 'string') {
        options = { url: options };
    }
    const req = new ClientRequest(options, callback);
    // Node.js behavior: auto-end if it's GET or HEAD and no body is expected?
    // Not doing auto-end, the user is supposed to call req.end().
    return req;
}

export function get(options: string | RequestOptions, callback?: (res: IncomingMessage) => void): ClientRequest {
    const opts = typeof options === 'string' ? { url: options } : options;
    opts.method = 'GET';
    const req = request(opts, callback);
    req.end();
    return req;
}

export default {
    createServer,
    request,
    get,
    Server,
    IncomingMessage,
    ServerResponse,
    ClientRequest,
    WebSocketServer,
    WebSocketConnection,
    WebSocket: AgapiWebSocket
};
