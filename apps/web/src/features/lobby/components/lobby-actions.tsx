'use client';

import { LogOut, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { leaveRoom } from '@/lib/room-client';
import { useRoomStore } from '@/stores/room-store';

export function LobbyActions({ code }: { code: string }) {
  const router = useRouter();
  const member = useRoomStore((state) => state.sessionCode === code);
  const online = useRoomStore((state) => state.connection === 'connected');
  const [leaving, setLeaving] = useState(false);
  const pending = useRef(false);

  async function leave() {
    if (pending.current) return;
    pending.current = true;
    setLeaving(true);
    const result = await leaveRoom();
    if (result.ok || result.error.code === 'NOT_IN_ROOM') {
      router.replace('/');
    } else {
      toast.error(result.error.message);
      setLeaving(false);
    }
    pending.current = false;
  }

  return (
    <div className="grid gap-1">
      <Button
        type="button"
        className="h-auto min-h-12 w-full text-base font-semibold whitespace-normal transition-none sm:text-lg"
        onClick={() =>
          toast.info('Game functionality will be connected later.')
        }
      >
        <Play aria-hidden="true" className="size-5" />
        Start Game
      </Button>
      {member && (
        <Button
          type="button"
          variant="ghost"
          className="justify-self-center"
          disabled={!online || leaving}
          onClick={() => void leave()}
        >
          <LogOut aria-hidden="true" />
          {leaving ? 'Leaving…' : 'Leave Room'}
        </Button>
      )}
    </div>
  );
}
