import { z } from 'zod';
import { socketLimits } from './socket-limits';

export const environmentSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  MAX_ACTIVE_ROOMS: z.coerce
    .number()
    .int()
    .min(1)
    .max(1_024)
    .default(socketLimits.activeRooms),
  MAX_SOCKET_CONNECTIONS: z.coerce
    .number()
    .int()
    .min(2)
    .max(8_192)
    .default(socketLimits.connections),
  FRONTEND_URL: z
    .url({ protocol: /^https?$/ })
    .pipe(
      z.string().refine((value) => {
        const url = new URL(value);
        return (
          !url.username &&
          !url.password &&
          url.pathname === '/' &&
          !url.search &&
          !url.hash
        );
      }, 'FRONTEND_URL must be an HTTP(S) origin.'),
    )
    .transform((url) => new URL(url).origin)
    .default('http://localhost:3000'),
});

export type Environment = z.infer<typeof environmentSchema>;
