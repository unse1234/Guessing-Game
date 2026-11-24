import {
  GUESS_HISTORY_LIMIT,
  roomError,
  SOCKET_EVENTS,
  type GameRestart,
  type GameStart,
  type GuessActivity,
  type GuessReceipt,
  type GuessSnapshot,
  type GuessSubmit,
  type PrivateGameWord,
  type PublicGameState,
  type RoomResponse,
  type ScoreEntry,
  type WordChoose,
} from '@draw-and-guess/shared';
import type { getGameSocket } from '@/lib/socket';
import { emptyGuessing, useGameStore } from '@/stores/game-store';
import { useRoomStore } from '@/stores/room-store';

type GameSocket = ReturnType<typeof getGameSocket>;
type GameRequest =
  | ({ action: 'start' } & Omit<GameStart, 'code'>)
  | { action: 'get' }
  | ({ action: 'choose' } & Omit<WordChoose, 'code'>)
  | ({ action: 'restart' } & Omit<GameRestart, 'code'>);
const ackTimeout = 5_000;
let navigation: { code: string; started: number } | undefined;

function ingestGame(game: PublicGameState, roundTripMs?: number) {
  const session = useRoomStore.getState();
  if (
    session.connection !== 'connected' ||
    session.room?.code !== game.roomCode
  )
    return;
  const state = useGameStore.getState();
  const current = state.game;
  const sameRoom = current?.roomCode === game.roomCode;
  if (sameRoom && current.generation > game.generation) return;
  const sameGeneration = sameRoom && current.generation === game.generation;
  if (sameGeneration && current.revision > game.revision) return;

  const clockOffsetMs = game.serverTime - Date.now() + (roundTripMs ?? 0) / 2;
  if (sameGeneration && current.revision === game.revision) {
    if (roundTripMs !== undefined) useGameStore.setState({ clockOffsetMs });
    return;
  }

  useGameStore.setState({
    ...(!sameGeneration || current.turnId !== game.turnId ? emptyGuessing : {}),
    // A new turn starts with empty chat and unchanged cumulative scores.
    ...(sameGeneration
      ? { scores: state.scores, guessReady: state.guessReady }
      : {}),
    game,
    privateWord: null,
    clockOffsetMs,
  });
  if (process.env.NODE_ENV === 'development' && roundTripMs === undefined) {
    console.debug(
      `[game] ${game.phase} update received ${Date.now() - game.serverTime} ms after server timestamp (wall clocks)`,
    );
  }
}

function inTurn(code: string, turnId: string | null) {
  const session = useRoomStore.getState();
  const { game } = useGameStore.getState();
  return (
    session.connection === 'connected' &&
    session.room?.code === code &&
    game?.roomCode === code &&
    game.turnId === turnId
  );
}

function applyScores(
  current: Readonly<Record<string, number>>,
  changes: readonly ScoreEntry[],
) {
  if (changes.every(({ playerId, points }) => current[playerId] === points))
    return current;
  const next = { ...current };
  for (const { playerId, points } of changes) next[playerId] = points;
  return next;
}

function boundedActivity(activity: GuessActivity[]) {
  if (activity.length <= GUESS_HISTORY_LIMIT) return activity;
  const messages = activity.filter((item) => item.kind === 'message');
  if (messages.length <= GUESS_HISTORY_LIMIT) return activity;
  const oldest = messages[messages.length - GUESS_HISTORY_LIMIT].sequence;
  return activity.filter(
    (item) => item.kind === 'correct' || item.sequence >= oldest,
  );
}

function ingestActivity(item: GuessActivity) {
  if (!inTurn(item.roomCode, item.turnId)) return;
  const state = useGameStore.getState();
  if (item.sequence <= state.guessSequence) return;
  useGameStore.setState({
    activity: boundedActivity([...state.activity, item]),
    guessSequence: item.sequence,
    ...(item.kind === 'correct'
      ? { scores: applyScores(state.scores, item.scores) }
      : {}),
  });
}

function ingestGuessSnapshot(game: PublicGameState, snapshot: GuessSnapshot) {
  if (!inTurn(game.roomCode, game.turnId)) return;
  const state = useGameStore.getState();
  if (state.guessReady && state.guessSequence >= snapshot.sequence) {
    if (state.myPoints === null && snapshot.myPoints !== null)
      useGameStore.setState({ myPoints: snapshot.myPoints });
    return;
  }
  // Live packets can arrive before the snapshot ACK is processed.
  const newer = state.activity.filter(
    ({ sequence }) => sequence > snapshot.sequence,
  );
  const activity = [...snapshot.history, ...snapshot.correct, ...newer].sort(
    (a, b) => a.sequence - b.sequence,
  );
  let scores = applyScores({}, snapshot.scores);
  for (const item of newer) {
    if (item.kind === 'correct') scores = applyScores(scores, item.scores);
  }
  const entries = Object.entries(scores);
  const sameScores =
    entries.length === Object.keys(state.scores).length &&
    entries.every(([playerId, points]) => state.scores[playerId] === points);
  useGameStore.setState({
    activity: boundedActivity(activity),
    scores: sameScores ? state.scores : scores,
    guessReady: true,
    guessSequence: Math.max(state.guessSequence, snapshot.sequence),
    myPoints: state.myPoints ?? snapshot.myPoints,
  });
}

function ingestPrivate(word: PrivateGameWord) {
  const session = useRoomStore.getState();
  const { game, privateWord } = useGameStore.getState();
  if (
    session.connection !== 'connected' ||
    session.room?.code !== word.roomCode ||
    session.playerId !== word.drawerId ||
    game?.roomCode !== word.roomCode ||
    game.turnId !== word.turnId ||
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
  socket.on(SOCKET_EVENTS.guessMessage, ingestActivity);
  socket.on(SOCKET_EVENTS.guessPlayerCorrect, ingestActivity);
}

export async function requestGuess(
  socket: GameSocket | undefined,
  payload: GuessSubmit,
): Promise<RoomResponse<GuessReceipt>> {
  if (!socket?.connected) return roomError('SERVER_UNAVAILABLE');
  const socketId = socket.id;
  const playerId = useRoomStore.getState().playerId;
  const stillInTurn = () =>
    socket.id === socketId &&
    useRoomStore.getState().playerId === playerId &&
    inTurn(payload.code, payload.turnId);
  const started = performance.now();
  try {
    const result = await socket
      .timeout(ackTimeout)
      .emitWithAck(SOCKET_EVENTS.guessSubmit, payload);
    if (!stillInTurn()) return roomError('SERVER_UNAVAILABLE');
    if (result.ok && result.data.correct)
      useGameStore.setState({ myPoints: result.data.pointsAwarded });
    return result;
  } catch {
    if (stillInTurn())
      void requestGame(socket, payload.code, { action: 'get' });
    return roomError('SERVER_UNAVAILABLE');
  } finally {
    if (process.env.NODE_ENV === 'development')
      console.debug(
        `[game] guess acknowledgement: ${(performance.now() - started).toFixed(1)} ms`,
      );
  }
}

export async function requestGame(
  socket: GameSocket | undefined,
  code: string,
  request: GameRequest,
): Promise<RoomResponse<PublicGameState>> {
  if (!socket?.connected) return roomError('SERVER_UNAVAILABLE');
  const socketId = socket.id;
  const playerId = useRoomStore.getState().playerId;
  const started = performance.now();
  const { action } = request;
  try {
    if (action === 'get') {
      const result = await socket
        .timeout(ackTimeout)
        .emitWithAck(SOCKET_EVENTS.gameGetState, { code });
      if (!result.ok) return result;
      if (
        socket.id !== socketId ||
        useRoomStore.getState().playerId !== playerId
      )
        return roomError('SERVER_UNAVAILABLE');
      ingestGame(result.data.game, performance.now() - started);
      if (result.data.privateWord) ingestPrivate(result.data.privateWord);
      if (result.data.guessing)
        ingestGuessSnapshot(result.data.game, result.data.guessing);
      return { ok: true, data: result.data.game };
    }

    const connection = socket.timeout(ackTimeout);
    let result: RoomResponse<PublicGameState>;
    switch (request.action) {
      case 'start':
        result = await connection.emitWithAck(SOCKET_EVENTS.gameStart, {
          code,
          generation: request.generation,
        });
        break;
      case 'choose':
        result = await connection.emitWithAck(SOCKET_EVENTS.wordChoose, {
          code,
          turnId: request.turnId,
          revision: request.revision,
          word: request.word,
        });
        break;
      case 'restart':
        result = await connection.emitWithAck(SOCKET_EVENTS.gameRestart, {
          code,
          gameId: request.gameId,
        });
        break;
    }
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
