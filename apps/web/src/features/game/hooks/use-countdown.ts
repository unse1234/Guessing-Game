import { useEffect, useState } from 'react';

export function useCountdown(seconds: number, onExpire?: () => void) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    const deadline = Date.now() + seconds * 1_000;

    const interval = window.setInterval(() => {
      const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1_000));
      setRemaining(next);
      if (next === 0) {
        window.clearInterval(interval);
        onExpire?.();
      }
    }, 200);

    return () => window.clearInterval(interval);
  }, [onExpire, seconds]);

  return remaining;
}
