import assert from 'node:assert/strict';
import test from 'node:test';
import drawingModule from '../dist/drawing/drawing.service.js';
import gameModule from '../dist/game/game.service.js';
import configModule from '../dist/game/game-config.js';
import roomsModule from '../dist/rooms/rooms.service.js';
import scoringModule from '../dist/scoring/scoring.js';

const { DrawingService } = drawingModule;
const { GameService } = gameModule;
const { gameConfig } = configModule;
const { RoomsService } = roomsModule;
const { rankPlayerScores } = scoringModule;
const { performance } = globalThis;

function success(result) {
  assert.equal(result.ok, true, JSON.stringify(result.error));
  return result.data;
}

function fixture(t, count = 4) {
  let now = 10_000;
  const timers = new Set();
  t.mock.method(Date, 'now', () => now);
  t.mock.method(performance, 'now', () => now);
  t.mock.method(globalThis, 'setTimeout', (run, delay) => {
    const timer = { run, at: now + delay, unref() {} };
    timers.add(timer);
    return timer;
  });
  t.mock.method(globalThis, 'clearTimeout', (timer) => timers.delete(timer));
  function tick(ms) {
    const end = now + ms;
    let next = [...timers].sort((a, b) => a.at - b.at)[0];
    while (next && next.at <= end) {
      now = Math.max(now, next.at);
      timers.delete(next);
      next.run();
      next = [...timers].sort((a, b) => a.at - b.at)[0];
    }
    now = end;
  }
  const rooms = new RoomsService();
  const games = new GameService(rooms);
  const drawings = new DrawingService(rooms, games);
  t.after(() => {
    drawings.onModuleDestroy();
    games.onModuleDestroy();
    rooms.onModuleDestroy();
    assert.equal(timers.size, 0);
  });
  const host = success(rooms.create('socket0', 'Hammad'));
  const { code } = host.room;
  const people = [
    host,
    ...['Ali', 'Usman', 'Zain']
      .slice(0, count - 1)
      .map((name, i) => success(rooms.join(`socket${i + 1}`, code, name))),
  ];
  const updates = [];
  games.onTransition((update) => updates.push(update));
  const start = (
    socket = 'socket0',
    generation = rooms.getSnapshot(code).gameGeneration,
  ) => games.start(socket, { code, generation });
  const view = (socket = 'socket0') => success(games.getView(socket, code));
  const choose = (socket, options = view(socket).privateWord) => ({
    code,
    turnId: options.turnId,
    revision: options.revision,
    word: options.options[0],
  });
  const draw = (socket) => {
    const choice = choose(socket);
    return { state: success(games.choose(socket, choice)), choice };
  };
  let requestId = 0;
  const guess = (socket, turnId, word) =>
    games.submitGuess(socket, {
      code,
      turnId,
      requestId: (++requestId).toString(16).padStart(32, '0'),
      guess: word,
    });
  const advance = () => tick(gameConfig.summaryMs);
  return {
    code,
    rooms,
    games,
    drawings,
    updates,
    people,
    timers,
    tick,
    jump: (ms) => {
      now += ms;
    },
    start,
    view,
    choose,
    draw,
    guess,
    advance,
  };
}

test('rotates four players over two rounds, preserves scores, and shares a tied win', (t) => {
  const f = fixture(t);
  const start = success(f.start());
  const seenTurns = new Set();
  const seenWords = new Set();
  const order = [];
  for (let turn = 0; turn < 8; turn++) {
    const selection = f.view().game;
    const index = turn % 4;
    const drawer = `socket${index}`;
    const options = f.view(drawer).privateWord;
    assert.equal(selection.phase, 'word_selection');
    assert.equal(selection.currentTurn, turn + 1);
    assert.equal(selection.currentRound, Math.floor(turn / 4) + 1);
    assert.equal(selection.totalTurns, 8);
    assert.equal(selection.gameId, start.gameId);
    assert.equal(selection.currentDrawerId, f.people[index].playerId);
    assert.ok(!seenTurns.has(selection.turnId));
    seenTurns.add(selection.turnId);
    for (const option of options.options) {
      assert.ok(!seenWords.has(option));
      seenWords.add(option);
    }
    order.push(selection.currentDrawerId);
    const guesser = `socket${(index + 1) % 4}`;
    assert.equal(f.view(guesser).privateWord, undefined);
    assert.deepEqual(f.view(guesser).guessing.history, []);
    assert.equal(f.view(guesser).guessing.myPoints, null);
    const { state, choice } = f.draw(drawer);
    assert.equal(f.view(guesser).game.summary, undefined);
    assert.equal(f.view(guesser).privateWord, undefined);
    success(f.guess(guesser, state.turnId, 'A wrong answer'));
    for (let i = 0; i < 4; i++) {
      if (i === index) continue;
      assert.equal(
        success(f.guess(`socket${i}`, state.turnId, choice.word)).receipt
          .pointsAwarded,
        400,
      );
    }
    const summary = f.view(guesser).game;
    assert.equal(summary.phase, 'turn_summary');
    assert.equal(summary.summary.word, choice.word);
    assert.equal(summary.summary.reason, 'all_correct');
    assert.equal(
      summary.summary.awards.find(
        ({ playerId }) => playerId === f.people[index].playerId,
      ).points,
      150,
    );
    assert.equal(
      summary.summary.awards.reduce((total, award) => total + award.score, 0),
      (turn + 1) * 1350,
    );
    assert.equal(summary.phaseEndsAt - Date.now(), 5_000);
    f.advance();
  }
  const ids = f.people.map(({ playerId }) => playerId);
  assert.deepEqual(order, [...ids, ...ids]);
  const finished = f.view();
  assert.equal(finished.game.phase, 'finished');
  assert.equal(finished.game.phaseEndsAt, null);
  assert.equal(finished.game.turnId, null);
  assert.equal(finished.guessing, undefined);
  assert.equal(finished.game.results.reason, 'completed');
  assert.deepEqual(finished.game.results.winnerIds, ids);
  assert.deepEqual(
    finished.game.results.players.map(({ score, rank }) => [score, rank]),
    Array(4).fill([2700, 1]),
  );
  assert.equal(f.rooms.getSnapshot(f.code).status, 'finished');
  assert.equal(f.timers.size, 0);
  assert.equal(
    f.guess('socket1', [...seenTurns].at(-1), 'Late guess').error.code,
    'GUESS_CLOSED',
  );
  assert.equal(
    f.updates.filter(({ game }) => game.phase === 'finished').length,
    1,
  );
});

test('drawing timeout and a simultaneous late guess produce one summary and one next turn', (t) => {
  const f = fixture(t, 2);
  success(f.start());
  const { state, choice } = f.draw('socket0');
  const [drawingTimer] = f.timers;
  f.jump(gameConfig.drawingMs);
  assert.equal(
    f.guess('socket1', state.turnId, choice.word).error.code,
    'GUESS_CLOSED',
  );
  drawingTimer.run();
  const [summaryTimer] = f.timers;
  const summary = f.view().game;
  assert.equal(summary.summary.reason, 'time_expired');
  assert.deepEqual(
    summary.summary.awards.map(({ points }) => points),
    [0, 0],
  );
  f.tick(gameConfig.summaryMs - 1);
  assert.equal(f.view().game.phase, 'turn_summary');
  f.tick(1);
  summaryTimer.run();
  assert.equal(f.view().game.currentTurn, 2);
  assert.equal(f.view().game.currentDrawerId, f.people[1].playerId);
  assert.equal(
    f.updates.filter(({ game }) => game.phase === 'turn_summary').length,
    1,
  );
  assert.equal(
    f.updates.filter(({ game }) => game.phase === 'word_selection').length,
    2,
  );
  assert.equal(f.games.choose('socket1', choice).error.code, 'WRONG_PHASE');
});

test('forfeits a departed drawer, settles the old drawing, and skips departed slots with points preserved', (t) => {
  const f = fixture(t);
  success(f.start());
  const { state, choice } = f.draw('socket0');
  const first = {
    turnId: state.turnId,
    canvasVersion: 0,
    id: 'b'.repeat(32),
    tool: 'pen',
    color: '#123456',
    size: 4,
    point: [10, 10],
  };
  success(f.drawings.start('socket0', first));
  success(
    f.drawings.points('socket0', { ...first, sequence: 0, points: [11, 11] }),
  );
  success(f.drawings.clear('socket0', first));
  success(f.drawings.start('socket0', { ...first, canvasVersion: 1 }));
  success(f.guess('socket2', state.turnId, choice.word));
  f.rooms.leave('socket2');
  f.rooms.leave('socket0');
  const summary = f.view('socket1').game;
  assert.equal(summary.summary.reason, 'drawer_left');
  assert.equal(summary.summary.word, choice.word);
  assert.equal(summary.totalTurns, 5);
  assert.equal(
    summary.summary.awards.find(
      ({ playerId }) => playerId === f.people[2].playerId,
    ).points,
    400,
  );
  assert.equal(
    success(f.drawings.snapshot('socket1', first)).strokes.length,
    1,
  );
  assert.equal(f.drawings.start('socket1', first).error.code, 'WRONG_PHASE');
  f.advance();
  assert.equal(f.view('socket1').game.currentDrawerId, f.people[1].playerId);
  const next = f.draw('socket1');
  const canvas = success(
    f.drawings.snapshot('socket3', { turnId: next.state.turnId }),
  );
  assert.equal(canvas.canvasVersion, 2);
  assert.deepEqual(canvas.strokes, []);
  assert.equal(f.drawings.start('socket1', first).error.code, 'STALE_CANVAS');
  assert.equal(
    f.guess('socket3', state.turnId, choice.word).error.code,
    'GUESS_CLOSED',
  );
  success(f.guess('socket3', next.state.turnId, next.choice.word));
  f.advance();
  assert.equal(f.view('socket1').game.currentDrawerId, f.people[3].playerId);
  assert.equal(f.view('socket1').game.currentTurn, 3);
  assert.equal(f.view('socket1').game.currentRound, 1);
  assert.equal(
    f
      .view('socket1')
      .guessing.scores.find(({ playerId }) => playerId === f.people[2].playerId)
      .points,
    400,
  );
});

test('refresh restores the drawing and a temporarily offline player keeps the next drawer slot', (t) => {
  const f = fixture(t, 3);
  success(f.start());
  const { state, choice } = f.draw('socket0');
  const scope = { turnId: state.turnId, canvasVersion: 0, id: 'c'.repeat(32) };
  success(
    f.drawings.start('socket0', {
      ...scope,
      tool: 'pen',
      color: '#123456',
      size: 4,
      point: [10, 10],
    }),
  );
  f.drawings.disconnect('socket0');
  f.rooms.disconnect('socket0');
  f.tick(2_000);
  success(f.rooms.rejoin('host-refresh', f.code, f.people[0].reconnectToken));
  assert.equal(f.view('host-refresh').game.phaseEndsAt, state.phaseEndsAt);
  assert.equal(f.view('host-refresh').privateWord.word, choice.word);
  assert.equal(
    success(f.drawings.snapshot('host-refresh', scope)).strokes.length,
    1,
  );
  success(f.guess('socket1', state.turnId, choice.word));
  success(f.guess('socket2', state.turnId, choice.word));
  f.rooms.disconnect('socket1');
  f.advance();
  const next = f.updates.at(-1);
  assert.equal(next.game.currentDrawerId, f.people[1].playerId);
  success(f.rooms.rejoin('drawer-refresh', f.code, f.people[1].reconnectToken));
  assert.deepEqual(f.view('drawer-refresh').privateWord, next.privateWord);
  assert.equal(
    f.view('drawer-refresh').game.phaseEndsAt,
    next.game.phaseEndsAt,
  );
  assert.equal(f.view('socket2').privateWord, undefined);
});

test('finishes after grace expiry, restores final results, and restarts only the current game for the current host', (t) => {
  const f = fixture(t, 2);
  const started = success(f.start());
  const restart = { code: f.code, gameId: started.gameId };
  assert.equal(
    f.games.restart('socket0', restart).error.code,
    'GAME_NOT_FINISHED',
  );
  const { state, choice } = f.draw('socket0');
  const [oldTimer] = f.timers;
  f.rooms.disconnect('socket1');
  f.tick(14_999);
  assert.equal(f.view().game.phase, 'drawing');
  f.tick(1);
  assert.equal(f.view().game.summary.reason, 'insufficient_players');
  f.advance();
  const final = f.view().game.results;
  assert.equal(final.reason, 'insufficient_players');
  assert.equal(f.timers.size, 0);
  assert.equal(f.games.getView('outsider', f.code).error.code, 'NOT_IN_ROOM');
  success(f.rooms.rejoin('reloaded', f.code, f.people[0].reconnectToken));
  assert.deepEqual(f.view('reloaded').game.results, final);
  const waiting = success(f.games.restart('reloaded', restart));
  assert.equal(waiting.phase, 'waiting');
  assert.equal(waiting.currentTurn, 0);
  assert.equal(f.view('reloaded').game.results, undefined);
  assert.equal(f.rooms.getSnapshot(f.code).hostId, f.people[0].playerId);
  assert.equal(
    f.games.restart('reloaded', restart).error.code,
    'GAME_NOT_FINISHED',
  );
  success(f.rooms.join('new-guest', f.code, 'New guest'));
  assert.equal(f.start('reloaded', 0).error.code, 'STALE_GAME');
  const newGame = success(f.start('reloaded'));
  assert.notEqual(newGame.gameId, started.gameId);
  assert.ok(newGame.generation > waiting.generation);
  assert.equal(f.games.choose('reloaded', choice).error.code, 'WRONG_PHASE');
  assert.equal(
    f.guess('new-guest', state.turnId, choice.word).error.code,
    'GUESS_CLOSED',
  );
  oldTimer.run();
  assert.equal(f.view('reloaded').game.turnId, newGame.turnId);
  assert.deepEqual(
    f.view('reloaded').guessing.scores.map(({ points }) => points),
    [0, 0],
  );
});

test('finished games authorize replay using the current host and server ranks are deterministic', (t) => {
  const f = fixture(t, 3);
  const initial = success(f.start());
  for (let i = 0; i < 6; i++) {
    const drawer = `socket${i % 3}`;
    f.draw(drawer);
    f.tick(gameConfig.drawingMs + gameConfig.summaryMs);
  }
  const request = { code: f.code, gameId: initial.gameId };
  assert.equal(
    f.games.restart('socket1', request).error.code,
    'RESTART_HOST_ONLY',
  );
  const room = f.rooms.getSnapshot(f.code);
  assert.equal(
    f.games.restart('socket0', { ...request, gameId: f.people[1].playerId })
      .error.code,
    'STALE_GAME',
  );
  assert.deepEqual(f.rooms.getSnapshot(f.code), room);
  f.rooms.leave('socket0');
  assert.equal(f.rooms.getSnapshot(f.code).hostId, f.people[1].playerId);
  success(f.games.restart('socket1', request));
  assert.equal(f.rooms.getSnapshot(f.code).players.length, 2);
  const players = [
    { id: 'one', nickname: 'One' },
    { id: 'two', nickname: 'Two' },
    { id: 'three', nickname: 'Three' },
    { id: 'four', nickname: 'Four' },
  ];
  const ranks = rankPlayerScores(
    players,
    new Map([
      ['one', 100],
      ['two', 100],
      ['three', 350],
    ]),
  );
  assert.deepEqual(
    ranks.map(({ playerId, rank }) => [playerId, rank]),
    [
      ['three', 1],
      ['one', 2],
      ['two', 2],
      ['four', 4],
    ],
  );
});
