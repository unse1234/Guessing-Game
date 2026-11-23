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

  handleConnection(socket: GameSocket) {
    this.logger.log(`Connected ${socket.id}`);
  }

  handleDisconnect(socket: GameSocket) {
    this.logger.log(`Disconnected ${socket.id}`);
  }

  @SubscribeMessage(SOCKET_EVENTS.ping)
  handlePing(
    @ConnectedSocket() socket: GameSocket,
    @MessageBody() payload: unknown,
  ) {
    const ping = pingSchema.safeParse(payload);
    if (ping.success) {
      socket.emit(SOCKET_EVENTS.pong, {
        sentAt: ping.data.sentAt,
        serverTime: Date.now(),
      });
    }
  }
}
