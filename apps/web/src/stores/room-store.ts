import type { RoomSnapshot } from '@draw-and-guess/shared';
import { create } from 'zustand';

export type RoomConnection =
  'idle' | 'connecting' | 'connected' | 'rejoining' | 'offline';

interface RoomState {
  connection: RoomConnection;
  room: RoomSnapshot | null;
  playerId: string | null;
  sessionCode: string | null;
  notice: string | null;
}

export const useRoomStore = create<RoomState>(() => ({
  connection: 'idle',
  room: null,
  playerId: null,
  sessionCode: null,
  notice: null,
}));
