import type { z } from 'zod';
import type {
  pingSchema,
  pongSchema,
  roomCreateSchema,
  roomJoinSchema,
  roomLeaveSchema,
  roomRejoinSchema,
  gameRoomSchema,
  gameStartSchema,
  gameRestartSchema,
  wordChooseSchema,
  guessSubmitSchema,
  drawStartSchema,
  drawPointsSchema,
  drawEndSchema,
  drawClearSchema,
  drawUndoSchema,
  drawSyncSchema,
} from './schemas';
import type {
  DrawingBatch,
  DrawingEnded,
  DrawingReceipt,
  DrawingSnapshot,
  DrawingStarted,
  DrawingUndone,
  GameView,
  GuessMessage,
  GuessNotice,
  GuessReceipt,
  PublicGameState,
  RoomAck,
  RoomClosed,
  RoomSession,
  RoomUpdated,
  WordConfirmed,
  WordOptions,
} from './types';

export const SOCKET_EVENTS = {
  ping: 'ping',
  pong: 'pong',
  roomCreate: 'room:create',
  roomJoin: 'room:join',
  roomLeave: 'room:leave',
  roomRejoin: 'room:rejoin',
  roomUpdated: 'room:updated',
  roomClosed: 'room:closed',
  gameStart: 'game:start',
  gameState: 'game:state',
  gameGetState: 'game:get-state',
  gameRestart: 'game:restart',
  wordOptions: 'word:options',
  wordChoose: 'word:choose',
  wordConfirmed: 'word:confirmed',
  guessSubmit: 'guess:submit',
  guessMessage: 'guess:message',
  guessPlayerCorrect: 'guess:player-correct',
  drawStart: 'draw:start',
  drawPoints: 'draw:points',
  drawEnd: 'draw:end',
  drawClear: 'draw:clear',
  drawUndo: 'draw:undo',
  drawSync: 'draw:sync',
} as const;

export type Ping = z.infer<typeof pingSchema>;
export type Pong = z.infer<typeof pongSchema>;
export type RoomCreate = z.infer<typeof roomCreateSchema>;
export type RoomJoin = z.infer<typeof roomJoinSchema>;
export type RoomLeave = z.infer<typeof roomLeaveSchema>;
export type RoomRejoin = z.infer<typeof roomRejoinSchema>;
export type GameRoomRequest = z.infer<typeof gameRoomSchema>;
export type GameStart = z.infer<typeof gameStartSchema>;
export type GameRestart = z.infer<typeof gameRestartSchema>;
export type WordChoose = z.infer<typeof wordChooseSchema>;
export type GuessSubmit = z.infer<typeof guessSubmitSchema>;
export type DrawStart = z.infer<typeof drawStartSchema>;
export type DrawPoints = z.infer<typeof drawPointsSchema>;
export type DrawEnd = z.infer<typeof drawEndSchema>;
export type DrawClear = z.infer<typeof drawClearSchema>;
export type DrawUndo = z.infer<typeof drawUndoSchema>;
export type DrawSync = z.infer<typeof drawSyncSchema>;

export interface ClientToServerEvents {
  [SOCKET_EVENTS.drawStart]: (
    payload: DrawStart,
    ack: RoomAck<DrawingReceipt>,
  ) => void;
  [SOCKET_EVENTS.drawPoints]: (payload: DrawPoints) => void;
  [SOCKET_EVENTS.drawEnd]: (
    payload: DrawEnd,
    ack: RoomAck<DrawingReceipt>,
  ) => void;
  [SOCKET_EVENTS.drawClear]: (
    payload: DrawClear,
    ack: RoomAck<DrawingReceipt>,
  ) => void;
  [SOCKET_EVENTS.drawUndo]: (
    payload: DrawUndo,
    ack: RoomAck<DrawingUndone>,
  ) => void;
  [SOCKET_EVENTS.drawSync]: (
    payload: DrawSync,
    ack: RoomAck<DrawingSnapshot>,
  ) => void;
  [SOCKET_EVENTS.ping]: (payload: Ping) => void;
  [SOCKET_EVENTS.roomCreate]: (
    payload: RoomCreate,
    ack: RoomAck<RoomSession>,
  ) => void;
  [SOCKET_EVENTS.roomJoin]: (
    payload: RoomJoin,
    ack: RoomAck<RoomSession>,
  ) => void;
  [SOCKET_EVENTS.roomLeave]: (payload: RoomLeave, ack: RoomAck<null>) => void;
  [SOCKET_EVENTS.roomRejoin]: (
    payload: RoomRejoin,
    ack: RoomAck<RoomSession>,
  ) => void;
  [SOCKET_EVENTS.gameStart]: (
    payload: GameStart,
    ack: RoomAck<PublicGameState>,
  ) => void;
  [SOCKET_EVENTS.gameRestart]: (
    payload: GameRestart,
    ack: RoomAck<PublicGameState>,
  ) => void;
  [SOCKET_EVENTS.gameGetState]: (
    payload: GameRoomRequest,
    ack: RoomAck<GameView>,
  ) => void;
  [SOCKET_EVENTS.wordChoose]: (
    payload: WordChoose,
    ack: RoomAck<PublicGameState>,
  ) => void;
  [SOCKET_EVENTS.guessSubmit]: (
    payload: GuessSubmit,
    ack: RoomAck<GuessReceipt>,
  ) => void;
}

export interface ServerToClientEvents {
  [SOCKET_EVENTS.drawStart]: (stroke: DrawingStarted) => void;
  [SOCKET_EVENTS.drawPoints]: (batch: DrawingBatch) => void;
  [SOCKET_EVENTS.drawEnd]: (stroke: DrawingEnded) => void;
  [SOCKET_EVENTS.drawClear]: (receipt: DrawingReceipt) => void;
  [SOCKET_EVENTS.drawUndo]: (event: DrawingUndone) => void;
  [SOCKET_EVENTS.pong]: (payload: Pong) => void;
  [SOCKET_EVENTS.roomUpdated]: (payload: RoomUpdated) => void;
  [SOCKET_EVENTS.roomClosed]: (payload: RoomClosed) => void;
  [SOCKET_EVENTS.gameState]: (game: PublicGameState) => void;
  [SOCKET_EVENTS.wordOptions]: (options: WordOptions) => void;
  [SOCKET_EVENTS.wordConfirmed]: (confirmation: WordConfirmed) => void;
  [SOCKET_EVENTS.guessMessage]: (message: GuessMessage) => void;
  [SOCKET_EVENTS.guessPlayerCorrect]: (notice: GuessNotice) => void;
}
