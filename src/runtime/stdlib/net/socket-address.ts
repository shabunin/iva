import { isIPv4, isIPv6 } from './ip';

export class SocketAddress {
  readonly address: string;
  readonly family: 'ipv4' | 'ipv6';
  readonly flowlabel: number;
  readonly port: number;

  constructor(
    options: { address?: string; family?: 'ipv4' | 'ipv6'; flowlabel?: number; port?: number } = {}
  ) {
    this.family = options.family === 'ipv6' ? 'ipv6' : 'ipv4';
    this.address = options.address || (this.family === 'ipv4' ? '127.0.0.1' : '::');
    this.flowlabel = options.flowlabel || 0;
    this.port = options.port || 0;
  }

  static parse(input: string): SocketAddress | undefined {
    if (typeof input !== 'string') return undefined;

    const ipv6WithPort = input.match(/^\[([a-fA-F0-9:.]+)\]:(\d+)$/);
    if (ipv6WithPort) {
      const address = ipv6WithPort[1];
      const port = parseInt(ipv6WithPort[2], 10);
      if (isIPv6(address) && port >= 0 && port <= 65535) {
        return new SocketAddress({ address, family: 'ipv6', port });
      }
      return undefined;
    }

    const ipv4WithPort = input.match(/^([\d.]+):(\d+)$/);
    if (ipv4WithPort) {
      const address = ipv4WithPort[1];
      const port = parseInt(ipv4WithPort[2], 10);
      if (isIPv4(address) && port >= 0 && port <= 65535) {
        return new SocketAddress({ address, family: 'ipv4', port });
      }
    }

    if (isIPv6(input)) {
      return new SocketAddress({ address: input, family: 'ipv6', port: 0 });
    }

    if (isIPv4(input)) {
      return new SocketAddress({ address: input, family: 'ipv4', port: 0 });
    }

    return undefined;
  }
}
