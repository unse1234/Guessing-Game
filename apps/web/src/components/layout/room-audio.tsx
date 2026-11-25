'use client';

import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { bindRoomAudio } from '@/lib/game-audio';

export function RoomAudio() {
  const code = useParams<{ code?: string }>().code?.toUpperCase();
  // Keep the same audio session across the lobby, game, and results routes.
  useEffect(() => (code ? bindRoomAudio(code) : undefined), [code]);
  return null;
}
