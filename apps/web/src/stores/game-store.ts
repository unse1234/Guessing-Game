import type { GameStatus, Player, Room } from '@draw-and-guess/shared';
import { create } from 'zustand';

export type ConnectionStatus =
  'connecting' | 'connected' | 'disconnected' | 'error';

interface GameState {
  currentPlayer: Player | null;
  room: Room | null;
  gameStatus: GameStatus | null;
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (status: ConnectionStatus) => void;
}

export const useGameStore = create<GameState>((set) => ({
  currentPlayer: null,
  room: null,
  gameStatus: null,
  connectionStatus: 'connecting',
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
}));
