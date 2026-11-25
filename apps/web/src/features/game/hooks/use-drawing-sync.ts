import { useCallback, useEffect, useRef, useState } from 'react';
import type { DrawingStroke } from '@draw-and-guess/shared';
import {
  DrawingSession,
  type DrawingView,
} from '@/features/game/lib/drawing-session';
import { getActiveRoomSocket } from '@/lib/room-client';

type BoundView = DrawingView & { socketId: string; turnId: string };
const noStrokes: DrawingStroke[] = [];

export function useDrawingSync(
  code: string,
  turnId: string | null,
  connected: boolean,
  canDraw: boolean,
) {
  const socket = connected ? getActiveRoomSocket(code) : undefined;
  const socketId = socket?.id;
  const session = useRef<DrawingSession | null>(null);
  const [view, setView] = useState<BoundView | null>(null);

  useEffect(() => {
    if (!socket || !socketId || !turnId) return;
    const current = new DrawingSession(socket, turnId, (next) =>
      setView({ ...next, socketId, turnId }),
    );
    session.current = current;
    current.sync();
    return () => {
      current.dispose();
      session.current = null;
    };
  }, [socket, socketId, turnId]);

  useEffect(() => {
    if (!canDraw) session.current?.stopStroke();
  }, [canDraw]);

  const start = useCallback(
    (stroke: DrawingStroke) => session.current?.start(stroke) ?? false,
    [],
  );
  const point = useCallback(() => session.current?.point(), []);
  const finish = useCallback(
    (stroke: DrawingStroke) => session.current?.finish(stroke),
    [],
  );
  const clear = useCallback(() => session.current?.clear(), []);
  const undo = useCallback(() => session.current?.undo(), []);
  const retry = useCallback(() => session.current?.sync(), []);

  const current =
    turnId && view?.turnId === turnId && view.socketId === socketId
      ? view
      : null;
  const saved = !connected || view?.turnId === turnId ? view?.scene : null;

  return {
    enabled: Boolean(canDraw && current?.ready),
    canUndo: Boolean(canDraw && current?.canUndo),
    strokes: saved?.strokes ?? noStrokes,
    remotePreview: saved?.active?.stroke ?? null,
    key: `${socketId ?? 'offline'}:${turnId ?? 'waiting'}:${current?.generation ?? 0}`,
    error: current?.error ?? null,
    showRetry: Boolean(current?.error && !current.ready),
    start,
    point,
    finish,
    clear,
    undo,
    retry,
  };
}
