import { useCallback, useEffect, useState } from 'react';
import { finishGameNavigation, requestGame } from '@/lib/game-client';
import { getActiveRoomSocket, startRoomClient } from '@/lib/room-client';
import { useGameStore } from '@/stores/game-store';
import { useRoomStore } from '@/stores/room-store';

export function useGameSession(code: string) {
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
    () => requestGame(getActiveRoomSocket(code), code, 'get'),
    [code],
  );

  useEffect(() => {
    finishGameNavigation(code);
    startRoomClient();
  }, [code]);

  const roomStatus = room?.status;
  useEffect(() => {
    if (!connected || !playerId || !roomStatus) return;
    const { game: current, guessReady } = useGameStore.getState();
    if (
      current?.roomCode === code &&
      (guessReady || (current.phase === 'waiting' && roomStatus === 'waiting'))
    )
      return;

    let cancelled = false;
    void load().then((result) => {
      if (!cancelled) setSyncError(result.ok ? null : result.error.message);
    });
    return () => {
      cancelled = true;
    };
  }, [code, connected, load, playerId, roomStatus]);

  async function retry() {
    const result = await load();
    setSyncError(result.ok ? null : result.error.message);
  }

  return { room, playerId, connected, game, guessReady, syncError, retry };
}
