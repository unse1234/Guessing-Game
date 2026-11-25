export type GameStatus = 'waiting' | 'playing' | 'finished';

export interface Player {
  id: string;
  name: string;
}

export interface Room {
  code: string;
  hostId: string;
  players: Player[];
  status: GameStatus;
}

export const ROOM_CAPACITY = 8;
export const GAME_MIN_PLAYERS = 2;
export const ROOM_RECONNECT_GRACE_MS = 15_000;

export interface RoomPlayer {
  id: string;
  nickname: string;
  isHost: boolean;
  isOnline: boolean;
}

export interface RoomSnapshot {
  code: string;
  hostId: string | null;
  players: RoomPlayer[];
  status: GameStatus;
  revision: number;
  gameGeneration: number;
}

export interface RoomCredential {
  code: string;
  reconnectToken: string;
}

export interface RoomSession {
  room: RoomSnapshot;
  playerId: string;
  reconnectToken: string;
}

export const ROOM_ERROR_MESSAGES = {
  INVALID_REQUEST: 'The room request is invalid.',
  INVALID_NICKNAME:
    'Enter a nickname with 2–20 characters and no control characters.',
  INVALID_CODE: 'Enter a six-character room code.',
  ROOM_NOT_FOUND: 'Room not found. Check the code and try again.',
  ROOM_FULL: 'This room already has eight players.',
  SERVER_CAPACITY: 'All room slots are in use right now. Try again shortly.',
  GAME_STARTED: 'The game in this room has already started.',
  NOT_HOST: 'Only the host can start the game.',
  RESTART_HOST_ONLY: 'Only the current host can play again.',
  GAME_NOT_FINISHED: 'This finished game is no longer available to restart.',
  STALE_GAME: 'The room has moved to a different game.',
  NOT_ENOUGH_PLAYERS: `At least ${GAME_MIN_PLAYERS} connected players are needed.`,
  NOT_DRAWER: 'Only the current drawer can choose a word.',
  INVALID_WORD: 'Choose one of the words offered to you.',
  WRONG_PHASE: 'The game is no longer accepting word choices for this turn.',
  DEADLINE_PASSED: 'The word selection time has expired.',
  INVALID_GUESS:
    'Enter a guess of up to 80 characters without control characters.',
  GUESS_CLOSED: 'This turn is no longer accepting guesses.',
  DRAWER_CANNOT_GUESS: 'The drawer cannot submit guesses.',
  ALREADY_GUESSED: 'You already guessed the word.',
  STALE_CANVAS: 'The canvas changed. Restoring its current state.',
  INVALID_STROKE: 'This drawing operation could not be applied.',
  DRAWING_LIMIT:
    'The drawing limit was reached. Clear the canvas or wait for the turn to end.',
  ALREADY_IN_ROOM:
    'You are already in a room. Leave it before joining another.',
  NOT_IN_ROOM: 'You are no longer in this room.',
  SESSION_EXPIRED: 'Your room session expired. Join the room again.',
  RATE_LIMITED: 'Too many requests. Wait a moment and try again.',
  SERVER_UNAVAILABLE: 'The game server did not respond. Please try again.',
} as const;

export type RoomErrorCode = keyof typeof ROOM_ERROR_MESSAGES;
export interface RoomError {
  ok: false;
  error: { code: RoomErrorCode; message: string };
}
export type RoomResponse<T> = { ok: true; data: T } | RoomError;
export type RoomAck<T> = (response: RoomResponse<T>) => void;

export function roomError(code: RoomErrorCode): RoomError {
  return { ok: false, error: { code, message: ROOM_ERROR_MESSAGES[code] } };
}

export interface RoomUpdated {
  room: RoomSnapshot;
  sentAt?: number;
}

export interface RoomClosed {
  code: string;
  reason: 'room_closed' | 'session_replaced';
}

export type GamePhase =
  'waiting' | 'word_selection' | 'drawing' | 'turn_summary' | 'finished';

export type TurnEndReason =
  'time_expired' | 'all_correct' | 'drawer_left' | 'insufficient_players';

export interface TurnSummary {
  reason: TurnEndReason;
  word: string | null;
  awards: {
    playerId: string;
    nickname: string;
    points: number;
    score: number;
  }[];
}

export interface FinalPlayerResult {
  playerId: string;
  nickname: string;
  score: number;
  rank: number;
}

export interface FinalGameResults {
  roomCode: string;
  gameId: string;
  players: FinalPlayerResult[];
  winnerIds: string[];
  reason: 'completed' | 'insufficient_players';
  finishedAt: number;
}

export interface PublicGameState {
  roomCode: string;
  gameId: string | null;
  generation: number;
  turnId: string | null;
  revision: number;
  phase: GamePhase;
  currentDrawerId: string | null;
  currentTurn: number;
  totalTurns: number;
  currentRound: number;
  totalRounds: number;
  phaseEndsAt: number | null;
  maskedWord: string | null;
  summary?: TurnSummary;
  results?: FinalGameResults;
  serverTime: number;
}

interface PrivateWordScope {
  roomCode: string;
  turnId: string;
  revision: number;
  drawerId: string;
}

export type WordOptions = PrivateWordScope & {
  kind: 'options';
  options: readonly [string, string, string];
};
export type WordConfirmed = PrivateWordScope & {
  kind: 'confirmed';
  word: string;
};
export type PrivateGameWord = WordOptions | WordConfirmed;
export interface GameView {
  game: PublicGameState;
  privateWord?: PrivateGameWord;
  guessing?: GuessSnapshot;
}

export const DRAWING_WIDTH = 900;
export const DRAWING_HEIGHT = 600;
export const MIN_BRUSH_SIZE = 2;
export const MAX_BRUSH_SIZE = 30;
export const DRAW_BATCH_MS = 24;
export const MAX_DRAW_BATCH_POINTS = 64;
export const MAX_DRAW_STROKE_POINTS = 1_536;
export type DrawingTool = 'pen' | 'eraser';
export interface BrushSettings {
  tool: DrawingTool;
  color: string;
  size: number;
}

export interface DrawingStroke extends BrushSettings {
  id: string;
  points: number[];
}

export interface DrawingScope {
  turnId: string;
  canvasVersion: number;
}
export interface DrawingReceipt extends DrawingScope {
  revision: number;
}
export interface DrawingStarted extends DrawingReceipt {
  stroke: DrawingStroke;
}
export interface DrawingBatch extends DrawingReceipt {
  id: string;
  sequence: number;
  points: number[];
  sentAt?: number;
}
export type DrawingEnded = DrawingStarted;
export interface DrawingUndone extends DrawingReceipt {
  id: string;
}
export interface DrawingSnapshot extends DrawingReceipt {
  strokes: DrawingStroke[];
  active: { stroke: DrawingStroke; nextSequence: number } | null;
}
export interface ScoreEntry {
  playerId: string;
  points: number;
}

export const MAX_GUESS_LENGTH = 80;
export const GUESS_HISTORY_LIMIT = 100;

interface GuessActivityBase {
  roomCode: string;
  turnId: string;
  sequence: number;
  playerId: string;
  playerName: string;
}

export interface GuessMessage extends GuessActivityBase {
  kind: 'message';
  message: string;
}

export interface GuessNotice extends GuessActivityBase {
  kind: 'correct';
  scores: ScoreEntry[];
}

export type GuessActivity = GuessMessage | GuessNotice;

export type GuessReceipt =
  | { correct: false; pointsAwarded: 0 }
  | { correct: true; pointsAwarded: number };

export interface GuessSnapshot {
  sequence: number;
  history: GuessMessage[];
  correct: GuessNotice[];
  scores: ScoreEntry[];
  myPoints: number | null;
}
