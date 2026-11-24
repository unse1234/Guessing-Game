import { randomUUID } from 'node:crypto';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import {
  GUESS_HISTORY_LIMIT,
  roomError,
  type FinalGameResults,
  type GamePhase,
  type GameRestart,
  type GameStart,
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
  type TurnEndReason,
  type TurnSummary,
  type WordChoose,
} from '@draw-and-guess/shared';
import { RoomsService } from '../rooms/rooms.service';
import { rankPlayerScores, scoreCorrectGuess } from '../scoring/scoring';
import { gameConfig } from './game-config';
import { pickWordOptions, publicGuessText } from './word-bank';

const guessBurst = 4;
const guessRefillMs = 500;
const maxRequestsPerPlayer = guessBurst + gameConfig.drawingMs / guessRefillMs;

interface Guesser {
  points: number | null;
  receipts: Map<string, GuessReceipt>;
  tokens: number;
  lastRefill: number;
}

function normalizeGuess(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

interface ActiveTurn {
  id: string;
  drawerId: string;
  options: readonly [string, string, string];
  selectedWord: string | null;
  normalizedAnswer: string;
  drawerBonus: number;
  pendingGuessers: Set<string>;
  guessers: Map<string, Guesser>;
  history: GuessMessage[];
  correct: GuessNotice[];
  sequence: number;
  summary?: TurnSummary;
}

interface ActiveGame {
  code: string;
  id: string;
  generation: number;
  roster: { id: string; nickname: string }[];
  eligible: Set<string>;
  slot: number;
  currentTurn: number;
  totalTurns: number;
  turn: ActiveTurn | null;
  usedWords: Set<string>;
  scores: Map<string, number>;
  phase: Exclude<GamePhase, 'waiting'>;
  revision: number;
  deadline: number | null;
  timer?: ReturnType<typeof setTimeout>;
  results?: FinalGameResults;
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
      if (game) this.removePlayer(game, playerId);
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
    if (
      !game?.turn ||
      (game.phase !== 'drawing' && game.phase !== 'turn_summary')
    )
      return;
    return {
      turnId: game.turn.id,
      drawerId: game.turn.drawerId,
      writable:
        game.phase === 'drawing' &&
        game.deadline !== null &&
        Date.now() < game.deadline,
    };
  }

  start(
    socketId: string,
    { code, generation }: GameStart,
  ): RoomResponse<PublicGameState> {
    const player = this.rooms.authorize(socketId, code);
    if (!player.ok) return player;

    const room = this.rooms.getSnapshot(code);
    if (!room) return roomError('ROOM_NOT_FOUND');
    if (room.hostId !== player.data) return roomError('NOT_HOST');
    if (room.status !== 'waiting' || this.games.has(code))
      return roomError('GAME_STARTED');
    if (room.gameGeneration !== generation) return roomError('STALE_GAME');

    if (
      room.players.filter((member) => member.isOnline).length <
      gameConfig.minPlayers
    )
      return roomError('NOT_ENOUGH_PLAYERS');
    const playingRoom = this.rooms.transitionGameStatus(
      code,
      'waiting',
      'playing',
    );
    if (!playingRoom) return roomError('GAME_STARTED');
    const roster = room.players.map(({ id, nickname }) => ({ id, nickname }));
    const game: ActiveGame = {
      code,
      id: randomUUID(),
      generation: playingRoom.gameGeneration,
      roster,
      eligible: new Set(roster.map(({ id }) => id)),
      slot: -1,
      currentTurn: 0,
      totalTurns: roster.length * gameConfig.totalRounds,
      turn: null,
      usedWords: new Set(),
      scores: new Map(roster.map(({ id }) => [id, 0])),
      phase: 'word_selection',
      revision: 0,
      deadline: null,
    };
    this.games.set(code, game);
    return { ok: true, data: this.beginTurn(game, 0, playingRoom) };
  }

  restart(
    socketId: string,
    { code, gameId }: GameRestart,
  ): RoomResponse<PublicGameState> {
    const player = this.rooms.authorize(socketId, code);
    if (!player.ok) return player;
    if (this.rooms.getSnapshot(code)?.hostId !== player.data)
      return roomError('RESTART_HOST_ONLY');
    const game = this.games.get(code);
    if (!game || game.phase !== 'finished')
      return roomError('GAME_NOT_FINISHED');
    if (game.id !== gameId) return roomError('STALE_GAME');
    const room = this.rooms.transitionGameStatus(code, 'finished', 'waiting');
    if (!room) return roomError('GAME_NOT_FINISHED');
    this.removeGame(code);
    const snapshot = this.waitingSnapshot(room);
    this.publish({ game: snapshot, room });
    return { ok: true, data: snapshot };
  }

  submitGuess(
    socketId: string,
    { code, turnId, requestId, guess }: GuessSubmit,
  ): RoomResponse<{ receipt: GuessReceipt; activity?: GuessActivity }> {
    const member = this.rooms.authorize(socketId, code);
    if (!member.ok) return member;
    const game = this.games.get(code);
    const turn = game?.turn;
    if (!game || !turn || turn.id !== turnId) return roomError('GUESS_CLOSED');
    const playerId = member.data;
    if (playerId === turn.drawerId) return roomError('DRAWER_CANNOT_GUESS');
    const player = turn.guessers.get(playerId);
    const playerName = this.rooms.getPlayerName(code, playerId);
    if (!player || !playerName) return roomError('NOT_IN_ROOM');

    const previous = player.receipts.get(requestId);
    if (previous) return { ok: true, data: { receipt: previous } };
    const now = Date.now();
    if (game.phase !== 'drawing' || game.deadline === null)
      return roomError('GUESS_CLOSED');
    if (now >= game.deadline) {
      this.endTurn(game, 'time_expired');
      return roomError('GUESS_CLOSED');
    }
    if (player.points !== null) return roomError('ALREADY_GUESSED');
    if (!this.takeGuessToken(player)) return roomError('RATE_LIMITED');

    const scope = {
      roomCode: code,
      turnId,
      sequence: ++turn.sequence,
      playerId,
      playerName,
    };
    const normalized = normalizeGuess(guess);
    if (normalized !== turn.normalizedAnswer) {
      const receipt = { correct: false, pointsAwarded: 0 } as const;
      const activity: GuessMessage = {
        ...scope,
        kind: 'message',
        message: publicGuessText(guess, normalized),
      };
      player.receipts.set(requestId, receipt);
      turn.history.push(activity);
      if (turn.history.length > GUESS_HISTORY_LIMIT) turn.history.shift();
      return { ok: true, data: { receipt, activity } };
    }

    const reward = scoreCorrectGuess(game.deadline - now, turn.drawerBonus);
    const receipt = { correct: true, pointsAwarded: reward.guesser } as const;
    const total = game.scores.get(playerId)! + reward.guesser;
    const scores = [{ playerId, points: total }];
    game.scores.set(playerId, total);
    if (reward.drawer) {
      turn.drawerBonus += reward.drawer;
      const drawerTotal = game.scores.get(turn.drawerId)! + reward.drawer;
      game.scores.set(turn.drawerId, drawerTotal);
      scores.push({ playerId: turn.drawerId, points: drawerTotal });
    }
    const activity: GuessNotice = { ...scope, kind: 'correct', scores };
    player.receipts.set(requestId, receipt);
    player.points = reward.guesser;
    turn.pendingGuessers.delete(playerId);
    turn.correct.push(activity);
    this.finishIfSolved(game);
    return { ok: true, data: { receipt, activity } };
  }

  choose(
    socketId: string,
    { code, turnId, revision, word }: WordChoose,
  ): RoomResponse<PublicGameState> {
    const player = this.rooms.authorize(socketId, code);
    if (!player.ok) return player;

    const game = this.games.get(code);
    if (!game?.turn || game.turn.id !== turnId) return roomError('WRONG_PHASE');
    if (game.turn.drawerId !== player.data) return roomError('NOT_DRAWER');
    if (game.phase !== 'word_selection' || game.revision !== revision)
      return roomError('WRONG_PHASE');
    if (game.deadline !== null && Date.now() >= game.deadline) {
      this.advanceIfDue(game);
      return roomError('DEADLINE_PASSED');
    }
    if (!game.turn.options.includes(word)) return roomError('INVALID_WORD');

    return { ok: true, data: this.beginDrawing(game, game.turn, word) };
  }

  getView(socketId: string, code: string): RoomResponse<GameView> {
    const player = this.rooms.authorize(socketId, code);
    if (!player.ok) return player;

    const game = this.games.get(code);
    if (!game) {
      const room = this.rooms.getSnapshot(code);
      if (!room) return roomError('ROOM_NOT_FOUND');
      return { ok: true, data: { game: this.waitingSnapshot(room) } };
    }
    this.advanceIfDue(game);

    const view: GameView = { game: this.snapshot(game) };
    const turn = game.turn;
    if (turn) {
      view.guessing = {
        sequence: turn.sequence,
        history: turn.history.slice(),
        correct: turn.correct.slice(),
        scores: Array.from(game.scores, ([playerId, points]) => ({
          playerId,
          points,
        })),
        myPoints: turn.guessers.get(player.data)?.points ?? null,
      };
      if (player.data === turn.drawerId) {
        const word = this.privateWord(game);
        if (word) view.privateWord = word;
      }
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

  private beginTurn(game: ActiveGame, slot: number, room?: RoomSnapshot) {
    const drawerId = game.roster[slot % game.roster.length].id;
    const guesserIds = [...game.eligible].filter((id) => id !== drawerId);
    const options = pickWordOptions(game.usedWords);
    for (const word of options) game.usedWords.add(word);
    game.slot = slot;
    game.currentTurn++;
    const now = performance.now();
    game.turn = {
      id: randomUUID(),
      drawerId,
      options,
      selectedWord: null,
      normalizedAnswer: '',
      drawerBonus: 0,
      pendingGuessers: new Set(guesserIds),
      guessers: new Map(
        guesserIds.map((id) => [
          id,
          {
            points: null,
            receipts: new Map(),
            tokens: guessBurst,
            lastRefill: now,
          },
        ]),
      ),
      history: [],
      correct: [],
      sequence: 0,
    };
    return this.transition(
      game,
      'word_selection',
      gameConfig.selectionMs,
      room,
    );
  }

  private beginDrawing(game: ActiveGame, turn: ActiveTurn, word: string) {
    turn.selectedWord = word;
    turn.normalizedAnswer = normalizeGuess(word);
    return this.transition(game, 'drawing', gameConfig.drawingMs);
  }

  private removePlayer(game: ActiveGame, playerId: string) {
    if (game.phase === 'finished' || !game.eligible.delete(playerId)) return;
    const length = game.roster.length;
    const index = game.roster.findIndex(({ id }) => id === playerId);
    for (
      let slot = index;
      slot < length * gameConfig.totalRounds;
      slot += length
    ) {
      if (slot > game.slot) game.totalTurns--;
    }

    const turn = game.turn;
    if (!turn || game.phase === 'turn_summary') return;
    turn.pendingGuessers.delete(playerId);
    if (turn.drawerId === playerId) this.endTurn(game, 'drawer_left');
    else if (game.eligible.size < gameConfig.minPlayers)
      this.endTurn(game, 'insufficient_players');
    else this.finishIfSolved(game);
  }

  private advanceAfterSummary(game: ActiveGame) {
    if (game.eligible.size < gameConfig.minPlayers) {
      this.finishGame(game, 'insufficient_players');
      return;
    }
    const length = game.roster.length;
    for (
      let slot = game.slot + 1;
      slot < length * gameConfig.totalRounds;
      slot++
    ) {
      if (game.eligible.has(game.roster[slot % length].id)) {
        this.beginTurn(game, slot);
        return;
      }
    }
    this.finishGame(game, 'completed');
  }

  private finishGame(game: ActiveGame, reason: FinalGameResults['reason']) {
    if (game.phase !== 'turn_summary') return;
    const room = this.rooms.transitionGameStatus(
      game.code,
      'playing',
      'finished',
    );
    if (!room) return;
    const players = rankPlayerScores(game.roster, game.scores);
    game.results = {
      roomCode: game.code,
      gameId: game.id,
      players,
      winnerIds: players
        .filter(({ rank }) => rank === 1)
        .map(({ playerId }) => playerId),
      reason,
      finishedAt: Date.now(),
    };
    game.turn = null;
    game.usedWords.clear();
    this.transition(game, 'finished', null, room);
  }

  private advanceIfDue(game: ActiveGame) {
    if (game.deadline === null || Date.now() < game.deadline) return;

    if (game.phase === 'word_selection' && game.turn) {
      this.beginDrawing(game, game.turn, game.turn.options[0]);
    } else if (game.phase === 'drawing') {
      this.endTurn(game, 'time_expired');
    } else if (game.phase === 'turn_summary') {
      this.advanceAfterSummary(game);
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
    const turn = game.turn;
    if (
      game.phase === 'drawing' &&
      turn?.correct.length &&
      !turn.pendingGuessers.size
    )
      this.endTurn(game, 'all_correct');
  }

  private endTurn(game: ActiveGame, reason: TurnEndReason) {
    const turn = game.turn;
    if (!turn || (game.phase !== 'drawing' && game.phase !== 'word_selection'))
      return;
    const awards = game.roster
      .map(({ id, nickname }) => ({
        playerId: id,
        nickname,
        score: game.scores.get(id)!,
        points:
          id === turn.drawerId
            ? turn.drawerBonus
            : (turn.guessers.get(id)?.points ?? 0),
      }))
      .filter(
        ({ playerId, points }) =>
          points || playerId === turn.drawerId || game.eligible.has(playerId),
      );
    awards.sort((a, b) => b.score - a.score);
    turn.summary = { reason, word: turn.selectedWord, awards };
    this.transition(game, 'turn_summary', gameConfig.summaryMs);
  }

  private transition(
    game: ActiveGame,
    phase: ActiveGame['phase'],
    duration: number | null,
    room?: RoomSnapshot,
  ) {
    game.phase = phase;
    game.revision++;
    game.deadline = duration === null ? null : Date.now() + duration;
    this.schedule(game);
    const snapshot = this.snapshot(game);
    this.publish({ game: snapshot, privateWord: this.privateWord(game), room });
    return snapshot;
  }

  private schedule(game: ActiveGame) {
    clearTimeout(game.timer);
    game.timer = undefined;
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
    const turn = game.turn;
    return {
      roomCode: game.code,
      gameId: game.id,
      generation: game.generation,
      turnId: turn?.id ?? null,
      revision: game.revision,
      phase: game.phase,
      currentDrawerId: turn?.drawerId ?? null,
      currentTurn: game.currentTurn,
      totalTurns: game.totalTurns,
      currentRound: Math.floor(game.slot / game.roster.length) + 1,
      totalRounds: gameConfig.totalRounds,
      phaseEndsAt: game.deadline,
      maskedWord:
        game.phase === 'drawing'
          ? (turn?.selectedWord?.replace(/\p{L}/gu, '_') ?? null)
          : null,
      ...(turn?.summary ? { summary: turn.summary } : {}),
      ...(game.results ? { results: game.results } : {}),
      serverTime: Date.now(),
    };
  }

  private waitingSnapshot(room: RoomSnapshot): PublicGameState {
    return {
      roomCode: room.code,
      gameId: null,
      generation: room.gameGeneration,
      turnId: null,
      phase: 'waiting',
      revision: 0,
      currentDrawerId: null,
      currentTurn: 0,
      totalTurns: 0,
      currentRound: 0,
      totalRounds: gameConfig.totalRounds,
      phaseEndsAt: null,
      maskedWord: null,
      serverTime: Date.now(),
    };
  }

  private publish(transition: GameTransition) {
    for (const listener of this.listeners) listener(transition);
  }

  private privateWord(game: ActiveGame): PrivateGameWord | undefined {
    const turn = game.turn;
    if (!turn) return;
    const scope = {
      roomCode: game.code,
      turnId: turn.id,
      revision: game.revision,
      drawerId: turn.drawerId,
    };
    if (game.phase === 'word_selection')
      return { ...scope, kind: 'options', options: turn.options };
    if (game.phase === 'drawing' && turn.selectedWord)
      return { ...scope, kind: 'confirmed', word: turn.selectedWord };
  }
}
