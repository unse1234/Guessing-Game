import {
  SOCKET_EVENTS,
  type DrawingBatch,
  type DrawingEnded,
  type DrawingReceipt,
  type DrawingScope,
  type DrawingSnapshot,
  type DrawingStarted,
  type DrawingStroke,
  type RoomResponse,
} from '@draw-and-guess/shared';
import { createPointBatcher } from '@/features/game/lib/point-batcher';
import type { getGameSocket } from '@/lib/socket';
import { useGameStore } from '@/stores/game-store';

type GameSocket = ReturnType<typeof getGameSocket>;
type Batcher = ReturnType<typeof createPointBatcher>;
const ackTimeout = 5_000;
const maxPending = 8;

export interface DrawingView {
  scene: DrawingSnapshot | null;
  ready: boolean;
  error: string | null;
  generation: number;
}

export class DrawingSession {
  private scene: DrawingSnapshot | null = null;
  private ready = false;
  private disposed = false;
  private syncing = false;
  private pending = 0;
  private generation = 0;
  private epoch = 0;
  private error: string | null = null;
  private active?: { id: string; scope: DrawingScope; batcher: Batcher };
  private snapshotStarted = 0;
  private metrics = {
    start: 0,
    batches: 0,
    pairs: 0,
    started: 0,
    ended: 0,
    incoming: 0,
    delay: 0,
    firstEnd: 0,
  };

  constructor(
    private readonly socket: GameSocket,
    private readonly turnId: string,
    private readonly publish: (view: DrawingView) => void,
  ) {
    socket.on(SOCKET_EVENTS.drawStart, this.onStart);
    socket.on(SOCKET_EVENTS.drawPoints, this.onPoints);
    socket.on(SOCKET_EVENTS.drawEnd, this.onEnd);
    socket.on(SOCKET_EVENTS.drawClear, this.onClear);
  }

  dispose() {
    this.disposed = true;
    this.stopStroke();
    this.socket.off(SOCKET_EVENTS.drawStart, this.onStart);
    this.socket.off(SOCKET_EVENTS.drawPoints, this.onPoints);
    this.socket.off(SOCKET_EVENTS.drawEnd, this.onEnd);
    this.socket.off(SOCKET_EVENTS.drawClear, this.onClear);
  }

  stopStroke() {
    this.active?.batcher.stop();
    this.active = undefined;
  }

  sync(reason: string | null = null) {
    if (this.disposed || this.syncing || !this.socket.connected) return;
    this.stopStroke();
    this.ready = false;
    this.syncing = true;
    this.error = reason;
    this.snapshotStarted = performance.now();
    const epoch = ++this.epoch;
    this.notify();
    this.socket
      .timeout(ackTimeout)
      .emit(
        SOCKET_EVENTS.drawSync,
        { turnId: this.turnId },
        (error, result) => {
          if (this.disposed || this.epoch !== epoch || !this.syncing) return;
          if (error) this.syncFailed('Canvas sync timed out.');
          else if (!result.ok) this.syncFailed(result.error.message);
          // Apply inside the ACK callback so the next packet can update the snapshot.
          else this.applySnapshot(result.data);
        },
      );
  }

  start(stroke: DrawingStroke) {
    const scope = this.scope();
    if (!scope || this.active || this.pending > maxPending - 2) return false;
    const { points, id, ...brush } = stroke;
    const batcher = createPointBatcher(points, (sequence, batch) => {
      if (
        !this.socket.connected ||
        !this.ready ||
        !this.socket.io.engine?.transport.writable
      )
        return false;
      this.socket.volatile.emit(SOCKET_EVENTS.drawPoints, {
        ...scope,
        id,
        sequence,
        points: batch,
      });
      if (process.env.NODE_ENV === 'development') {
        this.metrics.batches++;
        this.metrics.pairs += batch.length / 2;
      }
      return true;
    });
    this.active = { id, scope, batcher };
    if (process.env.NODE_ENV === 'development') {
      this.metrics.start ||= performance.now();
      this.metrics.started++;
    }
    this.mutate(() =>
      this.socket.timeout(ackTimeout).emitWithAck(SOCKET_EVENTS.drawStart, {
        ...scope,
        id,
        ...brush,
        point: [points[0], points[1]],
      }),
    );
    return true;
  }

  point() {
    this.active?.batcher.queue();
  }

  finish(stroke: DrawingStroke) {
    const active = this.active;
    if (!active || active.id !== stroke.id || !this.scene) return;
    active.batcher.finish();
    this.active = undefined;
    this.scene = this.withStroke(this.scene, stroke);
    this.notify();
    const started = performance.now();
    this.mutate(
      () =>
        this.socket.timeout(ackTimeout).emitWithAck(SOCKET_EVENTS.drawEnd, {
          ...active.scope,
          id: stroke.id,
          points: stroke.points,
        }),
      () => {
        if (process.env.NODE_ENV === 'development') {
          this.metrics.ended++;
          this.metrics.firstEnd += performance.now() - started;
          this.logMetrics();
        }
      },
    );
  }

  clear() {
    const scope = this.scope();
    if (!scope || this.pending >= maxPending) return;
    this.stopStroke();
    this.ready = false;
    this.epoch++;
    this.notify();
    this.mutate(
      () =>
        this.socket
          .timeout(ackTimeout)
          .emitWithAck(SOCKET_EVENTS.drawClear, scope),
      (receipt) => this.onClear(receipt),
    );
  }

  private scope(): DrawingScope | null {
    if (!this.ready || !this.scene || !this.socket.connected) return null;
    return { turnId: this.turnId, canvasVersion: this.scene.canvasVersion };
  }

  private mutate(
    request: () => Promise<RoomResponse<DrawingReceipt>>,
    after?: (receipt: DrawingReceipt) => void,
  ) {
    const epoch = this.epoch;
    this.pending++;
    void request()
      .then(
        (result) => {
          if (this.disposed || this.epoch !== epoch) return;
          if (!result.ok) {
            this.sync(result.error.message);
            return;
          }
          after?.(result.data);
          if (this.scene?.canvasVersion === result.data.canvasVersion) {
            this.scene = {
              ...this.scene,
              revision: Math.max(this.scene.revision, result.data.revision),
            };
          }
        },
        () => {
          if (!this.disposed && this.epoch === epoch)
            this.sync('Canvas update timed out.');
        },
      )
      .finally(() => {
        this.pending--;
      });
  }

  private applySnapshot(snapshot: DrawingSnapshot) {
    if (
      snapshot.turnId !== this.turnId ||
      (this.scene &&
        (snapshot.revision < this.scene.revision ||
          snapshot.canvasVersion < this.scene.canvasVersion))
    )
      return this.syncFailed('The canvas snapshot was out of date.');
    this.scene = snapshot;
    this.ready = true;
    this.syncing = false;
    this.generation++;
    this.notify();
    if (process.env.NODE_ENV === 'development') {
      console.debug(
        `[drawing] snapshot restored in ${(performance.now() - this.snapshotStarted).toFixed(1)} ms`,
      );
    }
  }

  private syncFailed(message: string) {
    this.syncing = false;
    this.error = message;
    this.notify();
  }

  private onStart = (event: DrawingStarted) => {
    const scene = this.current(event);
    if (!scene) return;
    this.scene = {
      ...scene,
      revision: event.revision,
      active: { stroke: event.stroke, nextSequence: 0 },
    };
    this.notify();
  };

  private onPoints = (event: DrawingBatch) => {
    const scene = this.current(event);
    const active = scene?.active;
    if (
      !scene ||
      !active ||
      active.stroke.id !== event.id ||
      active.nextSequence !== event.sequence
    )
      return;

    this.scene = {
      ...scene,
      revision: event.revision,
      active: {
        stroke: {
          ...active.stroke,
          points: [...active.stroke.points, ...event.points],
        },
        nextSequence: event.sequence + 1,
      },
    };
    this.notify();
    if (process.env.NODE_ENV === 'development' && event.sentAt !== undefined) {
      this.metrics.start ||= performance.now();
      this.metrics.incoming++;
      this.metrics.delay +=
        Date.now() + useGameStore.getState().clockOffsetMs - event.sentAt;
      this.logMetrics();
    }
  };

  private onEnd = (event: DrawingEnded) => {
    const scene = this.current(event);
    if (!scene) return;
    this.scene = this.withStroke(
      { ...scene, revision: event.revision },
      event.stroke,
    );
    this.notify();
  };

  private onClear = (receipt: DrawingReceipt) => {
    if (
      this.syncing ||
      !this.scene ||
      receipt.turnId !== this.turnId ||
      receipt.canvasVersion <= this.scene.canvasVersion ||
      receipt.revision <= this.scene.revision
    )
      return;

    this.stopStroke();
    this.scene = { ...receipt, strokes: [], active: null };
    this.generation++;
    this.ready = true;
    this.error = null;
    this.notify();
  };

  private current(event: DrawingReceipt) {
    const scene = this.scene;
    return this.ready &&
      scene &&
      event.turnId === this.turnId &&
      event.canvasVersion === scene.canvasVersion &&
      event.revision > scene.revision
      ? scene
      : null;
  }

  private withStroke(
    scene: DrawingSnapshot,
    stroke: DrawingStroke,
  ): DrawingSnapshot {
    const hasStroke = scene.strokes.some((item) => item.id === stroke.id);
    return {
      ...scene,
      strokes: hasStroke
        ? scene.strokes.map((item) => (item.id === stroke.id ? stroke : item))
        : [...scene.strokes, stroke],
      active: scene.active?.stroke.id === stroke.id ? null : scene.active,
    };
  }

  private notify() {
    this.publish({
      scene: this.scene,
      ready: this.ready,
      error: this.error,
      generation: this.generation,
    });
  }

  private logMetrics() {
    const m = this.metrics;
    const seconds = (performance.now() - m.start) / 1_000;
    if (seconds < 1) return;
    if (m.batches || m.ended)
      console.debug(
        `[drawing] ${((m.batches + m.started + m.ended) / seconds).toFixed(1)} events/s, ${(m.pairs / (m.batches || 1)).toFixed(1)} points/batch, ${(m.firstEnd / (m.ended || 1)).toFixed(1)} ms final ACK avg`,
      );
    if (m.incoming)
      console.debug(
        `[drawing] ${(m.delay / m.incoming).toFixed(1)} ms approximate preview delivery average`,
      );
    this.metrics = {
      start: 0,
      batches: 0,
      pairs: 0,
      started: 0,
      ended: 0,
      incoming: 0,
      delay: 0,
      firstEnd: 0,
    };
  }
}
