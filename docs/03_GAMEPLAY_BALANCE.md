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
