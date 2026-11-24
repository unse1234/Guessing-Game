'use client';

import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';
import {
  DrawingToolbar,
  DrawingTools,
} from '@/features/game/components/drawing-toolbar';
import { drawingColors } from '@/features/game/data/drawing-colors';
import { useDrawingSync } from '@/features/game/hooks/use-drawing-sync';
import type { DrawingTool } from '@/features/game/types/drawing';
import styles from './game-screen.module.css';

const DrawingCanvas = dynamic(
  () =>
    import('@/features/game/components/drawing-canvas').then(
      (module) => module.DrawingCanvas,
    ),
  {
    ssr: false,
    loading: () => (
      <div
        className="aspect-3/2 rounded-md bg-card ring-1 ring-border"
        aria-label="Loading drawing canvas"
      />
    ),
  },
);

export function DrawingBoard({
  code,
  turnId,
  connected,
  canDraw,
  readOnly,
}: {
  code: string;
  turnId: string | null;
  connected: boolean;
  canDraw: boolean;
  readOnly: boolean;
}) {
  const drawing = useDrawingSync(code, turnId, connected, canDraw);
  const [tool, setTool] = useState<DrawingTool>('pen');
  const [color, setColor] = useState<string>(drawingColors[0].value);
  const [size, setSize] = useState(8);

  const selectColor = useCallback((value: string) => {
    setColor(value);
    setTool('pen');
  }, []);

  return (
    <div
      className={`${styles.drawingBoard} grid min-w-0 gap-2`}
      data-readonly={readOnly}
    >
      <div className={styles.board}>
        <DrawingTools
          tool={tool}
          size={size}
          disabled={!drawing.enabled}
          onToolChange={setTool}
          onSizeChange={setSize}
          onClear={drawing.clear}
        />
        <div className={styles.canvasSlot}>
          <DrawingCanvas
            key={`${drawing.key}:${canDraw}`}
            canDraw={drawing.enabled}
            brush={{ color, size, tool }}
            strokes={drawing.strokes}
            remotePreview={drawing.remotePreview}
            onStart={drawing.start}
            onPoint={drawing.point}
            onFinish={drawing.finish}
          />
        </div>
      </div>
      <DrawingToolbar
        color={color}
        size={size}
        disabled={!drawing.enabled}
        onSelectColor={selectColor}
        onSizeChange={setSize}
      />
      {drawing.error && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <p role="status">{drawing.error}</p>
          {drawing.showRetry && (
            <button type="button" className="underline" onClick={drawing.retry}>
              Retry canvas sync
            </button>
          )}
        </div>
      )}
    </div>
  );
}
