import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@draw-and-guess/shared';
import { io, type Socket } from 'socket.io-client';
import { z } from 'zod';

const socketUrlSchema = z.url({ protocol: /^https?$/ });
let socket: Socket<ServerToClientEvents, ClientToServerEvents> | undefined;

export function getGameSocket() {
  if (socket) return socket;

  const url = socketUrlSchema.parse(
    process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3001',
  );
  socket = io(url, {
    autoConnect: false,
    timeout: 5_000,
    reconnectionDelayMax: 3_000,
  });
  return socket;
}
