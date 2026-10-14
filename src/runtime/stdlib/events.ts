/**
 * Lightweight browser-safe EventEmitter (Node.js events subset).
 * Target: on/once/off/emit/removeAllListeners + common aliases.
 */

export type Listener = (...args: any[]) => void;

export class EventEmitter {
  private _events: Record<string, Listener[]> = {};

  on(event: string, fn: Listener): this {
    if (!this._events[event]) {
      this._events[event] = [];
    }
    this._events[event].push(fn);
    return this;
  }

  addListener(event: string, fn: Listener): this {
    return this.on(event, fn);
  }

  once(event: string, fn: Listener): this {
    const wrapper: Listener = (...args: any[]) => {
      this.off(event, wrapper);
      fn(...args);
    };
    return this.on(event, wrapper);
  }

  off(event: string, fn: Listener): this {
    if (!this._events[event]) return this;
    this._events[event] = this._events[event].filter((l) => l !== fn);
    return this;
  }

  removeListener(event: string, fn: Listener): this {
    return this.off(event, fn);
  }

  emit(event: string, ...args: any[]): boolean {
    if (!this._events[event] || this._events[event].length === 0) {
      // Node: throw if 'error' has no listeners
      if (event === 'error' && args[0] instanceof Error) {
        console.error('Unhandled EventEmitter error:', args[0]);
      }
      return false;
    }
    const currentListeners = this._events[event].slice();
    currentListeners.forEach((fn) => {
      try {
        fn(...args);
      } catch (err) {
        console.error(`Error in Event [${event}] listener:`, err);
      }
    });
    return true;
  }

  removeAllListeners(event?: string): this {
    if (event) {
      delete this._events[event];
    } else {
      this._events = {};
    }
    return this;
  }

  listenerCount(event: string): number {
    return this._events[event]?.length ?? 0;
  }

  listeners(event: string): Listener[] {
    return (this._events[event] || []).slice();
  }
}
