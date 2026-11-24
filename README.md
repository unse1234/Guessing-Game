# Draw & Guess

Draw & Guess is a browser-based multiplayer drawing and guessing game. Players can create, join, and leave live rooms of up to eight players. The lobby synchronizes membership, host ownership, and online status. The game and results screens are local UI previews.

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
4. Select **Leave Room** in the host window. The guest becomes host. **Start Game** remains a placeholder.
5. In another terminal, run the checks:

   ```powershell
   Invoke-RestMethod -Uri http://localhost:3001/health | ConvertTo-Json -Compress
   pnpm --filter @draw-and-guess/web test:connection
   pnpm --filter @draw-and-guess/web test:rooms
   ```

   The health response is `{"status":"ok"}`. For a customized setup, set `NEXT_PUBLIC_SOCKET_URL` and `FRONTEND_URL` in the terminal before running the checks. The room integration test measures acknowledgement and peer-update timings. Set `NODE_ENV=development` on the API process to include a send timestamp for the browser’s development propagation log.

Run the service unit tests against the compiled API:

```powershell
pnpm build
pnpm --filter @draw-and-guess/api test:rooms
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

The frontend reuses one Socket.IO client per tab across Home and Lobby. Zustand holds the current public snapshot and connection status. A private reconnect credential in `sessionStorage` restores the same player after a refresh or reconnect. Rooms and reconnect credentials are lost on an API restart.

## Phase 2

Add host-authorized game start and transitions from the live lobby into the game.
