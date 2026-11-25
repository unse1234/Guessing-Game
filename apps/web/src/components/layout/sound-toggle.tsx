'use client';

import { Volume2, VolumeX } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import {
  setSoundEnabled,
  soundEnabled,
  subscribeToSoundPreference,
} from '@/lib/game-audio';

const defaultSoundEnabled = () => false;

export function SoundToggle() {
  const enabled = useSyncExternalStore(
    subscribeToSoundPreference,
    soundEnabled,
    defaultSoundEnabled,
  );
  const Icon = enabled ? Volume2 : VolumeX;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Game sounds"
      aria-pressed={enabled}
      title={enabled ? 'Mute game sounds' : 'Enable game sounds'}
      className="size-9 transition-none aria-pressed:bg-secondary focus-visible:ring-ring [@media(pointer:coarse)]:size-11"
      onClick={() => setSoundEnabled(!enabled)}
    >
      <Icon aria-hidden="true" className="size-5" />
    </Button>
  );
}
