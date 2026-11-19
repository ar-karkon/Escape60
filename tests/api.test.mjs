import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, callsign } from '../edge/app.mjs';
import { memoryStore } from '../edge/s3.mjs';
import { createGame, stepGame, encodeTrace, encodeInput, gameResult } from '../web/src/simulation.js';
import { sample, pointAt, edges } from '../web/src/map.js';

const DAY = Date.parse('2026-11-19T10:00:00Z');
function harness({ chunk } = {}) {
  let clock = DAY;
  const store = memoryStore();
  const app = createApp({ env: { RUN_SECRET: 'test', REPLAY_CHUNK: chunk || 40000, SINGLE_PASS: !chunk }, store, now: () => clock });
  const call = async (path, payload) => {
    const res = await app.handle(new Request('http://edge' + path, payload ? { method: 'POST', body: JSON.stringify(payload) } : {}));
    return { status: res.status, body: await res.json() };
  };
  return { app, store, call, advance: (ms) => { clock += ms; } };
}
function pilot(g) {
  const p = g.player, r = sample(p.x, p.y, {});
  if (r.e < 0) return encodeInput(0);
  const pt = pointAt(r.e, r.s, {}), fwd = pt.tx * Math.cos(p.h) + pt.ty * Math.sin(p.h) >= 0 ? 1 : -1;
  const E = edges[r.e], q = pointAt(r.e, Math.max(0, Math.min(E.len, r.s + fwd * (12 + p.v * 0.45))), {});
  let d = Math.atan2(q.y + q.tx * fwd * 2.5 - p.y, q.x - q.ty * fwd * 2.5 - p.x) - p.h; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  return encodeInput(Math.max(-3, Math.min(3, Math.round(d * 5))), Math.abs(d) > 0.4 && p.v > 28, false, false);
}
function play(seed, car, spawn) {
  const g = createGame(seed, { car, spawn }), steps = [];
  while (g.state === 'playing') { const v = pilot(g); steps.push(v); stepGame(g, v); g.events.length = 0; }
  return { trace: encodeTrace(steps), result: gameResult(g) };
}

test('health reports the game service', async () => {
  const r = await harness().call('/api/v1/health');
  assert.equal(r.status, 200); assert.equal(r.body.status, 'ok'); assert.equal(r.body.storage, 'memory');
  assert.equal(r.body.ai, undefined, 'no AI features');
});

test('daily route', async () => {
  const r = await harness().call('/api/v1/challenges/today');
  assert.equal(r.body.seed, 'daily-2026-11-19');
});

test('a played run is replayed, verified and ranked; replays are single-use', async () => {
  const h = harness();
  const t = await h.call('/api/v1/runs/start', { seed: 'daily-2026-11-19', car: 'raiden' });
  assert.equal(t.status, 200); assert.equal(t.body.car, 'raiden');
  const { trace, result } = play('daily-2026-11-19', 'raiden');
  h.advance(result.timeMs + 1000);
  const f = await h.call('/api/v1/runs/finish', { runId: t.body.runId, token: t.body.token, trace, result });
  assert.equal(f.status, 200, JSON.stringify(f.body));
  assert.equal(f.body.rank, 1);
  assert.deepEqual(f.body.result, result);
  const again = await h.call('/api/v1/runs/finish', { runId: t.body.runId, token: t.body.token, trace, result });
  assert.equal(again.status, 409);
  const lb = await h.call('/api/v1/leaderboard?seed=daily-2026-11-19');
  assert.equal(lb.body.entries.length, 1);
  assert.equal(lb.body.entries[0].points, result.points);
  assert.equal(lb.body.entries[0].car, 'raiden');
  assert.equal(lb.body.entries[0].label, callsign(t.body.runId));
});

test('the ticket binds the random start position', async () => {
  const h = harness();
  const t = await h.call('/api/v1/runs/start', { seed: 'daily-2026-11-19', car: 'kaze', spawn: 17 });
  assert.equal(t.body.spawn, 17);
  const { trace, result } = play('daily-2026-11-19', 'kaze', 17);
  assert.equal(result.spawn, 17);
  h.advance(result.timeMs + 1000);
  const ok = await h.call('/api/v1/runs/finish', { runId: t.body.runId, token: t.body.token, trace, result });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const t2 = await h.call('/api/v1/runs/start', { seed: 'daily-2026-11-19', car: 'kaze', spawn: 18 });
  const bad = await h.call('/api/v1/runs/finish', { runId: t2.body.runId, token: t2.body.token, trace, result });
  assert.equal(bad.status, 422, 'a run from another start does not verify');
  const t3 = await h.call('/api/v1/runs/start', { seed: 'x1', car: 'kaze', spawn: -4 });
  assert.ok(Number.isInteger(t3.body.spawn) && t3.body.spawn >= 0, 'invalid start index is replaced');
});

test('forged score, wrong car or too-fast submission is rejected', async () => {
  const h = harness();
  const t = await h.call('/api/v1/runs/start', { seed: 'forge', car: 'kaze' });
  const { trace, result } = play('forge', 'kaze');
  h.advance(result.timeMs + 1000);
  const fake = await h.call('/api/v1/runs/finish', { runId: t.body.runId, token: t.body.token, trace, result: { ...result, points: result.points + 5000 } });
  assert.equal(fake.status, 422);
  const t2 = await h.call('/api/v1/runs/start', { seed: 'forge', car: 'kaze' });
  const other = play('forge', 'toro');
  h.advance(other.result.timeMs + 1000);
  const wrongCar = await h.call('/api/v1/runs/finish', { runId: t2.body.runId, token: t2.body.token, trace: other.trace, result: other.result });
  assert.equal(wrongCar.status, 422, 'the ticket binds the car');
  const t3 = await h.call('/api/v1/runs/start', { seed: 'forge', car: 'kaze' });
  const quick = await h.call('/api/v1/runs/finish', { runId: t3.body.runId, token: t3.body.token, trace, result });
  assert.equal(quick.status, 422);
  assert.match(quick.body.error, /too quickly/);
});

test('long runs replay in signed chunks; tampered checkpoints are refused', async () => {
  const h = harness({ chunk: 600 });
  const t = await h.call('/api/v1/runs/start', { seed: 'chunked', car: 'volta' });
  const { trace, result } = play('chunked', 'volta');
  h.advance(result.timeMs + 1000);
  let body = { runId: t.body.runId, token: t.body.token, trace, result }, r, n = 0;
  for (;;) {
    r = await h.call('/api/v1/runs/finish', body);
    if (r.status !== 202) break;
    n++;
    if (n === 1) {
      const bad = await h.call('/api/v1/runs/finish', { ...body, checkpoint: { ...r.body.checkpoint, state: r.body.checkpoint.state.replace('"points":', '"points":9') } });
      assert.equal(bad.status, 401);
    }
    body = { ...body, checkpoint: r.body.checkpoint };
  }
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(n >= 2);
  assert.deepEqual(r.body.result, result);
});
