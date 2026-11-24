import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server, type ServerOptions } from 'socket.io';
import { PeerRateLimit, socketLimits } from './socket-limits';

export class SocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origin: string,
    private readonly maxConnections: number,
  ) {
    super(app);
  }

  override createIOServer(
    port: number | undefined,
    options?: Partial<ServerOptions>,
  ): Server {
    const handshakes = new PeerRateLimit(socketLimits.handshakes);
    const serverOptions: Partial<ServerOptions> = {
      ...options,
      maxHttpBufferSize: 16 * 1024,
      cors: { origin: this.origin },
      allowRequest: (request, callback) => {
        const origin = request.headers.origin;
        const allowedOrigin = origin === undefined || origin === this.origin;
        callback(
          null,
          allowedOrigin &&
            server.engine.clientsCount < this.maxConnections &&
            handshakes.take(request.socket.remoteAddress),
        );
      },
    };
    const server =
      this.httpServer && port === 0
        ? new Server(this.httpServer, serverOptions)
        : new Server(port, serverOptions);
    return server;
  }
}
