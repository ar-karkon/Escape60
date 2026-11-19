# Build progress (2026-11-19)

## v3.0 (current)
- `web/src/map.js` map v2 (curved road graph + distance field + pit stops), `web/src/simulation.js` SIM 2.0.0 (drift, nitro, brake, handbrake, 14 cars, damage limp, 3 repairs, wreck, busted, takedowns, milestone + overtime), `web/src/cars.js`.
- `web/src/render.js` + `web/src/gfx/` rebuilt (stylised PBR city, procedural cars, effects, camera director, post); `web/index.html` / `style.css` / `main.js` new racing UI, garage, English + Persian.
- `edge/app.mjs` API 3.0.0 without AI; `tests/` 14 Node tests; `scripts/browser-smoke.cjs` passes a real verified run; `npm run capture` real screenshots.
- Not verified: real-device FPS, audio mix by ear, Safari, live redeploy of v3.0.

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
- Actual Arvan Edge environment smoke test and deployment.
- Credential provisioning and origin persistence (production).
- Real mobile browser manual QA and playtest / performance benchmarks.
- Official competition registration and confirmation receipt.
- A real public URL that the edge judges can visit.

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
