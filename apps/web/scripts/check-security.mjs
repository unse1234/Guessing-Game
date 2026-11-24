import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import process from 'node:process';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { URL } from 'node:url';
import shared from '@draw-and-guess/shared';
import { io } from 'socket.io-client';

const { SOCKET_EVENTS: events } = shared;
const { AbortSignal, fetch } = globalThis;
const port = process.env.SECURITY_TEST_PORT ?? '3103';
const url = `http://localhost:${port}`;
const origin = 'http://localhost:3200';

async function startApi(t) {
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: new URL('../../api/', import.meta.url),
    env: {
      ...process.env,
      PORT: port,
      FRONTEND_URL: origin,
      MAX_ACTIVE_ROOMS: '1',
      MAX_SOCKET_CONNECTIONS: '3',
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const exit = once(child, 'exit');
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exit;
  };
  t.after(stop);
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null)
      throw new Error('Test API exited during startup');
    try {
      if (
        (await fetch(`${url}/health`, { signal: AbortSignal.timeout(300) })).ok
      )
        return stop;
    } catch {
      /* The API may still be starting. */
    }
    await delay(50);
  }
  throw new Error('Test API did not start');
}

function client(t, originHeader = origin) {
  const socket = io(url, {
    forceNew: true,
    autoConnect: false,
    reconnection: false,
    transports: ['websocket'],
    extraHeaders: { Origin: originHeader },
  });
  t.after(() => socket.disconnect());
  return socket;
}

function open(socket) {
  return new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
    socket.connect();
  });
}

async function send(socket, event, payload) {
  return socket.timeout(5_000).emitWithAck(event, payload);
}

function success(result) {
  assert.equal(result.ok, true, JSON.stringify(result.error));
  return result.data;
}

test(
  'checks admission limits, denies forged gameplay requests, and invalidates credentials after restart',
  { timeout: 30_000 },
  async (t) => {
    const stop = await startApi(t);
    await assert.rejects(open(client(t, 'https://foreign.example.invalid')));
    const host = client(t);
    await open(host);
    const { room, reconnectToken, playerId } = success(
      await send(host, events.roomCreate, { nickname: 'Hammad' }),
    );
    const { code } = room;
    const guest = client(t);
    const outsider = client(t);
    const refused = client(t);
    const admissions = await Promise.allSettled([
      open(guest),
      open(outsider),
      open(refused),
    ]);
    assert.equal(
      admissions.filter(({ status }) => status === 'fulfilled').length,
      2,
    );
    const [member, spare] = [guest, outsider, refused].filter(
      (socket) => socket.connected,
    );
    assert.equal(
      (await send(spare, events.roomCreate, { nickname: 'Another host' })).error
        .code,
      'SERVER_CAPACITY',
    );
    success(await send(member, events.roomJoin, { code, nickname: 'Guest' }));
    assert.equal(
      (await send(spare, events.gameGetState, { code })).error.code,
      'NOT_IN_ROOM',
    );
    assert.equal(
      (
        await send(member, events.gameStart, {
          code,
          generation: room.gameGeneration,
        })
      ).error.code,
      'NOT_HOST',
    );
    assert.equal(
      (
        await send(member, events.gameStart, {
          code,
          generation: room.gameGeneration,
          playerId,
        })
      ).error.code,
      'INVALID_REQUEST',
    );
    const optionsEvent = once(host, events.wordOptions, {
      signal: AbortSignal.timeout(5_000),
    });
    const selection = success(
      await send(host, events.gameStart, {
        code,
        generation: room.gameGeneration,
      }),
    );
    const [options] = await optionsEvent;
    const word = options.options[0];
    const choose = {
      code,
      turnId: selection.turnId,
      revision: selection.revision,
      word,
    };
    assert.equal(
      (await send(member, events.wordChoose, choose)).error.code,
      'NOT_DRAWER',
    );
    success(await send(host, events.wordChoose, choose));
    const scope = { turnId: selection.turnId, canvasVersion: 0 };
    assert.equal(
      (await send(member, events.drawClear, scope)).error.code,
      'NOT_DRAWER',
    );
    assert.equal(
      (await send(member, events.drawClear, { ...scope, playerId })).error.code,
      'INVALID_REQUEST',
    );
    assert.equal(
      (await send(spare, events.drawClear, scope)).error.code,
      'NOT_IN_ROOM',
    );
    assert.equal(
      (
        await send(member, events.gameRestart, {
          code,
          gameId: selection.gameId,
        })
      ).error.code,
      'RESTART_HOST_ONLY',
    );
    const view = success(await send(member, events.gameGetState, { code }));
    assert.equal(view.privateWord, undefined);
    assert.equal(view.game.summary, undefined);

    const ping = once(host, events.pong, {
      signal: AbortSignal.timeout(5_000),
    });
    const responses = [];
    host.on(events.pong, (data) => responses.push(data.sentAt));
    host.emit(events.ping, { sentAt: 1, extra: true });
    host.emit(events.ping, { sentAt: 2 });
    host.emit(events.ping, { sentAt: 3 });
    await ping;
    success(await send(host, events.gameGetState, { code }));
    assert.deepEqual(responses, [2]);

    const disconnected = once(host, 'disconnect', {
      signal: AbortSignal.timeout(5_000),
    });
    await stop();
    await disconnected;
    await startApi(t);
    await open(host);
    assert.equal(
      (await send(host, events.roomRejoin, { code, reconnectToken })).error
        .code,
      'SESSION_EXPIRED',
    );
    assert.equal(
      (await send(host, events.gameGetState, { code })).error.code,
      'ROOM_NOT_FOUND',
    );
    const fresh = success(
      await send(host, events.roomCreate, { nickname: 'Hammad' }),
    );
    assert.notEqual(fresh.playerId, playerId);
  },
);
