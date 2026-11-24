'use client';

import { useCallback, useState } from 'react';
import { Card } from '@/components/ui/card';
import { ChooseWordDialog } from '@/features/game/components/choose-word-dialog';
import { DrawingBoard } from '@/features/game/components/drawing-board';
import { GameHeader } from '@/features/game/components/game-header';
import { GuessPanel } from '@/features/game/components/guess-panel';
import { PlayersPanel } from '@/features/game/components/players-panel';
import { WordTimer } from '@/features/game/components/word-timer';
import { mockPlayers, type DemoWord } from '@/features/game/data/mock-game';
import styles from './game-screen.module.css';

interface GameScreenProps {
  code: string;
  role: 'drawer' | 'guesser';
  allowWordPreview: boolean;
}

export function GameScreen({ code, role, allowWordPreview }: GameScreenProps) {
  const isDrawer = role === 'drawer';
  const [word, setWord] = useState<DemoWord | null>(null);
  const choosing = isDrawer && word === null;

  const chooseWord = useCallback((choice: DemoWord) => {
    setWord((current) => current ?? choice);
  }, []);

  return (
    <main className="flex min-h-dvh w-full items-center justify-center px-3 py-[clamp(0.5rem,1.8svh,1.5rem)] sm:px-5">
      <h1 className="sr-only">Draw &amp; Guess Game</h1>
      <Card className="w-full max-w-350 gap-0 rounded-xl border-0 p-0 ring-1 ring-border shadow-none">
        <GameHeader code={code} playerCount={mockPlayers.length} />
        <div className={`${styles.gameGrid} p-2.5 sm:p-3`}>
          <PlayersPanel players={mockPlayers} />
          <section
            aria-label="Drawing area"
            className={`${styles.drawing} grid min-w-0 content-start gap-2`}
          >
            <WordTimer
              word={isDrawer ? word : null}
              running={!choosing}
              onReopen={
                isDrawer && allowWordPreview && !choosing
                  ? () => setWord(null)
                  : undefined
              }
            />
            <DrawingBoard
              canDraw={isDrawer && !choosing}
              showSample={!isDrawer}
            />
          </section>
          <GuessPanel canGuess={!isDrawer} />
        </div>
      </Card>
      {choosing && <ChooseWordDialog onChoose={chooseWord} />}
    </main>
  );
}
