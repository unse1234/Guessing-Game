import type { z } from 'zod';
import type { pingSchema, pongSchema } from './schemas';

export const SOCKET_EVENTS = {
  ping: 'ping',
  pong: 'pong',
} as const;

export type Ping = z.infer<typeof pingSchema>;
export type Pong = z.infer<typeof pongSchema>;

export interface ClientToServerEvents {
  [SOCKET_EVENTS.ping]: (payload: Ping) => void;
}

export interface ServerToClientEvents {
  [SOCKET_EVENTS.pong]: (payload: Pong) => void;
}
