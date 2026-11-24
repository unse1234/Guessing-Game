'use client';

import { LogOut, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { markGameNavigation, requestGame } from '@/lib/game-client';
import { getActiveRoomSocket, leaveRoom } from '@/lib/room-client';
import { useRoomStore } from '@/stores/room-store';

export function LobbyActions({ code }: { code: string }) {
  const router = useRouter();
  const member = useRoomStore((state) => state.sessionCode === code);
  const online = useRoomStore((state) => state.connection === 'connected');
  const room = useRoomStore((state) =>
    state.room?.code === code ? state.room : null,
  );
  const playerId = useRoomStore((state) => state.playerId);
  const [leaving, setLeaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const pending = useRef(false);
  const playing = room?.status === 'playing';
  const host = playerId !== null && room?.hostId === playerId;
  const enoughPlayers = room
    ? room.players.filter((player) => player.isOnline).length >= 2
    : false;

  useEffect(() => {
    if (online && playing) {
      markGameNavigation(code);
      router.replace(`/game/${code}`);
    }
  }, [code, online, playing, router]);

  async function start() {
    if (pending.current || !host || !enoughPlayers) return;
    pending.current = true;
    setStarting(true);
    const result = await requestGame(getActiveRoomSocket(code), code, 'start');
    if (!result.ok) toast.error(result.error.message);
    setStarting(false);
    pending.current = false;
  }

  async function leave() {
    if (pending.current) return;
    pending.current = true;
    setLeaving(true);
    const result = await leaveRoom();
    if (result.ok || result.error.code === 'NOT_IN_ROOM') {
      router.replace('/');
    } else {
      toast.error(result.error.message);
      setLeaving(false);
    }
    pending.current = false;
  }

  return (
    <div className="grid gap-1">
      <Button
        type="button"
        className="h-auto min-h-12 w-full text-base font-semibold whitespace-normal transition-none sm:text-lg"
        disabled={
          !online || !host || !enoughPlayers || playing || starting || leaving
        }
        title={
          !host
            ? 'Only the host can start the game'
            : !enoughPlayers
              ? 'Wait for two connected players'
              : undefined
        }
        onClick={() => void start()}
      >
        <Play aria-hidden="true" className="size-5" />
        {starting ? 'Starting…' : 'Start Game'}
      </Button>
      {member && (
        <Button
          type="button"
          variant="ghost"
          className="justify-self-center"
          disabled={!online || leaving || starting}
          onClick={() => void leave()}
        >
          <LogOut aria-hidden="true" />
          {leaving ? 'Leaving…' : 'Leave Room'}
        </Button>
      )}
    </div>
  );
}
