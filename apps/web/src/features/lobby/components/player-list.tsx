import { Crown, User } from 'lucide-react';
import { ROOM_CAPACITY, type RoomPlayer } from '@draw-and-guess/shared';
import { memo } from 'react';

export const PlayerList = memo(function PlayerList({
  players,
}: {
  players: readonly RoomPlayer[];
}) {
  return (
    <section aria-labelledby="lobby-players" className="min-w-0">
      <h2 id="lobby-players" className="mb-2 text-lg font-semibold sm:text-xl">
        Players ({players.length}/{ROOM_CAPACITY})
      </h2>

      <ul
        role="list"
        className="divide-y rounded-md border bg-background/50 [@media(min-width:38rem)_and_(max-height:30rem)]:max-h-[max(5rem,calc(100svh-17rem))] [@media(min-width:38rem)_and_(max-height:30rem)]:overflow-y-auto [@media(min-width:38rem)_and_(max-height:30rem)]:overscroll-contain"
      >
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
});
