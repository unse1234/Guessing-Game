'use client';

import {
  ROOM_ERROR_MESSAGES,
  roomCodeSchema,
  roomNicknameSchema,
} from '@draw-and-guess/shared';
import { Plus, User, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  createRoom,
  joinRoom,
  retryRoomConnection,
  startRoomClient,
} from '@/lib/room-client';
import { useRoomStore } from '@/stores/room-store';

const roomButtonClassName =
  'h-auto min-h-12 text-base font-semibold whitespace-normal transition-none';

const connectionLabel = {
  idle: 'Connecting to the game server…',
  connecting: 'Connecting to the game server…',
  connected: 'Connected',
  rejoining: 'Restoring room membership…',
  offline: 'Game server unavailable.',
};

export function HomeActions({ inviteCode }: { inviteCode?: string }) {
  const router = useRouter();
  const connection = useRoomStore((state) => state.connection);
  const sessionCode = useRoomStore((state) => state.sessionCode);
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState(inviteCode ?? '');
  const [joinOpen, setJoinOpen] = useState(Boolean(inviteCode));
  const [pendingAction, setPendingAction] = useState<'create' | 'join' | null>(
    null,
  );
  const pending = useRef(false);

  useEffect(startRoomClient, []);

  async function submit(action: 'create' | 'join') {
    if (pending.current) return;
    const name = roomNicknameSchema.safeParse(nickname);
    if (!name.success) {
      toast.error(ROOM_ERROR_MESSAGES.INVALID_NICKNAME);
      return;
    }

    const roomCode = action === 'join' ? roomCodeSchema.safeParse(code) : null;
    if (roomCode && !roomCode.success) {
      toast.error(ROOM_ERROR_MESSAGES.INVALID_CODE);
      return;
    }

    pending.current = true;
    setPendingAction(action);
    const result = roomCode
      ? await joinRoom(roomCode.data, name.data)
      : await createRoom(name.data);

    if (result.ok) {
      setJoinOpen(false);
      router.push(`/room/${result.data.room.code}`);
    } else {
      toast.error(result.error.message);
    }
    pending.current = false;
    setPendingAction(null);
  }

  function submitJoin(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit('join');
  }

  return (
    <div className="mx-auto mt-[clamp(1rem,5svh,2.5rem)] max-w-160">
      <label htmlFor="nickname" className="sr-only">
        Nickname
      </label>
      <div className="relative">
        <User
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-4 my-auto size-5"
        />
        <Input
          id="nickname"
          name="nickname"
          type="text"
          autoComplete="nickname"
          placeholder="Enter your nickname"
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          className="h-12 bg-card pr-4 pl-11 shadow-none transition-none focus-visible:ring-highlight md:text-base"
        />
      </div>

      <div className="mt-[clamp(0.75rem,3svh,1.5rem)] grid gap-4 sm:grid-cols-2">
        <Button
          type="button"
          disabled={pendingAction !== null}
          aria-busy={pendingAction === 'create'}
          onClick={() => void submit('create')}
          className={`${roomButtonClassName} hover:bg-primary`}
        >
          <Plus aria-hidden="true" className="size-5" />
          {pendingAction === 'create' ? 'Creating…' : 'Create Room'}
        </Button>
        <Dialog
          open={joinOpen}
          onOpenChange={(open) => {
            if (!pending.current) setJoinOpen(open);
          }}
        >
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="secondary"
              disabled={pendingAction !== null}
              className={`${roomButtonClassName} hover:bg-secondary`}
            >
              <Users aria-hidden="true" className="size-5" />
              Join Room
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-xl bg-card sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Join Room</DialogTitle>
              <DialogDescription>
                Enter your nickname and the room code.
              </DialogDescription>
            </DialogHeader>
            <form className="grid gap-3" onSubmit={submitJoin}>
              <div className="grid gap-1">
                <label htmlFor="join-nickname" className="text-sm font-medium">
                  Nickname
                </label>
                <Input
                  id="join-nickname"
                  autoComplete="nickname"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <label htmlFor="join-code" className="text-sm font-medium">
                  Room code
                </label>
                <Input
                  id="join-code"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  className="uppercase"
                  placeholder="7F8K2A"
                />
              </div>
              <Button
                type="submit"
                className="min-h-11"
                disabled={pendingAction !== null}
                aria-busy={pendingAction === 'join'}
              >
                {pendingAction === 'join' ? 'Joining…' : 'Join Room'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <p role="status">{connectionLabel[connection]}</p>
        {connection === 'offline' && (
          <button
            type="button"
            className="font-medium underline"
            onClick={retryRoomConnection}
          >
            Retry
          </button>
        )}
        {sessionCode && (
          <Link href={`/room/${sessionCode}`} className="font-medium underline">
            Return to lobby
          </Link>
        )}
      </div>
    </div>
  );
}
