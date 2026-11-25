'use client';

import { Eraser, Pencil, Trash2, Undo2 } from 'lucide-react';
import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DrawingColorWheel } from '@/features/game/components/drawing-color-wheel';
import { quickDrawingColors } from '@/features/game/data/drawing-colors';
import {
  MAX_BRUSH_SIZE,
  MIN_BRUSH_SIZE,
  type DrawingTool,
} from '@/features/game/types/drawing';
import styles from './game-screen.module.css';

interface DrawingToolsProps {
  tool: DrawingTool;
  size: number;
  disabled: boolean;
  undoDisabled: boolean;
  onToolChange: (tool: DrawingTool) => void;
  onSizeChange: (size: number) => void;
  onClear: () => void;
  onUndo: () => void;
}

const toolChoices = [
  { tool: 'pen', label: 'Pencil', Icon: Pencil },
  { tool: 'eraser', label: 'Eraser', Icon: Eraser },
] as const;

export const DrawingTools = memo(function DrawingTools({
  tool,
  size,
  disabled,
  undoDisabled,
  onToolChange,
  onSizeChange,
  onClear,
  onUndo,
}: DrawingToolsProps) {
  return (
    <div
      role="group"
      aria-label="Drawing tools"
      className={`${styles.tools} flex flex-wrap gap-1 rounded-md border bg-background/40 p-1`}
    >
      {toolChoices.map(({ tool: value, label, Icon }) => (
        <Button
          key={value}
          type="button"
          variant={tool === value ? 'secondary' : 'outline'}
          size="icon"
          aria-label={label}
          aria-pressed={tool === value}
          title={label}
          disabled={disabled}
          onClick={() => onToolChange(value)}
          className="size-10 shrink-0 transition-none focus-visible:ring-ring sm:size-11 [@media(pointer:coarse)]:size-11"
        >
          <Icon aria-hidden="true" className="size-5" />
        </Button>
      ))}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex shrink-0">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Undo last stroke"
                disabled={undoDisabled}
                onClick={onUndo}
                className="size-10 shrink-0 transition-none focus-visible:ring-ring sm:size-11 [@media(pointer:coarse)]:size-11"
              >
                <Undo2 aria-hidden="true" className="size-5" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent sideOffset={4}>Undo last stroke</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Clear canvas"
        title="Clear canvas"
        disabled={disabled}
        onClick={onClear}
        className="size-10 shrink-0 transition-none focus-visible:ring-ring sm:size-11 [@media(pointer:coarse)]:size-11"
      >
        <Trash2 aria-hidden="true" className="size-5" />
      </Button>
      <div
        className={`${styles.presets} hidden border-t pt-1`}
        role="group"
        aria-label="Brush presets"
      >
        {[6, 12, 22].map((preset) => (
          <Button
            key={preset}
            type="button"
            variant={size === preset ? 'secondary' : 'ghost'}
            size="icon"
            aria-label={`Brush size ${preset} pixels`}
            aria-pressed={size === preset}
            disabled={disabled}
            onClick={() => onSizeChange(preset)}
            className="size-9 transition-none focus-visible:ring-ring [@media(pointer:coarse)]:size-11"
          >
            <span
              className="rounded-full bg-foreground"
              style={{ width: preset, height: preset }}
            />
          </Button>
        ))}
      </div>
    </div>
  );
});

interface DrawingToolbarProps {
  color: string;
  size: number;
  disabled: boolean;
  onSelectColor: (color: string) => void;
  onSizeChange: (size: number) => void;
}

export const DrawingToolbar = memo(function DrawingToolbar({
  color,
  size,
  disabled,
  onSelectColor,
  onSizeChange,
}: DrawingToolbarProps) {
  return (
    <div
      className={`${styles.toolbar} grid gap-x-4 gap-y-2 rounded-md border bg-secondary/40 px-2 py-1.5 sm:px-3`}
    >
      <div
        role="group"
        aria-label="Colors"
        className="flex flex-wrap items-center gap-1"
      >
        <span className="mr-1 text-sm font-semibold">Colors</span>
        {quickDrawingColors.map(({ value, label }) => (
          <Button
            key={value}
            type="button"
            variant="ghost"
            size="icon"
            aria-label={label}
            title={label}
            aria-pressed={color === value}
            disabled={disabled}
            onClick={() => onSelectColor(value)}
            className="size-9 rounded-md border border-transparent p-1 transition-none aria-pressed:border-ring focus-visible:ring-ring [@media(pointer:coarse)]:size-11"
          >
            <span
              aria-hidden="true"
              className="size-5 rounded-full border border-foreground/50"
              style={{ backgroundColor: value }}
            />
          </Button>
        ))}
        <DrawingColorWheel
          color={color}
          disabled={disabled}
          onSelectColor={onSelectColor}
        />
      </div>

      <div className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 text-sm font-medium">Brush Size</span>
        <Slider
          thumbLabel="Brush size"
          min={MIN_BRUSH_SIZE}
          max={MAX_BRUSH_SIZE}
          value={[size]}
          onValueChange={([value]) => onSizeChange(value)}
          disabled={disabled}
          className="min-h-9 min-w-0 flex-1 [@media(pointer:coarse)]:min-h-11"
        />
        <span className="w-10 shrink-0 text-right text-xs tabular-nums">
          {size} px
        </span>
      </div>
    </div>
  );
});
