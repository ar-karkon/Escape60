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
function play(seed, car) {
  const g = createGame(seed, { car }), steps = [];
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
  assert.match(quick.body.error, /faster than real time|too quickly/);
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

/* ---------- edge referee v4 ---------- */
function playSteps(seed, car) {
  const g = createGame(seed, { car }), steps = [], pts = [0];
  while (g.state === 'playing') { const v = pilot(g); steps.push(v); stepGame(g, v); g.events.length = 0; pts.push(g.points); }
  return { steps, pts, result: gameResult(g) };
}
async function liveRun(h, seed, car, every = 300) {
  const t = await h.call('/api/v1/runs/start', { seed, car });
  const run = playSteps(seed, car);
  h.advance(3000); // countdown
  let checkpoint, n = 0, last;
  for (let at = every; at < run.steps.length; at += every) {
    h.advance((every * 1000) / 60);
    last = await h.call('/api/v1/runs/live', { runId: t.body.runId, token: t.body.token, trace: encodeTrace(run.steps.slice(0, at)), checkpoint });
    assert.equal(last.status, 200, JSON.stringify(last.body));
    assert.equal(last.body.verified, at);
    assert.equal(last.body.points, run.pts[at], 'edge score equals the local score at the same tick');
    checkpoint = last.body.checkpoint; n++;
  }
  h.advance(2000);
  const f = await h.call('/api/v1/runs/finish', { runId: t.body.runId, token: t.body.token, trace: encodeTrace(run.steps), result: run.result, checkpoint });
  return { t, run, f, n, last };
}

test('live referee verifies the run while it is driven and the final verdict reuses its checkpoint', async () => {
  const h = harness();
  const { f, n, last, run } = await liveRun(h, 'live-a', 'kaze');
  assert.ok(n >= 3, `live checks: ${n}`);
  assert.ok(last.body.standing && last.body.standing.rank === 1, 'live rank on an empty board');
  assert.equal(f.status, 200, JSON.stringify(f.body));
  assert.equal(f.body.live, n);
  assert.deepEqual(f.body.result, run.result);
  assert.match(f.body.share, /^\/r\/[a-f0-9]{12}$/);
  const lb = await h.call('/api/v1/leaderboard?seed=live-a');
  assert.equal(lb.body.entries[0].ghost, true);
});

test('pacing proof: inputs faster than real time are refused, live and at finish', async () => {
  const h = harness();
  const t = await h.call('/api/v1/runs/start', { seed: 'pace', car: 'kaze' });
  const run = playSteps('pace', 'kaze');
  h.advance(2000);
  const ahead = await h.call('/api/v1/runs/live', { runId: t.body.runId, token: t.body.token, trace: encodeTrace(run.steps.slice(0, 900)) });
  assert.equal(ahead.status, 422); assert.match(ahead.body.error, /faster than real time/);
  // a legit first check, then a burst that outruns the clock
  h.advance(10000);
  const ok = await h.call('/api/v1/runs/live', { runId: t.body.runId, token: t.body.token, trace: encodeTrace(run.steps.slice(0, 600)) });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  h.advance(1000);
  const burst = await h.call('/api/v1/runs/live', { runId: t.body.runId, token: t.body.token, trace: encodeTrace(run.steps.slice(0, 1200)), checkpoint: ok.body.checkpoint });
  assert.equal(burst.status, 422);
  const m = await h.call('/api/v1/edge');
  assert.ok(m.body.today.rejects.pacing >= 2);
});

test('checkpoints are bound to the exact input prefix', async () => {
  const h = harness();
  const t = await h.call('/api/v1/runs/start', { seed: 'prefix', car: 'kaze' });
  const run = playSteps('prefix', 'kaze');
  h.advance(15000);
  const a = await h.call('/api/v1/runs/live', { runId: t.body.runId, token: t.body.token, trace: encodeTrace(run.steps.slice(0, 600)) });
  assert.equal(a.status, 200);
  const edited = run.steps.slice(0, 900); edited[100] = edited[100] === 3 ? 4 : 3; // rewrite history
  h.advance(5000);
  const b = await h.call('/api/v1/runs/live', { runId: t.body.runId, token: t.body.token, trace: encodeTrace(edited), checkpoint: a.body.checkpoint });
  assert.equal(b.status, 401);
});

test('the edge picks a ghost rival whose inputs replay to the same score', async () => {
  const h = harness();
  const one = await liveRun(h, 'ghosts', 'kaze');
  assert.equal(one.f.status, 200);
  const r = await h.call('/api/v1/rival?seed=ghosts&points=0');
  assert.equal(r.status, 200);
  assert.equal(r.body.rival.points, one.run.result.points);
  const g = createGame('ghosts', { car: r.body.rival.car });
  for (const [v, c] of r.body.rival.trace) for (let i = 0; i < c; i++) { stepGame(g, v); g.events.length = 0; }
  assert.equal(g.points, r.body.rival.points, 'bit-exact ghost');
  const none = await h.call('/api/v1/rival?seed=nobody-here');
  assert.equal(none.body.rival, null);
});

test('edge-rendered share card, link preview and percentile', async () => {
  let clock = DAY;
  const store = memoryStore();
  const app = createApp({ env: { RUN_SECRET: 't', REPLAY_CHUNK: 40000, SINGLE_PASS: true }, store, now: () => clock, loadIndex: async () => '<!doctype html><html><head><meta property="og:title" content="old"><title>x</title></head><body></body></html>' });
  const call = async (path, payload) => { const res = await app.handle(new Request('http://edge' + path, payload ? { method: 'POST', body: JSON.stringify(payload) } : {})); return res; };
  const ids = [];
  for (const car of ['kaze', 'toro']) {
    const t = await (await call('/api/v1/runs/start', { seed: 'cards', car })).json();
    const run = playSteps('cards', car); clock += run.result.timeMs + 5000;
    const f = await (await call('/api/v1/runs/finish', { runId: t.runId, token: t.token, trace: encodeTrace(run.steps), result: run.result })).json();
    assert.equal(f.accepted, true, JSON.stringify(f)); ids.push(f);
  }
  assert.equal(typeof ids[1].better, 'number');
  assert.equal(ids[1].runs, 2);
  const png = await call(`/api/v1/card/${ids[0].id}.png`);
  assert.equal(png.status, 200); assert.equal(png.headers.get('content-type'), 'image/png');
  const bytes = new Uint8Array(await png.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const page = await (await call(`/r/${ids[0].id}`)).text();
  assert.match(page, /og:image" content="http:\/\/edge\/api\/v1\/card\/[a-f0-9]{12}\.png"/);
  assert.match(page, /history\.replaceState\(null,"","\/\?seed=cards&c=\d+\.\d+&r=[a-f0-9]{12}"\)/);
  assert.equal((page.match(/og:title/g) || []).length, 1, 'old og tags replaced');
  assert.equal((await call('/r/000000000000')).status, 302);
});

test('lab runs are verified but never stored; telemetry counts the work', async () => {
  const h = harness();
  const t = await h.call('/api/v1/runs/start', { lab: true, car: 'kaze' });
  assert.equal(t.body.seed, 'edge-lab');
  const run = playSteps('edge-lab', 'kaze'); h.advance(run.result.timeMs + 5000);
  const f = await h.call('/api/v1/runs/finish', { runId: t.body.runId, token: t.body.token, trace: encodeTrace(run.steps), result: run.result });
  assert.equal(f.status, 200); assert.equal(f.body.stored, false);
  assert.equal((await h.call('/api/v1/leaderboard?seed=edge-lab')).body.total, 0);
  const b = await h.call('/api/v1/edge/bench?ticks=120');
  assert.equal(b.body.ticks, 120);
  const m = await h.call('/api/v1/edge');
  assert.ok(m.body.today.c.ticks >= run.steps.length + 120);
  assert.ok(m.body.features.includes('live-referee'));
});

test('static delivery negotiates Brotli/gzip copies and passes byte ranges through', async () => {
  const { createStatic } = await import('../edge/static.mjs');
  const files = { 'app-ABCDEFGH.js': 'x'.repeat(1000), 'app-ABCDEFGH.js.br': 'BR', 'app-ABCDEFGH.js.gz': 'GZIP', 'music.mp3': 'MP3DATA' };
  const seen = [];
  const fetchImpl = async (url, opt = {}) => { const name = url.split('/').pop(); seen.push([name, opt.headers?.Range]); return files[name] ? new Response(files[name], { status: opt.headers?.Range ? 206 : 200, headers: { 'content-length': String(files[name].length) } }) : new Response('no', { status: 404 }); };
  const sizes = { 'app-ABCDEFGH.js': { raw: 1000, br: 2, gz: 4 } };
  const metrics = { c: {}, add(k, n = 1) { this.c[k] = (this.c[k] || 0) + n; } };
  const s = createStatic({ origin: 'https://bucket', fetchImpl, sizes, metrics });
  const br = await s(new Request('https://e/app-ABCDEFGH.js', { headers: { 'accept-encoding': 'gzip, deflate, br' } }));
  assert.equal(br.headers.get('content-encoding'), 'br'); assert.equal(await br.text(), 'BR'); assert.equal(br.headers.get('vary'), 'Accept-Encoding');
  const gz = await s(new Request('https://e/app-ABCDEFGH.js', { headers: { 'accept-encoding': 'gzip' } }));
  assert.equal(gz.headers.get('content-encoding'), 'gzip');
  const plain = await s(new Request('https://e/app-ABCDEFGH.js'));
  assert.equal(plain.headers.get('content-encoding'), null); assert.equal((await plain.text()).length, 1000);
  const ranged = await s(new Request('https://e/music.mp3', { headers: { range: 'bytes=0-3', 'accept-encoding': 'br' } }));
  assert.equal(ranged.status, 206); assert.equal(ranged.headers.get('content-encoding'), null);
  assert.equal(metrics.c.savedBytes, 998 + 996);
  const off = createStatic({ origin: 'https://bucket', fetchImpl, sizes, precompressed: false });
  assert.equal((await off(new Request('https://e/app-ABCDEFGH.js', { headers: { 'accept-encoding': 'br' } }))).headers.get('content-encoding'), null);
  assert.equal((await s(new Request('https://e/edge'))).status, 404, 'routes map /edge to edge.html (absent here)');
});

test('with nobody else on the board, the rival is your own best run', async () => {
  const h = harness();
  const one = await liveRun(h, 'solo', 'kaze');
  const r = await h.call(`/api/v1/rival?seed=solo&points=${one.run.result.points}&not=${one.f.body.id}`);
  assert.equal(r.body.rival.self, true);
  assert.equal(r.body.rival.points, one.run.result.points);
});
