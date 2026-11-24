import { MessageCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import styles from './game-screen.module.css';

export function GuessPanel() {
  return (
    <section
      aria-labelledby="game-guesses"
      className={`${styles.guesses} flex min-h-52 min-w-0 flex-col rounded-xl border bg-background/30`}
    >
      <h2
        id="game-guesses"
        className="rounded-t-xl border-b bg-secondary/50 px-3 py-2 text-base font-semibold"
      >
        Guesses
      </h2>
      <div className="min-h-0 flex-1 p-3 text-sm leading-snug text-muted-foreground [contain:size]">
        Guessing will be available in a later phase.
      </div>
      <div className="flex items-center gap-1.5 border-t p-2">
        <div className="relative min-w-0 grow">
          <label htmlFor="game-guess" className="sr-only">
            Your guess
          </label>
          <MessageCircle
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-2 my-auto size-4 text-muted-foreground"
          />
          <Input
            id="game-guess"
            type="text"
            placeholder="Type your guess…"
            disabled
            className="h-10 bg-card pr-2 pl-7 shadow-none"
          />
        </div>
        <Button
          type="button"
          size="icon"
          aria-label="Send guess"
          disabled
          className="size-10 transition-none"
        >
          <Send aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </section>
  );
}
