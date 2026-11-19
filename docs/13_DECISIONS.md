# Decision register / ADR log

Date: 2026-11-19

| ID | Topic | State | Current direction | Why / next evidence |
|---|---|---|---|---|
| D01 | Game concept | CONFIRMED | Arcade police-car escape, 60 seconds | User approved concept |
| D02 | Working name | CONFIRMED | Escape 60 / فرار ۶۰ | Discussed |
| D03 | Distribution | CONFIRMED | Browser/Edge competition | User intent |
| D04 | Camera | IMPLEMENTED | Close rear three-quarter chase camera (~9.4 high, 14 behind, FOV 58→64 with speed) | Hero ≈100px wide at 390px; road ahead + horizon visible; off-screen police arrow |
| D05 | Mobile controls | PROPOSED | Auto forward + finger steering | One-finger ease; test alternatives |
| D06 | Art identity | IMPLEMENTED | Sunset Bay | Tropical neon direction in document 24 |
| D07 | Mechanics | PROPOSED | Pursuit first, optional drift score | Test fun |
| D08 | Engine | IMPLEMENTED | Three.js r170, merged voxel geometry per 52-unit tile + procedural shader patterns, half-float bloom | One draw call per tile; adaptive resolution/shadows; `?q=high` lock for benchmarks |
| D09 | Competitive mode | PROPOSED | Seeded shared/daily challenges | Fair sharing |
| D10 | Score | PROPOSED | Survival time plus skill points tie-break | Needs testing |
| D11 | Backend | OPEN | Edge API + durable adapter | Runtime, quota, persistence TBD |
| D12 | Repo license | OPEN | None yet | Public visibility not a license |
| D13 | Data handling | OPEN | Anonymous/minimal | Full rule/legal review |
| D15 | Scoring 1.2.0 | IMPLEMENTED | Skill chain ×1…×5 for near misses / roadblock dodges, reset on hit; SIM_VERSION 1.2.0 | Rewards risky skilful driving; replay-verified; rankings keyed per version |
| D16 | Audio | IMPLEMENTED | Licensed CC0/CC-BY OpenGameArt music + SFX, streamed music, decoded SFX | Owner asked for free tracks with a neon-coastal mood instead of synthesis |
| D17 | Sharing | IMPLEMENTED | Story/Post/Wide cards from real frames + QR + challenge link with friend target | Friend targets are unverified link data and labelled as such |
| D21 | City layout | IMPLEMENTED | SIM 1.4.0 seeded street network: avenues, T-junctions, dead ends, closed segments as parks/plazas/malls/car parks; minimap | Owner: the city was all four-way crossroads |
| D22 | Performance | IMPLEMENTED | Device profile (GPU string, memory, cores, touch) picks a start rung; 6-step quality ladder adapts to frame time; traffic drawn in one call | Owner: must run well on weak phones |
| D14 | UI typography | IMPLEMENTED | Rooyin Free pixel font for Persian (OFL, designer Mohamad Darvishi, github.com/MohamadDarvishi/Rooyin) + Jersey 10 for digits/Latin; Vazirmatn kept only as fallback | Owner asked for Rooyin; the free OFL edition is bundled unmodified |
| D18 | Health | IMPLEMENTED | SIM 1.3.0 health bar with impact-scaled damage and slow regen | Small bumps no longer cost a whole life |
| D19 | Living city | IMPLEMENTED | Visual-only pedestrians that walk, wait, cross and leap clear of cars; traffic/police spawn out of view | Owner: city felt empty and cars popped in |
| D20 | Look | IMPLEMENTED | Softer rendering (FXAA, smooth upscale, higher internal resolution, less grain) + comic ink outlines, halftone shadows and graffiti VFX layer | Owner reference: NFS Unbound vibe; all effects original |

## ADR template
```
# ADR-XXX: short title
Date:
Status: proposed/accepted/superseded
Context:
Options:
Decision:
Tradeoffs:
Revisit triggers:
```

## D-EDGE-ONLY — all ranking logic on Arvan Edge (2026-11-19)
Status: accepted. Context: contest rewards real edge logic and says "no server needed". Decision: the edge worker issues tickets, replays runs, stores results in Arvan Object Storage and calls AIaaS; the Node server is dev-only and runs the same `createApp`. Tradeoffs: per-request CPU limit → chunked replay with HMAC checkpoints; storage is S3 objects with ETag retries rather than a database. Revisit: if Arvan exposes a KV/DB binding to edge computes.

## D-DMATH — engine-independent trig in the simulation (2026-11-19)
Status: accepted. Context: Arvan's runtime returned different last bits for Math.sin/cos/pow than V8, so a valid run failed replay. Decision: `web/src/dmath.js` (fdlibm polynomial kernels, only IEEE-exact ops), SIM 1.5.0. Also fixes latent Safari/Firefox ↔ server mismatches.

## D-AI-CONTENT-ONLY — AI writes content, never rules (2026-11-19)
Status: accepted. The model writes the daily event text, radio lines and coach text. Objectives come from a whitelist with clamped goals and are judged from the verified replay; one model call per day for the event, cached coach reports with a daily cap. Cheapest connected model (DeepSeek-V4-Flash).

## v3.0 decisions (2026-11-19, owner request: "world-class" street racer)
| ID | Topic | State | Direction | Why |
|---|---|---|---|---|
| D23 | Map | IMPLEMENTED | One fixed hand-authored city (map v2): Catmull-Rom roads through named junctions, angle-weighted smooth-min distance field (filleted corners), pit-stop pads; shared by sim, replay, renderer, minimap | Owner: "all the roads are square — I want a great map with curves" |
| D24 | Run structure | IMPLEMENTED | 60 s is a milestone (+2,500, celebration), the run continues with rising heat until wrecked / busted / 10 min cap; ranking by points then time | Owner: the game must not stop at 60 s |
| D25 | Damage & repair | IMPLEMENTED | Damage limps the car (top speed down to 66 %), smoke → fire as health drops, 3 repairs at 5 pit stops, explosion at 0 | Owner request |
| D26 | Controls | IMPLEMENTED | Auto throttle + brake, handbrake drift, nitro (trace value = steer + flags, 0..63); touch buttons, keyboard, gamepad | Nitro / brake / handbrake effects were requested |
| D27 | Cars | IMPLEMENTED | 14 cars inspired by real shapes with fictional names and own stats; lofted procedural bodies; level unlocks; paints + liveries | Owner: 14 cars inspired by real cars |
| D28 | Effects | IMPLEMENTED | Garage-selectable drift smoke, nitro, trail, burst styles + accent colour; camera feel for throttle, nitro, brake, handbrake, drift, impacts | Owner: selectable effects, camera effects, blur |
| D29 | Product scope | IMPLEMENTED | Removed AI special event, AI radio, AI coach and Arvan mentions from the product; English default + Persian | Owner: "world-class games don't have these"; global market |
| D30 | Look | IMPLEMENTED (supersedes D06/D08/D20 visuals) | Clean stylised PBR (no global ink outlines / halftone / voxels), procedural facades, glossy clear-coat cars, three times of day, filmic grade; comic effects only as selectable layers | Owner: graphics looked dirty / jarring, people's black outlines artificial |
| D31 | Fonts | REVERTED by D32 | (Barlow Condensed was used in 3.0) | — |
| D32 | Identity merge (3.1) | IMPLEMENTED | Original Sunset Bay identity restored on top of all v3 features: pixel logo, Rooyin Free + Jersey 10 (D14 again), pixel icons and pixel-frame UI, original wording, magenta/purple synthwave palette with the striped retro sun and pixel clouds, sunset-orange hero with stripes. The 3D world stays clean (no ink outlines, no voxel noise) | Owner: "the soul and identity of the previous game was lost — merge the two, the previous font was better" |
| D33 | Mobile controls (3.2) | IMPLEMENTED | Half-screen tap-and-hold steering, vertical health/nitro bars on the edges, centred brake·drift / speed / nitro cluster, nitro as a tap toggle | Owner: the button layout was uncomfortable on phones; wants pixel-perfect, tidy, comfortable UI |
| D34 | Pursuit awareness (3.3) | IMPLEMENTED | Visual-only: threat ring chevrons + distance, edge siren glow, markers over visible police, tail warning; pursuit camera frames a tailing cop with the hero; one-off cinematic reveal per cop with cooldown | Owner: police behind you were invisible; wants AAA-style cues and a camera that pulls back to show them |
| D35 | Start anywhere (3.3) | IMPLEMENTED | SIM 2.1.0: deterministic grid of 50 starts; client picks one per run, the ticket signs it, replay uses it; challenge links carry it. Daily leaderboard stays per seed (any start) | Owner: every run should start somewhere new in the city |
| D36 | Aerial intro + districts (3.3) | IMPLEMENTED | Intro flies over the city to the car (skippable); downtown split into Downtown / Neon Mile / Brick Row; ten districts with their own facades, roofs, paving, lamps, trees, props, gates and landmarks; district names in EN/FA | Owner: city was monotonous; each area needs its own urban identity; show off the size of the map |
| D38 | Edge referee (3.4, API 4.0.0) | IMPLEMENTED | The edge verifies runs live (every 5 s, prefix-bound HMAC checkpoints, real-time pacing proof, live rank), picks ghost rivals from verified traces, draws PNG share cards and link previews, negotiates Brotli/gzip and reports telemetry on `/edge`. Edge branding stays out of the game UI; `/edge` is a separate page | Owner: edge-compute usage must be deep, precise and genuinely useful for the Edge Games judging; every feature is something players feel (fair live rank, rivals, previews, faster load) |
| D37 | AIaaS in gameplay (3.5, SIM 2.2.0, API 4.1.0) | IMPLEMENTED | Daily city director (contracts + police tactics the simulation plays by, frozen per day, signed into tickets), daily police-radio bank, a dispatcher call per run during the intro, a crew-chief report per verified run (tip, next target, share headline, ghost taunt). Shown as game content only — never labelled AI; the technical explanation is `docs/TECHNOLOGY(.fa).md`, linked from Credits → "How it's built". All model output is sanitized/clamped; handwritten bilingual fallbacks | Owner: use AIaaS as much and as well as possible, inside gameplay, without making the edge/AI effort obvious in the game; give judges one place that explains it |
| D39 | Districts in the rules (3.5.1) | IMPLEMENTED | `district()` in map.js is read by the simulation since SIM 2.2.0 (zone contracts, explore goal), not only by the renderer/UI: moving district borders now changes replays and needs a SIM_VERSION bump. The pursuit overlay keeps clear of the police-radio line (portrait) | Integration check of 3.3 (districts, overlay) with 3.4/3.5 (referee, radio) |
