import { SiteBrand } from '@/components/layout/site-brand';
import { Card } from '@/components/ui/card';
import { HomeActions } from '@/features/home/components/home-actions';

export function HomeScreen() {
  return (
    <main className="flex min-h-dvh w-full items-center justify-center px-4 py-[clamp(0.75rem,3svh,2rem)] sm:px-8">
      <Card className="w-full max-w-240 gap-0 rounded-xl border-0 p-0 ring-1 ring-border shadow-none">
        <header className="mx-4 flex items-center gap-3 border-b px-2 py-[clamp(0.5rem,2.5svh,1.5rem)] text-xl font-semibold sm:mx-6 sm:px-4 sm:text-2xl">
          <SiteBrand />
        </header>

        <div className="px-6 py-[clamp(1rem,calc(14svh_-_2rem),7rem)] sm:px-10">
          <h1 className="text-center text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
            Draw &amp; Guess
          </h1>
          <p className="mt-3 text-center text-base text-muted-foreground">
            A multiplayer drawing and guessing game.
          </p>

          <HomeActions />
        </div>
      </Card>
    </main>
  );
}
