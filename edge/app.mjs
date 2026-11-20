/* Escape 60 game service — the "edge referee". Runs on the edge (worker.js) and, unchanged, inside
   the local Node dev server. Every rank, rival and share card is decided here; nothing trusts a
   score, a time or a position sent by the browser.

   - Run tickets: stateless HMAC tokens binding run id, route (seed), car, start position and issue time.
   - Live referee: while you drive, the browser streams its input trace (~5 s of inputs, a few
     hundred bytes) and the edge re-simulates those ticks with the same 60 Hz simulation, checks
     that inputs arrive no faster than real time, and answers with the authoritative score and
     your live global rank. Each answer carries an HMAC checkpoint bound to the exact trace prefix
     and simulation state, so the edge stays stateless and the final verdict is instant.
   - Final verification: the rest of the trace is replayed (in signed chunks if needed), the
     browser's result is compared field by field, the run is stored once (single use).
   - Ghost rival: verified traces are kept; the edge picks the run just above your best and sends
     its inputs, which the browser re-simulates bit-exactly as a ghost car.
   - Share cards: a pixel-art PNG of a verified run, drawn and encoded on the edge, plus /r/<id>
     link previews (Open Graph) that open the game on the same route with a verified target.
   - Percentile, daily stats and edge telemetry for the /edge dashboard.
   - With AIaaS (edge/ai.mjs): the daily city briefing (contracts + police tactics the simulation
     plays by, frozen per day), the police-radio bank, a dispatcher call per run and the crew chief
     after each verified run. Handwritten fallbacks keep everything working without the model. */
import { createGame, gameResult, advanceTrace, tracePrefix, restoreGame, snapshotGame, traceTicks, compareResult, hashSeed, spawnIndex, stepGame, encodeInput, SIM_VERSION, MAX_TICKS, TICK_RATE } from '../web/src/simulation.js';
import { CARS, carById } from '../web/src/cars.js';
import { drawCard } from './card.mjs';
import { createAI } from './ai.mjs';
import { fallbackDirector, rulesOf, fallbackChief, FALLBACK_RADIO, heatSummary, leagueOf, HEAT_KINDS } from '../web/src/director.js';
import { ZONES } from '../web/src/rules.js';
import { createMetrics } from './metrics.mjs';

export const API_VERSION = '4.2.0';
export const FEATURES = ['tickets', 'live-referee', 'pacing-proof', 'live-rank', 'chunked-replay', 'ghost-rival', 'edge-cards', 'link-previews', 'percentile', 'telemetry', 'precompressed-static', 'ai-director', 'ai-radio', 'ai-dispatch', 'ai-crew-chief', 'multi-ghost', 'verified-splits', 'leagues', 'heat-commander', 'rival-personas'];
/** Points are recorded every SPLIT ticks (1 s) while the edge replays a run; the splits ride inside the
    signed checkpoint and end up in the run document, so ghost deltas on the HUD are verified numbers. */
export const SPLIT = TICK_RATE;
const enc = new TextEncoder();
const seedValid = (s) => typeof s === 'string' && /^[a-zA-Z0-9_-]{2,64}$/.test(s);
const idValid = (s) => typeof s === 'string' && /^[a-f0-9]{12}$/.test(s);
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const dayBefore = (date) => dayOf(Date.parse(`${date}T12:00:00Z`) - 86400000);
const heatKey = (date) => `heat/${SIM_VERSION}/${date}.json`;
const b64u = (bytes) => { let s = ''; const a = new Uint8Array(bytes); for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const fmtTime = (ms) => { const s = ms / 1000, m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const CALL_A = ['Neon', 'Turbo', 'Midnight', 'Sunset', 'Chrome', 'Velvet', 'Rapid', 'Shadow', 'Ghost', 'Blaze', 'Storm', 'Night'];
const CALL_B = ['Fox', 'Viper', 'Falcon', 'Shark', 'Comet', 'Tiger', 'Hawk', 'Wolf', 'Racer', 'Drifter', 'Rocket', 'Panther'];
export function callsign(id) { const h = hashSeed('cs-' + id); return `${CALL_A[h % CALL_A.length]} ${CALL_B[(h >>> 8) % CALL_B.length]} ${10 + ((h >>> 16) % 90)}`; }
/** Inputs may arrive at most 10 % faster than real time, plus 3 s of network jitter. */
export const PACE = 1.1, PACE_SLACK_TICKS = 3 * TICK_RATE;
const histBin = (points) => Math.floor(Math.sqrt(Math.max(0, points)) / 4);
const bad = (status, message, reason) => Object.assign(Error(message), { status, reason });

export function createApp({ env = {}, store, now = () => Date.now(), log = () => {}, loadIndex = null, aiFetch }) {
  const minPlayRatio = Number(env.MIN_PLAY_RATIO ?? 0.78);
  // Each request gets a small CPU budget on the edge, so long replays are split into signed chunks.
  const chunkTicks = Math.max(60, Number(env.REPLAY_CHUNK || 90));
  // Tickets must verify on every edge node, so the key comes from configuration (never per-isolate random).
  const secretSource = String(env.RUN_SECRET || env.S3_SECRET_KEY || 'escape60-unconfigured-dev-secret');
  let hmacKey;
  const key = () => (hmacKey ??= crypto.subtle.importKey('raw', enc.encode('escape60-run-ticket|' + secretSource), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']));
  const rates = new Map(), boards = new Map(), docs = new Map();

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
    if (text.length > 200000) throw bad(413, 'Request too large', 'size');
    try { return JSON.parse(text || '{}'); } catch { throw bad(400, 'Invalid JSON', 'json'); }
  }
  async function sign(payload) {
    const data = b64u(enc.encode(JSON.stringify(payload)));
    return `${data}.${b64u(await crypto.subtle.sign('HMAC', await key(), enc.encode(data)))}`;
  }
  async function mac(text) { return b64u(await crypto.subtle.sign('HMAC', await key(), enc.encode('ckpt|' + text))); }
  async function macOk(text, sig) { try { return await crypto.subtle.verify('HMAC', await key(), fromB64u(String(sig)), enc.encode('ckpt|' + text)); } catch { return false; } }
  async function verifyToken(token) {
    if (typeof token !== 'string' || token.length > 600) return null;
    const [data, sig] = token.split('.');
    if (!data || !sig) return null;
    let ok = false;
    try { ok = await crypto.subtle.verify('HMAC', await key(), fromB64u(sig), enc.encode(data)); } catch { return null; }
    if (!ok) return null;
    try { return JSON.parse(new TextDecoder().decode(fromB64u(data))); } catch { return null; }
  }
  async function readJson(k) { const got = await store.get(k); return got ? { value: JSON.parse(got.body), etag: got.etag } : null; }
  /** Optimistic read-modify-write with ETag checks, so concurrent edge nodes never lose writes. */
  async function update(k, fn, tries = 5) {
    for (let i = 0; i < tries; i++) {
      const cur = await readJson(k);
      const next = fn(cur?.value);
      if (next === undefined) return cur?.value;
      if (await store.put(k, JSON.stringify(next), cur ? { ifMatch: cur.etag } : { ifNoneMatch: '*' })) return next;
    }
    throw Error('storage contention');
  }
  const metrics = createMetrics({ now, update, readJson, log });
  const ai = createAI({ env, fetchImpl: aiFetch, metrics, log });
  const aiCap = Number(env.AI_DAILY_CAP || 4000);
  const briefs = new Map(), radios = new Map(), inflight = new Map();
  /** Run `fn` once per key per isolate at a time. */
  const once = (k, fn) => { if (!inflight.has(k)) inflight.set(k, fn().finally(() => inflight.delete(k))); return inflight.get(k); };
  /** The city briefing of a UTC day: read the frozen copy, or write it (model, else handwritten) — first writer wins. */
  async function directorFor(date, { generate = false } = {}) {
    const memo = briefs.get(date);
    if (memo) return memo;
    return once(`d|${date}`, async () => {
      const k = `director/v1/${date}.json`;
      let d = (await readJson(k).catch(() => null))?.value || null;
      if (!d && generate) {
        // the pursuit commander reads yesterday's per-district outcomes (counts only) and picks a focus
        const heat = heatSummary((await readJson(heatKey(dayBefore(date))).catch(() => null))?.value);
        let cand = null;
        if (ai.configured) { try { cand = await ai.director(date, heat); } catch (e) { log('director', e.message); } }
        cand ||= fallbackDirector(date, heat);
        cand.generatedAt = new Date(now()).toISOString();
        d = (await store.put(k, JSON.stringify(cand), { ifNoneMatch: '*' })) ? cand : (await readJson(k))?.value || cand;
        metrics.add(d.source === 'ai' ? 'briefsAi' : 'briefsFallback');
      }
      if (d) { briefs.set(date, d); if (briefs.size > 6) briefs.delete(briefs.keys().next().value); }
      return d;
    });
  }
  const dailyDate = (seed) => /^daily-(\d{4}-\d{2}-\d{2})$/.exec(seed)?.[1] || null;
  /** Rules for a route: daily routes play by that day's briefing (generated only for today). */
  async function rulesForSeed(seed) {
    const date = dailyDate(seed);
    if (!date) return null;
    return rulesOf(await directorFor(date, { generate: date === dayOf(now()) }));
  }
  async function radioFor(date, lang = 'fa') {
    const id = `${date}|${lang}`;
    if (radios.has(id)) return radios.get(id);
    return once(`r|${id}`, async () => {
      const k = `radio/v2/${date}/${lang}.json`;
      let r = (await readJson(k).catch(() => null))?.value || null;
      const d = await directorFor(date, { generate: date === dayOf(now()) });
      if (!r && d && date === dayOf(now())) {
        const bank = { en: FALLBACK_RADIO.en, fa: FALLBACK_RADIO.fa }, src = { en: 'fallback', fa: 'fallback' };
        if (ai.configured) { try { bank[lang] = { ...FALLBACK_RADIO[lang], ...(await ai.radio(d, lang)) }; src[lang] = 'ai'; } catch (e) { log('radio', lang, e.message); } }
        const cand = { date, id: d.id, source: src, radio: bank };
        r = (await store.put(k, JSON.stringify(cand), { ifNoneMatch: '*' })) ? cand : (await readJson(k))?.value || cand;
      }
      r ||= { date, source: { en: 'fallback', fa: 'fallback' }, radio: d?.radio || FALLBACK_RADIO };
      radios.set(id, r); if (radios.size > 12) radios.delete(radios.keys().next().value);
      return r;
    });
  }
  async function aiBudgetLeft() {
    const c = (await metrics.snapshot()).today.c;
    return (c.ai_dispatch || 0) + (c.ai_chief || 0) < aiCap;
  }
  async function bump(date, fn) {
    try { await update(`stats/v2/${date}.json`, (s = { date, runs: 0, escapes: 0, verifyMs: 0, bestPoints: 0, bestTimeMs: 0, live: 0 }) => { fn(s); return s; }); }
    catch (e) { log('stats', e.message); }
  }
  async function boardRows(seed) {
    let memo = boards.get(seed);
    if (!memo || now() - memo.at > 5000) {
      memo = { at: now(), rows: (await readJson(`leaderboard/${SIM_VERSION}/${seed}.json`))?.value || [] };
      boards.set(seed, memo); if (boards.size > 200) boards.delete(boards.keys().next().value);
    }
    return memo.rows;
  }
  /** A verified run by its public id (trace, result, rank at the time it was accepted). */
  async function runDoc(id) {
    if (!idValid(id)) return null;
    if (docs.has(id)) return docs.get(id);
    const doc = (await readJson(`runs-by-id/${SIM_VERSION}/${id}.json`))?.value || null;
    if (doc) { docs.set(id, doc); if (docs.size > 64) docs.delete(docs.keys().next().value); }
    return doc;
  }
  /** Where `points` would place on today's board right now (authoritative points only). */
  function standingOf(rows, points) {
    const above = rows.filter((e) => e.points > points);
    const rank = above.length + 1, top = rows.length >= 100 && rank > 100;
    const next = above[above.length - 1];
    return { rank: top ? null : rank, of: rows.length, ahead: next ? { rank: above.length, label: next.label, points: next.points, gap: next.points - points } : null };
  }

  /* ---------- run tickets and checkpoints ---------- */
  async function ticketOf(b) {
    const ticket = await verifyToken(b.token);
    if (!ticket || ticket.r !== b.runId) throw bad(401, 'Invalid run ticket', 'ticket');
    if (ticket.v !== SIM_VERSION) throw bad(409, 'Game was updated — please reload', 'version');
    if (now() - ticket.t > 20 * 60000) throw bad(410, 'Run expired', 'expired');
    if (!Array.isArray(b.trace)) throw bad(400, 'Missing trace', 'trace');
    let total;
    try { total = traceTicks(b.trace); } catch (e) { throw bad(422, `Invalid replay: ${e.message}`, 'trace'); }
    return { ticket, total };
  }
  const prefixHash = async (trace, ticks) => b64u(await crypto.subtle.digest('SHA-256', enc.encode(JSON.stringify(tracePrefix(trace, ticks)))));
  const ckText = (runId, hash, c) => `${runId}|${hash}|${c.t}|${c.ms}|${c.at}|${c.seen}|${c.n}|${c.state}|${c.sp.join(',')}`;
  async function checkpoint(runId, trace, game, ms, seen, n, sp) {
    const c = { t: game.ticks, ms: Math.round(ms * 10) / 10, at: now(), seen, n, state: snapshotGame(game), sp };
    c.sig = await mac(ckText(runId, await prefixHash(trace, c.t), c));
    return c;
  }
  /** Continue a run from its last signed checkpoint, or start it; enforces real-time pacing. */
  async function resume(ticket, b, total) {
    const c = b.checkpoint, t = now();
    if (c) {
      if (typeof c.state !== 'string' || c.state.length > 120000 || ![c.t, c.ms, c.at, c.seen, c.n].every(Number.isFinite) || c.t > total) throw bad(400, 'Invalid checkpoint', 'checkpoint');
      if (!Array.isArray(c.sp) || c.sp.length !== Math.floor(c.t / SPLIT) || !c.sp.every(Number.isInteger)) throw bad(400, 'Invalid checkpoint', 'checkpoint');
      if (!(await macOk(ckText(ticket.r, await prefixHash(b.trace, c.t), c), c.sig))) throw bad(401, 'Invalid checkpoint', 'checkpoint');
      let game;
      try { game = restoreGame(c.state); } catch { throw bad(400, 'Invalid checkpoint', 'checkpoint'); }
      if (game.seed !== ticket.s || game.car !== ticket.c || game.spawn !== ticket.p || game.ticks !== c.t || (game.rules?.id || 0) !== (ticket.d || 0)) throw bad(401, 'Invalid checkpoint', 'checkpoint');
      if (total - c.seen > ((t - c.at) / 1000) * TICK_RATE * PACE + PACE_SLACK_TICKS) throw bad(422, 'Inputs arrived faster than real time', 'pacing');
      return { game, ms: c.ms, n: c.n, sp: c.sp.slice() };
    }
    if (!ticket.l && (await store.get(runKey(ticket)))) throw bad(409, 'Run already submitted', 'replayed');
    if (total > ((t - ticket.t) / 1000) * TICK_RATE * PACE + PACE_SLACK_TICKS) throw bad(422, 'Inputs arrived faster than real time', 'pacing');
    const rules = ticket.d ? await rulesForSeed(ticket.s) : null;
    if ((rules?.id || 0) !== (ticket.d || 0)) throw bad(409, 'Daily briefing changed — please reload', 'version');
    return { game: createGame(ticket.s, { car: ticket.c, spawn: ticket.p, rules }), ms: 0, n: 0, sp: [] };
  }
  const runKey = (ticket) => `runs/${SIM_VERSION}/${dayOf(ticket.t)}/${ticket.r}.json`;
  /** advanceTrace / replayChunk in steps that stop on every split boundary, recording the points there. */
  function stepSplits(game, trace, budget, sp, final) {
    for (let left = budget; ;) {
      const before = game.ticks;
      const done = advanceTrace(game, trace, Math.min(left, SPLIT - (game.ticks % SPLIT)));
      const moved = game.ticks - before;
      left -= moved;
      if (moved > 0 && game.ticks % SPLIT === 0) sp.push(game.points);
      if (done) { if (final && game.state !== 'ended') throw Error('Game has not ended'); return true; }
      if (left <= 0) return false;
    }
  }
  function replayWith(final, game, trace, sp) {
    const t0 = performance.now(), before = game.ticks;
    let out;
    try { out = stepSplits(game, trace, chunkTicks, sp, final); } catch (e) { throw bad(422, `Invalid replay: ${e.message}`, 'replay'); }
    const cpu = performance.now() - t0;
    metrics.add('ticks', game.ticks - before); metrics.add('cpuMs', cpu);
    return { out, cpu, stepped: game.ticks - before };
  }

  /* ---------- routes ---------- */
  async function today() {
    const date = dayOf(now());
    const d = await directorFor(date, { generate: true });
    const { radio, ...brief } = d;
    return json({ seed: `daily-${date}`, version: SIM_VERSION, api: API_VERSION, expiresAt: `${date}T23:59:59Z`, live: { every: chunkTicks }, brief, rules: rulesOf(d) });
  }
  async function start(req, ip) {
    if (limited(ip, 'start', 40, 60000)) return fail(429, 'Please slow down');
    const b = await body(req);
    const t = now(), lab = b.lab === true, seed = lab ? 'edge-lab' : b.seed || `daily-${dayOf(t)}`;
    if (!seedValid(seed)) throw bad(400, 'Invalid seed', 'seed');
    const car = CARS.some((c) => c.id === b.car) ? b.car : CARS[0].id;
    const spawn = spawnIndex(seed, b.spawn);
    const rules = await rulesForSeed(seed);
    if ((b.rules || 0) !== (rules?.id || 0)) throw bad(409, 'Daily briefing changed — please reload', 'version');
    const runId = crypto.randomUUID();
    const token = await sign({ r: runId, s: seed, c: car, p: spawn, t, v: SIM_VERSION, ...(rules ? { d: rules.id } : {}), ...(lab ? { l: 1 } : {}) });
    metrics.add(lab ? 'labStarts' : 'starts');
    return json({ runId, token, seed, car, spawn, rules: rules?.id || null, issuedAt: t, version: SIM_VERSION, live: { every: chunkTicks } });
  }
  /** Live referee: replay the newest inputs while the run is still being driven. */
  async function live(req, ip) {
    if (limited(ip, 'live', 60, 60000)) return fail(429, 'Please slow down');
    const b = await body(req);
    const { ticket, total } = await ticketOf(b);
    const r = await resume(ticket, b, total);
    const { out: complete, cpu, stepped } = replayWith(false, r.game, b.trace, r.sp);
    const g = r.game;
    metrics.add('live'); metrics.add('liveTicks', stepped);
    const standing = ticket.l ? null : standingOf(await boardRows(ticket.s), g.points);
    return json({ ok: true, verified: g.ticks, complete, ended: g.state === 'ended', points: g.points, health: Math.round(g.health), standing, cpuMs: Math.round(cpu * 10) / 10,
      checkpoint: await checkpoint(ticket.r, b.trace, g, r.ms + cpu, total, r.n + 1, r.sp) });
  }
  async function finish(req, ip) {
    if (limited(ip, 'finish', 120, 60000)) return fail(429, 'Please slow down');
    const b = await body(req);
    const { ticket, total } = await ticketOf(b);
    if (!b.result || typeof b.result !== 'object') throw bad(400, 'Missing result', 'trace');
    const r = await resume(ticket, b, total), game = r.game;
    const { out: complete, cpu, stepped } = replayWith(true, game, b.trace, r.sp);
    metrics.add('chunks');
    const verifyMs = Math.round((r.ms + cpu) * 10) / 10;
    // Storage writes get a request of their own (no replay work), so neither part hits the CPU limit.
    if (!complete || (stepped > 0 && !env.SINGLE_PASS)) {
      return json({ continue: true, progress: complete ? 100 : Math.round((100 * game.ticks) / total), checkpoint: await checkpoint(ticket.r, b.trace, game, r.ms + cpu, total, r.n, r.sp) }, 202);
    }
    const result = gameResult(game), c = b.result;
    if (c.version !== SIM_VERSION || c.seed !== ticket.s || c.car !== ticket.c || c.spawn !== result.spawn || (c.rules || null) !== (result.rules || null) || c.timeMs !== result.timeMs || c.points !== result.points || c.health !== result.health || c.end !== result.end) throw bad(422, 'Result does not match authoritative replay', 'mismatch');
    if (now() - ticket.t < result.timeMs * minPlayRatio) throw bad(422, 'Run finished too quickly', 'pacing');
    if (ticket.l) { metrics.add('labRuns'); return json({ accepted: true, lab: true, stored: false, result, verifyMs, ticks: game.ticks, live: r.n, verification: 'edge-replay-v4' }); }
    const date = dayOf(ticket.t), at = now(), label = callsign(ticket.r), id = ticket.r.replace(/-/g, '').slice(0, 12);
    const record = { runId: ticket.r, id, seed: ticket.s, car: ticket.c, spawn: ticket.p, date, at, result, verifyMs, live: r.n, label };
    if (!(await store.put(runKey(ticket), JSON.stringify(record), { ifNoneMatch: '*' }))) throw bad(409, 'Run already submitted', 'replayed');
    const entry = { id, timeMs: result.timeMs, points: result.points, car: ticket.c, p: ticket.p, label, at, g: 1 };
    const rows = await update(`leaderboard/${SIM_VERSION}/${ticket.s}.json`, (list = []) => { const next = list.filter((e) => e.id !== entry.id); next.push(entry); next.sort((a, x) => compareResult(a, x) || a.at - x.at); return next.slice(0, 100); });
    boards.delete(ticket.s);
    const idx = rows.findIndex((e) => e.id === id), rank = idx >= 0 ? idx + 1 : null;
    const doc = { id, seed: ticket.s, car: ticket.c, spawn: ticket.p, rules: ticket.d || null, label, result, trace: b.trace, splits: r.sp, at, live: r.n, verifyMs, rank, of: rows.length, cdone: game.contracts.map((k) => k.done) };
    const hist = await update(`hist/${SIM_VERSION}/${ticket.s}.json`, (h = { n: 0, b: {} }) => { const k = histBin(result.points); h.n++; h.b[k] = (h.b[k] || 0) + 1; return h; }).catch(() => null);
    let better = null;
    if (hist && hist.n > 1) { const k = histBin(result.points); let below = 0; for (const [bin, cnt] of Object.entries(hist.b)) if (Number(bin) < k) below += cnt; better = Math.round((100 * (below + ((hist.b[k] || 1) - 1) / 2)) / (hist.n - 1)); }
    doc.better = better; doc.league = leagueOf(better, rank, hist?.n || 1);
    const z = Number.isInteger(result.zone) && result.zone >= 0 && result.zone < ZONES.length ? result.zone : 0;
    await Promise.all([
      store.put(`runs-by-id/${SIM_VERSION}/${id}.json`, JSON.stringify(doc)),
      bump(date, (s) => { s.runs++; if (result.escaped) s.escapes++; if (r.n) s.live = (s.live || 0) + 1; s.verifyMs += verifyMs; s.bestTimeMs = Math.max(s.bestTimeMs, result.timeMs); s.bestPoints = Math.max(s.bestPoints, result.points); }),
      // pursuit commander: per-district outcome counts of the day (no runs, ids or traces), read by tomorrow's briefing
      update(heatKey(date), (h = { date, n: 0, kinds: HEAT_KINDS, z: ZONES.map(() => HEAT_KINDS.map(() => 0)) }) => {
        const row = h.z[z]; if (result.end === 'busted') row[0]++; else if (result.end === 'wrecked') row[1]++; if (result.escaped) row[2]++; row[3] += result.takedowns || 0; h.n++; return h;
      }).catch((e) => log('heat', e.message)),
    ]);
    docs.set(id, doc);
    metrics.add('runs'); if (r.n) metrics.add('liveRuns');
    metrics.recent({ label, car: ticket.c, points: result.points, timeMs: result.timeMs, end: result.end, live: r.n, verifyMs, ticks: game.ticks, rank, at });
    return json({ accepted: true, rank, of: rows.length, label, result, verification: 'edge-replay-v4', verifyMs, ticks: game.ticks, live: r.n, better, league: doc.league, runs: hist?.n || null, id, share: `/r/${id}`, splits: r.sp.length });
  }
  async function leaderboard(url) {
    const seed = url.searchParams.get('seed') || `daily-${dayOf(now())}`;
    if (!seedValid(seed)) throw bad(400, 'Invalid seed', 'seed');
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 10));
    const rows = await boardRows(seed);
    return json({ seed, total: rows.length, entries: rows.slice(0, limit).map((e, i) => ({ rank: i + 1, timeMs: e.timeMs, points: e.points, car: e.car, label: e.label, ghost: !!e.g })), verified: true }, 200, { 'Cache-Control': 'public, max-age=5' });
  }
  /** A ghost for the browser: verified inputs (re-simulated bit-exactly), verified 1 s splits and the
      driver's persona and taunt bank (written by the crew chief, else handwritten from the run's numbers). */
  const rivalOf = (doc, extra = {}) => {
    const ch = doc.chief || fallbackChief(doc.result);
    return { id: doc.id, rank: doc.rank, of: doc.of, label: doc.label, car: doc.car, spawn: doc.spawn, points: doc.result.points, timeMs: doc.result.timeMs, end: doc.result.end, trace: doc.trace, splits: doc.splits || null, league: doc.league || null,
      taunt: ch.taunt || null, persona: ch.persona || null, taunts: ch.taunts || null, ...extra };
  };
  /** The edge picks your rival: the verified run just above your best (or a mid-table run).
      With `spawn`, only runs that started at that position qualify (the ghost must start with you). */
  async function rival(url) {
    const seed = url.searchParams.get('seed') || `daily-${dayOf(now())}`;
    if (!seedValid(seed)) throw bad(400, 'Invalid seed', 'seed');
    const mine = url.searchParams.has('points') ? Number(url.searchParams.get('points')) : null, not = url.searchParams.get('not');
    const all = await boardRows(seed);
    const want = url.searchParams.get('id'); // a friend's shared run (from /r/<id>) races you as the ghost
    if (idValid(want)) {
      const doc = await runDoc(want);
      if (doc && doc.seed === seed) { metrics.add('rivals'); return json({ rival: rivalOf(doc, { friend: true }) }, 200, { 'Cache-Control': 'public, max-age=300' }); }
    }
    const at = url.searchParams.has('spawn') ? Number(url.searchParams.get('spawn')) : null;
    const rows = all.filter((e) => e.g && e.id !== not && (at === null || e.p === at));
    if (!rows.length) { // nobody else yet: race your own best run
      const own = idValid(not) ? await runDoc(not) : null;
      if (own && own.seed === seed && (at === null || own.spawn === at)) { metrics.add('rivals'); return json({ rival: rivalOf(own, { self: true }) }); }
      return json({ rival: null }, 200, { 'Cache-Control': 'public, max-age=10' });
    }
    let pick;
    if (Number.isFinite(mine)) { const above = rows.filter((e) => e.points > mine); pick = above.length ? above[above.length - 1] : rows[0]; }
    else pick = rows[Math.min(rows.length - 1, Math.floor(rows.length / 2))];
    const doc = await runDoc(pick.id);
    if (!doc) return json({ rival: null });
    metrics.add('rivals');
    return json({ rival: rivalOf(doc, { rank: all.indexOf(pick) + 1, of: all.length }) }, 200, { 'Cache-Control': 'public, max-age=20' });
  }
  /** Up to four ghosts in one call — your best (pb), the run just above your best (rival), today's #1 (top)
      and a friend's shared run — all from cached board/run reads (no replay work). The race starts at
      `spawn` (or at the friend's / rival's start); ghosts from another start come back without inputs, as
      split-only ghosts (HUD delta, no car on the road). */
  async function ghosts(url) {
    const q = url.searchParams, seed = q.get('seed') || `daily-${dayOf(now())}`;
    if (!seedValid(seed)) throw bad(400, 'Invalid seed', 'seed');
    const mine = q.has('points') ? Number(q.get('points')) : null, not = q.get('not'), want = q.get('id');
    const at = q.has('spawn') && /^\d{1,3}$/.test(q.get('spawn')) ? Number(q.get('spawn')) : null;
    const all = await boardRows(seed), used = new Set();
    const take = (doc) => (doc && doc.seed === seed && !used.has(doc.id) ? (used.add(doc.id), doc) : null);
    const friend = idValid(want) ? take(await runDoc(want)) : null;
    const pb = idValid(not) ? take(await runDoc(not)) : null;
    const pool = all.filter((e) => e.g && !used.has(e.id));
    const pick = (rows) => {
      if (!rows.length) return null;
      if (Number.isFinite(mine)) { const above = rows.filter((e) => e.points > mine); return above.length ? above[above.length - 1] : rows[0]; }
      return rows[Math.min(rows.length - 1, Math.floor(rows.length / 2))];
    };
    const prefer = at ?? friend?.spawn ?? null;
    const rv = (prefer !== null && pick(pool.filter((e) => e.p === prefer))) || pick(pool);
    const rival = rv ? take(await runDoc(rv.id)) : null;
    const top = all[0]?.g && !used.has(all[0].id) ? take(await runDoc(all[0].id)) : null;
    const spawn = at ?? friend?.spawn ?? rival?.spawn ?? pb?.spawn ?? top?.spawn ?? null;
    const out = {};
    for (const [role, doc] of Object.entries({ pb, rival, top, friend })) {
      if (!doc) { out[role] = null; continue; }
      const i = all.findIndex((e) => e.id === doc.id);
      out[role] = rivalOf(doc, { role, rank: i >= 0 ? i + 1 : doc.rank, of: all.length || doc.of, trace: doc.spawn === spawn ? doc.trace : null });
    }
    metrics.add('ghosts');
    return json({ seed, spawn, ghosts: out }, 200, { 'Cache-Control': 'public, max-age=10' });
  }
  async function card(id) {
    const doc = await runDoc(id);
    if (!doc) return fail(404, 'Unknown run');
    const car = carById(doc.car), t0 = performance.now();
    const png = drawCard({ label: doc.label, carName: car.name, carPaint: car.paint, result: doc.result, rank: doc.rank, of: doc.of, league: doc.league || null });
    metrics.add('cards'); metrics.add('cardMs', performance.now() - t0);
    return new Response(png, { headers: { 'Content-Type': 'image/png', 'Content-Length': String(png.length), 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' } });
  }
  /** /r/<id>: the game page with Open Graph tags for a verified run and its route as the target. */
  async function preview(id, url) {
    const doc = await runDoc(id);
    if (!doc || !loadIndex) return new Response(null, { status: 302, headers: { Location: '/' } });
    const r = doc.result, img = `${url.origin}/api/v1/card/${id}.png`;
    const title = doc.chief?.headline?.en ? `${doc.chief.headline.en} — ESCAPE 60` : `${doc.label} scored ${fmt(r.points)} in ESCAPE 60`;
    const desc = `${doc.label}: ${fmt(r.points)} pts · survived ${fmtTime(r.timeMs)} · ${r.takedowns} takedowns${doc.rank ? ` · #${doc.rank} today` : ''}. Verified run — can you beat it?`;
    const head = `<base href="/">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="628">
<meta property="og:url" content="${esc(`${url.origin}/r/${id}`)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(img)}">
<script>history.replaceState(null,"","/?seed=${doc.seed}&c=${r.timeMs}.${r.points}${Number.isInteger(doc.spawn) ? `&sp=${doc.spawn}` : ''}&r=${id}")</script>`;
    let html = await loadIndex();
    html = html.replace(/<meta (property="og:[^"]*"|name="twitter:[^"]*")[^>]*>\s*/g, '').replace(/<head>/i, `<head>\n${head}`);
    metrics.add('previews');
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60', 'X-Content-Type-Options': 'nosniff' } });
  }
  async function radioRoute(url) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date') || '') ? url.searchParams.get('date') : dayOf(now());
    const r = await radioFor(date, url.searchParams.get('lang') === 'en' ? 'en' : 'fa');
    return json({ date, source: r.source, radio: r.radio }, 200, { 'Cache-Control': 'public, max-age=120' });
  }
  /** The dispatcher's call for one run, in the player's language (fallback: a line from the day's radio bank). */
  async function dispatch(req, ip) {
    if (limited(ip, 'dispatch', 12, 60000)) return fail(429, 'Please slow down');
    const b = await body(req), date = dailyDate(b.seed) || dayOf(now());
    const lang = b.lang === 'en' ? 'en' : 'fa', zone = Number.isInteger(b.zone) && b.zone >= 0 && b.zone < 10 ? b.zone : 0;
    const car = CARS.some((c) => c.id === b.car) ? b.car : CARS[0].id;
    const last = b.last && Number.isFinite(b.last.points) && Number.isFinite(b.last.timeMs) ? { points: Math.round(b.last.points), timeMs: Math.round(b.last.timeMs), end: ['wrecked', 'busted', 'legend'].includes(b.last.end) ? b.last.end : 'wrecked' } : null;
    const d = (await directorFor(date, { generate: date === dayOf(now()) })) || fallbackDirector(date);
    if (ai.configured && (await aiBudgetLeft())) {
      try { return json({ who: d.dispatcher[lang], line: await ai.dispatch({ d, car, zone, lang, last }), source: 'ai' }); } catch { /* fall through */ }
    }
    return json({ who: d.dispatcher[lang], line: null, source: 'fallback' });
  }
  /** Crew chief for a verified run: generated once, then cached in the run document. */
  async function debrief(req, ip) {
    if (limited(ip, 'debrief', 10, 60000)) return fail(429, 'Please slow down');
    const b = await body(req), doc = await runDoc(b.id);
    if (!doc) return fail(404, 'Unknown run');
    if (!doc.chief) {
      const date = dailyDate(doc.seed), d = date ? await directorFor(date) : null;
      let chief = null;
      if (ai.configured && (await aiBudgetLeft())) { try { chief = await ai.chief({ result: doc.result, car: doc.car, rank: doc.rank, of: doc.of, better: doc.better, d, zone: doc.result.zone, cdone: doc.cdone }); } catch { /* rules below */ } }
      doc.chief = chief || fallbackChief(doc.result);
      if (doc.chief.source === 'ai') await store.put(`runs-by-id/${SIM_VERSION}/${doc.id}.json`, JSON.stringify(doc)).catch(() => {});
      docs.set(doc.id, doc);
    }
    return json({ id: doc.id, chief: doc.chief });
  }
  async function statsRoute() {
    const date = dayOf(now());
    const s = (await readJson(`stats/v2/${date}.json`))?.value || { date, runs: 0, escapes: 0, verifyMs: 0, bestPoints: 0, bestTimeMs: 0, live: 0 };
    return json({ ...s, avgVerifyMs: s.runs ? Math.round((s.verifyMs / s.runs) * 10) / 10 : null }, 200, { 'Cache-Control': 'public, max-age=10' });
  }
  async function edgeRoute() {
    const snap = await metrics.snapshot();
    const d = briefs.get(dayOf(now())) || null;
    const ai2 = { configured: ai.configured, model: ai.model, brief: d && { id: d.id, source: d.source, theme: d.theme, genMs: d.genMs ?? null, contracts: d.contracts.map((c) => ({ type: c.type, goal: c.goal, zone: c.zone, reward: c.reward })), tactics: d.tactics } };
    return json({ api: API_VERSION, version: SIM_VERSION, features: FEATURES, storage: store.kind, secured: !!(env.RUN_SECRET || env.S3_SECRET_KEY), chunk: chunkTicks, pace: PACE, ai: ai2, ...snap, time: new Date(now()).toISOString() });
  }
  /** Measures this edge node: steps the real simulation for up to 600 ticks. */
  function bench(url) {
    const n = Math.min(600, Math.max(60, Number(url.searchParams.get('ticks')) || 300));
    const g = createGame('edge-bench', { car: 'kaze' }), t0 = performance.now();
    let i = 0;
    for (; i < n && g.state === 'playing'; i++) { stepGame(g, encodeInput(((i >> 5) % 7) - 3, false, i % 240 > 225, i % 400 < 50)); if (g.events.length > 64) g.events.length = 0; }
    const ms = performance.now() - t0;
    metrics.add('bench'); metrics.add('ticks', i); metrics.add('cpuMs', ms);
    return json({ ticks: i, ms: Math.round(ms * 100) / 100, usPerTick: Math.round((ms * 1000) / Math.max(1, i)), isolate: metrics.isolate });
  }

  async function route(req, url, ip) {
    const path = url.pathname, method = req.method;
    if (path.startsWith('/r/') && method === 'GET') return preview(path.slice(3), url);
    if (!path.startsWith('/api/')) return null;
    metrics.add('api');
    if (path === '/api/v1/health' && method === 'GET') return json({ status: 'ok', api: API_VERSION, version: SIM_VERSION, storage: store.kind, secured: !!(env.RUN_SECRET || env.S3_SECRET_KEY), ai: { configured: ai.configured, model: ai.model }, maxTicks: MAX_TICKS, features: FEATURES, time: new Date(now()).toISOString() });
    if (path === '/api/v1/challenges/today' && method === 'GET') return today();
    if (path === '/api/v1/runs/start' && method === 'POST') return start(req, ip);
    if (path === '/api/v1/runs/live' && method === 'POST') return live(req, ip);
    if (path === '/api/v1/runs/finish' && method === 'POST') return finish(req, ip);
    if (path === '/api/v1/leaderboard' && method === 'GET') return leaderboard(url);
    if (path === '/api/v1/rival' && method === 'GET') return rival(url);
    if (path === '/api/v1/ghosts' && method === 'GET') return ghosts(url);
    if (path === '/api/v1/stats' && method === 'GET') return statsRoute();
    if (path === '/api/v1/radio' && method === 'GET') return radioRoute(url);
    if (path === '/api/v1/dispatch' && method === 'POST') return dispatch(req, ip);
    if (path === '/api/v1/runs/debrief' && method === 'POST') return debrief(req, ip);
    if (path === '/api/v1/edge' && method === 'GET') return edgeRoute();
    if (path === '/api/v1/edge/bench' && method === 'GET') return limited(ip, 'bench', 10, 60000) ? fail(429, 'Please slow down') : bench(url);
    const m = /^\/api\/v1\/card\/([a-f0-9]{12})\.png$/.exec(path);
    if (m && method === 'GET') return limited(ip, 'card', 60, 60000) ? fail(429, 'Please slow down') : card(m[1]);
    return fail(404, 'Unknown API route');
  }
  /** Returns a Response for API and /r/ routes, or null (static files). `ctx.waitUntil` is optional. */
  async function handle(req, ctx = {}) {
    const url = new URL(req.url);
    const ip = req.headers.get('ar-real-ip') || req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'local';
    let res;
    try { res = await route(req, url, ip); }
    catch (e) {
      if (e.status) { metrics.reject(e.reason || 'other'); res = fail(e.status, e.message); }
      else { log('api error', url.pathname, e.message); res = fail(503, 'Service temporarily unavailable'); }
    }
    if (res) { metrics.hit(); await afterResponse(ctx); }
    return res;
  }
  /** Flush telemetry off the hot path when the runtime supports waitUntil, inline otherwise. */
  async function afterResponse(ctx) {
    if (!metrics.due()) return;
    const p = metrics.flush();
    if (typeof ctx.waitUntil === 'function') { try { ctx.waitUntil(p); return; } catch { /* runtime without waitUntil */ } }
    await p;
  }
  return { handle, metrics, afterResponse };
}
