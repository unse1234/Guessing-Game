import assert from 'node:assert/strict';
import { once } from 'node:events';
import process from 'node:process';
import shared from '@draw-and-guess/shared';
import { io } from 'socket.io-client';

const { pongSchema, SOCKET_EVENTS } = shared;
const { AbortSignal, URL, console, fetch } = globalThis;
const apiUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3001';
const origin = process.env.FRONTEND_URL ?? 'http://localhost:3000';

const health = await fetch(new URL('/health', apiUrl), {
  headers: { Origin: origin },
  signal: AbortSignal.timeout(5_000),
});
assert.equal(health.status, 200);
assert.equal(health.headers.get('access-control-allow-origin'), origin);
assert.deepEqual(await health.json(), { status: 'ok' });

function makeClient(transport, requestOrigin = origin) {
  return io(apiUrl, {
    autoConnect: false,
    reconnection: false,
    timeout: 5_000,
    transports: [transport],
    extraHeaders: { Origin: requestOrigin },
  });
}

for (const transport of ['polling', 'websocket']) {
  const socket = makeClient(transport);
  try {
    const connected = Promise.race([
      once(socket, 'connect', { signal: AbortSignal.timeout(5_000) }),
      once(socket, 'connect_error', {
        signal: AbortSignal.timeout(5_000),
      }).then(([error]) => Promise.reject(error)),
    ]);
    socket.connect();
    await connected;

    const sentAt = Date.now();
    const pong = once(socket, SOCKET_EVENTS.pong, {
      signal: AbortSignal.timeout(5_000),
    });
    socket.emit(SOCKET_EVENTS.ping, { sentAt: 'invalid' });
    socket.emit(SOCKET_EVENTS.ping, { sentAt });
    const [payload] = await pong;
    assert.equal(pongSchema.parse(payload).sentAt, sentAt);
    console.log(`Socket.IO ${transport}: ping → pong`);
  } finally {
    socket.disconnect();
  }
}

const foreignSocket = makeClient('websocket', 'https://example.invalid');
try {
  const rejected = once(foreignSocket, 'connect_error', {
    signal: AbortSignal.timeout(5_000),
  });
  foreignSocket.connect();
  await rejected;
  assert.equal(foreignSocket.connected, false);
  console.log(
    'HTTP health, CORS, and foreign WebSocket origin rejection passed.',
  );
} finally {
  foreignSocket.disconnect();
}
