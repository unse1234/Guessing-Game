'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { PlayerList } from '@/features/lobby/components/player-list';
import { retryRoomConnection, startRoomClient } from '@/lib/room-client';
import { useRoomStore } from '@/stores/room-store';

export function LivePlayerList({ code }: { code: string }) {
  const room = useRoomStore((state) =>
    state.room?.code === code ? state.room : null,
  );
  const sessionCode = useRoomStore((state) => state.sessionCode);
  const connection = useRoomStore((state) => state.connection);
  const notice = useRoomStore((state) => state.notice);

  useEffect(startRoomClient, []);

  const working =
    connection === 'idle' ||
    connection === 'connecting' ||
    connection === 'rejoining';
  const restoring = sessionCode === code && !room;
  const status =
    connection === 'offline'
      ? (notice ?? 'Connection interrupted.')
      : connection === 'rejoining'
        ? 'Restoring room membership…'
        : working
          ? 'Connecting to the game server…'
          : room
            ? 'Connected'
            : restoring
              ? 'Waiting for room membership…'
              : (notice ?? 'Join this room to see the player list.');

  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <p role="status" className="text-sm text-muted-foreground">
          {status}
        </p>
        {connection === 'offline' && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={retryRoomConnection}
          >
            Retry
          </Button>
        )}
        {!working && !room && !restoring && (
          <Button asChild variant="secondary" size="sm">
            <Link
              href={
                sessionCode
                  ? `/room/${sessionCode}`
                  : `/?room=${encodeURIComponent(code)}`
              }
            >
              {sessionCode ? 'Return to your room' : 'Join this room'}
            </Link>
          </Button>
        )}
      </div>
      <PlayerList players={room?.players ?? emptyPlayers} />
    </div>
  );
}

const emptyPlayers = [] as const;
