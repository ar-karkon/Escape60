# Coding agent guide — Escape60
Read README.md, docs/02_GAME_DESIGN.md and docs/13_DECISIONS.md before changing systems.

## Current state
Playable WebGL2 voxel browser game with Node replay-verified local online leaderboard. Edge adapter exists but is untested on ArvanCloud. Do **not** claim Arvan deployed, official entry completed or mobile QA passed.
Visual overhaul (renderer in `web/src/gfx/`, pixel UI, closer chase camera) is implemented and documented with real 390×780 screenshots in `docs/screenshots/`; it still awaits the owner's visual approval and real-device performance measurement (see docs/25 section «پاس بازطراحی گرافیک»). Do not mark it as matching the concept references.

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
