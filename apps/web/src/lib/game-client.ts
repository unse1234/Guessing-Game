import {
  roomError,
  SOCKET_EVENTS,
  type PrivateGameWord,
  type PublicGameState,
  type RoomResponse,
} from '@draw-and-guess/shared';
import type { getGameSocket } from '@/lib/socket';
import { useGameStore } from '@/stores/game-store';
import { useRoomStore } from '@/stores/room-store';

type GameSocket = ReturnType<typeof getGameSocket>;
const ackTimeout = 5_000;
let navigation: { code: string; started: number } | undefined;

function ingestGame(game: PublicGameState, roundTripMs?: number) {
  const session = useRoomStore.getState();
  if (
    session.connection !== 'connected' ||
    session.room?.code !== game.roomCode
  )
    return;
  const current = useGameStore.getState().game;
  const sameRoom = current?.roomCode === game.roomCode;
  if (sameRoom && current.revision > game.revision) return;

  const clockOffsetMs = game.serverTime - Date.now() + (roundTripMs ?? 0) / 2;
  if (sameRoom && current.revision === game.revision) {
    if (roundTripMs !== undefined) useGameStore.setState({ clockOffsetMs });
    return;
  }

  useGameStore.setState({ game, privateWord: null, clockOffsetMs });
  if (process.env.NODE_ENV === 'development' && roundTripMs === undefined) {
    console.debug(
      `[game] ${game.phase} update received ${Date.now() - game.serverTime} ms after server timestamp (wall clocks)`,
    );
  }
}

function ingestPrivate(word: PrivateGameWord) {
  const session = useRoomStore.getState();
  const { game, privateWord } = useGameStore.getState();
  if (
    session.connection !== 'connected' ||
    session.room?.code !== word.roomCode ||
    session.playerId !== word.drawerId ||
    game?.roomCode !== word.roomCode ||
    game.revision !== word.revision ||
    game.currentDrawerId !== word.drawerId ||
    privateWord?.revision === word.revision
  )
    return;

  if (
    (game.phase === 'word_selection' && word.kind === 'options') ||
    (game.phase === 'drawing' && word.kind === 'confirmed')
  ) {
    useGameStore.setState({ privateWord: word });
  }
}

export function bindGameEvents(socket: GameSocket) {
  socket.on(SOCKET_EVENTS.gameState, ingestGame);
  socket.on(SOCKET_EVENTS.wordOptions, ingestPrivate);
  socket.on(SOCKET_EVENTS.wordConfirmed, ingestPrivate);
}

export async function requestGame(
  socket: GameSocket | undefined,
  code: string,
  action: 'start' | 'get' | 'choose',
  selection?: { revision: number; word: string },
): Promise<RoomResponse<PublicGameState>> {
  if (!socket?.connected) return roomError('SERVER_UNAVAILABLE');
  const socketId = socket.id;
  const started = performance.now();
  try {
    if (action === 'get') {
      const result = await socket
        .timeout(ackTimeout)
        .emitWithAck(SOCKET_EVENTS.gameGetState, { code });
      if (!result.ok) return result;
      if (socket.id !== socketId) return roomError('SERVER_UNAVAILABLE');
      ingestGame(result.data.game, performance.now() - started);
      if (result.data.privateWord) ingestPrivate(result.data.privateWord);
      return { ok: true, data: result.data.game };
    }

    const result =
      action === 'start'
        ? await socket
            .timeout(ackTimeout)
            .emitWithAck(SOCKET_EVENTS.gameStart, { code })
        : selection
          ? await socket
              .timeout(ackTimeout)
              .emitWithAck(SOCKET_EVENTS.wordChoose, { code, ...selection })
          : roomError('INVALID_REQUEST');
    if (result.ok && socket.id === socketId)
      ingestGame(result.data, performance.now() - started);
    return result;
  } catch {
    return roomError('SERVER_UNAVAILABLE');
  } finally {
    if (process.env.NODE_ENV === 'development' && action !== 'get') {
      console.debug(
        `[game] ${action} acknowledgement: ${(performance.now() - started).toFixed(1)} ms`,
      );
    }
  }
}

export function markGameNavigation(code: string) {
  if (process.env.NODE_ENV === 'development')
    navigation = { code, started: performance.now() };
}

export function finishGameNavigation(code: string) {
  if (process.env.NODE_ENV === 'development' && navigation?.code === code) {
    console.debug(
      `[game] lobby-to-game mount: ${(performance.now() - navigation.started).toFixed(1)} ms`,
    );
    navigation = undefined;
  }
}
