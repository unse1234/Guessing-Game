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
  GAME_STARTED: 'The game in this room has already started.',
  NOT_HOST: 'Only the host can start the game.',
  NOT_ENOUGH_PLAYERS: 'At least two connected players are needed.',
  NOT_DRAWER: 'Only the current drawer can choose a word.',
  INVALID_WORD: 'Choose one of the words offered to you.',
  WRONG_PHASE: 'The game is no longer accepting word choices for this turn.',
  DEADLINE_PASSED: 'The word selection time has expired.',
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

export type GamePhase = 'waiting' | 'word_selection' | 'drawing' | 'turn_ended';

export interface PublicGameState {
  roomCode: string;
  revision: number;
  phase: GamePhase;
  currentDrawerId: string | null;
  currentTurn: number;
  totalTurns: number;
  phaseEndsAt: number | null;
  maskedWord: string | null;
  serverTime: number;
}

interface PrivateWordScope {
  roomCode: string;
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
}

export interface DrawingStroke {
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>;
}

export interface ScoreEntry {
  playerId: string;
  points: number;
}
