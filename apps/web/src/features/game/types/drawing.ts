export {
  DRAWING_WIDTH,
  DRAWING_HEIGHT,
  MIN_BRUSH_SIZE,
  MAX_BRUSH_SIZE,
} from '@draw-and-guess/shared';
export type {
  DrawingTool,
  BrushSettings,
  DrawingStroke,
} from '@draw-and-guess/shared';

export interface DrawingPoint {
  x: number;
  y: number;
}
