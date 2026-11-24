import {
  guessTextSchema,
  roomError,
  type GuessSubmit,
} from '@draw-and-guess/shared';
import { useRef, useState, type FormEvent } from 'react';
import { createOperationId } from '@/features/game/lib/operation-id';
import { requestGuess } from '@/lib/game-client';
import { getActiveRoomSocket } from '@/lib/room-client';
import { emptyGuessing, useGameStore } from '@/stores/game-store';
import { useRoomStore } from '@/stores/room-store';

export function useGuessing(code: string, isDrawer: boolean) {
  const game = useGameStore((state) =>
    state.game?.roomCode === code ? state.game : null,
  );
  const activity = useGameStore((state) =>
    state.game?.roomCode === code ? state.activity : emptyGuessing.activity,
  );
  const myPoints = useGameStore((state) =>
    state.game?.roomCode === code ? state.myPoints : null,
  );
  const ready = useGameStore(
    (state) => state.game?.roomCode === code && state.guessReady,
  );
  const connection = useRoomStore((state) => state.connection);
  const playerId = useRoomStore((state) =>
    state.room?.code === code ? state.playerId : null,
  );
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const lastAttempt = useRef<GuessSubmit | null>(null);
  const turnId = game?.turnId;

  const disabled =
    connection !== 'connected' ||
    !playerId ||
    !ready ||
    !turnId ||
    game.phase !== 'drawing' ||
    isDrawer ||
    myPoints !== null;

  function edit(value: string) {
    setDraft(value);
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || !turnId || inFlight.current || !draft.trim()) return;
    const parsed = guessTextSchema.safeParse(draft);
    if (!parsed.success) {
      setError(roomError('INVALID_GUESS').error.message);
      return;
    }

    const previous = lastAttempt.current;
    const payload =
      previous?.turnId === turnId && previous.guess === parsed.data
        ? previous
        : { code, turnId, requestId: createOperationId(), guess: parsed.data };
    lastAttempt.current = payload;
    inFlight.current = true;
    setPending(true);
    setError(null);
    const result = await requestGuess(getActiveRoomSocket(code), payload);
    inFlight.current = false;
    setPending(false);
    if (useGameStore.getState().game?.turnId !== turnId) return;
    if (result.ok) {
      lastAttempt.current = null;
      setDraft((current) => (current === draft ? '' : current));
    } else {
      setError(result.error.message);
    }
  }

  const emptyHint =
    game?.phase === 'turn_ended'
      ? 'This turn has ended.'
      : game?.phase === 'drawing'
        ? isDrawer
          ? 'Guesses from other players appear here.'
          : 'No guesses yet.'
        : 'Guesses will appear when drawing starts.';
  return {
    activity,
    draft,
    disabled,
    edit,
    emptyHint,
    error,
    myPoints,
    pending,
    submit,
  };
}
