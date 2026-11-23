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

export interface DrawingStroke {
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>;
}

export interface ScoreEntry {
  playerId: string;
  points: number;
}
