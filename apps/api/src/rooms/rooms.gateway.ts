import {
  roomCreateSchema,
  roomError,
  roomJoinSchema,
  roomLeaveSchema,
  roomRejoinSchema,
  SOCKET_EVENTS,
  type ClientToServerEvents,
  type RoomAck,
  type RoomSession,
  type RoomSnapshot,
  type ServerToClientEvents,
} from '@draw-and-guess/shared';
import {
  Ack,
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayDisconnect,
  type OnGatewayInit,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { RoomsService, type RoomChange } from './rooms.service';

type RoomSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type RoomServer = Server<ClientToServerEvents, ServerToClientEvents>;

const channel = (code: string) => `room:${code}`;
const requestLimit = 16;
const requestWindowMs = 10_000;

@WebSocketGateway()
export class RoomsGateway
  implements OnGatewayInit, OnGatewayDisconnect<RoomSocket>
{
  @WebSocketServer()
  private server!: RoomServer;

  private readonly limits = new WeakMap<
    RoomSocket,
    { count: number; until: number }
  >();

  constructor(private readonly rooms: RoomsService) {}

  afterInit() {
    this.rooms.onExpiry((change) => this.broadcast(change));
  }

  handleDisconnect(socket: RoomSocket) {
    this.limits.delete(socket);
    const change = this.rooms.disconnect(socket.id);
    if (change) this.broadcast(change);
  }

  @SubscribeMessage(SOCKET_EVENTS.roomCreate)
  create(
    @ConnectedSocket() socket: RoomSocket,
    @MessageBody() payload: unknown,
    @Ack() ack: RoomAck<RoomSession>,
  ) {
    if (!this.allow(socket, ack)) return;
    const request = roomCreateSchema.safeParse(payload);
    if (!request.success) {
      ack(
        roomError(
          request.error.issues[0]?.path[0] === 'nickname'
            ? 'INVALID_NICKNAME'
            : 'INVALID_REQUEST',
        ),
      );
      return;
    }
    this.complete(
      socket,
      ack,
      this.rooms.create(socket.id, request.data.nickname),
    );
  }

  @SubscribeMessage(SOCKET_EVENTS.roomJoin)
  join(
    @ConnectedSocket() socket: RoomSocket,
    @MessageBody() payload: unknown,
    @Ack() ack: RoomAck<RoomSession>,
  ) {
    if (!this.allow(socket, ack)) return;
    const request = roomJoinSchema.safeParse(payload);
    if (!request.success) {
      const field = request.error.issues[0]?.path[0];
      ack(
        roomError(
          field === 'nickname'
            ? 'INVALID_NICKNAME'
            : field === 'code'
              ? 'INVALID_CODE'
              : 'INVALID_REQUEST',
        ),
      );
      return;
    }
    this.complete(
      socket,
      ack,
      this.rooms.join(socket.id, request.data.code, request.data.nickname),
    );
  }

  @SubscribeMessage(SOCKET_EVENTS.roomRejoin)
  rejoin(
    @ConnectedSocket() socket: RoomSocket,
    @MessageBody() payload: unknown,
    @Ack() ack: RoomAck<RoomSession>,
  ) {
    if (!this.allow(socket, ack)) return;
    const request = roomRejoinSchema.safeParse(payload);
    if (!request.success) {
      ack(
        roomError(
          request.error.issues[0]?.path[0] === 'code'
            ? 'INVALID_CODE'
            : 'INVALID_REQUEST',
        ),
      );
      return;
    }
    this.complete(
      socket,
      ack,
      this.rooms.rejoin(
        socket.id,
        request.data.code,
        request.data.reconnectToken,
      ),
    );
  }

  @SubscribeMessage(SOCKET_EVENTS.roomLeave)
  leave(
    @ConnectedSocket() socket: RoomSocket,
    @MessageBody() payload: unknown,
    @Ack() ack: RoomAck<null>,
  ) {
    if (!this.allow(socket, ack)) return;
    if (!roomLeaveSchema.safeParse(payload).success) {
      ack(roomError('INVALID_REQUEST'));
      return;
    }

    const change = this.rooms.leave(socket.id);
    if ('ok' in change) {
      ack(change);
      return;
    }

    ack({ ok: true, data: null });
    if (change.kind === 'closed') {
      this.broadcast(change);
      void socket.leave(channel(change.code));
    } else {
      void socket.leave(channel(change.room.code));
      this.broadcast(change);
    }
  }

  private complete(
    socket: RoomSocket,
    ack: RoomAck<RoomSession>,
    result: ReturnType<RoomsService['rejoin']>,
  ) {
    if (!result.ok) {
      ack(result);
      return;
    }

    const { room } = result.data;
    const name = channel(room.code);
    if (result.replacedSocketId) {
      const oldSocket = this.server.sockets.sockets.get(
        result.replacedSocketId,
      );
      void oldSocket?.leave(name);
      oldSocket?.emit(SOCKET_EVENTS.roomClosed, {
        code: room.code,
        reason: 'session_replaced',
      });
    }

    // The default in-memory Socket.IO adapter joins synchronously.
    void socket.join(name);
    ack({ ok: true, data: result.data });
    if (result.changed)
      socket.to(name).emit(SOCKET_EVENTS.roomUpdated, this.update(room));
  }

  private broadcast(change: RoomChange) {
    if (change.kind === 'closed') {
      this.server.to(channel(change.code)).emit(SOCKET_EVENTS.roomClosed, {
        code: change.code,
        reason: 'room_closed',
      });
    } else {
      this.server
        .to(channel(change.room.code))
        .emit(SOCKET_EVENTS.roomUpdated, this.update(change.room));
    }
  }

  private update(room: RoomSnapshot) {
    return process.env.NODE_ENV === 'development'
      ? { room, sentAt: Date.now() }
      : { room };
  }

  private allow<T>(socket: RoomSocket, ack: RoomAck<T>) {
    if (!socket.connected || typeof ack !== 'function') return false;
    const now = performance.now();
    let budget = this.limits.get(socket);
    if (!budget || now >= budget.until) {
      budget = { count: 0, until: now + requestWindowMs };
      this.limits.set(socket, budget);
    }
    if (budget.count >= requestLimit) {
      ack(roomError('RATE_LIMITED'));
      return false;
    }
    budget.count++;
    return true;
  }
}
