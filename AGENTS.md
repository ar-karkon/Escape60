# Coding agent guide — Escape60
Read README.md, docs/02_GAME_DESIGN.md and docs/13_DECISIONS.md before changing systems.

## Current state
Version 3.0 (2026-11-19): a full rebuild toward a stylised world-class street racer (owner direction: closer to the feel of modern arcade street racers with comic-style effects; no AI/Arvan features in the product UI).
- **Map** `web/src/map.js` (MAP_VERSION 2): one fixed hand-authored city with curved roads, a smooth signed-distance field for drivable space, five pit stops. The simulation, server replay, renderer and minimap must all read this module.
- **Simulation** `web/src/simulation.js` (SIM 2.0.0): drift physics, brake / handbrake / nitro inputs (trace values 0..63), 14 car stat sets (`web/src/cars.js`), damage limp, 3 repairs, wreck explosion, busted meter, takedowns, 60 s milestone then endless overtime (10 min cap). Must use `web/src/dmath.js` instead of Math.sin/cos/atan2/hypot and must not use Math.exp/pow.
- **Renderer** `web/src/render.js` + `web/src/gfx/` (Three.js r170 bundled): PBR-ish materials patched via onBeforeCompile (each patch needs its own `customProgramCacheKey`), procedural facades, city builder with marching-squares walls on the collision boundary, instanced streamed props with knock-over breakables, particles + selectable effects, camera director, HDR post. Visual only.
- **Game service** `edge/app.mjs` (API 3.0.0): tickets bind seed + car, chunked authoritative replay, leaderboard. No AI endpoints anymore. Deployment notes in docs/22_DEPLOYMENT.md (the live edge still runs the previous version until redeployed).
- UI: `web/index.html`, `web/style.css` (original pixel-neon system), `web/src/main.js`, English/Persian strings in `web/src/i18n.js` (add every new string in both languages).
- Do **not** claim real-device FPS, audio mix or the live deployment of v3 as verified.
- Audio rule: only CC0 / CC-BY sources with a verified license page; synthesised Web Audio sounds are original. Never GPL, share-alike, non-commercial or ripped game audio.

## Commands
- `npm start`: serve game + local API on localhost:4173
- `npm test`: deterministic replay tests
- `npm run check`: tests plus syntax checks
- `npm run build`: create deployable static site at dist/
- `npm run test:browser` / `npm run capture`: mobile smoke test and real screenshot capture (server must be running)

## Rules
- Never change physics without syncing browser and `server` authoritative replay behavior; bump SIM_VERSION for breaking changes.
- Never accept score/time from browser without recomputing game state from trace.
- Use original assets only; no GTA / NFS or other game branding, ripped graphics or real car brands/logos (cars may only be *inspired* by real shapes).
- No analytics/cookies, accounts, PII, or fake players. Make offline rank status clear.
- Do not commit credentials or `.env` files.
- Keep bundle light, prioritize 60fps on midrange mobile and native touch gestures.
- When production changes are made, run tests and verify the actual URL.

## Visual direction
Keep the Sunset Bay identity (D32 in docs/13_DECISIONS.md): pixel-art UI system (pixel frames, `web/src/ui/icons.js` pixel icons, Rooyin Free for Persian, Jersey 10 for digits/Latin, original logo `web/assets/logo.svg`), magenta/purple synthwave sunset with the striped retro sun and pixel clouds, pink/cyan/gold neon accents — merged with the clean stylised 3D world of v3 (no global ink outlines or voxel noise). New UI must use the existing pixel primitives in `web/style.css`. Report actual browser screenshots (`npm run capture`), never concept art. Preserve deterministic gameplay and server replay; update both version constants and replay tests when changing rules.
