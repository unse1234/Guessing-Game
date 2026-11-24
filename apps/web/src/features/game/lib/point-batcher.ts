import { DRAW_BATCH_MS, MAX_DRAW_BATCH_POINTS } from '@draw-and-guess/shared';

export function createPointBatcher(
  points: number[],
  send: (sequence: number, batch: number[]) => boolean,
  schedule = setTimeout,
  cancel = clearTimeout,
) {
  let offset = 2; // The first coordinate pair travels with draw:start.
  let sequence = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function flush() {
    if (offset === points.length) return;
    const end = Math.min(points.length, offset + MAX_DRAW_BATCH_POINTS * 2);
    if (send(sequence, points.slice(offset, end))) {
      sequence++;
      offset = end;
    }
  }

  function queue() {
    if (timer !== undefined || offset === points.length) return;
    timer = schedule(() => {
      timer = undefined;
      flush();
      queue();
    }, DRAW_BATCH_MS);
  }

  function stop() {
    cancel(timer);
    timer = undefined;
  }

  return {
    queue,
    stop,
    finish() {
      stop();
      // A capped final preview is enough: draw:end includes all remaining points.
      flush();
    },
  };
}
