'use client';

import {
  SOCKET_EVENTS,
  type CompletedDrawingInfo,
} from '@draw-and-guess/shared';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getActiveRoomSocket } from '@/lib/room-client';
import { useGameStore } from '@/stores/game-store';

let downloadInProgress = false;

export function DownloadDrawingButton({
  code,
  gameId,
  drawing,
  disabled = false,
}: {
  code: string;
  gameId: string;
  drawing: CompletedDrawingInfo;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState(false);

  async function download() {
    if (downloadInProgress) {
      toast.error('A drawing is already being prepared.');
      return;
    }
    const socket = getActiveRoomSocket(code);
    const socketId = socket?.id;
    if (!socket || !socketId) {
      toast.error('Reconnect to the room to download this drawing.');
      return;
    }
    const isCurrent = () =>
      getActiveRoomSocket(code)?.id === socketId &&
      useGameStore.getState().game?.gameId === gameId;
    downloadInProgress = true;
    setPending(true);
    try {
      const { turnId } = drawing;
      const result = await socket
        .timeout(5_000)
        .emitWithAck(SOCKET_EVENTS.drawCompleted, { gameId, turnId });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      if (
        !isCurrent() ||
        result.data.gameId !== gameId ||
        result.data.turnId !== turnId
      ) {
        toast.error('This completed drawing is unavailable.');
        return;
      }
      const { renderDrawingPng, saveDrawingPng } =
        await import('@/features/game/lib/drawing-export');
      const png = await renderDrawingPng(result.data.strokes);
      if (!isCurrent()) toast.error('This completed drawing is unavailable.');
      else if (!png) toast.error('Could not create the PNG. Try again.');
      else if (!saveDrawingPng(png, drawing))
        toast.error('This browser does not support saving drawings.');
    } catch {
      toast.error('Could not download the drawing. Try again.');
    } finally {
      downloadInProgress = false;
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={disabled || pending}
      aria-busy={pending}
      onClick={() => void download()}
      className="justify-self-center transition-none focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11"
    >
      <Download aria-hidden="true" />
      {pending ? 'Preparing PNG…' : 'Download Drawing'}
    </Button>
  );
}
