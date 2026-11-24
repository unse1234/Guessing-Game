import { MAX_GUESS_LENGTH } from '@draw-and-guess/shared';
import { MessageCircle, Send } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useGuessing } from '@/features/game/hooks/use-guessing';
import styles from './game-screen.module.css';

export function GuessPanel({
  code,
  isDrawer,
}: {
  code: string;
  isDrawer: boolean;
}) {
  const {
    activity,
    draft,
    disabled,
    edit,
    emptyHint,
    error,
    myPoints,
    pending,
    submit,
  } = useGuessing(code, isDrawer);
  const log = useRef<HTMLDivElement>(null);
  const followRecent = useRef(true);

  useLayoutEffect(() => {
    const element = log.current;
    if (followRecent.current && element)
      element.scrollTop = element.scrollHeight;
  }, [activity]);

  return (
    <section
      aria-labelledby="game-guesses"
      className={`${styles.guesses} flex min-h-48 min-w-0 flex-col rounded-xl border bg-background/30 min-[42rem]:min-h-52`}
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
        aria-label="Room guesses"
        tabIndex={activity.length ? 0 : undefined}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 text-sm leading-snug text-muted-foreground [contain:size] focus-visible:outline-ring"
        onScroll={({ currentTarget }) => {
          followRecent.current =
            currentTarget.scrollHeight -
              currentTarget.scrollTop -
              currentTarget.clientHeight <=
            24;
        }}
      >
        {activity.length ? (
          <ul className="space-y-1.5 wrap-anywhere">
            {activity.map((item) => (
              <li
                key={item.sequence}
                className={
                  item.kind === 'correct'
                    ? 'font-semibold text-foreground'
                    : undefined
                }
              >
                <bdi className="font-semibold">{item.playerName}</bdi>
                {item.kind === 'correct' ? (
                  ' guessed the word!'
                ) : (
                  <>
                    {': '}
                    <bdi>{item.message}</bdi>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>{emptyHint}</p>
        )}
      </div>
      {myPoints !== null && (
        <p
          role="status"
          className="bg-secondary/50 px-3 py-1.5 text-sm font-semibold"
        >
          Correct! +{myPoints} points
        </p>
      )}
      {error && myPoints === null && (
        <p role="alert" className="px-3 pb-1 text-sm text-destructive">
          {error}
        </p>
      )}
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
            placeholder="Type your guess…"
            value={draft}
            onChange={(event) => edit(event.target.value)}
            disabled={disabled}
            maxLength={MAX_GUESS_LENGTH * 2}
            autoComplete="off"
            className="h-10 bg-card pr-2 pl-7 shadow-none"
          />
        </div>
        <Button
          type="submit"
          size="icon"
          aria-label="Send guess"
          aria-busy={pending}
          disabled={disabled || pending || !draft.trim()}
          className="size-10 transition-none"
        >
          <Send aria-hidden="true" className="size-4" />
        </Button>
      </form>
    </section>
  );
}
