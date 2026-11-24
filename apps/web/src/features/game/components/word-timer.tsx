'use client';

import { Clock } from 'lucide-react';
import { useCountdown } from '@/features/game/hooks/use-countdown';
import { useGameStore } from '@/stores/game-store';

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

export function DeadlineClock({ deadline }: { deadline: number }) {
  const offset = useGameStore((state) => state.clockOffsetMs);
  return <ClockBadge seconds={useCountdown(deadline, offset)} />;
}

export function WordTimer({
  word,
  mask,
  deadline,
}: {
  word: string | null;
  mask: string | null;
  deadline: number | null;
}) {
  return (
    <section
      aria-label="Word and turn timer"
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 rounded-md border bg-secondary/60 px-2.5 py-1.5 sm:px-3"
    >
      <span className="text-sm font-semibold">Word</span>
      <p className="text-center text-base font-semibold wrap-anywhere sm:text-lg">
        {word ??
          (mask ? (
            <>
              <span className="sr-only">
                Hidden word, {mask.length} letters
              </span>
              <span aria-hidden="true" className="tracking-[0.18em]">
                {mask.split('').join(' ')}
              </span>
            </>
          ) : (
            '—'
          ))}
      </p>
      {deadline !== null ? (
        <DeadlineClock key={deadline} deadline={deadline} />
      ) : (
        <span aria-hidden="true" className="px-2.5">
          —
        </span>
      )}
    </section>
  );
}
