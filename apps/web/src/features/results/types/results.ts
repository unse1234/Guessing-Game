import type { Player } from '@draw-and-guess/shared';

export interface PlayerResult extends Player {
  score: number;
}

export interface RankedResult extends PlayerResult {
  rank: number;
}
