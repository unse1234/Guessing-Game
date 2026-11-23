import { z } from 'zod';

export const pingSchema = z.object({ sentAt: z.number().int().nonnegative() });
export const pongSchema = pingSchema.extend({
  serverTime: z.number().int().nonnegative(),
});

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{6}$/);
