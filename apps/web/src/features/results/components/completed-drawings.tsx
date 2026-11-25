'use client';

import type { CompletedDrawingInfo } from '@draw-and-guess/shared';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { DownloadDrawingButton } from '@/features/game/components/download-drawing-button';

export function CompletedDrawings({
  code,
  gameId,
  drawings,
  connected,
}: {
  code: string;
  gameId: string;
  drawings: readonly CompletedDrawingInfo[];
  connected: boolean;
}) {
  const [turnId, setTurnId] = useState(drawings[0]?.turnId);
  const drawing = drawings.find((item) => item.turnId === turnId);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Completed drawings"
          title="Completed drawings"
          className="size-9 px-0 transition-none focus-visible:ring-ring sm:w-auto sm:px-2 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
        >
          <Download aria-hidden="true" className="size-5" />
          <span className="hidden sm:inline">Completed drawings</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-3 rounded-xl bg-card p-4 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Completed drawings</DialogTitle>
          <DialogDescription>
            Choose a turn to download its drawing.
          </DialogDescription>
        </DialogHeader>
        <select
          aria-label="Completed drawing"
          value={turnId}
          onChange={(event) => setTurnId(event.target.value)}
          className="min-h-8 w-full min-w-0 rounded-md border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring [@media(pointer:coarse)]:min-h-11"
        >
          {drawings.map(({ turnId, round, turn, drawerName }) => (
            <option key={turnId} value={turnId}>
              Round {round} · Turn {turn} · {drawerName}
            </option>
          ))}
        </select>
        {drawing && (
          <DownloadDrawingButton
            code={code}
            gameId={gameId}
            drawing={drawing}
            disabled={!connected}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
