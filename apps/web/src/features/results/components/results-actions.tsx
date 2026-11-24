'use client';

import { House, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

const actionClassName =
  'h-auto min-h-12 text-base font-semibold whitespace-normal transition-none focus-visible:ring-ring';

export function ResultsActions() {
  return (
    <div className="grid min-w-0 auto-rows-fr gap-3 md:grid-cols-2 md:gap-4">
      <Button
        type="button"
        className={actionClassName}
        onClick={() =>
          toast.info(
            'Play Again will be available when game functionality is connected.',
          )
        }
      >
        <RefreshCw aria-hidden="true" className="size-5" />
        Play Again
      </Button>
      <Button variant="secondary" className={actionClassName} asChild>
        <Link href="/">
          <House aria-hidden="true" className="size-5" />
          Back to Home
        </Link>
      </Button>
    </div>
  );
}
