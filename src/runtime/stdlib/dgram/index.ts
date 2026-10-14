import { net } from '../net/manager';
import type { IUdpSocket } from '../net/types';

/**
 * Node.js `dgram`-shaped facade.
 */
export const dgram = {
  createSocket(
    typeOrOptions: 'udp4' | 'udp6' | any,
    callback?: (msg: Uint8Array, rinfo: any) => void
  ): IUdpSocket {
    const socket = net.getProvider().createUdpSocket(typeOrOptions);
    if (callback) {
      socket.on('message', callback as any);
    }
    return socket;
  },
};

export default dgram;
