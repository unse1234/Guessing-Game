import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import shared from '@draw-and-guess/shared';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const feature = pathToFileURL(resolve('src/features/game/lib')).href;
const loader = (code) => 'data:text/javascript,' + encodeURIComponent(code);

registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.startsWith(feature)) {
      if (specifier === '@draw-and-guess/shared') {
        return {
          url: loader(`export const SOCKET_EVENTS = ${JSON.stringify(shared.SOCKET_EVENTS)};
          export const DRAW_BATCH_MS = ${shared.DRAW_BATCH_MS}, MAX_DRAW_BATCH_POINTS = ${shared.MAX_DRAW_BATCH_POINTS};`),
          shortCircuit: true,
        };
      }
      if (specifier === '@/stores/game-store') {
        return {
          url: loader(
            'export const useGameStore = { getState: () => ({ clockOffsetMs: 0 }) };',
          ),
          shortCircuit: true,
        };
      }
      if (specifier === '@/features/game/lib/point-batcher') {
        return { url: feature + '/point-batcher.ts', shortCircuit: true };
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith(feature) && url.endsWith('.ts')) {
      const path = fileURLToPath(url);
      const { outputText: source } = ts.transpileModule(
        readFileSync(path, 'utf8'),
        {
          fileName: path,
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
          },
        },
      );
      return { format: 'module', source, shortCircuit: true };
    }
    return next(url, context);
  },
});

const { createPointBatcher } = await import(feature + '/point-batcher.ts');
const { DrawingSession } = await import(feature + '/drawing-session.ts');
const { SOCKET_EVENTS: events } = shared;
const { console } = globalThis;

function clock() {
  let time = 0;
  let id = 0;
  const tasks = new Map();
  return {
    schedule(fn, delay) {
      tasks.set(++id, { fn, at: time + delay });
      return id;
    },
    cancel: (key) => tasks.delete(key),
    tick(elapsed) {
      const end = time + elapsed;
      while (tasks.size) {
        const [key, task] = tasks.entries().next().value;
        if (task.at > end) break;
        time = task.at;
        tasks.delete(key);
        task.fn();
      }
      time = end;
    },
  };
}

test('coalesces 240 pointer samples into bounded 24 ms network batches', () => {
  const timer = clock();
  const points = [0, 0];
  const sent = [];
  const batcher = createPointBatcher(
    points,
    (sequence, batch) => {
      sent.push({ sequence, batch });
      return true;
    },
    timer.schedule,
    timer.cancel,
  );
  for (let i = 1; i <= 240; i++) {
    points.push(i, i);
    batcher.queue();
    timer.tick(4);
  }
  batcher.finish();
  timer.tick(120);
  assert.ok(sent.length <= 41);
  assert.deepEqual(
    sent.flatMap(({ batch }) => batch),
    points.slice(2),
  );
  assert.deepEqual(
    sent.map(({ sequence }) => sequence),
    sent.map((_, i) => i),
  );
  console.log(
    `[batcher fake clock] 240 inputs → ${sent.length} preview packets over 960 ms`,
  );
});

test('holds one bounded stroke buffer under backpressure and resumes its original sequence', () => {
  const timer = clock();
  const points = [0, 0, 1, 1];
  let writable = false;
  const placed = [];
  const batcher = createPointBatcher(
    points,
    (sequence, batch) => {
      if (!writable) return false;
      placed.push({ sequence, batch });
      return true;
    },
    timer.schedule,
    timer.cancel,
  );
  batcher.queue();
  timer.tick(48);
  assert.equal(placed.length, 0);
  writable = true;
  points.push(2, 2);
  timer.tick(24);
  assert.deepEqual(placed, [{ sequence: 0, batch: [1, 1, 2, 2] }]);
  points.push(3, 3);
  batcher.finish();
  assert.deepEqual(placed.at(-1), { sequence: 1, batch: [3, 3] });
});

class TestSocket extends EventEmitter {
  connected = true;
  io = { engine: { transport: { writable: true } } };
  sent = [];
  volatile = { emit: (event, body) => this.sent.push({ event, body }) };

  timeout() {
    return {
      emitWithAck: (event, body) =>
        new Promise((ack) => this.sent.push({ event, body, ack })),
    };
  }
}

const turnId = 'local-turn';
const receipt = (revision, canvasVersion = 0) => ({
  turnId,
  revision,
  canvasVersion,
});
const pen = {
  id: 'one',
  tool: 'pen',
  color: '#124C53',
  size: 8,
  points: [10, 20],
};
const eraser = {
  id: 'two',
  tool: 'eraser',
  color: '#FFFFFF',
  size: 22,
  points: [10, 20],
};

function fixture(t) {
  const socket = new TestSocket();
  const views = [];
  const session = new DrawingSession(socket, turnId, (view) =>
    views.push(view),
  );
  t.after(() => session.dispose());
  const view = () => views.at(-1);
  return { session, socket, view };
}

test('reconciles snapshot and live events by revision, then repairs skipped previews with canonical end', (t) => {
  const { session, socket, view } = fixture(t);
  try {
    session.sync();
    socket.emit(events.drawEnd, { ...receipt(3), stroke: pen });
    socket.emit(events.drawSnapshot, {
      ...receipt(3),
      strokes: [pen],
      active: null,
    });
    socket.sent[0].ack({ ok: true, data: null });
    socket.emit(events.drawEnd, { ...receipt(2), stroke: pen });
    assert.equal(view().scene.strokes.length, 1);
    socket.emit(events.drawStart, { ...receipt(4), stroke: eraser });
    socket.emit(events.drawPoints, {
      ...receipt(6),
      id: eraser.id,
      sequence: 1,
      points: [30, 35],
    });
    assert.deepEqual(view().scene.active.stroke.points, [10, 20]);
    const final = { ...eraser, points: [10, 20, 25, 30, 30, 35] };
    socket.emit(events.drawEnd, { ...receipt(7), stroke: final });
    assert.deepEqual(view().scene.strokes, [pen, final]);
    socket.emit(events.drawClear, receipt(8, 1));
    socket.emit(events.drawEnd, { ...receipt(9), stroke: final });
    socket.emit(events.drawEnd, {
      ...receipt(10, 1),
      turnId: 'old',
      stroke: final,
    });
    assert.deepEqual(view().scene.strokes, []);
  } finally {
    session.dispose();
    assert.equal(socket.listenerCount(events.drawEnd), 0);
  }
});

test('drawer publishes the completed stroke before its ACK and bounds reliable in-flight requests', (t) => {
  const { session, socket, view } = fixture(t);
  session.sync();
  socket.emit(events.drawSnapshot, {
    ...receipt(0),
    strokes: [],
    active: null,
  });
  socket.sent[0].ack({ ok: true, data: null });
  for (let i = 0; i < 4; i++) {
    const stroke = { ...pen, id: String(i), points: [10, 20] };
    assert.equal(session.start(stroke), true);
    stroke.points.push(15, 25);
    session.point();
    session.finish(stroke);
  }
  assert.equal(view().scene.strokes.length, 4);
  assert.equal(session.start(eraser), false);
  const ends = socket.sent.filter(({ event }) => event === events.drawEnd);
  assert.equal(ends.length, 4);
  assert.deepEqual(ends[0].body.points, [10, 20, 15, 25]);
});
