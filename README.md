# ESCAPE 60 — فرار ۶۰

**An original, fully playable, mobile-first 60-second arcade police chase game.** Built for ArvanCloud Edge Games. Sunset Bay is a 3D voxel / pixel-art tropical neon city built from original procedural models, rendered with a locally bundled Three.js r170 (MIT), HDR bloom and a pixel-art UI.

**Status (2026-11-19):** deployed on Arvan Edge Computing at **https://escape60.lavanai2525-3qem7.arvanedge.ir** (no separate server). The edge serves the game, issues signed run tickets and replay-verifies every run (full 60 s runs verified live, in signed chunks). The durable leaderboard (Arvan Object Storage) and the AIaaS mission/coach features switch on once the `S3_*` and `AI_API_KEY` edge variables are set; until then the edge falls back to in-memory storage and a deterministic mission. The competition entry has not been submitted yet. Edge architecture page: `/edge`.

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

The simulation (1.5.0; 1.4.0 rules with engine-independent trig) builds a real street network per seed (avenues every third street, T-junctions, dead ends, closed blocks that become parks, plazas, malls and car parks), drives traffic along it, adds patrols at 8, 18, 30, 42 and 52 seconds with roadblocks from 20 seconds, uses a 0–100 health bar where damage scales with how hard you hit (with slow regeneration), spawns traffic and police outside the visible range, and keeps the skill chain: near misses and roadblock dodges in quick succession multiply points up to ×5 (any hit resets it). Everything is verified by the same server replay. Downtown increases traffic frequency and highway driving has a higher speed cap. Local and server rankings use version-specific keys. The static bundle includes Three.js, the fonts (Rooyin Free, Jersey 10, Vazirmatn — SIL OFL) and their licenses, so gameplay needs no CDN requests.

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
- **Arvan Edge game service** (`edge/app.mjs`): daily challenge, HMAC run tickets, authoritative 60 Hz replay of the steering trace *on the edge* (chunked with signed checkpoints to fit the per-request CPU budget), single-use runs, leaderboard and daily stats in Arvan Object Storage via a WebCrypto SigV4 client, call-sign labels instead of names, no personal data.
- **AI Special Event (Arvan AIaaS, DeepSeek-V4-Flash):** once per UTC day the edge asks the model for a title, briefing, three objectives from a whitelist (goals clamped) and police-radio lines; output is schema-validated and frozen in storage with a conditional write so every player and every edge node gets the same event. Objectives are judged from the replayed result (★ in the leaderboard). Deterministic fallback when the model is unavailable.
- **AI police radio** in the HUD (model-written lines triggered by real game events, synthesized squelch) and an **AI coach report** for verified runs (cached, daily budget).
- Deterministic math (`web/src/dmath.js`): Arvan's runtime, Safari and Firefox return different last bits for `Math.sin/cos/pow` than Chrome/Node, so the simulation uses its own IEEE-exact trig.
- Local dev server (`server/server.mjs`) runs the same edge app with a disk store.
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
web/src/mission.js      AI special event: whitelist, validation, judging, radio lines, fallback
web/src/dmath.js        engine-independent sin/cos/atan2/hypot for deterministic replay
web/edge.html           /edge — live architecture and stats page for judges
edge/app.mjs            game service (tickets, chunked replay, leaderboard, AI) — runs on Arvan Edge
edge/s3.mjs             Arvan Object Storage client (SigV4 on WebCrypto) + memory store
edge/worker.js          Arvan Edge entry: API + static proxy to the public bucket
server/server.mjs       local dev server running the same edge app with a disk store
scripts/                build, syntax check, browser smoke test, screenshot capture, comparison sheet
design/references/      concept art-direction references (not shipped)
docs/                   full design, rules, architecture, research and backlog
```

## Production deployment (Arvan, as deployed)

See `docs/22_DEPLOYMENT.md`. In short: `npm run check && npm run build`, upload every file in `dist/web/` to the public bucket `escape60-game`, paste `dist/edge/worker.js` into the `escape60` edge compute, and set the edge variables `S3_ACCESS_KEY`, `S3_SECRET_KEY` (private bucket `escape60-data`) and `AI_API_KEY` (AIaaS machine user). Values are JSON, so strings need double quotes.

**Limitations:** deterministic replay proves a run is *possible*, not that a human played it (a bot could still submit a perfect trace). Rate limiting is per edge isolate. Real-device FPS and an audible mix check are still outstanding.

## Competition and research

The project was created for [Arvan Edge Games](https://try.arvancloud.ir/edge-games/). The original design research and decision records are under `docs/`. All historic external factual claims are source-labelled and should be verified before public marketing.

## License

The repository is public but there is currently **no explicit open-source license**. All original game artwork is procedural code. Please do not use protected GTA or Rockstar assets or branding.
