import { FeedbackToaster } from '@/components/layout/feedback-toaster';
import { SiteBrand } from '@/components/layout/site-brand';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { LobbyActions } from '@/features/lobby/components/lobby-actions';
import { PlayerList } from '@/features/lobby/components/player-list';
import { RoomCode } from '@/features/lobby/components/room-code';
import { mockPlayers } from '@/features/lobby/data/mock-players';

export function LobbyScreen({ code }: { code: string }) {
  return (
    <main className="flex min-h-dvh w-full items-center justify-center px-3 py-[clamp(0.75rem,3svh,2rem)] sm:px-8">
      <Card className="w-full max-w-240 gap-0 rounded-xl border-0 p-0 ring-1 ring-border shadow-none">
        <header className="mx-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-1 py-[clamp(0.5rem,2.5svh,1.5rem)] sm:mx-6 sm:px-4">
          <div className="flex min-w-0 items-center gap-2 text-lg font-semibold sm:gap-3 sm:text-2xl">
            <SiteBrand />
          </div>
          <Badge
            variant="secondary"
            className="block max-w-full rounded-md px-2.5 py-1 text-sm wrap-anywhere whitespace-normal"
          >
            Room: <strong className="font-semibold">{code}</strong>
          </Badge>
        </header>

        <div className="grid gap-[clamp(0.75rem,2.5svh,1.75rem)] px-4 py-[clamp(0.75rem,3svh,2rem)] sm:px-8">
          <div className="grid gap-[clamp(0.75rem,2.5svh,1.75rem)] [@media(min-width:38rem)_and_(max-height:30rem)]:grid-cols-2 [@media(min-width:38rem)_and_(max-height:30rem)]:items-center">
            <section
              aria-labelledby="lobby-title"
              className="grid min-w-0 gap-[clamp(0.75rem,2.5svh,1.75rem)]"
            >
              <div className="text-center">
                <h1
                  id="lobby-title"
                  className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl"
                >
                  Room Lobby
                </h1>
                <p className="mt-1 text-base text-muted-foreground">
                  Share the room code with your friends to join.
                </p>
              </div>

              <RoomCode code={code} />
            </section>

            <PlayerList players={mockPlayers} />
          </div>

          <LobbyActions />
        </div>
      </Card>
      <FeedbackToaster />
    </main>
  );
}
