# Changelog

## 3.5 — city briefing, police radio, crew chief (SIM 2.2.0, API 4.1.0) — 2026-11-19
- **Daily city briefing**: once a day a language model on Arvan AIaaS (DeepSeek-V4-Flash) writes the theme, a briefing, three **contracts** with point rewards and the **police tactics** of the day (heat pace, patrol rate, interceptors, roadblocks, spike strips, traffic). The simulation plays by these bounded rules (`web/src/rules.js`), the edge freezes them for everyone and signs them into every daily ticket. Home card **TODAY**, contract popups, progress in the pause menu and on the results screen.
- **Police radio**: a daily bank of dispatcher lines in English and Persian reacts to the chase (heat, roadblocks, takedowns, near misses, pit stops, contracts, busted…), with the current district and your car filled in.
- **Dispatcher call** for every run during the aerial intro, written from your car, start district and previous result.
- **Crew chief · Ray** on the results screen: a specific tip from the edge's replay numbers, a **next target** checked during the next run, a headline used for share previews and a taunt other players hear from your ghost.
- Everything is validated and clamped (`web/src/director.js`), and handwritten bilingual fallbacks keep the game identical without the model. Nothing in the game is labelled AI; Credits → "How it's built" links to `docs/TECHNOLOGY.md` (Persian: `TECHNOLOGY.fa.md`).
- `/edge` shows today's briefing and model calls/tokens/latency; `npm run deploy` checks AIaaS; 31 tests incl. a mocked AIaaS gateway and hostile model output.

## 3.4 — the edge referee (API 4.0.0) — 2026-11-19
- **Live referee**: every 5 s the game sends its input trace; the edge re-simulates the new ticks, answers with its own score and your **live global rank** (LIVE chip under the minimap). Checkpoints are HMAC-bound to the exact input prefix, so the final verdict only replays the last seconds.
- **Pacing proof**: inputs may not arrive faster than real time — speed hacks are refused mid-run.
- **Ghost rival**: the edge picks the verified run just above your best (your friend's run when you open their link, your own best when the board is empty) and sends its inputs; the game re-simulates it bit-exactly as a holographic ghost car with a name tag, minimap diamond, live points delta and a RIVAL BEATEN moment.
- **Edge-drawn share cards**: pixel-art PNG cards encoded on the edge (custom O(logical pixels) PNG encoder); verified runs share `/r/<id>` links with Open Graph previews that open the same route with the score as the target.
- Results show the percentile among today's runs and the rival outcome.
- **Brotli/gzip negotiation** at the edge (game bundle 732 KB → 176 KB), counted bytes saved.
- **`/edge` dashboard** (EN/FA): live telemetry merged across edge isolates, pipeline, Live Lab (a bot drives a real run while you try to cheat), edge benchmark, recent verified runs, refusals by reason.
- `npm run edge:local` runs the built worker locally; `npm run deploy` uploads the new files and verifies compression and `/edge`.

## 3.3 — pursuit awareness, ten districts, start anywhere — 2026-11-19
- **Police you can feel**: off-screen police are shown by pixel chevrons on a ring around your car (distance, pulse speed rising as they close), siren light bleeds in from the screen edge they are coming from, markers with lock-on brackets over visible police, a flashing tail warning when a cop is right behind you, and brighter light bars that stay readable at distance.
- **Pursuit camera**: police closing from behind lift the camera; a cop on your tail makes it crane back and up until the chaser is framed with your car above the touch controls. The first time a cop locks onto you the camera does a slow-motion crane shot from behind the cop (with a synthesised siren whoop and a banner), then returns. Cooldown 15 s; reduced motion keeps the banner only.
- **Start anywhere (SIM 2.1.0, API 3.1.0)**: 50 start positions spread over every district, built deterministically from the road graph. Each run picks a new one; the start index is part of the run, signed into the ticket and replayed by the game service. Friend-challenge links carry the start.
- **Aerial intro**: every run opens high above the far side of the city, flies over the rooftops toward your car (gold "YOU" beacon) and swoops down behind it for the 3-2-1; the HUD steps aside meanwhile and a pixel card names the district. Any input skips. Driving into another district shows its name.
- **Ten districts with their own identity**: glass towers with coloured crowns, helipads and rooftop screens (Downtown); dark blocks with neon slab lines, vertical blade signs, neon lamps, vending machines and glossy dark paving (Neon Mile); brick walk-ups with arched windows, cornices, water tanks and fire escapes (Brick Row); stucco houses with shutters, terracotta hip roofs, flower balconies, cobbled lanes, lanterns, festoon lights and a bell tower (Old Town); pastel deco hotels with streamline corner towers and pink paving (Ocean Drive); corrugated warehouses with sawtooth roofs, silos and fuel tanks on concrete (The Docks); white villas with pools and cypresses (Palm Heights); ribbon-window campus buildings with green roofs, solar arrays and a glass dome (Tech Park); wind turbines and a roadside diner (Red Canyon); gazebo and boathouse (Lakeside Park). Named gates span the road where you enter a district.

## 3.2.1 — slimmer bars, deploy without CI — 2026-11-19
- Health and nitro side bars are slimmer and shorter (28 px column, 10 px track).
- `npm run deploy`: one-command release to Arvan from your own computer — uploads only changed files to the bucket, guides the edge-worker paste, switches `index.html` last and verifies the live URL. SigV4 signing tested against AWS's published examples.

## 3.2 — mobile controls and HUD layout — 2026-11-19
- Touch steering: hold the left / right half of the screen (edge glow shows the held side); the steering buttons are gone.
- Vertical health (left edge, with the three repair icons) and nitro (right edge) bars.
- One centred bottom cluster on a 4 px grid: BRAKE · DRIFT (handbrake while steering, brake when straight), speedometer with gear and rev segments, NITRO (tap to toggle, ring shows the tank). Tighter landscape layout.

## 3.1 — identity merge — 2026-11-19
- Restored the original Sunset Bay soul on top of every 3.0 feature: pixel logo, Rooyin Free + Jersey 10 fonts, pixel icon set (plus new pixel icons for nitro, brake, wrench, globe, sun…), pixel-frame panels, buttons and cards, the yellow START ESCAPE button, the gold pixel timer, sirens, combo box, segmented health bar and square minimap.
- Magenta/purple synthwave palette with the striped retro sun and pixel clouds; purple-shadow / pink-highlight grade; sunset-orange hero with racing stripe; original paint names.
- Original Persian wording (شروع فرار، مأموریت روز، زمان بقا، تعقیب، زنجیره، گیر افتادی!) and an English counterpart.

## 3.0 — world-class rebuild — 2026-11-19
- **Map v2**: hand-authored Sunset Bay with curved roads (warped downtown grid, roundabout, plaza, Ocean Boulevard, coastal highway with marina bridge, canyon hairpins, lake loop, Old Town, port) and five pit stops; smooth distance-field collision.
- **Simulation 2.0.0** (browser + server replay + tests): drift physics, brake, handbrake, nitro; 14 car stat sets; damage limp + smoke/fire; 3 repairs; explosion at zero health; busted meter; takedowns; roadblocks with spike strips; heat 1–5; 60 s milestone then endless overtime (10 min cap); points-first ranking.
- **Renderer rebuild**: PBR-ish city with procedural facades, buildings along every curved frontage, walls / rails traced on the exact collision boundary, lane markings and crosswalks, streamed instanced props with knock-over breakables, landmarks, sea and lake, three times of day, glossy procedural cars, contact shadows, particles, selectable effects, camera director (speed / nitro / brake / handbrake / drift / impact), zoom blur, chromatic aberration, graffiti wings, slow motion.
- **UI**: new racing HUD (speedometer with gears, nitro and health bars, repairs, heat, chain), garage (cars / paint / effects), milestone overlay, results, pause, settings (language, time of day, graphics, shake), English + Persian, gamepad.
- **Audio**: synthesised explosion, nitro, repair, backfire, wind; gear-shifted engine.
- **Removed**: AI special event, AI radio, AI coach, `/edge` judges page, Arvan mentions in the product, pixel fonts, voxel renderer, pedestrians.

## 0.1.0-docs — 2026-11-19
- Established full pre-production documentation baseline based on conversation and verified official sources.
- Recorded unapproved UX/design decisions explicitly as proposals.
- No game code, deployment or launch yet.

- 2026-11-19: Public repository `ar-karkon/Escape60` initialized with baseline project documentation. No game implementation yet.

## Sunset Bay
Added local Three.js rendering, seeded voxel districts, procedural vehicles, Persian settings and leaderboard dialogs, synth sequence and four browser captures. Simulation 1.1.0 updates pursuit timing, damage deceleration, downtown traffic and highway speed.

## Visual overhaul (renderer + UI) — 2026-11-19
Simulation, scoring, daily seed and server replay are unchanged (`SIM_VERSION` 1.1.0); a scripted 60-second run was accepted by the local replay API after the change.
- New renderer split into `web/src/gfx/` (voxel builder + shader patterns, city kit, props, cars, sky, FX, HDR post).
- Chase camera moved from ~39 units high/behind to ~9.4 high / 14 behind with heading damping, speed FOV, steer roll, hit shake; cinematic menu, countdown swoop and results orbit.
- City: Art Deco hotels with Ocean-Drive colonnades, glass towers, apartments with balconies, motels, gas stations, parking garages, Old Town shop houses, marina / beach / park waterfronts, ferris wheel, overpass with highway signs, neon welcome arches, string lights, varied palms, two lamp styles, traffic lights, benches, bus stops, café sets and static pedestrians inside solid footprints.
- Vehicles: detailed hero coupe (hood bulge, sloped glass, stripes, spoiler, chrome rims, lights), police cruiser + SUV with strobing light bars, taxi / van / sedan / hatch traffic, helicopter with searchlight, roadblock barricade.
- Lighting: low magenta sun with shadows, cool sky fill, camera key light, police point lights, headlight spot, additive light pools, wet-road reflection streaks, sky-reflecting puddles, sunset fog, two-level bloom, ACES grade.
- FX: voxel drift smoke, skid marks, sparks, exhaust pops, confetti on win, hit flash, desaturation on bust.
- UI: one clean pixel stylesheet, new logo, icon set, countdown, event popups, banners, wanted sirens, laurel results card; Vazirmatn + Jersey 10 bundled locally (OFL).
- Tooling: `npm run capture` (real 390×780 screenshots), `scripts/make-comparison.cjs`, `npm run logo`, syntax check of all modules.

## 2.0 — sound, progression, sharing, visual gaps — 2026-11-19
- **Simulation 1.2.0** (browser + server replay, tests): skill chain multiplier ×1…×5, roadblock dodge award, `bestChain` / `dodges` in results. Physics, pursuit timing and colliders unchanged.
- **Audio:** 5 licensed synthwave tracks + recorded SFX (OpenGameArt CC0 / CC-BY), engine pitch with speed, tyre squeal on drift, siren loudness/pan from the nearest police car, helicopter loop, crash/whoosh/horn/combo stingers, ducking, low-pass on pause, music/SFX toggles, in-game credits. Static server now serves audio MIME types and byte ranges.
- **Progression:** XP, levels, 8 paint jobs (garage), 3 daily missions, day streak, best/friend markers on the timer bar, "new record" popups, final-5-seconds countdown beeps.
- **Sharing:** share sheet with Story 9:16, Post 4:5 and Wide 16:9 cards rendered from the real results scene with QR challenge link; native image share, Telegram / X / WhatsApp links, save, copy; friend-challenge banner and verdict.
- **Visual gaps:** Ocean-Drive coastline along the starting boulevard (open bay with pier, lighthouse and moving boats), rounded Art Deco corner towers, spire / fin crowns, porthole windows, decorative traffic on overpasses, lower helicopter in the chase frame, much denser drift smoke, stronger wet reflections, brighter water, combo bursts and FOV kick.

## 2.1 — living city, health bar, softer comic look, Rooyin — 2026-11-19
- **Simulation 1.3.0** (browser + server replay + tests): 0–100 health bar with impact-scaled damage, light wall bumps, slow regeneration; traffic and police spawn outside the visible range, city pre-populated at the start; head-on interceptors; police lead fix and late-game speed.
- **Pedestrians:** up to 80 instanced walkers (7 draw calls) that stroll, wait, use crosswalks and leap clear of any car; visual only.
- **Look:** FXAA, smooth upscaling at higher internal resolution, softer shadows, less voxel grain, comic ink outlines from depth, halftone shading in shadows, graffiti-style drift sparks, inked smoke puffs, starbursts and speed streaks; barricades drop in instead of popping up.
- **Font:** all Persian text now uses the pixel font Rooyin Free (OFL).
- **HUD:** segmented health bar with damage trail, regen glow and critical blink; damage numbers in popups; results show remaining health and best chain length.

## 2.2 — real city, minimap, harder chase, natural lights, weak-phone performance — 2026-11-19
- **Simulation 1.4.0** (browser + server replay + tests): seeded street network with avenues, T-junctions, dead ends and closed blocks; traffic drives the streets and turns at junctions; police steer around blocks; harder pursuit director.
- **City:** closed streets become pocket parks, plazas with fountains or statues, mini malls and fenced car parks; dead ends get barriers, amber blinkers and a «بن‌بست» sign; crosswalks, stop lines and traffic lights only at real junctions; pedestrians only walk open sidewalks.
- **Minimap:** heading-up map at the bottom with streets, avenues, dead ends, police (blinking, clamped to the edge), roadblocks, traffic and seconds left.
- **Lights & Unbound-style feedback:** twin-lobe headlight beams, lamp halos, anamorphic flares on oncoming headlights, brake-light response, tail-light trail ribbons at speed, graffiti streaks at top speed and a «PERFECT» tag for long drifts, cel-toned smoke.
- **Performance:** device-aware start quality and a 6-step adaptive ladder (resolution, DPR, shadows, bloom, ink/halftone, pedestrian count); traffic cars merged into one draw call; the comic layer does no canvas work while idle; shadows off on phones. In software rendering the automatic mode ran ~3× faster than forced high quality.

## 2.3 — Arvan Edge deployment, AI special event, edge replay — 2026-11-19
- **Deployed on Arvan Edge Computing** (`escape60.lavanai2525-3qem7.arvanedge.ir`): one edge compute serves the API and proxies the flat static build from the public bucket `escape60-game`. No separate server.
- **Edge game service** (`edge/app.mjs`): HMAC run tickets, authoritative replay on the edge in signed chunks (Arvan's per-request CPU budget), single-use runs, leaderboard + daily stats in Arvan Object Storage through a WebCrypto SigV4 client with conditional writes, call-sign labels, `/api/v1/stats`, `/edge` evidence page.
- **AI special event** (AIaaS, DeepSeek-V4-Flash): daily title, briefing, three whitelisted objectives and police-radio lines, validated and frozen per day; judged from the replay; ★ in the leaderboard; deterministic fallback.
- **AI police radio** in the HUD and **AI coach report** on the results screen for verified runs.
- **Simulation 1.5.0:** engine-independent `sin/cos/atan2/hypot` (`dmath.js`) — Arvan's runtime returned different last bits for `Math.sin/cos/pow`, which made replays diverge. Rules unchanged. Collision geometry cached per cell and per-tick allocations removed (replay ~2× faster).
- Build: esbuild bundle (`dist/web` flat, `dist/edge/worker.js`); local server now runs the same edge app; share-sheet links set before image encoding (smoke-test race).
