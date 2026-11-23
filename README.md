# Draw & Guess

Draw & Guess is a browser-based multiplayer drawing and guessing game. Phase 1 provides a responsive lobby, two placeholder room actions, and a live connection check. The room, game, drawing, and scoring modules are ready for implementation.

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

## Verify the connection

1. Run `pnpm dev` and open [the lobby](http://localhost:3000).
2. The status begins at **Connecting**. The browser sends the shared `ping` event when Socket.IO connects. The badge changes to **Connected** after the browser receives and validates the matching `pong`.
3. Focus or hover over the badge to see the round-trip time. If a connection attempt fails, the badge reports it and offers a retry.
4. In another terminal, run the smoke check:

   ```powershell
   Invoke-RestMethod -Uri http://localhost:3001/health | ConvertTo-Json -Compress
   pnpm --filter @draw-and-guess/web test:connection
   ```

   The health response is `{"status":"ok"}`. For a customized setup, set `NEXT_PUBLIC_SOCKET_URL` and `FRONTEND_URL` in the terminal before running the smoke check.

## Structure

```text
draw-and-guess/
├── apps/
│   ├── web/
│   │   ├── scripts/               Connection smoke check
│   │   └── src/
│   │       ├── app/               App Router and lobby styles
│   │       ├── components/
│   │       │   ├── ui/            shadcn/ui primitives
│   │       │   ├── lobby/         Phase 1 lobby
│   │       │   ├── game/
│   │       │   └── canvas/
│   │       ├── hooks/
│   │       ├── lib/
│   │       ├── stores/
│   │       └── types/
│   └── api/
│       └── src/
│           ├── main.ts
│           ├── app.module.ts
│           ├── common/            Environment, adapter, gateway, and health
│           ├── rooms/
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

The lobby owns one Socket.IO client lifecycle through its hook. Zustand holds connection status and empty slots for the local player and room view. The API will own room membership and game decisions. When canvas work begins, mount React Konva from a client component via `next/dynamic` with `ssr: false`.

## Phase 2

Start with server-owned in-memory rooms. Add typed create/join acknowledgments and room snapshots, validate inputs with Zod, and enforce the 2–8 player limit. Wire up the lobby actions and verify two browsers receive the same membership updates. Add host controls, disconnect cleanup, and namespaced events before implementing turns or drawing synchronization.
