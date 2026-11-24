import { useCallback, useEffect, useState } from 'react';
import { finishGameNavigation, requestGame } from '@/lib/game-client';
import { getActiveRoomSocket, startRoomClient } from '@/lib/room-client';
import { useGameStore } from '@/stores/game-store';
import { useRoomStore } from '@/stores/room-store';

export function useGameSession(code: string, route: 'game' | 'results') {
  const router = useRouter();
  const room = useRoomStore((state) =>
    state.room?.code === code ? state.room : null,
  );
  const playerId = useRoomStore((state) =>
    state.room?.code === code ? state.playerId : null,
  );
  const connected = useRoomStore((state) => state.connection === 'connected');
  const game = useGameStore((state) =>
    state.game?.roomCode === code ? state.game : null,
  );
  const guessReady = useGameStore(
    (state) => state.game?.roomCode === code && state.guessReady,
  );
  const [syncError, setSyncError] = useState<string | null>(null);

  const load = useCallback(
    () => requestGame(getActiveRoomSocket(code), code, { action: 'get' }),
    [code],
  );

  useEffect(() => {
    if (route === 'game') finishGameNavigation(code);
    startRoomClient();
  }, [code, route]);

  const roomStatus = room?.status;
  const destination =
    roomStatus === 'waiting'
      ? 'room'
      : roomStatus === 'playing'
        ? 'game'
        : roomStatus === 'finished'
          ? 'results'
          : null;
  useEffect(() => {
    if (connected && destination && destination !== route)
      router.replace(`/${destination}/${code}`);
  }, [code, connected, destination, route, router]);

  const turnId = game?.turnId;
  useEffect(() => {
    if (!connected || !playerId || destination !== route) return;
    const { game: current, guessReady } = useGameStore.getState();
    if (
      current?.roomCode === code &&
      (route === 'results' ? current.phase === 'finished' : guessReady)
    )
      return;

    let cancelled = false;
    void load().then((result) => {
      if (!cancelled) setSyncError(result.ok ? null : result.error.message);
    });
    return () => {
      cancelled = true;
    };
  }, [code, connected, destination, load, playerId, route, turnId]);

  async function retry() {
    const result = await load();
    setSyncError(result.ok ? null : result.error.message);
  }

  return { room, playerId, connected, game, guessReady, syncError, retry };
}
import { useRouter } from 'next/navigation';
