import { z } from 'zod';

export const environmentSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  FRONTEND_URL: z
    .url({ protocol: /^https?$/ })
    .transform((url) => new URL(url).origin)
    .default('http://localhost:3000'),
});

export type Environment = z.infer<typeof environmentSchema>;
