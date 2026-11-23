'use client';

import { LogIn, Pencil, Plus, RotateCcw, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useGameConnection } from '@/hooks/use-game-connection';

const statusLabel = {
  connecting: 'Connecting',
  connected: 'Connected',
  disconnected: 'Disconnected',
  error: 'Connection failed',
} as const;

export function LobbyHome() {
  const { status, latency, retry } = useGameConnection();

  return (
    <TooltipProvider>
      <div className="lobby-shell">
        <header className="lobby-header">
          <div className="flex items-center gap-3 font-bold">
            <span className="brand-icon">
              <Pencil size={17} aria-hidden />
            </span>
            <span>Draw &amp; Guess</span>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  asChild
                  variant="outline"
                  className="connection-badge"
                  data-status={status}
                  tabIndex={0}
                >
                  <span role="status">
                    <span className="connection-dot" aria-hidden />
                    {statusLabel[status]}
                  </span>
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {latency === null
                  ? 'Game server connection'
                  : `Server round trip: ${latency} ms`}
              </TooltipContent>
            </Tooltip>
            {(status === 'error' || status === 'disconnected') && (
              <Button
                variant="outline"
                size="icon-sm"
                onClick={retry}
                aria-label="Retry connection"
              >
                <RotateCcw aria-hidden />
              </Button>
            )}
          </div>
        </header>

        <main className="lobby-main">
          <Card className="lobby-card">
            <div className="lobby-copy">
              <h1>
                Draw <span>&amp;</span>
                <br />
                Guess<span>.</span>
              </h1>
              <p>
                Grab your friends, sketch a secret word, and see who guesses it
                first.
              </p>
              <div className="lobby-actions">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="lg" className="create-button">
                      <Plus aria-hidden />
                      Create Room
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Room</DialogTitle>
                      <DialogDescription>
                        Room creation will be available when private rooms are
                        added.
                      </DialogDescription>
                    </DialogHeader>
                  </DialogContent>
                </Dialog>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="lg" variant="outline" className="join-button">
                      <LogIn aria-hidden />
                      Join Room
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Join Room</DialogTitle>
                      <DialogDescription>
                        Joining with a room code will be available when private
                        rooms are added.
                      </DialogDescription>
                    </DialogHeader>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            <div className="lobby-art" aria-hidden="true">
              <div className="sketch-paper">
                <Pencil className="sketch-pencil" strokeWidth={1.55} />
                <Sparkles className="sketch-sparks" strokeWidth={1.65} />
              </div>
              <i className="sketch-tape" />
              <i className="sketch-cross" />
              <i className="sketch-ring" />
            </div>
          </Card>
        </main>
      </div>
    </TooltipProvider>
  );
}
