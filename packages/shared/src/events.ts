import type { z } from 'zod';
import type {
  pingSchema,
  pongSchema,
  roomCreateSchema,
  roomJoinSchema,
  roomLeaveSchema,
  roomRejoinSchema,
} from './schemas';
import type { RoomAck, RoomClosed, RoomSession, RoomUpdated } from './types';

export const SOCKET_EVENTS = {
  ping: 'ping',
  pong: 'pong',
  roomCreate: 'room:create',
  roomJoin: 'room:join',
  roomLeave: 'room:leave',
  roomRejoin: 'room:rejoin',
  roomUpdated: 'room:updated',
  roomClosed: 'room:closed',
} as const;

export type Ping = z.infer<typeof pingSchema>;
export type Pong = z.infer<typeof pongSchema>;
export type RoomCreate = z.infer<typeof roomCreateSchema>;
export type RoomJoin = z.infer<typeof roomJoinSchema>;
export type RoomLeave = z.infer<typeof roomLeaveSchema>;
export type RoomRejoin = z.infer<typeof roomRejoinSchema>;

export interface ClientToServerEvents {
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
}

export interface ServerToClientEvents {
  [SOCKET_EVENTS.pong]: (payload: Pong) => void;
  [SOCKET_EVENTS.roomUpdated]: (payload: RoomUpdated) => void;
  [SOCKET_EVENTS.roomClosed]: (payload: RoomClosed) => void;
}
