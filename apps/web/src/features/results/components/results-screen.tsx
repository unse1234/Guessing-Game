import { FeedbackToaster } from '@/components/layout/feedback-toaster';
import { SiteBrand } from '@/components/layout/site-brand';
import { Card } from '@/components/ui/card';
import { FinalScoreboard } from '@/features/results/components/final-scoreboard';
import { ResultsActions } from '@/features/results/components/results-actions';
import { WinnerAnnouncement } from '@/features/results/components/winner-announcement';
import { rankResults } from '@/features/results/lib/rank-results';
import type { PlayerResult } from '@/features/results/types/results';

export function ResultsScreen({
  code,
  results,
}: {
  code: string;
  results: readonly PlayerResult[];
}) {
  const ranked = rankResults(results);
  const winners = ranked
    .filter(({ rank }) => rank === 1)
    .map(({ name }) => name);

  return (
    <main className="flex min-h-dvh w-full items-center justify-center px-3 py-[clamp(0.75rem,3svh,2rem)] sm:px-8">
      <Card className="w-full max-w-240 gap-0 rounded-xl border-0 p-0 ring-1 ring-border shadow-none">
        <header className="mx-4 flex items-center gap-3 border-b px-2 py-[clamp(0.5rem,2.5svh,1.5rem)] text-xl font-semibold sm:mx-6 sm:px-4 sm:text-2xl">
          <SiteBrand />
        </header>
        <div className="grid gap-[clamp(0.75rem,3.5svh,2rem)] px-4 py-[clamp(0.75rem,3.5svh,2rem)] sm:px-8 [@media(min-width:38rem)_and_(max-height:30rem)]:grid-cols-2 [@media(min-width:38rem)_and_(max-height:30rem)]:items-center">
          <WinnerAnnouncement winners={winners} />
          <div className="min-w-0 [@media(min-width:38rem)_and_(max-height:30rem)]:col-start-2 [@media(min-width:38rem)_and_(max-height:30rem)]:row-span-2 [@media(min-width:38rem)_and_(max-height:30rem)]:row-start-1">
            <FinalScoreboard code={code} results={ranked} />
          </div>
          <ResultsActions />
        </div>
      </Card>
      <FeedbackToaster />
    </main>
  );
}
