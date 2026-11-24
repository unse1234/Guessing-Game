import type { RoomPlayer } from '@draw-and-guess/shared';
import { Crown } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useGameStore } from '@/stores/game-store';
import styles from './game-screen.module.css';

export const PlayersPanel = memo(function PlayersPanel({
  players,
  drawerId,
}: {
  players: readonly RoomPlayer[];
  drawerId: string | null;
}) {
  const scores = useGameStore((state) => state.scores);
  const ranking = useMemo(
    () =>
      [...players].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0)),
    [players, scores],
  );
  const highest = ranking.length ? (scores[ranking[0].id] ?? 0) : 0;

  return (
    <section
      aria-labelledby="game-players"
      className={`${styles.players} min-w-0 rounded-xl border bg-background/30 p-2.5 sm:p-3`}
    >
      <h2 id="game-players" className="px-1 pb-2 text-base font-semibold">
        Players
      </h2>
      <ul role="list" className={`${styles.playerList} divide-y`}>
        {ranking.map(({ id, nickname, isHost, isOnline }) => {
          const drawing = id === drawerId;
          const score = scores[id] ?? 0;
          const leading = score > 0 && score === highest;
          return (
            <li
              key={id}
              className={`flex min-w-0 items-center gap-2 px-2 py-2 text-sm ${drawing || leading ? 'rounded-md bg-secondary/70 font-semibold' : ''}`}
            >
              <span
                aria-hidden="true"
                className={`size-2 shrink-0 rounded-full ${isOnline ? 'bg-green-600' : 'bg-foreground/35'}`}
              />
              <span className="grow wrap-anywhere">
                {nickname}
                <span className="sr-only">
                  {isOnline ? ', online' : ', offline'}
                  {isHost ? ', host' : ''}
                  {leading ? ', leading' : ''}
                </span>
              </span>
              {isHost && (
                <Crown
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-amber-600"
                />
              )}
              <span
                className="shrink-0 tabular-nums"
                aria-label={`${score} points`}
              >
                {score}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
});
