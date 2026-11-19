# Coding agent guide — Escape60
Read README.md, docs/02_GAME_DESIGN.md and docs/13_DECISIONS.md before changing systems.

## Current state
Version 3.5 (2026-11-19; 3.0 was a full rebuild toward a stylised world-class street racer; owner direction: closer to the feel of modern arcade street racers with comic-style effects; AI/edge work is never labelled in the product UI — it appears as game content; judges are pointed to docs/TECHNOLOGY.md from Credits). 3.3 adds pursuit awareness (threat overlay + pursuit camera), random start positions and ten districts with their own identity. 3.4 makes the edge the referee of every run (live verification, ghost rivals, edge-drawn cards, `/edge` dashboard). 3.5 adds AIaaS gameplay content: a daily city briefing whose contracts and police tactics the simulation plays by, police radio, a dispatcher call per run and a crew chief per verified run.
- **Map** `web/src/map.js` (MAP_VERSION 2): one fixed hand-authored city with curved roads, a smooth signed-distance field for drivable space, five pit stops, a deterministic grid of start positions (`SPAWNS`) and ten named districts (`district()` — read by the renderer/UI *and* by the simulation for zone contracts and the explore goal, so moving district borders needs a SIM_VERSION bump). The simulation, server replay, renderer and minimap must all read this module.
- **Simulation** `web/src/simulation.js` (SIM 2.2.0): daily routes take bounded rules from `web/src/rules.js` (contracts judged in the sim, police tactics); runs start at `opts.spawn` (index into `SPAWNS`), drift physics, brake / handbrake / nitro inputs (trace values 0..63), 14 car stat sets (`web/src/cars.js`), damage limp, 3 repairs, wreck explosion, busted meter, takedowns, 60 s milestone then endless overtime (10 min cap). Must use `web/src/dmath.js` instead of Math.sin/cos/atan2/hypot and must not use Math.exp/pow.
- **Renderer** `web/src/render.js` + `web/src/gfx/` (Three.js r170 bundled): PBR-ish materials patched via onBeforeCompile (each patch needs its own `customProgramCacheKey`), procedural facades, city builder with marching-squares walls on the collision boundary, instanced streamed props with knock-over breakables, per-district architecture/paving/props/gates (`DIST` in `gfx/world.js`), particles + selectable effects, camera director (aerial intro, pursuit framing, cop reveal), HDR post. Visual only. Pursuit overlay: `web/src/ui/threats.js`.
- **AIaaS** `edge/ai.mjs` (prompts + calls, DeepSeek-V4-Flash, `apikey` header, thinking disabled) and `web/src/director.js` (sanitizers + handwritten fallbacks): daily briefing frozen in storage, radio bank, dispatcher, crew chief. Model output must only ever reach the sim through `cleanRules()` ranges.
- **Game service = edge referee** `edge/app.mjs` (API 4.1.0, docs/06_EDGE_SPEC.md): tickets bind seed + car + start index; live referee (`/runs/live` every REPLAY_CHUNK ticks, prefix-bound HMAC checkpoints, pacing proof, live rank); final replay; ghost rival from verified traces; PNG cards (`edge/card.mjs`, `edge/png.mjs`) and `/r/<id>` previews; telemetry (`edge/metrics.mjs`) for the `/edge` dashboard (`web/edge.html`, `web/src/edgepage.js`, separate from the game UI); Brotli/gzip static delivery (`edge/static.mjs`). No AI endpoints. Deployment notes in docs/22_DEPLOYMENT.md (the live edge still runs the previous version until redeployed).
- UI: `web/index.html`, `web/style.css` (original pixel-neon system), `web/src/main.js`, English/Persian strings in `web/src/i18n.js` (add every new string in both languages).
- Do **not** claim real-device FPS, audio mix or the live deployment of v3 as verified.
- Audio rule: only CC0 / CC-BY sources with a verified license page; synthesised Web Audio sounds are original. Never GPL, share-alike, non-commercial or ripped game audio.

## Commands
- `npm start`: serve game + local API on localhost:4173
- `npm test`: deterministic replay tests
- `npm run check`: tests plus syntax checks
- `npm run build`: create deployable static site at dist/
- `npm run test:browser` / `npm run capture`: mobile smoke test and real screenshot capture (server must be running)
- `npm run edge:local`: run the built worker (dist/edge/worker.js) locally like the edge does, on :4174
- `npm run deploy`: release to Arvan from a machine that can reach it (uploads changed files, guides the edge paste, verifies); see docs/22_DEPLOYMENT.md

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
