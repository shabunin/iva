/** Stand-in for `@tauri-apps/api/event`: events come from the iva dev backend. */
import { listen as onEvent } from './transport';

export type UnlistenFn = () => void;
export interface Event<T> {
  event: string;
  id: number;
  payload: T;
}

let n = 0;
export async function listen<T>(event: string, handler: (e: Event<T>) => void): Promise<UnlistenFn> {
  return onEvent(event, (payload) => handler({ event, id: ++n, payload: payload as T }));
}
