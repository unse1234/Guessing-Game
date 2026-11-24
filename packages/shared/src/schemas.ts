import { z } from 'zod';

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
