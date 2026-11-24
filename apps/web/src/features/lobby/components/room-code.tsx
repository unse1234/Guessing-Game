'use client';

import { Copy, Link } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function RoomCode({ code }: { code: string }) {
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error(`Could not copy the ${label.toLowerCase()}.`);
    }
  }

  return (
    <div className="@container mx-auto w-full max-w-176">
      <div className="grid min-w-0 gap-2 @min-[28rem]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] @min-[28rem]:gap-3">
        <div className="flex min-w-0">
          <span className="grid min-h-12 min-w-0 grow place-items-center rounded-l-md border bg-background px-3 py-1.5 text-center text-2xl font-semibold tracking-wide wrap-anywhere">
            {code}
          </span>
          <Button
            type="button"
            variant="outline"
            aria-label="Copy code"
            title="Copy code"
            className="h-auto min-h-12 w-12 rounded-l-none border-l-0 bg-background shadow-none transition-none focus-visible:z-10"
            onClick={() => void copy(code, 'Room code')}
          >
            <Copy aria-hidden="true" className="size-5" />
          </Button>
        </div>

        <Button
          type="button"
          variant="secondary"
          className="h-auto min-h-12 min-w-0 text-base font-semibold whitespace-normal transition-none"
          onClick={() => void copy(window.location.href, 'Room link')}
        >
          <Link aria-hidden="true" className="size-5" />
          Copy Link
        </Button>
      </div>
    </div>
  );
}
