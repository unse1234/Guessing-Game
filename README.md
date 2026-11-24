# Draw & Guess

Draw & Guess is a browser-based multiplayer drawing and guessing game for up to eight players. The server coordinates two drawing rounds, synchronizes the canvas and scores, and manages final standings and replay.

## Stack

- **Web** — Next.js App Router, strict TypeScript, Tailwind CSS, shadcn/ui, Radix UI, Zustand, Socket.IO Client, Zod, Lucide, Sonner, and React Konva/Konva.
- **API** — NestJS, strict TypeScript, Socket.IO, Nest Config, and Zod.
- **Workspace** — pnpm, Git, Husky, lint-staged, Prettier, and ESLint.

## Setup on Windows

Install Git and Node.js 24 LTS (24.15 or newer recommended). This workspace uses pnpm 12.21.0.

```powershell
node --version
git --version
npm install --global pnpm@12.21.0
pnpm --version
pnpm install --frozen-lockfile
```

The apps have local defaults. To customize them, copy the example files:

```powershell
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item apps/api/.env.example apps/api/.env
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The API listens on [http://localhost:3001](http://localhost:3001).

## Commands

| Command                                             | Purpose                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| `pnpm dev`                                          | Build the shared contracts and watch all three packages.            |
| `pnpm build`                                        | Build the shared package, API, and web app in dependency order.     |
| `pnpm typecheck`                                    | Generate shared declarations and check all packages.                |
| `pnpm lint`                                         | Lint the workspace and apply Next.js rules to the web app.          |
| `pnpm format`                                       | Format workspace source and configuration.                          |
| `pnpm format:check`                                 | Check formatting without rewriting files.                           |
| `pnpm --filter @draw-and-guess/web test:connection` | Check the running API, Socket.IO transports, and configured origin. |

To run the apps individually from the workspace root, first run `pnpm --filter @draw-and-guess/shared build`. Start the API in one terminal and the web app in another:

```powershell
pnpm --filter @draw-and-guess/api dev
pnpm --filter @draw-and-guess/web dev
```

After `pnpm build`, replace `dev` with `start` to run the production builds locally. The Git pre-commit hook runs ESLint and Prettier on staged files via lint-staged.

## Environment

| Package | Variable                 | Default                 | Purpose                                                                                                              |
| ------- | ------------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Web     | `NEXT_PUBLIC_SOCKET_URL` | `http://localhost:3001` | Socket.IO server origin embedded in the browser bundle. Restart development or rebuild production after changing it. |
| API     | `PORT`                   | `3001`                  | HTTP and Socket.IO port.                                                                                             |
| API     | `FRONTEND_URL`           | `http://localhost:3000` | Allowed web origin, including scheme and port. Use the same hostname when opening the web app.                       |
| API     | `MAX_ACTIVE_ROOMS`       | `128`                   | Room slots per process, including rooms within their reconnect grace period.                                         |
| API     | `MAX_SOCKET_CONNECTIONS` | `1536`                  | Engine.IO connections admitted per process.                                                                          |

Real environment files are ignored by Git.

## Test a multiplayer room

1. Run `pnpm dev` and open [the home page](http://localhost:3000). Enter a nickname and select **Create Room**.
2. Open a separate browser profile or private window, visit the home page, and select **Join Room**. Enter another nickname and the six-character code. You can also open the lobby’s **Copy Link** invitation and select **Join this room**.
3. Verify that both windows show two players. Refresh the guest window and confirm the same membership returns. To test a temporary disconnect, restore the connection within 15 seconds of the server marking the guest offline.
4. Select **Start Game** as the host with both players online. Both windows open the game. Only the drawer sees the three options. Refresh either window to check that the original deadline stays in effect. To verify host transfer, use **Leave Room** in the lobby before starting.
5. In another terminal, run the checks:

   ```powershell
   Invoke-RestMethod -Uri http://localhost:3001/health | ConvertTo-Json -Compress
   pnpm --filter @draw-and-guess/web test:connection
   pnpm --filter @draw-and-guess/web test:rooms
   pnpm --filter @draw-and-guess/web test:game
   pnpm --filter @draw-and-guess/web test:drawing
   pnpm --filter @draw-and-guess/web test:guessing
   pnpm --filter @draw-and-guess/web test:lifecycle
   pnpm --filter @draw-and-guess/web test:isolation
   ```

   The health response is `{"status":"ok"}`. For a customized setup, set `NEXT_PUBLIC_SOCKET_URL` and `FRONTEND_URL` in the terminal before running the checks. The room integration test measures acknowledgement and peer-update timings. Set `NODE_ENV=development` on the API process to include a send timestamp for the browser’s development propagation log.

Run the room and game service unit tests against the compiled API:

```powershell
pnpm build
pnpm --filter @draw-and-guess/api test:rooms
pnpm --filter @draw-and-guess/api test:game
pnpm --filter @draw-and-guess/api test:drawing
pnpm --filter @draw-and-guess/api test:guessing
pnpm --filter @draw-and-guess/api test:lifecycle
pnpm --filter @draw-and-guess/web test:drawing-client
```

### Browser verification

With the apps running and Chrome installed, run the three-session gameplay and refresh checks. The optional test runner can live outside the workspace.

```powershell
$qa = Join-Path $env:TEMP 'draw-guess-browser-tests'
npm install --prefix $qa --no-save playwright-core@1.65.1
$env:PLAYWRIGHT_PACKAGE_DIR = $qa
pnpm --filter @draw-and-guess/web test:e2e
```

Set `FRONTEND_URL` and `NEXT_PUBLIC_SOCKET_URL` for custom app URLs. Set `QA_CHROME_PATH` if Chrome is installed in a custom location.

## Structure

```text
draw-and-guess/
├── apps/
│   ├── web/
│   │   ├── scripts/               Socket.IO and drawing-client tests
│   │   └── src/
│   │       ├── app/               App Router pages and layout
│   │       ├── components/
│   │       │   ├── ui/            shadcn/ui primitives
│   │       │   └── layout/        Shared branding and feedback
│   │       ├── features/
│   │       │   ├── home/
│   │       │   ├── lobby/
│   │       │   ├── game/          Drawing, guessing, and turn summary
│   │       │   └── results/       Final rankings and replay
│   │       ├── lib/               Shared socket and session clients
│   │       └── stores/            Zustand room and game state
│   └── api/
│       ├── test/                  Backend and timer tests
│       └── src/
│           ├── main.ts
│           ├── app.module.ts
│           ├── common/            Environment, adapter, gateway, and health
│           ├── rooms/            Room service and Socket.IO gateway
│           ├── game/              Game settings, rotation, and replay
│           ├── drawing/           Versioned drawing state
│           └── scoring/           Awards and final ranks
├── packages/shared/src/          events.ts, schemas.ts, types.ts, index.ts
├── .husky/pre-commit
├── eslint.config.mjs
├── tsconfig.base.json
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
└── README.md
```

## Architecture

The shared package emits JavaScript and declarations. Nest loads the compiled contracts at runtime and Next bundles the same exports, keeping event names and payload validation in one place. The API validates its environment at startup and serves HTTP health and Socket.IO on the same port.

The API owns room membership using in-memory maps for rooms, socket memberships, and reconnect credentials. It sends versioned public snapshots only to affected rooms. On an unexpected disconnect, the server holds the player's membership for 15 seconds using one expiry timer. Host ownership transfers to the next connected player when the host leaves or expires.

The frontend reuses one Socket.IO client per tab across Home, Lobby, and Game. Zustand holds public room state and separately tracks the current game and the drawer's private word data. A reconnect credential in `sessionStorage` restores the same player after a refresh or reconnect. The game then requests the current authorized view. Rooms, games, and reconnect credentials are lost on an API restart.

## Phase 2

The host can start with at least two connected players. The server sends the current drawer three private word options and broadcasts public state and absolute deadlines. If the drawer misses the 15-second selection deadline, the server chooses the first offered option. Drawing lasts up to 60 seconds.

## Phase 3

After choosing a word, draw in one window and watch in another. Try changing size and color, erasing a line, refreshing the guesser, and clearing the canvas. Use separate profiles so each window has its own room membership.

The drawer renders input locally on the 900 × 600 logical canvas. Preview packets carry up to 64 new coordinate pairs about every 24 ms. Slow transports may skip previews. A reliable final stroke replaces the preview with complete coordinates. Eraser strokes use the same ordered replay as pen strokes.

Reconnect restores the current turn and deadline, then loads an authoritative canvas snapshot. If a disconnect interrupts an unfinished stroke, the server preserves the prefix it received. Clear advances the canvas version, so older packets are rejected. The server caps a stroke at 1,536 points and a canvas at 256 strokes or 24,576 points. A separate turn budget remains in effect across clears. Drawing state lives in memory and is released when the room closes.

## Phase 4

Start a room in separate browser profiles with a drawer and two guessers. Pick a word and submit a wrong guess with Enter or Send. Check that everyone sees the message and only the guesser sees their point award after a correct guess. Refresh a guesser to verify the same chat, scoreboard, deadline, and submission eligibility are restored. When the other guesser answers, check that drawing and guessing close and the word is revealed. With an unsolved guesser, the original deadline ends the turn.

The server awards `100 + 5 × ceil(remaining milliseconds / 1000)` on each player's first correct answer. The drawer earns 50 per correct player up to 200 per turn. The server allows a burst of four guesses per player and replenishes one slot every 500 ms. A disconnected guesser stays eligible during the 15-second reconnect window. Leaving or expiry removes them from consideration for early completion.

`guess:submit` takes a room code, turn ID, request ID, and guess. The requesting socket receives the private result in its acknowledgement. Other players see `guess:message` for an incorrect guess or `guess:player-correct` with a generic notice and changed score totals. `game:get-state` restores up to 100 incorrect guesses, generic success notices, scores, and the current player's own award.

## Phase 5

NestJS advances `waiting → word_selection → drawing → turn_summary`. After the five-second summary it starts the next eligible turn or enters `finished`. The timer callback checks that the same game and phase revision are still active. The summary contains the answer, turn awards, and cumulative totals. A forfeit during word selection leaves the answer blank.

The initial room order schedules two full rotations, one drawing slot per player each round. The round is the scheduled slot divided by the original roster size, rounded down and converted to a one-based round number. The turn counter counts started turns, including forfeits. Permanent departures remove their future slots from the total and retain earned points in the final standings. An offline member retains their scheduled slot during the 15-second reconnect grace period. Permanent drawer departure ends the turn as a forfeit. Fewer than two remaining members ends the game after the current summary. Rankings use shared places for equal scores and preserve original roster order within ties.

Play Again returns the same room to its lobby, retaining the room code, host, membership, and open sockets. A fresh start creates a new game and resets every score. Back to Home on Results leaves the finished room. Final standings remain available to room members until replay or room deletion. All game data is in memory.

| Event            | Contract                                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `game:start`     | Host sends `{ code, generation }` using `room.gameGeneration`.                                                                          |
| `word:choose`    | Drawer sends `{ code, turnId, revision, word }`. The turn ID and revision also scope private word events.                               |
| `game:state`     | Room receives the current phase, IDs, counters, and deadline. The summary or final results is included only in the corresponding phase. |
| `game:get-state` | A room member sends `{ code }` for the authorized view, including final standings after completion.                                     |
| `game:restart`   | Current host sends `{ code, gameId }` for the finished game. The room receives `room:updated` and the new waiting state.                |

### Test a complete game

1. Start the apps with `pnpm dev`. Create a room in one browser profile and join it from two separate profiles.
2. Start as host. In each of the six scheduled turns, have the drawer select a word and draw. Submit correct guesses from both guessers to end that turn early and check the summary awards and countdown.
3. Verify that all three sessions reach Results automatically. Refresh one Results page and compare standings, then click **Play Again** as host.
4. Verify all three sessions return to the same lobby. Start another game and check the scoreboard starts at zero.

### Phase 5 files

- `packages/shared/src/{types,events,schemas}.ts` define phase, summary, results, and request scopes.
- `apps/api/src/game/game-config.ts` adds the settings. `game.service.ts`, `game.gateway.ts`, and `word-bank.ts` implement rotation, timed transitions, fresh choices, and replay. `rooms/rooms.service.ts` tracks the lobby generation, `drawing/drawing.service.ts` advances the canvas version, and `scoring/scoring.ts` ranks final scores.
- `apps/web/src/features/game/components/turn-summary-dialog.tsx` adds the summary. The game screen, header, word dialog, guessing hook, and session hook render the current turn and handle navigation. `features/lobby/components/lobby-actions.tsx` and `lib/game-client.ts` send and recover scoped requests on the existing socket.
- `apps/web/src/app/results/[code]/page.tsx` and `features/results/components` display server standings and replay controls. The old mock results and client ranking files were removed.
- `apps/api/test/game-lifecycle.test.mjs` and `apps/web/scripts/check-lifecycle.mjs` add fake-time and live Socket.IO coverage. Existing game, drawing, and guessing tests were updated for the new contracts. Both app packages expose `test:lifecycle`.

## Phase 6.2 performance

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

The browser benchmark uses the optional Chrome and Playwright setup from [Browser verification](#browser-verification). Build with `NEXT_PUBLIC_SOCKET_URL=http://localhost:3102`, run the API on 3102 with `FRONTEND_URL=http://localhost:3200`, and run `pnpm --filter @draw-and-guess/web exec next start --port 3200`. Then run:

```powershell
pnpm --filter @draw-and-guess/web exec node scripts/benchmark-canvas.mjs
```

`BENCH_REPEATS` changes the sample count. The browser script also accepts `BENCH_DPR` and `BENCH_HISTORY_SIZE` to vary display scale and the number of preloaded strokes. Set `BENCH_TOUCH=1` to check the eraser with emulated touch after the timed mouse drag.

## Phase 6.3 security and mobile checks

Room membership remains server-owned. A room code lets a guest join an open lobby. A reconnect credential identifies an existing player within the room, including during the 15-second disconnect grace period. The credential lives in the tab's `sessionStorage`. API restarts clear rooms, scores, and reconnect credentials, so returning players must create or join a fresh room.

The API bounds live rooms and connections. Ten-second limits of 256 handshakes, 32 room creation requests, 128 joins, and 64 reconnect requests apply per direct peer address. The peer tables retain up to 4,096 entries per category and reclaim expired entries on new requests. A separate pre-validation budget of 32 guess events per socket protects parsing while preserving the per-player guessing limit. The diagnostic ping sends at most one response per socket per second. Drawing continues to enforce packet, stroke, point, and per-turn limits.

The address limits use the actual connection peer. Clients behind a proxy share that proxy's budget. Forwarded IP headers do not affect these limits. A public deployment needs HTTPS and WSS, along with admission controls at the edge for traffic from multiple peers. Reconnect credentials are bearer credentials, so access to a tab's storage grants access to that membership. Keep packet-level debug logging off production connections.

Only the drawer receives word choices and the active answer. Compound guess text containing a word-bank candidate is masked under the same rule for every candidate. Exact correct guesses award points and emit the generic success notice. Nicknames and chat render as text. The web response blocks framing and object embeds and sets `nosniff` and a cross-origin referrer policy.

The mobile browser check exercises Home, Lobby, Game, and Results at widths of 375, 390, 768, 1024, and 1440 px. It uses Chromium touch emulation for drawing, erasing, cancellation, brush sizing, color selection, clear, and resize. The shortened viewport check approximates a software keyboard by reducing the visible height while the chat field has focus. Physical phones and Safari's keyboard behavior require separate testing.

Run these checks after building. The web security check owns a short-lived API on port 3103 and confirms the previous room and credentials are gone after a process restart.

```powershell
pnpm --filter @draw-and-guess/api test:security
pnpm --filter @draw-and-guess/web test:security
pnpm --filter @draw-and-guess/web test:e2e
```
