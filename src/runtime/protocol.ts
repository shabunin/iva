/**
 * Shared wire types between tauri-rust and tauri-js host layers.
 * Keep free of application / CF / UI concepts.
 */

export interface NetEventPayload {
  id: string;
  event: string;
  data: number[] | null;
  error: string | null;
  remote_address: string | null;
  remote_port: number | null;
  local_address?: string | null;
  local_port?: number | null;
  family?: string | null;
}

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

/** Structured OS-like error shape we aim to map from Rust. */
export interface HostErrorInit {
  message: string;
  code?: string;
  errno?: number;
  syscall?: string;
  address?: string;
  port?: number;
}
