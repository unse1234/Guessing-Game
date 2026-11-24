import type { TurnSummary } from '@draw-and-guess/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DeadlineClock } from '@/features/game/components/word-timer';

const reasons = {
  all_correct: 'Everyone guessed the word.',
  time_expired: 'Drawing time ran out.',
  drawer_left: 'The drawer left the room.',
  insufficient_players: 'Too few players remain to continue.',
};

export function TurnSummaryDialog({
  summary,
  deadline,
}: {
  summary: TurnSummary;
  deadline: number;
}) {
  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        className="max-h-[calc(100dvh-1rem)] gap-2.5 overflow-y-auto rounded-xl bg-card p-3 data-[state=closed]:animate-none data-[state=open]:animate-none sm:max-w-sm sm:p-4"
      >
        <DialogHeader className="gap-1 text-center sm:text-center">
          <DialogTitle className="text-xl">Turn Complete</DialogTitle>
          <DialogDescription>{reasons[summary.reason]}</DialogDescription>
          {summary.word && (
            <p className="text-sm">
              Correct word <strong>{summary.word}</strong>
            </p>
          )}
        </DialogHeader>
        <table className="w-full table-fixed text-sm">
          <thead className="border-b">
            <tr>
              <th scope="col" className="text-left font-medium">
                Player
              </th>
              <th scope="col" className="w-16 text-right font-medium">
                Earned
              </th>
              <th scope="col" className="w-16 text-right font-medium">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {summary.awards.map(({ playerId, nickname, points, score }) => (
              <tr key={playerId}>
                <th
                  scope="row"
                  className="py-0.5 pr-2 text-left font-normal wrap-anywhere"
                >
                  {nickname}
                </th>
                <td className="text-right tabular-nums">+{points}</td>
                <td className="text-right tabular-nums">{score}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="flex items-center justify-center gap-2 text-sm">
          Next turn in <DeadlineClock deadline={deadline} />
        </p>
      </DialogContent>
    </Dialog>
  );
}
