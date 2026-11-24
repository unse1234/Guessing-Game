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
import { PeerRateLimit, socketLimits } from '../common/socket-limits';
import { RoomsService, type RoomChange } from './rooms.service';

export type RoomSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
export type RoomServer = Server<ClientToServerEvents, ServerToClientEvents>;

export const channel = (code: string) => `room:${code}`;
const requestLimit = 16;
const requestWindowMs = 10_000;
const guessRequestLimit = 32;

@WebSocketGateway()
export class RoomsGateway
  implements OnGatewayInit, OnGatewayDisconnect<RoomSocket>
{
  @WebSocketServer()
  private server!: RoomServer;

  private readonly controlLimits = new WeakMap<
    RoomSocket,
    { count: number; until: number }
  >();
  private readonly guessLimits = new WeakMap<
    RoomSocket,
    { count: number; until: number }
  >();
  private readonly creates = new PeerRateLimit(socketLimits.roomCreates);
  private readonly joins = new PeerRateLimit(socketLimits.roomJoins);
  private readonly reconnects = new PeerRateLimit(socketLimits.reconnects);

  constructor(private readonly rooms: RoomsService) {}

  afterInit() {
    this.rooms.onExpiry((change) => this.broadcast(change));
  }

  handleDisconnect(socket: RoomSocket) {
    this.controlLimits.delete(socket);
    this.guessLimits.delete(socket);
    const change = this.rooms.disconnect(socket.id);
    if (change) this.broadcast(change);
  }

  @SubscribeMessage(SOCKET_EVENTS.roomCreate)
  create(
    @ConnectedSocket() socket: RoomSocket,
    @MessageBody() payload: unknown,
    @Ack() ack: RoomAck<RoomSession>,
  ) {
    if (!this.allowRoomRequest(socket, ack, this.creates)) return;
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
    if (!this.allowRoomRequest(socket, ack, this.joins)) return;
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
    if (!this.allowRoomRequest(socket, ack, this.reconnects)) return;
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

    const membership = this.rooms.getConnection(socket.id);
    // Removing the drawer can synchronously publish to the room.
    if (membership) void socket.leave(channel(membership.code));
    const change = this.rooms.leave(socket.id);
    if ('ok' in change) {
      ack(change);
      return;
    }

    ack({ ok: true, data: null });
    if (change.kind === 'closed') {
      socket.emit(SOCKET_EVENTS.roomClosed, {
        code: change.code,
        reason: 'room_closed',
      });
    } else {
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

  broadcast(change: RoomChange) {
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

  private allowRoomRequest(
    socket: RoomSocket,
    ack: RoomAck<RoomSession>,
    peerBudget: PeerRateLimit,
  ) {
    if (!this.allow(socket, ack)) return false;
    if (peerBudget.take(socket.handshake.address)) return true;
    ack(roomError('RATE_LIMITED'));
    return false;
  }

  allow<T>(
    socket: RoomSocket,
    ack: RoomAck<T>,
    category: 'control' | 'guess' = 'control',
  ) {
    if (!socket.connected || typeof ack !== 'function') return false;
    const limits = category === 'guess' ? this.guessLimits : this.controlLimits;
    const limit = category === 'guess' ? guessRequestLimit : requestLimit;
    const now = performance.now();
    let budget = limits.get(socket);
    if (!budget || now >= budget.until) {
      budget = { count: 0, until: now + requestWindowMs };
      limits.set(socket, budget);
    }
    if (budget.count >= limit) {
      ack(roomError('RATE_LIMITED'));
      return false;
    }
    budget.count++;
    return true;
  }
}
