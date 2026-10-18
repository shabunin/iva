import { INetworkProvider, ITcpSocket, IUdpSocket, ITcpServer } from '../../stdlib/net';
import { invoke } from '../bridge/tauri-core';
import { TauriTcpSocket } from './socket';
import { TauriTcpServer } from './server';
import { TauriUdpSocket } from './udp';

/**
 * Every socket and server the host still has from before: closed. A page
 * starting afresh (the panel after a reload) owns none of them, and a server
 * a page left listening (its close lost in the reload) would hold its port
 * from the new page's systems. How many went; 0 where the host has no such
 * command (iva dev's backend closes a page's sockets as its link closes).
 */
export async function closeHostSockets(): Promise<number> {
    try {
        const n = await invoke<number>('net_close_all');
        return typeof n === 'number' ? n : 0;
    } catch {
        return 0;
    }
}

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
