import { INetworkProvider, ITcpSocket, IUdpSocket, ITcpServer } from '../../stdlib/net';
import { TauriTcpSocket } from './socket';
import { TauriTcpServer } from './server';
import { TauriUdpSocket } from './udp';

export class TauriNetworkProvider implements INetworkProvider {
    name = "TauriNetProvider";
    Socket = TauriTcpSocket;
    Server = TauriTcpServer;

    createTcpSocket(): ITcpSocket {
        return new TauriTcpSocket();
    }

    createUdpSocket(type: 'udp4' | 'udp6' = 'udp4'): IUdpSocket {
        return new TauriUdpSocket(type);
    }

    createTcpServer(options?: any, connectionListener?: (socket: any) => void): ITcpServer {
        return new TauriTcpServer(options, connectionListener);
    }
}
