'use client';

import { memo, useEffect, useRef, useState, type PointerEvent } from 'react';
import { Circle, Layer, Line, Stage } from 'react-konva';
import type { useDrawing } from '@/features/game/hooks/use-drawing';
import {
  DRAWING_HEIGHT,
  DRAWING_WIDTH,
  type BrushSettings,
  type DrawingStroke,
} from '@/features/game/types/drawing';

interface DrawingCanvasProps {
  canDraw: boolean;
  brush: BrushSettings;
  drawing: ReturnType<typeof useDrawing>;
}

const StrokeShape = memo(function StrokeShape({
  stroke,
}: {
  stroke: DrawingStroke;
}) {
  const composite =
    stroke.tool === 'eraser' ? 'destination-out' : 'source-over';

  if (stroke.points.length === 2) {
    return (
      <Circle
        x={stroke.points[0]}
        y={stroke.points[1]}
        radius={stroke.size / 2}
        fill={stroke.color}
        globalCompositeOperation={composite}
      />
    );
  }

  return (
    <Line
      points={stroke.points}
      stroke={stroke.color}
      strokeWidth={stroke.size}
      lineCap="round"
      lineJoin="round"
      globalCompositeOperation={composite}
    />
  );
});

function getDrawingPoint(event: PointerEvent<HTMLDivElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  const x = ((event.clientX - rect.left) / rect.width) * DRAWING_WIDTH;
  const y = ((event.clientY - rect.top) / rect.height) * DRAWING_HEIGHT;
  return x >= 0 && x <= DRAWING_WIDTH && y >= 0 && y <= DRAWING_HEIGHT
    ? { x, y }
    : null;
}

export function DrawingCanvas({ canDraw, brush, drawing }: DrawingCanvasProps) {
  const surface = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!surface.current) return;

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(surface.current);
    return () => observer.disconnect();
  }, []);

  function handleDown(event: PointerEvent<HTMLDivElement>) {
    if (!canDraw || !event.isPrimary || event.button !== 0) return;
    const point = getDrawingPoint(event);
    if (!point || !drawing.start(event.pointerId, point, brush)) return;

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleMove(event: PointerEvent<HTMLDivElement>) {
    if (!canDraw) return;
    const point = getDrawingPoint(event);
    if (point) {
      drawing.append(event.pointerId, point);
    } else {
      drawing.finish(event.pointerId);
    }
  }

  function handleUp(event: PointerEvent<HTMLDivElement>) {
    handleMove(event);
    drawing.finish(event.pointerId);
  }

  function endStroke(event: PointerEvent<HTMLDivElement>) {
    drawing.finish(event.pointerId);
  }

  const scale = width / DRAWING_WIDTH;
  return (
    <div
      ref={surface}
      role="img"
      aria-label={canDraw ? 'Drawing canvas' : 'Read-only drawing canvas'}
      className={`aspect-3/2 w-full overflow-hidden rounded-md bg-card ring-1 ring-border ${canDraw ? 'cursor-crosshair touch-none select-none' : ''}`}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={endStroke}
      onPointerLeave={endStroke}
      onLostPointerCapture={endStroke}
    >
      {scale > 0 && (
        <Stage
          width={width}
          height={DRAWING_HEIGHT * scale}
          scaleX={scale}
          scaleY={scale}
        >
          <Layer listening={false}>
            {drawing.strokes.map((stroke) => (
              <StrokeShape key={stroke.id} stroke={stroke} />
            ))}
            {drawing.preview && (
              <StrokeShape key={drawing.preview.id} stroke={drawing.preview} />
            )}
          </Layer>
        </Stage>
      )}
    </div>
  );
}
