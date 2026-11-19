# Deployment runbook — Escape60 on Arvan (as deployed 2026-11-19)

Live URL: **https://escape60.lavanai2525-3qem7.arvanedge.ir** (still serving v2.3 until v3.0 is rebuilt and redeployed). The `/edge` page and all AI variables were removed in v3.0.

There is no separate server. One Arvan Edge Compute (`escape60`) serves the whole game:

| Path | Handled by |
|---|---|
| `/api/v1/*` | `edge/app.mjs` inside the edge worker (tickets, chunked replay, leaderboard) |
| everything else | edge proxies the file's basename from the public bucket `escape60-game` and sets MIME / cache headers |

## Arvan resources
- Edge Compute `escape60` (default route `escape60.lavanai2525-3qem7.arvanedge.ir/*`).
- Object Storage bucket `escape60-game` (ir-central1, **public read**) — the flat static build.
- Object Storage bucket `escape60-data` (ir-central1, **private**) — `missions/`, `runs/`, `leaderboard/`, `stats/` JSON objects.
- AIaaS gateway `gateway-yjjo6` (`https://api.arvancloudai.ir/v1`), model `DeepSeek-V4-Flash` (cheapest connected model).

## Edge variables (Edge → escape60 → تنظیمات → متغیر جدید, tick "encrypted")
Values are JSON, so a string must be written **with double quotes**, e.g. `"abc123"`.

| Name | Value |
|---|---|
| `S3_ACCESS_KEY` | Object Storage access key (Object Storage → مدیریت دسترسی) |
| `S3_SECRET_KEY` | Object Storage secret key (also derives the run-ticket HMAC key) |
| optional | `RUN_SECRET`, `S3_BUCKET` (`escape60-data`), `S3_ENDPOINT` (`https://s3.ir-central1.arvanstorage.ir`), `S3_REGION` (`ir-central1`), `STATIC_ORIGIN`, `REPLAY_CHUNK` (default 300 ticks; SIM 2.0 costs ~20–40 µs per tick, tune to the edge CPU budget) |

Without the S3 keys the edge falls back to per-isolate memory (leaderboard not durable) and a fixed dev ticket secret; `/api/v1/health` reports `storage: "memory"` and `secured: false`. The AIaaS key is no longer used (v3.0) and can be deleted from the edge settings.

## Release steps
1. `npm run check && npm run build` → `dist/web/` (flat files for the edge proxy plus an `assets/` tree for ordinary static hosts, hashed `app-*.js`, `style-*.css`) and `dist/edge/worker.js`.
2. Upload changed files from `dist/web/` to `escape60-game` (public toggle on). `index.html` last.
3. Edge → escape60 → ویرایش کد → replace with `dist/edge/worker.js` → انتشار.
4. Verify: `/api/v1/health` (version 2.0.0, storage), a full verified run through `npm run test:browser` with `GAME_URL=<live url> CHROME_BIN=/usr/bin/google-chrome`.
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
