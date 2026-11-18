# Coding agent guide — Escape60
Read README.md, docs/02_GAME_DESIGN.md and docs/13_DECISIONS.md before changing systems.

## Current state
Playable Canvas browser game with Node replay-verified local online leaderboard. Edge adapter exists but is untested on ArvanCloud. Do **not** claim Arvan deployed, official entry completed or mobile QA passed.

## Commands
- `npm start`: serve game + local API on localhost:4173
- `npm test`: deterministic replay tests
- `npm run check`: tests plus syntax checks
- `npm run build`: create deployable static site at dist/

## Rules
- Never change physics without syncing browser and `server` authoritative replay behavior; bump SIM_VERSION for breaking changes.
- Never accept score/time from browser without recomputing game state from trace.
- Use original assets only; no GTA branding or ripped graphics.
- No analytics/cookies, accounts, PII, or fake players. Make offline rank status clear.
- Do not commit credentials or `.env` files.
- Keep bundle light, prioritize 60fps on midrange mobile and native touch gestures.
- When production changes are made, run tests and verify the actual URL.
