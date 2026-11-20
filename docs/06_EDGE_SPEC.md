# Edge service — the edge referee (API 4.2.0)

**Status:** implemented and tested locally (Node tests incl. a mocked AIaaS gateway, a browser run against the built worker in `npm run edge:local`). Judge-facing overview: [TECHNOLOGY.md](TECHNOLOGY.md). Deployed on Arvan on 2026-11-20; see `22_DEPLOYMENT.md` for the live checks and remaining transient error.

Code: `edge/app.mjs` (game service), `edge/static.mjs` (static delivery), `edge/card.mjs` + `edge/png.mjs` (PNG cards), `edge/metrics.mjs` (telemetry), `edge/s3.mjs` (storage), `edge/worker.js` (entry). The local dev server runs the same `createApp`.

## What runs on the edge
The browser only sends inputs. The edge is the only judge, and it stays **stateless**: everything it needs between requests travels inside HMAC-signed tickets and checkpoints, so any edge node can answer any request.

| Work | Where it happens |
|---|---|
| Run tickets (route, car, start time, HMAC) | `POST /runs/start` |
| **Live referee**: re-simulates the newest ~1.5 s of inputs while the run is being driven | `POST /runs/live` every `REPLAY_CHUNK` ticks |
| **Pacing proof**: inputs may not arrive faster than real time (+10 %, 3 s jitter) | every live/finish request |
| **Live global rank** from the edge's own score | live responses |
| Final verdict: replays only what the live checks have not covered, compares the result field by field, stores once | `POST /runs/finish` |
| **Ghost rival**: picks the verified run just above your best (or your friend's / your own) and sends its inputs | `GET /rival` |
| **Several ghosts** (4.2): your best, the run just above it, today's #1 and a friend's run in one call, from cached reads (no replay work) | `GET /ghosts` |
| **Verified splits** (4.2): points every 60 ticks recorded during the replay, carried inside the HMAC checkpoint and stored with the run | live / finish |
| **League** (4.2) from the percentile: bronze < 40, silver 40–69, gold 70–89, neon 90–98, legend ≥ 99 or top 3 with ≥ 10 runs | finish response, PNG card |
| **Pursuit commander** (4.2): per-district counts (busts, wrecks, escapes, takedowns) at every finish; tomorrow's briefing reads them and sets the `focus`/`focusRate` tactic | `heat/<sim>/<date>.json` → director |
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
| `POST /api/v1/runs/start` `{seed, car, spawn, rules?, lab?}` | `{runId, token, seed, car, spawn, rules, live: {every}}`; ticket `{r, s, c, p, d?, t, v, l?}` (`p` = start index; invalid → seed default; `d` = daily rules id). `lab: true` → route `edge-lab`, verified but never stored |
| `POST /api/v1/runs/live` `{runId, token, trace, checkpoint?}` | `{verified, complete, ended, points, health, standing: {rank, of, ahead: {rank, label, points, gap}}, cpuMs, checkpoint}` — the checkpoint carries `sp` (points at every 60th tick), covered by its MAC |
| `POST /api/v1/runs/finish` `{runId, token, trace, result, checkpoint?}` | `202 {continue, progress, checkpoint}` while replaying, then `200 {accepted, rank, of, label, result, verifyMs, ticks, live, better, league, runs, id, share, splits}` |
| `GET /api/v1/leaderboard?seed=&limit=` | top entries `{rank, timeMs, points, car, label, ghost}`, 5 s isolate cache |
| `GET /api/v1/rival?seed=&points=&not=&id=&spawn=` | `{rival: {id, rank, of, label, car, spawn, points, timeMs, end, trace, friend?, self?}}` — with `spawn`, only runs that started there; the game prefetches a rival and starts the next run at the rival's start |
| `GET /api/v1/ghosts?seed=&spawn=&points=&not=&id=` | `{seed, spawn, ghosts: {pb, rival, top, friend}}`; each slot is a rival object plus `role, splits, persona, taunts` or `null`. `not` = your best run id (pb), `id` = a friend's run. The race starts at `spawn` (else the friend's / rival's start); ghosts from another start come back with `trace: null` and race on splits only. The browser re-simulates at most two ghosts as cars |
| `GET /api/v1/card/<id>.png` | 1200×628 pixel-art PNG of a verified run (≈19 KB, ≈3 ms) |
| `GET /r/<id>` | the game page with OG/Twitter tags for that run and its route, start position and score as the target (and that run as the ghost) |
| `GET /api/v1/stats` | today's runs, escapes, live-verified runs, average verify ms |
| `GET /api/v1/edge` | telemetry (today / all time / this isolate), features, config |
| `GET /api/v1/edge/bench?ticks=` | steps the simulation ≤ 600 ticks on this node; µs per tick |
| `GET /api/v1/challenges/today` (AI) | also returns `brief` (theme, briefing, dispatcher, contract titles in EN/FA, `source: ai|fallback`, `model`) and `rules` (`{id, contracts, tactics}`) |
| `GET /api/v1/radio?date=&lang=` (`lang` defaults to `fa`; dispatch too) | police-radio bank `{radio: {en, fa}: {event: [lines]}, source}` for the day |
| `POST /api/v1/dispatch` `{seed, car, zone, lang, last?}` | `{who, line, source}` — the dispatcher's call for one run (`line: null` → the client uses the radio bank) |
| `POST /api/v1/runs/debrief` `{id}` | `{chief: {tip, headline, taunt, next, source}}` for a verified run; generated once and cached in `runs-by-id` |

## Daily rules (AIaaS city director)
- Written once per UTC day by `edge/ai.mjs` (AIaaS, DeepSeek-V4-Flash) — or the handwritten briefing of the day when there is no key/answer — sanitized by `web/src/director.js` and frozen in `director/v1/<date>.json` (`If-None-Match: *`, first writer wins).
- Rules = up to three contracts (`drift, near, takedown, dodge, speed, chain, survive, explore`, optional district for drift/near; goals clamped and quantised, rewards computed by `web/src/rules.js`) and police tactics (`pace, patrol, intercept, blocks, spikes, traffic`, clamped). Only daily routes (`daily-YYYY-MM-DD`) carry rules.
- `POST /runs/start` must send the rules id the client plays by (`rules`); the ticket signs it (`d`); replays create the game with those rules; checkpoints must carry the same rules id; results must report it. A daily run without the day's rules is refused (409) or fails replay (422).

## Checkpoints
`{t, ms, at, seen, n, state, sig}` — tick, replay CPU so far, edge time, trace length seen, live checks, full simulation state. `sig = HMAC("ckpt|" + runId | SHA-256(trace prefix of t ticks) | t | ms | at | seen | n | state)`.
- Bound to the **prefix** of the trace, not the whole trace, so a live checkpoint stays valid as the run grows, but any change to an input already verified invalidates it (tested).
- The state must restore to the ticket's seed, car and start index and to exactly `t` ticks.

## Verification rules
1. Ticket signature valid, `runId` matches, `SIM_VERSION` matches, age ≤ 20 min.
2. Trace shape valid (RLE pairs, values 0..63, steer field ≤ 6, ≤ 36,000 ticks).
3. **Pacing**: without a checkpoint `ticks ≤ (now − ticket.t)·60·1.1 + 180`; with one `ticks − seen ≤ (now − at)·60·1.1 + 180`. Speed hacks are refused mid-run; legit slow motion and pauses only make the trace slower.
4. Replay with the shared simulation, at most `REPLAY_CHUNK` ticks per request; storage writes get a request of their own.
5. Last chunk: the game must end exactly at the end of the trace; `version, seed, car, spawn, timeMs, points, health, end` must equal the replay; wall time ≥ 78 % of the run time.
6. Single use: run record written with `If-None-Match: *`; leaderboard, histogram, stats and telemetry updated with ETag retries.

Refusals are counted by reason (`pacing`, `mismatch`, `checkpoint`, `ticket`, `replayed`, `replay`, `trace`, `expired`, `version`, …) and shown on `/edge`.

## Storage layout (bucket `escape60-data`)
`director/v1/<date>.json` (frozen daily briefing) · `radio/v1/<date>.json` · `runs/<sim>/<date>/<runId>.json` (single-use guard) · `runs-by-id/<sim>/<id>.json` (trace, splits, result, rank, percentile and league at acceptance — ghosts, cards, previews) · `heat/<sim>/<date>.json` (per-district counts `z[district] = [busts, wrecks, escapes, takedowns]`, no ids) · `leaderboard/<sim>/<seed>.json` (top 100) · `hist/<sim>/<seed>.json` (score histogram) · `stats/v2/<date>.json` · `metrics/v1/day/<date>.json`, `metrics/v1/total.json`.

## Static delivery
The build uploads Brotli (`.br`) and gzip (`.gz`) copies of every flat text file and bakes their sizes into the worker. The edge serves the best one the browser accepts (`Content-Encoding`, `Vary: Accept-Encoding`), skips variants that do not exist, passes byte ranges (Safari audio) through untouched and counts the bytes saved. The game bundle travels as ~176 KB instead of ~732 KB. Edge variable `PRECOMPRESSED=false` switches it off; `npm run deploy` checks that the bundle decodes byte-for-byte.

## Privacy
No accounts, cookies, analytics or IP storage (the IP is used only for in-memory rate limits). Labels are call signs derived from the run id. Telemetry holds counts, refusal reasons and public call signs only.

## Ghosts, personas and the commander (4.2)
- Ghosts never change ranked points: overtaking one plays a sting and a line in that driver's voice; beating one gives local XP only (`meta.js` `DUEL_XP`).
- The crew-chief call also returns a driver `persona` and a taunt bank for `start, passYou, youPass, milestone, beaten` (same call, no extra model calls); handwritten fallbacks from the run's numbers otherwise. Nothing is labelled AI in the game.
- The commander summary in the director prompt is counts per district only. The handwritten briefing reacts too (focus = district with the most escapes ×2 + takedowns, rate 1.15–1.5). Rules stay frozen per day and are signed by the rules id, so replays stay deterministic.
