import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import shared from '@draw-and-guess/shared';
import { io } from 'socket.io-client';

const require = createRequire(import.meta.url);
const packageDir = process.env.PLAYWRIGHT_PACKAGE_DIR;
const { chromium } = packageDir
  ? require(require.resolve('playwright-core', { paths: [packageDir] }))
  : require('playwright-core');
const { SOCKET_EVENTS: events } = shared;
const { performance, console, AbortSignal } = globalThis;
const origin = process.env.FRONTEND_URL ?? 'http://localhost:3200';
const api = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3102';
const repeats = Number(process.env.BENCH_REPEATS ?? 3);
const historySize = Number(process.env.BENCH_HISTORY_SIZE ?? 120);
const deviceScaleFactor = Number(process.env.BENCH_DPR ?? 1);
const touchEraser = process.env.BENCH_TOUCH === '1';
const samples = 144;
const chrome = process.env.QA_CHROME_PATH;
const browser = await chromium.launch(
  chrome ? { executablePath: chrome } : { channel: 'chrome' },
);

async function connect() {
  const socket = io(api, {
    transports: ['websocket'],
    reconnection: false,
    autoConnect: false,
    extraHeaders: { Origin: origin },
  });
  const ready = packet(socket, 'connect');
  socket.connect();
  await ready;
  return socket;
}

function packet(socket, event) {
  return once(socket, event, { signal: AbortSignal.timeout(10_000) }).then(
    ([value]) => value,
  );
}

async function request(socket, event, payload) {
  const result = await socket.timeout(5_000).emitWithAck(event, payload);
  assert.equal(result.ok, true, `${event} ${JSON.stringify(result.error)}`);
  return result.data;
}

function metrics(session) {
  return session
    .send('Performance.getMetrics')
    .then(({ metrics }) =>
      Object.fromEntries(metrics.map(({ name, value }) => [name, value])),
    );
}

function distribution(items) {
  const ordered = items.toSorted((a, b) => a - b);
  const at = (p) =>
    Number(ordered[Math.ceil(ordered.length * p) - 1].toFixed(2));
  return { n: ordered.length, median: at(0.5), p95: at(0.95) };
}

async function sample() {
  const drawer = await connect();
  const guesser = await connect();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor,
    hasTouch: touchEraser,
  });
  let room;
  try {
    const membership = await request(drawer, events.roomCreate, {
      nickname: 'Drawer',
    });
    room = membership.room;
    const { code } = room;
    await request(guesser, events.roomJoin, { code, nickname: 'Viewer' });
    const [options] = await Promise.all([
      packet(drawer, events.wordOptions),
      request(drawer, events.gameStart, {
        code,
        generation: room.gameGeneration,
      }),
    ]);
    await request(drawer, events.wordChoose, {
      code,
      turnId: options.turnId,
      revision: options.revision,
      word: options.options[0],
    });
    const scope = { turnId: options.turnId, canvasVersion: 0 };
    for (let i = 0; i < historySize; i++) {
      const id = randomBytes(16).toString('hex');
      const y = 18 + (i % 12) * 13;
      const points = Array.from({ length: 300 }, (_, j) =>
        j % 2 ? y + (j % 7) : 20 + j * 2,
      );
      await request(drawer, events.drawStart, {
        ...scope,
        id,
        tool: 'pen',
        size: 6,
        color: '#124C53',
        point: points.slice(0, 2),
      });
      await request(drawer, events.drawEnd, { ...scope, id, points });
      await sleep(28);
    }

    const page = await context.newPage();
    await page.addInitScript(
      ({ code, reconnectToken }) => {
        globalThis.sessionStorage.setItem(
          'draw-and-guess.room-session',
          JSON.stringify({ code, reconnectToken }),
        );
        const sample = {
          tracking: false,
          frames: [],
          ops: { stroke: 0, drawImage: 0, clearRect: 0 },
        };
        globalThis.canvasBenchmark = sample;
        for (const name of Object.keys(sample.ops)) {
          const context = globalThis.CanvasRenderingContext2D.prototype;
          const call = context[name];
          context[name] = function (...args) {
            if (sample.tracking) sample.ops[name]++;
            return call.apply(this, args);
          };
        }
        let last;
        function frame(at) {
          if (sample.tracking) {
            if (last !== undefined) sample.frames.push(at - last);
            last = at;
          } else last = undefined;
          globalThis.requestAnimationFrame(frame);
        }
        globalThis.requestAnimationFrame(frame);
      },
      { code, reconnectToken: membership.reconnectToken },
    );
    const camera = await context.newCDPSession(page);
    await camera.send('Performance.enable');
    const started = performance.now();
    await page.goto(`${origin}/game/${code}`);
    const surface = page.getByRole('img', {
      name: 'Drawing canvas',
      exact: true,
    });
    await surface.waitFor({ timeout: 10_000 });
    const snapshotMs = performance.now() - started;
    const assets = await page.evaluate(() => {
      const files = new Map(
        globalThis.performance
          .getEntriesByType('resource')
          .filter(({ name }) => name.endsWith('.js'))
          .map((file) => [file.name, file]),
      );
      return {
        count: files.size,
        JSBytes: [...files.values()].reduce(
          (sum, file) => sum + file.decodedBodySize,
          0,
        ),
        encodedJSBytes: [...files.values()].reduce(
          (sum, file) => sum + file.encodedBodySize,
          0,
        ),
      };
    });
    const bounds = await surface.boundingBox();
    assert.ok(bounds);
    const final = packet(guesser, events.drawEnd);
    const before = await metrics(camera);
    await page.evaluate(() => {
      globalThis.canvasBenchmark.tracking = true;
    });
    const inputAt = performance.now();
    await page.mouse.move(
      bounds.x + bounds.width * 0.15,
      bounds.y + bounds.height * 0.6,
    );
    await page.mouse.down();
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      await page.mouse.move(
        bounds.x + bounds.width * (0.15 + t * 0.65),
        bounds.y + bounds.height * (0.6 + 0.058 * Math.sin(t * 19)),
      );
      await sleep(Math.max(0, inputAt + i * 8.33 - performance.now()));
    }
    await page.mouse.up();
    const result = await final;
    assert.equal(result.turnId, scope.turnId);
    assert.ok(result.stroke.points.length >= samples);
    const drawingMs = performance.now() - inputAt;
    const stats = await page.evaluate(() => {
      const { frames, ops } = globalThis.canvasBenchmark;
      globalThis.canvasBenchmark.tracking = false;
      return { frames, ops };
    });
    const after = await metrics(camera);

    // Check live erasing over completed ink, then verify the committed erase after resize.
    const expectInk = (x, y, opaque) =>
      page.waitForFunction(
        ({ x, y, opaque }) => {
          const canvas = globalThis.document.querySelector(
            '[aria-label="Drawing canvas"] canvas',
          );
          if (!canvas) return false;
          const pixel = canvas
            .getContext('2d')
            .getImageData(
              Math.round(canvas.width * x),
              Math.round(canvas.height * y),
              1,
              1,
            ).data;
          return opaque ? pixel[3] > 0 : pixel[3] === 0;
        },
        { x, y, opaque },
        { timeout: 5_000 },
      );
    await expectInk(0.15, 0.6, true);
    await page.getByRole('button', { name: 'Eraser', exact: true }).click();
    await page.getByRole('slider', { name: 'Brush size' }).press('End');
    const eraserPoint = {
      x: bounds.x + bounds.width * 0.15,
      y: bounds.y + bounds.height * 0.6,
    };
    const erased = packet(guesser, events.drawEnd);
    if (touchEraser) {
      await camera.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [eraserPoint],
      });
    } else {
      await page.mouse.move(eraserPoint.x, eraserPoint.y);
      await page.mouse.down();
    }
    await expectInk(0.15, 0.6, false);
    if (touchEraser) {
      await camera.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
    } else await page.mouse.up();
    assert.equal((await erased).stroke.tool, 'eraser');
    const oldWidth = await surface
      .locator('canvas')
      .evaluate((canvas) => canvas.width);
    await page.setViewportSize({ width: 1152, height: 680 });
    await page.waitForFunction((width) => {
      const canvas = globalThis.document.querySelector(
        '[aria-label="Drawing canvas"] canvas',
      );
      return canvas && canvas.width !== width;
    }, oldWidth);
    await expectInk(0.15, 0.6, false);
    const [endX, endY] = result.stroke.points.slice(-2);
    await expectInk(
      endX / shared.DRAWING_WIDTH,
      endY / shared.DRAWING_HEIGHT,
      true,
    );
    return {
      snapshotMs,
      drawingMs,
      sentPairs: result.stroke.points.length / 2,
      ops: stats.ops,
      frames: stats.frames,
      rendererTaskMs: (after.TaskDuration - before.TaskDuration) * 1_000,
      jsHeapMiB: after.JSHeapUsedSize / 1_048_576,
      ...assets,
    };
  } finally {
    await context.close();
    if (room && guesser.connected) await request(guesser, events.roomLeave, {});
    drawer.disconnect();
    guesser.disconnect();
  }
}

try {
  const results = [];
  for (let i = 0; i < repeats; i++) results.push(await sample());
  console.log(
    JSON.stringify({
      historySize,
      coordinatePairsPerStroke: 150,
      inputSamples: samples,
      repeats,
      deviceScaleFactor,
      eraserInput: touchEraser ? 'touch' : 'mouse',
      framesMs: distribution(results.flatMap(({ frames }) => frames)),
      runs: results.map(({ frames, ...summary }) => ({
        ...summary,
        frameCount: frames.length,
      })),
    }),
  );
} finally {
  await browser.close();
}
