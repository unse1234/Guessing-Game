import { Palette, Plus, User, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function Home() {
  return (
    <main className="flex min-h-svh w-full items-center justify-center px-4 py-8 sm:px-8">
      <Card className="w-full max-w-240 gap-0 rounded-xl border-0 p-0 ring-1 ring-border shadow-none">
        <header className="mx-4 flex items-center gap-3 border-b px-2 py-5 text-xl font-semibold sm:mx-6 sm:px-4 sm:py-6 sm:text-2xl">
          <Palette aria-hidden="true" className="size-7 shrink-0 sm:size-8" />
          <span>Draw &amp; Guess</span>
        </header>

        <div className="px-6 py-14 sm:px-10 sm:py-24 lg:py-28">
          <h1 className="text-center text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
            Draw &amp; Guess
          </h1>
          <p className="mt-3 text-center text-base text-muted-foreground">
            A multiplayer drawing and guessing game.
          </p>

          <div className="mx-auto mt-8 max-w-160 sm:mt-10">
            <label htmlFor="nickname" className="sr-only">
              Nickname
            </label>
            <div className="relative">
              <User
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-4 my-auto size-5"
              />
              <Input
                id="nickname"
                name="nickname"
                type="text"
                autoComplete="nickname"
                placeholder="Enter your nickname"
                className="h-12 bg-card pr-4 pl-11 shadow-none transition-none focus-visible:ring-highlight md:text-base"
              />
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Button
                type="button"
                aria-disabled="true"
                className="h-12 text-base font-semibold transition-none hover:bg-primary"
              >
                <Plus aria-hidden="true" className="size-5" />
                Create Room
              </Button>
              <Button
                type="button"
                variant="secondary"
                aria-disabled="true"
                className="h-12 text-base font-semibold transition-none hover:bg-secondary"
              >
                <Users aria-hidden="true" className="size-5" />
                Join Room
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </main>
  );
}
