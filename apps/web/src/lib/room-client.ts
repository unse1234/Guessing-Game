import {
  roomError,
  roomRejoinSchema,
  SOCKET_EVENTS,
  type RoomCredential,
  type RoomResponse,
  type RoomSession,
  type RoomSnapshot,
} from '@draw-and-guess/shared';
import { playGameSound } from '@/lib/game-audio';
import { bindGameEvents } from '@/lib/game-client';
import { getGameSocket } from '@/lib/socket';
import { resetGameSession } from '@/stores/game-store';
import { useRoomStore } from '@/stores/room-store';

type GameSocket = ReturnType<typeof getGameSocket>;
const timeout = 5_000;
const storageKey = 'draw-and-guess.room-session';
const state = useRoomStore;
let client: GameSocket | undefined;
let credential: RoomCredential | null = null;
let restoring: { socketId: string; task: Promise<void> } | undefined;
let earlyRoom: RoomSnapshot | null = null;

function loadCredential() {
  try {
    const stored = sessionStorage.getItem(storageKey);
    const result = roomRejoinSchema.safeParse(stored && JSON.parse(stored));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function saveCredential(value: RoomCredential | null) {
  credential = value;
  try {
    if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
    else sessionStorage.removeItem(storageKey);
  } catch {
    // Storage can be blocked. The current tab can still use its in-memory credential.
  }
}

function acceptSession(session: RoomSession) {
  const { playerId, reconnectToken } = session;
  let room = session.room;
  // An update can arrive in the same packet batch as the membership ACK.
  if (
    earlyRoom?.code === room.code &&
    earlyRoom.revision > room.revision &&
    earlyRoom.players.some((player) => player.id === playerId)
  ) {
    room = earlyRoom;
  }
  earlyRoom = null;
  const sameMembership =
    credential?.code === room.code &&
    credential.reconnectToken === reconnectToken;
  if (!sameMembership) {
    resetGameSession();
    saveCredential({ code: room.code, reconnectToken });
  }
  state.setState((current) => ({
    room:
      sameMembership &&
      current.room?.code === room.code &&
      current.room.revision >= room.revision
        ? current.room
        : room,
    playerId,
    sessionCode: room.code,
    notice: null,
  }));
}

function forgetSession(notice: string | null = null) {
  earlyRoom = null;
  resetGameSession();
  saveCredential(null);
  state.setState({ room: null, playerId: null, sessionCode: null, notice });
}

function restoreRoom(socket: GameSocket, saved: RoomCredential) {
  const socketId = socket.id;
  if (!socket.connected || !socketId) return;
  if (restoring?.socketId === socketId) return restoring.task;

  state.setState({ connection: 'rejoining', notice: null });
  const task = (async () => {
    try {
      const result = await socket
        .timeout(timeout)
        .emitWithAck(SOCKET_EVENTS.roomRejoin, saved);
      if (socket.id !== socketId || credential !== saved) return;

      if (result.ok) {
        acceptSession(result.data);
        state.setState({ connection: 'connected' });
      } else if (result.error.code === 'SESSION_EXPIRED') {
        forgetSession(result.error.message);
        state.setState({ connection: 'connected' });
      } else {
        state.setState({ connection: 'offline', notice: result.error.message });
      }
    } catch {
      if (socket.id === socketId && credential === saved) {
        state.setState({
          connection: 'offline',
          notice: roomError('SERVER_UNAVAILABLE').error.message,
        });
      }
    } finally {
      if (restoring?.socketId === socketId) restoring = undefined;
    }
  })();
  restoring = { socketId, task };
  return task;
}

function getRoomClient() {
  if (client) return client;

  const socket = getGameSocket();
  client = socket;
  credential = loadCredential();
  state.setState({ sessionCode: credential?.code ?? null });
  bindGameEvents(socket);

  socket.on('connect', () => {
    if (credential) void restoreRoom(socket, credential);
    else state.setState({ connection: 'connected' });
  });
  socket.on('disconnect', () => {
    earlyRoom = null;
    state.setState({ connection: 'offline' });
    resetGameSession();
  });
  socket.on('connect_error', () => state.setState({ connection: 'offline' }));
  socket.io.on('reconnect_attempt', () =>
    state.setState({ connection: 'connecting' }),
  );
  socket.on(SOCKET_EVENTS.roomUpdated, ({ room, sentAt }) => {
    const { room: current, connection } = state.getState();
    if (current?.code !== room.code) {
      if (earlyRoom?.code !== room.code || earlyRoom.revision < room.revision)
        earlyRoom = room;
      return;
    }
    if (current.revision >= room.revision) return;

    state.setState({ room });
    if (
      connection === 'connected' &&
      room.players.some(
        (player) =>
          player.isOnline &&
          !current.players.some(({ id }) => id === player.id),
      )
    ) {
      playGameSound('join', room.code);
    }
    if (process.env.NODE_ENV === 'development' && sentAt !== undefined) {
      console.debug(
        `[rooms] update propagation: ${Date.now() - sentAt} ms (wall clock)`,
      );
    }
  });
  socket.on(SOCKET_EVENTS.roomClosed, ({ code, reason }) => {
    if (credential?.code !== code) return;
    forgetSession(
      reason === 'session_replaced'
        ? 'This room session was opened in another tab.'
        : 'This room is closed.',
    );
    if (socket.connected) state.setState({ connection: 'connected' });
  });

  return socket;
}

export function startRoomClient() {
  try {
    const socket = getRoomClient();
    if (!socket.connected && !socket.active) {
      state.setState({ connection: 'connecting' });
      socket.connect();
    }
  } catch {
    state.setState({
      connection: 'offline',
      notice: roomError('SERVER_UNAVAILABLE').error.message,
    });
  }
}

export function retryRoomConnection() {
  startRoomClient();
  if (client?.connected && credential) void restoreRoom(client, credential);
}

export function getActiveRoomSocket(code: string) {
  const room = state.getState();
  return client?.connected &&
    room.connection === 'connected' &&
    room.room?.code === code &&
    room.playerId
    ? client
    : undefined;
}

function awaitConnection(socket: GameSocket) {
  if (socket.connected) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('connect_error', finish);
      if (error) reject(error);
      else resolve();
    };
    const onConnect = () => finish();
    const timer = setTimeout(
      () => finish(new Error('Connection timed out')),
      timeout,
    );
    socket.once('connect', onConnect);
    socket.once('connect_error', finish);
    startRoomClient();
  });
}

async function enterRoom(
  label: string,
  request: (socket: GameSocket) => Promise<RoomResponse<RoomSession>>,
): Promise<RoomResponse<RoomSession>> {
  const started = performance.now();
  try {
    const socket = getRoomClient();
    await awaitConnection(socket);
    await restoring?.task;
    if (!socket.connected) return roomError('SERVER_UNAVAILABLE');
    if (credential && state.getState().connection !== 'connected')
      return roomError('SERVER_UNAVAILABLE');

    const socketId = socket.id;
    const result = await request(socket);
    if (result.ok) {
      acceptSession(result.data);
      if (socket.connected && socket.id !== socketId && credential)
        void restoreRoom(socket, credential);
    }
    return result;
  } catch {
    return roomError('SERVER_UNAVAILABLE');
  } finally {
    if (process.env.NODE_ENV === 'development') {
      console.debug(
        `[rooms] ${label} acknowledgement: ${(performance.now() - started).toFixed(1)} ms`,
      );
    }
  }
}

export function createRoom(nickname: string) {
  return enterRoom('create', (socket) =>
    socket.timeout(timeout).emitWithAck(SOCKET_EVENTS.roomCreate, { nickname }),
  );
}

export function joinRoom(code: string, nickname: string) {
  return enterRoom('join', (socket) =>
    socket
      .timeout(timeout)
      .emitWithAck(SOCKET_EVENTS.roomJoin, { code, nickname }),
  );
}

export async function leaveRoom(): Promise<RoomResponse<null>> {
  try {
    const socket = getRoomClient();
    await awaitConnection(socket);
    await restoring?.task;
    if (!socket.connected) return roomError('SERVER_UNAVAILABLE');
    if (state.getState().connection !== 'connected' && credential)
      return roomError('SERVER_UNAVAILABLE');

    const result = await socket
      .timeout(timeout)
      .emitWithAck(SOCKET_EVENTS.roomLeave, {});
    if (result.ok || result.error.code === 'NOT_IN_ROOM') forgetSession();
    return result;
  } catch {
    return roomError('SERVER_UNAVAILABLE');
  }
}
