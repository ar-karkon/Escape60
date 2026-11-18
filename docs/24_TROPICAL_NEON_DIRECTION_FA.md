# Escape 60 — Tropical Neon Voxel Art Direction (FA)
**Status:** APPROVED creative direction for implementation; not evidence that visuals already exist in the running game.
**Date:** 2026-11-19
**Role:** This document supplements `docs/23_VOXEL_3D_VISION_FA.md`. In any conflict about palette, lighting, environment mood, branding, or UI style, **this document takes precedence**. Existing game logic, deterministic replay, safety/security, and rules retain their requirements.

## North star
Make a real, playable 3D voxel/pixel-art mobile police chase in an **original fictional tropical seaside metropolis**, with the vibrant 1980s-meets-present sunset, nightlife, synth-retro, beach boulevard, and playful urban freedom *vibe* people associate with contemporary neon coastal crime-game trailers. **Do not copy GTA VI logos, exact map/geography, characters, famous vehicles, screenshots, dialogue, music, art, or trademarked UI.** The game brand is **ESCAPE 60**.

## Visual palette and color management
| Role | Color | Hex |
|---|---|---|
| Sunset hot pink | Flamingo | `#FF5D95` |
| Horizon coral | Coral | `#FF8872` |
| Sunset orange | Sunburst | `#FFAD65` |
| Deep plum | Violet night | `#51216C` |
| Electric violet | Violet | `#8D54E9` |
| Neon cyan | Cyan | `#3DD8E7` |
| Tropical turquoise | Sea | `#19B8BC` |
| Night indigo | Foundation | `#111633` |
| Warm yellow | Highlight | `#FFE37C` |
| Orange hero car | Hero | `#FF873C` |
| Police lights | Red / blue | `#FF416A` / `#3F98FF` |
| Cream text | UI | `#FFF4E6` |

Use these colors as a restrained hierarchy: large purple/indigo silhouettes, coral/pink skies, turquoise water and signage, warm amber windows, red/blue police danger lights. Bright neon should reinforce focal points, not blanket everything. Preserve readable hazards over cinematic glow.

## Rendering standard
- Genuine WebGL 3D geometry: volumetric voxel cars, buildings, trees, bridges, street furniture, ocean piers. Character from art direction comes from low-poly block forms, pixel-textured details, integer-like silhouettes, and low-resolution rendering upscaled nearest-neighbor. No fake flat scene and no pre-rendered video for gameplay.
- Sunset gradually transitions to neon-blue/purple nighttime across a run only if this does not hurt fairness/visibility or mobile performance. Fixed lighting at golden dusk is an acceptable default.
- Glossy roads are stylized wet asphalt *puddles/reflection patches* with cheap transparent decals, not heavy realtime screen-space reflections.
- Palm trees, Art Deco-inspired invented hotels, pastel storefronts, beachfront boulevard, coastal overpass, pixel ferris wheel skyline silhouette, colorful streetlights, rooftop billboards, low-res animated neon signs. Locations are ORIGINAL and fictional.
- Soft pixel-art clouds, 2–3 layer gradient sky, giant low-poly setting sun near ocean horizon, horizon haze. Avoid photorealism, violent realism, licensed imagery.

## Four scene targets
### Scene 1: Main menu
Portrait 9:16. Behind a well-contrasted pixel UI, the orange-striped hero car idles/drifts on a turquoise-pink illuminated waterfront road; palm-lined pastel shops, dramatic setting sun, distant skyline, police lights. Bold chunky original ESCAPE 60 logo. Primary call-to-action in warm golden amber **«شروع فرار»**. Small cards: «چالش امروز»، «جدول رکوردها»، «تنظیمات». Ensure responsive RTL text, safe areas, readable labels; animated real in-engine background rather than image pasted over app.

### Scene 2: Playable city pursuit
Camera is an elevated rear three-quarter follow view with generous visible road ahead, on mobile portrait. Car is orange with cream/white racing stripe. Police chase in lane; procedural palm-lined coastal streets with crosswalks, traffic, barriers and buildings. HUD: survive timer, 3 pixel hearts, skill points, route warnings, left/right touch arrows. A 60-second run must be actually playable and deterministic.

### Scene 3: Dramatic action peak
At ~40–55 seconds: police blockade with obvious safe exit; red/blue strobes, orange car drifting, 5–12 voxel sparks, skid trails, low-cost pixel smoke, subtly intensified synth sound and camera shake. Distant helicopter/searchlight or ferris wheel can be **decorative, lightweight and off-screen culled**. It must not arbitrarily interfere with competitive physics or confuse collision boundaries.

### Scene 4: Result/replay screen
Same sunset coastal scene with 3D car and police as animated background. Pixel-framed translucent-dark panel; large time, skill score, heart/achievement status; statuses «فرار کردی!» or «گیر افتادی!». CTA «دوباره بازی کن», secondary «اشتراک رکورد», tertiary «منوی اصلی». Never invent verified online position. Counter and time values must reflect actual game data; completion max 60.00s (no 00:60.00 malformed time).

## Mechanics do not change just to match mood
- Preserve `web/src/simulation.js` deterministic tick-based logic and `server/server.mjs` authoritative replay semantics. Voxel renderer reads simulation state; do not drive scoring from meshes or visual physics.
- Retain 60s loop, 3 HP, fair police escalation, skill scoring, daily seeded challenge, sharing, keyboard/mobile control and low-latency retries.
- Music/SFX must be original / properly licensed: optional synthwave/chiptune beat, subtle electronic percussion, tire squeal, retro siren stabs, UI effects. Audio begins only after user gesture.
- Mobile portrait first, small payload target, dynamic quality scale, no huge textures, at least playable at 30fps on mid-range phones as a measured target.

## Claude Code implementation brief
1. Read `AGENTS.md`, `docs/23_VOXEL_3D_VISION_FA.md`, and this file entirely.
2. Branch `feat/tropical-voxel-3d`; run baseline checks. Plan briefly, then implement **real playable code**, not just a picture.
3. Use Three.js/WebGL with instancing/chunking where appropriate; build a reproducible 3D city and car from original procedural assets.
4. Build all four screens and full UI/FX with this palette; include options for reduced motion, muted audio and low graphics.
5. Preserve deterministic game simulation and backend verification. Change simulation and server together and bump `SIM_VERSION` only when required.
6. Test in a browser; capture real screenshots for menu/gameplay/result, add mobile viewport smoke tests and report actual results.
7. Commit implementation and docs, open a PR. Never claim Arvan Edge deployment unless a real deployed URL has been tested.

## Final visual acceptance
When shown without UI, the game is unmistakably **an original sunset tropical neon city** with voxel/pixel-art 3D depth. When shown with UI, it remains clear, readable, fast and obviously **Escape 60**, not a rebranding of any other commercial game's identity.
