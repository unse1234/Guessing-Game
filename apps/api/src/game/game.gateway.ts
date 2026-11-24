import {
  gameRoomSchema,
  roomError,
  SOCKET_EVENTS,
  wordChooseSchema,
  type GameView,
  type PublicGameState,
  type RoomAck,
} from '@draw-and-guess/shared';
import {
  Ack,
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayInit,
} from '@nestjs/websockets';
import {
  channel,
  RoomsGateway,
  type RoomServer,
  type RoomSocket,
} from '../rooms/rooms.gateway';
import { RoomsService } from '../rooms/rooms.service';
import { GameService, type GameTransition } from './game.service';

@WebSocketGateway()
export class GameGateway implements OnGatewayInit {
  @WebSocketServer()
  private server!: RoomServer;

  constructor(
    private readonly games: GameService,
    private readonly rooms: RoomsService,
    private readonly roomGateway: RoomsGateway,
  ) {}

  afterInit() {
    this.games.onTransition((event) => this.broadcast(event));
  }

  @SubscribeMessage(SOCKET_EVENTS.gameStart)
  start(
    @ConnectedSocket() socket: RoomSocket,
    @MessageBody() raw: unknown,
    @Ack() ack: RoomAck<PublicGameState>,
  ) {
    if (!this.roomGateway.allow(socket, ack)) return;
    const parsed = gameRoomSchema.safeParse(raw);
    ack(
      parsed.success
        ? this.games.start(socket.id, parsed.data.code)
        : roomError('INVALID_REQUEST'),
    );
  }

  @SubscribeMessage(SOCKET_EVENTS.gameGetState)
  getState(
    @ConnectedSocket() socket: RoomSocket,
    @MessageBody() raw: unknown,
    @Ack() ack: RoomAck<GameView>,
  ) {
    if (!this.roomGateway.allow(socket, ack)) return;
    const parsed = gameRoomSchema.safeParse(raw);
    ack(
      parsed.success
        ? this.games.getView(socket.id, parsed.data.code)
        : roomError('INVALID_REQUEST'),
    );
  }

  @SubscribeMessage(SOCKET_EVENTS.wordChoose)
  choose(
    @ConnectedSocket() socket: RoomSocket,
    @MessageBody() raw: unknown,
    @Ack() ack: RoomAck<PublicGameState>,
  ) {
    if (!this.roomGateway.allow(socket, ack)) return;
    const parsed = wordChooseSchema.safeParse(raw);
    if (!parsed.success) {
      ack(roomError('INVALID_REQUEST'));
      return;
    }
    const { code, revision, word } = parsed.data;
    ack(this.games.choose(socket.id, code, revision, word));
  }

  private broadcast({ game, privateWord, room }: GameTransition) {
    if (room) this.roomGateway.broadcast({ kind: 'updated', room });
    this.server.to(channel(game.roomCode)).emit(SOCKET_EVENTS.gameState, game);
    if (!privateWord) return;

    const drawerSocket = this.rooms.getPlayerSocket(
      game.roomCode,
      privateWord.drawerId,
    );
    if (!drawerSocket) return;
    if (privateWord.kind === 'options') {
      this.server.to(drawerSocket).emit(SOCKET_EVENTS.wordOptions, privateWord);
    } else {
      this.server
        .to(drawerSocket)
        .emit(SOCKET_EVENTS.wordConfirmed, privateWord);
    }
  }
}
