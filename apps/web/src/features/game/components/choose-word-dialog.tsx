'use client';

import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ClockBadge } from '@/features/game/components/word-timer';
import {
  chooseWordSeconds,
  defaultWord,
  wordChoices,
  type DemoWord,
} from '@/features/game/data/mock-game';
import { useCountdown } from '@/features/game/hooks/use-countdown';

export function ChooseWordDialog({
  onChoose,
}: {
  onChoose: (word: DemoWord) => void;
}) {
  const chooseFallback = useCallback(() => onChoose(defaultWord), [onChoose]);
  const seconds = useCountdown(chooseWordSeconds, chooseFallback);

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
        <div className="grid gap-2">
          {wordChoices.map((word) => (
            <Button
              key={word}
              type="button"
              variant={word === defaultWord ? 'default' : 'outline'}
              onClick={() => onChoose(word)}
              className="h-auto min-h-11 w-full text-base font-semibold transition-none"
            >
              {word}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
