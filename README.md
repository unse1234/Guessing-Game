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
   ```

   The health response is `{"status":"ok"}`. For a customized setup, set `NEXT_PUBLIC_SOCKET_URL` and `FRONTEND_URL` in the terminal before running the checks. The room integration test measures acknowledgement and peer-update timings. Set `NODE_ENV=development` on the API process to include a send timestamp for the browser’s development propagation log.

Run the room and game service unit tests against the compiled API:

```powershell
pnpm build
pnpm --filter @draw-and-guess/api test:rooms
pnpm --filter @draw-and-guess/api test:game
pnpm --filter @draw-and-guess/api test:drawing
pnpm --filter @draw-and-guess/web test:drawing-client
```

## Structure

```text
draw-and-guess/
├── apps/
│   ├── web/
│   │   ├── scripts/               Connection and room integration checks
│   │   └── src/
│   │       ├── app/               App Router and lobby styles
│   │       ├── components/
│   │       │   ├── ui/            shadcn/ui primitives
│   │       │   └── layout/        Shared branding and feedback
│   │       ├── features/          Home, lobby, game, and results
│   │       ├── hooks/
│   │       ├── lib/               Socket and room connection manager
│   │       ├── stores/            Zustand room state
│   │       └── types/
│   └── api/
│       └── src/
│           ├── main.ts
│           ├── app.module.ts
│           ├── common/            Environment, adapter, gateway, and health
│           ├── rooms/            Room service and Socket.IO gateway
│           ├── game/
│           ├── drawing/
│           └── scoring/
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

The host can start with at least two connected players. The server selects the first connected player in room order as drawer and sends that player three private word options. It broadcasts public state and absolute deadlines as each phase changes. If the drawer misses the 15-second selection deadline, the server chooses the first offered option. The 60-second drawing phase then ends at `turn_ended`.

If the drawer leaves or expires during the first turn, the same deadlines still run. The turn ends without selecting a replacement drawer. Empty rooms cancel their game timers immediately. The round indicator counts one planned turn per player connected at game start. Phase 2 runs only the first turn.

## Phase 3

After choosing a word, draw in one window and watch in another. Try changing size and color, erasing a line, refreshing the guesser, and clearing the canvas. Use separate profiles so each window has its own room membership.

The drawer renders input locally on the 900 × 600 logical canvas. Preview packets carry up to 64 new coordinate pairs about every 24 ms. Slow transports may skip previews. A reliable final stroke replaces the preview with complete coordinates. Eraser strokes use the same ordered replay as pen strokes.

Reconnect restores the current turn and deadline, then loads an authoritative canvas snapshot. If a disconnect interrupts an unfinished stroke, the server preserves the prefix it received. Clear advances the canvas version, so older packets are rejected. The server caps a stroke at 1,536 points and a canvas at 256 strokes or 24,576 points. A separate turn budget remains in effect across clears. Drawing state lives in memory and is released when the room closes.
