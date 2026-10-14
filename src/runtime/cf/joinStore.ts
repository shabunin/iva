export type JoinType = "d" | "a" | "s" | "l";
export type JoinValue = boolean | number | string;

/**
 * Normalizes a raw join definition into a proper string key.
 * Normal: type="d", id="1" -> "d1"
 * List:   type="s", id="l1:0:1" -> "l1:0:s1"
 */
export function normalizeJoinString(type: string, id: string): string {
    if (!id || id === "0") return "";
    if (id.includes(":")) {
        const parts = id.split(":");
        if (parts.length >= 3) {
            const lastPart = parts.pop();
            return `${parts.join(":")}:${type}${lastPart}`;
        }
    }
    return type + id;
}

export class JoinStore {
  private joins: Map<string, JoinValue> = new Map();
  private listeners: Map<string, Set<(val: any) => void>> = new Map();
  private globalListeners: Set<(id: string, type: JoinType, val: any) => void> = new Set();

  private getKey(id: string, type: JoinType): string {
      return normalizeJoinString(type, id);
  }

  onAny(callback: (id: string, type: JoinType, val: any) => void) {
      this.globalListeners.add(callback);
  }

  set(id: string, type: JoinType, value: JoinValue) {
      if (!id || id === "0") return;
      const key = this.getKey(id, type);
      
      // Data type safety
      let safeValue = value;
      if (type === "d") safeValue = !!value;
      if (type === "a") safeValue = Number(value) || 0;
      if (type === "s") safeValue = String(value);

      const existing = this.joins.get(key);
      if (existing === safeValue) return; // Prevent unnecessary triggers

      this.joins.set(key, safeValue);
      this.trigger(id, type, safeValue);
      
      this.globalListeners.forEach(cb => cb(id, type, safeValue));
  }

  /**
   * Like set(), but does NOT notify globalListeners (onAny bridge).
   * Use when the caller wants to update the store and fire per-join renderer listeners
   * WITHOUT dispatching a CF-level JoinChangeEvent.
   * Called by gui.ts:setJoin() when sendJoinChangeEvent=false.
   */
  setQuiet(id: string, type: JoinType, value: JoinValue) {
      if (!id || id === "0") return;
      const key = this.getKey(id, type);

      let safeValue = value;
      if (type === "d") safeValue = !!value;
      if (type === "a") safeValue = Number(value) || 0;
      if (type === "s") safeValue = String(value);

      const existing = this.joins.get(key);
      if (existing === safeValue) return;

      this.joins.set(key, safeValue);
      this.trigger(id, type, safeValue);
      // globalListeners intentionally NOT called — no JoinChangeEvent will fire
  }

  has(id: string, type: JoinType): boolean {
      if (!id || id === "0") return false;
      return this.joins.has(this.getKey(id, type));
  }

  get(id: string, type: JoinType): JoinValue {
      if (!id || id === "0") {
          return type === "s" ? "" : (type === "a" ? 0 : false);
      }
      const key = this.getKey(id, type);
      if (!this.joins.has(key)) {
          return type === "s" ? "" : (type === "a" ? 0 : false);
      }
      return this.joins.get(key)!;
  }

  /**
   * Register a listener for a join value change.
   * @param scope Optional page/lifetime scope. Use clearScope(scope) to bulk-remove
   *              all listeners registered under that scope (e.g. on page navigation).
   */
  on(id: string, type: JoinType, callback: (val: any) => void, scope?: string) {
      if (!id || id === "0") return;
      const key = this.getKey(id, type);
      if (!this.listeners.has(key)) {
          this.listeners.set(key, new Set());
      }
      this.listeners.get(key)!.add(callback);

      // Track by scope so we can bulk-remove on navigation
      if (scope) {
          if (!this.scopedListeners.has(scope)) {
              this.scopedListeners.set(scope, new Set());
          }
          this.scopedListeners.get(scope)!.add({ key, cb: callback });
      }

      // Immediately invoke with current value so joining component is initialized with latest explicit value
      if (this.has(id, type)) {
          callback(this.get(id, type));
      }
  }

  off(id: string, type: JoinType, callback: (val: any) => void) {
      if (!id || id === "0") return;
      const key = this.getKey(id, type);
      if (this.listeners.has(key)) {
          this.listeners.get(key)!.delete(callback);
      }
  }

  /**
   * Scope registry: maps a scope name to the set of {key, cb} pairs registered under it.
   * Allows O(n_listeners_in_scope) cleanup on navigation instead of a full store clear.
   */
  private scopedListeners: Map<string, Set<{ key: string; cb: (val: any) => void }>> = new Map();

  /**
   * Remove all joinStore listeners that were registered with the given scope.
   * Call this when navigating away from a page to prevent dead-listener accumulation.
   */
  clearScope(scope: string) {
      const entries = this.scopedListeners.get(scope);
      if (!entries) return;
      entries.forEach(({ key, cb }) => {
          this.listeners.get(key)?.delete(cb);
      });
      this.scopedListeners.delete(scope);
  }

  private trigger(id: string, type: JoinType, value: JoinValue) {
      const key = this.getKey(id, type);
      if (this.listeners.has(key)) {
          this.listeners.get(key)!.forEach(cb => cb(value));
      }
      // NOTE: JoinChangeEvent is dispatched by CF.setJoin() in gui.ts, NOT here.
      // The store is decoupled from the CF API layer intentionally.
  }

  clear() {
      this.joins.clear();
      this.listeners.clear();
      this.scopedListeners.clear();
  }
}

export const joinStore = new JoinStore();
