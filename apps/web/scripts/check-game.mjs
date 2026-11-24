import assert from 'node:assert/strict';
import { once } from 'node:events';
import process from 'node:process';
import test from 'node:test';
import shared from '@draw-and-guess/shared';
import { io } from 'socket.io-client';

const { SOCKET_EVENTS: events } = shared;
const { AbortSignal, performance, console } = globalThis;
const url = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3001';
const origin = process.env.FRONTEND_URL ?? 'http://localhost:3000';

const wait = async (socket, event) => {
  const [payload] = await once(socket, event, {
    signal: AbortSignal.timeout(4_000),
  });
  return payload;
};
function request(socket, event, payload) {
  return socket.timeout(4_000).emitWithAck(event, payload);
}
function success(result) {
  assert.equal(result.ok, true, JSON.stringify(result.error));
  return result.data;
}

async function client(t, transport = 'websocket') {
  const socket = io(url, {
    autoConnect: false,
    forceNew: true,
    reconnection: false,
    transports: [transport],
    extraHeaders: { Origin: origin },
  });
  t.after(() => socket.disconnect());
  const connected = wait(socket, 'connect');
  socket.connect();
  await connected;
  return socket;
}

test('authenticated start, private words, refresh, explicit choice and duplicate rejection', async (t) => {
  let host = await client(t);
  let guest = await client(t, 'polling');
  const outsider = await client(t);
  const hostSession = success(
    await request(host, events.roomCreate, { nickname: 'Hammad' }),
  );
  const code = hostSession.room.code;
  let unrelatedEvents = 0;
  outsider.on(events.gameState, () => unrelatedEvents++);
  success(
    await request(outsider, events.roomCreate, { nickname: 'Unrelated' }),
  );
  assert.equal(
    (await request(outsider, events.gameStart, { code })).error.code,
    'NOT_IN_ROOM',
  );
  assert.equal(
    (await request(outsider, events.gameGetState, { code })).error.code,
    'NOT_IN_ROOM',
  );
  assert.equal(
    (await request(host, events.gameStart, { code })).error.code,
    'NOT_ENOUGH_PLAYERS',
  );
  const guestSession = success(
    await request(guest, events.roomJoin, { code, nickname: 'Ali' }),
  );
  assert.equal(
    (await request(guest, events.gameStart, { code })).error.code,
    'NOT_HOST',
  );
  assert.equal(
    (
      await request(host, events.gameStart, {
        code,
        playerId: hostSession.playerId,
      })
    ).error.code,
    'INVALID_REQUEST',
  );
  assert.equal(
    success(await request(guest, events.gameGetState, { code })).game.phase,
    'waiting',
  );

  const secrets = [];
  const watchSecrets = (socket) => {
    socket.on(events.wordOptions, (payload) => secrets.push(payload));
    socket.on(events.wordConfirmed, (payload) => secrets.push(payload));
  };
  watchSecrets(guest);
  const begin = performance.now();
  const [hostPublic, guestPublic, options, startResponse] = await Promise.all([
    wait(host, events.gameState),
    wait(guest, events.gameState).then((game) => ({
      game,
      ms: performance.now() - begin,
    })),
    wait(host, events.wordOptions),
    request(host, events.gameStart, { code }).then((response) => ({
      response,
      ms: performance.now() - begin,
    })),
  ]);
  assert.deepEqual(hostPublic, guestPublic.game);
  assert.deepEqual(success(startResponse.response), hostPublic);
  assert.equal(hostPublic.phase, 'word_selection');
  assert.equal(hostPublic.currentDrawerId, hostSession.playerId);
  assert.equal(new Set(options.options).size, 3);
  assert.ok(hostPublic.phaseEndsAt - hostPublic.serverTime >= 14_990);
  assert.ok(hostPublic.phaseEndsAt - hostPublic.serverTime <= 15_000);
  assert.equal(
    (await request(host, events.gameStart, { code })).error.code,
    'GAME_STARTED',
  );
  assert.equal(secrets.length, 0);

  host.disconnect();
  host = await client(t);
  const hostRestored = success(
    await request(host, events.roomRejoin, {
      code,
      reconnectToken: hostSession.reconnectToken,
    }),
  );
  assert.equal(hostRestored.playerId, hostSession.playerId);
  const selectionView = success(
    await request(host, events.gameGetState, { code }),
  );
  assert.deepEqual(selectionView.privateWord, options);
  assert.equal(selectionView.game.phaseEndsAt, hostPublic.phaseEndsAt);

  guest.disconnect();
  guest = await client(t);
  watchSecrets(guest);
  const guestRestored = success(
    await request(guest, events.roomRejoin, {
      code,
      reconnectToken: guestSession.reconnectToken,
    }),
  );
  assert.equal(guestRestored.playerId, guestSession.playerId);
  assert.ok(
    !(
      'privateWord' in
      success(await request(guest, events.gameGetState, { code }))
    ),
  );

  const selected = {
    code,
    revision: options.revision,
    word: options.options[1],
  };
  assert.equal(
    (await request(guest, events.wordChoose, selected)).error.code,
    'NOT_DRAWER',
  );
  assert.equal(
    (
      await request(host, events.wordChoose, {
        ...selected,
        word: 'Not in the list',
      })
    ).error.code,
    'INVALID_WORD',
  );
  const chooseAt = performance.now();
  const [drawing, confirmation, chosen] = await Promise.all([
    wait(guest, events.gameState).then((game) => ({
      game,
      ms: performance.now() - chooseAt,
    })),
    wait(host, events.wordConfirmed),
    request(host, events.wordChoose, selected).then((response) => ({
      response,
      ms: performance.now() - chooseAt,
    })),
  ]);
  assert.deepEqual(success(chosen.response), drawing.game);
  assert.equal(drawing.game.phase, 'drawing');
  assert.equal(confirmation.word, selected.word);
  assert.equal(drawing.game.maskedWord, '_'.repeat(selected.word.length));
  assert.ok(!JSON.stringify(drawing.game).includes(selected.word));
  assert.ok(drawing.game.phaseEndsAt - drawing.game.serverTime >= 59_995);
  assert.equal(
    (await request(host, events.wordChoose, selected)).error.code,
    'WRONG_PHASE',
  );

  host.disconnect();
  host = await client(t);
  success(
    await request(host, events.roomRejoin, {
      code,
      reconnectToken: hostSession.reconnectToken,
    }),
  );
  const drawingView = success(
    await request(host, events.gameGetState, { code }),
  );
  assert.deepEqual(drawingView.privateWord, confirmation);
  assert.equal(drawingView.game.phaseEndsAt, drawing.game.phaseEndsAt);
  const guesserView = success(
    await request(guest, events.gameGetState, { code }),
  );
  assert.ok(!('privateWord' in guesserView));
  assert.equal(secrets.length, 0);
  assert.equal(unrelatedEvents, 0);
  success(await request(host, events.roomLeave, {}));
  success(await request(guest, events.roomLeave, {}));
  console.log(
    `[localhost] start ACK ${startResponse.ms.toFixed(2)} ms, selection to peer ${guestPublic.ms.toFixed(2)} ms, choose ACK ${chosen.ms.toFixed(2)} ms, drawing to peer ${drawing.ms.toFixed(2)} ms`,
  );
});
