import assert from 'node:assert/strict';
import { once } from 'node:events';
import process from 'node:process';
import test from 'node:test';
import shared from '@draw-and-guess/shared';
import { io } from 'socket.io-client';

const { ROOM_RECONNECT_GRACE_MS, SOCKET_EVENTS: events } = shared;
const { AbortSignal, performance, console } = globalThis;
const url = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3001';
const origin = process.env.FRONTEND_URL ?? 'http://localhost:3000';

async function connect(t, transport = 'websocket') {
  const socket = io(url, {
    forceNew: true,
    autoConnect: false,
    reconnection: false,
    transports: [transport],
    extraHeaders: { Origin: origin },
  });
  t.after(() => socket.disconnect());
  const connected = once(socket, 'connect', {
    signal: AbortSignal.timeout(5_000),
  });
  socket.connect();
  await connected;
  return socket;
}

const request = (socket, event, payload) =>
  socket.timeout(5_000).emitWithAck(event, payload);
function update(socket, { wait = 5_000, afterRevision = 0 } = {}) {
  const signal = AbortSignal.timeout(wait);
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      signal.removeEventListener('abort', abort);
      socket.off(events.roomUpdated, accept);
    };
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    const accept = ({ room }) => {
      if (room.revision <= afterRevision) return;
      cleanup();
      resolve(room);
    };
    socket.on(events.roomUpdated, accept);
    signal.addEventListener('abort', abort, { once: true });
  });
}
function success(result) {
  assert.equal(result.ok, true, JSON.stringify(result.error));
  return result.data;
}

test('room acknowledgements, isolation, capacity, host transfer, and refresh recovery', async (t) => {
  const hostSocket = await connect(t);
  const aliSocket = await connect(t);
  const observer = await connect(t);
  success(await request(observer, events.roomCreate, { nickname: 'Separate' }));
  let unrelatedUpdates = 0;
  observer.on(events.roomUpdated, () => unrelatedUpdates++);

  assert.equal(
    (await request(hostSocket, events.roomCreate, { nickname: ' ' })).error
      .code,
    'INVALID_NICKNAME',
  );
  assert.equal(
    (await request(hostSocket, events.roomCreate, { nickname: '\tHammad' }))
      .error.code,
    'INVALID_NICKNAME',
  );
  assert.equal(
    (await request(hostSocket, events.roomCreate, null)).error.code,
    'INVALID_REQUEST',
  );
  // A mutation without an acknowledgement must not create a membership.
  hostSocket.emit(events.roomCreate, { nickname: 'Unacknowledged' });
  const startedCreate = performance.now();
  const host = success(
    await request(hostSocket, events.roomCreate, { nickname: ' Hammad ' }),
  );
  const createMs = performance.now() - startedCreate;
  const { code } = host.room;
  assert.match(code, /^[A-Z0-9]{6}$/);
  assert.equal(host.room.players[0].nickname, 'Hammad');
  assert.equal(host.room.players[0].isHost, true);

  assert.equal(
    (await request(aliSocket, events.roomJoin, { code: '--', nickname: 'Ali' }))
      .error.code,
    'INVALID_CODE',
  );
  const beforeJoin = performance.now();
  const [peer, joined] = await Promise.all([
    update(hostSocket).then((room) => ({
      room,
      ms: performance.now() - beforeJoin,
    })),
    request(aliSocket, events.roomJoin, {
      code: code.toLowerCase(),
      nickname: 'Ali',
    }).then((result) => ({
      session: success(result),
      ms: performance.now() - beforeJoin,
    })),
  ]);
  const ali = joined.session;
  assert.deepEqual(peer.room, ali.room);
  assert.equal(peer.room.players.length, 2);
  assert.deepEqual(Object.keys(peer.room.players[0]).sort(), [
    'id',
    'isHost',
    'isOnline',
    'nickname',
  ]);
  assert.ok(!JSON.stringify(peer.room).includes(host.reconnectToken));

  let extraUpdates = 0;
  const count = () => extraUpdates++;
  hostSocket.on(events.roomUpdated, count);
  assert.deepEqual(
    success(
      await request(aliSocket, events.roomJoin, { code, nickname: 'Ali' }),
    ),
    ali,
  );
  // An additional round trip on the observing connection also drains any prior room event.
  success(
    await request(hostSocket, events.roomRejoin, {
      code,
      reconnectToken: host.reconnectToken,
    }),
  );
  hostSocket.off(events.roomUpdated, count);
  assert.equal(extraUpdates, 0);

  const peers = [];
  const latencies = [];
  for (let index = 0; index < 6; index++) {
    const socket = await connect(t, index === 5 ? 'polling' : 'websocket');
    peers.push(socket);
    const started = performance.now();
    const [received, result] = await Promise.all([
      update(hostSocket).then((room) => ({
        room,
        ms: performance.now() - started,
      })),
      request(socket, events.roomJoin, { code, nickname: `Player ${index}` }),
    ]);
    assert.equal(received.room.players.length, index + 3);
    assert.deepEqual(received.room, success(result).room);
    latencies.push(received.ms);
  }
  const ninth = await connect(t);
  assert.equal(
    (await request(ninth, events.roomJoin, { code, nickname: 'Ninth' })).error
      .code,
    'ROOM_FULL',
  );

  const offline = update(hostSocket);
  aliSocket.disconnect();
  assert.equal(
    (await offline).players.find(({ id }) => id === ali.playerId).isOnline,
    false,
  );
  assert.equal(
    (await request(ninth, events.roomJoin, { code, nickname: 'Ninth' })).error
      .code,
    'ROOM_FULL',
  );
  const refreshed = await connect(t);
  const [back, restored] = await Promise.all([
    update(hostSocket),
    request(refreshed, events.roomRejoin, {
      code,
      reconnectToken: ali.reconnectToken,
    }),
  ]);
  assert.equal(success(restored).playerId, ali.playerId);
  assert.equal(back.players.filter(({ id }) => id === ali.playerId).length, 1);
  assert.equal(
    back.players.find(({ id }) => id === ali.playerId).isOnline,
    true,
  );

  const replacement = await connect(t);
  const notice = once(refreshed, events.roomClosed, {
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(
    success(
      await request(replacement, events.roomRejoin, {
        code,
        reconnectToken: ali.reconnectToken,
      }),
    ).playerId,
    ali.playerId,
  );
  assert.deepEqual((await notice)[0], { code, reason: 'session_replaced' });
  assert.equal(
    (await request(refreshed, events.roomLeave, {})).error.code,
    'NOT_IN_ROOM',
  );

  const [reduced, left] = await Promise.all([
    update(hostSocket),
    request(replacement, events.roomLeave, {}),
  ]);
  success(left);
  assert.equal(reduced.players.length, 7);
  const hostChanged = await Promise.all(
    peers
      .map((socket) => update(socket, { afterRevision: reduced.revision }))
      .concat(request(hostSocket, events.roomLeave, {}).then(success)),
  );
  for (const room of hostChanged.slice(0, peers.length)) {
    assert.equal(room.players.length, 6);
    assert.equal(room.players[0].isHost, true);
    assert.equal(room.players[0].nickname, 'Player 0');
  }
  assert.equal(unrelatedUpdates, 0);

  for (const socket of peers.slice(0, -1))
    success(await request(socket, events.roomLeave, {}));
  const last = peers.at(-1);
  const closed = once(last, events.roomClosed, {
    signal: AbortSignal.timeout(5_000),
  });
  success(await request(last, events.roomLeave, {}));
  assert.deepEqual((await closed)[0], { code, reason: 'room_closed' });
  assert.equal(
    (await request(ninth, events.roomJoin, { code, nickname: 'Ninth' })).error
      .code,
    'ROOM_NOT_FOUND',
  );

  for (let index = 0; index < 17; index++) {
    const result = await request(ninth, events.roomJoin, null);
    if (index === 16) assert.equal(result.error.code, 'RATE_LIMITED');
  }
  console.log(
    `[local timings] create ACK ${createMs.toFixed(2)} ms | join ACK ${joined.ms.toFixed(2)} ms | join to peer update ${peer.ms.toFixed(2)} ms | six additional peer updates ${latencies.map((ms) => ms.toFixed(2)).join(', ')} ms`,
  );
});

test(
  'offline host expiry transfers ownership and invalidates the old token',
  { timeout: ROOM_RECONNECT_GRACE_MS + 10_000 },
  async (t) => {
    const hostSocket = await connect(t);
    const guestSocket = await connect(t);
    const host = success(
      await request(hostSocket, events.roomCreate, { nickname: 'Hammad' }),
    );
    const { code } = host.room;
    const guest = success(
      await request(guestSocket, events.roomJoin, { code, nickname: 'Ali' }),
    );
    const offline = update(guestSocket);
    hostSocket.disconnect();
    const preserved = await offline;
    assert.equal(preserved.hostId, host.playerId);
    assert.equal(preserved.players[0].isOnline, false);

    const expired = await update(guestSocket, {
      wait: ROOM_RECONNECT_GRACE_MS + 4_000,
      afterRevision: preserved.revision,
    });
    assert.equal(expired.hostId, guest.playerId);
    assert.equal(expired.players.length, 1);
    const late = await connect(t);
    assert.equal(
      (
        await request(late, events.roomRejoin, {
          code,
          reconnectToken: host.reconnectToken,
        })
      ).error.code,
      'SESSION_EXPIRED',
    );
    success(await request(guestSocket, events.roomLeave, {}));
  },
);

test('oversized events are rejected and a new connection can still create a room', async (t) => {
  const socket = await connect(t);
  const closed = once(socket, 'disconnect', {
    signal: AbortSignal.timeout(5_000),
  });
  socket.emit(events.roomCreate, { nickname: 'A'.repeat(17 * 1024) });
  await closed;

  const next = await connect(t);
  success(await request(next, events.roomCreate, { nickname: 'Safe' }));
  success(await request(next, events.roomLeave, {}));
});
