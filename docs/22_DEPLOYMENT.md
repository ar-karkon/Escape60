# Deployment runbook — Escape60

1. Run `npm run check && npm run build` from repo root.
2. Test static game by serving `dist/` over HTTP. A static-only deploy supports offline local bests, not verified global leaderboard.
3. Deploy `server/server.mjs` with Node 20+ on persistent hosting and configure strong `ESCAPE60_SECRET`. Mount `server/data/` to durable storage. Enable TLS, backups, crash restart, rate limit at network edge.
4. Smoke-test Arvan Edge JavaScript runtime with minimal `fetch` handler, then adapt `edge/worker.js` to actual per-service secrets and outbound fetch APIs. Current code assumes Service Worker event listener and globals `ESCAPE60_EDGE_UPSTREAM` and `ESCAPE60_EDGE_KEY` (not confirmed as available in Arvan). Do not commit these values.
5. Set `REQUIRE_EDGE_AUTH=1` and matching `ESCAPE60_EDGE_KEY` on Node origin; ensure the origin cannot be bypassed via public insecure exposure.
6. Map `/api/v1/*` through Arvan Edge and serve `/` and assets on the same HTTPS origin. Check `/api/v1/health`, `/api/v1/challenges/today`, `/api/v1/runs/start` and `/api/v1/runs/finish`.
7. Confirm a legitimate 60s browser run is accepted and a tampered trace is rejected; verify leaderboard durability after restart.
8. Check official competition rules, domain/route restrictions and submit game link before deadline.

### Danger boundaries
- The Edge worker only provides request routing and perimeter validation; persistent scoreboard and replay validation are owned by Node origin.
- No non-tested Arvan provider features have been asserted as operational. Separate origin is still a deployment dependency.
- Offline mode indicates local-only result, not a verified online rank.
