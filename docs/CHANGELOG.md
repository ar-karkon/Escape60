# Changelog

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
