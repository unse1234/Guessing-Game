import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server, type ServerOptions } from 'socket.io';

export class SocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origin: string,
  ) {
    super(app);
  }

  override createIOServer(
    port: number | undefined,
    options?: Partial<ServerOptions>,
  ): Server {
    const serverOptions: Partial<ServerOptions> = {
      ...options,
      maxHttpBufferSize: 16 * 1024,
      cors: { origin: this.origin },
      allowRequest: (request, callback) => {
        const origin = request.headers.origin;
        callback(null, origin === undefined || origin === this.origin);
      },
    };
    if (this.httpServer && port === 0) {
      return new Server(this.httpServer, serverOptions);
    }
    return new Server(port, serverOptions);
  }
}
