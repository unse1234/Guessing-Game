import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath, URL } from 'node:url';
import shared from '@draw-and-guess/shared';
import { io } from 'socket.io-client';

const { performance, AbortSignal, fetch, console } = globalThis;
const { SOCKET_EVENTS: events, DRAW_BATCH_MS } = shared;
const origin = 'http://localhost:3200';
const port = Number(process.env.BENCH_PORT ?? 3102);
const url = `http://localhost:${port}`;
const repeats = Number(process.env.BENCH_REPEATS ?? 3);
const apiDir = new URL('../../api/', import.meta.url);
const sockets = new Set();

// IPC measures only the API child process and keeps instrumentation off the wire.
const probe = `import process from 'node:process';
  import { performance } from 'node:perf_hooks';
  process.on('message', () => process.send({ cpu: process.cpuUsage(), memory: process.memoryUsage(), at: performance.now() }));`;
const server = fork(fileURLToPath(new URL('dist/main.js', apiDir)), {
  cwd: apiDir,
  env: {
    ...process.env,
    PORT: String(port),
    FRONTEND_URL: origin,
    NODE_ENV: 'production',
  },
  execArgv: ['--import', `data:text/javascript,${encodeURIComponent(probe)}`],
  stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
});

async function sampleProcess() {
  const result = once(server, 'message', {
    signal: AbortSignal.timeout(5_000),
  });
  server.send('measure');
  return (await result)[0];
}

function distribution(values) {
  const sorted = values.toSorted((a, b) => a - b);
  const percentile = (p) =>
    Number(sorted[Math.ceil(sorted.length * p) - 1]?.toFixed(2));
  return { n: sorted.length, median: percentile(0.5), p95: percentile(0.95) };
}

function listen(socket, event) {
  return once(socket, event, { signal: AbortSignal.timeout(5_000) }).then(
    ([value]) => value,
  );
}

async function connect() {
  const socket = io(url, {
    transports: ['websocket'],
    reconnection: false,
    autoConnect: false,
    extraHeaders: { Origin: origin },
  });
  sockets.add(socket);
  const connected = listen(socket, 'connect');
  socket.connect();
  await connected;
  return socket;
}

async function request(socket, event, data) {
  const result = await socket.timeout(5_000).emitWithAck(event, data);
  assert.equal(result.ok, true, `${event} ${JSON.stringify(result.error)}`);
  return result.data;
}

async function restoreCanvas(socket, turnId) {
  if (!events.drawSnapshot) return request(socket, events.drawSync, { turnId });
  const [snapshot] = await Promise.all([
    listen(socket, events.drawSnapshot),
    request(socket, events.drawSync, { turnId }),
  ]);
  return snapshot;
}

async function timed(samples, callback) {
  const at = performance.now();
  const result = await callback();
  samples.push(performance.now() - at);
  return result;
}

function id() {
  return randomBytes(16).toString('hex');
}

async function openRoom(size, metrics) {
  const clients = await Promise.all(Array.from({ length: size }, connect));
  const [drawer, ...guessers] = clients;
  const { room } = await timed(metrics.create, () =>
    request(drawer, events.roomCreate, { nickname: 'Drawer' }),
  );
  const { code } = room;
  const memberships = await Promise.all(
    guessers.map((socket, i) =>
      timed(metrics.join, () =>
        request(socket, events.roomJoin, { code, nickname: `Player ${i}` }),
      ),
    ),
  );
  const at = performance.now();
  const [options] = await Promise.all([
    listen(drawer, events.wordOptions),
    ...guessers.map((socket) =>
      listen(socket, events.gameState).then(() =>
        metrics.start.push(performance.now() - at),
      ),
    ),
    request(drawer, events.gameStart, {
      code,
      generation: room.gameGeneration,
    }),
  ]);
  const word = options.options[0];
  await request(drawer, events.wordChoose, {
    code,
    turnId: options.turnId,
    revision: options.revision,
    word,
  });
  const scope = { turnId: options.turnId, canvasVersion: 0 };
  const previewAt = new Map();
  const scoreAt = new Map();
  for (const socket of guessers) {
    socket.on(events.drawPoints, (packet) => {
      assert.equal(packet.turnId, scope.turnId);
      metrics.preview.push(
        performance.now() - previewAt.get(`${packet.id}:${packet.sequence}`),
      );
      metrics.previewDelivered++;
      metrics.previewBytes += JSON.stringify([
        events.drawPoints,
        packet,
      ]).length;
    });
  }
  drawer.on(events.guessPlayerCorrect, (notice) => {
    assert.equal(notice.turnId, scope.turnId);
    metrics.score.push(performance.now() - scoreAt.get(notice.playerId));
  });

  function metadata() {
    return {
      ...scope,
      id: id(),
      tool: 'pen',
      color: '#124C53',
      size: 8,
      point: [100, 100],
    };
  }
  const history = [];
  for (let i = 0; i < 32; i++) {
    const brush = metadata();
    await request(drawer, events.drawStart, brush);
    const points = [
      ...brush.point,
      ...Array.from({ length: 190 }, (_, index) => 100 + (index % 200)),
    ];
    await request(drawer, events.drawEnd, { ...scope, id: brush.id, points });
    history.push({ id: brush.id, points });
  }

  async function draw() {
    // Four one-second strokes at the real sender's cadence and ~250 coordinate pairs/s.
    const runAt = performance.now();
    let sent = 0;
    for (let i = 0; i < 4; i++) {
      const brush = metadata();
      await request(drawer, events.drawStart, brush);
      const points = [...brush.point];
      const strokeAt = performance.now();
      for (let sequence = 0; sequence < 40; sequence++) {
        const target = strokeAt + (sequence + 1) * DRAW_BATCH_MS;
        await sleep(Math.max(0, target - performance.now()));
        const batch = Array.from(
          { length: 12 },
          (_, index) => 101 + sequence + index,
        );
        points.push(...batch);
        const packet = { ...scope, id: brush.id, sequence, points: batch };
        previewAt.set(`${brush.id}:${sequence}`, performance.now());
        drawer.volatile.emit(events.drawPoints, packet);
        sent++;
      }
      const deliveries = guessers.map((socket) =>
        listen(socket, events.drawEnd),
      );
      await request(drawer, events.drawEnd, { ...scope, id: brush.id, points });
      for (const value of await Promise.all(deliveries)) {
        assert.equal(value.stroke.id, brush.id);
        assert.deepEqual(value.stroke.points, points);
      }
      history.push({ id: brush.id, points });
    }
    metrics.previewHz.push(sent / ((performance.now() - runAt) / 1000));
    metrics.previewExpected += sent * guessers.length;
  }

  async function guess(socket, text) {
    return timed(metrics.guess, () =>
      request(socket, events.guessSubmit, {
        code,
        turnId: scope.turnId,
        guess: text,
        requestId: id(),
      }),
    );
  }

  async function load() {
    await Promise.all([
      draw(),
      (async () => {
        for (let i = 0; i < 6; i++) {
          await Promise.all(
            guessers.map((socket) => guess(socket, `Wrong ${i}`)),
          );
          await sleep(530);
        }
      })(),
    ]);
    for (const socket of guessers) {
      const at = performance.now();
      const snapshot = await restoreCanvas(socket, scope.turnId);
      metrics.snapshot.push(performance.now() - at);
      assert.deepEqual(
        snapshot.strokes.map(({ id, points }) => ({ id, points })),
        history,
      );
    }
    const previous = guessers.at(-1);
    previous.disconnect();
    sockets.delete(previous);
    const membership = memberships.at(-1);
    const at = performance.now();
    const refreshed = await connect();
    const restored = await request(refreshed, events.roomRejoin, {
      code,
      reconnectToken: membership.reconnectToken,
    });
    assert.equal(restored.playerId, membership.playerId);
    const [state, snapshot] = await Promise.all([
      request(refreshed, events.gameGetState, { code }),
      restoreCanvas(refreshed, scope.turnId),
    ]);
    metrics.reconnect.push(performance.now() - at);
    assert.equal(state.privateWord, undefined);
    assert.equal(state.guessing.history.length, 6 * guessers.length);
    assert.equal(snapshot.strokes.length, history.length);
    guessers[guessers.length - 1] = refreshed;
    const next = listen(drawer, events.gameState);
    await Promise.all(
      guessers.map(async (socket, i) => {
        scoreAt.set(memberships[i].playerId, performance.now());
        const receipt = await guess(socket, word);
        assert.equal(receipt.correct, true);
      }),
    );
    assert.equal((await next).summary.reason, 'all_correct');
    await Promise.all(
      [drawer, ...guessers].map(async (socket) => {
        await request(socket, events.roomLeave, {});
        socket.disconnect();
        sockets.delete(socket);
      }),
    );
  }
  return load;
}

try {
  for (let attempt = 0; ; attempt++) {
    try {
      if ((await fetch(`${url}/health`)).ok) break;
    } catch {
      /* Startup */
    }
    if (attempt === 60 || server.exitCode !== null)
      throw new Error('Benchmark API did not start');
    await sleep(50);
  }
  for (const [rooms, players] of [
    [1, 2],
    [1, 8],
    [8, 8],
  ]) {
    const metrics = {
      create: [],
      join: [],
      start: [],
      preview: [],
      guess: [],
      score: [],
      snapshot: [],
      reconnect: [],
      previewHz: [],
      previewExpected: 0,
      previewDelivered: 0,
      previewBytes: 0,
    };
    const cpu = [];
    const resource = [];
    for (let i = 0; i < repeats; i++) {
      const sessions = await Promise.all(
        Array.from({ length: rooms }, () => openRoom(players, metrics)),
      );
      const before = await sampleProcess();
      await Promise.all(sessions.map((load) => load()));
      const after = await sampleProcess();
      cpu.push(
        (after.cpu.user +
          after.cpu.system -
          before.cpu.user -
          before.cpu.system) /
          1000,
      );
      resource.push({
        rssMiB: after.memory.rss / 1048576,
        heapMiB: after.memory.heapUsed / 1048576,
        windowMs: after.at - before.at,
      });
    }
    const latency = Object.fromEntries(
      Object.entries(metrics)
        .filter(([, values]) => Array.isArray(values))
        .map(([key, values]) => [key, distribution(values)]),
    );
    console.log(
      JSON.stringify({
        rooms,
        players,
        repeats,
        latency,
        cpuMsPerRun: cpu,
        resource,
        previewDeliveries: [metrics.previewDelivered, metrics.previewExpected],
        previewMeanEventBytes: metrics.previewBytes / metrics.previewDelivered,
        snapshotResponsePackets: events.drawSnapshot ? 2 : 1,
      }),
    );
  }
} finally {
  for (const socket of sockets) socket.disconnect();
  server.kill();
}
