'use client';

import { MessageCircle, Send } from 'lucide-react';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { mockGuesses, type Guess } from '@/features/game/data/mock-game';
import styles from './game-screen.module.css';

const maxGuessLength = 100;

export function GuessPanel({ canGuess }: { canGuess: boolean }) {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<readonly Guess[]>(mockGuesses);
  const log = useRef<HTMLDivElement>(null);
  const sequence = useRef(0);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages]);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!canGuess || !message) return;

    const guess = { id: `local-${++sequence.current}`, player: 'You', message };
    setMessages((previous) => [...previous, guess]);
    setDraft('');
  }

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
      <div
        ref={log}
        role="log"
        aria-label="Guess messages"
        tabIndex={0}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3 text-sm leading-snug outline-none [contain:size] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        {messages.map(({ id, player, message }) => (
          <p key={id} className="wrap-anywhere">
            <span className="font-semibold">{player}:</span> {message}
          </p>
        ))}
      </div>
      <form
        className="flex items-center gap-1.5 border-t p-2"
        onSubmit={submit}
      >
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
            autoComplete="off"
            maxLength={maxGuessLength}
            placeholder={canGuess ? 'Type your guess…' : 'Drawer can’t guess'}
            value={draft}
            disabled={!canGuess}
            onChange={(event) => setDraft(event.target.value)}
            className="h-10 bg-card pr-2 pl-7 shadow-none"
          />
        </div>
        <Button
          type="submit"
          size="icon"
          aria-label="Send guess"
          disabled={!canGuess || !draft.trim()}
          className="size-10 transition-none"
        >
          <Send aria-hidden="true" className="size-4" />
        </Button>
      </form>
    </section>
  );
}
