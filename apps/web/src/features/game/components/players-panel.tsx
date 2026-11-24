import type { RoomPlayer } from '@draw-and-guess/shared';
import styles from './game-screen.module.css';

export function PlayersPanel({
  players,
  drawerId,
}: {
  players: readonly RoomPlayer[];
  drawerId: string | null;
}) {
  return (
    <section
      aria-labelledby="game-players"
      className={`${styles.players} min-w-0 rounded-xl border bg-background/30 p-2.5 sm:p-3`}
    >
      <h2 id="game-players" className="px-1 pb-2 text-base font-semibold">
        Players
      </h2>
      <ul role="list" className="divide-y">
        {players.map(({ id, nickname, isOnline }) => {
          const drawing = id === drawerId;
          return (
            <li
              key={id}
              className={`flex min-w-0 items-center gap-2 px-2 py-2 text-sm ${drawing ? 'rounded-md bg-secondary/70 font-semibold' : ''}`}
            >
              <span
                aria-hidden="true"
                className={`size-2 shrink-0 rounded-full ${isOnline ? 'bg-green-600' : 'bg-foreground/35'}`}
              />
              <span className="grow wrap-anywhere">
                {nickname}
                <span className="sr-only">
                  {isOnline ? ', online' : ', offline'}
                </span>
              </span>
              <span
                className="shrink-0 tabular-nums"
                aria-label="Score unavailable"
              >
                —
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
