'use client';

import { House, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { requestGame } from '@/lib/game-client';
import { getActiveRoomSocket, leaveRoom } from '@/lib/room-client';

const actionClassName =
  'h-auto min-h-12 text-base font-semibold whitespace-normal transition-none focus-visible:ring-ring';

export function ResultsActions({
  code,
  gameId,
  isHost,
  isMember,
}: {
  code: string;
  gameId: string | null;
  isHost: boolean;
  isMember: boolean;
}) {
  const router = useRouter();
  const pending = useRef(false);
  const [action, setAction] = useState<'restart' | 'home' | null>(null);

  async function restart() {
    if (pending.current || !gameId || !isHost) return;
    pending.current = true;
    setAction('restart');
    const result = await requestGame(getActiveRoomSocket(code), code, {
      action: 'restart',
      gameId,
    });
    if (!result.ok) toast.error(result.error.message);
    pending.current = false;
    setAction(null);
  }

  async function goHome() {
    if (pending.current) return;
    pending.current = true;
    setAction('home');
    const result = await leaveRoom();
    if (result.ok || result.error.code === 'NOT_IN_ROOM') router.replace('/');
    else toast.error(result.error.message);
    pending.current = false;
    setAction(null);
  }

  return (
    <div className="grid min-w-0 auto-rows-fr gap-3 md:grid-cols-2 md:gap-4">
      {gameId && (
        <Button
          type="button"
          className={actionClassName}
          onClick={() => void restart()}
          disabled={!isHost || action !== null}
          aria-busy={action === 'restart'}
        >
          <RefreshCw aria-hidden="true" className="size-5" />
          {!isHost
            ? 'Waiting for host to restart…'
            : action === 'restart'
              ? 'Restarting…'
              : 'Play Again'}
        </Button>
      )}
      {isMember ? (
        <Button
          type="button"
          variant="secondary"
          className={actionClassName}
          onClick={() => void goHome()}
          disabled={action !== null}
          aria-busy={action === 'home'}
        >
          <House aria-hidden="true" className="size-5" />
          Back to Home
        </Button>
      ) : (
        <Button variant="secondary" className={actionClassName} asChild>
          <Link href="/">
            <House aria-hidden="true" className="size-5" />
            Back to Home
          </Link>
        </Button>
      )}
    </div>
  );
}
