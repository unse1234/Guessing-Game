import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import {
  ROOM_CAPACITY,
  ROOM_RECONNECT_GRACE_MS,
  roomError,
  type GameStatus,
  type RoomError,
  type RoomResponse,
  type RoomSession,
  type RoomSnapshot,
} from '@draw-and-guess/shared';

interface Room {
  code: string;
  hostId: string | null;
  players: Map<string, Membership>;
  status: GameStatus;
  gameGeneration: number;
  revision: number;
}

interface Membership {
  room: Room;
  id: string;
  nickname: string;
  token: string;
  socketId: string | null;
  creator: boolean;
}

export type RoomChange =
  { kind: 'updated'; room: RoomSnapshot } | { kind: 'closed'; code: string };

type MembershipResult =
  | { ok: true; data: RoomSession; changed: boolean; replacedSocketId?: string }
  | RoomError;

const codeAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

@Injectable()
export class RoomsService implements OnModuleDestroy {
  private readonly rooms = new Map<string, Room>();
  private readonly connections = new Map<string, Membership>();
  private readonly sessions = new Map<string, Membership>();
  // Each disconnect gets the same grace period, so insertion order is expiry order.
  private readonly pending = new Map<Membership, number>();
  private expiryTimer?: ReturnType<typeof setTimeout>;
  private scheduledDeadline?: number;
  private expiryListener?: (change: RoomChange) => void;
  private readonly closedListeners = new Set<(code: string) => void>();
  private readonly removalListeners = new Set<
    (code: string, playerId: string) => void
  >();

  onExpiry(listener: (change: RoomChange) => void) {
    this.expiryListener = listener;
  }

  onRoomClosed(listener: (code: string) => void) {
    this.closedListeners.add(listener);
    return () => {
      this.closedListeners.delete(listener);
    };
  }

  onPlayerRemoved(listener: (code: string, playerId: string) => void) {
    this.removalListeners.add(listener);
    return () => this.removalListeners.delete(listener);
  }

  getConnection(socketId: string) {
    const member = this.connections.get(socketId);
    return member ? { code: member.room.code, playerId: member.id } : undefined;
  }

  authorize(socketId: string, code: string): RoomResponse<string> {
    if (!this.rooms.has(code)) return roomError('ROOM_NOT_FOUND');
    const member = this.connections.get(socketId);
    return member?.room.code === code
      ? { ok: true, data: member.id }
      : roomError('NOT_IN_ROOM');
  }

  getSnapshot(code: string) {
    const room = this.rooms.get(code);
    return room ? this.snapshot(room) : undefined;
  }

  transitionGameStatus(code: string, from: GameStatus, to: GameStatus) {
    const room = this.rooms.get(code);
    if (room?.status !== from) return;
    room.status = to;
    if (to !== 'finished') room.gameGeneration++;
    room.revision++;
    return this.snapshot(room);
  }

  getPlayerSocket(code: string, playerId: string) {
    return this.rooms.get(code)?.players.get(playerId)?.socketId;
  }

  getPlayerName(code: string, playerId: string) {
    return this.rooms.get(code)?.players.get(playerId)?.nickname;
  }

  create(socketId: string, nickname: string): MembershipResult {
    const current = this.connections.get(socketId);
    if (current) {
      return current.creator && current.nickname === nickname
        ? this.result(current, false)
        : roomError('ALREADY_IN_ROOM');
    }

    let code: string;
    do {
      code = Array.from(
        { length: 6 },
        () => codeAlphabet[randomInt(codeAlphabet.length)],
      ).join('');
    } while (this.rooms.has(code));

    const room: Room = {
      code,
      hostId: null,
      players: new Map(),
      status: 'waiting',
      gameGeneration: 0,
      revision: 0,
    };
    this.rooms.set(code, room);
    return this.add(room, socketId, nickname, true);
  }

  join(socketId: string, code: string, nickname: string): MembershipResult {
    const current = this.connections.get(socketId);
    if (current) {
      return current.room.code === code && current.nickname === nickname
        ? this.result(current, false)
        : roomError('ALREADY_IN_ROOM');
    }

    const room = this.rooms.get(code);
    if (!room) return roomError('ROOM_NOT_FOUND');
    if (room.status !== 'waiting') return roomError('GAME_STARTED');
    if (room.players.size >= ROOM_CAPACITY) return roomError('ROOM_FULL');

    return this.add(room, socketId, nickname, false);
  }

  rejoin(socketId: string, code: string, token: string): MembershipResult {
    const member = this.sessions.get(token);
    const deadline = member && this.pending.get(member);
    if (
      !member ||
      member.room.code !== code ||
      (deadline !== undefined && deadline <= performance.now())
    ) {
      return roomError('SESSION_EXPIRED');
    }

    const current = this.connections.get(socketId);
    if (current && current !== member) return roomError('ALREADY_IN_ROOM');
    if (current === member) return this.result(member, false);

    const replacedSocketId = member.socketId;
    if (replacedSocketId) this.connections.delete(replacedSocketId);
    member.socketId = socketId;
    this.connections.set(socketId, member);
    if (this.pending.delete(member)) this.scheduleExpiry();

    const changed = !replacedSocketId || member.room.hostId === null;
    member.room.hostId ??= member.id;
    if (changed) member.room.revision++;
    return {
      ...this.result(member, changed),
      replacedSocketId: replacedSocketId ?? undefined,
    };
  }

  leave(socketId: string): RoomChange | RoomError {
    const member = this.connections.get(socketId);
    if (!member) return roomError('NOT_IN_ROOM');
    return this.remove(member);
  }

  disconnect(socketId: string): RoomChange | undefined {
    const member = this.connections.get(socketId);
    if (!member) return;

    this.connections.delete(socketId);
    member.socketId = null;
    member.room.revision++;
    this.pending.set(member, performance.now() + ROOM_RECONNECT_GRACE_MS);
    this.scheduleExpiry();
    return { kind: 'updated', room: this.snapshot(member.room) };
  }

  onModuleDestroy() {
    clearTimeout(this.expiryTimer);
    this.expiryListener = undefined;
    this.closedListeners.clear();
    this.removalListeners.clear();
    this.pending.clear();
    this.connections.clear();
    this.sessions.clear();
    this.rooms.clear();
  }

  private add(
    room: Room,
    socketId: string,
    nickname: string,
    creator: boolean,
  ) {
    const id = randomUUID();
    const member: Membership = {
      room,
      id,
      nickname,
      socketId,
      creator,
      token: randomBytes(32).toString('base64url'),
    };
    room.players.set(id, member);
    room.hostId ??= id;
    room.revision++;
    this.connections.set(socketId, member);
    this.sessions.set(member.token, member);
    return this.result(member, true);
  }

  private result(member: Membership, changed: boolean) {
    return {
      ok: true as const,
      changed,
      data: {
        room: this.snapshot(member.room),
        playerId: member.id,
        reconnectToken: member.token,
      },
    };
  }

  private snapshot(room: Room): RoomSnapshot {
    return {
      code: room.code,
      hostId: room.hostId,
      status: room.status,
      gameGeneration: room.gameGeneration,
      revision: room.revision,
      players: [...room.players.values()].map(({ id, nickname, socketId }) => ({
        id,
        nickname,
        isHost: room.hostId === id,
        isOnline: socketId !== null,
      })),
    };
  }

  private remove(member: Membership): RoomChange {
    const { room, id, token, socketId } = member;
    if (socketId) this.connections.delete(socketId);
    this.sessions.delete(token);
    this.pending.delete(member);
    room.players.delete(id);

    if (!room.players.size) {
      this.rooms.delete(room.code);
      for (const listener of this.closedListeners) listener(room.code);
      return { kind: 'closed', code: room.code };
    }

    if (room.hostId === id) {
      room.hostId =
        [...room.players.values()].find((player) => player.socketId !== null)
          ?.id ?? null;
    }
    room.revision++;
    for (const listener of this.removalListeners) listener(room.code, id);
    return { kind: 'updated', room: this.snapshot(room) };
  }

  private scheduleExpiry() {
    const deadline = this.pending.values().next().value;
    if (deadline === this.scheduledDeadline) return;
    clearTimeout(this.expiryTimer);
    this.scheduledDeadline = deadline;
    if (deadline !== undefined) {
      this.expiryTimer = setTimeout(
        () => this.expire(),
        Math.ceil(deadline - performance.now()),
      );
      this.expiryTimer.unref();
    }
  }

  private expire() {
    this.scheduledDeadline = undefined;
    const now = performance.now();
    const changes = new Map<string, RoomChange>();
    for (const [member, deadline] of this.pending) {
      if (deadline > now) break;
      changes.set(member.room.code, this.remove(member));
    }
    this.scheduleExpiry();
    for (const change of changes.values()) this.expiryListener?.(change);
  }
}
