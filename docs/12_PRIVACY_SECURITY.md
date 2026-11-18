# Privacy, abuse prevention and security

## Data minimization
No name, phone, email, location, contacts, account login by default. Leaderboard uses random non-identifying alias and temporary game session ID. IPs may appear in infrastructure logs; apply reasonable retention and access controls and verify organizer constraints.

## Telemetry
Collect opt-in/strictly necessary privacy-aware aggregates only after verifying applicable law and host rules; document event schema. Avoid raw fingerprinting, persistent cross-site tracking or stealth identification.

## Security
- No API keys/private credentials in GitHub, frontend bundle, screenshot or logs.
- Treat client data as hostile; validate ranges, types, timestamps, seed/version.
- Rate limits + idempotent writes + replay protection; anomaly monitors.
- TLS, restrictive CORS if relevant, security headers, CSP; dependency scan.
- Third-party assets must have provable licensing.

## Children / accessibility
No chat with strangers, in-app purchase, ads, coercive sharing, location usage or age profiling in MVP. Privacy-friendly defaults for potentially younger players.

## Public disclosure
Provide short privacy statement describing which data is processed, storage duration, user choices, and contact process once storage solution is selected. Do not assert compliance certification or exact retention before implementation.
