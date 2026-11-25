import type { DrawingReceipt, DrawingStroke } from '@draw-and-guess/shared';

export interface CompletedCanvas extends DrawingReceipt {
  coordinates: Uint16Array;
  strokes: (Omit<DrawingStroke, 'points'> & { length: number })[];
}

export function packCompletedCanvas(
  receipt: DrawingReceipt,
  strokes: Iterable<DrawingStroke>,
  pointCount: number,
): CompletedCanvas {
  // Logical coordinates are bounded integers. Pack all points in one allocation.
  const coordinates = new Uint16Array(pointCount * 2);
  const marks: CompletedCanvas['strokes'] = [];
  let offset = 0;
  for (const { points, ...stroke } of strokes) {
    coordinates.set(points, offset);
    marks.push({ ...stroke, length: points.length });
    offset += points.length;
  }
  return { ...receipt, coordinates, strokes: marks };
}

export function unpackCompletedCanvas({
  coordinates,
  strokes,
  ...receipt
}: CompletedCanvas) {
  let offset = 0;
  return {
    ...receipt,
    strokes: strokes.map(({ length, ...stroke }) => {
      const points = Array.from(coordinates.subarray(offset, offset + length));
      offset += length;
      return { ...stroke, points };
    }),
  };
}
