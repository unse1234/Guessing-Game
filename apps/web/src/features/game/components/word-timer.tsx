'use client';

import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  hiddenWordLength,
  roundSeconds,
  type DemoWord,
} from '@/features/game/data/mock-game';
import { useCountdown } from '@/features/game/hooks/use-countdown';

export function ClockBadge({ seconds }: { seconds: number }) {
  return (
    <span
      role="timer"
      aria-label={`${seconds} seconds remaining`}
      className="inline-flex items-center gap-1.5 rounded-md bg-highlight/60 px-2.5 py-1 text-sm font-semibold tabular-nums"
    >
      <Clock aria-hidden="true" className="size-4" />
      {seconds}s
    </span>
  );
}

function RoundTimer() {
  const seconds = useCountdown(roundSeconds);
  return <ClockBadge seconds={seconds} />;
}

interface WordTimerProps {
  word: DemoWord | null;
  running: boolean;
  onReopen?: () => void;
}

export function WordTimer({ word, running, onReopen }: WordTimerProps) {
  return (
    <section
      aria-label="Word and local timer"
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 rounded-md border bg-secondary/60 px-2.5 py-1.5 sm:px-3"
    >
      <span className="text-sm font-semibold">Word</span>
      <p className="text-center text-base font-semibold wrap-anywhere sm:text-lg">
        {word ?? (
          <>
            <span className="sr-only">
              Hidden word, {hiddenWordLength} letters
            </span>
            <span aria-hidden="true" className="tracking-[0.18em]">
              {Array.from({ length: hiddenWordLength }, () => '_').join(' ')}
            </span>
          </>
        )}
      </p>
      {running ? <RoundTimer /> : <ClockBadge seconds={roundSeconds} />}
      {onReopen && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="col-span-3 justify-self-center transition-none"
          onClick={onReopen}
        >
          Choose word
        </Button>
      )}
    </section>
  );
}
