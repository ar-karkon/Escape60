/** Deterministic 60 Hz game simulation (2.0). Shared by the browser and the authoritative replay.
 *
 * The player drives one of 14 cars through Sunset Bay with an arcade drift model: automatic throttle,
 * brake, handbrake slides, nitro. Health drops on impacts (and the car limps when damaged); three
 * repairs are available at the fuel & repair stations; at zero health the car is wrecked. The run
 * does not stop at 60 s: the 60 s mark is a milestone with a bonus, then the heat keeps rising until
 * the car is wrecked, busted, or the 10 minute cap is reached.
 *
 * Only + - * /, Math.sqrt/floor/round/min/max/abs and dmath's sin/cos/atan2 are used so every JS
 * engine produces the same run from the same input trace. Units: metres, seconds, radians. */
import { sample, pointAt, edges, nodes, stations, spawnPoint, routeFrom } from './map.js';
import { carById, POLICE, POLICE_TYPES, TRAFFIC } from './cars.js';
import { dsin, dcos, datan2 } from './dmath.js';

export const TICK_RATE = 60;
export const MILESTONE_TICKS = 60 * TICK_RATE;
export const MAX_TICKS = 10 * 60 * TICK_RATE;
export const SIM_VERSION = '2.0.0';
export const MAX_HEALTH = 100;
export const REPAIRS = 3;
export const COMBO_WINDOW = 4;
export const COMBO_MAX = 8;
export const INPUT = { BRAKE: 8, HANDBRAKE: 16, NITRO: 32 };
/** Heat level thresholds in seconds (heat 1..5); after heat 5 extra units join every 25 s. */
export const HEAT_AT = [0, 15, 32, 52, 80];
const POLICE_CAP = [1, 2, 3, 5, 6];
const DT = 1 / TICK_RATE;
const PI = Math.PI, TAU = 2 * Math.PI;
const CAR_R = 2.15;

/** Encode one tick of input: steer in -3..3 (left..right), plus brake / handbrake / nitro flags. */
export function encodeInput(steer, brake = false, hand = false, nitro = false) {
  const s = Math.max(-3, Math.min(3, Math.round(steer)));
  return (s + 3) | (brake ? INPUT.BRAKE : 0) | (hand ? INPUT.HANDBRAKE : 0) | (nitro ? INPUT.NITRO : 0);
}
export function decodeInput(v) { return { steer: ((v & 7) - 3) / 3, brake: !!(v & INPUT.BRAKE), hand: !!(v & INPUT.HANDBRAKE), nitro: !!(v & INPUT.NITRO) }; }

export function hashSeed(value) {
  let h = 2166136261 >>> 0;
  for (const c of String(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed) {
  let s = hashSeed(seed) || 0x9e3779b9;
  return () => { s += 0x6d2b79f5; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function attachRandom(s) {
  s.random = () => { s.rs += 0x6d2b79f5; let t = s.rs; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  return s;
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function norm(a) { while (a > PI) a -= TAU; while (a < -PI) a += TAU; return a; }
const R = {}, R2 = {}, PT = {}, PT2 = {};

export function heatAt(ticks) { const t = ticks / TICK_RATE; let h = 1; for (let i = 1; i < HEAT_AT.length; i++) if (t >= HEAT_AT[i]) h = i + 1; return h; }

export function createGame(seed = 'daily', opts = {}) {
  const car = carById(opts.car);
  const h = hashSeed(seed);
  const sp = spawnPoint(h);
  const heading = datan2(sp.ty, sp.tx);
  const s = {
    seed: String(seed), version: SIM_VERSION, car: car.id, ticks: 0, rs: h || 0x9e3779b9,
    state: 'playing', end: '', health: MAX_HEALTH, repairs: REPAIRS, invuln: 0, points: 0,
    chain: 0, comboTimer: 0, bestChain: 0, nitro: 0.6, heat: 1, bust: 0, milestone: false,
    player: { x: sp.x, y: sp.y, h: heading, a: heading, v: 26, slip: 0, steer: 0, yaw: 0, boost: false, brake: false, hand: false, drifting: false, wallCd: 0, spike: 0 },
    drift: { acc: 0, time: 0, idle: 0 },
    stats: { near: 0, takedowns: 0, driftPts: 0, top: 0, hits: 0, repairs: 0, dodges: 0, nitroTicks: 0, dist: 0 },
    police: [], traffic: [], blocks: [], stationCd: stations.map(() => 0), emptyCd: 0,
    nextPolice: 4 * TICK_RATE, nextTraffic: 0, nextBlock: HEAT_AT[2] * TICK_RATE + 2 * TICK_RATE, pid: 0, tid: 0,
    route: null, routeAt: -1, events: [],
  };
  attachRandom(s);
  if (!opts.noTraffic) for (let k = 0; k < 16; k++) spawnTraffic(s, 50, 480, true);
  if (!opts.noPolice) spawnPolice(s, true);
  if (opts.noPolice) s.nextPolice = 1e9;
  if (opts.noTraffic) s.nextTraffic = 1e9;
  return s;
}

/* ---------------------------------------------------------------- helpers ---------- */
function randomRoadPoint(s, minD, maxD, hidden) {
  const p = s.player, hx = dcos(p.a), hy = dsin(p.a);
  for (let attempt = 0; attempt < 14; attempt++) {
    const e = Math.floor(s.random() * edges.length) % edges.length, E = edges[e];
    const at = s.random() * E.len;
    pointAt(e, at, PT);
    const dx = PT.x - p.x, dy = PT.y - p.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < minD || d > maxD) continue;
    if (hidden && attempt < 10 && (dx * hx + dy * hy) / d > 0.35 && d < 360) continue;
    return { e, s: at, x: PT.x, y: PT.y, tx: PT.tx, ty: PT.ty, d };
  }
  return null;
}
function spawnTraffic(s, minD, maxD, initial = false) {
  const r = randomRoadPoint(s, minD, maxD, !initial);
  if (!r) return;
  const E = edges[r.e], k = E.k;
  // keep the start lane clear right in front of the player
  if (initial) { const p = s.player, dx = r.x - p.x, dy = r.y - p.y; if (r.d < 90 && dx * dcos(p.a) + dy * dsin(p.a) > 0) return; }
  const dir = s.random() < 0.5 ? 1 : -1, lane = Math.floor(s.random() * k.lanes) % k.lanes;
  const vmax = (k.id === 0 ? 24 : k.id === 4 ? 16 : 15) + s.random() * 7;
  const type = Math.floor(s.random() * TRAFFIC.length) % TRAFFIC.length;
  const t = { id: s.tid++, e: r.e, s: r.s, dir, lane, v: vmax, vmax, x: r.x, y: r.y, h: 0, turn: null, loose: 0, vx: 0, vy: 0, spin: 0, near: false, type, color: Math.floor(s.random() * 12) % 12, mass: type === 3 ? 1.6 : type === 5 ? 1.4 : 1.1 };
  railPose(t);
  s.traffic.push(t);
}
/** Position/heading of a traffic car on its lane (or along its junction turn curve). */
function railPose(t) {
  if (t.turn) {
    const T = t.turn, u = T.u, a = 1 - u;
    t.x = a * a * T.x0 + 2 * a * u * T.cx + u * u * T.x1;
    t.y = a * a * T.y0 + 2 * a * u * T.cy + u * u * T.y1;
    const dx = 2 * a * (T.cx - T.x0) + 2 * u * (T.x1 - T.cx), dy = 2 * a * (T.cy - T.y0) + 2 * u * (T.y1 - T.cy);
    t.h = datan2(dy, dx);
    return;
  }
  const E = edges[t.e];
  pointAt(t.e, t.s, PT2);
  const dx = PT2.tx * t.dir, dy = PT2.ty * t.dir, off = (t.lane + 0.5) * E.k.laneW;
  t.x = PT2.x - dy * off; t.y = PT2.y + dx * off; t.h = datan2(dy, dx);
}
function lanePoint(e, at, dir, lane, out) {
  const E = edges[e];
  pointAt(e, at, out);
  const dx = out.tx * dir, dy = out.ty * dir, off = (Math.min(lane, E.k.lanes - 1) + 0.5) * E.k.laneW;
  out.x += -dy * off; out.y += dx * off; out.tx = dx; out.ty = dy;
  return out;
}
const J = 12;
function driveTraffic(s, t) {
  if (t.loose > 0) {
    t.loose -= DT;
    const v = Math.sqrt(t.vx * t.vx + t.vy * t.vy);
    if (v > 0.01) { const nv = Math.max(0, v - 7 * DT); t.vx *= nv / v; t.vy *= nv / v; }
    t.h = norm(t.h + t.spin * DT); t.spin *= 0.97;
    t.x += t.vx * DT; t.y += t.vy * DT;
    wallBounce(t, null);
    return;
  }
  if (t.turn) {
    const T = t.turn;
    T.u += (t.v * DT) / T.len;
    if (T.u >= 1) { t.e = T.e; t.s = T.s; t.dir = T.dir; t.turn = null; }
    railPose(t);
    return;
  }
  t.s += t.dir * t.v * DT;
  const E = edges[t.e];
  const remain = t.dir > 0 ? E.len - t.s : t.s;
  if (remain <= J) {
    const node = nodes[t.dir > 0 ? E.b : E.a];
    const opts = [];
    for (const l of node.edges) if (l.e !== t.e && edges[l.e].len > 2 * J + 4) opts.push(l);
    let next;
    if (opts.length) next = opts[Math.floor(s.random() * opts.length) % opts.length];
    else next = { e: t.e, end: t.dir > 0 ? 1 : 0 }; // dead end: U-turn
    const NE = edges[next.e];
    const ndir = next.end === 0 ? 1 : -1, ns = next.end === 0 ? J : NE.len - J;
    lanePoint(t.e, t.dir > 0 ? E.len - J : J, t.dir, t.lane, PT);
    const x0 = PT.x, y0 = PT.y, tx = PT.tx, ty = PT.ty;
    const lane = Math.min(t.lane, NE.k.lanes - 1);
    lanePoint(next.e, ns, ndir, lane, PT);
    const cx = x0 + tx * J, cy = y0 + ty * J;
    const l1 = Math.sqrt((cx - x0) * (cx - x0) + (cy - y0) * (cy - y0)), l2 = Math.sqrt((PT.x - cx) * (PT.x - cx) + (PT.y - cy) * (PT.y - cy));
    t.turn = { e: next.e, s: ns, dir: ndir, u: 0, len: Math.max(4, (l1 + l2) * 0.92), x0, y0, cx, cy, x1: PT.x, y1: PT.y };
    t.lane = lane;
  }
  railPose(t);
}
/** Push a body out of walls; returns the normal impact speed (m/s) or 0. */
function wallBounce(o, out) {
  sample(o.x, o.y, R2);
  if (R2.g <= 0) return 0;
  o.x -= R2.nx * R2.g; o.y -= R2.ny * R2.g;
  const vn = o.vx * R2.nx + o.vy * R2.ny;
  if (vn > 0) { o.vx -= 1.35 * vn * R2.nx; o.vy -= 1.35 * vn * R2.ny; o.vx *= 0.9; o.vy *= 0.9; }
  if (out) { out.nx = R2.nx; out.ny = R2.ny; }
  return vn > 0 ? vn : 0;
}
function spawnPolice(s, first = false) {
  const p = s.player;
  let r = null;
  if (!first && s.heat >= 2 && s.random() < 0.35) {
    // interceptor: ahead on the player's road, driving toward them
    sample(p.x, p.y, R);
    if (R.e >= 0) {
      const E = edges[R.e]; pointAt(R.e, R.s, PT);
      const fwd = PT.tx * dcos(p.a) + PT.ty * dsin(p.a) >= 0 ? 1 : -1, at = R.s + fwd * 330;
      if (at > 20 && at < E.len - 20) { pointAt(R.e, at, PT); r = { x: PT.x, y: PT.y, tx: -PT.tx * fwd, ty: -PT.ty * fwd }; }
    }
  }
  if (!r) {
    const q = randomRoadPoint(s, first ? 150 : 240, first ? 260 : 420, true);
    if (!q) return;
    const toP = (p.x - q.x) * q.tx + (p.y - q.y) * q.ty >= 0 ? 1 : -1;
    r = { x: q.x, y: q.y, tx: q.tx * toP, ty: q.ty * toP };
  }
  const roll = s.random();
  const type = s.heat >= 4 && roll < 0.25 ? 'suv' : s.heat >= 3 && roll < 0.55 ? 'interceptor' : 'cruiser';
  const st = POLICE[type].stats, h = datan2(r.ty, r.tx);
  s.police.push({ id: s.pid++, type, x: r.x, y: r.y, h, a: h, v: 30, hp: st.hp, wreck: 0, stun: 0, near: false, close: 0, mode: 0, tx: r.x, ty: r.y, los: 0 });
  s.events.push({ type: 'police', tick: s.ticks, kind: type });
}
function policeTop(s, c) {
  const t = s.ticks / TICK_RATE, base = POLICE[c.type].stats.top;
  return base * (0.86 + 0.06 * s.heat) + Math.min(10, Math.max(0, t - 80) / 20);
}
function los(s, ax, ay, bx, by) {
  for (let k = 1; k <= 4; k++) { const u = k / 5; if (sample(ax + (bx - ax) * u, ay + (by - ay) * u, R2).g > 0) return false; }
  return true;
}
function policeTarget(s, c) {
  const p = s.player, dx = p.x - c.x, dy = p.y - c.y, d = Math.sqrt(dx * dx + dy * dy);
  if ((s.ticks + c.id * 7) % 10 === 0) c.los = d < 170 && los(s, c.x, c.y, p.x, p.y) ? 1 : 0;
  if (c.los) {
    const lead = Math.min(1.1, d / Math.max(25, c.v + 10));
    c.tx = p.x + dcos(p.a) * p.v * lead; c.ty = p.y + dsin(p.a) * p.v * lead; c.mode = 1;
    return d;
  }
  c.mode = 0;
  sample(c.x, c.y, R2);
  if (R2.e < 0 || !s.route) { c.tx = p.x; c.ty = p.y; return d; }
  const e = R2.e, E = edges[e], D = s.route;
  const toA = R2.s + D[E.a], toB = E.len - R2.s + D[E.b];
  const look = 16 + c.v * 0.55;
  let dir = toB < toA ? 1 : -1, at = R2.s + dir * look;
  if (at >= 0 && at <= E.len) { pointAt(e, at, PT); c.tx = PT.x; c.ty = PT.y; return d; }
  // past the node: continue along the best edge out of it
  const n = dir > 0 ? E.b : E.a, over = dir > 0 ? at - E.len : -at;
  let best = null, bv = 1e18;
  for (const l of nodes[n].edges) {
    if (l.e === e) continue;
    const o = edges[l.e], far = l.end === 0 ? o.b : o.a, v = o.len + D[far];
    if (v < bv) { bv = v; best = l; }
  }
  if (!best) { pointAt(e, dir > 0 ? E.len : 0, PT); c.tx = PT.x; c.ty = PT.y; return d; }
  const o = edges[best.e];
  pointAt(best.e, best.end === 0 ? Math.min(o.len, over) : Math.max(0, o.len - over), PT);
  c.tx = PT.x; c.ty = PT.y;
  return d;
}

/* ---------------------------------------------------------------- scoring ---------- */
export function comboMult(s) { return s.comboTimer > 0 ? Math.min(COMBO_MAX, Math.max(1, s.chain)) : 1; }
function skill(s, base, type, extra) {
  s.chain = s.comboTimer > 0 ? s.chain + 1 : 1; s.comboTimer = COMBO_WINDOW; if (s.chain > s.bestChain) s.bestChain = s.chain;
  const mult = comboMult(s), pts = base * mult;
  s.points += pts;
  s.events.push({ type, tick: s.ticks, mult, pts, ...extra });
}
function bankDrift(s) {
  const d = s.drift;
  if (d.acc >= 40) {
    const mult = comboMult(s), pts = Math.round(d.acc) * mult;
    s.points += pts; s.stats.driftPts += pts;
    if (s.comboTimer > 0) s.comboTimer = COMBO_WINDOW;
    s.events.push({ type: 'drift', tick: s.ticks, pts, mult, time: Math.round(d.time * 100) / 100 });
  }
  d.acc = 0; d.time = 0; d.idle = 0;
}
function hurt(s, amount, kind) {
  if (s.state !== 'playing') return;
  amount = Math.round(amount);
  if (amount <= 0) return;
  if (s.invuln > 0) amount = Math.round(amount * 0.35);
  if (amount <= 0) return;
  s.health = Math.max(0, s.health - amount);
  s.stats.hits++; s.invuln = 0.35;
  if (s.drift.acc > 0) { s.events.push({ type: 'driftLost', tick: s.ticks, pts: Math.round(s.drift.acc) }); s.drift.acc = 0; s.drift.time = 0; }
  s.chain = 0; s.comboTimer = 0;
  s.events.push({ type: 'hit', tick: s.ticks, kind, dmg: amount });
  if (s.health <= 0) { s.state = 'ended'; s.end = 'wrecked'; s.events.push({ type: 'wrecked', tick: s.ticks }); }
}
function takedown(s, c, how) {
  c.wreck = 6; c.hp = 0;
  s.stats.takedowns++;
  s.nitro = Math.min(1, s.nitro + 0.3);
  skill(s, 800, 'takedown', { id: c.id, how });
}

/** Elastic-ish collision between two moving circles. Returns closing speed. a/b: { x, y, vx, vy }. */
function collide(a, b, ma, mb, r) {
  const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
  if (d2 >= r * r || d2 < 1e-9) return -1;
  const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
  const pen = r - d, wa = mb / (ma + mb), wb = ma / (ma + mb);
  a.x += nx * pen * wa; a.y += ny * pen * wa; b.x -= nx * pen * wb; b.y -= ny * pen * wb;
  const vrn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (vrn >= 0) return 0;
  const j = (-(1.3) * vrn) / (1 / ma + 1 / mb);
  a.vx += (j / ma) * nx; a.vy += (j / ma) * ny; b.vx -= (j / mb) * nx; b.vy -= (j / mb) * ny;
  a.nx = nx; a.ny = ny;
  return -vrn;
}

/* ---------------------------------------------------------------- step ---------- */
const PB = { x: 0, y: 0, vx: 0, vy: 0, nx: 0, ny: 0 }, OB = { x: 0, y: 0, vx: 0, vy: 0 }, WO = {};
export function stepGame(s, input = 3) {
  if (s.state !== 'playing') return s;
  s.ticks++;
  const inp = Number.isInteger(input) && input >= 0 && input < 64 && (input & 7) <= 6 ? input : 3;
  const steerIn = ((inp & 7) - 3) / 3, brake = !!(inp & INPUT.BRAKE), hand = !!(inp & INPUT.HANDBRAKE), wantNitro = !!(inp & INPUT.NITRO);
  const car = carById(s.car), c = car.stats, p = s.player;
  if (s.invuln > 0) s.invuln = Math.max(0, s.invuln - DT);
  if (p.wallCd > 0) p.wallCd = Math.max(0, p.wallCd - DT);
  if (s.emptyCd > 0) s.emptyCd = Math.max(0, s.emptyCd - DT);
  if (s.comboTimer > 0) { s.comboTimer = Math.max(0, s.comboTimer - DT); if (s.comboTimer === 0) s.chain = 0; }
  const prevHeat = s.heat;
  s.heat = heatAt(s.ticks);
  if (s.heat !== prevHeat) s.events.push({ type: 'heat', tick: s.ticks, heat: s.heat });

  // ---- player car ----
  p.steer += clamp(steerIn - p.steer, -6 * DT, 6 * DT);
  const hp = s.health / MAX_HEALTH;
  const limp = hp < 0.6 ? 0.66 + (0.34 * hp) / 0.6 : 1;
  p.boost = wantNitro && s.nitro > 0.002 && !brake;
  if (p.boost) { s.nitro = Math.max(0, s.nitro - DT / c.tank); s.stats.nitroTicks++; }
  p.brake = brake; p.hand = hand;
  const top = c.top * limp + (p.boost ? c.nitro : 0);
  let v = p.v;
  if (brake) v -= 28 * DT;
  else if (v < top) {
    const r = v / top;
    v += (c.accel * (1 - 0.55 * r * r) + (p.boost ? c.accel * 0.9 : 0)) * DT;
    if (v > top) v = top;
  } else v -= (v - top) * 1.4 * DT;
  if (hand) v -= 6 * DT;
  if (p.spike > 0) { p.spike -= DT; v -= 5 * DT; }
  const sl = dsin(p.slip), absSl = sl < 0 ? -sl : sl;
  v -= absSl * v * 0.42 * DT;
  if (v < 0) v = 0;
  const speedK = clamp(v / 10, 0, 1), fast = clamp(v / c.top, 0, 1.3);
  let yaw = p.steer * c.steer * (1.18 - 0.48 * fast) * speedK;
  if (hand) yaw *= 1.35;
  if (p.drifting) yaw *= 1.12;
  p.yaw = yaw;
  p.h = norm(p.h + yaw * DT);
  let slip = norm(p.h - p.a);
  let grip = c.grip;
  const sliding = (slip < 0 ? -slip : slip) > 0.17 && v > 18;
  if (hand && v > 8) grip = (c.grip * 0.16) / c.drift;
  else if (sliding) grip = (c.grip * 0.36) / c.drift + ((p.steer * slip < 0) ? c.grip * 0.25 : 0); // counter-steer recovers
  else if (brake) grip = c.grip * 0.8;
  const k = grip * DT;
  p.a = norm(p.a + slip * (k > 1 ? 1 : k));
  slip = norm(p.h - p.a);
  if (slip > 1.45) { p.a = norm(p.h - 1.45); slip = 1.45; } else if (slip < -1.45) { p.a = norm(p.h + 1.45); slip = -1.45; }
  p.slip = slip;
  p.v = v;
  const ox = p.x, oy = p.y;
  p.x += dcos(p.a) * v * DT; p.y += dsin(p.a) * v * DT;
  // drift scoring
  const absSlip = slip < 0 ? -slip : slip;
  p.drifting = absSlip > 0.2 && v > 15;
  if (p.drifting) {
    const g = absSlip * v * 0.11;
    s.drift.acc += g; s.drift.time += DT; s.drift.idle = 0;
    s.nitro = Math.min(1, s.nitro + absSlip * v * 0.00011);
  } else if (s.drift.acc > 0) { s.drift.idle += DT; if (s.drift.idle > 0.55) bankDrift(s); }
  s.nitro = Math.min(1, s.nitro + 0.006 * DT);

  // walls
  sample(p.x, p.y, R);
  if (R.g > 0) {
    p.x -= R.nx * R.g; p.y -= R.ny * R.g;
    let vx = dcos(p.a) * v, vy = dsin(p.a) * v;
    const vn = vx * R.nx + vy * R.ny;
    if (vn > 0) {
      vx -= 1.25 * vn * R.nx; vy -= 1.25 * vn * R.ny;
      const fr = vn > 8 ? 0.82 : 0.965; vx *= fr; vy *= fr;
      p.v = Math.sqrt(vx * vx + vy * vy);
      if (p.v > 0.5) { const na = datan2(vy, vx); p.h = norm(p.h + norm(na - p.a) * 0.6); p.a = na; }
      if (vn > 9) hurt(s, Math.min(32, (vn - 8) * 0.95) * c.armor, 'wall');
      if (p.wallCd === 0 && v > 12) { p.wallCd = 0.25; s.events.push({ type: 'scrape', tick: s.ticks, vn: Math.round(vn), nx: R.nx, ny: R.ny }); }
    }
  }
  const moved = Math.sqrt((p.x - ox) * (p.x - ox) + (p.y - oy) * (p.y - oy));
  s.stats.dist += moved;
  if (p.v * 3.6 > s.stats.top) s.stats.top = Math.round(p.v * 3.6);
  if (s.state !== 'playing') return s;

  // ---- director: police, traffic, roadblocks ----
  const elapsed = s.ticks / TICK_RATE;
  let cap = POLICE_CAP[s.heat - 1] + (s.heat >= 5 ? Math.floor((elapsed - HEAT_AT[4]) / 25) : 0);
  if (cap > 10) cap = 10;
  let alive = 0; for (const q of s.police) if (!q.wreck) alive++;
  if (s.ticks >= s.nextPolice && alive < cap) { spawnPolice(s); s.nextPolice = s.ticks + Math.round((s.heat >= 4 ? 3 : 5) * TICK_RATE); }
  const trafficCap = 18;
  if (s.ticks >= s.nextTraffic) { if (s.traffic.length < trafficCap) spawnTraffic(s, 230, 460); s.nextTraffic = s.ticks + 18; }
  if (s.heat >= 3 && s.ticks >= s.nextBlock) {
    if (spawnRoadblock(s)) s.nextBlock = s.ticks + Math.round((s.heat >= 5 ? 10 : 14) * TICK_RATE);
    else s.nextBlock = s.ticks + 2 * TICK_RATE;
  }
  if (s.routeAt < 0 || s.ticks - s.routeAt >= 30) {
    sample(p.x, p.y, R);
    if (R.e >= 0) { s.route = Array.from(routeFrom(R.e, R.s)); s.routeAt = s.ticks; }
  }

  PB.x = p.x; PB.y = p.y; PB.vx = dcos(p.a) * p.v; PB.vy = dsin(p.a) * p.v;
  let hitAny = false;
  const hx = dcos(p.a), hy = dsin(p.a);

  // ---- police ----
  let closeCops = 0;
  for (const q of s.police) {
    if (q.wreck < 0) continue;
    if (q.wreck > 0) {
      q.wreck -= DT; q.v = Math.max(0, q.v - 14 * DT);
      q.x += dcos(q.a) * q.v * DT; q.y += dsin(q.a) * q.v * DT;
      continue;
    }
    const st = POLICE[q.type].stats;
    const d = policeTarget(s, q);
    const want = datan2(q.ty - q.y, q.tx - q.x);
    const delta = norm(want - q.h), ad = delta < 0 ? -delta : delta;
    if (q.stun > 0) q.stun -= DT;
    else {
      const turn = st.steer * (q.v > 40 ? 0.85 : 1.05);
      q.h = norm(q.h + clamp(delta * 3.5, -turn, turn) * DT);
      let vt = policeTop(s, q) * (1 - Math.min(0.62, ad * 0.75));
      if (d > 260) vt *= 1.12;
      if (q.mode === 1 && d < 30) vt = Math.max(vt, p.v + 6);
      q.v += clamp(vt - q.v, -24 * DT, st.accel * DT);
    }
    const qs = norm(q.h - q.a), gk = st.grip * DT;
    q.a = norm(q.a + qs * (gk > 1 ? 1 : gk));
    q.x += dcos(q.a) * q.v * DT; q.y += dsin(q.a) * q.v * DT;
    OB.x = q.x; OB.y = q.y; OB.vx = dcos(q.a) * q.v; OB.vy = dsin(q.a) * q.v;
    const vn = wallBounce(OB, WO);
    // player collision
    const imp = collide(PB, OB, c.mass, st.mass, CAR_R * 2);
    if (imp >= 0) hitAny = true;
    if (imp > 0) {
      const attack = clamp(-(hx * PB.nx + hy * PB.ny), 0, 1);
      if (imp > 4) {
        hurt(s, Math.min(30, (imp - 4) * 0.72 * (1.25 - attack * 0.6)) * c.armor, 'police');
        q.hp -= (imp - 3) * 1.6 * (0.45 + attack * 1.1);
        q.stun = 0.45;
        s.events.push({ type: 'bump', tick: s.ticks, id: q.id, imp: Math.round(imp), x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
      }
    }
    q.x = OB.x; q.y = OB.y;
    const qv = Math.sqrt(OB.vx * OB.vx + OB.vy * OB.vy);
    if (qv > 0.2) { const na = datan2(OB.vy, OB.vx); if (imp > 0 || vn > 0) { q.h = norm(q.h + norm(na - q.a) * 0.5); q.a = na; } }
    q.v = qv;
    if (vn > 12) q.hp -= (vn - 9) * 2.4;
    if (q.hp <= 0 && !q.wreck) { takedown(s, q, imp > 0 ? 'ram' : 'wall'); continue; }
    // near miss / proximity
    const dx = p.x - q.x, dy = p.y - q.y, dd = Math.sqrt(dx * dx + dy * dy);
    if (dd < 11) closeCops++;
    if (dd < 6.2 && imp < 0 && !q.near && p.v > 22) { q.near = true; s.stats.near++; s.nitro = Math.min(1, s.nitro + 0.1); skill(s, 220, 'near', { cop: 1 }); }
    if (dd > 14) q.near = false;
    if (dd > 760) { q.wreck = -1; q.gone = 1; s.nextPolice = Math.min(s.nextPolice, s.ticks + 60); }
  }
  // police vs police and police vs traffic (separation, damage at speed)
  for (let i = 0; i < s.police.length; i++) {
    const a = s.police[i];
    for (let j = i + 1; j < s.police.length; j++) {
      const b = s.police[j];
      if ((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) > 25) continue;
      const A = { x: a.x, y: a.y, vx: dcos(a.a) * a.v, vy: dsin(a.a) * a.v }, B = { x: b.x, y: b.y, vx: dcos(b.a) * b.v, vy: dsin(b.a) * b.v };
      const imp = collide(A, B, 1.2, 1.2, CAR_R * 2);
      if (imp >= 0) { a.x = A.x; a.y = A.y; b.x = B.x; b.y = B.y; a.v = Math.sqrt(A.vx * A.vx + A.vy * A.vy); b.v = Math.sqrt(B.vx * B.vx + B.vy * B.vy); if (imp > 14) { a.hp -= imp; b.hp -= imp; } }
    }
    for (const t of s.traffic) {
      if ((a.x - t.x) * (a.x - t.x) + (a.y - t.y) * (a.y - t.y) > 25) continue;
      const A = { x: a.x, y: a.y, vx: dcos(a.a) * a.v, vy: dsin(a.a) * a.v }, B = { x: t.x, y: t.y, vx: t.loose ? t.vx : dcos(t.h) * t.v, vy: t.loose ? t.vy : dsin(t.h) * t.v };
      const imp = collide(A, B, 1.2, t.mass, CAR_R * 2);
      if (imp > 0) {
        a.x = A.x; a.y = A.y; a.v = Math.sqrt(A.vx * A.vx + A.vy * A.vy);
        t.loose = 7; t.turn = null; t.x = B.x; t.y = B.y; t.vx = B.vx; t.vy = B.vy; t.spin = (s.random() - 0.5) * 3;
        if (imp > 12) { a.hp -= (imp - 8) * 1.8; a.stun = 0.5; }
      }
    }
    if (a.hp <= 0 && !a.wreck) takedown(s, a, 'crash');
  }

  // ---- traffic ----
  for (let i = 0; i < s.traffic.length; i++) {
    const t = s.traffic[i];
    if (!t.loose) {
      // follow the car ahead in the same lane
      let vt = t.vmax;
      for (let j = 0; j < s.traffic.length; j++) {
        if (j === i) continue;
        const o = s.traffic[j];
        const dx = o.x - t.x, dy = o.y - t.y;
        if (dx * dx + dy * dy > 400) continue;
        const ahead = dx * dcos(t.h) + dy * dsin(t.h), lat = -dx * dsin(t.h) + dy * dcos(t.h);
        if (ahead > 0 && ahead < 15 && (lat < 0 ? -lat : lat) < 2.2) vt = Math.min(vt, ahead < 7 ? 0 : o.loose ? 0 : o.v * 0.95);
      }
      t.v += clamp(vt - t.v, -10 * DT, 4 * DT);
    }
    driveTraffic(s, t);
    OB.x = t.x; OB.y = t.y; OB.vx = t.loose ? t.vx : dcos(t.h) * t.v; OB.vy = t.loose ? t.vy : dsin(t.h) * t.v;
    const imp = collide(PB, OB, c.mass, t.mass, CAR_R * 2);
    if (imp >= 0) {
      hitAny = true;
      if (imp > 0) {
        if (imp > 5) { hurt(s, Math.min(30, (imp - 6) * 0.62) * c.armor, 'traffic'); s.events.push({ type: 'bump', tick: s.ticks, imp: Math.round(imp), x: (p.x + t.x) / 2, y: (p.y + t.y) / 2, traffic: 1 }); }
      }
      t.loose = 8; t.turn = null; t.x = OB.x; t.y = OB.y; t.vx = OB.vx; t.vy = OB.vy; t.spin = (s.random() - 0.5) * (2 + imp * 0.15);
    } else {
      const dx = p.x - t.x, dy = p.y - t.y, dd = dx * dx + dy * dy;
      if (dd < 5.6 * 5.6 && !t.near && !t.loose && p.v > 24) { t.near = true; s.stats.near++; s.nitro = Math.min(1, s.nitro + 0.08); skill(s, 150, 'near'); }
    }
  }
  if (hitAny) { p.x = PB.x; p.y = PB.y; const v2 = Math.sqrt(PB.vx * PB.vx + PB.vy * PB.vy); if (v2 > 0.3) { const na = datan2(PB.vy, PB.vx); p.h = norm(p.h + norm(na - p.a) * 0.5); p.a = na; } p.v = v2; }
  // despawn far traffic
  for (let i = s.traffic.length - 1; i >= 0; i--) {
    const t = s.traffic[i], dx = t.x - p.x, dy = t.y - p.y;
    if (dx * dx + dy * dy > 620 * 620 || (t.loose > 0 && t.loose < 0.1)) s.traffic.splice(i, 1);
  }
  for (let i = s.police.length - 1; i >= 0; i--) if (s.police[i].wreck < 0) s.police.splice(i, 1);

  // ---- roadblocks ----
  for (let bi = s.blocks.length - 1; bi >= 0; bi--) {
    const b = s.blocks[bi];
    b.ttl -= DT;
    let touched = false;
    for (const u of b.units) {
      const dx = p.x - u.x, dy = p.y - u.y, d2 = dx * dx + dy * dy, rr = CAR_R + u.r;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        p.x = u.x + nx * rr; p.y = u.y + ny * rr;
        let vx = dcos(p.a) * p.v, vy = dsin(p.a) * p.v;
        const vn = -(vx * nx + vy * ny);
        if (vn > 0) { vx += 1.3 * vn * nx; vy += 1.3 * vn * ny; p.v = Math.sqrt(vx * vx + vy * vy) * 0.85; if (p.v > 0.3) p.a = datan2(vy, vx); }
        if (vn > 6 && !b.hit) { hurt(s, Math.min(36, (vn - 4) * 0.95) * c.armor, 'roadblock'); s.events.push({ type: 'bump', tick: s.ticks, imp: Math.round(vn), x: u.x, y: u.y, block: 1 }); }
        touched = true;
      }
    }
    if (touched) b.hit = true;
    if (b.spike && !b.spiked) {
      const lx = (p.x - b.sx) * b.tx + (p.y - b.sy) * b.ty, ly = -(p.x - b.sx) * b.ty + (p.y - b.sy) * b.tx;
      if ((lx < 0 ? -lx : lx) < 1.2 && (ly < 0 ? -ly : ly) < b.sw) { b.spiked = true; p.spike = 2.5; hurt(s, 12 * c.armor, 'spikes'); s.events.push({ type: 'spikes', tick: s.ticks }); }
    }
    const dx = p.x - b.x, dy = p.y - b.y, d2 = dx * dx + dy * dy;
    if (!b.passed && d2 < 12 * 12) b.near = true;
    if (!b.passed && b.near && d2 > 14 * 14 && (dx * b.tx + dy * b.ty) * b.side > 0) { b.passed = true; if (!b.hit) { s.stats.dodges++; skill(s, 400, 'dodge'); } }
    if (b.ttl <= 0 || d2 > 700 * 700) s.blocks.splice(bi, 1);
  }

  // ---- stations ----
  for (let i = 0; i < stations.length; i++) {
    if (s.stationCd[i] > 0) { s.stationCd[i] = Math.max(0, s.stationCd[i] - DT); continue; }
    const st = stations[i];
    const lx = (p.x - st.x) * st.ca + (p.y - st.y) * st.sa, ly = -(p.x - st.x) * st.sa + (p.y - st.y) * st.ca;
    if ((lx < 0 ? -lx : lx) > 13 || (ly < 0 ? -ly : ly) > 6.5) continue;
    if (s.health >= MAX_HEALTH - 0.5) continue;
    if (s.repairs <= 0) { if (s.emptyCd === 0) { s.emptyCd = 4; s.events.push({ type: 'repairEmpty', tick: s.ticks, station: i }); } continue; }
    s.repairs--; s.stats.repairs++;
    const gained = Math.round(MAX_HEALTH - s.health);
    s.health = MAX_HEALTH; s.invuln = 1; s.stationCd[i] = 25;
    s.nitro = Math.min(1, s.nitro + 0.25);
    s.events.push({ type: 'repair', tick: s.ticks, station: i, left: s.repairs, gained });
  }

  // ---- busted ----
  if (s.ticks > 3 * TICK_RATE && closeCops > 0 && p.v < 7) s.bust = Math.min(1, s.bust + (DT / 2.6) * (1 + 0.35 * (closeCops - 1)));
  else s.bust = Math.max(0, s.bust - DT / 1.3);
  if (s.bust >= 1 && s.state === 'playing') { s.state = 'ended'; s.end = 'busted'; s.events.push({ type: 'busted', tick: s.ticks }); return s; }

  // ---- time ----
  if (s.ticks % TICK_RATE === 0) s.points += 10 * s.heat;
  if (s.ticks === MILESTONE_TICKS && !s.milestone) {
    s.milestone = true;
    s.points += 2500;
    s.events.push({ type: 'milestone', tick: s.ticks, points: s.points, health: Math.round(s.health) });
  }
  if (s.ticks >= MAX_TICKS && s.state === 'playing') { bankDrift(s); s.state = 'ended'; s.end = 'legend'; s.events.push({ type: 'legend', tick: s.ticks }); }
  if (s.state === 'ended' && s.drift.acc > 0) bankDrift(s);
  return s;
}

function spawnRoadblock(s) {
  const p = s.player;
  sample(p.x, p.y, R);
  if (R.e < 0) return false;
  const E = edges[R.e];
  pointAt(R.e, R.s, PT);
  const fwd = PT.tx * dcos(p.a) + PT.ty * dsin(p.a) >= 0 ? 1 : -1;
  const ahead = 230 + s.random() * 70, at = R.s + fwd * ahead;
  if (at < 30 || at > E.len - 30) return false;
  pointAt(R.e, at, PT);
  const tx = PT.tx * fwd, ty = PT.ty * fwd, nx = -ty, ny = tx, hw = E.k.hw;
  const gapSide = s.random() < 0.5 ? -1 : 1, gap = 6.4;
  // units across the road from the far curb, leaving a gap at one side
  const units = [];
  const from = -gapSide * hw, to = gapSide * (hw - gap);
  const n = Math.max(2, Math.round(Math.abs(to - from) / 3.2));
  for (let i = 0; i <= n; i++) { const o = from + ((to - from) * i) / n; units.push({ x: PT.x + nx * o, y: PT.y + ny * o, r: 1.5 }); }
  const spike = s.heat >= 4;
  const go = gapSide * (hw - gap / 2);
  s.blocks.push({ id: s.ticks, x: PT.x, y: PT.y, tx, ty, units, ttl: 24, side: 1, gapSide, hit: false, near: false, passed: false,
    spike, spiked: false, sx: PT.x + nx * go + tx * 2, sy: PT.y + ny * go + ty * 2, sw: gap / 2, hw });
  s.events.push({ type: 'roadblock', tick: s.ticks, spike });
  return true;
}

/* ---------------------------------------------------------------- results / replay ---------- */
export function gameResult(s) {
  return { version: SIM_VERSION, seed: s.seed, car: s.car, timeMs: Math.round((s.ticks * 1000) / TICK_RATE), points: s.points, health: Math.round(s.health),
    end: s.end, escaped: s.ticks >= MILESTONE_TICKS, near: s.stats.near, takedowns: s.stats.takedowns, driftPts: s.stats.driftPts, bestChain: s.bestChain,
    topSpeed: s.stats.top, repairs: s.stats.repairs, hits: s.stats.hits, dodges: s.stats.dodges, dist: Math.round(s.stats.dist), heat: s.heat };
}
export function compareResult(a, b) { return (b.points - a.points) || (b.timeMs - a.timeMs); }
export function encodeTrace(values) {
  if (!values.length) return [];
  const out = []; let last = values[0], count = 0;
  for (const v of values) { if (v === last && count < 65535) count++; else { out.push([last, count]); last = v; count = 1; } }
  out.push([last, count]); return out;
}
/** Validate an RLE trace; returns its length in ticks. */
export function traceTicks(trace) {
  if (!Array.isArray(trace) || trace.length > MAX_TICKS) throw Error('Invalid trace');
  let total = 0;
  for (const part of trace) {
    if (!Array.isArray(part) || part.length !== 2 || !Number.isInteger(part[0]) || part[0] < 0 || part[0] > 63 || (part[0] & 7) > 6 || !Number.isInteger(part[1]) || part[1] < 1 || part[1] > 65535) throw Error('Invalid trace item');
    total += part[1]; if (total > MAX_TICKS) throw Error('Trace too long');
  }
  return total;
}
/** Exact, JSON-safe copy of the simulation state (events are not needed to continue a replay). */
export function snapshotGame(s) { const { random, events, ...rest } = s; return JSON.stringify(rest); }
export function restoreGame(json) {
  const s = JSON.parse(json);
  if (!s || s.version !== SIM_VERSION || typeof s.seed !== 'string') throw Error('Invalid checkpoint');
  s.events = []; return attachRandom(s);
}
/** Advance `game` along `trace` from tick `game.ticks` for at most `budget` ticks.
    Returns true once the whole trace has been applied (and the game must then have ended). */
export function replayChunk(game, trace, budget = MAX_TICKS) {
  let start = game.ticks, pos = 0, done = 0;
  for (const [v, n] of trace) {
    if (pos + n <= start) { pos += n; continue; }
    for (let i = Math.max(0, start - pos); i < n; i++) {
      if (done >= budget) return false;
      if (game.state === 'ended') throw Error('Input after game end');
      stepGame(game, v); done++;
      if (game.events.length > 64) game.events.length = 0;
    }
    pos += n;
  }
  if (game.state !== 'ended') throw Error('Game has not ended');
  return true;
}
export function replayTrace(seed, trace, car) {
  traceTicks(trace);
  const game = createGame(seed, { car });
  replayChunk(game, trace);
  return gameResult(game);
}
