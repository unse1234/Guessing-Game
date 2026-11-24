import type { FinalPlayerResult } from '@draw-and-guess/shared';
import { cn } from 'cn';

const cellSpacing = 'px-3 py-[clamp(0.25rem,1.1svh,0.75rem)] sm:px-5';

export function FinalScoreboard({
  code,
  results,
}: {
  code: string;
  results: readonly FinalPlayerResult[];
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-background/30">
      <table className="w-full table-fixed text-left text-base">
        <caption className="sr-only">Final scores for room {code}</caption>
        <thead>
          <tr className="border-b">
            <th
              scope="col"
              aria-label="Rank"
              className={cn(
                'w-12 text-center font-semibold sm:w-20',
                cellSpacing,
              )}
            >
              #
            </th>
            <th scope="col" className={cn('font-semibold', cellSpacing)}>
              Player
            </th>
            <th
              scope="col"
              className={cn(
                'w-24 text-right font-semibold sm:w-28',
                cellSpacing,
              )}
            >
              Score
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {results.map(({ playerId, nickname, rank, score }) => (
            <tr
              key={playerId}
              className={rank === 1 ? 'bg-secondary font-semibold' : undefined}
            >
              <td className={cn('text-center tabular-nums', cellSpacing)}>
                {rank}
              </td>
              <th
                scope="row"
                className={cn(
                  'wrap-anywhere',
                  rank === 1 ? 'font-semibold' : 'font-normal',
                  cellSpacing,
                )}
              >
                {nickname}
              </th>
              <td
                className={cn(
                  'text-right wrap-anywhere tabular-nums',
                  cellSpacing,
                )}
              >
                {score}
              </td>
            </tr>
          ))}
          {results.length === 0 && (
            <tr>
              <td
                colSpan={3}
                className={cn('text-center text-muted-foreground', cellSpacing)}
              >
                Scores are unavailable.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
