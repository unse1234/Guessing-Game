'use client';

import { FeedbackToaster } from '@/components/layout/feedback-toaster';
import { SiteBrand } from '@/components/layout/site-brand';
import { SoundToggle } from '@/components/layout/sound-toggle';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useGameSession } from '@/features/game/hooks/use-game-session';
import { FinalScoreboard } from '@/features/results/components/final-scoreboard';
import { ResultsActions } from '@/features/results/components/results-actions';
import { WinnerAnnouncement } from '@/features/results/components/winner-announcement';
import { retryRoomConnection } from '@/lib/room-client';
import { useRoomStore } from '@/stores/room-store';

export function ResultsScreen({ code }: { code: string }) {
  const { room, playerId, connected, game, syncError, retry } = useGameSession(
    code,
    'results',
  );
  const connection = useRoomStore((state) => state.connection);
  const notice = useRoomStore((state) => state.notice);
  const results = game?.results;
  const winners =
    results?.players
      .filter(({ playerId }) => results.winnerIds.includes(playerId))
      .map(({ nickname }) => nickname) ?? [];
  const status =
    connection === 'offline'
      ? (notice ?? 'Connection interrupted.')
      : !connected
        ? 'Restoring your room session…'
        : !room
          ? (notice ?? 'Join the room to view its results.')
          : (syncError ?? 'Loading final scores…');

  return (
    <main className="flex min-h-dvh w-full items-center justify-center px-3 py-[clamp(0.75rem,3svh,2rem)] sm:px-8">
      <Card className="w-full max-w-240 gap-0 rounded-xl border-0 p-0 ring-1 ring-border shadow-none">
        <header className="mx-4 flex items-center gap-3 border-b px-2 py-[clamp(0.5rem,2.5svh,1.5rem)] text-xl font-semibold sm:mx-6 sm:px-4 sm:text-2xl">
          <div className="flex min-w-0 items-center gap-3">
            <SiteBrand />
          </div>
          <div className="ml-auto">
            <SoundToggle />
          </div>
        </header>
        <div className="grid gap-[clamp(0.75rem,3.5svh,2rem)] px-4 py-[clamp(0.75rem,3.5svh,2rem)] sm:px-8 [@media(min-width:38rem)_and_(max-height:30rem)]:grid-cols-2 [@media(min-width:38rem)_and_(max-height:30rem)]:items-center">
          <div className="min-w-0">
            <WinnerAnnouncement
              winners={winners}
              status={!results ? status : undefined}
            />
            {results?.reason === 'insufficient_players' && (
              <p className="mt-1 text-center text-sm text-muted-foreground">
                The game ended because too few players remained.
              </p>
            )}
            {!results &&
              (connection === 'offline' ||
                (connected && room && syncError)) && (
                <div className="mt-2 text-center">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={
                      connection === 'offline'
                        ? retryRoomConnection
                        : () => void retry()
                    }
                  >
                    Retry
                  </Button>
                </div>
              )}
          </div>
          <div className="min-w-0 [@media(min-width:38rem)_and_(max-height:30rem)]:col-start-2 [@media(min-width:38rem)_and_(max-height:30rem)]:row-span-2 [@media(min-width:38rem)_and_(max-height:30rem)]:row-start-1">
            <FinalScoreboard code={code} results={results?.players ?? []} />
          </div>
          <ResultsActions
            code={code}
            gameId={results?.gameId ?? null}
            isHost={!!playerId && playerId === room?.hostId}
            isMember={!!playerId}
          />
        </div>
      </Card>
      <FeedbackToaster />
    </main>
  );
}
