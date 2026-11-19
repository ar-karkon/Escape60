# Gameplay systems & balance — design candidates

## Proposed vehicle model
Use lightweight arcade dynamics, not full rigid-body automotive simulation. Velocity, heading, angular velocity, grip and drift envelope. Player must perceive consistent rules; no random spin on collision.

## Steering candidates
A: steer toward finger horizontal position relative to car, with dead-zone.
B: hold left/right buttons.
C: drag thumb stick with sensitivity settings.
Decide after 5–10-person test; keyboard A/D or arrows on desktop.

## Police AI
- Seek/Intercept: aim at predicted player position based on velocity.
- Block: move to forward chokepoint, never teleport on screen.
- Recover: avoid own obstacles, temporary stun after collision.
- Spawn director: escalate encounters smoothly with fixed fairness cap; avoid impossible cages.
- No requirement for neural model or LLM in the game loop.

## Collision and damage
Candidate: 3 damage segments; glancing hits may be cosmetic, severe collisions remove segment; invulnerability cooldown 0.5–1.0s (tunable). Alternative fail-by-trap after slow speed under police contact. Must document rule and visually communicate.

## Scoring specification — PROPOSED, not locked
Primary rank: `survival_ms`, capped 60,000ms. Secondary `skill_points`: near miss +100, escape block +250, controlled drift +1 per measured threshold, collision penalty -150. No farmable passive score from unlimited circles. Fully deterministic same seed + version where possible.
Leaderboard comparison `(survival_ms DESC, skill_points DESC, earliest_valid_finish ASC)`; timestamps **only** for final tie fallback, not favorable fake timing.

## Determinism
Define versioned seed and PRNG; event timeline inputs and simulation settings locked per daily challenge. Browser physics floating-point precision might differ; authoritative replay or coarse event checks needed before strong competitive claims.

## Tuning metrics
Median survival, survival histogram, crash by second, first run/second run, completion rate at 60s, near-miss rate; investigate levels producing unexpectedly high quitting.

## Prohibited design mistakes
Inescapable ambushes, abrupt acceleration without warning, unreadable police car sprites, invisible collision boxes, reward based on uncontrolled randomness, forced ads, deceptive prompts.

## Implemented in simulation 1.1.0

At 10 seconds a second patrol joins. At 25 seconds a third patrol and the first roadblock appear. From 40 seconds the cap rises to five, then six at 55 seconds with a final barrier. Patrols alternate their pursuit lead distance. Damage sets speed to 205 units/s and grants 0.95 seconds of immunity. Highway speed caps at 279 units/s. Downtown traffic intervals are 85% of the standard interval. Old Town has 80-unit-wide alleys. Replay uses the same rules on the Node origin.

## Implemented in simulation 1.2.0 (skill chain)

Pursuit timing, speeds, damage and colliders are unchanged from 1.1.0. Scoring adds a **skill chain**:
- Near miss: police 90, traffic 55 (as before). New: passing within 72 units of a roadblock without touching it is a **dodge** worth 120 (once per barrier).
- Each skill event within `COMBO_WINDOW` = 3.5 s of the previous one raises the chain; the multiplier is `min(5, chain)` and applies to that event's points (×1…×5).
- Hard drifting (|steer| > 0.82) keeps an active chain alive for at least 1.2 s and its 8-point ticks are multiplied too.
- Any hit resets the chain. `gameResult` now also reports `bestChain` and `dodges`.
- Ranking is still survival time first, points second. The server replays the trace with the same code, so a combo score cannot be claimed without the inputs that produce it. Local and server leaderboards use the new version key `1.2.0`, so 1.1.0 records are not mixed in.
- Tests: `tests/simulation.test.mjs` covers chain growth, reset on hit, expiry and the single dodge award.

## Meta progression (client only, cosmetic)
XP per run = time/100 ms + points/4 + 250 on a win + 15 × best chain + 40 × dodge, +10% per consecutive day (max +50%), +150 per completed daily mission. Levels unlock eight paint jobs (cosmetic). Three daily missions are picked deterministically from the UTC date. Everything is stored in `localStorage` on the device; nothing affects the simulation or ranking.

## Implemented in simulation 1.3.0 (health bar, natural spawning)

- **Health bar 0–100 instead of three hearts.** Damage depends on how hard you hit:
  traffic `clamp(10 + 0.06 × closing speed, 14, 32)`, police `clamp(12 + 0.05 × closing speed, 18, 30)`,
  roadblock 30. A rear-end tap costs far less than a head-on crash. After a hit: 0.6 s protection,
  chain reset, score penalty `4 × damage`, speed loss scaled to the impact.
- **Wall bumps** cost 3 health at most every 0.6 s, never break the combo and are counted as `scrapes`.
- **Regeneration:** after 5 s without damage, +1.5 health per second (up to 100).
- **Natural spawning:** the run starts with seven cars already on the streets ahead; new traffic appears
  980–1300 units ahead (beyond the visible range) on your street, a parallel street or a cross street, and
  is removed only once it is well behind you. Chasing patrols join from behind the camera; every other
  patrol drives at you down your street from beyond the visible range. Roadblocks are placed ~860 units
  ahead so they are always seen and announced in time.
- **Police AI:** pursuit lead is capped at half the distance (head-on patrols no longer overshoot); patrol
  top speed rises from 180 to 280 over the run — faster than you on long straights, worse in corners.
- Bot check (60 seeds): driving straight with no input now wins 37 % of runs with ~22 health left
  (it won 98 % before the AI changes), so steering and cornering matter.
- Tests cover damage scaling, regeneration, wall bumps, out-of-view spawning and the existing replay rules.
