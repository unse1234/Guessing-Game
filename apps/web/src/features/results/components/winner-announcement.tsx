import { Trophy } from 'lucide-react';

const winnerList = new Intl.ListFormat('en', { type: 'conjunction' });

export function WinnerAnnouncement({
  winners,
}: {
  winners: readonly string[];
}) {
  let announcement = 'No final scores yet.';
  if (winners.length === 1) {
    announcement = `${winners[0]} is the winner!`;
  } else if (winners.length > 1) {
    announcement = `${winnerList.format(winners)} share the win!`;
  }

  return (
    <section aria-labelledby="results-title" className="min-w-0 text-center">
      <div className="mx-auto grid h-[clamp(2.5rem,8svh,4.5rem)] w-[clamp(3rem,10svh,5.5rem)] place-items-center rounded-xl bg-secondary">
        <Trophy
          aria-hidden="true"
          className="size-[clamp(1.5rem,5svh,2.75rem)]"
        />
      </div>
      <h1
        id="results-title"
        className="mt-3 text-4xl leading-tight font-semibold tracking-tight md:text-5xl"
      >
        Game Over!
      </h1>
      <p className="mt-1 text-lg wrap-anywhere md:text-xl">{announcement}</p>
    </section>
  );
}
