'use client';

import { useState, type PointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import {
  hexToWheelColor,
  wheelColorToHex,
} from '@/features/game/lib/drawing-color';

const wheelBackground =
  'radial-gradient(circle closest-side, white, transparent), conic-gradient(from 90deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)';

const controls = [
  { channel: 'hue', label: 'Hue', max: 359, scale: 1 },
  { channel: 'saturation', label: 'Saturation', max: 100, scale: 100 },
  { channel: 'brightness', label: 'Brightness', max: 100, scale: 100 },
] as const;

export function DrawingColorWheel({
  color,
  disabled,
  onSelectColor,
}: {
  color: string;
  disabled: boolean;
  onSelectColor: (color: string) => void;
}) {
  const [draft, setDraft] = useState(() => hexToWheelColor(color));
  const preview = wheelColorToHex(draft);
  const angle = (draft.hue * Math.PI) / 180;

  function pickFromWheel(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    const y = ((event.clientY - bounds.top) / bounds.height) * 2 - 1;
    setDraft((current) => ({
      hue: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360,
      saturation: Math.min(1, Math.hypot(x, y)),
      brightness: current.brightness || 1,
    }));
  }

  const trigger = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      className="h-9 transition-none [@media(pointer:coarse)]:h-11"
    >
      <span
        aria-hidden="true"
        className="size-4 rounded-full border border-foreground/50"
        style={{ backgroundColor: color }}
      />
      Color wheel
    </Button>
  );

  // Removing the dialog closes it when the player loses their drawing turn.
  if (disabled) return trigger;

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) setDraft(hexToWheelColor(color));
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="gap-3 p-4 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Color wheel</DialogTitle>
          <DialogDescription className="sr-only">
            Pick a color with the wheel or adjust the sliders.
          </DialogDescription>
        </DialogHeader>
        <div className="grid items-center gap-3 min-[30rem]:grid-cols-[auto_minmax(0,1fr)]">
          <div
            data-slot="drawing-color-wheel"
            aria-hidden="true"
            className="relative size-[clamp(7rem,34dvh,10rem)] cursor-crosshair touch-none justify-self-center rounded-full ring-1 ring-border select-none"
            style={{ backgroundImage: wheelBackground }}
            onPointerDown={(event) => {
              if (!event.isPrimary || event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              pickFromWheel(event);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                pickFromWheel(event);
            }}
          >
            <span
              className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ring-1 ring-black"
              style={{
                left: `${50 + Math.cos(angle) * draft.saturation * 50}%`,
                top: `${50 + Math.sin(angle) * draft.saturation * 50}%`,
                backgroundColor: preview,
              }}
            />
          </div>
          <div className="grid gap-1">
            {controls.map(({ channel, label, max, scale }) => (
              <div key={channel}>
                <span className="text-sm font-medium">{label}</span>
                <Slider
                  thumbLabel={label}
                  max={max}
                  value={[Math.min(max, Math.round(draft[channel] * scale))]}
                  onValueChange={([value]) =>
                    setDraft((current) => ({
                      ...current,
                      brightness: current.brightness || 1,
                      [channel]: value / scale,
                    }))
                  }
                  className="min-h-7 [@media(pointer:coarse)]:min-h-11"
                />
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            <span
              aria-hidden="true"
              className="size-5 rounded-full border border-foreground/50"
              style={{ backgroundColor: preview }}
            />
            <span data-slot="drawing-color-preview">{preview}</span>
          </span>
          <DialogClose asChild>
            <Button className="min-h-11" onClick={() => onSelectColor(preview)}>
              Use color
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
