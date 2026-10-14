export type { ITcpSocket, IUdpSocket, ITcpServer, INetworkProvider } from './types';
export { isIP, isIPv4, isIPv6 } from './ip';
export { SocketAddress } from './socket-address';
export { EventEmitter } from '../events';
export type { NetEventPayload } from '../../protocol';

export {
  MockTcpSocket,
  MockTcpServer,
  MockUdpSocket,
  DefaultMockProvider,
} from './mock';

export { NetworkManager, net } from './manager';
export { net as default } from './manager';

// Legacy export name used by old shims
export { MockTcpSocket as Socket } from './mock';
