import TauriWs, { type Message as TauriWsMessage } from '../bridge/tauri-plugin-websocket';

/**
 * `WebSocket` client compatible with the browser API
 * (https://developer.mozilla.org/en-US/docs/Web/API/WebSocket), backed by
 * `@tauri-apps/plugin-websocket` (outbound-only: it dials out, it cannot
 * accept connections — see `WebSocketServer` in `./index.ts` for that).
 */
export type BinaryType = 'blob' | 'arraybuffer';

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

export class AgapiWebSocket extends EventTarget {
    static readonly CONNECTING = CONNECTING;
    static readonly OPEN = OPEN;
    static readonly CLOSING = CLOSING;
    static readonly CLOSED = CLOSED;
    readonly CONNECTING = CONNECTING;
    readonly OPEN = OPEN;
    readonly CLOSING = CLOSING;
    readonly CLOSED = CLOSED;

    readonly url: string;
    /**
     * The underlying plugin has no way to read back the server's chosen
     * subprotocol (`connect()` only returns a connection id), so this stays
     * `''` even when `protocols` were requested — best-effort, not spec-exact.
     */
    readonly protocol: string = '';
    readonly extensions: string = '';
    readonly bufferedAmount: number = 0;
    binaryType: BinaryType = 'blob';
    readyState: number = CONNECTING;

    onopen: ((ev: Event) => void) | null = null;
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;
    onclose: ((ev: CloseEvent) => void) | null = null;

    private client: TauriWs | null = null;
    private removeListener: (() => void) | null = null;
    private closedFired = false;
    private closedBeforeConnect = false;

    constructor(url: string, protocols?: string | string[]) {
        super();
        this.url = url;

        const headers: Record<string, string> = {};
        if (protocols) {
            headers['Sec-WebSocket-Protocol'] = Array.isArray(protocols)
                ? protocols.join(', ')
                : protocols;
        }

        TauriWs.connect(url, Object.keys(headers).length ? { headers } : undefined)
            .then((client) => {
                if (this.closedBeforeConnect) {
                    void client.disconnect();
                    return;
                }
                this.client = client;
                this.removeListener = client.addListener((msg) => this.handleMessage(msg));
                this.readyState = OPEN;
                this.dispatch('open', new Event('open'));
            })
            .catch((err) => {
                this.readyState = CLOSED;
                this.dispatchErrorAndClose(String(err), 1006, false);
            });
    }

    private dispatch(type: string, ev: Event) {
        this.dispatchEvent(ev);
        const handler =
            type === 'open' ? this.onopen :
            type === 'message' ? this.onmessage :
            type === 'error' ? this.onerror :
            type === 'close' ? this.onclose :
            null;
        (handler as ((ev: Event) => void) | null)?.call(this, ev);
    }

    private dispatchErrorAndClose(reason: string, code: number, wasClean: boolean) {
        this.dispatch('error', new Event('error'));
        if (this.closedFired) return;
        this.closedFired = true;
        this.dispatch('close', new CloseEvent('close', { code, reason, wasClean }));
    }

    private handleMessage(msg: TauriWsMessage | string) {
        // The Rust-side connection-error path pushes a bare string through the
        // same channel instead of a tagged `{ type, data }` message.
        if (typeof msg !== 'object' || msg === null || !('type' in msg)) {
            this.readyState = CLOSED;
            this.dispatchErrorAndClose(
                typeof msg === 'string' ? msg : 'WebSocket error',
                1006,
                false
            );
            return;
        }

        switch (msg.type) {
            case 'Text':
                this.dispatch('message', new MessageEvent('message', { data: msg.data }));
                break;
            case 'Binary': {
                const bytes = new Uint8Array(msg.data);
                const data: ArrayBuffer | Blob =
                    this.binaryType === 'arraybuffer' ? bytes.buffer : new Blob([bytes]);
                this.dispatch('message', new MessageEvent('message', { data }));
                break;
            }
            case 'Ping':
                // Real browsers answer WS pings transparently; do the same here
                // since the plugin doesn't (it just forwards the frame to JS).
                void this.client?.send({ type: 'Pong', data: msg.data });
                break;
            case 'Pong':
                break;
            case 'Close':
                this.readyState = CLOSED;
                this.removeListener?.();
                this.removeListener = null;
                if (this.closedFired) break;
                this.closedFired = true;
                this.dispatch(
                    'close',
                    new CloseEvent('close', {
                        code: msg.data?.code ?? 1005,
                        reason: msg.data?.reason ?? '',
                        wasClean: true,
                    })
                );
                break;
        }
    }

    send(data: string | ArrayBuffer | ArrayBufferView): void {
        if (this.readyState !== OPEN || !this.client) {
            throw new DOMException('WebSocket is not open', 'InvalidStateError');
        }
        if (typeof data === 'string') {
            void this.client.send({ type: 'Text', data });
        } else {
            const bytes =
                data instanceof ArrayBuffer
                    ? new Uint8Array(data)
                    : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
            void this.client.send({ type: 'Binary', data: Array.from(bytes) });
        }
    }

    close(code: number = 1000, reason: string = ''): void {
        if (this.readyState === CLOSING || this.readyState === CLOSED) return;
        if (!this.client) {
            // Still connecting: disconnect once `connect()` resolves, and
            // report closed now — nothing was ever open from the caller's view.
            this.closedBeforeConnect = true;
            this.readyState = CLOSED;
            this.closedFired = true;
            this.dispatch('close', new CloseEvent('close', { code, reason, wasClean: false }));
            return;
        }
        this.readyState = CLOSING;
        void this.client.send({ type: 'Close', data: { code, reason } });
    }
}

export default AgapiWebSocket;
