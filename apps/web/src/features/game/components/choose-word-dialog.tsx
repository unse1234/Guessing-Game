'use client';

import type { WordOptions } from '@draw-and-guess/shared';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ClockBadge } from '@/features/game/components/word-timer';
import { useCountdown } from '@/features/game/hooks/use-countdown';
import { requestGame } from '@/lib/game-client';
import { getActiveRoomSocket } from '@/lib/room-client';
import { useGameStore } from '@/stores/game-store';

export function ChooseWordDialog({
  choices,
  deadline,
}: {
  choices: WordOptions;
  deadline: number;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const offset = useGameStore((state) => state.clockOffsetMs);
  const seconds = useCountdown(deadline, offset);

  async function choose(word: string) {
    if (submitting.current || seconds === 0) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    const result = await requestGame(
      getActiveRoomSocket(choices.roomCode),
      choices.roomCode,
      {
        action: 'choose',
        turnId: choices.turnId,
        revision: choices.revision,
        word,
      },
    );
    if (!result.ok) setError(result.error.message);
    submitting.current = false;
    setPending(false);
  }

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        className="max-h-[calc(100dvh-1.5rem)] gap-4 overflow-y-auto rounded-xl border-border bg-card p-5 text-foreground shadow-sm data-[state=closed]:animate-none data-[state=open]:animate-none sm:max-w-sm"
      >
        <DialogHeader className="text-center sm:text-center">
          <DialogTitle className="text-2xl font-semibold">
            Choose a Word
          </DialogTitle>
          <DialogDescription className="text-base">
            You are the drawer! Pick one word to draw.
          </DialogDescription>
        </DialogHeader>
        <div className="justify-self-center">
          <ClockBadge seconds={seconds} />
        </div>
        <div className="grid gap-2" aria-busy={pending}>
          {choices.options.map((word, index) => (
            <Button
              key={word}
              type="button"
              variant={index === 1 ? 'default' : 'outline'}
              disabled={pending || seconds === 0}
              onClick={() => void choose(word)}
              className="h-auto min-h-11 w-full text-base font-semibold transition-none"
            >
              {word}
            </Button>
          ))}
        </div>
        {error && (
          <p role="alert" className="text-sm">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
