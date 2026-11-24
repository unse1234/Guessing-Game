import { z } from 'zod';
import {
  DRAWING_HEIGHT,
  DRAWING_WIDTH,
  MAX_BRUSH_SIZE,
  MAX_DRAW_BATCH_POINTS,
  MAX_DRAW_STROKE_POINTS,
  MAX_GUESS_LENGTH,
  MIN_BRUSH_SIZE,
} from './types';

export const httpOriginSchema = z
  .url({ protocol: /^https?$/ })
  .pipe(
    z.string().refine((value) => {
      const url = new URL(value);
      return (
        !url.username &&
        !url.password &&
        url.pathname === '/' &&
        !url.href.includes('?') &&
        !url.href.includes('#')
      );
    }, 'Use an HTTP(S) origin without credentials, path, query, or fragment.'),
  )
  .transform((value) => new URL(value).origin);

export const productionOriginSchema = httpOriginSchema.refine((origin) => {
  const url = new URL(origin);
  return (
    url.protocol === 'https:' ||
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  );
}, 'Use HTTPS for public origins. HTTP is only allowed on explicit loopback origins.');

export const pingSchema = z.strictObject({
  sentAt: z.number().int().nonnegative(),
});
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
  .refine((value) => !/[\p{Cc}\p{Cs}\p{Bidi_Control}]/u.test(value))
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
export const gameStartSchema = gameRoomSchema.extend({
  generation: z.number().int().nonnegative(),
});
export const gameRestartSchema = gameRoomSchema.extend({ gameId: z.uuid() });
export const wordChooseSchema = gameRoomSchema.extend({
  turnId: z.uuid(),
  revision: z.number().int().positive(),
  word: z.string().min(1).max(40),
});

export const guessTextSchema = z
  .string()
  .refine((value) => !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value))
  .trim()
  .refine((value) => {
    const length = [...value].length;
    return length > 0 && length <= MAX_GUESS_LENGTH;
  });

const operationId = z.string().regex(/^[0-9a-f]{32}$/);
export const guessSubmitSchema = gameRoomSchema.extend({
  turnId: z.uuid(),
  requestId: operationId,
  guess: guessTextSchema,
});

export const drawSyncSchema = z.strictObject({ turnId: z.uuid() });
export const drawClearSchema = drawSyncSchema.extend({
  canvasVersion: z.number().int().nonnegative(),
});
const x = z.number().int().min(0).max(DRAWING_WIDTH);
const y = z.number().int().min(0).max(DRAWING_HEIGHT);
function pointsSchema(limit: number) {
  return z.custom<number[]>((points) => {
    if (
      !Array.isArray(points) ||
      points.length < 2 ||
      points.length > limit * 2 ||
      points.length % 2 !== 0
    )
      return false;
    for (let i = 0; i < points.length; i += 2) {
      const horizontal = points[i];
      const vertical = points[i + 1];
      if (
        !Number.isInteger(horizontal) ||
        horizontal < 0 ||
        horizontal > DRAWING_WIDTH ||
        !Number.isInteger(vertical) ||
        vertical < 0 ||
        vertical > DRAWING_HEIGHT
      )
        return false;
    }
    return true;
  });
}

export const drawStartSchema = drawClearSchema.extend({
  id: operationId,
  tool: z.enum(['pen', 'eraser']),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  size: z.number().int().min(MIN_BRUSH_SIZE).max(MAX_BRUSH_SIZE),
  point: z.tuple([x, y]),
});
export const drawPointsSchema = drawClearSchema.extend({
  id: operationId,
  sequence: z.number().int().nonnegative().max(MAX_DRAW_STROKE_POINTS),
  points: pointsSchema(MAX_DRAW_BATCH_POINTS),
});
export const drawEndSchema = drawClearSchema.extend({
  id: operationId,
  points: pointsSchema(MAX_DRAW_STROKE_POINTS),
});
