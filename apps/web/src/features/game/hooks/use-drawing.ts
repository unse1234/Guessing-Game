import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BrushSettings,
  DrawingPoint,
  DrawingStroke,
} from '@/features/game/types/drawing';

interface ActiveStroke {
  pointerId: number;
  stroke: DrawingStroke;
}

export function useDrawing() {
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [preview, setPreview] = useState<DrawingStroke | null>(null);
  const active = useRef<ActiveStroke | null>(null);
  const frame = useRef<number | null>(null);
  const sequence = useRef(0);

  const cancelFrame = useCallback(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
  }, []);

  useEffect(() => cancelFrame, [cancelFrame]);

  function start(pointerId: number, point: DrawingPoint, brush: BrushSettings) {
    if (active.current) return false;

    const stroke = {
      ...brush,
      id: `local-${++sequence.current}`,
      points: [point.x, point.y],
    };
    active.current = { pointerId, stroke };
    setPreview({ ...stroke, points: [...stroke.points] });
    return true;
  }

  function append(pointerId: number, { x, y }: DrawingPoint) {
    const current = active.current;
    if (current?.pointerId !== pointerId) return;

    const points = current.stroke.points;
    if (
      Math.hypot(x - points[points.length - 2], y - points[points.length - 1]) <
      1
    )
      return;

    // Keep the points being built separate from the snapshots used by React.
    points.push(x, y);
    if (frame.current === null) {
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        if (active.current) {
          const stroke = active.current.stroke;
          setPreview({ ...stroke, points: [...stroke.points] });
        }
      });
    }
  }

  function finish(pointerId: number) {
    const current = active.current;
    if (current?.pointerId !== pointerId) return;

    active.current = null;
    cancelFrame();
    setStrokes((previous) => [...previous, current.stroke]);
    setPreview(null);
  }

  const clear = useCallback(() => {
    active.current = null;
    cancelFrame();
    setStrokes([]);
    setPreview(null);
  }, [cancelFrame]);

  return { strokes, preview, start, append, finish, clear };
}
