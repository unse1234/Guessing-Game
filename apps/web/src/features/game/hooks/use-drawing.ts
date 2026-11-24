import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAX_DRAW_STROKE_POINTS,
  type BrushSettings,
  type DrawingStroke,
} from '@draw-and-guess/shared';
import type { DrawingPoint } from '@/features/game/types/drawing';

interface StrokeHandlers {
  start: (stroke: DrawingStroke) => boolean;
  point: () => void;
  finish: (stroke: DrawingStroke) => void;
}

interface ActiveStroke {
  pointerId: number;
  stroke: DrawingStroke;
}

export function useDrawing(handlers: StrokeHandlers) {
  const [preview, setPreview] = useState<DrawingStroke | null>(null);
  const active = useRef<ActiveStroke | null>(null);
  const frame = useRef<number | null>(null);

  const cancelFrame = useCallback(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
  }, []);

  useEffect(() => cancelFrame, [cancelFrame]);

  function start(pointerId: number, point: DrawingPoint, brush: BrushSettings) {
    if (active.current) return false;
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) =>
      value.toString(16).padStart(2, '0'),
    ).join('');
    const stroke = { ...brush, id, points: [point.x, point.y] };
    if (!handlers.start(stroke)) return false;
    active.current = { pointerId, stroke };
    setPreview({ ...stroke, points: [...stroke.points] });
    return true;
  }

  function append(pointerId: number, { x, y }: DrawingPoint) {
    const current = active.current;
    if (current?.pointerId !== pointerId) return;
    const points = current.stroke.points;
    if (points.length >= MAX_DRAW_STROKE_POINTS * 2) return;
    if (x === points[points.length - 2] && y === points[points.length - 1])
      return;

    points.push(x, y);
    handlers.point();
    if (frame.current === null) {
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        const stroke = active.current?.stroke;
        if (stroke) setPreview({ ...stroke, points: [...stroke.points] });
      });
    }
  }

  function finish(pointerId: number) {
    const current = active.current;
    if (current?.pointerId !== pointerId) return;
    active.current = null;
    cancelFrame();
    setPreview(null);
    handlers.finish(current.stroke);
  }

  return { preview, start, append, finish };
}
