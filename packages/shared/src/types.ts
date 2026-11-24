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

export interface DrawingStroke {
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>;
}

export interface ScoreEntry {
  playerId: string;
  points: number;
}
