# Build progress (2026-11-19)

## v3.5.1 (current — SIM 2.2.0, API 4.1.2)
- `web/src/map.js` map v2: curved road graph + distance field + pit stops, 50 start positions (`SPAWNS`), ten districts (`district()`, also used by the rules).
- `web/src/simulation.js` SIM 2.2.0: start index per run, drift, nitro, brake, handbrake, 14 cars, damage limp, 3 repairs, wreck, busted, takedowns, milestone + overtime, daily rules from `web/src/rules.js` (contracts + police tactics).
- `web/src/render.js` + `web/src/gfx/`: stylised PBR city with per-district architecture, paving, props, gates and landmarks; camera director with aerial intro, pursuit framing and cop reveal; ghost rival; effects; post. `web/src/ui/threats.js` pursuit overlay; `web/src/ui/minimap.js`.
- `web/src/main.js` / `index.html` / `style.css`: racing HUD, district cards, live-rank and rival chips, police radio, contracts, crew chief, garage, results, English + Persian.
- `edge/` game service = edge referee (API 4.1.2): tickets (seed + car + start + rules), live referee, final replay, leaderboard, ghost rival, PNG cards and `/r/<id>` previews, telemetry for `/edge`, Brotli/gzip static, AIaaS director (`edge/ai.mjs`) with handwritten fallbacks.
- Tests: 31 Node tests (`npm test`); `scripts/browser-smoke.cjs` plays a real run verified live and finally (dev server and built worker); `npm run capture` real screenshots.
- Not verified: real-device FPS, audio mix by ear, Safari, the live redeploy of v3.x on Arvan, prompts against the live model.

## Earlier versions (history)

## Implemented and locally testable
- `web/`: full mobile-first static browser game, original rendering and input.
- `web/src/simulation.js`: seeded 60Hz physics, pursuit, collision, scoring, hazard director and replay.
- `server/server.mjs`: local server with real persistence and authoritative replay validation.
- `tests/`: deterministic, tamper and backend checks.
- `.github/workflows/test.yml`: CI without external NPM packages.

- `web/src/gfx/` + `web/src/render.js`: visual overhaul (voxel city kit, detailed vehicles, HDR bloom, close chase camera, FX); `web/style.css` + `web/src/ui/icons.js`: pixel UI. Real screenshots: `docs/screenshots/`.

## Not done / must not be represented as done
- Owner sign-off on the visual overhaul (concept references in `design/references/` are targets, not achieved parity).
- Frame-rate measurement on a real mid-range phone (only software-GL numbers exist).
- Intermittent 500 on a live referee request: a verified run recovered, but the browser smoke test still reports it.
- Production storage is provisioned and persistent; monitor live contention and timeouts.
- Real mobile browser manual QA and playtest / performance benchmarks.
- Official competition registration and confirmation receipt.
- The public URL is live; keep monitoring it before judging.

## Design decisions promoted for implementation
- D04: perspective follow camera in a procedural voxel city.
- D05: drag steering, virtual left/right buttons and keyboard.
- D06: original neon fictional city.
- D07: collision-based 3-health failure; near misses + drift score; 60s victory.
- D08: locally vendored Three.js r170 with instanced voxel geometry.
- D09: seed-specific share URLs, daily UTC seed.
- D10: score compared by survival time then points.
- D11: Node durable origin with deterministic replay + separate provisional Edge route.

## Followups
1. Run `npm test`, `npm start`; manual test with Chrome/iOS Safari.
2. Configure Arvan static site and confirm Edge worker routing, outbound HTTPS and env injection.
3. Deploy Node origin with HTTPS/persistent volume or replace storage adapter with managed DB.
4. Test live scoring under concurrent games, verify fairness and throttle.
5. Submit official entry and document receipt.
