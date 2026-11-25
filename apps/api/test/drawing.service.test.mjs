import assert from 'node:assert/strict';
import test from 'node:test';
import shared from '@draw-and-guess/shared';
import drawingModule from '../dist/drawing/drawing.service.js';
import configModule from '../dist/game/game-config.js';
import gameModule from '../dist/game/game.service.js';
import roomsModule from '../dist/rooms/rooms.service.js';

const { DrawingService } = drawingModule;
const { gameConfig } = configModule;
const { GameService } = gameModule;
const { RoomsService } = roomsModule;
const {
  drawStartSchema,
  drawPointsSchema,
  drawEndSchema,
  drawUndoSchema,
  MAX_DRAW_STROKE_POINTS,
} = shared;

function success(result) {
  assert.equal(result.ok, true, JSON.stringify(result.error));
  return result.data;
}

function fixture(t) {
  const rooms = new RoomsService();
  const games = new GameService(rooms);
  const drawings = new DrawingService(rooms, games);
  const host = success(rooms.create('host', 'Hammad'));
  const code = host.room.code;
  success(rooms.join('guest', code, 'Ali'));
  const game = success(games.start('host', { code, generation: 0 }));
  const scope = { turnId: game.turnId, canvasVersion: 0 };
  const draw = () =>
    success(
      games.choose('host', {
        code,
        turnId: game.turnId,
        revision: game.revision,
        word: success(games.getView('host', code)).privateWord.options[0],
      }),
    );
  t.after(() => {
    drawings.onModuleDestroy();
    games.onModuleDestroy();
    rooms.onModuleDestroy();
  });
  return { rooms, games, drawings, host, code, scope, draw };
}

const id = (number) => number.toString(16).padStart(32, '0');
const brush = { tool: 'pen', size: 6, color: '#124C53', point: [10, 20] };

test('only the authenticated drawer can write during the current drawing phase', (t) => {
  const { drawings, scope, draw, rooms } = fixture(t);
  const stroke = { ...scope, ...brush, id: id(1) };
  assert.equal(drawings.start('host', stroke).error.code, 'WRONG_PHASE');
  assert.equal(drawings.snapshot('guest', scope).error.code, 'WRONG_PHASE');
  draw();
  assert.equal(drawings.start('guest', stroke).error.code, 'NOT_DRAWER');
  assert.equal(drawings.clear('guest', scope).error.code, 'NOT_DRAWER');
  success(rooms.create('outsider', 'Zain'));
  assert.equal(drawings.start('outsider', stroke).error.code, 'WRONG_PHASE');
  assert.equal(drawings.start('unknown', stroke).error.code, 'NOT_IN_ROOM');
  assert.equal(
    drawings.start('host', { ...stroke, turnId: 'old-turn' }).error.code,
    'STALE_CANVAS',
  );
  assert.deepEqual(success(drawings.snapshot('guest', scope)).strokes, []);
});

test('batches are idempotent and the full end repairs a gap while preserving stroke order and brush', (t) => {
  const { drawings, scope, draw } = fixture(t);
  draw();
  const start = { ...scope, ...brush, id: id(1) };
  assert.ok(success(drawings.start('host', start)).event);
  assert.equal(success(drawings.start('host', start)).event, undefined);
  const later = { ...scope, id: start.id, sequence: 1, points: [50, 60] };
  assert.equal(success(drawings.points('host', later)), null);
  const early = { ...later, sequence: 0, points: [30, 40] };
  assert.equal(success(drawings.points('host', early)).data.sequence, 0);
  assert.equal(success(drawings.points('host', early)), null);
  assert.deepEqual(
    success(drawings.snapshot('guest', scope)).active.stroke.points,
    [10, 20, 30, 40],
  );
  assert.equal(
    drawings.end('host', { ...scope, id: start.id, points: [99, 99] }).error
      .code,
    'INVALID_STROKE',
  );
  const end = { ...scope, id: start.id, points: [10, 20, 30, 40, 50, 60] };
  assert.ok(success(drawings.end('host', end)).event);
  assert.equal(success(drawings.end('host', end)).event, undefined);
  const erase = {
    ...scope,
    ...brush,
    id: id(2),
    tool: 'eraser',
    size: 18,
    color: '#FFFFFF',
  };
  success(drawings.start('host', erase));
  success(
    drawings.end('host', { ...scope, id: erase.id, points: [10, 20, 11, 21] }),
  );
  const replay = success(drawings.snapshot('guest', scope));
  assert.equal(replay.active, null);
  assert.deepEqual(
    replay.strokes.map(({ tool, size, color }) => ({ tool, size, color })),
    [
      { tool: 'pen', size: 6, color: '#124C53' },
      { tool: 'eraser', size: 18, color: '#FFFFFF' },
    ],
  );
  assert.deepEqual(replay.strokes[0].points, end.points);
});

test('clear changes canvas version and old events cannot resurrect anything', (t) => {
  const { drawings, scope, draw } = fixture(t);
  draw();
  const stroke = { ...scope, ...brush, id: id(1) };
  success(drawings.start('host', stroke));
  const clear = success(drawings.clear('host', scope));
  assert.equal(clear.receipt.canvasVersion, 1);
  assert.equal(drawings.clear('host', scope).error.code, 'STALE_CANVAS');
  assert.equal(
    drawings.points('host', {
      ...scope,
      id: stroke.id,
      sequence: 0,
      points: [3, 4],
    }).error.code,
    'STALE_CANVAS',
  );
  assert.equal(
    drawings.end('host', { ...scope, id: stroke.id, points: [10, 20] }).error
      .code,
    'STALE_CANVAS',
  );
  const snapshot = success(drawings.snapshot('guest', scope));
  assert.equal(snapshot.canvasVersion, 1);
  assert.equal(snapshot.active, null);
  assert.deepEqual(snapshot.strokes, []);
  assert.equal(
    drawings.undo('host', clear.receipt).error.code,
    'INVALID_STROKE',
  );
});

test('undo removes completed strokes in reverse order and fences off their delayed packets', (t) => {
  const { drawings, scope, draw } = fixture(t);
  const empty = { ...scope, revision: 0 };
  assert.equal(drawings.undo('host', empty).error.code, 'WRONG_PHASE');
  draw();
  assert.equal(drawings.undo('guest', empty).error.code, 'NOT_DRAWER');
  assert.equal(drawings.undo('missing', empty).error.code, 'NOT_IN_ROOM');
  assert.equal(drawings.undo('host', empty).error.code, 'INVALID_STROKE');

  const pen = { ...scope, ...brush, id: id(1) };
  success(drawings.start('host', pen));
  success(drawings.end('host', { ...scope, id: pen.id, points: pen.point }));
  const eraser = { ...pen, id: id(2), tool: 'eraser', size: 22 };
  const active = success(drawings.start('host', eraser)).receipt;
  assert.equal(drawings.undo('host', active).error.code, 'INVALID_STROKE');
  const end = { ...scope, id: eraser.id, points: [10, 20, 20, 30] };
  const completed = success(drawings.end('host', end)).receipt;
  assert.equal(drawings.undo('host', active).error.code, 'STALE_CANVAS');
  const undo = success(drawings.undo('host', completed)).data;
  assert.deepEqual(undo, {
    turnId: scope.turnId,
    canvasVersion: scope.canvasVersion + 1,
    revision: completed.revision + 1,
    id: eraser.id,
  });
  assert.equal(drawings.undo('host', completed).error.code, 'STALE_CANVAS');
  assert.equal(drawings.start('host', eraser).error.code, 'STALE_CANVAS');
  assert.equal(drawings.end('host', end).error.code, 'STALE_CANVAS');
  assert.equal(
    drawings.points('host', { ...end, sequence: 0 }).error.code,
    'STALE_CANVAS',
  );
  const afterErase = success(drawings.snapshot('guest', scope));
  assert.deepEqual(
    afterErase.strokes.map((stroke) => stroke.id),
    [pen.id],
  );
  const secondUndo = success(drawings.undo('host', undo)).data;
  assert.equal(secondUndo.id, pen.id);
  const afterPen = success(drawings.snapshot('host', scope));
  assert.deepEqual(afterPen.strokes, []);
  assert.equal(afterPen.active, null);
  assert.equal(drawings.undo('host', secondUndo).error.code, 'INVALID_STROKE');
});

test('undo is locked in the summary and cannot change a subsequent turn', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 50_000 });
  const { drawings, games, code, scope, draw } = fixture(t);
  draw();
  success(drawings.start('host', { ...scope, ...brush, id: id(1) }));
  const first = success(
    drawings.end('host', { ...scope, id: id(1), points: brush.point }),
  ).receipt;
  t.mock.timers.tick(gameConfig.drawingMs);
  assert.equal(drawings.undo('host', first).error.code, 'WRONG_PHASE');
  assert.equal(success(drawings.snapshot('guest', scope)).strokes.length, 1);

  t.mock.timers.tick(gameConfig.summaryMs);
  const { turnId, revision, options } = success(
    games.getView('guest', code),
  ).privateWord;
  success(games.choose('guest', { code, turnId, revision, word: options[0] }));
  const second = {
    turnId,
    canvasVersion: success(drawings.snapshot('guest', { turnId }))
      .canvasVersion,
  };
  success(drawings.start('guest', { ...second, ...brush, id: id(2) }));
  const current = success(
    drawings.end('guest', { ...second, id: id(2), points: brush.point }),
  ).receipt;
  assert.equal(
    drawings.undo('guest', { ...current, turnId: first.turnId }).error.code,
    'STALE_CANVAS',
  );
  assert.equal(success(drawings.snapshot('host', second)).strokes[0].id, id(2));
});

test('disconnect settles the accepted prefix and timer end locks the preserved canvas', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 50_000 });
  const { drawings, rooms, host, code, scope, draw } = fixture(t);
  draw();
  const completed = [];
  drawings.onInterruptedStroke((event) => completed.push(event));
  success(drawings.start('host', { ...scope, ...brush, id: id(1) }));
  success(
    drawings.points('host', {
      ...scope,
      id: id(1),
      sequence: 0,
      points: [30, 40],
    }),
  );
  rooms.disconnect('host');
  drawings.disconnect('host');
  assert.deepEqual(completed[0].data.stroke.points, [10, 20, 30, 40]);
  success(rooms.rejoin('resumed', code, host.reconnectToken));
  assert.equal(success(drawings.snapshot('resumed', scope)).strokes.length, 1);

  success(drawings.start('resumed', { ...scope, ...brush, id: id(2) }));
  t.mock.timers.tick(60_000);
  assert.equal(completed.length, 2);
  assert.equal(drawings.clear('resumed', scope).error.code, 'WRONG_PHASE');
  assert.equal(success(drawings.snapshot('guest', scope)).strokes.length, 2);
  rooms.leave('resumed');
  rooms.leave('guest');
  assert.equal(drawings.canvases.size, 0);
  assert.equal(drawings.activeSockets.size, 0);
});

test('limits retained points per canvas and per turn even across clears', (t) => {
  const { drawings, scope, draw } = fixture(t);
  draw();
  const points = Array.from({ length: MAX_DRAW_STROKE_POINTS }, () => [
    10, 20,
  ]).flat();
  for (let canvasVersion = 0; canvasVersion < 2; canvasVersion++) {
    const current = { ...scope, canvasVersion };
    for (let index = 0; index < 16; index++) {
      success(drawings.start('host', { ...current, ...brush, id: id(index) }));
      success(drawings.end('host', { ...current, id: id(index), points }));
    }
    assert.equal(
      drawings.start('host', { ...current, ...brush, id: id(999) }).error.code,
      'DRAWING_LIMIT',
    );
    success(drawings.clear('host', current));
  }
  assert.equal(
    drawings.start('host', {
      ...scope,
      canvasVersion: 2,
      ...brush,
      id: id(998),
    }).error.code,
    'DRAWING_LIMIT',
  );
});

test('schemas reject malformed paint metadata and coordinates or batches beyond the limits', () => {
  const scope = {
    turnId: 'f7e09483-6bee-4d6a-b7cf-4900282e693a',
    canvasVersion: 0,
  };
  const good = { ...scope, ...brush, id: id(1) };
  assert.equal(drawStartSchema.safeParse(good).success, true);
  assert.equal(
    drawUndoSchema.safeParse({ ...scope, revision: 0 }).success,
    true,
  );
  assert.equal(drawUndoSchema.safeParse(scope).success, false);
  assert.equal(
    drawUndoSchema.safeParse({ ...scope, revision: -1 }).success,
    false,
  );
  for (const invalid of [
    { ...good, size: 31 },
    { ...good, color: 'white' },
    { ...good, point: [0, 601] },
    { ...good, playerId: 'host' },
  ]) {
    assert.equal(drawStartSchema.safeParse(invalid).success, false);
  }
  assert.equal(
    drawPointsSchema.safeParse({
      ...scope,
      id: id(1),
      sequence: 0,
      points: [5],
    }).success,
    false,
  );
  assert.equal(
    drawPointsSchema.safeParse({
      ...scope,
      id: id(1),
      sequence: 0,
      points: Array(130).fill(1),
    }).success,
    false,
  );
  assert.equal(
    drawEndSchema.safeParse({
      ...scope,
      id: id(1),
      points: Array(2 * MAX_DRAW_STROKE_POINTS + 2).fill(1),
    }).success,
    false,
  );
  const withPoints = (points) =>
    drawEndSchema.safeParse({ ...scope, id: id(1), points }).success;
  assert.equal(withPoints([0, 600, 900, 0]), true);
  for (const points of [
    [901, 0],
    [0, 601],
    [0, 1.5],
    [NaN, 0],
    [0, Infinity],
    [-1, 0],
    ['1', 0],
    [null, 0],
    Array(2),
    new Uint16Array([0, 0]),
  ]) {
    assert.equal(withPoints(points), false);
  }
});

test('completed drawings retain final ink by game and turn until replay', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 50_000 });
  const { rooms, games, drawings, code, scope, draw } = fixture(t);
  const guest = success(rooms.join('guest', code, 'Ali'));
  const gameId = success(games.getView('host', code)).game.gameId;
  const request = { gameId, turnId: scope.turnId };
  success(rooms.create('outsider', 'Other'));
  assert.equal(
    drawings.completed('guest', request).error.code,
    'DRAWING_UNAVAILABLE',
  );
  draw();
  const points = [0, 600, 900, 0];
  for (let index = 1; index <= 3; index++) {
    success(
      drawings.start('host', {
        ...scope,
        ...brush,
        id: id(index),
        point: points.slice(0, 2),
        tool: index === 2 ? 'eraser' : 'pen',
        size: index + 5,
      }),
    );
    success(drawings.end('host', { ...scope, id: id(index), points }));
  }
  const { revision } = success(drawings.snapshot('guest', scope));
  const { canvasVersion } = success(
    drawings.undo('host', { ...scope, revision }),
  ).data;
  success(
    drawings.start('host', { ...scope, canvasVersion, ...brush, id: id(4) }),
  );
  assert.equal(
    drawings.completed('guest', request).error.code,
    'DRAWING_UNAVAILABLE',
  );
  t.mock.timers.tick(gameConfig.drawingMs);

  const summary = success(games.getView('guest', code)).game.summary;
  assert.deepEqual(summary.drawing, {
    turnId: scope.turnId,
    round: 1,
    turn: 1,
    drawerName: 'Hammad',
  });
  const first = success(drawings.completed('guest', request));
  assert.equal(first.gameId, gameId);
  assert.equal(first.turnId, scope.turnId);
  assert.equal(first.canvasVersion, canvasVersion);
  assert.deepEqual(
    first.strokes.map(({ id, tool, points }) => ({ id, tool, points })),
    [
      { id: id(1), tool: 'pen', points },
      { id: id(2), tool: 'eraser', points },
      { id: id(4), tool: 'pen', points: brush.point },
    ],
  );
  assert.equal(
    games.getCompletedDrawing(code, request).coordinates.byteLength,
    20,
  );
  assert.equal(
    drawings.completed('outsider', request).error.code,
    'DRAWING_UNAVAILABLE',
  );
  assert.equal(
    drawings.completed('unconnected', request).error.code,
    'NOT_IN_ROOM',
  );

  rooms.disconnect('guest');
  success(rooms.rejoin('reconnected', code, guest.reconnectToken));
  t.mock.timers.tick(gameConfig.summaryMs);
  assert.deepEqual(success(drawings.completed('reconnected', request)), first);
  t.mock.timers.tick(gameConfig.selectionMs);
  t.mock.timers.tick(gameConfig.drawingMs);
  t.mock.timers.tick(gameConfig.summaryMs);
  t.mock.timers.tick(gameConfig.selectionMs);
  t.mock.timers.tick(gameConfig.drawingMs);
  t.mock.timers.tick(gameConfig.summaryMs);
  t.mock.timers.tick(gameConfig.selectionMs);
  const lastTurn = success(games.getView('host', code)).game.turnId;
  const lastScope = success(
    drawings.snapshot('reconnected', { turnId: lastTurn }),
  );
  success(
    drawings.start('reconnected', {
      turnId: lastTurn,
      canvasVersion: lastScope.canvasVersion,
      ...brush,
      id: id(5),
    }),
  );
  t.mock.timers.tick(gameConfig.drawingMs);
  const final = success(games.getView('host', code)).game;
  assert.equal(final.phase, 'finished');
  assert.equal(final.results.drawings.length, 4);
  assert.equal(final.results.drawings.at(-1).turnId, lastTurn);
  assert.equal(
    success(drawings.completed('host', { gameId, turnId: lastTurn })).strokes[0]
      .id,
    id(5),
  );
  assert.deepEqual(success(drawings.completed('host', request)), first);
  success(games.restart('host', { code, gameId }));
  assert.equal(
    drawings.completed('host', request).error.code,
    'DRAWING_UNAVAILABLE',
  );
});

test('closing a room releases its completed drawings', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 50_000 });
  const { rooms, games, drawings, code, draw } = fixture(t);
  const { gameId, turnId } = draw();
  t.mock.timers.tick(gameConfig.drawingMs);
  assert.deepEqual(
    success(drawings.completed('guest', { gameId, turnId })).strokes,
    [],
  );
  rooms.leave('host');
  rooms.leave('guest');
  assert.equal(games.getCompletedDrawing(code, { gameId, turnId }), undefined);
});
