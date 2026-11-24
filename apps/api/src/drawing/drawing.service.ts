import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import {
  MAX_DRAW_STROKE_POINTS,
  roomError,
  type DrawClear,
  type DrawEnd,
  type DrawPoints,
  type DrawStart,
  type DrawSync,
  type DrawingBatch,
  type DrawingEnded,
  type DrawingReceipt,
  type DrawingScope,
  type DrawingSnapshot,
  type DrawingStarted,
  type DrawingStroke,
  type RoomResponse,
} from '@draw-and-guess/shared';
import { GameService } from '../game/game.service';
import { RoomsService } from '../rooms/rooms.service';

const maxCanvasStrokes = 256;
const maxCanvasPoints = 24_576;
// Clearing the canvas does not reset the turn's traffic budget.
const maxTurnStrokes = 512;
const maxTurnPoints = 49_152;

interface ActiveStroke {
  socketId: string;
  stroke: DrawingStroke;
  nextSequence: number;
}

interface Canvas {
  code: string;
  turnId: string;
  canvasVersion: number;
  revision: number;
  strokes: Map<string, DrawingStroke>;
  active: ActiveStroke | null;
  points: number;
  turnPoints: number;
  turnStrokes: number;
}

type Mutation<T> = { receipt: DrawingReceipt; event?: T };
type Relay<T> = { code: string; data: T };

@Injectable()
export class DrawingService implements OnModuleDestroy {
  private readonly canvases = new Map<string, Canvas>();
  private readonly activeSockets = new Map<string, Canvas>();
  private readonly unsubscribe: (() => void)[];
  private publishEnd?: (event: Relay<DrawingEnded>) => void;

  constructor(
    private readonly rooms: RoomsService,
    private readonly games: GameService,
  ) {
    this.unsubscribe = [
      rooms.onRoomClosed((code) => this.remove(code)),
      games.onTransition(({ game }) => {
        const canvas = this.canvases.get(game.roomCode);
        if (!canvas) return;
        if (game.turnId !== canvas.turnId) this.remove(canvas.code);
        else if (game.phase === 'turn_ended') this.finalizeInterrupted(canvas);
      }),
    ];
  }

  onInterruptedStroke(listener: (event: Relay<DrawingEnded>) => void) {
    this.publishEnd = listener;
  }

  start(
    socketId: string,
    payload: DrawStart,
  ): RoomResponse<Mutation<Relay<DrawingStarted>>> {
    const result = this.writeAccess(socketId, payload);
    if (!result.ok) return result;
    const canvas = result.data;

    if (canvas.active && canvas.active.socketId !== socketId)
      this.finalizeInterrupted(canvas);
    if (
      canvas.strokes.has(payload.id) ||
      canvas.active?.stroke.id === payload.id
    )
      return this.ack(canvas);
    if (canvas.active) return roomError('INVALID_STROKE');
    if (
      canvas.strokes.size >= maxCanvasStrokes ||
      canvas.turnStrokes >= maxTurnStrokes ||
      !this.fits(canvas, 1)
    ) {
      return roomError('DRAWING_LIMIT');
    }

    const stroke: DrawingStroke = {
      id: payload.id,
      tool: payload.tool,
      color: payload.color,
      size: payload.size,
      points: [...payload.point],
    };
    canvas.active = { socketId, stroke, nextSequence: 0 };
    canvas.turnStrokes++;
    canvas.revision++;
    this.activeSockets.set(socketId, canvas);
    return this.ack(canvas, {
      code: canvas.code,
      data: {
        ...this.receipt(canvas),
        stroke: { ...stroke, points: [...stroke.points] },
      },
    });
  }

  points(
    socketId: string,
    payload: DrawPoints,
  ): RoomResponse<Relay<DrawingBatch> | null> {
    const result = this.writeAccess(socketId, payload);
    if (!result.ok) return result;
    const canvas = result.data;
    const active = canvas.active;
    if (
      !active ||
      active.socketId !== socketId ||
      active.stroke.id !== payload.id
    )
      return roomError('INVALID_STROKE');
    // Do not connect the preview across a missing batch. The full end packet repairs it.
    if (payload.sequence !== active.nextSequence)
      return { ok: true, data: null };
    const points = (active.stroke.points.length + payload.points.length) / 2;
    if (points > MAX_DRAW_STROKE_POINTS || !this.fits(canvas, points))
      return roomError('DRAWING_LIMIT');

    active.stroke.points.push(...payload.points);
    active.nextSequence++;
    canvas.revision++;
    return {
      ok: true,
      data: {
        code: canvas.code,
        data: {
          ...this.receipt(canvas),
          id: payload.id,
          sequence: payload.sequence,
          points: payload.points,
        },
      },
    };
  }

  end(
    socketId: string,
    payload: DrawEnd,
  ): RoomResponse<Mutation<Relay<DrawingEnded>>> {
    const result = this.writeAccess(socketId, payload);
    if (!result.ok) return result;
    const canvas = result.data;
    if (canvas.strokes.has(payload.id)) return this.ack(canvas);

    const active = canvas.active;
    if (
      !active ||
      active.socketId !== socketId ||
      active.stroke.id !== payload.id
    )
      return roomError('INVALID_STROKE');
    if (!this.fits(canvas, payload.points.length / 2))
      return roomError('DRAWING_LIMIT');
    if (
      active.stroke.points.some(
        (value, index) => value !== payload.points[index],
      )
    ) {
      return roomError('INVALID_STROKE');
    }

    const stroke = { ...active.stroke, points: [...payload.points] };
    return this.ack(canvas, this.commit(canvas, stroke));
  }

  clear(
    socketId: string,
    payload: DrawClear,
  ): RoomResponse<Mutation<Relay<DrawingReceipt>>> {
    const result = this.writeAccess(socketId, payload);
    if (!result.ok) return result;
    const canvas = result.data;
    this.dropActive(canvas);
    canvas.strokes.clear();
    canvas.points = 0;
    canvas.canvasVersion++;
    canvas.revision++;
    return this.ack(canvas, { code: canvas.code, data: this.receipt(canvas) });
  }

  snapshot(
    socketId: string,
    { turnId }: DrawSync,
  ): RoomResponse<DrawingSnapshot> {
    const member = this.rooms.getConnection(socketId);
    if (!member) return roomError('NOT_IN_ROOM');
    const turn = this.games.getDrawingTurn(member.code);
    if (!turn) return roomError('WRONG_PHASE');
    if (turn.turnId !== turnId) return roomError('STALE_CANVAS');

    const canvas = this.canvasFor(member.code, turnId);
    if (member.playerId === turn.drawerId) this.finalizeInterrupted(canvas);
    const { active } = canvas;
    return {
      ok: true,
      data: {
        ...this.receipt(canvas),
        strokes: [...canvas.strokes.values()],
        active: active
          ? {
              stroke: { ...active.stroke, points: [...active.stroke.points] },
              nextSequence: active.nextSequence,
            }
          : null,
      },
    };
  }

  disconnect(socketId: string) {
    const canvas = this.activeSockets.get(socketId);
    if (canvas) this.finalizeInterrupted(canvas);
  }

  onModuleDestroy() {
    for (const unsubscribe of this.unsubscribe) unsubscribe();
    this.publishEnd = undefined;
    this.activeSockets.clear();
    this.canvases.clear();
  }

  private writeAccess(
    socketId: string,
    scope: DrawingScope,
  ): RoomResponse<Canvas> {
    const member = this.rooms.getConnection(socketId);
    if (!member) return roomError('NOT_IN_ROOM');
    const turn = this.games.getDrawingTurn(member.code);
    if (!turn?.writable) return roomError('WRONG_PHASE');
    if (turn.drawerId !== member.playerId) return roomError('NOT_DRAWER');
    if (turn.turnId !== scope.turnId) return roomError('STALE_CANVAS');

    const canvas = this.canvasFor(member.code, turn.turnId);
    if (canvas.canvasVersion !== scope.canvasVersion)
      return roomError('STALE_CANVAS');
    return { ok: true, data: canvas };
  }

  private canvasFor(code: string, turnId: string) {
    const existing = this.canvases.get(code);
    if (existing?.turnId === turnId) return existing;

    this.remove(code);
    const canvas: Canvas = {
      code,
      turnId,
      canvasVersion: 0,
      revision: 0,
      strokes: new Map(),
      active: null,
      points: 0,
      turnPoints: 0,
      turnStrokes: 0,
    };
    this.canvases.set(code, canvas);
    return canvas;
  }

  private fits(canvas: Canvas, points: number) {
    return (
      canvas.points + points <= maxCanvasPoints &&
      canvas.turnPoints + points <= maxTurnPoints
    );
  }

  private finalizeInterrupted(canvas: Canvas) {
    if (!canvas.active) return;
    const event = this.commit(canvas, canvas.active.stroke);
    this.publishEnd?.(event);
  }

  private commit(canvas: Canvas, stroke: DrawingStroke): Relay<DrawingEnded> {
    this.dropActive(canvas);
    const points = stroke.points.length / 2;
    canvas.points += points;
    canvas.turnPoints += points;
    canvas.strokes.set(stroke.id, stroke);
    canvas.revision++;
    return { code: canvas.code, data: { ...this.receipt(canvas), stroke } };
  }

  private remove(code: string) {
    const canvas = this.canvases.get(code);
    if (canvas) this.dropActive(canvas);
    this.canvases.delete(code);
  }

  private dropActive(canvas: Canvas) {
    if (canvas.active) this.activeSockets.delete(canvas.active.socketId);
    canvas.active = null;
  }

  private receipt({ turnId, canvasVersion, revision }: Canvas): DrawingReceipt {
    return { turnId, canvasVersion, revision };
  }

  private ack<T>(canvas: Canvas, event?: T): RoomResponse<Mutation<T>> {
    return { ok: true, data: { receipt: this.receipt(canvas), event } };
  }
}
