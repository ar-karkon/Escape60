# ESCAPE 60 — Street Pursuit

**An original, free browser street-pursuit racing game.** Drift, boost and take down the police in Sunset Bay — an open coastal city with curved boulevards, a roundabout, canyon hairpins, a coastal highway and a port. Survive the first 60 seconds to "escape", then keep going in overtime while the heat rises, until your car is wrecked or busted. Runs on phones, tablets and desktops (touch, keyboard and gamepad), in English and Persian.

![Gameplay](docs/screenshots/desktop-drive.png)

## Play locally

Requires Node.js 20+.

```bash
npm install            # dev tools only (esbuild); the game itself has no runtime dependencies
npm start              # http://localhost:4173 — game + local game service (leaderboard, replay)
npm test               # deterministic simulation + replay/anti-cheat tests
npm run check          # tests + syntax check of every module
npm run build          # deployable static site + edge worker in dist/
npm run test:browser   # mobile smoke test incl. a real verified run (needs npm start)
npm run capture        # real screenshots into docs/screenshots (needs npm start)
npm run deploy         # release to Arvan from your computer (asks for the storage keys)
```

**Controls** — touch: hold the left or right half of the screen to steer · BRAKE (drifts with the handbrake while you steer) · tap NITRO to boost (tap again to stop). Keyboard: ← → / A D steer · ↓ / S brake · Space handbrake · Shift / ↑ / W nitro · P pause · Enter retry. Gamepad: stick steer · A handbrake · RT / X nitro · LT / B brake · Start pause.

## What's in the game

- **Sunset Bay map** (`web/src/map.js`): ~24 km of hand-authored roads (Catmull-Rom curves) — warped downtown grid with a roundabout and a plaza, Ocean Boulevard, a sweeping coastal highway with a bridge over the marina, a winding canyon with hairpins, a lake loop, Old Town lanes, the port road and five **pit stops**. Drivable space is a smooth signed-distance field (filleted junction corners), shared bit-for-bit by the game, the server replay, the renderer and the minimap.
- **Arcade drift physics** (`web/src/simulation.js`, SIM 2.0.0): automatic throttle, brake, handbrake slides, counter-steer, nitro, impact-scaled damage, a car that **limps and smokes when damaged**, **3 repairs** at pit stops, **explosion** at zero health, busted meter, takedowns (ram cops or make them crash), near misses, roadblock dodges, drift banking and a ×8 skill chain. Heat rises 1→5 over time with cruisers, interceptors, SUVs, roadblocks, spike strips and a helicopter. The 60 s mark is a milestone (+2,500, slow-motion celebration) — the run continues.
- **14 cars** (`web/src/cars.js`), each inspired by a classic road car shape (JDM coupes, hot hatches, touring sedans, muscle cars, a rear-engine classic, wedge supercars) with fictional names, no badges, their own stats (speed, acceleration, handling, drift, nitro, armour) and procedural lofted 3D bodies (`web/src/gfx/carmodel.js`). 16 paints and 5 liveries.
- **Selectable effects** in the garage: drift smoke (clean, comic, neon, rainbow, fire), nitro flame (blue jet, toxic, plasma, inferno), trails (light trails, neon tyres), combo bursts (graffiti, electric, minimal) and an accent colour.
- **Feel**: camera director with speed FOV, acceleration lag, brake dive, handbrake roll, drift flank view, nitro punch with zoom blur, chromatic aberration and graffiti wings, trauma-based impact shake, hit-stop and slow motion on big moments; skid marks, sparks, backfires, damage smoke and fire, explosions with debris and shockwave, knock-over street furniture (lamps, hydrants with water jets, benches, palms…).
- **Identity**: the original Sunset Bay soul — pixel logo, Rooyin Free + Jersey 10 pixel fonts, pixel icons and pixel-frame UI, magenta synthwave sunset with a striped retro sun and pixel clouds — merged with the new 3D world.
- **Look** (`web/src/gfx/`): stylised PBR city with procedural facades and lit windows, glossy clear-coat car paint with sky reflections, wet-road sheen at night, sea and lake water, palms, pines, cliffs, landmarks (fountain roundabout, ferris wheel pier, lighthouse, port cranes, bridge, hillside letters), three times of day (sunset, night, day), HDR bloom and filmic grading. Adaptive quality for weak phones.
- **Audio**: licensed music and SFX (CC0 / CC-BY, see `web/assets/audio/CREDITS.md`) plus synthesised explosion, nitro, repair, backfire, wind and gear-shifted engine pitch.
- **Progression & sharing**: XP and levels unlock cars, paints and effects; three daily missions and a day streak; daily shared route and friend-challenge links; share cards (story / post / wide) from a real in-engine frame with a QR code.
- **Fair leaderboard**: the browser records only the input trace. The game service (`edge/app.mjs`) re-simulates every run with the same simulation (signed tickets bind route and car, chunked replay with HMAC checkpoints, single-use runs) before it is ranked. `web/src/dmath.js` keeps trigonometry identical across engines.

## Project layout

```text
web/index.html, web/style.css   UI shell (HUD, garage, results, dialogs)
web/src/main.js                 game flow, input (touch / keyboard / gamepad), HUD, events, share
web/src/simulation.js           deterministic 60 Hz rules (browser + server replay)
web/src/map.js                  Sunset Bay road graph, distance field, pit stops, zones
web/src/cars.js                 14 cars, police and traffic definitions
web/src/render.js               renderer: camera director, actors, lights, effects, post
web/src/gfx/                    materials, sky/TOD, city builder, props, car models, particles, effects, post
web/src/ui/                     minimap and icons
web/src/i18n.js                 English / Persian strings
web/src/meta.js                 XP, unlocks, garage choices, missions, challenge links
edge/                           game service (edge worker) + S3-compatible storage client
server/server.mjs               local dev server running the same game service
tests/                          simulation and API tests
scripts/                        build, checks, smoke test, screenshot capture, map preview
docs/                           design, decisions, deployment and status
```

## Deployment

`npm run build` produces `dist/web/` (static site; works on any static host and on the edge proxy) and `dist/edge/worker.js` (API + static proxy). See `docs/22_DEPLOYMENT.md`. `npm run deploy` releases from your own computer without CI: it uploads only changed files, guides the one panel step (pasting the edge worker) and verifies the live URL. The game service needs only an S3-compatible bucket (`S3_ACCESS_KEY`, `S3_SECRET_KEY`); without it the leaderboard falls back to memory. Replays run in chunks (`REPLAY_CHUNK`, default 300 ticks) to fit small per-request CPU budgets.

**Status:** see `docs/00_STATUS.md`. Real-device FPS and an audible mix check are still outstanding; the live deployment must be rebuilt and redeployed for this version.

## License

The repository is public but there is currently **no explicit open-source license**. All game art is original procedural code; car shapes are inspired by real cars but carry no brands, names or logos. Fonts (Rooyin Free, Jersey 10, Vazirmatn — SIL OFL) and audio (CC0 / CC-BY) keep their own licenses.
