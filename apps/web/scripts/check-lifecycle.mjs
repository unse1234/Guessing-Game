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

async function wait(socket, event, timeout = 8_000) {
  const [data] = await once(socket, event, {
    signal: AbortSignal.timeout(timeout),
  });
  return data;
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

function request(socket, event, payload) {
  return socket.timeout(4_000).emitWithAck(event, payload);
}

function success(result) {
  assert.equal(result.ok, true, JSON.stringify(result.error));
  return result.data;
}

test('two complete rotations, restored results, and host replay on the same connections', async (t) => {
  const host = await connect(t);
  let guest = await connect(t);
  const owner = success(
    await request(host, events.roomCreate, { nickname: 'Hammad' }),
  );
  const { code, gameGeneration } = owner.room;
  const member = success(
    await request(guest, events.roomJoin, { code, nickname: 'Ali' }),
  );
  let choices = wait(host, events.wordOptions);
  const [peerSelection, started] = await Promise.all([
    wait(guest, events.gameState),
    request(host, events.gameStart, { code, generation: gameGeneration }).then(
      success,
    ),
  ]);
  let selection = started;
  assert.deepEqual(peerSelection, selection);
  const gameId = selection.gameId;
  const turnEndLatency = [];
  const nextSkew = [];
  const scores = new Map();
  let previousGuess;

  for (let index = 0; index < 4; index++) {
    const [drawer, guesser] = index % 2 ? [guest, host] : [host, guest];
    const wordOptions = await choices;
    assert.equal(wordOptions.turnId, selection.turnId);
    assert.equal(
      selection.currentDrawerId,
      index % 2 ? member.playerId : owner.playerId,
    );
    assert.equal(selection.currentRound, 1 + Math.floor(index / 2));
    assert.equal(selection.currentTurn, index + 1);
    const word = wordOptions.options[0];
    const [peerDrawing, drawing] = await Promise.all([
      wait(guesser, events.gameState),
      request(drawer, events.wordChoose, {
        code,
        turnId: selection.turnId,
        revision: selection.revision,
        word,
      }).then(success),
    ]);
    assert.deepEqual(peerDrawing, drawing);
    assert.equal(drawing.phase, 'drawing');
    assert.equal(drawing.summary, undefined);
    if (previousGuess) {
      assert.equal(
        (await request(guesser, events.guessSubmit, previousGuess)).error.code,
        'GUESS_CLOSED',
      );
    }
    const currentGuess = {
      code,
      turnId: selection.turnId,
      guess: word,
      requestId: randomBytes(16).toString('hex'),
    };
    const begin = performance.now();
    const [turnEnd, peerEnd, guess] = await Promise.all([
      wait(drawer, events.gameState).then((state) => {
        turnEndLatency.push(performance.now() - begin);
        return state;
      }),
      wait(guesser, events.gameState),
      request(guesser, events.guessSubmit, currentGuess).then(success),
    ]);
    previousGuess = currentGuess;
    assert.equal(guess.correct, true);
    assert.deepEqual(turnEnd, peerEnd);
    if (selection.currentTurn === selection.totalTurns) {
      const drawerId = selection.currentDrawerId;
      const guesserId = index % 2 ? owner.playerId : member.playerId;
      scores.set(drawerId, scores.get(drawerId) + 50);
      scores.set(guesserId, scores.get(guesserId) + guess.pointsAwarded);
      assert.equal(turnEnd.phase, 'finished');
      assert.equal(turnEnd.phaseEndsAt, null);
      assert.equal(turnEnd.summary, undefined);
      selection = turnEnd;
      break;
    }
    assert.equal(turnEnd.phase, 'turn_summary');
    assert.equal(turnEnd.summary.word, word);
    for (const { playerId, score, points } of turnEnd.summary.awards) {
      assert.equal(score, (scores.get(playerId) ?? 0) + points);
      scores.set(playerId, score);
    }

    choices = wait(guesser, events.wordOptions);
    const states = await Promise.all(
      [host, guest].map(async (socket) => {
        const state = await wait(socket, events.gameState);
        return { state, received: performance.now() };
      }),
    );
    assert.deepEqual(states[0].state, states[1].state);
    nextSkew.push(Math.abs(states[0].received - states[1].received));
    selection = states[0].state;
    assert.ok(selection.serverTime >= turnEnd.phaseEndsAt);
  }
  assert.equal(selection.phase, 'finished');
  assert.equal(selection.results.gameId, gameId);
  assert.deepEqual(
    new Map(
      selection.results.players.map(({ playerId, score }) => [playerId, score]),
    ),
    scores,
  );
  const high = Math.max(...scores.values());
  assert.deepEqual(
    new Set(selection.results.winnerIds),
    new Set(
      [...scores].filter(([, points]) => points === high).map(([id]) => id),
    ),
  );
  assert.equal(
    (await request(guest, events.gameRestart, { code, gameId })).error.code,
    'RESTART_HOST_ONLY',
  );
  assert.equal(
    (await request(guest, events.guessSubmit, previousGuess)).error.code,
    'GUESS_CLOSED',
  );

  guest.disconnect();
  guest = await connect(t);
  const restored = success(
    await request(guest, events.roomRejoin, {
      code,
      reconnectToken: member.reconnectToken,
    }),
  );
  assert.equal(restored.playerId, member.playerId);
  assert.equal(restored.room.status, 'finished');
  assert.deepEqual(
    success(await request(guest, events.gameGetState, { code })).game.results,
    selection.results,
  );
  const peerRoom = wait(guest, events.roomUpdated);
  const peerWaiting = wait(guest, events.gameState);
  const oldConnections = [host.id, guest.id];
  const restartAt = performance.now();
  const waiting = success(
    await request(host, events.gameRestart, { code, gameId }),
  );
  const restartMs = performance.now() - restartAt;
  assert.equal(waiting.phase, 'waiting');
  assert.deepEqual(await peerWaiting, waiting);
  const { room } = await peerRoom;
  assert.equal(room.code, code);
  assert.equal(room.hostId, owner.playerId);
  assert.deepEqual(
    room.players.map(({ id }) => id),
    [owner.playerId, member.playerId],
  );
  assert.deepEqual([host.id, guest.id], oldConnections);
  assert.equal(
    (await request(host, events.gameRestart, { code, gameId })).error.code,
    'GAME_NOT_FINISHED',
  );
  const next = success(
    await request(host, events.gameStart, {
      code,
      generation: room.gameGeneration,
    }),
  );
  assert.notEqual(next.gameId, gameId);
  assert.deepEqual(
    success(
      await request(guest, events.gameGetState, { code }),
    ).guessing.scores.map(({ points }) => points),
    [0, 0],
  );
  assert.equal(
    (await request(guest, events.guessSubmit, previousGuess)).error.code,
    'GUESS_CLOSED',
  );
  console.log(
    `[lifecycle localhost] last guess to turn end at peer ${turnEndLatency.map((ms) => ms.toFixed(2)).join(', ')} ms; next phase peer arrival skew ${nextSkew.map((ms) => ms.toFixed(2)).join(', ')} ms; restart ACK ${restartMs.toFixed(2)} ms`,
  );
});
