import type { PrivateGameWord, PublicGameState } from '@draw-and-guess/shared';
import { create } from 'zustand';

interface GameStore {
  game: PublicGameState | null;
  privateWord: PrivateGameWord | null;
  clockOffsetMs: number;
}

const emptySession: GameStore = {
  game: null,
  privateWord: null,
  clockOffsetMs: 0,
};
export const useGameStore = create<GameStore>(() => emptySession);

export function resetGameSession() {
  if (useGameStore.getState().game) useGameStore.setState(emptySession);
}
