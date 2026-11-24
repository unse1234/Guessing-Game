import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import shared from '@draw-and-guess/shared';
import gameModule from '../dist/game/game.service.js';
import roomsModule from '../dist/rooms/rooms.service.js';

const { GUESS_HISTORY_LIMIT, guessSubmitSchema } = shared;
const { GameService } = gameModule;
const { RoomsService } = roomsModule;
const { performance } = globalThis;

function success(result) {
  assert.equal(result.ok, true, JSON.stringify(result.error));
  return result.data;
}

function fixture(t, count = 2) {
  let elapsed = 0;
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 50_000 });
  t.mock.method(performance, 'now', () => elapsed);
  const tick = (ms) => {
    elapsed += ms;
    t.mock.timers.tick(ms);
  };
  const rooms = new RoomsService();
  const games = new GameService(rooms);
  t.after(() => {
    games.onModuleDestroy();
    rooms.onModuleDestroy();
  });
  const host = success(rooms.create('host', 'Hammad'));
  const { code } = host.room;
  const guests = Array.from({ length: count }, (_, i) =>
    success(rooms.join(`guest${i}`, code, `Guesser ${i}`)),
  );
  const phases = [];
  games.onTransition(({ game }) => phases.push(game));
  const start = success(games.start('host', { code, generation: 0 }));
  const word = success(games.getView('host', code)).privateWord.options[0];
  const begin = () =>
    success(
      games.choose('host', {
        code,
        turnId: start.turnId,
        revision: start.revision,
        word,
      }),
    );
  let id = 0;
  const payload = (guess) => ({
    code,
    turnId: start.turnId,
    requestId: (++id).toString(16).padStart(32, '0'),
    guess,
  });
  const submit = (socket, guess) => games.submitGuess(socket, payload(guess));
  const view = (socket) => success(games.getView(socket, code));
  return {
    rooms,
    games,
    host,
    guests,
    code,
    tick,
    phases,
    word,
    begin,
    payload,
    submit,
    view,
  };
}

test('validates guess scope and clean Unicode input', () => {
  const input = {
    code: 'ABC123',
    turnId: randomUUID(),
    requestId: 'a'.repeat(32),
    guess: '  Café  ',
  };
  assert.equal(guessSubmitSchema.parse(input).guess, 'Café');
  for (const guess of [
    0,
    '',
    '   ',
    '\u0000word',
    'word\n',
    'w\u200Bord',
    '\ud800',
    'a'.repeat(81),
  ]) {
    assert.equal(
      guessSubmitSchema.safeParse({ ...input, guess }).success,
      false,
    );
  }
  assert.ok(
    guessSubmitSchema.safeParse({ ...input, guess: '🎨'.repeat(80) }).success,
  );
  assert.equal(
    guessSubmitSchema.safeParse({ ...input, points: 400 }).success,
    false,
  );
});

test('scores each player once, uses the server deadline, caps the drawer bonus, and ends early once', (t) => {
  const f = fixture(t, 7);
  assert.equal(f.submit('guest0', 'Wrong').error.code, 'GUESS_CLOSED');
  f.begin();
  assert.equal(f.submit('host', f.word).error.code, 'DRAWER_CANNOT_GUESS');
  assert.equal(f.submit('stranger', f.word).error.code, 'NOT_IN_ROOM');
  assert.equal(
    f.games.submitGuess('guest0', {
      ...f.payload(f.word),
      turnId: randomUUID(),
    }).error.code,
    'GUESS_CLOSED',
  );
  const fullWidth = [...f.word.toUpperCase()]
    .map((c) =>
      c === ' '
        ? '\u3000\u3000'
        : String.fromCharCode(c.charCodeAt(0) + 0xfee0),
    )
    .join('');
  const first = f.payload(` \u00a0${fullWidth} `);
  const awarded = success(f.games.submitGuess('guest0', first));
  assert.equal(awarded.receipt.pointsAwarded, 400);
  assert.deepEqual(awarded.activity.scores, [
    { playerId: f.guests[0].playerId, points: 400 },
    { playerId: f.host.playerId, points: 50 },
  ]);
  assert.deepEqual(success(f.games.submitGuess('guest0', first)), {
    receipt: awarded.receipt,
  });
  assert.equal(f.submit('guest0', f.word).error.code, 'ALREADY_GUESSED');
  f.tick(10_250);
  for (let i = 1; i < 7; i++) {
    const result = success(f.submit(`guest${i}`, f.word));
    assert.equal(result.receipt.pointsAwarded, 350);
    assert.equal(result.activity.scores.length, i < 4 ? 2 : 1);
  }
  const ended = f.view('guest6');
  assert.equal(ended.game.summary.word, f.word);
  assert.equal(ended.game.phase, 'turn_summary');
  assert.equal(ended.game.phaseEndsAt, Date.now() + 5_000);
  assert.equal(
    ended.guessing.scores.find((entry) => entry.playerId === f.host.playerId)
      .points,
    200,
  );
  assert.equal(f.submit('guest6', f.word).error.code, 'GUESS_CLOSED');
  f.tick(4_999);
  assert.deepEqual(
    f.phases.map(({ phase }) => phase),
    ['word_selection', 'drawing', 'turn_summary'],
  );
});

test('keeps the answer private, deduplicates public messages, and restores a stable room identity', (t) => {
  const f = fixture(t);
  const drawing = f.begin();
  const wrong = f.payload('Something else');
  assert.equal(
    success(f.games.submitGuess('guest0', wrong)).activity.message,
    wrong.guess,
  );
  assert.equal(
    success(f.games.submitGuess('guest0', wrong)).activity,
    undefined,
  );
  assert.equal(success(f.submit('guest0', `${f.word}!`)).activity.message, '…');
  const correct = success(f.submit('guest0', f.word.toLowerCase()));
  assert.deepEqual(Object.keys(correct.activity).sort(), [
    'kind',
    'playerId',
    'playerName',
    'roomCode',
    'scores',
    'sequence',
    'turnId',
  ]);
  const peer = f.view('guest1');
  assert.equal(peer.guessing.myPoints, null);
  assert.equal(peer.privateWord, undefined);
  assert.equal(peer.game.summary, undefined);

  f.rooms.disconnect('guest0');
  f.tick(3_000);
  success(f.rooms.rejoin('refreshed', f.code, f.guests[0].reconnectToken));
  assert.equal(f.submit('guest0', f.word).error.code, 'NOT_IN_ROOM');
  const restored = f.view('refreshed');
  assert.equal(restored.game.phaseEndsAt, drawing.phaseEndsAt);
  assert.equal(restored.guessing.myPoints, 400);
  assert.deepEqual(
    restored.guessing.history.map(({ message }) => message),
    [wrong.guess, '…'],
  );
  assert.equal(restored.guessing.correct.length, 1);
  assert.equal(f.submit('refreshed', f.word).error.code, 'ALREADY_GUESSED');
});

test('chat handles compound text consistently for candidate words regardless of the answer', (t) => {
  const { begin, word, submit, view } = fixture(t);
  const alternative = word === 'owl' ? 'key' : 'owl';
  begin();
  for (const candidate of [word, alternative]) {
    const result = success(submit('guest0', `${candidate}?`));
    assert.equal(result.receipt.correct, false);
    assert.equal(result.activity.message, '…');
  }
  assert.deepEqual(
    view('guest1').guessing.history.map(({ message }) => message),
    ['…', '…'],
  );
  assert.equal(
    success(submit('guest0', alternative)).activity.message,
    alternative,
  );
});

test('limits guesses across reconnects and keeps only the last 100 incorrect guesses', (t) => {
  const f = fixture(t);
  f.begin();
  for (let i = 0; i < 4; i++) success(f.submit('guest0', `Miss ${i}`));
  assert.equal(f.submit('guest0', 'Miss blocked').error.code, 'RATE_LIMITED');
  success(f.rooms.rejoin('new-socket', f.code, f.guests[0].reconnectToken));
  assert.equal(
    f.submit('new-socket', 'Miss blocked').error.code,
    'RATE_LIMITED',
  );
  for (let i = 4; i < 105; i++) {
    f.tick(500);
    success(f.submit('new-socket', `Miss ${i}`));
  }
  const { guessing } = f.view('guest1');
  assert.equal(guessing.history.length, GUESS_HISTORY_LIMIT);
  assert.equal(guessing.history[0].sequence, 6);
  assert.equal(guessing.history.at(-1).sequence, 105);
  assert.equal(guessing.sequence, 105);
});

test('preserves eligibility during the reconnect grace period and completes after expiry when solved', (t) => {
  const f = fixture(t);
  f.begin();
  f.rooms.disconnect('guest1');
  success(f.submit('guest0', f.word));
  f.tick(14_999);
  assert.equal(f.view('guest0').game.phase, 'drawing');
  f.tick(1);
  assert.equal(f.view('guest0').game.phase, 'turn_summary');
});

test('ends on the original drawing deadline and refuses a late answer', (t) => {
  const f = fixture(t);
  f.begin();
  f.tick(59_999);
  assert.equal(success(f.submit('guest0', f.word)).receipt.pointsAwarded, 105);
  f.tick(1);
  assert.equal(f.submit('guest1', f.word).error.code, 'GUESS_CLOSED');
  const late = f.view('guest1');
  assert.equal(late.game.phase, 'turn_summary');
  assert.equal(late.guessing.myPoints, null);
});
