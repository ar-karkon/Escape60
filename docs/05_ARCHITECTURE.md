# Technical architecture — proposed, validation required

## Architecture sketch
```
User Browser (ES modules + Three.js WebGL2)
  | static files (CDN / Arvan Edge static hosting)
  | HTTPS REST
  v
Arvan Edge Function/API [IF compatible runtime is confirmed]
  - seed/version, challenge token
  - result validation, replay safeguards
  - leaderboard querying
  |
  v
Durable store [selection pending Arvan feature verification]
```

## Frontend
- Native ES modules load the bundled engine in web/vendor. city.js builds instanced block geometry. render.js owns the camera, scene and reusable vehicle/particle pools. The renderer reads the 60 Hz simulation and never writes race state.
- Game loop with fixed timestep where possible, interpolation rendering, independent UI state.
- Separate game simulation from networking to support offline practice.
- Asset budgets: <= 4 MB first-load *target*, not yet measured; compression, sprite atlas, lazy loading.
- No server dependencies for local prototype.

## Candidate structure (not yet created)
```
src/game/{entities,systems,scenes,physics,ai,config}/
src/ui/{components,i18n}/
src/services/{challenges,leaderboard,telemetry}/
src/shared/{types,prng}/
edge/{routes,auth,validation,storage}/
tests/{unit,sim,e2e,performance}/
public/assets/
```

## Backend feasibility
**Do not assume** Arvan Edge can use Node APIs, durable SQL, web sockets, crypto primitives or request body sizes without official documentation / smoke test. Keep adapters, mocks and runtime matrix.

## Environments
`local`, `preview`, `production`. Only production uses official game URL. Configure with environment variables; **never commit keys**. Feature flags for leaderboard/offline.

## Reliability
Timeout + retry idempotently, circuit breaker for leaderboard, no loss of local play due to backend downtime. Cache challenge config per short TTL; never cache private tokens publicly.

## Decisions before code
Camera projection, orientation, map tile format, size target, physics timestep, server-side replay strategy, storage adapter, deployment instructions.
