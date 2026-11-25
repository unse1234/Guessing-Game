import {
  drawClearSchema,
  drawCompletedSchema,
  drawEndSchema,
  drawPointsSchema,
  drawStartSchema,
  drawSyncSchema,
  drawUndoSchema,
  roomError,
  SOCKET_EVENTS,
  type CompletedDrawingSnapshot,
  type DrawingReceipt,
  type DrawingSnapshot,
  type DrawingUndone,
  type RoomAck,
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
import {
  channel,
  RoomsGateway,
  type RoomServer,
  type RoomSocket,
} from '../rooms/rooms.gateway';
import { DrawingService } from './drawing.service';

const burst = 96;
const eventsPerMs = 0.08;

@WebSocketGateway()
export class DrawingGateway
  implements OnGatewayInit, OnGatewayDisconnect<RoomSocket>
{
  @WebSocketServer()
  private server!: RoomServer;

  private readonly budgets = new WeakMap<
    RoomSocket,
    { tokens: number; at: number }
  >();
  private readonly snapshotAt = new WeakMap<RoomSocket, number>();

  constructor(
    private readonly drawings: DrawingService,
    private readonly rooms: RoomsGateway,
  ) {}

  afterInit() {
    this.drawings.onInterruptedStroke(({ code, data }) => {
      this.server.to(channel(code)).emit(SOCKET_EVENTS.drawEnd, data);
    });
  }

  handleDisconnect(socket: RoomSocket) {
    this.drawings.disconnect(socket.id);
  }

  @SubscribeMessage(SOCKET_EVENTS.drawStart)
  start(
    @ConnectedSocket() socket: RoomSocket,
    @MessageBody() raw: unknown,
    @Ack() ack: RoomAck<DrawingReceipt>,
  ) {
    if (!this.allowMutation(socket, ack)) return;
    const parsed = drawStartSchema.safeParse(raw);
    if (!parsed.success) return ack(roomError('INVALID_REQUEST'));

    const result = this.drawings.start(socket.id, parsed.data);
    if (!result.ok) return ack(result);
    const { receipt, event } = result.data;
    if (event)
      socket.to(channel(event.code)).emit(SOCKET_EVENTS.drawStart, event.data);
    ack({ ok: true, data: receipt });
  }

  @SubscribeMessage(SOCKET_EVENTS.drawPoints)
  points(@ConnectedSocket() socket: RoomSocket, @MessageBody() raw: unknown) {
    if (!this.take(socket)) return;
    const parsed = drawPointsSchema.safeParse(raw);
    if (!parsed.success) return;

    const result = this.drawings.points(socket.id, parsed.data);
    if (!result.ok || !result.data) return;
    const { code, data } = result.data;
    const batch =
      process.env.NODE_ENV === 'development'
        ? { ...data, sentAt: Date.now() }
        : data;
    socket.to(channel(code)).volatile.emit(SOCKET_EVENTS.drawPoints, batch);
  }

  @SubscribeMessage(SOCKET_EVENTS.drawEnd)
  end(
    @ConnectedSocket() socket: RoomSocket,
    @MessageBody() raw: unknown,
    @Ack() ack: RoomAck<DrawingReceipt>,
  ) {
    if (!this.allowMutation(socket, ack)) return;
    const parsed = drawEndSchema.safeParse(raw);
    if (!parsed.success) return ack(roomError('INVALID_REQUEST'));

    const result = this.drawings.end(socket.id, parsed.data);
    if (!result.ok) return ack(result);
    const { receipt, event } = result.data;
    if (event)
      socket.to(channel(event.code)).emit(SOCKET_EVENTS.drawEnd, event.data);
    ack({ ok: true, data: receipt });
  }

  @SubscribeMessage(SOCKET_EVENTS.drawClear)
  clear(
    @ConnectedSocket() socket: RoomSocket,
    @MessageBody() raw: unknown,
    @Ack() ack: RoomAck<DrawingReceipt>,
  ) {
    if (!this.rooms.allow(socket, ack)) return;
    const parsed = drawClearSchema.safeParse(raw);
    if (!parsed.success) return ack(roomError('INVALID_REQUEST'));

    const result = this.drawings.clear(socket.id, parsed.data);
    if (!result.ok) return ack(result);
    const { receipt, event } = result.data;
    if (event)
      socket.to(channel(event.code)).emit(SOCKET_EVENTS.drawClear, event.data);
    ack({ ok: true, data: receipt });
  }

  @SubscribeMessage(SOCKET_EVENTS.drawSync)
  sync(
    @ConnectedSocket() socket: RoomSocket,
    @MessageBody() raw: unknown,
    @Ack() ack: RoomAck<DrawingSnapshot>,
  ) {
    if (!this.rooms.allow(socket, ack)) return;
    const parsed = drawSyncSchema.safeParse(raw);
    if (!parsed.success) return ack(roomError('INVALID_REQUEST'));

    const now = performance.now();
    const last = this.snapshotAt.get(socket);
    if (last !== undefined && now - last < 250)
      return ack(roomError('RATE_LIMITED'));
    this.snapshotAt.set(socket, now);
    ack(this.drawings.snapshot(socket.id, parsed.data));
  }

  @SubscribeMessage(SOCKET_EVENTS.drawUndo)
  undo(
    @ConnectedSocket() socket: RoomSocket,
    @MessageBody() raw: unknown,
    @Ack() ack: RoomAck<DrawingUndone>,
  ) {
    if (!this.allowMutation(socket, ack)) return;
    const parsed = drawUndoSchema.safeParse(raw);
    if (!parsed.success) return ack(roomError('INVALID_REQUEST'));

    const result = this.drawings.undo(socket.id, parsed.data);
    if (!result.ok) return ack(result);
    const { code, data } = result.data;
    socket.to(channel(code)).emit(SOCKET_EVENTS.drawUndo, data);
    ack({ ok: true, data });
  }

  @SubscribeMessage(SOCKET_EVENTS.drawCompleted)
  completed(
    @ConnectedSocket() socket: RoomSocket,
    @MessageBody() raw: unknown,
    @Ack() ack: RoomAck<CompletedDrawingSnapshot>,
  ) {
    if (!this.rooms.allow(socket, ack)) return;
    const parsed = drawCompletedSchema.safeParse(raw);
    if (!parsed.success) return ack(roomError('INVALID_REQUEST'));
    ack(this.drawings.completed(socket.id, parsed.data));
  }

  private allowMutation<T extends DrawingReceipt>(
    socket: RoomSocket,
    ack: RoomAck<T>,
  ) {
    if (!socket.connected || typeof ack !== 'function') return false;
    if (this.take(socket)) return true;
    ack(roomError('RATE_LIMITED'));
    return false;
  }

  private take(socket: RoomSocket) {
    if (!socket.connected) return false;
    const now = performance.now();
    const previous = this.budgets.get(socket);
    const tokens = previous
      ? Math.min(burst, previous.tokens + (now - previous.at) * eventsPerMs)
      : burst;
    this.budgets.set(socket, {
      tokens: Math.max(0, tokens - (tokens >= 1 ? 1 : 0)),
      at: now,
    });
    return tokens >= 1;
  }
}
