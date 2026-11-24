import { randomUUID } from 'node:crypto';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import {
  GUESS_HISTORY_LIMIT,
  roomError,
  type GamePhase,
  type GameView,
  type GuessActivity,
  type GuessMessage,
  type GuessNotice,
  type GuessReceipt,
  type GuessSubmit,
  type PrivateGameWord,
  type PublicGameState,
  type RoomResponse,
  type RoomSnapshot,
} from '@draw-and-guess/shared';
import { RoomsService } from '../rooms/rooms.service';
import { scoreCorrectGuess } from '../scoring/scoring';
import { pickWordOptions } from './word-bank';

const selectionMs = 15_000;
const drawingMs = 60_000;
const guessBurst = 4;
const guessRefillMs = 500;
const maxRequestsPerPlayer = guessBurst + drawingMs / guessRefillMs;

interface Guesser {
  points: number | null;
  receipts: Map<string, GuessReceipt>;
  tokens: number;
  lastRefill: number;
}

function normalizeGuess(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

interface ActiveGame {
  code: string;
  turnId: string;
  drawerId: string;
  totalTurns: number;
  phase: Exclude<GamePhase, 'waiting'>;
  revision: number;
  deadline: number | null;
  options: readonly [string, string, string];
  selectedWord: string | null;
  normalizedAnswer: string;
  scores: Map<string, number>;
  drawerBonus: number;
  pendingGuessers: Set<string>;
  guessers: Map<string, Guesser>;
  history: GuessMessage[];
  correct: GuessNotice[];
  sequence: number;
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
  private readonly unsubscribeRemoval: () => void;
  private readonly listeners = new Set<(transition: GameTransition) => void>();

  constructor(private readonly rooms: RoomsService) {
    this.unsubscribe = rooms.onRoomClosed((code) => this.removeGame(code));
    this.unsubscribeRemoval = rooms.onPlayerRemoved((code, playerId) => {
      const game = this.games.get(code);
      if (game?.pendingGuessers.delete(playerId)) this.finishIfSolved(game);
    });
  }

  onTransition(publish: (transition: GameTransition) => void) {
    this.listeners.add(publish);
    return () => {
      this.listeners.delete(publish);
    };
  }

  getDrawingTurn(code: string) {
    const game = this.games.get(code);
    if (!game || game.phase === 'word_selection') return;
    return {
      turnId: game.turnId,
      drawerId: game.drawerId,
      writable:
        game.phase === 'drawing' &&
        game.deadline !== null &&
        Date.now() < game.deadline,
    };
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

    const drawerId = eligible[0].id;
    const guesserIds = room.players
      .filter(({ id }) => id !== drawerId)
      .map(({ id }) => id);
    const game: ActiveGame = {
      code,
      turnId: randomUUID(),
      drawerId,
      totalTurns: eligible.length,
      phase: 'word_selection',
      revision: 1,
      deadline: Date.now() + selectionMs,
      options: pickWordOptions(),
      selectedWord: null,
      normalizedAnswer: '',
      scores: new Map(room.players.map(({ id }) => [id, 0])),
      drawerBonus: 0,
      pendingGuessers: new Set(guesserIds),
      guessers: new Map(
        guesserIds.map((id) => [
          id,
          {
            points: null,
            receipts: new Map(),
            tokens: guessBurst,
            lastRefill: performance.now(),
          },
        ]),
      ),
      history: [],
      correct: [],
      sequence: 0,
    };
    const playingRoom = this.rooms.markPlaying(code);
    if (!playingRoom) return roomError('GAME_STARTED');

    this.games.set(code, game);
    this.schedule(game);
    const snapshot = this.snapshot(game);
    this.publish({
      game: snapshot,
      privateWord: this.privateWord(game),
      room: playingRoom,
    });
    return { ok: true, data: snapshot };
  }

  submitGuess(
    socketId: string,
    { code, turnId, requestId, guess }: GuessSubmit,
  ): RoomResponse<{ receipt: GuessReceipt; activity?: GuessActivity }> {
    const member = this.rooms.authorize(socketId, code);
    if (!member.ok) return member;
    const game = this.games.get(code);
    if (!game || game.turnId !== turnId) return roomError('GUESS_CLOSED');
    const playerId = member.data;
    if (playerId === game.drawerId) return roomError('DRAWER_CANNOT_GUESS');
    const player = game.guessers.get(playerId);
    const playerName = this.rooms.getPlayerName(code, playerId);
    if (!player || !playerName) return roomError('NOT_IN_ROOM');

    const previous = player.receipts.get(requestId);
    if (previous) return { ok: true, data: { receipt: previous } };
    const now = Date.now();
    if (game.phase !== 'drawing' || game.deadline === null)
      return roomError('GUESS_CLOSED');
    if (now >= game.deadline) {
      this.finishDrawing(game);
      return roomError('GUESS_CLOSED');
    }
    if (player.points !== null) return roomError('ALREADY_GUESSED');
    if (!this.takeGuessToken(player)) return roomError('RATE_LIMITED');

    const scope = {
      roomCode: code,
      turnId,
      sequence: ++game.sequence,
      playerId,
      playerName,
    };
    const normalized = normalizeGuess(guess);
    if (normalized !== game.normalizedAnswer) {
      const receipt = { correct: false, pointsAwarded: 0 } as const;
      const activity: GuessMessage = {
        ...scope,
        kind: 'message',
        message: normalized.includes(game.normalizedAnswer) ? '…' : guess,
      };
      player.receipts.set(requestId, receipt);
      game.history.push(activity);
      if (game.history.length > GUESS_HISTORY_LIMIT) game.history.shift();
      return { ok: true, data: { receipt, activity } };
    }

    const reward = scoreCorrectGuess(game.deadline - now, game.drawerBonus);
    const receipt = { correct: true, pointsAwarded: reward.guesser } as const;
    const total = game.scores.get(playerId)! + reward.guesser;
    const scores = [{ playerId, points: total }];
    game.scores.set(playerId, total);
    if (reward.drawer) {
      game.drawerBonus += reward.drawer;
      const drawerTotal = game.scores.get(game.drawerId)! + reward.drawer;
      game.scores.set(game.drawerId, drawerTotal);
      scores.push({ playerId: game.drawerId, points: drawerTotal });
    }
    const activity: GuessNotice = { ...scope, kind: 'correct', scores };
    player.receipts.set(requestId, receipt);
    player.points = reward.guesser;
    game.pendingGuessers.delete(playerId);
    game.correct.push(activity);
    this.finishIfSolved(game);
    return { ok: true, data: { receipt, activity } };
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
            turnId: null,
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

    const view: GameView = {
      game: this.snapshot(game),
      guessing: {
        sequence: game.sequence,
        history: game.history.slice(),
        correct: game.correct.slice(),
        scores: Array.from(game.scores, ([playerId, points]) => ({
          playerId,
          points,
        })),
        myPoints: game.guessers.get(player.data)?.points ?? null,
      },
    };
    if (player.data === game.drawerId) {
      const word = this.privateWord(game);
      if (word) view.privateWord = word;
    }
    return { ok: true, data: view };
  }

  onModuleDestroy() {
    this.unsubscribe();
    this.unsubscribeRemoval();
    this.listeners.clear();
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
    game.normalizedAnswer = normalizeGuess(word);
    game.phase = 'drawing';
    game.revision++;
    game.deadline = Date.now() + drawingMs;
    this.schedule(game);
    const snapshot = this.snapshot(game);
    this.publish({ game: snapshot, privateWord: this.privateWord(game) });
    return snapshot;
  }

  private advanceIfDue(game: ActiveGame) {
    if (game.deadline === null || Date.now() < game.deadline) return;

    if (game.phase === 'word_selection') {
      this.beginDrawing(game, game.options[0]);
    } else if (game.phase === 'drawing') {
      this.finishDrawing(game);
    }
  }

  private takeGuessToken(player: Guesser) {
    if (player.receipts.size >= maxRequestsPerPlayer) return false;
    const now = performance.now();
    player.tokens = Math.min(
      guessBurst,
      player.tokens + (now - player.lastRefill) / guessRefillMs,
    );
    player.lastRefill = now;
    if (player.tokens < 1) return false;
    player.tokens--;
    return true;
  }

  private finishIfSolved(game: ActiveGame) {
    if (
      game.phase === 'drawing' &&
      game.correct.length &&
      !game.pendingGuessers.size
    )
      this.finishDrawing(game);
  }

  private finishDrawing(game: ActiveGame) {
    clearTimeout(game.timer);
    game.timer = undefined;
    game.phase = 'turn_ended';
    game.revision++;
    game.deadline = null;
    this.publish({ game: this.snapshot(game) });
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
      turnId: game.turnId,
      revision: game.revision,
      phase: game.phase,
      currentDrawerId: game.drawerId,
      currentTurn: 1,
      totalTurns: game.totalTurns,
      phaseEndsAt: game.deadline,
      maskedWord: game.selectedWord?.replace(/\p{L}/gu, '_') ?? null,
      ...(game.phase === 'turn_ended' && game.selectedWord
        ? { revealedWord: game.selectedWord }
        : {}),
      serverTime: Date.now(),
    };
  }

  private publish(transition: GameTransition) {
    for (const listener of this.listeners) listener(transition);
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
