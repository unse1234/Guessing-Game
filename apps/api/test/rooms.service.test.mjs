import assert from 'node:assert/strict';
import test from 'node:test';
import roomsModule from '../dist/rooms/rooms.service.js';

const { RoomsService } = roomsModule;

function fixture(t) {
  const rooms = new RoomsService();
  t.after(() => rooms.onModuleDestroy());
  return rooms;
}

function session(result) {
  assert.equal(result.ok, true);
  return result.data;
}

test('creates private sessions, supports idempotency, and enforces room capacity', (t) => {
  const rooms = fixture(t);
  const host = session(rooms.create('host', 'Hammad'));
  const { code, hostId, players, status } = host.room;
  assert.match(code, /^[A-Z0-9]{6}$/);
  assert.equal(status, 'waiting');
  assert.equal(hostId, host.playerId);
  assert.deepEqual(players, [
    { id: hostId, nickname: 'Hammad', isHost: true, isOnline: true },
  ]);
  assert.match(host.reconnectToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(rooms.create('host', 'Hammad').changed, false);
  assert.equal(
    rooms.join('host', 'ABCDEF', 'Hammad').error.code,
    'ALREADY_IN_ROOM',
  );

  const guest = session(rooms.join('guest', code, 'Ali'));
  const repeated = rooms.join('guest', code, 'Ali');
  assert.equal(repeated.changed, false);
  assert.deepEqual(session(repeated), guest);
  assert.notEqual(guest.reconnectToken, host.reconnectToken);
  assert.equal(rooms.create('guest', 'Ali').error.code, 'ALREADY_IN_ROOM');
  for (let index = 0; index < 6; index++) {
    session(rooms.join(`peer-${index}`, code, `Player ${index}`));
  }
  assert.equal(rooms.join('ninth', code, 'Ninth').error.code, 'ROOM_FULL');
});

test('preserves a disconnected host and securely reattaches or replaces a socket', (t) => {
  const rooms = fixture(t);
  const host = session(rooms.create('host', 'Hammad'));
  const guest = session(rooms.join('guest', host.room.code, 'Ali'));
  const offline = rooms.disconnect('host').room;
  assert.equal(offline.hostId, host.playerId);
  assert.equal(offline.players[0].isOnline, false);
  assert.equal(rooms.leave('host').error.code, 'NOT_IN_ROOM');
  assert.equal(
    rooms.rejoin('fake', host.room.code, 'wrong').error.code,
    'SESSION_EXPIRED',
  );
  assert.equal(
    rooms.rejoin('guest', host.room.code, host.reconnectToken).error.code,
    'ALREADY_IN_ROOM',
  );

  const restored = session(
    rooms.rejoin('new', host.room.code, host.reconnectToken),
  );
  assert.equal(restored.playerId, host.playerId);
  assert.equal(restored.room.players.length, 2);
  assert.equal(restored.room.players[0].isOnline, true);
  assert.ok(restored.room.revision > offline.revision);
  assert.equal(
    rooms.rejoin('new', host.room.code, host.reconnectToken).changed,
    false,
  );

  const replaced = rooms.rejoin('newer', host.room.code, host.reconnectToken);
  assert.equal(replaced.replacedSocketId, 'new');
  assert.equal(replaced.changed, false);
  assert.equal(rooms.disconnect('new'), undefined);
  assert.equal(rooms.leave('newer').room.hostId, guest.playerId);
  assert.equal(
    rooms.rejoin('expired', host.room.code, host.reconnectToken).error.code,
    'SESSION_EXPIRED',
  );
});

test('skips offline candidates for host transfer and closes the room after its last member leaves', (t) => {
  const rooms = fixture(t);
  const {
    room: { code },
  } = session(rooms.create('host', 'Hammad'));
  const early = session(rooms.join('early', code, 'Ali'));
  const connected = session(rooms.join('connected', code, 'Usman'));
  rooms.disconnect('early');
  const transfer = rooms.leave('host');
  assert.equal(transfer.room.hostId, connected.playerId);

  const waiting = rooms.leave('connected');
  assert.equal(waiting.room.hostId, null);
  const returned = session(
    rooms.rejoin('returning', code, early.reconnectToken),
  );
  assert.equal(returned.room.hostId, early.playerId);
  assert.deepEqual(rooms.leave('returning'), { kind: 'closed', code });
  assert.equal(rooms.join('late', code, 'Late').error.code, 'ROOM_NOT_FOUND');
});
