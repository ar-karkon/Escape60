# ESCAPE 60 — فرار ۶۰

**An original, fully playable, mobile-first 60-second arcade police chase game.** Built for ArvanCloud Edge Games. Sunset Bay is a 3D voxel / pixel-art tropical neon city built from original procedural models, rendered with a locally bundled Three.js r170 (MIT), HDR bloom and a pixel-art UI.

**Status (2026-11-19):** browser game and local persistent replay-validated leaderboard implemented. Arvan Edge production deployment **not** performed and no live competition entry has been submitted. Online leaderboard requires an API origin; static-only deployment plays offline and displays local bests honestly.

## Run and play

Requires Node.js 20+; no `npm install` is necessary.

```bash
npm start
# open http://localhost:4173
npm test
npm run check          # tests + syntax check of every module
npm run build
npm run test:browser   # mobile smoke test (needs npm start)
npm run capture        # real 390x780 screenshots into docs/screenshots (needs npm start)
```

On mobile, drag across the screen or press the steering buttons (pressing during the 3-2-1 countdown starts immediately). On desktop, press Left/Right or A/D, and P/Esc to pause. Survive for 60 seconds. Each crash costs one of three lives. Avoid traffic, police cars, buildings, and roadblocks. Close calls and precise driving add skill points. Use **Replay**, **Share challenge**, or **New challenge** after each round.

## Sunset Bay

The same 3D city renders the menu, race and finish. Each 520-unit simulation block maps to a 52-unit scene tile built as one merged voxel mesh; windows, road markings, wet puddles, water and neon signs are drawn procedurally in the shader. Every visible wall sits on the simulation footprint, so what you hit is what you see.

- **Districts:** waterfront (marina with yachts, beach with umbrellas and lifeguard tower, palm park with fountain, pier ferris wheel), downtown (glass towers, Art Deco hotels with neon colonnades, apartments), boulevard/highway (overpass with highway signs, motels, gas stations, parking garages, billboards), Old Town (pastel shop houses, alleys with string lights, rooftop terraces).
- **Vehicles:** detailed hero coupe with stripes and spoiler, police cruiser and SUV with strobing light bars, taxi/van/sedan/hatch traffic, a pursuit helicopter with searchlight after 25 s, striped roadblocks.
- **Light & FX:** low magenta sunset with shadows, striped retro sun, pixel clouds, sea glitter, distant skyline and bay bridge, street-lamp pools, wet-road reflection streaks, police strobes on the asphalt, drift smoke, skid marks, sparks, confetti on a win.
- **Camera:** close rear three-quarter chase (~9.4 up, 14 behind) with speed FOV, damping, steer roll and hit shake; buildings in front of the car dissolve. Off-screen police show as an edge arrow.
- **Quality:** adaptive resolution / shadows / bloom; «گرافیک سبک» in settings; `?q=high` or `?q=low` pins a tier for benchmarks.

The 1.4.0 simulation builds a real street network per seed (avenues every third street, T-junctions, dead ends, closed blocks that become parks, plazas, malls and car parks), drives traffic along it, adds patrols at 8, 18, 30, 42 and 52 seconds with roadblocks from 20 seconds, uses a 0–100 health bar where damage scales with how hard you hit (with slow regeneration), spawns traffic and police outside the visible range, and keeps the skill chain: near misses and roadblock dodges in quick succession multiply points up to ×5 (any hit resets it). Everything is verified by the same server replay. Downtown increases traffic frequency and highway driving has a higher speed cap. Local and server rankings use version-specific keys. The static bundle includes Three.js, the fonts (Rooyin Free, Jersey 10, Vazirmatn — SIL OFL) and their licenses, so gameplay needs no CDN requests.

Real 390×780 engine screenshots: [Menu](docs/screenshots/menu.png) · [Driving](docs/screenshots/coastal.png) · [High-pressure chase](docs/screenshots/pursuit.png) · [Results](docs/screenshots/results.png) · [Share sheet](docs/screenshots/share-sheet.png) · share cards [Story](docs/screenshots/share-story.jpg) / [Post](docs/screenshots/share-post.jpg) / [Wide](docs/screenshots/share-wide.jpg) · [Side by side with the concept references](docs/screenshots/comparison.jpg). Concept references live in `design/references/`; the remaining visual gaps are listed in `docs/25_VISUAL_QUALITY_AUDIT_FA.md`.

## Delivered

- Deterministic seeded 60Hz game loop, escalating police AI (chasers from behind, head-on interceptors), busy traffic that enters out of view, buildings, roadblocks, impact-scaled health bar with regeneration, drift/near-miss/dodge scoring with a ×5 skill chain, 60-second win condition.
- Real street network with dead ends and a heading-up minimap (streets, dead ends, police, roadblocks); automatic quality for weak phones.
- Walking pedestrians that cross streets and leap clear of cars; softer rendering with comic ink outlines, halftone shading and graffiti-style drift effects; Persian UI in the Rooyin pixel font.
- 3D voxel tropical neon city with HDR bloom, pixel UI, countdown, combo meter, event popups, pause on tab hide, touch and keyboard controls.
- **Music & sound:** five synthwave/retrowave tracks (menu, three rotating chase tracks, results) and recorded SFX — engine, tyre squeal, police siren with stereo position, helicopter, crash, whooshes, horn, combo/level stingers — all CC0 / CC-BY from OpenGameArt, credited in-game and in `web/assets/audio/CREDITS.md`. Separate music / SFX switches.
- **Keep-playing loop:** XP and levels, eight unlockable paint jobs in the garage, three daily missions, a day streak bonus, "new record" and friend-target markers on the timer, instant retry (Space / Enter).
- **Share & challenge:** share sheet with real in-engine cards in three formats — Story 9:16 (Instagram / Telegram / WhatsApp status), Post 4:5 and Wide 16:9 (X / Telegram) — each with the run's real numbers and a QR code. Native share sends the image on phones; direct Telegram, X and WhatsApp links; download; copy link. Challenge links carry the seed and the friend's target (`?seed=…&c=time.points`), which the game shows as an unverified target and compares at the end.
- Daily UTC seed and portable challenge URL, local best persistence, Open Graph / Twitter card meta.
- Node HTTP API with no dependencies, disk-backed leaderboard, session tokens, simple in-memory throttling, and server-authoritative replay of quantized steering trace. No personal registration needed.
- Edge Service-Worker-style proxy adapter with daily challenge at Edge and validation gates (not deployed/tested on Arvan runtime).
- Tests, CI, operational guide, pre-existing GDD and design rationale.

## Project layout

```text
web/                    static HTML/CSS/WebGL2 browser game
web/src/simulation.js   deterministic rules imported by game AND Node score verifier
web/src/map.js          seeded street network (shared by simulation, server replay, renderer, minimap)
web/src/main.js         UI flow, controls, countdown, fixed-timestep loop, share and API handling
web/src/render.js       camera director, tile streaming, actors, lights and FX orchestration
web/src/gfx/            voxel builder + shader patterns, city kit, props, cars, sky, FX, HDR post
web/src/ui/icons.js     original pixel icon set
web/src/ui/minimap.js   heading-up minimap
web/src/audio.js        music streaming, SFX buffers, engine/siren/squeal/heli mix, ducking
web/src/meta.js         XP, levels, paints, daily missions, streak, friend-challenge parsing
web/src/share.js        social share cards (story/post/wide) with QR, native share and network links
web/assets/             logo, OFL fonts, licensed audio (see assets/audio/CREDITS.md)
server/server.mjs       Node origin API, persisted leaderboards and replay validation
edge/worker.js          provisional Arvan Edge API adapter
scripts/                build, syntax check, browser smoke test, screenshot capture, comparison sheet
design/references/      concept art-direction references (not shipped)
docs/                   full design, rules, architecture, research and backlog
```

## Production deployment

1. Host files from `dist/` on a static HTTPS site supported by Arvan. Verify `/src/main.js` loads as a module and SPA route fallback is not required.
2. Deploy `server/server.mjs` on **persistent Node hosting** for leaderboards, configure `ESCAPE60_SECRET` and persistent `server/data/` volume. `PORT` defaults to `4173`.
3. If routing API via an Arvan Edge function, inspect actual Arvan-supported runtime and configure upstream/edge key using **server-side** environment or build-time injection, not browser JS. `edge/worker.js` is an adapter requiring provider validation. Route `/api/v1/*` to the worker and protect the Node origin with `REQUIRE_EDGE_AUTH=1` and `ESCAPE60_EDGE_KEY`.
4. If static and API origins are separate, set `globalThis.ESCAPE60_API_BASE` in HTML **before** the `main.js` import, and configure appropriately scoped CORS on the API. Same-origin routing is preferred.
5. Test actual public URL, no-secret exposure, rate and quota alarms, restart behavior and validity of score acceptance on mobile. Submit only once official rules are confirmed.

**Limitations:** score authenticity is deterministic replay, not tamperproof against automated clients. Rate limiting is in-memory and IP-level; edge per-isolate checks are not globally authoritative. API server needs durable storage and HTTPS. No real user telemetry or ranking is invented.

## Competition and research

The project was created for [Arvan Edge Games](https://try.arvancloud.ir/edge-games/). The original design research and decision records are under `docs/`. All historic external factual claims are source-labelled and should be verified before public marketing.

## License

The repository is public but there is currently **no explicit open-source license**. All original game artwork is procedural code. Please do not use protected GTA or Rockstar assets or branding.
