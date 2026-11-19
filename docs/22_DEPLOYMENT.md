# Deployment runbook — Escape60 on Arvan (as deployed 2026-11-19)

Live URL: **https://escape60.lavanai2525-3qem7.arvanedge.ir** (still serving v2.3 until this version is deployed with `npm run deploy`). All AI variables were removed in v3.0. Since v3.4 the edge is the "edge referee" (API 4.0.0, see `06_EDGE_SPEC.md`) and `/edge` is its live dashboard for judges.

There is no separate server. One Arvan Edge Compute (`escape60`) serves the whole game:

| Path | Handled by |
|---|---|
| `/api/v1/*` | `edge/app.mjs` inside the edge worker: tickets, live referee, final replay, leaderboard, ghost rival, PNG cards, telemetry, benchmark |
| `/r/<id>` | link preview of a verified run (index.html from the bucket + Open Graph tags + route/target) |
| `/edge` | `edge.html` — live edge referee dashboard (not linked from the game UI) |
| everything else | `edge/static.mjs`: the file's basename from the public bucket `escape60-game`, its Brotli/gzip copy when the browser accepts it, MIME / cache headers, byte ranges |

## Arvan resources
- Edge Compute `escape60` (default route `escape60.lavanai2525-3qem7.arvanedge.ir/*`).
- Object Storage bucket `escape60-game` (ir-central1, **public read**) — the flat static build.
- Object Storage bucket `escape60-data` (ir-central1, **private**) — `runs/`, `runs-by-id/`, `leaderboard/`, `hist/`, `stats/`, `metrics/` JSON objects (old `missions/` objects from v2.3 are unused).
- The AIaaS gateway used by v2.3 is no longer needed.

## Edge variables (Edge → escape60 → تنظیمات → متغیر جدید, tick "encrypted")
Values are JSON, so a string must be written **with double quotes**, e.g. `"abc123"`.

| Name | Value |
|---|---|
| `S3_ACCESS_KEY` | Object Storage access key (Object Storage → مدیریت دسترسی) |
| `S3_SECRET_KEY` | Object Storage secret key (also derives the run-ticket HMAC key) |
| optional | `RUN_SECRET`, `S3_BUCKET` (`escape60-data`), `S3_ENDPOINT` (`https://s3.ir-central1.arvanstorage.ir`), `S3_REGION` (`ir-central1`), `STATIC_ORIGIN`, `REPLAY_CHUNK` (default 300 ticks = live-check interval and replay chunk; SIM 2.0 costs ~30–70 µs per tick, so ~10–20 ms per request), `PRECOMPRESSED` (`false` serves only uncompressed files) |

Without the S3 keys the edge falls back to per-isolate memory (leaderboard not durable) and a fixed dev ticket secret; `/api/v1/health` reports `storage: "memory"` and `secured: false`. The AIaaS key is no longer used (v3.0) and can be deleted from the edge settings.

## Release from your own computer — `npm run deploy` (no CI needed)
Needs Node 20+, a clone of the repo and `npm install`. Run it from a network that reaches Arvan.

```bash
npm run deploy                  # tests + build, upload, guided edge step, live checks
npm run deploy -- --dry-run     # list what would change, upload nothing
```

What it does (`scripts/deploy-arvan.mjs`, signing in `scripts/sigv4.mjs`, checked against AWS's published SigV4 examples in `tests/sigv4.test.mjs`):
1. Runs the tests and `npm run build`.
2. Asks for the Object Storage access / secret key (hidden input; or `S3_ACCESS_KEY` / `S3_SECRET_KEY` env vars). Keys are used only for this run and never written to disk.
3. Compares every flat file in `dist/web/` with the bucket by MD5/ETag and uploads only what changed (public-read), **except `index.html`**.
4. Copies `dist/edge/worker.js` to the clipboard and waits while you paste it into Edge → escape60 → ویرایش کد → انتشار; it then checks `/api/v1/health` for the new API and simulation version.
5. Uploads `index.html` last, so players switch to the new client only once the matching edge is live.
6. Verifies the bucket serves files publicly, the live URL serves the new `app-*.js`, and the API version and storage mode.

Flags: `--skip-build`, `--skip-tests`, `--force` (upload everything), `--no-wait`. Env overrides: `S3_ENDPOINT`, `S3_REGION`, `STATIC_BUCKET`, `STATIC_ORIGIN`, `GAME_URL`. The edge code itself is replaced in the panel because no Edge Compute code API is documented/verified here.

Rehearsed (2026-11-19) against a local fake S3 + edge that re-verifies every signature: first upload, unchanged-file skip, `index.html` held back until the edge reports the new version, re-run with nothing to do, dry run, wrong key (clear 403 message). Not yet run against the real Arvan endpoints (the cloud build session could not reach Arvan hosts).

## Test the exact deploy artefact locally
`npm run build && npm run edge:local` runs `dist/edge/worker.js` through the same Service Worker `fetch` interface (with `dist/web` as the bucket) on http://localhost:4174. `GAME_URL=http://localhost:4174 npm run test:browser` then plays a real run against it: live checks, final verdict, `/r/<id>` preview, PNG card and a ghost-rival run (verified 2026-11-19).

## Manual release steps (fallback)
1. `npm run check && npm run build` → `dist/web/` (flat files for the edge proxy plus an `assets/` tree for ordinary static hosts, hashed `app-*.js`, `style-*.css`) and `dist/edge/worker.js`.
2. Upload changed flat files from `dist/web/` to `escape60-game` (public toggle on) — including `edge.html` and every `.br` / `.gz` copy. `index.html` last.
3. Edge → escape60 → ویرایش کد → replace with `dist/edge/worker.js` → انتشار.
4. Verify: `/api/v1/health` (version 2.1.0, API 3.1.0, storage), a full verified run through `npm run test:browser` with `GAME_URL=<live url> CHROME_BIN=/usr/bin/google-chrome`.
5. Any simulation change: bump `SIM_VERSION`; the edge replays with the bundled copy of the same `simulation.js`.

## Verified on the live edge (2026-11-19, v2.3 — re-verify after deploying v3.0)
- With keys set: `/api/v1/health` reports `storage: arvan-object-storage`, `secured: true`, AI DeepSeek-V4-Flash; AI daily event generated and frozen; AI coach replies; leaderboard and stats persist.
- Static: HTML, JS, CSS, fonts, audio served with correct MIME; Range requests return 206 (Safari audio).
- Full 60 s run (seed `x2`, 3600 ticks) accepted after 5 chunked requests; total replay CPU 54.6 ms. Short runs accepted in one request.
- Browser smoke test (menu, missions, pause, run, results, coach, share, replay) passed against the live URL.

## Runtime findings (Arvan Edge)
- Service Worker `fetch` event interface; `env` global holds variables (`EC_ID`, `EC_URL` always present). `crypto.subtle`, `fetch`, `performance.now` available; `caches` and `localStorage` throw.
- Per-request CPU budget is small: a ~900-tick replay works, a 3600-tick replay is killed ("Request handler dropped response sender"). Hence chunked replay (720 ticks/request) with HMAC-signed checkpoints that bind run id, trace hash, elapsed verify time and exact state.
- `Math.sin`, `Math.cos`, `Math.pow` differ in the last bits from V8/Node → the simulation uses `web/src/dmath.js` (SIM 1.5.0).
- Wall time of at least 20 s per request is allowed, but heavy work (replay + many storage writes) in one request gets dropped, so the final storage commit runs in its own request after the last replay chunk.
- Arvan Object Storage honours `If-None-Match: *` but answers 412 to `If-Match` even with the current ETag → `s3.mjs` re-reads the ETag right before an unconditional write.
- DeepSeek-V4-Flash thinks by default (hidden reasoning tokens, slow, can exceed the edge limit) → requests send `thinking: {type: "disabled"}`; the daily event then takes ~9 s and coach replies ~3 s.
- The AIaaS machine user is `escape60-ai`; its key is pasted with the `apikey ` prefix, which the edge strips.

## Danger boundaries
- The S3 key is account-wide (it can also reach other buckets of this account). Do not rotate it in the panel without updating the other projects that use it.
- Never commit keys; they live only in encrypted edge variables.
- Keep the game link live until results (14 Azar 1405).
