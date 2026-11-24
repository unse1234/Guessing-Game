'use client';

import { Plus, User, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const roomButtonClassName =
  'h-auto min-h-12 text-base font-semibold whitespace-normal transition-none';

export function HomeActions() {
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
          className="h-12 bg-card pr-4 pl-11 shadow-none transition-none focus-visible:ring-highlight md:text-base"
        />
      </div>

      <div className="mt-[clamp(0.75rem,3svh,1.5rem)] grid gap-4 sm:grid-cols-2">
        <Button
          type="button"
          aria-disabled="true"
          className={`${roomButtonClassName} hover:bg-primary`}
        >
          <Plus aria-hidden="true" className="size-5" />
          Create Room
        </Button>
        <Button
          type="button"
          variant="secondary"
          aria-disabled="true"
          className={`${roomButtonClassName} hover:bg-secondary`}
        >
          <Users aria-hidden="true" className="size-5" />
          Join Room
        </Button>
      </div>
    </div>
  );
}
