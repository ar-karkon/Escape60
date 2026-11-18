# Edge deployment and API proposal

**Status: API CONTRACT DRAFT — not deployed; exact Arvan APIs and plan limits not yet verified.**

## Why real Edge
Serving HTML/JS alone is not enough for a strong technical case. Lightweight service-side challenge generation/validation, abuse throttling and efficient public leaderboard reads are candidate meaningful Edge uses.

## Proposed endpoints (subject to runtime and privacy review)
- `GET /api/v1/challenges/today` → `{challengeId, seed, gameVersion, expiresAt}`
- `POST /api/v1/runs/start` → `{runId, challengeId, issuedAt, token}`
- `POST /api/v1/runs/finish` → `{runId, timeMs, points, inputTraceHash, inputTrace?, clientVersion}`
- `GET /api/v1/leaderboard?challengeId=...&limit=20` → aggregate, anonymized ranks
- `GET /api/v1/health` → status; exclude secrets

## Threat model
Client controls inputs, timing, DOM and network → **client score is not trusted**. Signed tokens prevent naïve forged sessions but **not** physics cheating. Potential solution tiers:
1. Basic: time window, nonce expiry, rate limit, suspicious score checks; mark as lower assurance.
2. Stronger: sampled event log validation, deterministic seed/versions, replay on trusted backend or proof validation where feasible.
3. Full: server authoritative simulation (probably too costly for MVP).

## Open feasibility checklist
- Official Arvan runtime: JS standard, limits, outbound fetch, timers, crypto APIs.
- Deployment method and domain, static vs function bundling.
- Persistent KV/DB support and transactional increments.
- Limits: requests, CPU, memory, bandwidth, billing, cache invalidation.
- If no durable storage: external compatible store + Edge validation OR remove leaderboard until ready; never claim server verification not implemented.
- Account, payment method and billing alerts.

## Operational constraints
All requests authenticated with anonymous game-specific tokens; rotating secrets in environment, quotas/alerts, no PII by default. Provide an architecture evidence page for judges with actual deployment logs/performance once available.
