import { Crown, User } from 'lucide-react';
import type { LobbyPlayer } from '@/features/lobby/data/mock-players';

const roomCapacity = 8;

export function PlayerList({ players }: { players: readonly LobbyPlayer[] }) {
  return (
    <section aria-labelledby="lobby-players" className="min-w-0">
      <h2 id="lobby-players" className="mb-2 text-lg font-semibold sm:text-xl">
        Players ({players.length}/{roomCapacity})
      </h2>

      <ul role="list" className="divide-y rounded-md border bg-background/50">
        {players.map(({ id, nickname, isHost, isOnline }) => (
          <li
            key={id}
            className="flex min-h-10 items-center gap-3 px-3 py-[clamp(0.25rem,0.9svh,0.75rem)] sm:px-4"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary">
              <User aria-hidden="true" className="size-5" />
            </span>
            <span
              aria-hidden="true"
              className={`size-2 shrink-0 rounded-full ${isOnline ? 'bg-green-600' : 'bg-foreground/35'}`}
            />
            <span className="min-w-0 grow text-base wrap-anywhere">
              {nickname}
              {isHost && <span className="font-medium"> (Host)</span>}
              <span className="sr-only">
                {isOnline ? ', online' : ', offline'}
              </span>
            </span>
            {isHost && (
              <Crown
                aria-hidden="true"
                className="size-5 shrink-0 text-amber-600"
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
