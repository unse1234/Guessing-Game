# Draw & Guess

Draw & Guess is a browser-based multiplayer drawing and guessing game. The live lobby supports up to eight players. The server runs the first turn through word selection and synchronizes the drawer's canvas. The results screen is a UI preview.

## Stack

- **Web** — Next.js App Router, strict TypeScript, Tailwind CSS, shadcn/ui, Radix UI, Zustand, Socket.IO Client, Zod, Lucide, Sonner, and React Konva/Konva.
- **API** — NestJS, strict TypeScript, Socket.IO, Nest Config, Zod, and Nano ID.
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
