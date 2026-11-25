import type { CompletedDrawingInfo } from '@draw-and-guess/shared';
import { Group } from 'konva/lib/Group';
import { Circle } from 'konva/lib/shapes/Circle';
import { Line } from 'konva/lib/shapes/Line';
import { strokeShape } from '@/features/game/lib/stroke-shape';
import {
  DRAWING_HEIGHT,
  DRAWING_WIDTH,
  type DrawingStroke,
} from '@/features/game/types/drawing';

async function encodeDrawing(ink: Group, pixelRatio: number) {
  const canvas = ink.toCanvas({
    x: 0,
    y: 0,
    width: DRAWING_WIDTH,
    height: DRAWING_HEIGHT,
    pixelRatio,
  });
  try {
    const context = canvas.getContext('2d');
    if (!context) return null;
    // Put white underneath the composed ink so an eraser reveals white.
    context.resetTransform();
    context.globalCompositeOperation = 'destination-over';
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    return png?.size ? png : null;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function renderDrawingPng(strokes: readonly DrawingStroke[]) {
  const ink = new Group({ listening: false });
  try {
    for (const stroke of strokes) {
      const shape = strokeShape(stroke);
      ink.add(
        shape.kind === 'circle'
          ? new Circle(shape.props)
          : new Line(shape.props),
      );
    }
    return (
      (await encodeDrawing(ink, 2).catch(() => null)) ??
      (await encodeDrawing(ink, 1))
    );
  } finally {
    ink.destroy();
  }
}

export function saveDrawingPng(
  png: Blob,
  { round, drawerName }: CompletedDrawingInfo,
) {
  const link = document.createElement('a');
  if (!('download' in link) || typeof URL.createObjectURL !== 'function')
    return false;
  const safeName = drawerName
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-');
  const slug = Array.from(safeName)
    .slice(0, 32)
    .join('')
    .replace(/^-+|-+$/g, '');
  const url = URL.createObjectURL(png);
  link.href = url;
  link.download = `draw-and-guess-round-${round}-${slug || 'drawer'}.png`;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Let the browser open the blob before releasing the object URL.
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
  }
  return true;
}
