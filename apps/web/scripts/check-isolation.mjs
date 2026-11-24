import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import process from 'node:process';
import test from 'node:test';
import shared from '@draw-and-guess/shared';
import { io } from 'socket.io-client';

const { SOCKET_EVENTS: events } = shared;
const { AbortSignal } = globalThis;
const url = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3001';
const origin = process.env.FRONTEND_URL ?? 'http://localhost:3000';

async function wait(socket, event) {
  const [data] = await once(socket, event, {
    signal: AbortSignal.timeout(5_000),
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
  const connected = wait(socket, 'connect');
  socket.connect();
  await connected;
  return socket;
}

function request(socket, event, data) {
  return socket.timeout(5_000).emitWithAck(event, data);
}

function success(result) {
  assert.equal(result.ok, true, JSON.stringify(result.error));
  return result.data;
}

async function startRoom(t, nickname) {
  const [host, first, second] = await Promise.all(
    Array.from({ length: 3 }, () => connect(t)),
  );
  const { room } = success(
    await request(host, events.roomCreate, { nickname }),
  );
  const { code } = room;
  const firstSession = success(
    await request(first, events.roomJoin, { code, nickname: 'Ali' }),
  );
  const secondSession = success(
    await request(second, events.roomJoin, { code, nickname: 'Usman' }),
  );
  const off = [];
  for (const socket of [first, second]) {
    socket.on(events.wordOptions, (payload) => off.push(payload));
    socket.on(events.wordConfirmed, (payload) => off.push(payload));
  }
  const [options, firstSelection, secondSelection, started] = await Promise.all(
    [
      wait(host, events.wordOptions),
      wait(first, events.gameState),
      wait(second, events.gameState),
      request(host, events.gameStart, {
        code,
        generation: room.gameGeneration,
      }).then(success),
    ],
  );
  assert.deepEqual(firstSelection, started);
  assert.deepEqual(secondSelection, started);
  const word = options.options[0];
  const [firstDrawing, secondDrawing, drawing] = await Promise.all([
    wait(first, events.gameState),
    wait(second, events.gameState),
    request(host, events.wordChoose, {
      code,
      turnId: started.turnId,
      revision: started.revision,
      word,
    }).then(success),
  ]);
  assert.deepEqual(firstDrawing, drawing);
  assert.deepEqual(secondDrawing, drawing);
  return {
    host,
    first,
    second,
    code,
    word,
    drawing,
    firstSession,
    secondSession,
    off,
  };
}

test('two active rooms isolate events while handling reconnects, simultaneous guesses, and drawer departure', async (t) => {
  const [a, b] = await Promise.all([
    startRoom(t, 'Hammad'),
    startRoom(t, 'Other host'),
  ]);
  const receivedA = [];
  const receivedB = [];
  for (const [socket, packets] of [
    [a.first, receivedA],
    [b.first, receivedB],
  ]) {
    socket.onAny((event, data) => packets.push({ event, data }));
  }
  const stroke = (room, point) => ({
    turnId: room.drawing.turnId,
    canvasVersion: 0,
    id: randomBytes(16).toString('hex'),
    point,
    tool: 'pen',
    color: '#124C53',
    size: 8,
  });
  const [strokeA, strokeB] = [stroke(a, [10, 10]), stroke(b, [90, 90])];
  const [paintA, paintB] = await Promise.all([
    wait(a.first, events.drawStart),
    wait(b.first, events.drawStart),
    request(a.host, events.drawStart, strokeA).then(success),
    request(b.host, events.drawStart, strokeB).then(success),
  ]);
  assert.equal(paintA.stroke.id, strokeA.id);
  assert.equal(paintB.stroke.id, strokeB.id);
  assert.equal(
    (await request(a.first, events.gameGetState, { code: b.code })).error.code,
    'NOT_IN_ROOM',
  );

  const offline = wait(b.first, events.roomUpdated);
  b.second.disconnect();
  assert.equal(
    (await offline).room.players.find(
      ({ id }) => id === b.secondSession.playerId,
    ).isOnline,
    false,
  );
  assert.equal(
    success(await request(b.first, events.gameGetState, { code: b.code })).game
      .phase,
    'drawing',
  );
  const resumed = await connect(t);
  const rejoin = success(
    await request(resumed, events.roomRejoin, {
      code: b.code,
      reconnectToken: b.secondSession.reconnectToken,
    }),
  );
  assert.equal(rejoin.playerId, b.secondSession.playerId);
  const view = success(
    await request(resumed, events.gameGetState, { code: b.code }),
  );
  assert.equal(view.game.phaseEndsAt, b.drawing.phaseEndsAt);
  assert.equal(view.privateWord, undefined);

  const guess = () => ({
    code: b.code,
    turnId: b.drawing.turnId,
    guess: b.word,
    requestId: randomBytes(16).toString('hex'),
  });
  const firstGuess = guess();
  const [summaryB, first, repeated, second] = await Promise.all([
    wait(b.host, events.gameState),
    request(b.first, events.guessSubmit, firstGuess).then(success),
    request(b.first, events.guessSubmit, firstGuess).then(success),
    request(resumed, events.guessSubmit, guess()).then(success),
  ]);
  assert.equal(summaryB.summary.reason, 'all_correct');
  assert.deepEqual(first, repeated);
  assert.equal(
    summaryB.summary.awards.find(({ nickname }) => nickname === 'Other host')
      .points,
    100,
  );
  assert.equal(
    summaryB.summary.awards.find(({ nickname }) => nickname === 'Usman').points,
    second.pointsAwarded,
  );
  const stillA = success(
    await request(a.first, events.gameGetState, { code: a.code }),
  );
  assert.equal(stillA.game.phase, 'drawing');
  assert.ok(stillA.guessing.scores.every(({ points }) => points === 0));

  const afterDeparture = [];
  a.host.onAny((event) => afterDeparture.push(event));
  const [summaryA, ended, transferred] = await Promise.all([
    wait(a.first, events.gameState),
    wait(a.first, events.drawEnd),
    wait(a.first, events.roomUpdated),
    request(a.host, events.roomLeave, {}).then(success),
  ]);
  assert.equal(summaryA.summary.reason, 'drawer_left');
  assert.equal(ended.stroke.id, strokeA.id);
  assert.equal(transferred.room.hostId, a.firstSession.playerId);
  assert.deepEqual(
    afterDeparture,
    [],
    'departing drawer received events emitted during removal',
  );
  for (const [room, packets] of [
    [a, receivedA],
    [b, receivedB],
  ]) {
    assert.deepEqual(room.off, []);
    assert.equal(
      packets.filter(({ event }) => event === events.gameState).length,
      1,
    );
    for (const { data } of packets) {
      if (data.turnId) assert.equal(data.turnId, room.drawing.turnId);
      if (data.room) assert.equal(data.room.code, room.code);
    }
  }
});
