# Edge service — implemented API

**Status: deployed on Arvan Edge (2026-11-19).** Code: `edge/app.mjs` (service), `edge/s3.mjs` (storage), `edge/worker.js` (entry + static proxy). The local dev server runs the same `createApp`.

## Endpoints
| Method & path | Purpose |
|---|---|
| `GET /api/v1/health` | runtime, SIM/API versions, storage kind, `secured`, AI model |
| `GET /api/v1/challenges/today` | `{seed, challengeId, version, expiresAt, mission}` — daily UTC seed + AI special event |
| `GET /api/v1/mission` | today's mission only |
| `POST /api/v1/runs/start` `{seed, car, spawn}` | `{runId, token, seed, car, spawn}` — stateless HMAC ticket `{r, s, c, p, t, v}` (`p` = start index; invalid → seed default) |
| `POST /api/v1/runs/finish` `{runId, token, trace, result, checkpoint?}` | chunked replay; `202 {continue, progress, checkpoint}` until done, then `200 {accepted, rank, of, label, result, mission, verifyMs}` |
| `POST /api/v1/runs/report` `{runId, token}` | AI coach text for a verified run (cached in the run record) |
| `GET /api/v1/leaderboard?seed=&limit=` | top entries `{rank, timeMs, points, label, mission}`, 5 s isolate cache |
| `GET /api/v1/stats` | today's runs, wins, missions, avg verify ms, AI calls |

## Verification rules (finish)
1. Ticket signature valid (it binds seed, car and start index `p`), `runId` matches, `SIM_VERSION` matches, age ≤ 15 min.
2. Trace shape valid (RLE pairs, inputs −3..3, ≤ 3600 ticks).
3. Replay from the ticket's seed with the shared simulation, at most `REPLAY_CHUNK` ticks per request. Between requests the edge signs `runId | SHA-256(trace) | verifyMs | stateJSON`; a forged state, timing or swapped trace fails the HMAC.
4. Last chunk: game must end exactly at the end of the trace; the browser's `timeMs/points/health/win` must equal the replay; wall time since the ticket ≥ 78 % of the run time.
5. Single use: run record written with `If-None-Match: *`; leaderboard and stats updated with `If-Match` ETag retries.

## AI usage
- Mission: one model call per UTC day (first request), output validated by `sanitizeMission` (lengths, stripped markup/URLs, whitelisted objective types, clamped goals, radio lines per event), frozen in `missions/v1/<date>.json`. Runs remember whether their ticket used the AI or the fallback mission, so judging never changes mid-day.
- Coach: one call per verified run on request, ≤ 220 output tokens, capped per day (`AI_DAILY_REPORT_CAP`).
- The model never controls physics, spawns, scoring or ranks.

## Privacy
No accounts, cookies, analytics or IP storage. Leaderboard labels are call signs derived from the run id.
