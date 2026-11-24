import {
  httpOriginSchema,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@draw-and-guess/shared';
import { io, type Socket } from 'socket.io-client';

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | undefined;

export function getGameSocket() {
  if (socket) return socket;

  const url = httpOriginSchema.parse(
    process.env.NEXT_PUBLIC_SOCKET_URL ??
      (process.env.NODE_ENV === 'development'
        ? 'http://localhost:3001'
        : undefined),
  );
  socket = io(url, {
    autoConnect: false,
    timeout: 5_000,
    reconnectionDelayMax: 3_000,
  });
  return socket;
}
