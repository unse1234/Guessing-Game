import {
  httpOriginSchema,
  productionOriginSchema,
} from '@draw-and-guess/shared';
import { z } from 'zod';
import { socketLimits } from './socket-limits';

export const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
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
    FRONTEND_URL: httpOriginSchema.optional(),
  })
  .transform((environment, ctx) => {
    const origin = environment.FRONTEND_URL;
    if (
      environment.NODE_ENV === 'production' &&
      !productionOriginSchema.safeParse(origin).success
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['FRONTEND_URL'],
        message:
          'Specify an HTTPS frontend origin or an explicit HTTP loopback origin for local checks.',
      });
      return z.NEVER;
    }
    return { ...environment, FRONTEND_URL: origin ?? 'http://localhost:3000' };
  });

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(raw: Record<string, unknown>): Environment {
  const result = environmentSchema.safeParse(raw);
  if (result.success) return result.data;

  const fields = [
    ...new Set(result.error.issues.map((issue) => issue.path[0])),
  ];
  throw new Error(
    `Invalid API environment (${fields.join(', ')}). Check the environment settings in the README.`,
  );
}
