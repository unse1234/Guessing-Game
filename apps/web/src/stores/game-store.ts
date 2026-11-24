import type {
  GuessActivity,
  PrivateGameWord,
  PublicGameState,
} from '@draw-and-guess/shared';
import { create } from 'zustand';

interface GameStore {
  game: PublicGameState | null;
  privateWord: PrivateGameWord | null;
  clockOffsetMs: number;
  activity: readonly GuessActivity[];
  scores: Readonly<Record<string, number>>;
  guessSequence: number;
  guessReady: boolean;
  myPoints: number | null;
}

export const emptyGuessing = {
  activity: [],
  scores: {},
  guessSequence: 0,
  guessReady: false,
  myPoints: null,
};

const emptySession: GameStore = {
  ...emptyGuessing,
  game: null,
  privateWord: null,
  clockOffsetMs: 0,
};
export const useGameStore = create<GameStore>(() => emptySession);

export function resetGameSession() {
  if (useGameStore.getState().game) useGameStore.setState(emptySession);
}
