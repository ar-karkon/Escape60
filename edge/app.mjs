/* Escape 60 game service. Runs on the edge (worker.js) and, unchanged, inside the local Node dev
   server. It decides every rank:
   - daily route,
   - stateless HMAC run tickets (seed, car and start position are signed into the ticket),
   - authoritative 60 Hz replay of the input trace with the same simulation the browser runs,
     in signed chunks so long runs fit a per-request CPU budget,
   - single-use runs, a durable leaderboard and daily stats in object storage.
   Nothing here trusts a score or a time sent by the browser. */
import { createGame, gameResult, replayChunk, restoreGame, snapshotGame, traceTicks, compareResult, hashSeed, spawnIndex, SIM_VERSION, MAX_TICKS } from '../web/src/simulation.js';
import { CARS } from '../web/src/cars.js';

export const API_VERSION = '3.1.0';
const enc = new TextEncoder();
const seedValid = (s) => typeof s === 'string' && /^[a-zA-Z0-9_-]{2,64}$/.test(s);
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const CALL_A = ['Neon', 'Turbo', 'Midnight', 'Sunset', 'Chrome', 'Velvet', 'Rapid', 'Shadow', 'Ghost', 'Blaze', 'Storm', 'Night'];
const CALL_B = ['Fox', 'Viper', 'Falcon', 'Shark', 'Comet', 'Tiger', 'Hawk', 'Wolf', 'Racer', 'Drifter', 'Rocket', 'Panther'];
export function callsign(id) { const h = hashSeed('cs-' + id); return `${CALL_A[h % CALL_A.length]} ${CALL_B[(h >>> 8) % CALL_B.length]} ${10 + ((h >>> 16) % 90)}`; }

export function createApp({ env = {}, store, now = () => Date.now(), log = () => {} }) {
  const minPlayRatio = Number(env.MIN_PLAY_RATIO ?? 0.78);
  // Each request gets a small CPU budget on the edge, so long runs are replayed in signed chunks.
  const chunkTicks = Math.max(60, Number(env.REPLAY_CHUNK || 300));
  // Tickets must verify on every edge node, so the key comes from configuration (never per-isolate random).
  const secretSource = String(env.RUN_SECRET || env.S3_SECRET_KEY || 'escape60-unconfigured-dev-secret');
  let hmacKey;
  const key = () => (hmacKey ??= crypto.subtle.importKey('raw', enc.encode('escape60-run-ticket|' + secretSource), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']));
  const rates = new Map(), boards = new Map();

  const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
  const fail = (status, error) => json({ error }, status);
  function limited(ip, cat, limit, windowMs) {
    const k = `${ip}|${cat}`, t = now(), hits = (rates.get(k) || []).filter((x) => t - x < windowMs);
    if (hits.length >= limit) return true;
    hits.push(t); rates.set(k, hits); if (rates.size > 5000) rates.clear();
    return false;
  }
  async function body(req) {
    const text = await req.text();
    if (text.length > 200000) throw Object.assign(Error('Request too large'), { status: 413 });
    try { return JSON.parse(text || '{}'); } catch { throw Object.assign(Error('Invalid JSON'), { status: 400 }); }
  }
  async function sign(payload) {
    const data = b64u(enc.encode(JSON.stringify(payload)));
    return `${data}.${b64u(await crypto.subtle.sign('HMAC', await key(), enc.encode(data)))}`;
  }
  async function mac(text) { return b64u(await crypto.subtle.sign('HMAC', await key(), enc.encode('ckpt|' + text))); }
  async function macOk(text, sig) { try { return await crypto.subtle.verify('HMAC', await key(), fromB64u(String(sig)), enc.encode('ckpt|' + text)); } catch { return false; } }
  async function verify(token) {
    if (typeof token !== 'string' || token.length > 600) return null;
    const [data, sig] = token.split('.');
    if (!data || !sig) return null;
    let ok = false;
    try { ok = await crypto.subtle.verify('HMAC', await key(), fromB64u(sig), enc.encode(data)); } catch { return null; }
    if (!ok) return null;
    try { return JSON.parse(new TextDecoder().decode(fromB64u(data))); } catch { return null; }
  }
  async function readJson(k) { const got = await store.get(k); return got ? { value: JSON.parse(got.body), etag: got.etag } : null; }
  /** Optimistic read-modify-write; uses If-Match / If-None-Match so concurrent nodes never lose writes. */
  async function update(k, fn, tries = 5) {
    for (let i = 0; i < tries; i++) {
      const cur = await readJson(k);
      const next = fn(cur?.value);
      if (next === undefined) return cur?.value;
      if (await store.put(k, JSON.stringify(next), cur ? { ifMatch: cur.etag } : { ifNoneMatch: '*' })) return next;
    }
    throw Error('storage contention');
  }
  async function bump(date, fn) {
    try { await update(`stats/v2/${date}.json`, (s = { date, runs: 0, escapes: 0, verifyMs: 0, bestPoints: 0, bestTimeMs: 0 }) => { fn(s); return s; }); }
    catch (e) { log('stats', e.message); }
  }

  async function today() {
    const date = dayOf(now());
    return json({ seed: `daily-${date}`, version: SIM_VERSION, api: API_VERSION, expiresAt: `${date}T23:59:59Z` });
  }
  async function start(req, ip) {
    if (limited(ip, 'start', 40, 60000)) return fail(429, 'Please slow down');
    const b = await body(req);
    const t = now(), seed = b.seed || `daily-${dayOf(t)}`;
    if (!seedValid(seed)) return fail(400, 'Invalid seed');
    const car = CARS.some((c) => c.id === b.car) ? b.car : CARS[0].id;
    const spawn = spawnIndex(seed, b.spawn);
    const runId = crypto.randomUUID();
    const token = await sign({ r: runId, s: seed, c: car, p: spawn, t, v: SIM_VERSION });
    return json({ runId, token, seed, car, spawn, issuedAt: t, version: SIM_VERSION });
  }
  async function finish(req, ip) {
    if (limited(ip, 'finish', 120, 60000)) return fail(429, 'Please slow down');
    const b = await body(req);
    const ticket = await verify(b.token);
    if (!ticket || ticket.r !== b.runId) return fail(401, 'Invalid run ticket');
    if (ticket.v !== SIM_VERSION) return fail(409, 'Game was updated — please reload');
    const age = now() - ticket.t;
    if (age > 20 * 60000) return fail(410, 'Run expired');
    if (!Array.isArray(b.trace) || !b.result || typeof b.result !== 'object') return fail(400, 'Missing trace or result');
    const date = dayOf(ticket.t), runKey = `runs/${SIM_VERSION}/${date}/${ticket.r}.json`;
    let total;
    try { total = traceTicks(b.trace); } catch (e) { return fail(422, `Invalid replay: ${e.message}`); }
    // The checkpoint signature binds run id, the exact trace and the exact simulation state.
    const traceHash = b64u(await crypto.subtle.digest('SHA-256', enc.encode(JSON.stringify(b.trace))));
    let game, priorMs = 0;
    const c = b.checkpoint;
    if (c) {
      if (typeof c.state !== 'string' || c.state.length > 120000 || !Number.isFinite(c.ms)) return fail(400, 'Invalid checkpoint');
      if (!(await macOk(`${ticket.r}|${traceHash}|${c.ms}|${c.state}`, c.sig))) return fail(401, 'Invalid checkpoint');
      try { game = restoreGame(c.state); } catch { return fail(400, 'Invalid checkpoint'); }
      if (game.seed !== ticket.s || game.car !== ticket.c || game.spawn !== ticket.p) return fail(401, 'Invalid checkpoint');
      priorMs = c.ms;
    } else {
      if (await store.get(runKey)) return fail(409, 'Run already submitted');
      game = createGame(ticket.s, { car: ticket.c, spawn: ticket.p });
    }
    // Authoritative replay: the browser's numbers are only compared, never trusted.
    const t0 = performance.now(), before = game.ticks;
    let complete;
    try { complete = replayChunk(game, b.trace, chunkTicks); } catch (e) { return fail(422, `Invalid replay: ${e.message}`); }
    const verifyMs = Math.round((priorMs + performance.now() - t0) * 10) / 10;
    // Storage writes get a request of their own (no replay work), so neither part hits the CPU limit.
    if (!complete || (game.ticks > before && !env.SINGLE_PASS)) {
      const state = snapshotGame(game);
      return json({ continue: true, progress: complete ? 100 : Math.round((100 * game.ticks) / total), checkpoint: { state, ms: verifyMs, sig: await mac(`${ticket.r}|${traceHash}|${verifyMs}|${state}`) } }, 202);
    }
    const result = gameResult(game);
    const r = b.result;
    if (r.version !== SIM_VERSION || r.seed !== ticket.s || r.car !== ticket.c || r.spawn !== result.spawn || r.timeMs !== result.timeMs || r.points !== result.points || r.health !== result.health || r.end !== result.end) return fail(422, 'Result does not match authoritative replay');
    if (age < result.timeMs * minPlayRatio) return fail(422, 'Run finished too quickly');
    const record = { runId: ticket.r, seed: ticket.s, car: ticket.c, spawn: ticket.p, date, at: now(), result, verifyMs, label: callsign(ticket.r) };
    if (!(await store.put(runKey, JSON.stringify(record), { ifNoneMatch: '*' }))) return fail(409, 'Run already submitted');
    const entry = { id: ticket.r.slice(0, 8), timeMs: result.timeMs, points: result.points, car: ticket.c, label: record.label, at: record.at };
    const lbKey = `leaderboard/${SIM_VERSION}/${ticket.s}.json`;
    const [rows] = await Promise.all([
      update(lbKey, (list = []) => { const next = list.filter((e) => e.id !== entry.id); next.push(entry); next.sort((a, x) => compareResult(a, x) || a.at - x.at); return next.slice(0, 100); }),
      bump(date, (s) => { s.runs++; if (result.escaped) s.escapes++; s.verifyMs += verifyMs; s.bestTimeMs = Math.max(s.bestTimeMs, result.timeMs); s.bestPoints = Math.max(s.bestPoints, result.points); }),
    ]);
    boards.delete(ticket.s);
    const idx = rows.findIndex((e) => e.id === entry.id);
    return json({ accepted: true, rank: idx >= 0 ? idx + 1 : null, of: rows.length, label: record.label, result, verification: 'deterministic-replay-v3', verifyMs, ticks: game.ticks });
  }
  async function leaderboard(url) {
    const seed = url.searchParams.get('seed') || `daily-${dayOf(now())}`;
    if (!seedValid(seed)) return fail(400, 'Invalid seed');
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 10));
    let memo = boards.get(seed);
    if (!memo || now() - memo.at > 5000) {
      memo = { at: now(), rows: (await readJson(`leaderboard/${SIM_VERSION}/${seed}.json`))?.value || [] };
      boards.set(seed, memo); if (boards.size > 200) boards.delete(boards.keys().next().value);
    }
    return json({ seed, total: memo.rows.length, entries: memo.rows.slice(0, limit).map((e, i) => ({ rank: i + 1, timeMs: e.timeMs, points: e.points, car: e.car, label: e.label })), verified: true }, 200, { 'Cache-Control': 'public, max-age=5' });
  }
  async function statsRoute() {
    const date = dayOf(now());
    const s = (await readJson(`stats/v2/${date}.json`))?.value || { date, runs: 0, escapes: 0, verifyMs: 0, bestPoints: 0, bestTimeMs: 0 };
    return json({ ...s, avgVerifyMs: s.runs ? Math.round((s.verifyMs / s.runs) * 10) / 10 : null }, 200, { 'Cache-Control': 'public, max-age=10' });
  }

  async function handle(req) {
    const url = new URL(req.url), path = url.pathname;
    if (!path.startsWith('/api/')) return null;
    const ip = req.headers.get('ar-real-ip') || req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'local';
    const method = req.method;
    try {
      if (path === '/api/v1/health' && method === 'GET') return json({ status: 'ok', api: API_VERSION, version: SIM_VERSION, storage: store.kind, secured: !!(env.RUN_SECRET || env.S3_SECRET_KEY), maxTicks: MAX_TICKS, time: new Date(now()).toISOString() });
      if (path === '/api/v1/challenges/today' && method === 'GET') return today();
      if (path === '/api/v1/runs/start' && method === 'POST') return start(req, ip);
      if (path === '/api/v1/runs/finish' && method === 'POST') return finish(req, ip);
      if (path === '/api/v1/leaderboard' && method === 'GET') return leaderboard(url);
      if (path === '/api/v1/stats' && method === 'GET') return statsRoute();
      return fail(404, 'Unknown API route');
    } catch (e) {
      log('api error', path, e.message);
      return fail(e.status || 503, e.status ? e.message : 'Service temporarily unavailable');
    }
  }
  return { handle };
}
