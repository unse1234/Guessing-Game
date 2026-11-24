import { useEffect, useState } from 'react';

function remainingMs(deadline: number, clockOffsetMs: number) {
  return Math.max(0, deadline - (Date.now() + clockOffsetMs));
}

export function useCountdown(deadline: number, clockOffsetMs: number) {
  const [seconds, setSeconds] = useState(() =>
    Math.ceil(remainingMs(deadline, clockOffsetMs) / 1_000),
  );

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function tick() {
      const ms = remainingMs(deadline, clockOffsetMs);
      setSeconds(Math.ceil(ms / 1_000));
      if (ms > 0) timer = setTimeout(tick, Math.max(1, ms % 1_000 || 1_000));
    }

    timer = setTimeout(tick, 0);
    return () => clearTimeout(timer);
  }, [deadline, clockOffsetMs]);

  return seconds;
}
