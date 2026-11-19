# Coding agent guide — Escape60
Read README.md, docs/02_GAME_DESIGN.md and docs/13_DECISIONS.md before changing systems.

## Current state
Playable WebGL2 voxel browser game, **deployed on Arvan Edge** (https://escape60.lavanai2525-3qem7.arvanedge.ir, see docs/22_DEPLOYMENT.md). `edge/app.mjs` runs tickets, chunked replay verification, leaderboard (Object Storage) and AIaaS features on the edge; `server/server.mjs` is a local dev host for the same app. Durable storage/AI depend on the edge variables being set — check `/api/v1/health` (`storage`, `ai`) before claiming them. Do **not** claim the official entry completed or mobile QA passed. The simulation must use `web/src/dmath.js` instead of Math.sin/cos/atan2/hypot (engine differences break replay).
Visual overhaul (renderer in `web/src/gfx/`, pixel UI, closer chase camera), licensed audio (`web/assets/audio/`, CC0/CC-BY — keep CREDITS.md in sync), progression (`web/src/meta.js`) and share cards (`web/src/share.js`) are implemented and documented with real screenshots in `docs/screenshots/`. Simulation is 1.5.0 (street network in `web/src/map.js`, health bar, out-of-view spawning, skill chain). The renderer, minimap and pedestrians must read the same `cityMap(seed)`. Pedestrians (`web/src/gfx/peds.js`) and the comic layer (`web/src/gfx/comic.js`) are visual only. Real-device FPS and an audible mix check are still outstanding (docs/25). Do not mark visuals as matching the concept references.
- Audio rule: only CC0 / CC-BY sources with a verified license page; never GPL, share-alike, non-commercial or ripped game audio.

## Commands
- `npm start`: serve game + local API on localhost:4173
- `npm test`: deterministic replay tests
- `npm run check`: tests plus syntax checks
- `npm run build`: create deployable static site at dist/
- `npm run test:browser` / `npm run capture`: mobile smoke test and real screenshot capture (server must be running)

## Rules
- Never change physics without syncing browser and `server` authoritative replay behavior; bump SIM_VERSION for breaking changes.
- Never accept score/time from browser without recomputing game state from trace.
- Use original assets only; no GTA branding or ripped graphics.
- No analytics/cookies, accounts, PII, or fake players. Make offline rank status clear.
- Do not commit credentials or `.env` files.
- Keep bundle light, prioritize 60fps on midrange mobile and native touch gestures.
- When production changes are made, run tests and verify the actual URL.

## Target visual redesign (authoritative specification)
Before any graphics or UI redesign, read [`docs/23_VOXEL_3D_VISION_FA.md`](docs/23_VOXEL_3D_VISION_FA.md). The approved target is **real 3D voxel/pixel-art**, using locally bundled Three.js. The document is a design target; do not mark it implemented until code and tests verify it. Preserve deterministic gameplay/server replay and report actual browser screenshots, not concept art.

Use docs/24_TROPICAL_NEON_DIRECTION_FA.md for palette and art direction. The browser renderer consumes simulation state. Update both version constants and replay tests when changing rules.
