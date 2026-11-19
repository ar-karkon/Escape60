# Edge service — the edge referee (API 4.0.0)

**Status:** implemented and tested locally (Node tests, a browser run against the built worker in `npm run edge:local`). Not yet deployed — the live edge still runs v2.3 until `npm run deploy` is run (see `22_DEPLOYMENT.md`).

Code: `edge/app.mjs` (game service), `edge/static.mjs` (static delivery), `edge/card.mjs` + `edge/png.mjs` (PNG cards), `edge/metrics.mjs` (telemetry), `edge/s3.mjs` (storage), `edge/worker.js` (entry). The local dev server runs the same `createApp`.

## What runs on the edge
The browser only sends inputs. The edge is the only judge, and it stays **stateless**: everything it needs between requests travels inside HMAC-signed tickets and checkpoints, so any edge node can answer any request.

| Work | Where it happens |
|---|---|
| Run tickets (route, car, start time, HMAC) | `POST /runs/start` |
| **Live referee**: re-simulates the newest ~5 s of inputs while the run is being driven | `POST /runs/live` every `REPLAY_CHUNK` ticks |
| **Pacing proof**: inputs may not arrive faster than real time (+10 %, 3 s jitter) | every live/finish request |
| **Live global rank** from the edge's own score | live responses |
| Final verdict: replays only what the live checks have not covered, compares the result field by field, stores once | `POST /runs/finish` |
| **Ghost rival**: picks the verified run just above your best (or your friend's / your own) and sends its inputs | `GET /rival` |
| **PNG share card** drawn and encoded on the edge | `GET /api/v1/card/<id>.png` |
| **Link previews** (Open Graph) for verified runs | `GET /r/<id>` |
| Percentile among today's runs (histogram) | finish response |
| Brotli / gzip content negotiation for every text file | static delivery |
| Telemetry merged across isolates; benchmark | `GET /api/v1/edge`, `/api/v1/edge/bench`, `/edge` page |

## Endpoints
| Method & path | Purpose |
|---|---|
| `GET /api/v1/health` | status, API/SIM versions, storage kind, `secured`, feature list |
| `GET /api/v1/challenges/today` | `{seed, version, api, expiresAt, live: {every}}` — daily UTC route |
| `POST /api/v1/runs/start` `{seed, car, lab?}` | `{runId, token, seed, car, live: {every}}`; ticket `{r, s, c, t, v, l?}`. `lab: true` → route `edge-lab`, verified but never stored |
| `POST /api/v1/runs/live` `{runId, token, trace, checkpoint?}` | `{verified, complete, ended, points, health, standing: {rank, of, ahead}, cpuMs, checkpoint}` |
| `POST /api/v1/runs/finish` `{runId, token, trace, result, checkpoint?}` | `202 {continue, progress, checkpoint}` while replaying, then `200 {accepted, rank, of, label, result, verifyMs, ticks, live, better, runs, id, share}` |
| `GET /api/v1/leaderboard?seed=&limit=` | top entries `{rank, timeMs, points, car, label, ghost}`, 5 s isolate cache |
| `GET /api/v1/rival?seed=&points=&not=&id=` | `{rival: {id, rank, of, label, car, points, timeMs, end, trace, friend?, self?}}` |
| `GET /api/v1/card/<id>.png` | 1200×628 pixel-art PNG of a verified run (≈19 KB, ≈3 ms) |
| `GET /r/<id>` | the game page with OG/Twitter tags for that run and its route + score as the target |
| `GET /api/v1/stats` | today's runs, escapes, live-verified runs, average verify ms |
| `GET /api/v1/edge` | telemetry (today / all time / this isolate), features, config |
| `GET /api/v1/edge/bench?ticks=` | steps the simulation ≤ 600 ticks on this node; µs per tick |

## Checkpoints
`{t, ms, at, seen, n, state, sig}` — tick, replay CPU so far, edge time, trace length seen, live checks, full simulation state. `sig = HMAC("ckpt|" + runId | SHA-256(trace prefix of t ticks) | t | ms | at | seen | n | state)`.
- Bound to the **prefix** of the trace, not the whole trace, so a live checkpoint stays valid as the run grows, but any change to an input already verified invalidates it (tested).
- The state must restore to the ticket's seed and car and to exactly `t` ticks.

## Verification rules
1. Ticket signature valid, `runId` matches, `SIM_VERSION` matches, age ≤ 20 min.
2. Trace shape valid (RLE pairs, values 0..63, steer field ≤ 6, ≤ 36,000 ticks).
3. **Pacing**: without a checkpoint `ticks ≤ (now − ticket.t)·60·1.1 + 180`; with one `ticks − seen ≤ (now − at)·60·1.1 + 180`. Speed hacks are refused mid-run; legit slow motion and pauses only make the trace slower.
4. Replay with the shared simulation, at most `REPLAY_CHUNK` ticks per request; storage writes get a request of their own.
5. Last chunk: the game must end exactly at the end of the trace; `version, seed, car, timeMs, points, health, end` must equal the replay; wall time ≥ 78 % of the run time.
6. Single use: run record written with `If-None-Match: *`; leaderboard, histogram, stats and telemetry updated with ETag retries.

Refusals are counted by reason (`pacing`, `mismatch`, `checkpoint`, `ticket`, `replayed`, `replay`, `trace`, `expired`, `version`, …) and shown on `/edge`.

## Storage layout (bucket `escape60-data`)
`runs/<sim>/<date>/<runId>.json` (single-use guard) · `runs-by-id/<sim>/<id>.json` (trace, result, rank at acceptance — rivals, cards, previews) · `leaderboard/<sim>/<seed>.json` (top 100) · `hist/<sim>/<seed>.json` (score histogram) · `stats/v2/<date>.json` · `metrics/v1/day/<date>.json`, `metrics/v1/total.json`.

## Static delivery
The build uploads Brotli (`.br`) and gzip (`.gz`) copies of every flat text file and bakes their sizes into the worker. The edge serves the best one the browser accepts (`Content-Encoding`, `Vary: Accept-Encoding`), skips variants that do not exist, passes byte ranges (Safari audio) through untouched and counts the bytes saved. The game bundle travels as ~176 KB instead of ~732 KB. Edge variable `PRECOMPRESSED=false` switches it off; `npm run deploy` checks that the bundle decodes byte-for-byte.

## Privacy
No accounts, cookies, analytics or IP storage (the IP is used only for in-memory rate limits). Labels are call signs derived from the run id. Telemetry holds counts, refusal reasons and public call signs only.
