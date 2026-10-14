/**
 * Stand-in for `@tauri-apps/plugin-websocket`. The iva host hands scripts the
 * browser's own WebSocket instead, so this is never used to connect.
 */
export type Message = any;

export default class WebSocket {
  static async connect(_url?: string, _options?: unknown): Promise<WebSocket> {
    throw new Error('iva dev: use the browser WebSocket');
  }
  addListener(_cb: (msg: Message) => void): () => void {
    return () => {};
  }
  async send(_msg: Message): Promise<void> {}
  async disconnect(): Promise<void> {}
}
