import { EventEmitter } from '../../stdlib/net';
import type { NetEventPayload } from '../../stdlib/net';
import { Buffer } from '../../stdlib/buffer';
import { mapHostError } from '../../stdlib/errors';
import { invoke } from '../bridge/tauri-core';
import { listen, UnlistenFn } from '../bridge/tauri-event';

export interface TauriUdpSocketOptions {
    type: 'udp4' | 'udp6';
    reuseAddr?: boolean;
    reusePort?: boolean;
    ipv6Only?: boolean;
    recvBufferSize?: number;
    sendBufferSize?: number;
    lookup?: any;
    signal?: AbortSignal;
}

interface UdpBindResult {
    id: string;
    local_address: string;
    local_port: number;
    family: string;
}

function getMessageLength(msg: any): number {
    if (typeof msg === 'string') {
        return new TextEncoder().encode(msg).length;
    } else if (msg instanceof Uint8Array || ArrayBuffer.isView(msg)) {
        return msg.byteLength;
    } else if (Array.isArray(msg)) {
        return msg.reduce((acc, m) => acc + getMessageLength(m), 0);
    }
    return 0;
}

export class TauriUdpSocket extends EventEmitter {
    private socketId: string | null = null;
    /** True while an (explicit or implicit) udp_bind invoke is in flight. */
    private binding = false;
    private unlisten: UnlistenFn | null = null;
    private options: TauriUdpSocketOptions;
    
    private localAddress?: string;
    private localPort?: number;
    private localFamily?: string;

    private isConnected: boolean = false;
    private remoteAddr?: string;
    private remotePort?: number;

    private cachedRecvBufferSize: number = 65536;
    private cachedSendBufferSize: number = 65536;

    constructor(typeOrOptions: 'udp4' | 'udp6' | TauriUdpSocketOptions = 'udp4') {
        super();
        if (typeof typeOrOptions === 'string') {
            this.options = { type: typeOrOptions };
        } else {
            this.options = { ...typeOrOptions };
        }

        if (this.options.signal) {
            if (this.options.signal.aborted) {
                setTimeout(() => this.close(), 0);
            } else {
                this.options.signal.addEventListener('abort', () => {
                    this.close();
                });
            }
        }
    }

    bind(portOrOptions?: number | any, addressOrCallback?: string | (() => void), callback?: () => void): this {
        if (this.socketId || this.binding) throw new Error("Socket already bound");
        this.binding = true;

        let port = 0;
        const defaultAddress = this.options.type === 'udp6' ? '::' : '0.0.0.0';
        let address = defaultAddress;
        let cb = callback;

        if (typeof portOrOptions === 'number') {
            port = portOrOptions;
            if (typeof addressOrCallback === 'string') {
                address = addressOrCallback;
            } else if (typeof addressOrCallback === 'function') {
                cb = addressOrCallback;
            }
        } else if (typeof portOrOptions === 'object' && portOrOptions !== null) {
            port = portOrOptions.port || 0;
            address = portOrOptions.address || defaultAddress;
            if (typeof addressOrCallback === 'function') {
                cb = addressOrCallback;
            }
        } else if (typeof portOrOptions === 'function') {
            cb = portOrOptions;
        }

        invoke<UdpBindResult>('udp_bind', {
            host: address,
            port,
            reuseAddr: this.options.reuseAddr || null,
            reusePort: this.options.reusePort || null,
            ipv6Only: this.options.ipv6Only || null,
            recvBufferSize: this.options.recvBufferSize || null,
            sendBufferSize: this.options.sendBufferSize || null
        })
            .then(async (result) => {
                this.binding = false;
                this.socketId = result.id;
                this.localAddress = result.local_address;
                this.localPort = result.local_port;
                this.localFamily = result.family;

                // Must attach Tauri event listener BEFORE advertising 'listening',
                // otherwise early datagrams (SSDP replies) are dropped.
                await this.setupListener();

                // Fetch buffer sizes to fill cache
                invoke<number>('udp_get_recv_buffer_size', { id: this.socketId })
                    .then(size => this.cachedRecvBufferSize = size)
                    .catch(() => {});
                invoke<number>('udp_get_send_buffer_size', { id: this.socketId })
                    .then(size => this.cachedSendBufferSize = size)
                    .catch(() => {});

                if (cb) {
                    this.once('listening', cb);
                }
                this.emit('listening');
            })
            .catch((err) => {
                this.binding = false;
                this.emit(
                    'error',
                    mapHostError(err, { syscall: 'bind', address, port })
                );
            });

        return this;
    }

    private async setupListener() {
        if (this.unlisten) return;

        this.unlisten = await listen<NetEventPayload>('plugin:net:udp', (event) => {
            if (event.payload.id !== this.socketId) return;

            switch (event.payload.event) {
                case 'listening':
                    this.emit('listening');
                    break;
                case 'message':
                    if (event.payload.data) {
                        const rinfo = {
                            address: event.payload.remote_address || '',
                            port: event.payload.remote_port || 0,
                            family: event.payload.family || (this.options.type === 'udp4' ? 'IPv4' : 'IPv6'),
                            size: event.payload.data.length
                        };
                        this.emit('message', Buffer.from(event.payload.data), rinfo);
                    }
                    break;
                case 'connect':
                    this.emit('connect');
                    break;
                case 'close':
                    this.emit('close');
                    this.cleanup();
                    break;
                case 'error': {
                    const err = mapHostError(event.payload.error || 'Unknown error', {
                        syscall: 'udp',
                    });
                    this.emit('error', err);
                    break;
                }
            }
        });
    }

    address() {
        if (!this.socketId) {
            throw new Error("EBADF: bad file descriptor");
        }
        return {
            address: this.localAddress || '0.0.0.0',
            family: this.localFamily || (this.options.type === 'udp4' ? 'IPv4' : 'IPv6'),
            port: this.localPort || 0
        };
    }

    connect(port: number, address?: string, callback?: () => void): void {
        const addr = address || (this.options.type === 'udp4' ? '127.0.0.1' : '::1');
        
        if (!this.socketId) {
            // If not bound, bind to a random port first;
            // if a bind is already in flight, just wait for it.
            const retry = () => this.connect(port, addr, callback);
            if (this.binding) this.once('listening', retry);
            else this.bind(0, undefined, retry);
            return;
        }

        invoke('udp_connect', { id: this.socketId, host: addr, port })
            .then(() => {
                this.isConnected = true;
                this.remoteAddr = addr;
                this.remotePort = port;
                if (callback) callback();
            })
            .catch((err) => {
                this.emit(
                    'error',
                    mapHostError(err, { syscall: 'connect', address: addr, port })
                );
            });
    }

    disconnect(): void {
        if (!this.socketId) {
            throw new Error("ERR_SOCKET_DGRAM_NOT_CONNECTED");
        }
        invoke('udp_disconnect', { id: this.socketId })
            .then(() => {
                this.isConnected = false;
                this.remoteAddr = undefined;
                this.remotePort = undefined;
            })
            .catch(err => {
                this.emit('error', new Error(String(err)));
            });
    }

    remoteAddress() {
        if (!this.isConnected) {
            throw new Error("ERR_SOCKET_DGRAM_NOT_CONNECTED");
        }
        return {
            address: this.remoteAddr,
            port: this.remotePort,
            family: this.options.type === 'udp4' ? 'IPv4' : 'IPv6'
        };
    }

    send(msg: any, ...args: any[]): void {
        if (!this.socketId) {
            // Bind implicitly if send is called on unbound socket;
            // if a bind is already in flight, just wait for it.
            const retry = () => this.send(msg, ...args);
            if (this.binding) this.once('listening', retry);
            else this.bind(0, undefined, retry);
            return;
        }
        if (this.interfaceSet) {
            const retry = () => this.send(msg, ...args);
            void this.interfaceSet.then(retry);
            return;
        }

        let offset: number = 0;
        let length: number = 0;
        let port: number | undefined;
        let address: string | undefined;
        let callback: ((err: Error | null) => void) | undefined;

        if (typeof args[args.length - 1] === 'function') {
            callback = args.pop();
        }

        if (args.length === 0) {
            // send(msg, cb) - connected socket
            if (!this.isConnected) {
                const err = mapHostError(
                    'Destination address is required for connectionless socket',
                    { syscall: 'send' }
                );
                if (callback) callback(err);
                else this.emit('error', err);
                return;
            }
            offset = 0;
            length = getMessageLength(msg);
        } else if (args.length === 1) {
            // send(msg, port, cb) — address defaults to localhost / connected peer
            port = args[0];
            address = this.isConnected
                ? this.remoteAddr
                : this.options.type === 'udp4'
                  ? '127.0.0.1'
                  : '::1';
            offset = 0;
            length = getMessageLength(msg);
        } else if (args.length === 2) {
            // send(msg, port, address, cb)
            port = args[0];
            address = args[1];
            offset = 0;
            length = getMessageLength(msg);
        } else if (args.length === 3) {
            // send(msg, offset, length, port, cb) without address
            offset = args[0];
            length = args[1];
            port = args[2];
            address = this.isConnected
                ? this.remoteAddr
                : this.options.type === 'udp4'
                  ? '127.0.0.1'
                  : '::1';
        } else if (args.length === 4) {
            // send(msg, offset, length, port, address, cb)
            offset = args[0];
            length = args[1];
            port = args[2];
            address = args[3];
        } else {
            const err = mapHostError('Invalid arguments to send', { syscall: 'send' });
            if (callback) callback(err);
            else this.emit('error', err);
            return;
        }

        let payload: number[] = [];
        if (typeof msg === 'string') {
            const bytes = new TextEncoder().encode(msg);
            payload = Array.from(bytes.subarray(offset, offset + length));
        } else if (msg instanceof Uint8Array) {
            payload = Array.from(msg.subarray(offset, offset + length));
        } else if (ArrayBuffer.isView(msg)) {
            const view = new Uint8Array(msg.buffer, msg.byteOffset, msg.byteLength);
            payload = Array.from(view.subarray(offset, offset + length));
        } else if (Array.isArray(msg)) {
            const buffers: Uint8Array[] = msg.map(m => {
                if (typeof m === 'string') return new TextEncoder().encode(m);
                if (m instanceof Uint8Array) return m;
                if (ArrayBuffer.isView(m)) return new Uint8Array(m.buffer, m.byteOffset, m.byteLength);
                return new Uint8Array();
            });
            const totalLen = buffers.reduce((acc, b) => acc + b.length, 0);
            const merged = new Uint8Array(totalLen);
            let currOffset = 0;
            for (const buf of buffers) {
                merged.set(buf, currOffset);
                currOffset += buf.length;
            }
            payload = Array.from(merged);
        } else {
            const err = new Error("Invalid message type");
            if (callback) callback(err);
            else this.emit('error', err);
            return;
        }

        invoke('udp_send', {
            id: this.socketId,
            data: payload,
            host: address || null,
            port: port || null
        })
            .then(() => {
                if (callback) callback(null);
            })
            .catch((err) => {
                const error = mapHostError(err, {
                    syscall: 'send',
                    address: address || undefined,
                    port: port || undefined,
                });
                if (callback) callback(error);
                else this.emit('error', error);
            });
    }

    close(callback?: () => void): this {
        if (this.socketId) {
            invoke('udp_close', { id: this.socketId })
                .catch(console.error)
                .finally(() => {
                    // Clean up (and emit 'close') even if the invoke rejected —
                    // otherwise the Tauri listener leaks. The Rust 'close' event
                    // usually loses the race with unlisten, so emit locally,
                    // unless the event already got here and cleaned up first.
                    const alreadyClosed = !this.socketId;
                    this.cleanup();
                    if (!alreadyClosed) this.emit('close');
                    if (callback) callback();
                });
        } else {
            if (callback) setTimeout(callback, 0);
        }
        return this;
    }

    addMembership(multicastAddress: string, multicastInterface?: string): void {
        if (!this.socketId) throw new Error("Socket not bound");
        invoke('udp_add_membership', { id: this.socketId, multicastAddress, multicastInterface })
            .catch(err => this.emit('error', new Error(String(err))));
    }

    dropMembership(multicastAddress: string, multicastInterface?: string): void {
        if (!this.socketId) throw new Error("Socket not bound");
        invoke('udp_drop_membership', { id: this.socketId, multicastAddress, multicastInterface })
            .catch(err => this.emit('error', new Error(String(err))));
    }

    setBroadcast(flag: boolean): void {
        if (!this.socketId) throw new Error("Socket not bound");
        invoke('udp_set_broadcast', { id: this.socketId, flag })
            .catch(err => this.emit('error', new Error(String(err))));
    }

    setTTL(ttl: number): void {
        if (!this.socketId) throw new Error("Socket not bound");
        invoke('udp_set_ttl', { id: this.socketId, ttl })
            .catch(err => this.emit('error', new Error(String(err))));
    }

    setMulticastTTL(ttl: number): void {
        if (!this.socketId) throw new Error("Socket not bound");
        invoke('udp_set_multicast_ttl', { id: this.socketId, ttl })
            .catch(err => this.emit('error', new Error(String(err))));
    }

    setMulticastLoopback(flag: boolean): void {
        if (!this.socketId) throw new Error("Socket not bound");
        invoke('udp_set_multicast_loopback', { id: this.socketId, flag })
            .catch(err => this.emit('error', new Error(String(err))));
    }

    /** a multicast interface being set: the sends after it wait for it (each is an invoke of its own, in no set order) */
    private interfaceSet: Promise<unknown> | null = null;

    setMulticastInterface(multicastInterface: string): void {
        if (!this.socketId) throw new Error("Socket not bound");
        const set: Promise<unknown> = invoke('udp_set_multicast_interface', { id: this.socketId, multicastInterface })
            .catch(err => this.emit('error', new Error(String(err))))
            .then(() => {
                if (this.interfaceSet === set) this.interfaceSet = null;
            });
        this.interfaceSet = set;
    }

    getRecvBufferSize(): number {
        if (!this.socketId) throw new Error("Socket not bound");
        return this.cachedRecvBufferSize;
    }

    setRecvBufferSize(size: number): void {
        if (!this.socketId) throw new Error("Socket not bound");
        this.cachedRecvBufferSize = size;
        invoke('udp_set_recv_buffer_size', { id: this.socketId, size })
            .catch(err => this.emit('error', new Error(String(err))));
    }

    getSendBufferSize(): number {
        if (!this.socketId) throw new Error("Socket not bound");
        return this.cachedSendBufferSize;
    }

    setSendBufferSize(size: number): void {
        if (!this.socketId) throw new Error("Socket not bound");
        this.cachedSendBufferSize = size;
        invoke('udp_set_send_buffer_size', { id: this.socketId, size })
            .catch(err => this.emit('error', new Error(String(err))));
    }

    ref(): this {
        return this;
    }

    unref(): this {
        return this;
    }

    async [Symbol.asyncDispose](): Promise<void> {
        return new Promise<void>((resolve) => {
            this.close(() => resolve());
        });
    }

    private cleanup() {
        if (this.unlisten) {
            this.unlisten();
            this.unlisten = null;
        }
        this.socketId = null;
        this.localAddress = undefined;
        this.localPort = undefined;
        this.localFamily = undefined;
        this.isConnected = false;
        this.remoteAddr = undefined;
        this.remotePort = undefined;
    }
}

export function createSocket(
    typeOrOptions: 'udp4' | 'udp6' | TauriUdpSocketOptions,
    callback?: (msg: Uint8Array, rinfo: any) => void
): TauriUdpSocket {
    const socket = new TauriUdpSocket(typeOrOptions);
    if (callback) {
        socket.on('message', callback);
    }
    return socket;
}
