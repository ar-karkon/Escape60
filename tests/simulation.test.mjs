import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, gameResult, encodeTrace, encodeInput, decodeInput, traceTicks, replayTrace, replayChunk, snapshotGame, restoreGame, MAX_TICKS, MILESTONE_TICKS, SIM_VERSION, INPUT, heatAt } from '../web/src/simulation.js';
import { sample, edges, nodes, stations, spawnPoint, pointAt } from '../web/src/map.js';
import { CARS } from '../web/src/cars.js';

/** Road-following autopilot used to drive realistic runs (no randomness: deterministic traces). */
function autopilot(g) {
  const p = g.player, r = sample(p.x, p.y, {});
  if (r.e < 0) return encodeInput(0);
  const pt = pointAt(r.e, r.s, {}), fwd = pt.tx * Math.cos(p.h) + pt.ty * Math.sin(p.h) >= 0 ? 1 : -1;
  const E = edges[r.e], q = pointAt(r.e, Math.max(0, Math.min(E.len, r.s + fwd * (12 + p.v * 0.45))), {});
  const tx = q.x - q.ty * fwd * 2.5, ty = q.y + q.tx * fwd * 2.5;
  let d = Math.atan2(ty - p.y, tx - p.x) - p.h; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  return encodeInput(Math.max(-3, Math.min(3, Math.round(d * 5))), Math.abs(d) > 0.4 && p.v > 28, false, Math.abs(d) < 0.1 && g.nitro > 0.2);
}
function drive(seed, car, maxTicks = MAX_TICKS, pilot = autopilot) {
  const g = createGame(seed, { car }), inputs = [];
  while (g.state === 'playing' && g.ticks < maxTicks) { const v = pilot(g); inputs.push(v); stepGame(g, v); g.events.length = 0; }
  return { g, inputs };
}

test('map: connected road graph, smooth junctions, stations beside roads', () => {
  assert.ok(edges.length > 100 && nodes.length > 60);
  // every node reachable from node 0
  const seen = new Set([0]), stack = [0];
  while (stack.length) { const n = stack.pop(); for (const l of nodes[n].edges) { const e = edges[l.e], o = l.end === 0 ? e.b : e.a; if (!seen.has(o)) { seen.add(o); stack.push(o); } } }
  assert.equal(seen.size, nodes.length, 'road network is connected');
  for (const e of edges) { const m = pointAt(edges.indexOf(e), e.len / 2, {}); assert.ok(sample(m.x, m.y, {}).g < 0, 'road centre is drivable'); }
  assert.equal(stations.length, 5);
  for (const s of stations) assert.ok(sample(s.x, s.y, {}).g < 0, 'pit stop pad is drivable');
  for (let k = 0; k < 6; k++) { const sp = spawnPoint(k); assert.ok(sample(sp.x, sp.y, {}).g < 0, 'spawn on road'); }
});

test('input encoding round-trips and invalid traces are rejected', () => {
  const v = encodeInput(-3, true, false, true);
  assert.deepEqual(decodeInput(v), { steer: -1, brake: true, hand: false, nitro: true });
  assert.equal(encodeInput(3, false, true, false) & INPUT.HANDBRAKE, INPUT.HANDBRAKE);
  assert.equal(traceTicks([[3, 10], [11, 5]]), 15);
  assert.throws(() => traceTicks([[7, 1]]), /Invalid trace item/);
  assert.throws(() => traceTicks([[64, 1]]), /Invalid trace item/);
  assert.throws(() => traceTicks([[3, MAX_TICKS + 1]]), /Invalid trace item|too long/);
});

test('same seed + car + inputs = identical run (deterministic)', () => {
  const a = drive('daily-2026-11-19', 'kaze', 2400), b = drive('daily-2026-11-19', 'kaze', 2400);
  assert.deepEqual(gameResult(a.g), gameResult(b.g));
  assert.equal(a.g.player.x, b.g.player.x);
  const c = drive('daily-2026-11-19', 'toro', 2400);
  assert.notEqual(c.g.player.x, a.g.player.x, 'car stats change the run');
});

test('replay of a recorded trace reproduces the browser result exactly', () => {
  const { g, inputs } = drive('replay-check', 'raiden');
  assert.equal(g.state, 'ended');
  const replayed = replayTrace('replay-check', encodeTrace(inputs), 'raiden');
  assert.deepEqual(replayed, gameResult(g));
});

test('chunked replay with checkpoints equals a single pass', () => {
  const { g, inputs } = drive('chunks', 'volta');
  const trace = encodeTrace(inputs);
  let game = createGame('chunks', { car: 'volta' }), done = false, guard = 0;
  while (!done && guard++ < 400) { done = replayChunk(game, trace, 500); if (!done) game = restoreGame(snapshotGame(game)); }
  assert.deepEqual(gameResult(game), gameResult(g));
});

test('the run continues past 60 s: milestone bonus, then heat keeps rising', () => {
  const g = createGame('milestone', { car: 'kaze' });
  let milestone = null;
  while (g.state === 'playing' && g.ticks < MILESTONE_TICKS + 600) { g.health = 100; stepGame(g, autopilot(g)); for (const e of g.events) if (e.type === 'milestone') milestone = e; g.events.length = 0; }
  assert.ok(milestone, 'milestone event fired');
  assert.equal(milestone.tick, MILESTONE_TICKS);
  assert.equal(g.state, 'playing', 'game keeps going after 60 s');
  assert.ok(gameResult(g).escaped);
  assert.equal(heatAt(MILESTONE_TICKS + 1200), 5);
});

test('damage limps the car, pit stops repair up to three times, zero health wrecks', () => {
  const g = createGame('pit', { car: 'kaze', noPolice: true, noTraffic: true });
  const st = stations[0], p = g.player;
  const place = () => { p.x = st.x - st.ca * 25; p.y = st.y - st.sa * 25; p.h = p.a = Math.atan2(st.sa, st.ca); p.v = 18; p.slip = 0; };
  let repairs = 0;
  for (let k = 0; k < 4; k++) {
    g.health = 30; g.stationCd.fill(0); place();
    for (let i = 0; i < 150 && g.state === 'playing'; i++) { stepGame(g, encodeInput(0)); for (const e of g.events) if (e.type === 'repair') repairs++; g.events.length = 0; }
  }
  assert.equal(repairs, 3);
  assert.equal(g.repairs, 0);
  assert.ok(g.health < 100, 'no fourth repair');
  // limp: a damaged car is slower
  const fast = createGame('limp', { car: 'kaze', noPolice: true, noTraffic: true }), slow = createGame('limp', { car: 'kaze', noPolice: true, noTraffic: true });
  slow.health = 20;
  for (let i = 0; i < 300; i++) { slow.health = 20; stepGame(fast, autopilot(fast)); stepGame(slow, autopilot(slow)); }
  assert.ok(slow.stats.dist < fast.stats.dist, 'damaged car covers less distance');
  // wreck
  const w = createGame('wreck', { car: 'kaze', noTraffic: true, noPolice: true });
  w.health = 1;
  let ended = null;
  for (let i = 0; i < 3000 && w.state === 'playing'; i++) { stepGame(w, encodeInput(3, false, false, true)); for (const e of w.events) if (e.type === 'wrecked') ended = e; w.events.length = 0; }
  assert.equal(w.end, 'wrecked'); assert.ok(ended);
});

test('nitro boosts top speed and drains the tank; handbrake starts a drift', () => {
  const a = createGame('nitro', { car: 'kaze', noPolice: true, noTraffic: true }), b = createGame('nitro', { car: 'kaze', noPolice: true, noTraffic: true });
  a.nitro = b.nitro = 1;
  let topA = 0, topB = 0;
  for (let i = 0; i < 240; i++) { a.player.x = b.player.x = 0; a.player.y = b.player.y = 0; stepGame(a, encodeInput(0, false, false, true)); stepGame(b, encodeInput(0)); topA = Math.max(topA, a.player.v); topB = Math.max(topB, b.player.v); }
  assert.ok(topA > topB + 5, 'nitro is faster');
  assert.ok(a.nitro < 0.5, 'tank drains');
  const d = createGame('drift', { car: 'hachi', noPolice: true, noTraffic: true });
  d.player.v = 40;
  let maxSlip = 0;
  for (let i = 0; i < 40; i++) { d.player.x = 0; d.player.y = 0; stepGame(d, encodeInput(3, false, true, false)); maxSlip = Math.max(maxSlip, Math.abs(d.player.slip)); }
  assert.ok(maxSlip > 0.3, 'handbrake slides the rear');
});

test('all 14 cars run deterministically under the autopilot', () => {
  assert.equal(CARS.length, 14);
  assert.equal(new Set(CARS.map((c) => c.id)).size, 14);
  for (const c of CARS) {
    const { g, inputs } = drive('cars-' + c.id, c.id, 1200);
    assert.ok(g.ticks > 0);
    if (g.state === 'ended') assert.deepEqual(replayTrace('cars-' + c.id, encodeTrace(inputs), c.id), gameResult(g));
  }
  assert.equal(SIM_VERSION, '2.0.0');
});
