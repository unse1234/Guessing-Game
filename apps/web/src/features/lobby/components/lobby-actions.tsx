'use client';

import { Play } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function LobbyActions() {
  return (
    <Button
      type="button"
      className="h-auto min-h-12 w-full text-base font-semibold whitespace-normal transition-none sm:text-lg"
      onClick={() => toast.info('Game functionality will be connected later.')}
    >
      <Play aria-hidden="true" className="size-5" />
      Start Game
    </Button>
  );
}
