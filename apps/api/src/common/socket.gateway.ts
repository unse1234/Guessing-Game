import {
  pingSchema,
  SOCKET_EVENTS,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@draw-and-guess/shared';
import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

@WebSocketGateway()
export class SocketGateway
  implements OnGatewayConnection<GameSocket>, OnGatewayDisconnect<GameSocket>
{
  private readonly logger = new Logger(SocketGateway.name);
  private readonly nextPing = new WeakMap<GameSocket, number>();

  handleConnection(socket: GameSocket) {
    if (process.env.NODE_ENV === 'development')
      this.logger.debug(`Connected ${socket.id}`);
  }

  handleDisconnect(socket: GameSocket) {
    if (process.env.NODE_ENV === 'development')
      this.logger.debug(`Disconnected ${socket.id}`);
  }

  @SubscribeMessage(SOCKET_EVENTS.ping)
  handlePing(
    @ConnectedSocket() socket: GameSocket,
    @MessageBody() payload: unknown,
  ) {
    const now = performance.now();
    if (now < (this.nextPing.get(socket) ?? 0)) return;
    const ping = pingSchema.safeParse(payload);
    if (ping.success) {
      this.nextPing.set(socket, now + 1_000);
      socket.emit(SOCKET_EVENTS.pong, {
        sentAt: ping.data.sentAt,
        serverTime: Date.now(),
      });
    }
  }
}
