import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, gameResult, encodeTrace, encodeInput, decodeInput, traceTicks, replayTrace, replayChunk, snapshotGame, restoreGame, MAX_TICKS, MILESTONE_TICKS, SIM_VERSION, INPUT, heatAt } from '../web/src/simulation.js';
import { sample, edges, nodes, stations, spawnPoint, pointAt, SPAWNS, SPAWN_COUNT, district } from '../web/src/map.js';
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
function drive(seed, car, maxTicks = MAX_TICKS, pilot = autopilot, spawn) {
  const g = createGame(seed, { car, spawn }), inputs = [];
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
  assert.ok(SPAWN_COUNT >= 30, 'starts all over the city');
  for (let k = 0; k < SPAWN_COUNT; k++) { const sp = spawnPoint(k); assert.ok(sample(sp.x, sp.y, {}).g < -1, 'spawn on road'); assert.equal(sp.index, k); }
  assert.ok(new Set(SPAWNS.map((s) => district(s.x, s.y))).size >= 6, 'starts in most districts');
  assert.equal(spawnPoint(SPAWN_COUNT + 3).index, 3, 'indices wrap');
});

test('each run can start anywhere: the start index is part of the run and of its replay', () => {
  const a = createGame('spawn-check', { car: 'kaze', spawn: 0 }), b = createGame('spawn-check', { car: 'kaze', spawn: 7 });
  assert.notEqual(a.player.x, b.player.x);
  assert.equal(a.spawn, 0); assert.equal(b.spawn, 7);
  const d = createGame('spawn-check', { car: 'kaze' }), e = createGame('spawn-check', { car: 'kaze', spawn: 9999 });
  assert.equal(d.spawn, e.spawn, 'invalid index falls back to the seed start');
  const { g, inputs } = drive('spawn-replay', 'raiden', MAX_TICKS, autopilot, 11);
  assert.equal(gameResult(g).spawn, 11);
  assert.deepEqual(replayTrace('spawn-replay', encodeTrace(inputs), 'raiden', 11), gameResult(g));
  let other = null;
  try { other = replayTrace('spawn-replay', encodeTrace(inputs), 'raiden', 12); } catch { other = 'rejected'; }
  assert.notDeepEqual(other, gameResult(g), 'another start gives another run');
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
  assert.equal(SIM_VERSION, '2.3.0');
});

/* ---------- daily rules (city briefing): contracts + police tactics ---------- */
import { cleanRules, contractReward, DEFAULT_TACTICS } from '../web/src/rules.js';
import { advanceTrace } from '../web/src/simulation.js';
function driveRules(seed, opts, n = 2400) {
  const g = createGame(seed, opts), steps = [];
  for (let i = 0; i < n && g.state === 'playing'; i++) { const v = encodeInput(Math.round(Math.sin(i / 40) * 3), i % 200 > 185, i % 300 > 270, i % 500 < 40); steps.push(v); stepGame(g, v); g.events.length = 0; }
  return { g, trace: encodeTrace(steps) };
}
test('rules are bounded, quantised and rewarded by formula', () => {
  const r = cleanRules({ id: 'd-x<script>', contracts: [{ type: 'drift', goal: 1e9, zone: 3 }, { type: 'drift', goal: 5 }, { type: 'warp', goal: 1 }, { type: 'speed', goal: 171.3 }, { type: 'near', goal: -4, zone: 99 }, { type: 'chain', goal: 4 }], tactics: { pace: 9, patrol: 'x', spikes: 3.4, traffic: 0 } });
  assert.equal(r.id, 'd-xscript');
  assert.deepEqual(r.contracts.map((c) => [c.type, c.goal, c.zone]), [['drift', 3000, 3], ['speed', 170, -1], ['near', 4, -1]]);
  assert.equal(r.contracts[0].reward, contractReward(r.contracts[0]));
  assert.deepEqual(r.tactics, { ...DEFAULT_TACTICS, pace: 1.2, spikes: 3, traffic: 12 });
  assert.equal(cleanRules(null), null);
});
test('contracts pay out inside the simulation and replay identically', () => {
  const rules = { id: 'd-test', contracts: [{ type: 'survive', goal: 45 }, { type: 'explore', goal: 2 }, { type: 'speed', goal: 170 }], tactics: { pace: 1.2, blocks: 1.4, spikes: 3 } };
  const a = driveRules('rules-f', { car: 'raiden', rules });
  const base = driveRules('rules-f', { car: 'raiden' });
  assert.ok(a.g.contracts.some((c) => c.done), 'at least one contract completed');
  const paid = a.g.contracts.filter((c) => c.done).reduce((s, c) => s + c.reward, 0);
  assert.equal(gameResult(a.g).contracts, a.g.contracts.filter((c) => c.done).length);
  assert.ok(paid > 0);
  assert.notDeepEqual(gameResult(a.g), gameResult(base.g), 'rules change the run');
  // replay from the trace, and across a snapshot/restore, is bit-exact
  const b = createGame('rules-f', { car: 'raiden', rules });
  advanceTrace(b, a.trace, 900);
  const c = restoreGame(snapshotGame(b));
  advanceTrace(c, a.trace);
  assert.deepEqual(gameResult(c), gameResult(a.g));
});
test('tactics change the pursuit: faster heat with a higher pace', () => {
  assert.equal(heatAt(15 * 60), 2);
  assert.equal(heatAt(13 * 60, 1.2), 2);
  assert.equal(heatAt(13 * 60), 1);
});

test('focus tactic: bounded, off by default, and replays deterministically', () => {
  assert.equal(DEFAULT_TACTICS.focus, -1); assert.equal(DEFAULT_TACTICS.focusRate, 1);
  const r = cleanRules({ tactics: { focus: 42, focusRate: 9 } });
  assert.equal(r.tactics.focus, -1, "out of range = no focus"); assert.equal(r.tactics.focusRate, 1.6);
  assert.equal(cleanRules({ tactics: { focus: 3.6 } }).tactics.focus, -1); assert.equal(cleanRules({ tactics: { focus: 4 } }).tactics.focus, 4);
  const zone = createGame('focus-a', { car: 'raiden' }).zone;
  const rules = { id: 'd-focus', contracts: [], tactics: { focus: zone, focusRate: 1.6, pace: 1.2 } };
  const a = driveRules('focus-a', { car: 'raiden', rules }, 3600);
  assert.equal(a.g.tac.focus, zone);
  const b = createGame('focus-a', { car: 'raiden', rules });
  advanceTrace(b, a.trace, 1300);
  const c = restoreGame(snapshotGame(b));
  advanceTrace(c, a.trace);
  assert.deepEqual(gameResult(c), gameResult(a.g));
  assert.equal(c.player.x, a.g.player.x);
});

/* ---------- takedown attribution (2.3.0): only takedowns the player caused count ---------- */
let cid = 100;
function cop(g, x, y, h, extra = {}) {
  const c = { id: cid++, type: 'cruiser', x, y, h, a: h, v: 0, hp: 50, wreck: 0, stun: 5, near: false, close: 0, mode: 0, tx: x, ty: y, los: 0, touch: -9999, tk: 0, tkp: 0, ...extra };
  g.police.push(c); return c;
}
/** A point mid-way along a long road far from the player (dist in metres). */
function roadSpot(g, dist) {
  const p = g.player;
  for (let e = 0; e < edges.length; e++) {
    if (edges[e].len < 80) continue;
    const m = pointAt(e, edges[e].len / 2, {}), d = Math.hypot(m.x - p.x, m.y - p.y);
    if (d > dist && d < dist + 150) return m;
  }
  throw Error('no road spot');
}
function run(g, n, input = encodeInput(0)) {
  const ev = [];
  for (let i = 0; i < n && g.state === 'playing'; i++) { stepGame(g, input); ev.push(...g.events); g.events.length = 0; }
  return ev;
}
const quiet = (seed) => createGame(seed, { car: 'kaze', noPolice: true, noTraffic: true });

test('an unattributed pile-up far away pays nothing: wreck event only', () => {
  const g = quiet('td-pile'), m = roadSpot(g, 300), h = Math.atan2(m.ty, m.tx);
  cop(g, m.x - m.tx * 2, m.y - m.ty * 2, h, { v: 40, hp: 1, stun: 0 });
  cop(g, m.x + m.tx * 2, m.y + m.ty * 2, h + Math.PI, { v: 40, hp: 1, stun: 0 });
  const nitro = g.nitro, ev = run(g, 10);
  assert.equal(ev.filter((e) => e.type === 'takedown').length, 0);
  const w = ev.filter((e) => e.type === 'wreck');
  assert.equal(w.length, 2, 'both cops wreck');
  for (const e of w) { assert.ok(e.d > 250); assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y)); }
  assert.equal(g.stats.takedowns, 0); assert.equal(g.points, 0);
  assert.ok(g.nitro < nitro + 0.01, 'no nitro reward');
  assert.ok(g.police.every((c) => !c.tk));
  // the same pile-up right after the player touched one of them is a PILE-UP for both
  const k = quiet('td-pile'), n = roadSpot(k, 300), hk = Math.atan2(n.ty, n.tx);
  cop(k, n.x - n.tx * 2, n.y - n.ty * 2, hk, { v: 40, hp: 1, stun: 0, touch: -10 });
  cop(k, n.x + n.tx * 2, n.y + n.ty * 2, hk + Math.PI, { v: 40, hp: 1, stun: 0 });
  const ek = run(k, 10).filter((e) => e.type === 'takedown');
  assert.deepEqual(ek.map((e) => e.how), ['pileup', 'pileup']);
  assert.equal(k.stats.takedowns, 2);
});

test('a lethal ram keeps the chain, fills nitro and starts a surge', () => {
  const g = quiet('td-ram'), p = g.player;
  g.chain = 3; g.comboTimer = 2; g.bestChain = 3; g.nitro = 0.2;
  const c = cop(g, p.x + Math.cos(p.a) * 4.6, p.y + Math.sin(p.a) * 4.6, p.a + Math.PI, { v: 20, hp: 1 });
  const ev = run(g, 3);
  const td = ev.find((e) => e.type === 'takedown');
  assert.ok(td, 'takedown');
  assert.equal(td.how, 'ram'); assert.equal(td.id, c.id);
  assert.ok(td.mult >= 4); assert.equal(td.pts, 800 * td.mult);
  assert.ok(Number.isFinite(td.x) && td.d < 10);
  const hit = ev.find((e) => e.type === 'hit');
  assert.ok(hit && hit.soft === true && hit.kind === 'ram', 'soft hit');
  assert.ok(g.chain >= 4, 'chain kept');
  assert.equal(g.stats.hits, 0, 'a lethal ram is not a hit');
  assert.ok(g.player.surge > 0); assert.ok(g.nitro > 0.99);
  assert.equal(c.tk, 'ram'); assert.equal(c.tkp, td.pts);
  // a non-lethal ram still hurts the normal way
  const n = quiet('td-ram'), q = n.player; n.chain = 3; n.comboTimer = 2;
  cop(n, q.x + Math.cos(q.a) * 4.6, q.y + Math.sin(q.a) * 4.6, q.a + Math.PI, { v: 20, hp: 500 });
  const en = run(n, 3);
  assert.ok(en.some((e) => e.type === 'hit' && !e.soft)); assert.equal(n.chain, 0);
});

test('a lethal ram punches through: the player keeps (almost) all its speed', () => {
  for (const [name, rel, cv] of [['rear', 0, 30], ['head-on', Math.PI, 20], ['t-bone', Math.PI / 2, 0]]) {
    const g = quiet('td-punch'), p = g.player;
    p.v = 44.5;
    cop(g, p.x + Math.cos(p.a) * 4.6, p.y + Math.sin(p.a) * 4.6, p.a + rel, { v: cv, hp: 1 });
    let before = p.v, done = false;
    for (let i = 0; i < 4 && !done; i++) {
      before = g.player.v; stepGame(g, encodeInput(0));
      done = g.events.some((e) => e.type === 'takedown'); g.events.length = 0;
    }
    assert.ok(done, `${name}: takedown`);
    assert.ok(g.player.v >= before - 4, `${name}: ${before.toFixed(1)} -> ${g.player.v.toFixed(1)}`);
  }
});

test('bait: a cop chasing close behind that wrecks itself is a takedown', () => {
  const mk = (pv, mode) => {
    const g = quiet('td-bait'), m = roadSpot(g, 300), h = Math.atan2(m.ty, m.tx), p = g.player;
    p.x = m.x - m.tx * 30; p.y = m.y - m.ty * 30; p.a = p.h = h; p.v = pv;
    cop(g, m.x - m.tx * 2, m.y - m.ty * 2, h, { v: 40, hp: 1, mode, los: mode });
    cop(g, m.x + m.tx * 2, m.y + m.ty * 2, h + Math.PI, { v: 40, hp: 1, mode, los: mode });
    return run(g, 6).filter((e) => e.type === 'takedown');
  };
  const td = mk(25, 1);
  assert.ok(td.length >= 1 && td.every((e) => e.how === 'bait'), JSON.stringify(td.map((e) => e.how)));
  assert.equal(mk(10, 1).length, 0, 'too slow is no bait');
  assert.equal(mk(25, 0).length, 0, 'not chasing is no bait');
});

function slamCase(touchAgo) {
  const g = quiet('td-slam'), m = roadSpot(g, 300), nx = -m.ty, ny = m.tx;
  const c = cop(g, m.x + nx * 2, m.y + ny * 2, Math.atan2(ny, nx), { v: 45, hp: 1, touch: g.ticks - touchAgo });
  return { g, c, ev: run(g, 30) };
}
test('wall slam counts only right after the player touched the cop', () => {
  const a = slamCase(30);
  const td = a.ev.find((e) => e.type === 'takedown');
  assert.ok(td && td.how === 'slam', 'slam');
  assert.equal(td.pts, 1000);
  const b = slamCase(300);
  assert.equal(b.ev.filter((e) => e.type === 'takedown').length, 0);
  assert.ok(b.ev.some((e) => e.type === 'wreck' && e.id === b.c.id));
  assert.equal(b.g.points, 0); assert.equal(b.g.stats.takedowns, 0);
});

function trafficCase(pkAgo) {
  const g = quiet('td-traffic'), m = roadSpot(g, 300);
  const c = cop(g, m.x, m.y, Math.atan2(m.ty, m.tx), { hp: 1 });
  g.traffic.push({ id: 999, e: 0, s: 0, dir: 1, lane: 0, v: 0, vmax: 20, x: m.x - m.tx * 4.4, y: m.y - m.ty * 4.4, h: Math.atan2(m.ty, m.tx), turn: null, loose: 7, vx: m.tx * 32, vy: m.ty * 32, spin: 0, near: false, pk: g.ticks - pkAgo, type: 0, color: 0, mass: 1.1 });
  return { g, c, ev: run(g, 6) };
}
test('traffic check: a car the player knocked loose wrecks a cop', () => {
  const a = trafficCase(20);
  const td = a.ev.find((e) => e.type === 'takedown');
  assert.ok(td && td.how === 'traffic');
  assert.equal(a.c.tk, 'traffic');
  const b = trafficCase(600);
  assert.equal(b.ev.filter((e) => e.type === 'takedown').length, 0);
  assert.ok(b.ev.some((e) => e.type === 'wreck'));
  // the player knocking a traffic car loose marks it
  const g = quiet('td-pk'), p = g.player;
  const t = { id: 5, e: 0, s: 0, dir: 1, lane: 0, v: 0, vmax: 20, x: p.x + Math.cos(p.a) * 4.5, y: p.y + Math.sin(p.a) * 4.5, h: p.a, turn: null, loose: 7, vx: 0, vy: 0, spin: 0, near: false, pk: -9999, type: 0, color: 0, mass: 1.1 };
  g.traffic.push(t);
  run(g, 2);
  assert.ok(t.pk > 0, 'pk set by player contact');
});

test('the surge carries the car further than an identical run without it', () => {
  const a = quiet('surge'), b = quiet('surge'), top = CARS.find((c) => c.id === 'kaze').stats.top;
  a.player.v = b.player.v = top; a.player.surge = 1.2;
  for (let i = 0; i < 60; i++) { a.player.x = b.player.x = 0; a.player.y = b.player.y = 0; stepGame(a, encodeInput(0)); stepGame(b, encodeInput(0)); }
  assert.ok(a.stats.dist > b.stats.dist + 1, `surge ${a.stats.dist} vs ${b.stats.dist}`);
  assert.ok(a.player.v > top, 'above top speed during the surge');
  assert.ok(a.player.surge > 0 && a.player.surge < 0.3);
});

test('snapshot/restore mid-surge with touch/pk/tk set equals a single pass', () => {
  const { g: ref, inputs } = drive('td-snap', 'volta', 900);
  const g = createGame('td-snap', { car: 'volta' });
  for (let i = 0; i < 300; i++) { stepGame(g, inputs[i]); g.events.length = 0; }
  g.player.surge = 1.1;
  if (g.police[0]) { g.police[0].touch = g.ticks - 10; g.police[0].tk = 'ram'; }
  if (g.traffic[0]) g.traffic[0].pk = g.ticks - 5;
  const snap = snapshotGame(g), back = restoreGame(snap);
  assert.equal(snapshotGame(back), snap);
  const obj = JSON.parse(snap);
  assert.equal(obj.player.surge, 1.1);
  if (g.police[0]) assert.equal(obj.police[0].touch, g.ticks - 10);
  if (g.traffic[0]) assert.equal(obj.traffic[0].pk, g.ticks - 5);
  for (let i = 300; i < inputs.length && g.state === 'playing'; i++) { stepGame(g, inputs[i]); stepGame(back, inputs[i]); g.events.length = back.events.length = 0; }
  assert.deepEqual(gameResult(back), gameResult(g));
  assert.equal(snapshotGame(back), snapshotGame(g));
  assert.ok(ref.ticks > 0);
});
