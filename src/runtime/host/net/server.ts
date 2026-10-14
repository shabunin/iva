import { EventEmitter, ITcpServer } from '../../stdlib/net';
import { mapHostError } from '../../stdlib/errors';
import { invoke } from '../bridge/tauri-core';
import { listen, UnlistenFn } from '../bridge/tauri-event';
import { TauriTcpSocket } from './socket';
import type { NetEventPayload } from '../../stdlib/net';

export const activeServers = new Map<string, TauriTcpServer>();

let globalServerListenerPromise: Promise<UnlistenFn> | null = null;

export function ensureGlobalServerListener() {
    if (globalServerListenerPromise) return;
    globalServerListenerPromise = listen<NetEventPayload>('plugin:net:tcpserver', (event) => {
        const server = activeServers.get(event.payload.id);
        if (server) {
            server.handleServerEvent(event.payload);
        }
    });
}

interface TcpListenResult {
    id: string;
    local_address: string;
    local_port: number;
    family: string;
}

export class TauriTcpServer extends EventEmitter implements ITcpServer {
    public listening: boolean = false;
    public maxConnections: number = Infinity;
    public dropMaxConnection: boolean = false;

    private serverId: string | null = null;
    private activeConnections: Set<TauriTcpSocket> = new Set();
    private isClosing: boolean = false;
    private closeCallback: ((err?: Error) => void) | null = null;
    private isServerClosedReceived: boolean = false;

    private localAddress?: string;
    private localPort?: number;
    private localFamily?: string;

    constructor(options?: any, connectionListener?: (socket: TauriTcpSocket) => void) {
        super();
        if (options) {
            this.maxConnections = options.maxConnections ?? Infinity;
            this.dropMaxConnection = !!options.dropMaxConnection;
        }
        if (connectionListener) {
            this.on('connection', connectionListener);
        }
    }

    listen(port?: number, hostname?: string, backlog?: number, listeningListener?: () => void): this;
    listen(port?: number, hostname?: string, listeningListener?: () => void): this;
    listen(port?: number, listeningListener?: () => void): this;
    listen(path: string, backlog?: number, listeningListener?: () => void): this;
    listen(path: string, listeningListener?: () => void): this;
    listen(options: any, listeningListener?: () => void): this;
    listen(handle: any, backlog?: number, listeningListener?: () => void): this;
    listen(handle: any, listeningListener?: () => void): this;
    listen(portOrOptionsOrPath?: any, hostOrListener?: any, backlogOrListener?: any, callback?: () => void): this {
        if (this.serverId) throw new Error("Server already listening");

        let port = 0;
        let host = '0.0.0.0';
        let listener = callback;

        if (typeof portOrOptionsOrPath === 'number') {
            port = portOrOptionsOrPath;
            if (typeof hostOrListener === 'string') {
                host = hostOrListener;
                if (typeof backlogOrListener === 'function') {
                    listener = backlogOrListener;
                }
            } else if (typeof hostOrListener === 'function') {
                listener = hostOrListener;
            }
        } else if (typeof portOrOptionsOrPath === 'object' && portOrOptionsOrPath !== null) {
            port = portOrOptionsOrPath.port || 0;
            host = portOrOptionsOrPath.host || '0.0.0.0';
            if (typeof hostOrListener === 'function') {
                listener = hostOrListener;
            }
        } else if (typeof portOrOptionsOrPath === 'string') {
            throw new Error("IPC / Unix Domain Sockets are not supported on Tauri");
        } else if (typeof portOrOptionsOrPath === 'function') {
            listener = portOrOptionsOrPath;
        }

        if (listener) {
            this.once('listening', listener);
        }

        invoke<TcpListenResult>('tcp_listen', { host, port })
            .then(result => {
                this.serverId = result.id;
                this.listening = true;
                this.localAddress = result.local_address;
                this.localPort = result.local_port;
                this.localFamily = result.family;

                activeServers.set(result.id, this);
                ensureGlobalServerListener();

                this.emit('listening');
            })
            .catch((err) => {
                this.emit(
                    'error',
                    mapHostError(err, {
                        syscall: 'listen',
                        address: host,
                        port,
                    })
                );
            });

        return this;
    }

    /** @internal */
    public handleServerEvent(payload: NetEventPayload) {
        switch (payload.event) {
            case 'connection':
                if (payload.data) {
                    const clientId = new TextDecoder().decode(new Uint8Array(payload.data));

                    if (this.activeConnections.size >= this.maxConnections) {
                        invoke('tcp_destroy', { id: clientId }).catch(console.error);
                        if (this.dropMaxConnection) {
                            const dropData = {
                                localAddress: this.localAddress || '',
                                localPort: this.localPort || 0,
                                localFamily: this.localFamily || 'IPv4',
                                remoteAddress: payload.remote_address || '',
                                remotePort: payload.remote_port || 0,
                                remoteFamily: payload.family || 'IPv4',
                            };
                            this.emit('drop', dropData);
                        }
                        return;
                    }

                    const socket = new TauriTcpSocket(clientId);
                    socket.remoteAddress = payload.remote_address || undefined;
                    socket.remotePort = payload.remote_port || undefined;
                    socket.remoteFamily = payload.family || undefined;
                    socket.localAddress = payload.local_address || undefined;
                    socket.localPort = payload.local_port || undefined;
                    socket.localFamily = payload.family || undefined;
                    socket.readyState = 'open';

                    this.activeConnections.add(socket);
                    socket.on('close', () => {
                        this.activeConnections.delete(socket);
                        this.checkPendingClose();
                    });

                    this.emit('connection', socket);
                }
                break;
            case 'close':
                this.isServerClosedReceived = true;
                this.checkPendingClose();
                break;
            case 'error': {
                const err = mapHostError(payload.error || 'Unknown error', {
                    syscall: 'accept',
                    address: this.localAddress,
                    port: this.localPort,
                });
                this.emit('error', err);
                break;
            }
        }
    }

    close(callback?: (err?: Error) => void): this {
        if (!this.serverId) {
            if (callback) {
                setTimeout(
                    () => callback(mapHostError('Server is not listening', { syscall: 'close' })),
                    0
                );
            }
            return this;
        }

        this.isClosing = true;
        this.closeCallback = callback || null;

        invoke('tcp_server_close', { id: this.serverId }).catch((err) => {
            const mapped = mapHostError(err, { syscall: 'close' });
            if (callback) callback(mapped);
            else this.emit('error', mapped);
        });

        return this;
    }

    private checkPendingClose() {
        if (this.isClosing && this.isServerClosedReceived && this.activeConnections.size === 0) {
            this.listening = false;
            this.emit('close');
            if (this.closeCallback) {
                const cb = this.closeCallback;
                this.closeCallback = null;
                cb();
            }
            this.cleanup();
        }
    }

    address() {
        if (!this.listening) return null;
        return {
            port: this.localPort || 0,
            family: this.localFamily || 'IPv4',
            address: this.localAddress || '0.0.0.0'
        };
    }

    getConnections(callback: (err: Error | null, count: number) => void): this {
        setTimeout(() => callback(null, this.activeConnections.size), 0);
        return this;
    }

    ref(): this {
        return this;
    }

    unref(): this {
        return this;
    }

    async [Symbol.asyncDispose](): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    closeAllConnections(): this {
        for (const socket of this.activeConnections) {
            socket.destroy();
        }
        return this;
    }

    closeIdleConnections(): this {
        return this;
    }

    private cleanup() {
        if (this.serverId) {
            activeServers.delete(this.serverId);
        }
        this.serverId = null;
        this.isClosing = false;
        this.isServerClosedReceived = false;
        this.activeConnections.clear();
    }
}
