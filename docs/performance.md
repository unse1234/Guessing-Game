# Performance benchmarks

Measurements were collected on Windows with an AMD Ryzen 5 7430U and Node 26.13.1. The Socket.IO load generator and API ran on the same machine over loopback. Each configuration ran three waves. Each room was seeded with 32 completed strokes, then drew four strokes with 40 preview batches each while each guesser submitted six incorrect guesses. The test checked completed point arrays, restored canvases, reconnected a guesser, verified correct-guess scoring, and closed each room. API CPU sampling covers the roughly four-second load and cleanup window after seeding.

### Socket.IO baseline and optimized build

Cells show median / p95 in milliseconds, before → after. The sample counts are per build. The preview count for 64 clients was 26,880 before and 26,845 after. The other sample counts are the same on both builds.

| Metric                         | 1 room × 2 players                | 1 room × 8 players                  | 8 rooms × 8 players                 |
| ------------------------------ | --------------------------------- | ----------------------------------- | ----------------------------------- |
| Create ACK                     | 0.40 / 2.48 → 0.40 / 2.44 (n=3)   | 0.34 / 0.46 → 0.31 / 0.41 (n=3)     | 4.20 / 7.30 → 4.67 / 8.26 (n=24)    |
| Join ACK                       | 0.28 / 1.74 → 0.26 / 1.24 (n=3)   | 0.51 / 0.96 → 0.52 / 1.10 (n=21)    | 3.47 / 6.12 → 4.09 / 7.01 (n=168)   |
| Start request to peer state    | 0.57 / 2.56 → 0.60 / 1.62 (n=3)   | 0.51 / 0.71 → 0.48 / 0.68 (n=21)    | 5.23 / 9.57 → 5.00 / 7.72 (n=168)   |
| Preview propagation            | 0.64 / 0.95 → 0.63 / 1.02 (n=480) | 0.54 / 0.84 → 0.56 / 0.88 (n=3,360) | 0.91 / 1.70 → 0.87 / 1.66           |
| Guess ACK                      | 0.74 / 1.25 → 0.73 / 1.35 (n=21)  | 1.02 / 1.61 → 1.10 / 1.77 (n=147)   | 4.26 / 8.36 → 4.79 / 9.01 (n=1,176) |
| Correct-guess notice at drawer | 0.65 / 1.20 → 0.61 / 0.71 (n=3)   | 0.59 / 1.23 → 0.64 / 1.28 (n=21)    | 6.05 / 8.35 → 6.10 / 9.93 (n=168)   |
| Canvas snapshot                | 0.67 / 1.36 → 0.64 / 1.14 (n=3)   | 0.42 / 0.59 → 0.41 / 0.52 (n=21)    | 2.07 / 3.59 → 1.48 / 3.54 (n=168)   |
| Reconnect and restore          | 3.21 / 4.83 → 3.40 / 5.97 (n=3)   | 2.55 / 2.78 → 2.67 / 2.99 (n=3)     | 9.15 / 21.05 → 9.72 / 15.30 (n=24)  |

| API process, three waves per build | 1 room × 2 players    | 1 room × 8 players    | 8 rooms × 8 players   |
| ---------------------------------- | --------------------- | --------------------- | --------------------- |
| Median CPU time per wave           | 47 → 63 ms            | 32 → 31 ms            | 547 → 343 ms          |
| Post-wave RSS range                | 105–106 → 107–109 MiB | 106–108 → 108–109 MiB | 147–164 → 145–161 MiB |
| Median post-wave heap used         | 27.65 → 33.99 MiB     | 35.22 → 35.29 MiB     | 49.81 → 48.28 MiB     |

The 64-client run used 37% less median API CPU time in this sample. The timing and memory readings varied across waves, and several unrelated latency metrics rose. These figures apply to short loopback waves on the test machine. Heap figures are point-in-time observations with normal GC variation.

Canvas restoration uses one `draw:sync` acknowledgement containing the snapshot. This replaces the previous snapshot event followed by an empty acknowledgement. The client applies the snapshot inside the acknowledgement callback so later packets can update it in order. Run the web app and API from the same build to use this contract.

At 64 clients, the median send rate was 41.07 → 41.27 preview packets per second per drawer. The configured 24 ms interval and mean preview event size of 210.54 JSON bytes remained steady. The optimized wave delivered 99.87% of best-effort previews in the largest run, and the reliable completed strokes and reconnect snapshots matched the original coordinates throughout.

The drawing schemas now validate coordinate pairs in one pass. A separate in-process check measured seven timed runs after 1,000 warmup parses per case. Median validation time fell from 2.034 → 0.592 µs for 12 coordinates (100,000 parses per run), 57.495 → 0.686 µs for 482 coordinates (20,000), and 372.295 → 1.714 µs at the 3,072-coordinate limit (5,000).

### Chromium rendering

The browser benchmark used a production Next.js build, new 1280 × 720 contexts at DPR 1, 120 completed strokes of 150 coordinate pairs each, and 144 requested mouse moves per drag. There were three samples per build. The capture counted native Canvas2D calls and used Chromium DevTools Protocol `TaskDuration` for renderer task time. Frame intervals came from `requestAnimationFrame`.

| Browser metric                                        |           Baseline |          Optimized |
| ----------------------------------------------------- | -----------------: | -----------------: |
| Median Canvas2D stroke calls per drag                 |             17,423 |                264 |
| Median renderer task time per drag                    |          455.56 ms |          296.31 ms |
| Frame interval median / p95 (482 intervals per build) |     16.7 / 16.8 ms |     16.7 / 16.8 ms |
| Navigation to ready drawer canvas, median / p95 (n=3) | 292.91 / 540.56 ms | 315.13 / 506.50 ms |
| Median renderer JavaScript heap                       |          14.19 MiB |          13.85 MiB |
| Game route JavaScript, decoded (11 files)             |    1,577,552 bytes |    1,577,884 bytes |
| Game route JavaScript, encoded (11 files)             |      430,807 bytes |      431,002 bytes |

During a drag, Konva previously replayed every completed vector stroke along with the preview. The canvas now caches the completed group from 16 strokes and rebuilds it when completed ink changes or the canvas resizes. The preview and eraser share its layer. The cache uses one extra scene bitmap at display resolution and retains the underlying vectors for resize and recovery. The measured win is less rendering work during a drag. The frame cadence was already near 60 Hz, and cold canvas readiness had a higher median in this three-sample run.

### Reproduce the benchmarks

Build from the workspace root, then run the socket benchmark with local port 3102 free. It owns its API process and prints JSON for each configuration.

```powershell
pnpm build
pnpm --filter @draw-and-guess/web exec node scripts/benchmark-sockets.mjs
```

The browser benchmark uses the optional Chrome and Playwright setup from [Browser verification](../README.md#browser-verification). Build with `NEXT_PUBLIC_SOCKET_URL=http://localhost:3102`, run the API on 3102 with `FRONTEND_URL=http://localhost:3200`, and run `pnpm --filter @draw-and-guess/web exec next start --port 3200`. Then run:

```powershell
pnpm --filter @draw-and-guess/web exec node scripts/benchmark-canvas.mjs
```

`BENCH_REPEATS` changes the sample count. The browser script also accepts `BENCH_DPR` and `BENCH_HISTORY_SIZE` to vary display scale and the number of preloaded strokes. Set `BENCH_TOUCH=1` to check the eraser with emulated touch after the timed mouse drag.
