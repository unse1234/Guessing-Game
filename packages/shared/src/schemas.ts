import { z } from 'zod';
import {
  DRAWING_HEIGHT,
  DRAWING_WIDTH,
  MAX_BRUSH_SIZE,
  MAX_DRAW_BATCH_POINTS,
  MAX_DRAW_STROKE_POINTS,
  MIN_BRUSH_SIZE,
} from './types';

export const pingSchema = z.object({ sentAt: z.number().int().nonnegative() });
export const pongSchema = pingSchema.extend({
  serverTime: z.number().int().nonnegative(),
});

export const roomCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{6}$/)
  .toUpperCase();

export const roomNicknameSchema = z
  .string()
  .refine((value) => !/\p{Cc}/u.test(value))
  .transform((value) => value.trim())
  .pipe(z.string().min(2).max(20));

export const roomCreateSchema = z.strictObject({
  nickname: roomNicknameSchema,
});
export const roomJoinSchema = roomCreateSchema.extend({ code: roomCodeSchema });
export const roomLeaveSchema = z.strictObject({});
export const roomRejoinSchema = z.strictObject({
  code: roomCodeSchema,
  reconnectToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

export const gameRoomSchema = z.strictObject({ code: roomCodeSchema });
export const wordChooseSchema = gameRoomSchema.extend({
  revision: z.number().int().positive(),
  word: z.string().min(1).max(40),
});

export const drawSyncSchema = z.strictObject({ turnId: z.uuid() });
export const drawClearSchema = drawSyncSchema.extend({
  canvasVersion: z.number().int().nonnegative(),
});
const strokeId = z.string().regex(/^[0-9a-f]{32}$/);
const x = z.number().int().min(0).max(DRAWING_WIDTH);
const y = z.number().int().min(0).max(DRAWING_HEIGHT);
function pointsSchema(limit: number) {
  return z
    .array(z.number().int().min(0).max(DRAWING_WIDTH))
    .min(2)
    .max(limit * 2)
    .refine(
      (points) =>
        points.length % 2 === 0 &&
        points.every((value, i) => i % 2 === 0 || value <= DRAWING_HEIGHT),
    );
}

export const drawStartSchema = drawClearSchema.extend({
  id: strokeId,
  tool: z.enum(['pen', 'eraser']),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  size: z.number().int().min(MIN_BRUSH_SIZE).max(MAX_BRUSH_SIZE),
  point: z.tuple([x, y]),
});
export const drawPointsSchema = drawClearSchema.extend({
  id: strokeId,
  sequence: z.number().int().nonnegative().max(MAX_DRAW_STROKE_POINTS),
  points: pointsSchema(MAX_DRAW_BATCH_POINTS),
});
export const drawEndSchema = drawClearSchema.extend({
  id: strokeId,
  points: pointsSchema(MAX_DRAW_STROKE_POINTS),
});
