import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import process from 'node:process';
import test from 'node:test';
import shared from '@draw-and-guess/shared';
import { io } from 'socket.io-client';

const { SOCKET_EVENTS: events } = shared;
const { AbortSignal, console, performance } = globalThis;
const url = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3001';
const origin = process.env.FRONTEND_URL ?? 'http://localhost:3000';

async function wait(socket, event) {
  const [payload] = await once(socket, event, {
    signal: AbortSignal.timeout(4_000),
  });
  return payload;
}

async function client(t) {
  const socket = io(url, {
    autoConnect: false,
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
    extraHeaders: { Origin: origin },
  });
  t.after(() => socket.disconnect());
  const connected = wait(socket, 'connect');
  socket.connect();
  await connected;
  return socket;
}

function request(socket, event, payload) {
  return socket.timeout(4_000).emitWithAck(event, payload);
}

function success(result) {
  assert.equal(result.ok, true, JSON.stringify(result.error));
  return result.data;
}

test('live guesses, private scoring receipts, ordered recovery, and automatic early end', async (t) => {
  const [host, first, last, outsider] = await Promise.all(
    Array.from({ length: 4 }, () => client(t)),
  );
  const hostSession = success(
    await request(host, events.roomCreate, { nickname: 'Host' }),
  );
  const { code } = hostSession.room;
  const firstSession = success(
    await request(first, events.roomJoin, { code, nickname: 'Ali' }),
  );
  const lastSession = success(
    await request(last, events.roomJoin, { code, nickname: 'Zain' }),
  );
  success(
    await request(outsider, events.roomCreate, { nickname: 'Other room' }),
  );
  const outside = [];
  outsider.onAny((event) => outside.push(event));
  const observed = [];
  last.onAny((event, payload) => {
    if (
      [
        events.gameState,
        events.guessMessage,
        events.guessPlayerCorrect,
        events.wordOptions,
        events.wordConfirmed,
      ].includes(event)
    )
      observed.push({ event, payload });
  });

  const [options, started] = await Promise.all([
    wait(host, events.wordOptions),
    request(host, events.gameStart, {
      code,
      generation: hostSession.room.gameGeneration,
    }),
  ]);
  const { turnId } = success(started);
  const payload = (guess) => ({
    code,
    turnId,
    requestId: randomBytes(16).toString('hex'),
    guess,
  });
  const word = options.options[0];
  assert.equal(
    (await request(first, events.guessSubmit, payload(word))).error.code,
    'GUESS_CLOSED',
  );
  const [drawing] = await Promise.all([
    wait(last, events.gameState),
    request(host, events.wordChoose, {
      code,
      turnId,
      revision: options.revision,
      word,
    }).then(success),
  ]);
  assert.equal(drawing.phase, 'drawing');
  assert.equal(
    (await request(host, events.guessSubmit, payload(word))).error.code,
    'DRAWER_CANNOT_GUESS',
  );
  assert.equal(
    (await request(outsider, events.guessSubmit, payload(word))).error.code,
    'NOT_IN_ROOM',
  );
  assert.equal(
    (
      await request(first, events.guessSubmit, {
        ...payload(word),
        points: 400,
      })
    ).error.code,
    'INVALID_GUESS',
  );

  const wrong = payload('  Something else  ');
  const wrongStart = performance.now();
  const [incorrect, wrongAck] = await Promise.all([
    wait(last, events.guessMessage).then((msg) => ({
      msg,
      ms: performance.now() - wrongStart,
    })),
    request(first, events.guessSubmit, wrong).then((result) => ({
      result,
      ms: performance.now() - wrongStart,
    })),
  ]);
  assert.equal(incorrect.msg.playerId, firstSession.playerId);
  assert.equal(incorrect.msg.message, 'Something else');
  assert.deepEqual(success(wrongAck.result), {
    correct: false,
    pointsAwarded: 0,
  });
  assert.deepEqual(
    success(await request(first, events.guessSubmit, wrong)),
    success(wrongAck.result),
  );

  const correct = payload(` ${word.toUpperCase()} `);
  const correctStart = performance.now();
  const [notice, correctAck, duplicate] = await Promise.all([
    wait(last, events.guessPlayerCorrect).then((msg) => ({
      msg,
      ms: performance.now() - correctStart,
    })),
    request(first, events.guessSubmit, correct).then((result) => ({
      result,
      ms: performance.now() - correctStart,
    })),
    request(first, events.guessSubmit, correct),
  ]);
  const receipt = success(correctAck.result);
  assert.equal(receipt.correct, true);
  assert.ok(receipt.pointsAwarded >= 395 && receipt.pointsAwarded <= 400);
  assert.deepEqual(success(duplicate), receipt);
  assert.equal(notice.msg.playerName, 'Ali');
  assert.equal(notice.msg.sequence, incorrect.msg.sequence + 1);
  assert.deepEqual(notice.msg.scores, [
    { playerId: firstSession.playerId, points: receipt.pointsAwarded },
    { playerId: hostSession.playerId, points: 50 },
  ]);
  for (const { payload } of observed) {
    assert.equal(payload?.options, undefined);
    assert.equal(payload?.word, undefined);
    assert.equal(payload?.selectedWord, undefined);
  }
  assert.deepEqual(
    observed.map(({ event }) => event),
    [
      events.gameState,
      events.gameState,
      events.guessMessage,
      events.guessPlayerCorrect,
    ],
  );

  first.disconnect();
  const refreshed = await client(t);
  success(
    await request(refreshed, events.roomRejoin, {
      code,
      reconnectToken: firstSession.reconnectToken,
    }),
  );
  const restored = success(
    await request(refreshed, events.gameGetState, { code }),
  );
  const other = success(await request(last, events.gameGetState, { code }));
  assert.equal(restored.game.phaseEndsAt, drawing.phaseEndsAt);
  assert.deepEqual(restored.guessing.history, [incorrect.msg]);
  assert.deepEqual(restored.guessing.correct, [notice.msg]);
  assert.equal(restored.guessing.myPoints, receipt.pointsAwarded);
  assert.equal(other.guessing.myPoints, null);
  assert.equal(other.privateWord, undefined);
  assert.equal(other.game.summary, undefined);
  assert.equal(other.game.maskedWord, word.replace(/\p{L}/gu, '_'));
  assert.equal(
    (await request(refreshed, events.guessSubmit, payload(word))).error.code,
    'ALREADY_GUESSED',
  );

  const [ended, finalScore] = await Promise.all([
    wait(host, events.gameState),
    wait(host, events.guessPlayerCorrect),
    request(last, events.guessSubmit, payload(word)).then(success),
  ]);
  assert.equal(ended.phase, 'turn_summary');
  assert.equal(ended.summary.word, word);
  assert.equal(finalScore.playerId, lastSession.playerId);
  assert.equal(finalScore.scores[1].points, 100);
  assert.equal(
    (
      await request(host, events.drawStart, {
        turnId,
        canvasVersion: 0,
        id: randomBytes(16).toString('hex'),
        tool: 'pen',
        color: '#123456',
        size: 4,
        point: [0, 0],
      })
    ).error.code,
    'WRONG_PHASE',
  );
  assert.deepEqual(outside, []);
  console.log(
    `[guessing localhost] incorrect ACK ${wrongAck.ms.toFixed(2)} ms, peer message ${incorrect.ms.toFixed(2)} ms, correct ACK ${correctAck.ms.toFixed(2)} ms, peer score update ${notice.ms.toFixed(2)} ms`,
  );
});
