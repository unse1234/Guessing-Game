import assert from 'node:assert/strict';
import { once } from 'node:events';
import process from 'node:process';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import shared from '@draw-and-guess/shared';
import { io } from 'socket.io-client';

const { SOCKET_EVENTS: events, DRAW_BATCH_MS, MAX_DRAW_STROKE_POINTS } = shared;
const { AbortSignal, performance, console, Buffer } = globalThis;
const url = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3001';
const origin = process.env.FRONTEND_URL ?? 'http://localhost:3000';

async function wait(socket, event) {
  const [payload] = await once(socket, event, {
    signal: AbortSignal.timeout(5_000),
  });
  return payload;
}
async function connect(t) {
  const socket = io(url, {
    autoConnect: false,
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
    extraHeaders: { Origin: origin },
  });
  t.after(() => socket.disconnect());
  const ready = wait(socket, 'connect');
  socket.connect();
  await ready;
  return socket;
}
const request = (socket, event, body) =>
  socket.timeout(5_000).emitWithAck(event, body);

function success(result) {
  assert.equal(result.ok, true, JSON.stringify(result.error));
  return result.data;
}

async function snapshot(socket, turnId) {
  return success(await request(socket, events.drawSync, { turnId }));
}

const strokeId = (number) => number.toString(16).padStart(32, '0');
const brush = { tool: 'pen', size: 6, color: '#124C53', point: [10, 20] };

test('live drawing across a full room, optimistic previews, clear, and reconnect restore', async (t) => {
  let sender = await connect(t);
  const watchers = await Promise.all(
    Array.from({ length: 7 }, () => connect(t)),
  );
  const unrelated = await connect(t);
  success(
    await request(unrelated, events.roomCreate, { nickname: 'Independent' }),
  );
  let unrelatedPackets = 0;
  for (const event of [
    events.drawStart,
    events.drawPoints,
    events.drawEnd,
    events.drawClear,
  ]) {
    unrelated.on(event, () => {
      unrelatedPackets++;
    });
  }
  const host = success(
    await request(sender, events.roomCreate, { nickname: 'Hammad' }),
  );
  const { code } = host.room;
  const peers = await Promise.all(
    watchers.map((socket, index) =>
      request(socket, events.roomJoin, {
        code,
        nickname: index === 0 ? 'Ali' : `Player ${index}`,
      }).then(success),
    ),
  );
  const [selection, options] = await Promise.all([
    request(sender, events.gameStart, { code, generation: 0 }).then(success),
    wait(sender, events.wordOptions),
  ]);
  const turnId = selection.turnId;
  const scope = { turnId, canvasVersion: 0 };
  const first = { ...scope, ...brush, id: strokeId(1) };
  assert.equal(
    (await request(sender, events.drawStart, first)).error.code,
    'WRONG_PHASE',
  );
  success(
    await request(sender, events.wordChoose, {
      code,
      turnId: selection.turnId,
      revision: selection.revision,
      word: options.options[0],
    }),
  );
  const baseline = await snapshot(watchers[0], turnId);
  assert.deepEqual(baseline.strokes, []);
  assert.equal(
    (await request(watchers[0], events.drawStart, first)).error.code,
    'NOT_DRAWER',
  );
  assert.equal(
    (await request(unrelated, events.drawClear, scope)).error.code,
    'WRONG_PHASE',
  );
  assert.equal(
    (
      await request(sender, events.drawStart, {
        ...first,
        turnId: '99d273ef-ac41-4895-aa40-e3bd04593b67',
      })
    ).error.code,
    'STALE_CANVAS',
  );
  assert.equal(
    (await request(sender, events.drawStart, { ...first, point: [900, 601] }))
      .error.code,
    'INVALID_REQUEST',
  );

  let echoes = 0;
  sender.on(events.drawStart, () => {
    echoes++;
  });
  sender.on(events.drawEnd, () => {
    echoes++;
  });
  const started = performance.now();
  const [receipt, ...starts] = await Promise.all([
    request(sender, events.drawStart, first).then(success),
    ...watchers.map((socket) => wait(socket, events.drawStart)),
  ]);
  assert.ok(
    starts.every(
      ({ stroke }) =>
        stroke.color === brush.color && stroke.size === brush.size,
    ),
  );
  assert.deepEqual(starts[0].stroke.points, brush.point);
  assert.equal(
    success(await request(sender, events.drawStart, first)).revision,
    receipt.revision,
  );

  const preview = wait(watchers[0], events.drawPoints);
  sender.emit(events.drawPoints, {
    ...scope,
    id: first.id,
    sequence: 0,
    points: [30, 40],
  });
  assert.deepEqual((await preview).points, [30, 40]);
  // The second batch is missing. The reliable completion includes the missing pair.
  sender.emit(events.drawPoints, {
    ...scope,
    id: first.id,
    sequence: 2,
    points: [80, 90],
  });
  const full = [10, 20, 30, 40, 50, 60, 80, 90];
  const endAt = performance.now();
  const [ended, ...finals] = await Promise.all([
    request(sender, events.drawEnd, {
      ...scope,
      id: first.id,
      points: full,
    }).then(success),
    ...watchers.map((socket) => wait(socket, events.drawEnd)),
  ]);
  const endMs = performance.now() - endAt;
  const strokeMs = performance.now() - started;
  assert.ok(
    finals.every(
      ({ stroke }) => JSON.stringify(stroke.points) === JSON.stringify(full),
    ),
  );
  assert.equal(
    success(
      await request(sender, events.drawEnd, {
        ...scope,
        id: first.id,
        points: full,
      }),
    ).revision,
    ended.revision,
  );
  assert.equal(echoes, 0);

  const eraser = {
    ...scope,
    ...brush,
    id: strokeId(2),
    tool: 'eraser',
    size: 22,
    color: '#FFFFFF',
  };
  success(await request(sender, events.drawStart, eraser));
  const [eraserEnd] = await Promise.all([
    wait(watchers[0], events.drawEnd),
    request(sender, events.drawEnd, {
      ...scope,
      id: eraser.id,
      points: [10, 20, 40, 50],
    }).then(success),
  ]);
  assert.equal(eraserEnd.stroke.tool, 'eraser');
  assert.equal(eraserEnd.stroke.size, 22);

  watchers[0].disconnect();
  const refreshed = await connect(t);
  success(
    await request(refreshed, events.roomRejoin, {
      code,
      reconnectToken: peers[0].reconnectToken,
    }),
  );
  const snapAt = performance.now();
  const restored = await snapshot(refreshed, turnId);
  const snapshotMs = performance.now() - snapAt;
  assert.deepEqual(restored.strokes, [finals[0].stroke, eraserEnd.stroke]);

  // Test the largest legal reliable end without traversing the Socket.IO payload limit.
  const stress = {
    ...scope,
    ...brush,
    id: strokeId(3),
    color: '#71C9CE',
    size: 10,
  };
  success(await request(sender, events.drawStart, stress));
  const stressPoints = [...brush.point];
  const loadAt = performance.now();
  const batches = 23;
  let bytes = 0;
  for (let sequence = 0; sequence < batches; sequence++) {
    const points = Array.from({ length: 64 }, (_, index) => [
      100 + index,
      100 + sequence,
    ]).flat();
    const packet = { ...scope, id: stress.id, sequence, points };
    bytes += Buffer.byteLength(JSON.stringify(packet));
    stressPoints.push(...points);
    sender.emit(events.drawPoints, packet);
    await delay(DRAW_BATCH_MS);
  }
  while (stressPoints.length < MAX_DRAW_STROKE_POINTS * 2)
    stressPoints.push(900, 600);
  const stressEnd = { ...scope, id: stress.id, points: stressPoints };
  assert.ok(Buffer.byteLength(JSON.stringify(stressEnd)) < 16 * 1024);
  const [fastFinal] = await Promise.all([
    wait(refreshed, events.drawEnd),
    request(sender, events.drawEnd, stressEnd).then(success),
  ]);
  assert.deepEqual(fastFinal.stroke.points, stressPoints);
  assert.equal(fastFinal.stroke.size, 10);
  const elapsed = performance.now() - loadAt;

  success(
    await request(sender, events.drawStart, { ...first, id: strokeId(4) }),
  );
  const interrupted = wait(refreshed, events.drawEnd);
  sender.disconnect();
  assert.equal((await interrupted).stroke.id, strokeId(4));
  sender = await connect(t);
  success(
    await request(sender, events.roomRejoin, {
      code,
      reconnectToken: host.reconnectToken,
    }),
  );
  const view = success(await request(sender, events.gameGetState, { code }));
  assert.equal(view.game.turnId, turnId);
  assert.equal(view.privateWord.word, options.options[0]);
  assert.equal((await snapshot(sender, turnId)).strokes.length, 4);

  const [clear, receivedClear] = await Promise.all([
    request(sender, events.drawClear, scope).then(success),
    wait(refreshed, events.drawClear),
  ]);
  assert.deepEqual(clear, receivedClear);
  assert.equal(clear.canvasVersion, 1);
  assert.equal(
    (
      await request(sender, events.drawEnd, {
        ...scope,
        id: strokeId(4),
        points: [10, 20],
      })
    ).error.code,
    'STALE_CANVAS',
  );
  assert.equal(
    (await request(sender, events.drawClear, scope)).error.code,
    'STALE_CANVAS',
  );
  assert.deepEqual((await snapshot(watchers[1], turnId)).strokes, []);
  assert.equal(unrelatedPackets, 0);
  console.log(
    `[drawing localhost] full stroke across 7 peers: ${strokeMs.toFixed(2)} ms including input and final ACK; final ACK + fan-out ${endMs.toFixed(2)} ms; snapshot ${snapshotMs.toFixed(2)} ms. Stress: ${((batches * 1000) / elapsed).toFixed(1)} batches/s, 64 points/batch, ${Math.round(bytes / batches)} JSON bytes/batch, ${MAX_DRAW_STROKE_POINTS} final points.`,
  );
});
