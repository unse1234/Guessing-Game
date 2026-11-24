import type { Player } from '@draw-and-guess/shared';
import type { DrawingStroke } from '@/features/game/types/drawing';

export interface GamePlayer extends Player {
  score: number;
  isOnline: boolean;
}

export interface Guess {
  id: string;
  player: string;
  message: string;
}

export const mockPlayers: readonly GamePlayer[] = [
  { id: '1', name: 'Ali', score: 320, isOnline: true },
  { id: '2', name: 'Hammad', score: 240, isOnline: true },
  { id: '3', name: 'Usman', score: 120, isOnline: true },
  { id: '4', name: 'Zain', score: 80, isOnline: true },
];

export const mockGuesses: readonly Guess[] = [
  { id: '1', player: 'Usman', message: 'house?' },
  { id: '2', player: 'Zain', message: 'laptop?' },
  { id: '3', player: 'Ali', message: 'computer?' },
  { id: '4', player: 'Usman', message: 'monitor?' },
];

export const wordChoices = ['Elephant', 'Laptop', 'Bridge'] as const;
export type DemoWord = (typeof wordChoices)[number];
export const defaultWord: DemoWord = 'Laptop';
export const hiddenWordLength = 5;
export const roundSeconds = 54;
export const chooseWordSeconds = 15;

export const drawingColors = [
  { label: 'Dark teal', value: '#124C53' },
  { label: 'Teal', value: '#71C9CE' },
  { label: 'Aqua', value: '#A6E3E9' },
  { label: 'Pale aqua', value: '#CBF1F5' },
  { label: 'White', value: '#FFFFFF' },
] as const;

function wheelPoints(x: number, y: number, radius: number) {
  return Array.from({ length: 57 }, (_, index) => {
    const angle = (index * Math.PI) / 28;
    return [x + radius * Math.cos(angle), y + radius * Math.sin(angle)];
  }).flat();
}

export const sampleDrawing: readonly DrawingStroke[] = [
  wheelPoints(233, 381, 128),
  wheelPoints(672, 381, 128),
  [233, 381, 426, 381, 600, 208, 335, 224, 233, 381],
  [302, 169, 426, 381, 447, 443, 486, 443],
  [
    672, 381, 591, 190, 558, 109, 604, 109, 618, 116, 623, 125, 620, 135, 606,
    142, 581, 145,
  ],
  [
    264, 164, 281, 155, 349, 155, 358, 161, 351, 169, 312, 178, 277, 177, 264,
    164,
  ],
].map((points, index) => ({
  id: `sample-${index}`,
  tool: 'pen',
  color: drawingColors[0].value,
  size: 8,
  points,
}));
