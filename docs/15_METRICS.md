# Analytics and performance spec

## Product questions
Can a new user start immediately? Is it fun enough to replay? Does sharing bring genuine entrants? Where do players quit? Is the mobile load tolerable?

## Event dictionary (draft)
`landing_view`, `play_clicked`, `run_started`, `run_finished`, `run_failed`, `retry_clicked`, `share_clicked`, `challenge_opened`, `leaderboard_viewed`, `api_error`, `client_crash`.

## Event properties (minimized)
`game_version`, `challenge_id` (public non-sensitive), `run_duration_bucket`, `score_bucket`, `device_class` coarse, `network_state` coarse, `locale`; avoid IP, full UA, precise identifiers, raw input trace in analytics.

## KPI definitions
- Start rate = unique **consenting/eligible** landing sessions reaching run_started / eligible landing sessions.
- First retry rate = sessions with >=2 starts / sessions with >=1 completed/failed run.
- Completion rate = valid 60s runs / valid starts.
- Share intent = share_clicked / result views; actual external sharing cannot necessarily be measured.
- Invited starts = challenge landings followed by run_started; challenge tokens should not reveal player identity.

## Important warnings
Do not equate installs, visits, API requests, browser sessions, unique humans or competition-recognized unique players. Final methodology depends on organizer rules.
