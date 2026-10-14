import type { INetworkProvider, ITcpServer, ITcpSocket } from './types';
import { DefaultMockProvider, MockTcpServer, MockTcpSocket } from './mock';
import { SocketAddress } from './socket-address';
import { isIP, isIPv4, isIPv6 } from './ip';

/**
 * Node.js `net`-shaped facade. Backed by INetworkProvider (mock or Tauri host).
 */
export class NetworkManager {
  private provider: INetworkProvider = new DefaultMockProvider();

  public Socket: any = MockTcpSocket;
  public Server: any = MockTcpServer;
  public SocketAddress = SocketAddress;
  public isIP = isIP;
  public isIPv4 = isIPv4;
  public isIPv6 = isIPv6;

  public setProvider(provider: INetworkProvider) {
    console.log(`[stdlib/net] provider → ${provider.name}`);
    this.provider = provider;
    this.Socket = provider.Socket;
    this.Server = provider.Server;
  }

  public getProvider(): INetworkProvider {
    return this.provider;
  }

  public createConnection(port: number, host: string, connectionListener?: () => void): ITcpSocket;
  public createConnection(options: any, connectionListener?: () => void): ITcpSocket;
  public createConnection(path: string, connectionListener?: () => void): ITcpSocket;
  public createConnection(
    portOrOptionsOrPath: any,
    hostOrCreateListener?: any,
    connectionListener?: () => void
  ): ITcpSocket {
    const socket = this.provider.createTcpSocket();
    socket.connect(portOrOptionsOrPath, hostOrCreateListener, connectionListener);
    return socket;
  }

  public connect(port: number, host: string, connectionListener?: () => void): ITcpSocket;
  public connect(options: any, connectionListener?: () => void): ITcpSocket;
  public connect(path: string, connectionListener?: () => void): ITcpSocket;
  public connect(
    portOrOptionsOrPath: any,
    hostOrCreateListener?: any,
    connectionListener?: () => void
  ): ITcpSocket {
    return this.createConnection(portOrOptionsOrPath, hostOrCreateListener, connectionListener);
  }

  public createServer(connectionListener?: (socket: ITcpSocket) => void): ITcpServer;
  public createServer(options?: any, connectionListener?: (socket: ITcpSocket) => void): ITcpServer;
  public createServer(
    optionsOrCreateListener?: any,
    connectionListener?: (socket: ITcpSocket) => void
  ): ITcpServer {
    let options = undefined;
    let listener = connectionListener;

    if (typeof optionsOrCreateListener === 'function') {
      listener = optionsOrCreateListener;
    } else if (typeof optionsOrCreateListener === 'object') {
      options = optionsOrCreateListener;
    }

    return this.provider.createTcpServer(options, listener);
  }
}

export const net = new NetworkManager();
export default net;
