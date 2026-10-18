import { INetworkProvider, ITcpSocket, IUdpSocket, ITcpServer } from '../../stdlib/net';
import { invoke } from '../bridge/tauri-core';
import { TauriTcpSocket } from './socket';
import { TauriTcpServer } from './server';
import { TauriUdpSocket } from './udp';

/** what a page before left on the host, closed now */
export interface HostSocketsClosed {
    servers: number;
    connections: number;
    udp: number;
    tls: number;
    total: number;
}

/**
 * Every socket and server the host still has from before: closed. A page
 * starting afresh (the panel after a reload) owns none of them, and a server
 * a page left listening (its close lost in the reload) would hold its port
 * from the new page's systems. What went, by kind; nothing where the host has
 * no such command (iva dev's backend closes a page's sockets as its link closes).
 */
export async function closeHostSockets(): Promise<HostSocketsClosed> {
    const none = { servers: 0, connections: 0, udp: 0, tls: 0, total: 0 };
    try {
        const c = await invoke<Partial<HostSocketsClosed>>('net_close_all');
        if (!c || typeof c !== 'object') return none;
        const got = { servers: c.servers ?? 0, connections: c.connections ?? 0, udp: c.udp ?? 0, tls: c.tls ?? 0 };
        return { ...got, total: got.servers + got.connections + got.udp + got.tls };
    } catch {
        return none;
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
