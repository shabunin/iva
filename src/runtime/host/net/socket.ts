import { EventEmitter, ITcpSocket } from '../../stdlib/net';
import { Buffer, toUint8Array } from '../../stdlib/buffer';
import { mapHostError } from '../../stdlib/errors';
import { invoke } from '../bridge/tauri-core';
import { listen, UnlistenFn } from '../bridge/tauri-event';
import type { NetEventPayload } from '../../stdlib/net';

export const activeSockets = new Map<string, TauriTcpSocket>();

let globalSocketListenerPromise: Promise<UnlistenFn> | null = null;

export function ensureGlobalSocketListener() {
    if (globalSocketListenerPromise) return;
    globalSocketListenerPromise = listen<NetEventPayload>('plugin:net:tcp', (event) => {
        const socket = activeSockets.get(event.payload.id);
        if (socket) {
            socket.handleNetEvent(event.payload);
        }
    });
}

interface TcpConnectResult {
    id: string;
    remote_address: string;
    remote_port: number;
    local_address: string;
    local_port: number;
    family: string;
}

export class TauriTcpSocket extends EventEmitter implements ITcpSocket {
    public destroyed: boolean = false;
    public connecting: boolean = false;
    public readyState: string = 'closed';

    public bytesRead: number = 0;
    public bytesWritten: number = 0;
    public bufferSize: number = 0;

    public localAddress?: string;
    public localPort?: number;
    public localFamily?: string;

    public remoteAddress?: string;
    public remotePort?: number;
    public remoteFamily?: string;

    public timeout?: number;

    private socketId: string | null = null;
    private encoding: string | null = null;
    private timeoutTimer: any = null;
    private isPaused: boolean = false;
    private pausedBuffer: Uint8Array[] = [];
    private writeEnded: boolean = false;

    constructor(existingId?: string, options?: any) {
        super();
        if (options && options.encoding) {
            this.setEncoding(options.encoding);
        }
        if (existingId) {
            this.socketId = existingId;
            this.readyState = 'open';
            activeSockets.set(existingId, this);
            ensureGlobalSocketListener();
        }
    }

    get pending(): boolean {
        return this.connecting;
    }

    /** @internal */
    public handleNetEvent(payload: NetEventPayload) {
        switch (payload.event) {
            case 'data':
                if (payload.data) {
                    const chunk = new Uint8Array(payload.data);
                    this.bytesRead += chunk.length;
                    this.resetTimeoutTimer();

                    if (this.isPaused) {
                        this.pausedBuffer.push(chunk);
                    } else {
                        this.emitData(chunk);
                    }
                }
                break;
            case 'finish':
                // Write half closed successfully
                this.writeEnded = true;
                if (this.readyState === 'open') {
                    this.readyState = 'readOnly';
                }
                this.emit('finish');
                break;
            case 'close':
                this.readyState = 'closed';
                this.emit('end');
                this.emit('close', false);
                this.cleanup();
                break;
            case 'error': {
                this.readyState = 'closed';
                const err = mapHostError(payload.error || 'Unknown error', {
                    syscall: 'tcp',
                    address: this.remoteAddress,
                    port: this.remotePort,
                });
                this.emit('error', err);
                this.emit('close', true);
                this.cleanup();
                break;
            }
        }
    }

    private emitData(chunk: Uint8Array) {
        if (this.encoding) {
            const decoder = new TextDecoder(this.encoding);
            this.emit('data', decoder.decode(chunk));
        } else {
            // Prefer Buffer for Node-shaped consumers
            this.emit('data', Buffer.from(chunk));
        }
    }

    connect(port: number, host: string, connectionListener?: () => void): this;
    connect(options: any, connectionListener?: () => void): this;
    connect(path: string, connectionListener?: () => void): this;
    connect(portOrOptionsOrPath: any, hostOrCreateListener?: any, connectionListener?: () => void): this {
        if (this.socketId || this.connecting) throw mapHostError('Socket already connected', { syscall: 'connect' });

        let port = 0;
        let host = '127.0.0.1';
        let listener = connectionListener;
        let keepAlive = false;
        let keepAliveDelay = 0;
        let noDelay = false;

        if (typeof portOrOptionsOrPath === 'number') {
            port = portOrOptionsOrPath;
            if (typeof hostOrCreateListener === 'string') {
                host = hostOrCreateListener;
            } else if (typeof hostOrCreateListener === 'function') {
                listener = hostOrCreateListener;
            }
        } else if (typeof portOrOptionsOrPath === 'object' && portOrOptionsOrPath !== null) {
            port = portOrOptionsOrPath.port || 0;
            host = portOrOptionsOrPath.host || '127.0.0.1';
            keepAlive = !!portOrOptionsOrPath.keepAlive;
            keepAliveDelay = portOrOptionsOrPath.keepAliveInitialDelay || 0;
            noDelay = !!portOrOptionsOrPath.noDelay;
            if (typeof hostOrCreateListener === 'function') {
                listener = hostOrCreateListener;
            }
        } else if (typeof portOrOptionsOrPath === 'string') {
            throw mapHostError('IPC / Unix Domain Sockets are not supported on Tauri', {
                syscall: 'connect',
            });
        }

        this.connecting = true;
        this.readyState = 'opening';
        this.remoteAddress = host;
        this.remotePort = port;

        if (listener) {
            this.once('connect', listener);
        }

        invoke<TcpConnectResult>('tcp_connect', { host, port })
            .then((result) => {
                this.socketId = result.id;
                this.remoteAddress = result.remote_address;
                this.remotePort = result.remote_port;
                this.remoteFamily = result.family;
                this.localAddress = result.local_address;
                this.localPort = result.local_port;
                this.localFamily = result.family;

                this.connecting = false;
                this.readyState = 'open';

                activeSockets.set(result.id, this);
                ensureGlobalSocketListener();

                if (keepAlive) {
                    this.setKeepAlive(true, keepAliveDelay);
                }
                if (noDelay) {
                    this.setNoDelay(true);
                }

                this.resetTimeoutTimer();

                this.emit('connect');
                this.emit('ready');
            })
            .catch((err) => {
                this.connecting = false;
                this.readyState = 'closed';
                this.emit(
                    'error',
                    mapHostError(err, { syscall: 'connect', address: host, port })
                );
                this.emit('close', true);
            });

        return this;
    }

    write(
        data: string | Uint8Array,
        encoding: string = 'utf8',
        callback?: (err?: Error | null) => void
    ): boolean {
        if (this.destroyed || !this.socketId || this.writeEnded || this.readyState === 'readOnly') {
            const err = mapHostError('This socket has been ended by the other party', {
                syscall: 'write',
                address: this.remoteAddress,
                port: this.remotePort,
            });
            err.code = err.code || 'EPIPE';
            const cb = callback;
            if (cb) setTimeout(() => cb(err), 0);
            else this.emit('error', err);
            return false;
        }

        // Allow write(data, callback) Node overload
        if (typeof encoding === 'function') {
            callback = encoding as any;
            encoding = 'utf8';
        }

        const u8 = toUint8Array(data, encoding as any);
        const payload = Array.from(u8);

        this.bytesWritten += payload.length;
        this.resetTimeoutTimer();

        invoke('tcp_write', { id: this.socketId, data: payload })
            .then(() => {
                if (callback) callback(null);
            })
            .catch((err) => {
                const mapped = mapHostError(err, {
                    syscall: 'write',
                    address: this.remoteAddress,
                    port: this.remotePort,
                });
                if (callback) callback(mapped);
                else this.emit('error', mapped);
            });

        // Always true for now (no backpressure signal from Rust yet)
        return true;
    }

    /**
     * Node-like half-close: FIN write side, keep reading until peer closes.
     * Use destroy() for full teardown.
     */
    end(data?: string | Uint8Array, encoding?: string, callback?: () => void): this {
        if (this.destroyed || this.writeEnded) {
            if (callback) setTimeout(callback, 0);
            return this;
        }

        const doShutdown = () => {
            if (!this.socketId || this.writeEnded) {
                if (callback) callback();
                return;
            }
            this.writeEnded = true;
            this.readyState = this.readyState === 'closed' ? 'closed' : 'readOnly';

            invoke('tcp_shutdown', { id: this.socketId })
                .then(() => {
                    // 'finish' also arrives from Rust; emit here as fallback
                    if (callback) callback();
                })
                .catch((err) => {
                    this.emit(
                        'error',
                        mapHostError(err, {
                            syscall: 'shutdown',
                            address: this.remoteAddress,
                            port: this.remotePort,
                        })
                    );
                    if (callback) callback();
                });
        };

        if (data !== undefined && data !== null && data !== '') {
            this.write(data as any, encoding as any, (err) => {
                if (err) {
                    this.emit('error', err);
                    if (callback) callback();
                    return;
                }
                doShutdown();
            });
        } else {
            doShutdown();
        }
        return this;
    }

    destroy(err?: Error): this {
        if (this.destroyed) return this;
        this.destroyed = true;
        this.writeEnded = true;

        if (this.socketId) {
            invoke('tcp_destroy', { id: this.socketId }).catch(console.error);
        }

        if (err) this.emit('error', err);

        this.cleanup();
        this.emit('close', !!err);
        return this;
    }

    destroySoon(): this {
        // Drain then destroy — without backpressure, same as destroy
        return this.destroy();
    }

    resetAndDestroy(): this {
        // True RST not available via tokio; fall back to destroy
        return this.destroy();
    }

    setKeepAlive(enable: boolean = false, initialDelay: number = 0): this {
        if (this.destroyed || !this.socketId) return this;
        invoke('tcp_set_keep_alive', {
            id: this.socketId,
            enable,
            delay: initialDelay > 0 ? initialDelay : null,
        }).catch((err) =>
            this.emit('error', mapHostError(err, { syscall: 'setsockopt' }))
        );
        return this;
    }

    setNoDelay(noDelay: boolean = true): this {
        if (this.destroyed || !this.socketId) return this;
        invoke('tcp_set_no_delay', {
            id: this.socketId,
            noDelay,
        }).catch((err) =>
            this.emit('error', mapHostError(err, { syscall: 'setsockopt' }))
        );
        return this;
    }

    setTimeout(timeout: number, callback?: () => void): this {
        this.timeout = timeout;
        if (callback) {
            this.on('timeout', callback);
        }
        this.resetTimeoutTimer();
        return this;
    }

    private resetTimeoutTimer() {
        if (this.timeoutTimer) {
            clearTimeout(this.timeoutTimer);
            this.timeoutTimer = null;
        }

        if (this.timeout && this.timeout > 0 && !this.destroyed) {
            this.timeoutTimer = setTimeout(() => {
                this.emit('timeout');
            }, this.timeout);
        }
    }

    setEncoding(encoding: string): this {
        if (encoding === 'utf-8' || encoding === 'utf8') {
            this.encoding = 'utf-8';
        } else {
            this.encoding = encoding;
        }
        return this;
    }

    pause(): this {
        this.isPaused = true;
        return this;
    }

    resume(): this {
        if (!this.isPaused) return this;
        this.isPaused = false;
        const buffer = this.pausedBuffer;
        this.pausedBuffer = [];
        for (const chunk of buffer) {
            this.emitData(chunk);
        }
        return this;
    }

    address() {
        if (this.destroyed || this.readyState === 'closed') return null;
        return {
            port: this.localPort || 0,
            family: this.localFamily || 'IPv4',
            address: this.localAddress || '127.0.0.1',
        };
    }

    private cleanup() {
        if (this.socketId) {
            activeSockets.delete(this.socketId);
        }
        if (this.timeoutTimer) {
            clearTimeout(this.timeoutTimer);
            this.timeoutTimer = null;
        }
        this.socketId = null;
        this.destroyed = true;
        this.connecting = false;
        this.readyState = 'closed';
    }
}
