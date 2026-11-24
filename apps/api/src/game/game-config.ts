import { GAME_MIN_PLAYERS } from '@draw-and-guess/shared';

export const gameConfig = {
  minPlayers: GAME_MIN_PLAYERS,
  totalRounds: 2,
  selectionMs: 15_000,
  drawingMs: 60_000,
  summaryMs: 5_000,
} as const;
