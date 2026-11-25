'use client';

import type Konva from 'konva';
import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import { Circle, Group, Layer, Line, Stage } from 'react-konva';
import { useDrawing } from '@/features/game/hooks/use-drawing';
import { strokeShape } from '@/features/game/lib/stroke-shape';
import {
  DRAWING_HEIGHT,
  DRAWING_WIDTH,
  type BrushSettings,
  type DrawingStroke,
} from '@/features/game/types/drawing';

interface DrawingCanvasProps {
  canDraw: boolean;
  brush: BrushSettings;
  strokes: readonly DrawingStroke[];
  remotePreview: DrawingStroke | null;
  onStart: (stroke: DrawingStroke) => boolean;
  onPoint: () => void;
  onFinish: (stroke: DrawingStroke) => void;
}

const minCachedStrokes = 16;

const StrokeShape = memo(function StrokeShape({
  stroke,
}: {
  stroke: DrawingStroke;
}) {
  const shape = strokeShape(stroke);
  return shape.kind === 'circle' ? (
    <Circle {...shape.props} />
  ) : (
    <Line {...shape.props} />
  );
});

const CompletedStrokes = memo(function CompletedStrokes({
  strokes,
  scale,
}: {
  strokes: readonly DrawingStroke[];
  scale: number;
}) {
  const group = useRef<Konva.Group>(null);

  useLayoutEffect(() => {
    const ink = group.current;
    const layer = ink?.getLayer();
    if (!ink || !layer) return;
    if (strokes.length < minCachedStrokes) {
      if (ink.isCached()) ink.clearCache();
      return;
    }

    // Rasterize at the display resolution. The live eraser stays on the same layer.
    ink.cache({
      x: 0,
      y: 0,
      width: DRAWING_WIDTH,
      height: DRAWING_HEIGHT,
      pixelRatio: scale * layer.getCanvas().getPixelRatio(),
    });
  }, [strokes, scale]);

  return (
    <Group ref={group} listening={false}>
      {strokes.map((stroke) => (
        <StrokeShape key={stroke.id} stroke={stroke} />
      ))}
    </Group>
  );
});

function getDrawingPoint(event: PointerEvent<HTMLDivElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  const x = ((event.clientX - rect.left) / rect.width) * DRAWING_WIDTH;
  const y = ((event.clientY - rect.top) / rect.height) * DRAWING_HEIGHT;
  return x >= 0 && x <= DRAWING_WIDTH && y >= 0 && y <= DRAWING_HEIGHT
    ? { x: Math.round(x), y: Math.round(y) }
    : null;
}

export function DrawingCanvas({
  canDraw,
  brush,
  strokes,
  remotePreview,
  onStart,
  onPoint,
  onFinish,
}: DrawingCanvasProps) {
  const drawing = useDrawing({
    start: onStart,
    point: onPoint,
    finish: onFinish,
  });
  const preview = (canDraw ? drawing.preview : null) ?? remotePreview;
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
            <CompletedStrokes strokes={strokes} scale={scale} />
            {preview && <StrokeShape key={preview.id} stroke={preview} />}
          </Layer>
        </Stage>
      )}
    </div>
  );
}
