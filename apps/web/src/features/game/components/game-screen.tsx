'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChooseWordDialog } from '@/features/game/components/choose-word-dialog';
import { DrawingBoard } from '@/features/game/components/drawing-board';
import { GameHeader } from '@/features/game/components/game-header';
import { GuessPanel } from '@/features/game/components/guess-panel';
import { PlayersPanel } from '@/features/game/components/players-panel';
import {
  DeadlineClock,
  WordTimer,
} from '@/features/game/components/word-timer';
import { useGameSession } from '@/features/game/hooks/use-game-session';
import { retryRoomConnection } from '@/lib/room-client';
import { useGameStore } from '@/stores/game-store';
import { useRoomStore } from '@/stores/room-store';
import styles from './game-screen.module.css';

const emptyPlayers = [] as const;
const phaseLabels = {
  waiting: 'Waiting for the host',
  word_selection: 'Word selection',
  drawing: 'Drawing',
  turn_ended: 'Turn ended',
};

export function GameScreen({ code }: { code: string }) {
  const { room, playerId, connected, game, guessReady, syncError, retry } =
    useGameSession(code);
  const connection = useRoomStore((state) => state.connection);
  const notice = useRoomStore((state) => state.notice);
  const privateWord = useGameStore((state) =>
    state.privateWord?.roomCode === code ? state.privateWord : null,
  );
  const players = room?.players ?? emptyPlayers;
  const drawerId = game?.currentDrawerId ?? null;
  const isDrawer = drawerId !== null && drawerId === playerId;
  const drawer = players.find((player) => player.id === drawerId);
  const selecting = game?.phase === 'word_selection';
  const drawing = game?.phase === 'drawing';
  const deadline = game?.phaseEndsAt ?? null;
  const choices =
    isDrawer && privateWord?.kind === 'options' ? privateWord : null;
  const word =
    isDrawer && privateWord?.kind === 'confirmed' ? privateWord.word : null;
  const needsRoom = connected && room === null;
  const awaitingGame =
    !game || (game.phase === 'waiting' && room?.status === 'playing');
  const activeError =
    connected && room && (awaitingGame || !guessReady) ? syncError : null;
  const status = !connected
    ? connection === 'offline'
      ? (notice ?? 'Connection interrupted.')
      : 'Restoring game connection…'
    : needsRoom
      ? (notice ?? 'Join the room to access its game.')
      : activeError
        ? activeError
        : game && !awaitingGame
          ? phaseLabels[game.phase]
          : 'Loading game…';

  return (
    <main className="flex min-h-dvh w-full items-center justify-center px-3 py-[clamp(0.5rem,1.8svh,1.5rem)] sm:px-5">
      <h1 className="sr-only">Draw &amp; Guess Game</h1>
      <Card className="w-full max-w-350 gap-0 rounded-xl border-0 p-0 ring-1 ring-border shadow-none">
        <GameHeader
          code={code}
          playerCount={players.length}
          turn={game?.currentTurn ?? 0}
          totalTurns={game?.totalTurns ?? 0}
        />
        <div className={`${styles.gameGrid} p-2.5 sm:p-3`}>
          <PlayersPanel players={players} drawerId={drawerId} />
          <section
            aria-label="Drawing area"
            className={`${styles.drawing} grid min-w-0 content-start gap-2`}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <p role="status" className="min-w-0 wrap-anywhere">
                {status}
                {drawer && connected ? ` · Drawer: ${drawer.nickname}` : ''}
              </p>
              {needsRoom && (
                <Link className="font-medium underline" href={`/room/${code}`}>
                  Go to lobby
                </Link>
              )}
              {(connection === 'offline' || activeError) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={
                    connection === 'offline'
                      ? retryRoomConnection
                      : () => void retry()
                  }
                >
                  Retry
                </Button>
              )}
            </div>
            <WordTimer
              word={word ?? game?.revealedWord ?? null}
              mask={game?.maskedWord ?? null}
              deadline={selecting ? null : deadline}
            />
            <div className="relative min-w-0">
              <DrawingBoard
                code={code}
                turnId={
                  drawing || game?.phase === 'turn_ended'
                    ? (game?.turnId ?? null)
                    : null
                }
                connected={connected}
                canDraw={connected && drawing && isDrawer}
                readOnly={!isDrawer}
              />
              {connected && selecting && !choices && deadline !== null && (
                <div className="absolute inset-0 grid place-content-center justify-items-center gap-2 rounded-md border bg-card p-3 text-center">
                  <p className="font-medium wrap-anywhere">
                    {isDrawer
                      ? 'Loading your word choices…'
                      : drawer
                        ? `${drawer.nickname} is choosing a word…`
                        : 'The drawer is choosing a word…'}
                  </p>
                  <DeadlineClock key={deadline} deadline={deadline} />
                </div>
              )}
            </div>
          </section>
          <GuessPanel
            key={`${code}:${playerId}`}
            code={code}
            isDrawer={isDrawer}
          />
        </div>
      </Card>
      {connected && selecting && choices && deadline !== null && (
        <ChooseWordDialog
          key={choices.revision}
          choices={choices}
          deadline={deadline}
        />
      )}
    </main>
  );
}
