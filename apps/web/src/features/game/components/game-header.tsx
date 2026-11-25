import { Users } from 'lucide-react';
import { SiteBrand } from '@/components/layout/site-brand';
import { SoundToggle } from '@/components/layout/sound-toggle';
import { Badge } from '@/components/ui/badge';

export function GameHeader({
  code,
  playerCount,
  round,
  totalRounds,
  turn,
  totalTurns,
}: {
  code: string;
  playerCount: number;
  round: number;
  totalRounds: number;
  turn: number;
  totalTurns: number;
}) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b px-3 py-[clamp(0.5rem,1.8svh,1rem)] min-[38rem]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:px-4">
      <div className="flex min-w-0 items-center gap-2 text-lg font-semibold sm:text-xl">
        <SiteBrand />
      </div>
      <Badge
        variant="secondary"
        className="h-auto w-fit rounded-md px-2.5 text-sm whitespace-normal sm:px-3"
      >
        {round
          ? `Round ${round}/${totalRounds} · Turn ${turn}/${totalTurns}`
          : 'Waiting'}
      </Badge>
      <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm min-[38rem]:col-span-1 min-[38rem]:justify-end">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <Users aria-hidden="true" className="size-4" />
          {playerCount} Players
        </span>
        <Badge
          variant="secondary"
          className="block max-w-full rounded-md px-2.5 text-sm wrap-anywhere whitespace-normal"
        >
          Room: <strong className="font-semibold">{code}</strong>
        </Badge>
        <SoundToggle />
      </div>
    </header>
  );
}
