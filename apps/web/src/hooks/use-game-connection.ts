'use client';

import { pongSchema, SOCKET_EVENTS, type Pong } from '@draw-and-guess/shared';
import { useEffect, useState } from 'react';
import { getGameSocket } from '@/lib/socket';
import { useGameStore } from '@/stores/game-store';

const PING_TIMEOUT_MS = 5_000;

// Mount once in the lobby. Other components can read connection status from the store.
export function useGameConnection() {
  const status = useGameStore((state) => state.connectionStatus);
  const setStatus = useGameStore((state) => state.setConnectionStatus);
  const [attempt, setAttempt] = useState(0);
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    let socket: ReturnType<typeof getGameSocket>;
    try {
      socket = getGameSocket();
    } catch {
      setStatus('error');
      return;
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    let pendingPing: number | undefined;

    function clearPing() {
      clearTimeout(timeout);
      pendingPing = undefined;
    }

    function ping() {
      clearPing();
      setStatus('connecting');
      const sentAt = Date.now();
      pendingPing = sentAt;
      timeout = setTimeout(() => {
        pendingPing = undefined;
        setStatus('error');
      }, PING_TIMEOUT_MS);
      socket.emit(SOCKET_EVENTS.ping, { sentAt });
    }

    function onPong(payload: Pong) {
      const pong = pongSchema.safeParse(payload);
      if (!pong.success || pong.data.sentAt !== pendingPing) return;

      clearPing();
      setLatency(Math.max(0, Date.now() - pong.data.sentAt));
      setStatus('connected');
    }

    function onDisconnect() {
      clearPing();
      setStatus('disconnected');
    }

    function onError() {
      clearPing();
      setStatus('error');
    }

    function onReconnectAttempt() {
      setStatus('connecting');
    }

    socket.on('connect', ping);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onError);
    socket.on(SOCKET_EVENTS.pong, onPong);
    socket.io.on('reconnect_attempt', onReconnectAttempt);
    setStatus('connecting');
    if (socket.connected) ping();
    else socket.connect();

    return () => {
      clearPing();
      socket.off('connect', ping);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onError);
      socket.off(SOCKET_EVENTS.pong, onPong);
      socket.io.off('reconnect_attempt', onReconnectAttempt);
      socket.disconnect();
    };
  }, [attempt, setStatus]);

  return {
    status,
    latency: status === 'connected' ? latency : null,
    retry: () => setAttempt((value) => value + 1),
  };
}
