import assert from 'node:assert/strict';
import test from 'node:test';
import gameModule from '../dist/game/game.service.js';
import roomsModule from '../dist/rooms/rooms.service.js';

const { GameService } = gameModule;
const { RoomsService } = roomsModule;

function success(response) {
  assert.equal(response.ok, true, JSON.stringify(response.error));
  return response.data;
}

function fixture(t) {
  const rooms = new RoomsService();
  const games = new GameService(rooms);
  const updates = [];
  games.onTransition((update) => updates.push(update));
  const host = success(rooms.create('host', 'Hammad'));
  t.after(() => {
    games.onModuleDestroy();
    rooms.onModuleDestroy();
  });
  return { games, rooms, host, code: host.room.code, updates };
}

test('authenticates start, requires connected players, and picks the first eligible drawer once', (t) => {
  const { rooms, games, host, code, updates } = fixture(t);
  assert.equal(
    games.start('stranger', { code, generation: 0 }).error.code,
    'NOT_IN_ROOM',
  );
  assert.equal(
    games.start('host', { code: 'MISSING', generation: 0 }).error.code,
    'ROOM_NOT_FOUND',
  );
  assert.equal(
    games.start('host', { code, generation: 0 }).error.code,
    'NOT_ENOUGH_PLAYERS',
  );
  const guest = success(rooms.join('guest', code, 'Ali'));
  assert.equal(
    games.start('guest', { code, generation: 0 }).error.code,
    'NOT_HOST',
  );
  rooms.disconnect('guest');
  assert.equal(
    games.start('host', { code, generation: 0 }).error.code,
    'NOT_ENOUGH_PLAYERS',
  );
  success(rooms.rejoin('guest-new', code, guest.reconnectToken));

  const start = success(games.start('host', { code, generation: 0 }));
  assert.equal(start.phase, 'word_selection');
  assert.equal(start.currentDrawerId, host.playerId);
  assert.equal(start.currentTurn, 1);
  assert.equal(start.totalTurns, 4);
  assert.equal(
    games.start('host', { code, generation: 0 }).error.code,
    'GAME_STARTED',
  );
  assert.equal(rooms.join('extra', code, 'Zain').error.code, 'GAME_STARTED');
  assert.equal(updates.length, 1);
});

test('validates choices, keeps words private, and restores original deadlines after reconnect', (t) => {
  const { rooms, games, host, code, updates } = fixture(t);
  success(rooms.join('guest', code, 'Ali'));
  const initial = success(games.start('host', { code, generation: 0 }));
  const options = success(games.getView('host', code)).privateWord.options;
  assert.equal(new Set(options).size, 3);
  assert.ok(!('privateWord' in success(games.getView('guest', code))));
  assert.equal(
    games.choose('guest', {
      code,
      turnId: initial.turnId,
      revision: initial.revision,
      word: options[0],
    }).error.code,
    'NOT_DRAWER',
  );
  assert.equal(
    games.choose('host', {
      code,
      turnId: initial.turnId,
      revision: initial.revision,
      word: 'Unlisted word',
    }).error.code,
    'INVALID_WORD',
  );
  rooms.disconnect('host');
  success(rooms.rejoin('host-new', code, host.reconnectToken));
  const restored = success(games.getView('host-new', code));
  assert.deepEqual(restored.privateWord.options, options);
  assert.equal(restored.game.phaseEndsAt, initial.phaseEndsAt);

  const drawing = success(
    games.choose('host-new', {
      code,
      turnId: initial.turnId,
      revision: initial.revision,
      word: options[1],
    }),
  );
  assert.equal(drawing.phase, 'drawing');
  assert.equal(drawing.maskedWord, '_'.repeat(options[1].length));
  assert.ok(!('selectedWord' in drawing) && !('options' in drawing));
  assert.equal(
    games.choose('host-new', {
      code,
      turnId: initial.turnId,
      revision: initial.revision,
      word: options[0],
    }).error.code,
    'WRONG_PHASE',
  );
  rooms.disconnect('host-new');
  success(rooms.rejoin('host-again', code, host.reconnectToken));
  const drawingView = success(games.getView('host-again', code));
  assert.equal(drawingView.game.phaseEndsAt, drawing.phaseEndsAt);
  assert.equal(drawingView.privateWord.word, options[1]);
  assert.ok(!('privateWord' in success(games.getView('guest', code))));
  assert.equal(updates.length, 2);
});

test('fake timers auto-select, end drawing, reject late selections, and cancel obsolete callbacks', (t) => {
  const { Date } = globalThis;
  let now = 100_000;
  const timers = [];
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'setTimeout', (fn, delay) => {
    const timer = { fn, due: now + delay, cleared: false, unref() {} };
    timers.push(timer);
    return timer;
  });
  t.mock.method(globalThis, 'clearTimeout', (timer) => {
    if (timer) timer.cleared = true;
  });
  const { rooms, games, code, updates } = fixture(t);
  success(rooms.join('guest', code, 'Ali'));
  const selecting = success(games.start('host', { code, generation: 0 }));
  const options = success(games.getView('host', code)).privateWord.options;
  const [selectionTimer] = timers;
  assert.equal(selecting.phaseEndsAt, 115_000);
  assert.equal(selectionTimer.due, selecting.phaseEndsAt);
  now = 115_000;
  assert.equal(
    games.choose('host', {
      code,
      turnId: selecting.turnId,
      revision: selecting.revision,
      word: options[1],
    }).error.code,
    'DEADLINE_PASSED',
  );
  const [, drawingTimer] = timers;
  assert.equal(selectionTimer.cleared, true);
  selectionTimer.fn();
  assert.equal(updates.length, 2);
  assert.equal(updates[1].privateWord.word, options[0]);
  assert.equal(drawingTimer.due, 175_000);
  now = 175_000;
  drawingTimer.fn();
  drawingTimer.fn();
  assert.equal(updates.length, 3);
  assert.equal(updates[2].game.phase, 'turn_summary');
  assert.equal(updates[2].game.phaseEndsAt, 180_000);
  assert.ok(!('privateWord' in success(games.getView('host', code))));
  rooms.leave('host');
  rooms.leave('guest');
  assert.equal(games.getView('host', code).error.code, 'ROOM_NOT_FOUND');
});

test('a drawer who leaves during selection forfeits and reaches results when alone', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 50_000 });
  const { rooms, games, code, updates } = fixture(t);
  success(rooms.join('guest', code, 'Ali'));
  success(games.start('host', { code, generation: 0 }));
  rooms.leave('host');
  assert.equal(updates.length, 2);
  assert.equal(updates[1].game.phase, 'finished');
  assert.equal(updates[1].game.summary, undefined);
  assert.equal(updates[1].game.results.reason, 'insufficient_players');
  t.mock.timers.tick(5_000);
  assert.equal(updates.length, 2);
});

test('closing the last membership cancels the phase timeout', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 50_000 });
  const { rooms, games, code, updates } = fixture(t);
  success(rooms.join('guest', code, 'Ali'));
  success(games.start('host', { code, generation: 0 }));
  rooms.leave('host');
  rooms.leave('guest');
  t.mock.timers.tick(75_000);
  assert.equal(updates.length, 2);
  assert.equal(games.getView('host', code).error.code, 'ROOM_NOT_FOUND');
});
