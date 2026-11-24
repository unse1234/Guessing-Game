import assert from 'node:assert/strict';
import test from 'node:test';
import shared from '@draw-and-guess/shared';
import environmentModule from '../dist/common/environment.js';
import limitsModule from '../dist/common/socket-limits.js';
import roomGatewayModule from '../dist/rooms/rooms.gateway.js';
import roomsModule from '../dist/rooms/rooms.service.js';

const { environmentSchema } = environmentModule;
const { PeerRateLimit, socketLimits } = limitsModule;
const { RoomsGateway } = roomGatewayModule;
const { RoomsService } = roomsModule;
const { performance } = globalThis;

test('long-lived rooms retain membership and release their slot after the last session expires', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const rooms = new RoomsService({ get: () => 1 });
  t.after(() => rooms.onModuleDestroy());
  const created = rooms.create('host', 'Hammad');
  assert.equal(created.ok, true);
  const { room, reconnectToken } = created.data;
  now += 12 * 60 * 60 * 1_000;
  t.mock.timers.tick(now);
  assert.equal(rooms.getSnapshot(room.code).hostId, created.data.playerId);
  assert.equal(
    rooms.create('other', 'Other host').error.code,
    'SERVER_CAPACITY',
  );
  rooms.disconnect('host');
  now += shared.ROOM_RECONNECT_GRACE_MS;
  t.mock.timers.tick(shared.ROOM_RECONNECT_GRACE_MS);
  assert.equal(rooms.getSnapshot(room.code), undefined);
  assert.equal(
    rooms.rejoin('new-socket', room.code, reconnectToken).error.code,
    'SESSION_EXPIRED',
  );
  assert.equal(rooms.create('other', 'Other host').ok, true);
});

test('excess guess traffic does not exhaust the socket control window', (t) => {
  const rooms = new RoomsService();
  const gateway = new RoomsGateway(rooms);
  t.after(() => rooms.onModuleDestroy());
  const socket = { connected: true };
  const failures = [];
  const ack = (response) => failures.push(response.error.code);
  for (let i = 0; i < 32; i++)
    assert.equal(gateway.allow(socket, ack, 'guess'), true);
  assert.equal(gateway.allow(socket, ack, 'guess'), false);
  assert.deepEqual(failures, ['RATE_LIMITED']);
  assert.equal(gateway.allow(socket, ack), true);
});

test('peer windows share their budget, isolate peers, and recover from full tables', () => {
  const limit = new PeerRateLimit(2, 2);
  assert.equal(limit.take('peer-a', 0), true);
  assert.equal(limit.take('peer-a', 1), true);
  assert.equal(limit.take('peer-a', 2), false);
  assert.equal(limit.take('peer-b', 2), true);
  assert.equal(limit.take('peer-c', 3), false);
  assert.equal(limit.take('peer-a', socketLimits.windowMs - 1), false);
  assert.equal(limit.take('peer-c', socketLimits.windowMs), true);
  assert.equal(limit.take('peer-a', socketLimits.windowMs), false);
  assert.equal(limit.take('peer-a', socketLimits.windowMs + 2), true);
});

test('validates the configured origin and positive bounded capacities', () => {
  assert.equal(
    environmentSchema.parse({ FRONTEND_URL: 'https://play.example.invalid/' })
      .FRONTEND_URL,
    'https://play.example.invalid',
  );
  for (const value of [
    'bad',
    'file:///local',
    'https://user:pass@example.invalid',
    'https://example.invalid/path',
    'https://example.invalid/?query',
  ]) {
    assert.equal(
      environmentSchema.safeParse({ FRONTEND_URL: value }).success,
      false,
    );
  }
  for (const values of [
    { MAX_ACTIVE_ROOMS: 0 },
    { MAX_ACTIVE_ROOMS: 2000 },
    { MAX_SOCKET_CONNECTIONS: 1 },
  ]) {
    assert.equal(environmentSchema.safeParse(values).success, false);
  }
});

test('nickname validation rejects unsafe display controls and keeps ordinary international names', () => {
  for (const nickname of [
    'Name\u202E',
    'Name\u2066',
    'Name\ud800',
    'Name\u0000',
    'x'.repeat(21),
  ]) {
    assert.equal(shared.roomNicknameSchema.safeParse(nickname).success, false);
  }
  assert.equal(shared.roomNicknameSchema.parse('  زین  '), 'زین');
  assert.equal(shared.roomNicknameSchema.parse('Ali 👨‍👩‍👧'), 'Ali 👨‍👩‍👧');
});
