# Codex / Claude Code handoff

## First read
README.md → docs/00_STATUS.md → docs/13_DECISIONS.md → docs/02_GAME_DESIGN.md → docs/05_ARCHITECTURE.md → docs/06_EDGE_SPEC.md → docs/16_BACKLOG.md.

## Implementation instructions
- Do not claim done unless code exists and tests/run outputs support it.
- Do not treat proposed decisions as accepted; label defaults in PR and ask for signoff when possible.
- Work in small independently runnable increments; keep game simulation independent of Arvan runtime.
- Use original code/art; do not copy GTA or third-party licensed assets.
- No keys in commits, logs or client code.
- Test Chrome Android and iOS Safari for interaction and performance; record device/test evidence.
- Do not generate dummy analytics/leaderboards or synthetic human traffic.

## Suggested first prompt
"Read README.md and docs/00_STATUS.md, docs/02_GAME_DESIGN.md, docs/05_ARCHITECTURE.md, docs/13_DECISIONS.md and docs/16_BACKLOG.md. Implement ONLY a 20-second local playable vertical slice with TypeScript + Vite + Phaser (or recommend a better 2D tool with rationale). Include deterministic seed, responsive controls, one police vehicle, one collision and restart. Add unit tests, README run commands and a short honest completion report. Do not deploy or claim Edge compatibility yet; do not create real leaderboard."

## Definition of done
Code + tests + reproducible run commands + screenshots/recorded manual QA as applicable + updated decisions and docs.
