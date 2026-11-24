export type DrawingTool = 'pen' | 'eraser';

export interface BrushSettings {
  tool: DrawingTool;
  color: string;
  size: number;
}

export interface DrawingStroke extends BrushSettings {
  id: string;
  points: number[];
}

export interface DrawingPoint {
  x: number;
  y: number;
}

export const DRAWING_WIDTH = 900;
export const DRAWING_HEIGHT = 600;
export const MIN_BRUSH_SIZE = 2;
export const MAX_BRUSH_SIZE = 30;
