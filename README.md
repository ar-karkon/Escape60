# ESCAPE 60 — فرار ۶۰

**An original, fully playable, mobile-first 60-second arcade police chase game.** Built for ArvanCloud Edge Games. No third-party game assets or runtime dependencies.

**Status (2026-11-19):** browser game and local persistent replay-validated leaderboard implemented. Arvan Edge production deployment **not** performed and no live competition entry has been submitted. Online leaderboard requires an API origin; static-only deployment plays offline and displays local bests honestly.

## Run and play

Requires Node.js 20+; no `npm install` is necessary.

```bash
npm start
# open http://localhost:4173
npm test
npm run build
```

On mobile, drag across the screen or press the steering buttons. On desktop, press Left/Right or A/D, and P/Esc to pause. Survive for 60 seconds. Each crash costs one of three lives. Avoid traffic, police cars, buildings, and roadblocks. Close calls and precise driving add skill points. Use **Replay**, **Share challenge**, or **New challenge** after each round.

## Delivered

- Deterministic seeded 60Hz game loop, escalating police AI, moving traffic, buildings, roadblocks, 3-heart damage, invulnerability window, drift/near-miss scoring, 60-second win condition.
- Responsive original Canvas graphics, neon city, pause on tab hide, touch and keyboard controls, optional synthesized sound, no external sprites.
- Daily UTC seed and portable challenge URL (`?seed=challenge-xxxx`), local best persistence, native share or copy link.
- Node HTTP API with no dependencies, disk-backed leaderboard, session tokens, simple in-memory throttling, and server-authoritative replay of quantized steering trace. No personal registration needed.
- Edge Service-Worker-style proxy adapter with daily challenge at Edge and validation gates (not deployed/tested on Arvan runtime).
- Tests, CI, operational guide, pre-existing GDD and design rationale.

## Project layout

```text
web/                 static HTML/CSS/Canvas browser game
web/src/simulation.js deterministic rules imported by game AND Node score verifier
web/src/main.js      UI, controls, fixed-timestep loop, share and API handling
web/src/render.js    original procedural game graphics
server/server.mjs    Node origin API, persisted leaderboards and replay validation
edge/worker.js       provisional Arvan Edge API adapter
scripts/build.mjs    static dist/ copy
.github/workflows/    tests and build
 docs/                full design, rules, architecture, research and backlog
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
