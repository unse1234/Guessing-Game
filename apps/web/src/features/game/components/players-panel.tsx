import type { GamePlayer } from '@/features/game/data/mock-game';
import styles from './game-screen.module.css';

export function PlayersPanel({ players }: { players: readonly GamePlayer[] }) {
  const leadingScore = Math.max(...players.map(({ score }) => score));

  return (
    <section
      aria-labelledby="game-players"
      className={`${styles.players} min-w-0 rounded-xl border bg-background/30 p-2.5 sm:p-3`}
    >
      <h2 id="game-players" className="px-1 pb-2 text-base font-semibold">
        Players
      </h2>
      <ul role="list" className="divide-y">
        {players.map(({ id, name, score, isOnline }) => {
          const leading = score === leadingScore;
          return (
            <li
              key={id}
              className={`flex min-w-0 items-center gap-2 px-2 py-2 text-sm ${leading ? 'rounded-md bg-secondary/70 font-semibold' : ''}`}
            >
              <span
                aria-hidden="true"
                className={`size-2 shrink-0 rounded-full ${isOnline ? 'bg-green-600' : 'bg-foreground/35'}`}
              />
              <span className="grow wrap-anywhere">
                {name}
                <span className="sr-only">
                  {isOnline ? ', online' : ', offline'}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">{score}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
