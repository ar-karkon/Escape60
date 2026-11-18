# Implementation backlog — ordered by dependency

## P0: Design and runtime validation
- [ ] Decide camera/orientation and control scheme (from user)
- [ ] Lock rules for win/loss, injury and collisions
- [ ] Verify Arvan Edge hosting/runtimes and storage options
- [ ] Implement empty Vite/Phaser TypeScript prototype and dev scripts
- [ ] Implement 20s vertical slice with keyboard and touch
- [ ] 5–10 manual testers and feedback log

## P1: Core game
- [ ] 60s difficulty director
- [ ] Player handling, drift tuning, responsive input
- [ ] 2 police behaviors, fair spawn warning, road obstacles
- [ ] Damage/end state, restart
- [ ] Original sprites/audio and responsive HUD
- [ ] Performance profiling and low-end fallback

## P2: Edge and competition
- [ ] Edge-compatible API deployment spike
- [ ] Challenge seed/version lifecycle
- [ ] Durable result storage and schema
- [ ] Abuse controls; validation tier declaration
- [ ] Public leaderboard only when trustworthy
- [ ] Domain, HTTPS, observability and rollback
- [ ] Check official rules; submit entry and save receipt

## P3: Growth/polish
- [ ] Share card and direct invitation link
- [ ] Daily seeded challenge
- [ ] Creator-friendly 9:16 share layout
- [ ] Translations and accessibility polish
- [ ] Test metrics; creator outreach

## Out of scope
Open-world map, online PvP, vehicle store/customization, realistic police driving simulator, user accounts, intrusive telemetry.
