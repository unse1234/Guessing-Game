import type Konva from 'konva';
import type { DrawingStroke } from '@/features/game/types/drawing';

export function strokeShape(
  stroke: DrawingStroke,
):
  | { kind: 'circle'; props: Konva.CircleConfig }
  | { kind: 'line'; props: Konva.LineConfig } {
  const { tool, points, color, size } = stroke;
  const globalCompositeOperation =
    tool === 'eraser' ? 'destination-out' : 'source-over';
  if (points.length === 2) {
    return {
      kind: 'circle',
      props: {
        x: points[0],
        y: points[1],
        radius: size / 2,
        fill: color,
        globalCompositeOperation,
      },
    };
  }
  return {
    kind: 'line',
    props: {
      points,
      stroke: color,
      strokeWidth: size,
      lineCap: 'round',
      lineJoin: 'round',
      globalCompositeOperation,
    },
  };
}
