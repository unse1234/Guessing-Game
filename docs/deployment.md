# Production deployment

## Hosting and cost

- **Frontend** — Vercel for Next.js, with Node.js 24 and a canonical HTTPS domain. Hobby is $0 for eligible personal, non-commercial use. Vercel lists Pro at $20/month, with usage-based charges where applicable. [Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) · [Hobby terms](https://vercel.com/docs/plans/hobby) · [Vercel pricing](https://vercel.com/pricing)
- **Backend** — A single native Node.js web service on Render. The `0.5c-512mb` plan is listed at $7/month for compute, with applicable workspace, bandwidth, and other charges separate. It is a starting size for release testing. Render supports WebSocket upgrades on the service port and applies no fixed WebSocket timeout. Free web services can sleep after idle periods. [Render pricing](https://render.com/pricing) · [WebSockets](https://render.com/docs/websocket) · [Free service behavior](https://render.com/docs/free)

Prices are USD and were checked on November 24, 2026. Confirm account eligibility and total billing before authorizing creation. Keep one API replica because all game state is process-local. Use a larger single instance if staging measurements require it.

## Release steps after approval

1. Approve the release revision, plans, region, and exact frontend hostname. Use a clean checkout of the approved revision. If source is still local, approve its commit and push before connecting the repository to hosting. Choose the Render region nearest the initial players. To override Render's region default, set `region` in [render.yaml](../render.yaml) before creating the service. [Render Blueprint fields](https://render.com/docs/blueprint-spec)
2. In Render, select **New → Blueprint**, select the approved repository and branch, and load `render.yaml` from its root. Supply `FRONTEND_URL` as the canonical HTTPS frontend origin, for example `https://play.example.com`. The Blueprint sets `NODE_ENV=production` and Node.js 24. Render provides `PORT`, and the API listens on it at `0.0.0.0`. Confirm one instance, `/health` as the health check, and automatic deploys off before creating the service. Set the Blueprint's **Auto Sync** to **No** once it is created. [Render port binding](https://render.com/docs/web-services) · [Health checks](https://render.com/docs/health-checks) · [Blueprint sync](https://render.com/docs/infrastructure-as-code#disabling-automatic-sync)
3. Copy the Render service's HTTPS URL. Open `/health` at that origin and check for HTTP 200 with `{"status":"ok"}`. The Blueprint installs pinned pnpm dependencies, builds the API and shared package from the repository root, and starts `node apps/api/dist/main.js`.
4. In Vercel, import the approved repository, choose the **Next.js** preset, and use **Edit** next to **Root Directory** to select **`apps/web`**. Vercel enables **Include source files outside of the Root Directory** by default for new projects, which lets the build access `packages/shared`. For an existing project, you can check this option under **Settings → Build and Deployment → Root Directory**. Choose Node.js 24.x and leave the Output Directory at its Next.js default. Use the build and installation commands from [vercel.json](../apps/web/vercel.json). They invoke the pinned pnpm version and compile the shared package before Next.js. [Vercel monorepo setup](https://vercel.com/docs/monorepos) · [Shared source settings](https://vercel.com/docs/monorepos/monorepo-faq)
5. Add `NEXT_PUBLIC_SOCKET_URL` with the Render HTTPS origin in Vercel's **Production** environment. Start the first production build manually and add the canonical domain under **Settings → Domains** if using a custom domain. For a CLI release, run `npx vercel link --repo` from the repository root and select the configured web project, then run `npx vercel deploy --prod` from that same directory. The latter command uploads and deploys the current checkout. Git-triggered deploys are disabled in `vercel.json`. If the assigned frontend hostname differs from the original plan, update Render's `FRONTEND_URL` and restart the API before testing. [Vercel monorepo CLI](https://vercel.com/docs/monorepos) · [Manual deployments](https://vercel.com/docs/deployments) · [Git deployment settings](https://vercel.com/docs/project-configuration/git-configuration)
6. Run the acceptance checks below on the canonical domain. Any change to `NEXT_PUBLIC_SOCKET_URL` requires a new frontend build. The API accepts one browser origin, so Vercel preview aliases and alternate hostnames need a separate, matching API configuration to play.

The browser opens Socket.IO directly against the API's HTTPS origin and upgrades to WSS. Leave `/socket.io/` on the same port as `/health`. If a custom reverse proxy is introduced, preserve the Origin header, HTTP upgrade, and idle timeout long enough for Socket.IO heartbeats. Render terminates TLS before passing requests to the Node process. [Render TLS and ports](https://render.com/docs/web-services) · [Render WebSockets](https://render.com/docs/websocket)

## Production acceptance

Run the existing smoke script from an approved checkout. Replace the example origins with the actual canonical frontend and backend.

```powershell
$env:FRONTEND_URL = 'https://play.example.com'
$env:NEXT_PUBLIC_SOCKET_URL = 'https://api.example.com'
Invoke-RestMethod -Uri "$env:NEXT_PUBLIC_SOCKET_URL/health"
pnpm --filter @draw-and-guess/web test:connection
```

The script checks health, exact HTTP CORS origin, polling, WebSocket, and rejection of a foreign WebSocket origin. Then use separate devices and networks when available:

1. Open the canonical HTTPS frontend. Verify JavaScript and CSS load and inspect `/socket.io/` in browser DevTools for a WSS upgrade.
2. Create a room as host and join from another device. Verify player and host state on both devices.
3. Start the game, verify only the drawer sees the word options, and select a word. Draw, erase, and clear; verify the canvas updates remotely.
4. Submit wrong and correct guesses. Verify score updates and a single award per correct guesser. Complete both rounds and compare final rankings on both devices.
5. Select **Play Again** as host. Verify both players return to the same lobby and the next game begins with zero scores.
6. Refresh during word selection or drawing. Verify role, deadline, authorized word data, and canvas restore. Repeat after a short network disconnect within the 15-second grace period.
7. Keep another room active during the test and verify its players, chat, scores, and drawings are isolated.
8. Verify touch drawing and keyboard chat on physical iOS Safari and Android before opening access. Browser emulation covers layout and touch regressions, with limited coverage of physical-device behavior.

## Operations and rollback

- Track CPU, memory, disconnects, rate-limit responses, and provider egress during acceptance. Process room and connection caps are safety limits and do not establish a safe hosting capacity.
- Per-peer rate limits use the actual TCP peer. A proxy may group many clients into one budget. Test simultaneous creates, joins, and reconnects behind the real ingress and verify edge protections before launch. The application does not use forwarded client IP headers for admission.
- A restart or backend deploy clears all rooms and reconnect credentials. Schedule updates between play sessions. Players need a fresh room after an instance replacement.
- For rollback, restore the last compatible web/API revision pair using the providers' deployment history. Recheck health, the canonical frontend origin, and WSS. A backend rollback also replaces the process and clears sessions.
- Check Render startup and health logs and Vercel build logs when debugging. Keep packet bodies, reconnect tokens, and private word data out of logs. Put hosting credentials in the provider dashboard or CLI authentication store.

GitHub Actions runs installation, type checking, lint, builds, and unit tests. Release creation, promotion, and public multiplayer checks require separate approval.
