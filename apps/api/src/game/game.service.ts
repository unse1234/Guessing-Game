import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import {
  roomError,
  type GamePhase,
  type GameView,
  type PrivateGameWord,
  type PublicGameState,
  type RoomResponse,
  type RoomSnapshot,
} from '@draw-and-guess/shared';
import { RoomsService } from '../rooms/rooms.service';
import { pickWordOptions } from './word-bank';

const selectionMs = 15_000;
const drawingMs = 60_000;

interface ActiveGame {
  code: string;
  drawerId: string;
  totalTurns: number;
  phase: Exclude<GamePhase, 'waiting'>;
  revision: number;
  deadline: number | null;
  options: readonly [string, string, string];
  selectedWord: string | null;
  timer?: ReturnType<typeof setTimeout>;
}

export interface GameTransition {
  game: PublicGameState;
  privateWord?: PrivateGameWord;
  room?: RoomSnapshot;
}

@Injectable()
export class GameService implements OnModuleDestroy {
  private readonly games = new Map<string, ActiveGame>();
  private readonly unsubscribe: () => void;
  private publish?: (transition: GameTransition) => void;

  constructor(private readonly rooms: RoomsService) {
    this.unsubscribe = rooms.onRoomClosed((code) => this.removeGame(code));
  }

  onTransition(publish: (transition: GameTransition) => void) {
    this.publish = publish;
  }

  start(socketId: string, code: string): RoomResponse<PublicGameState> {
    const player = this.rooms.authorize(socketId, code);
    if (!player.ok) return player;

    const room = this.rooms.getSnapshot(code);
    if (!room) return roomError('ROOM_NOT_FOUND');
    if (room.hostId !== player.data) return roomError('NOT_HOST');
    if (room.status !== 'waiting' || this.games.has(code))
      return roomError('GAME_STARTED');

    const eligible = room.players.filter((member) => member.isOnline);
    if (eligible.length < 2) return roomError('NOT_ENOUGH_PLAYERS');

    const game: ActiveGame = {
      code,
      drawerId: eligible[0].id,
      totalTurns: eligible.length,
      phase: 'word_selection',
      revision: 1,
      deadline: Date.now() + selectionMs,
      options: pickWordOptions(),
      selectedWord: null,
    };
    const playingRoom = this.rooms.markPlaying(code);
    if (!playingRoom) return roomError('GAME_STARTED');

    this.games.set(code, game);
    this.schedule(game);
    const snapshot = this.snapshot(game);
    this.publish?.({
      game: snapshot,
      privateWord: this.privateWord(game),
      room: playingRoom,
    });
    return { ok: true, data: snapshot };
  }

  choose(
    socketId: string,
    code: string,
    revision: number,
    word: string,
  ): RoomResponse<PublicGameState> {
    const player = this.rooms.authorize(socketId, code);
    if (!player.ok) return player;

    const game = this.games.get(code);
    if (!game) return roomError('WRONG_PHASE');
    if (game.drawerId !== player.data) return roomError('NOT_DRAWER');
    if (game.phase !== 'word_selection' || game.revision !== revision)
      return roomError('WRONG_PHASE');
    if (game.deadline !== null && Date.now() >= game.deadline) {
      this.advanceIfDue(game);
      return roomError('DEADLINE_PASSED');
    }
    if (!game.options.includes(word)) return roomError('INVALID_WORD');

    return { ok: true, data: this.beginDrawing(game, word) };
  }

  getView(socketId: string, code: string): RoomResponse<GameView> {
    const player = this.rooms.authorize(socketId, code);
    if (!player.ok) return player;

    const game = this.games.get(code);
    if (!game) {
      return {
        ok: true,
        data: {
          game: {
            roomCode: code,
            phase: 'waiting',
            revision: 0,
            currentDrawerId: null,
            currentTurn: 0,
            totalTurns: 0,
            phaseEndsAt: null,
            maskedWord: null,
            serverTime: Date.now(),
          },
        },
      };
    }
    this.advanceIfDue(game);

    const view: GameView = { game: this.snapshot(game) };
    if (player.data === game.drawerId) {
      const word = this.privateWord(game);
      if (word) view.privateWord = word;
    }
    return { ok: true, data: view };
  }

  onModuleDestroy() {
    this.unsubscribe();
    this.publish = undefined;
    for (const game of this.games.values()) clearTimeout(game.timer);
    this.games.clear();
  }

  private removeGame(code: string) {
    const game = this.games.get(code);
    if (game) clearTimeout(game.timer);
    this.games.delete(code);
  }

  private beginDrawing(game: ActiveGame, word: string) {
    game.selectedWord = word;
    game.phase = 'drawing';
    game.revision++;
    game.deadline = Date.now() + drawingMs;
    this.schedule(game);
    const snapshot = this.snapshot(game);
    this.publish?.({ game: snapshot, privateWord: this.privateWord(game) });
    return snapshot;
  }

  private advanceIfDue(game: ActiveGame) {
    if (game.deadline === null || Date.now() < game.deadline) return;

    if (game.phase === 'word_selection') {
      this.beginDrawing(game, game.options[0]);
    } else if (game.phase === 'drawing') {
      clearTimeout(game.timer);
      game.timer = undefined;
      game.phase = 'turn_ended';
      game.revision++;
      game.deadline = null;
      this.publish?.({ game: this.snapshot(game) });
    }
  }

  private schedule(game: ActiveGame) {
    clearTimeout(game.timer);
    const deadline = game.deadline;
    if (deadline === null) return;
    const revision = game.revision;
    game.timer = setTimeout(
      () => {
        if (this.games.get(game.code) !== game || game.revision !== revision)
          return;
        if (Date.now() < deadline) this.schedule(game);
        else this.advanceIfDue(game);
      },
      Math.max(0, deadline - Date.now()),
    );
    game.timer.unref?.();
  }

  private snapshot(game: ActiveGame): PublicGameState {
    return {
      roomCode: game.code,
      revision: game.revision,
      phase: game.phase,
      currentDrawerId: game.drawerId,
      currentTurn: 1,
      totalTurns: game.totalTurns,
      phaseEndsAt: game.deadline,
      maskedWord: game.selectedWord?.replace(/\p{L}/gu, '_') ?? null,
      serverTime: Date.now(),
    };
  }

  private privateWord(game: ActiveGame): PrivateGameWord | undefined {
    const scope = {
      roomCode: game.code,
      revision: game.revision,
      drawerId: game.drawerId,
    };
    if (game.phase === 'word_selection')
      return { ...scope, kind: 'options', options: game.options };
    if (game.phase === 'drawing' && game.selectedWord)
      return { ...scope, kind: 'confirmed', word: game.selectedWord };
  }
}
