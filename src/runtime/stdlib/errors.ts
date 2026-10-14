import type { HostErrorInit } from '../protocol';

/**
 * Node-like system error for stdlib network/fs APIs.
 */
export class SystemError extends Error {
  code?: string;
  errno?: number;
  syscall?: string;
  address?: string;
  port?: number;

  constructor(init: HostErrorInit | string) {
    if (typeof init === 'string') {
      super(init);
      this.name = 'SystemError';
      return;
    }
    super(init.message);
    this.name = 'SystemError';
    this.code = init.code;
    this.errno = init.errno;
    this.syscall = init.syscall;
    this.address = init.address;
    this.port = init.port;
  }
}

export interface MapHostErrorOptions {
  syscall?: string;
  address?: string;
  port?: number;
}

/** Best-effort map from opaque host/Rust error strings → Node-like SystemError. */
export function mapHostError(
  err: unknown,
  fallbackSyscallOrOpts?: string | MapHostErrorOptions
): SystemError {
  const opts: MapHostErrorOptions =
    typeof fallbackSyscallOrOpts === 'string'
      ? { syscall: fallbackSyscallOrOpts }
      : fallbackSyscallOrOpts || {};

  const message = String(err instanceof Error ? err.message : err);

  const patterns: Array<{ re: RegExp; code: string }> = [
    { re: /connection refused|ECONNREFUSED|os error 111|actively refused/i, code: 'ECONNREFUSED' },
    { re: /address already in use|EADDRINUSE|os error 98|os error 48/i, code: 'EADDRINUSE' },
    { re: /network is unreachable|ENETUNREACH/i, code: 'ENETUNREACH' },
    { re: /host is unreachable|EHOSTUNREACH/i, code: 'EHOSTUNREACH' },
    { re: /timed out|ETIMEDOUT|timeout|os error 110/i, code: 'ETIMEDOUT' },
    { re: /broken pipe|EPIPE|os error 32/i, code: 'EPIPE' },
    { re: /connection reset|ECONNRESET|os error 104/i, code: 'ECONNRESET' },
    { re: /not connected|ENOTCONN|os error 107/i, code: 'ENOTCONN' },
    { re: /bad file|EBADF|socket not found/i, code: 'EBADF' },
    { re: /permission denied|EACCES|os error 13/i, code: 'EACCES' },
    { re: /no route to host|EHOSTUNREACH/i, code: 'EHOSTUNREACH' },
    { re: /name or service not known|getaddrinfo|EAI_NONAME|failed to lookup/i, code: 'ENOTFOUND' },
    { re: /invalid argument|EINVAL/i, code: 'EINVAL' },
    { re: /operation not permitted|EPERM/i, code: 'EPERM' },
  ];

  for (const { re, code } of patterns) {
    if (re.test(message)) {
      return new SystemError({
        message,
        code,
        syscall: opts.syscall,
        address: opts.address,
        port: opts.port,
      });
    }
  }

  return new SystemError({
    message,
    syscall: opts.syscall,
    address: opts.address,
    port: opts.port,
  });
}
