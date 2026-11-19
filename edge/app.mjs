/* Escape 60 game service — runs on Arvan Edge Computing (and, unchanged, inside the local Node dev
   server). Everything that decides a rank happens here, at the edge:
   - daily challenge + AI Special Event (Arvan AIaaS, validated and frozen per day),
   - stateless HMAC run tickets,
   - authoritative 60 Hz replay of the input trace with the same simulation the browser runs,
   - single-use runs, a durable leaderboard and live stats in Arvan Object Storage,
   - an AI pursuit report for verified runs, with a strict daily budget.
   Nothing here trusts a score or a time sent by the browser. */
import { createGame, gameResult, replayChunk, restoreGame, snapshotGame, traceTicks, compareResult, hashSeed, SIM_VERSION, MAX_TICKS } from '../web/src/simulation.js';
import { fallbackMission, sanitizeMission, missionPrompt, parseModelJson, judgeMission } from '../web/src/mission.js';

export const API_VERSION = '2.0.0';
const enc = new TextEncoder();
const seedValid = (s) => typeof s === 'string' && /^[a-zA-Z0-9_-]{2,64}$/.test(s);
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const CALL_A = ['عقاب', 'یوزپلنگ', 'دلفین', 'روباه', 'شاهین', 'گرگ', 'پلنگ', 'طوفان', 'موج', 'شهاب', 'ببر', 'کوسه'];
const CALL_B = ['نارنجی', 'نئونی', 'طلایی', 'فیروزه‌ای', 'بنفش', 'صورتی', 'آتشین', 'ساحلی', 'شبانه', 'برقی'];
const faNum = (n) => Number(n).toLocaleString('fa-IR');
export function callsign(id) { const h = hashSeed('cs-' + id); return `${CALL_A[h % CALL_A.length]} ${CALL_B[(h >>> 8) % CALL_B.length]} ${faNum(10 + (h >>> 16) % 90)}`; }

export function createApp({ env = {}, store, fetchImpl = (...a) => fetch(...a), now = () => Date.now(), log = () => {} }) {
  const ai = env.AI_API_KEY ? { key: String(env.AI_API_KEY).trim().replace(/^apikey\s+/i, ''), base: String(env.AI_BASE || 'https://api.arvancloudai.ir/v1').replace(/\/$/, ''), model: String(env.AI_MODEL || 'DeepSeek-V4-Flash') } : null;
  const reportCap = Number(env.AI_DAILY_REPORT_CAP || 1500);
  const minPlayRatio = Number(env.MIN_PLAY_RATIO ?? 0.78);
  // Arvan Edge gives each request a small CPU budget, so long runs are replayed in signed chunks.
  const chunkTicks = Math.max(60, Number(env.REPLAY_CHUNK || 720));
  // Tickets must verify on every edge node, so the key comes from configuration (never per-isolate random).
  const secretSource = String(env.RUN_SECRET || env.S3_SECRET_KEY || 'escape60-unconfigured-dev-secret');
  let hmacKey;
  const key = () => (hmacKey ??= crypto.subtle.importKey('raw', enc.encode('escape60-run-ticket|' + secretSource), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']));
  const rates = new Map(), missions = new Map(), boards = new Map();
  const inflight = new Map();

  /* ---------- helpers ---------- */
  const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Escape60-Edge': '1', ...extra } });
  const fail = (status, error) => json({ error }, status);
  function limited(ip, cat, limit, windowMs) {
    const k = `${ip}|${cat}`, t = now(), hits = (rates.get(k) || []).filter((x) => t - x < windowMs);
    if (hits.length >= limit) return true;
    hits.push(t); rates.set(k, hits); if (rates.size > 5000) rates.clear();
    return false;
  }
  async function body(req) {
    const text = await req.text();
    if (text.length > 90000) throw Object.assign(Error('Request too large'), { status: 413 });
    try { return JSON.parse(text || '{}'); } catch { throw Object.assign(Error('Invalid JSON'), { status: 400 }); }
  }
  async function sign(payload) {
    const data = b64u(enc.encode(JSON.stringify(payload)));
    return `${data}.${b64u(await crypto.subtle.sign('HMAC', await key(), enc.encode(data)))}`;
  }
  async function mac(text) { return b64u(await crypto.subtle.sign('HMAC', await key(), enc.encode('ckpt|' + text))); }
  async function macOk(text, sig) {
    try { return await crypto.subtle.verify('HMAC', await key(), fromB64u(String(sig)), enc.encode('ckpt|' + text)); } catch { return false; }
  }
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
  /** Optimistic read-modify-write; uses If-Match / If-None-Match so concurrent edges never lose writes. */
  async function update(k, fn, tries = 5) {
    for (let i = 0; i < tries; i++) {
      const cur = await readJson(k);
      const next = fn(cur?.value);
      if (next === undefined) return cur?.value;
      if (await store.put(k, JSON.stringify(next), cur ? { ifMatch: cur.etag } : { ifNoneMatch: '*' })) return next;
    }
    throw Error('storage contention');
  }
  async function chat(messages, maxTokens, temperature = 0.8, extra = {}) {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 20000);
    try {
      const res = await fetchImpl(`${ai.base}/chat/completions`, { method: 'POST', signal: ctl.signal, headers: { Authorization: `apikey ${ai.key}`, 'Content-Type': 'application/json' }, // DeepSeek-V4-Flash on Arvan thinks by default (hidden reasoning tokens, slow); short game text needs none.
        body: JSON.stringify({ model: ai.model, messages, max_tokens: maxTokens, temperature, thinking: { type: 'disabled' }, ...extra }) });
      if (!res.ok) throw Error(`AI ${res.status}`);
      const data = await res.json();
      return { text: data?.choices?.[0]?.message?.content || '', usage: data?.usage || null };
    } finally { clearTimeout(timer); }
  }

  /* ---------- AI Special Event (one per UTC day, identical for everyone) ---------- */
  async function mission(date) {
    const seed = `daily-${date}`;
    const memo = missions.get(date);
    if (memo && (memo.mission.source === 'ai' || now() - memo.at < 120000)) return memo.mission;
    if (inflight.has(date)) return inflight.get(date);
    const p = (async () => {
      const k = `missions/v1/${date}.json`;
      let m = null;
      try { m = (await readJson(k))?.value; } catch (e) { log('mission read', e.message); }
      if (!m && ai && date === dayOf(now())) {
        try {
          const t = now();
          const reply = await chat(missionPrompt(date), 1100, 0.9);
          const candidate = sanitizeMission(parseModelJson(reply.text), { date, seed, source: 'ai', model: ai.model });
          candidate.generatedAt = new Date(t).toISOString();
          candidate.genMs = now() - t;
          // First edge to finish wins; every other node adopts the stored copy.
          m = (await store.put(k, JSON.stringify(candidate), { ifNoneMatch: '*' })) ? candidate : (await readJson(k))?.value || candidate;
          await bump(date, (s) => { s.aiCalls = (s.aiCalls || 0) + 1; });
        } catch (e) { log('mission ai', e.message); }
      }
      m ||= fallbackMission(date, seed);
      missions.set(date, { mission: m, at: now() });
      if (missions.size > 8) missions.delete(missions.keys().next().value);
      return m;
    })().finally(() => inflight.delete(date));
    inflight.set(date, p);
    return p;
  }
  const missionFor = async (date, source) => (source === 'ai' ? mission(date) : fallbackMission(date, `daily-${date}`));

  /* ---------- stats ---------- */
  async function bump(date, fn) {
    try { await update(`stats/v1/${date}.json`, (s = { date, runs: 0, wins: 0, missions: 0, verifyMs: 0, aiCalls: 0, aiReports: 0, bestTimeMs: 0, bestPoints: 0 }) => { fn(s); return s; }); }
    catch (e) { log('stats', e.message); }
  }

  /* ---------- routes ---------- */
  async function today() {
    const date = dayOf(now()), m = await mission(date);
    return json({ seed: `daily-${date}`, challengeId: `daily-${date}`, version: SIM_VERSION, api: API_VERSION, edge: true, expiresAt: `${date}T23:59:59Z`, mission: m });
  }
  async function start(req, ip) {
    if (limited(ip, 'start', 40, 60000)) return fail(429, 'Please slow down');
    const b = await body(req);
    const t = now(), date = dayOf(t), seed = b.seed || `daily-${date}`;
    if (!seedValid(seed)) return fail(400, 'Invalid seed');
    const daily = seed === `daily-${date}`;
    const m = daily ? await mission(date) : null;
    const runId = crypto.randomUUID();
    const token = await sign({ r: runId, s: seed, t, v: SIM_VERSION, ms: m ? m.source : '' });
    return json({ runId, token, seed, issuedAt: t, version: SIM_VERSION, missionId: m?.id || null });
  }
  async function finish(req, ip) {
    if (limited(ip, 'finish', 80, 60000)) return fail(429, 'Please slow down');
    const b = await body(req);
    const ticket = await verify(b.token);
    if (!ticket || ticket.r !== b.runId) return fail(401, 'Invalid run ticket');
    if (ticket.v !== SIM_VERSION) return fail(409, 'Game was updated — please reload');
    const age = now() - ticket.t;
    if (age > 15 * 60000) return fail(410, 'Run expired');
    if (!Array.isArray(b.trace) || !b.result || typeof b.result !== 'object') return fail(400, 'Missing trace or result');
    const date = dayOf(ticket.t), runKey = `runs/${SIM_VERSION}/${date}/${ticket.r}.json`;
    let total;
    try { total = traceTicks(b.trace); } catch (e) { return fail(422, `Invalid replay: ${e.message}`); }
    // The checkpoint signature binds run id, the exact trace and the exact simulation state.
    const traceHash = b64u(await crypto.subtle.digest('SHA-256', enc.encode(JSON.stringify(b.trace))));
    let game, priorMs = 0;
    const c = b.checkpoint;
    if (c) {
      if (typeof c.state !== 'string' || c.state.length > 60000 || !Number.isFinite(c.ms)) return fail(400, 'Invalid checkpoint');
      if (!(await macOk(`${ticket.r}|${traceHash}|${c.ms}|${c.state}`, c.sig))) return fail(401, 'Invalid checkpoint');
      try { game = restoreGame(c.state); } catch { return fail(400, 'Invalid checkpoint'); }
      if (game.seed !== ticket.s) return fail(401, 'Invalid checkpoint');
      priorMs = c.ms;
    } else {
      if (await store.get(runKey)) return fail(409, 'Run already submitted');
      game = createGame(ticket.s);
    }
    // Authoritative replay: the browser's numbers are only compared, never trusted.
    const t0 = performance.now(), before = game.ticks;
    let complete;
    try { complete = replayChunk(game, b.trace, chunkTicks); } catch (e) { return fail(422, `Invalid replay: ${e.message}`); }
    const verifyMs = Math.round((priorMs + performance.now() - t0) * 10) / 10;
    // Storage writes get a request of their own (no replay work), so neither part hits the edge limit.
    if (!complete || (game.ticks > before && !env.SINGLE_PASS)) {
      const state = snapshotGame(game);
      return json({ continue: true, progress: complete ? 100 : Math.round((100 * game.ticks) / total), checkpoint: { state, ms: verifyMs, sig: await mac(`${ticket.r}|${traceHash}|${verifyMs}|${state}`) } }, 202);
    }
    const result = gameResult(game);
    const r = b.result;
    if (r.version !== SIM_VERSION || r.seed !== ticket.s || r.timeMs !== result.timeMs || r.points !== result.points || r.health !== result.health || r.win !== result.win) return fail(422, 'Result does not match authoritative replay');
    if (age < result.timeMs * minPlayRatio) return fail(422, 'Run finished too quickly');
    const isDaily = ticket.s === `daily-${date}`;
    const m = isDaily ? await missionFor(date, ticket.ms) : null;
    const judged = m ? judgeMission(m, result) : null;
    const record = { runId: ticket.r, seed: ticket.s, date, at: now(), result, verifyMs, missionId: m?.id || null, missionComplete: !!judged?.complete, missionDone: judged?.done ?? 0, label: callsign(ticket.r) };
    if (!(await store.put(runKey, JSON.stringify(record), { ifNoneMatch: '*' }))) return fail(409, 'Run already submitted');
    const entry = { id: ticket.r.slice(0, 8), timeMs: result.timeMs, points: result.points, label: record.label, mission: record.missionComplete, at: record.at };
    const lbKey = `leaderboard/${SIM_VERSION}/${ticket.s}.json`;
    const [rows] = await Promise.all([
      update(lbKey, (list = []) => { const next = list.filter((e) => e.id !== entry.id); next.push(entry); next.sort((a, c) => compareResult(a, c) || a.at - c.at); return next.slice(0, 100); }),
      bump(date, (s) => { s.runs++; if (result.win) s.wins++; if (record.missionComplete) s.missions++; s.verifyMs += verifyMs; s.bestTimeMs = Math.max(s.bestTimeMs, result.timeMs); s.bestPoints = Math.max(s.bestPoints, result.points); }),
    ]);
    boards.delete(ticket.s);
    const idx = rows.findIndex((e) => e.id === entry.id);
    return json({ accepted: true, rank: idx >= 0 ? idx + 1 : null, of: rows.length, label: record.label, result, mission: judged, verification: 'edge-deterministic-replay-v2', verifyMs, ticks: Math.round(result.timeMs * 60 / 1000), edge: true });
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
    return json({ seed, total: memo.rows.length, entries: memo.rows.slice(0, limit).map((e, i) => ({ rank: i + 1, timeMs: e.timeMs, points: e.points, label: e.label, mission: !!e.mission })), verified: true }, 200, { 'Cache-Control': 'public, max-age=5' });
  }
  async function report(req, ip) {
    if (limited(ip, 'report', 6, 60000)) return fail(429, 'Please slow down');
    const b = await body(req);
    const ticket = await verify(b.token);
    if (!ticket || ticket.r !== b.runId) return fail(401, 'Invalid run ticket');
    const runKey = `runs/${SIM_VERSION}/${dayOf(ticket.t)}/${ticket.r}.json`;
    const rec = await readJson(runKey);
    if (!rec) return fail(404, 'Only verified runs get a report');
    if (rec.value.report) return json({ report: rec.value.report, source: rec.value.reportSource });
    let text = '', source = 'fallback';
    const date = dayOf(now());
    const stats = (await readJson(`stats/v1/${date}.json`))?.value;
    if (ai && (stats?.aiReports || 0) < reportCap) {
      try {
        const r = rec.value.result;
        const reply = await chat([
          { role: 'system', content: 'You are a friendly, upbeat driving coach in "Escape 60", a cartoon 60-second car chase arcade game. Reply in Persian (Farsi) only, 2 or 3 short sentences, at most 260 characters total, no markdown, no emojis, no violence or politics. Praise one strength, name one concrete weakness from the stats and give one actionable tip for the next run.' },
          { role: 'user', content: JSON.stringify({ survivedSeconds: Math.round(r.timeMs / 100) / 10, escaped: r.win, points: r.points, healthLeft: r.health, carHits: r.hits, wallScrapes: r.scrapes, nearMisses: r.closeCalls, bestCombo: r.bestChain, roadblockDodges: r.dodges, dailyMissionComplete: rec.value.missionComplete }) },
        ], 220, 0.7);
        text = reply.text.replace(/[<>`*#]/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);
        if (text.length > 20) { source = 'ai'; await bump(date, (s) => { s.aiReports = (s.aiReports || 0) + 1; }); }
      } catch (e) { log('report ai', e.message); }
    }
    if (source !== 'ai') text = fallbackReport(rec.value.result);
    rec.value.report = text; rec.value.reportSource = source;
    try { await store.put(runKey, JSON.stringify(rec.value), { ifMatch: rec.etag }); } catch {}
    return json({ report: text, source });
  }
  async function statsRoute() {
    const date = dayOf(now());
    const s = (await readJson(`stats/v1/${date}.json`))?.value || { date, runs: 0, wins: 0, missions: 0, verifyMs: 0, aiCalls: 0, aiReports: 0, bestTimeMs: 0, bestPoints: 0 };
    const m = await mission(date);
    return json({ ...s, avgVerifyMs: s.runs ? Math.round((s.verifyMs / s.runs) * 10) / 10 : null, mission: { id: m.id, title: m.title, source: m.source, model: m.model, genMs: m.genMs ?? null } }, 200, { 'Cache-Control': 'public, max-age=10' });
  }

  async function handle(req) {
    const url = new URL(req.url), path = url.pathname;
    if (!path.startsWith('/api/')) return null;
    const ip = req.headers.get('ar-real-ip') || req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'local';
    const method = req.method;
    try {
      if (path === '/api/v1/health' && method === 'GET') return json({ status: 'ok', edge: true, runtime: env.EC_ID ? 'arvan-edge' : 'node-dev', api: API_VERSION, version: SIM_VERSION, storage: store.kind, secured: !!(env.RUN_SECRET || env.S3_SECRET_KEY), ai: ai ? { gateway: 'arvan-aiaas', model: ai.model } : null, maxTicks: MAX_TICKS, time: new Date(now()).toISOString() });
      if (path === '/api/v1/challenges/today' && method === 'GET') return today();
      if (path === '/api/v1/mission' && method === 'GET') return json(await mission(dayOf(now())), 200, { 'Cache-Control': 'public, max-age=60' });
      if (path === '/api/v1/runs/start' && method === 'POST') return start(req, ip);
      if (path === '/api/v1/runs/finish' && method === 'POST') return finish(req, ip);
      if (path === '/api/v1/runs/report' && method === 'POST') return report(req, ip);
      if (path === '/api/v1/leaderboard' && method === 'GET') return leaderboard(url);
      if (path === '/api/v1/stats' && method === 'GET') return statsRoute();
      return fail(404, 'Unknown API route');
    } catch (e) {
      log('api error', path, e.message);
      return fail(e.status || 503, e.status ? e.message : 'Service temporarily unavailable');
    }
  }
  return { handle, mission };
}

export function fallbackReport(r) {
  const parts = [];
  if (r.win) parts.push(`فرار کامل با ${faNum(r.health)}٪ سلامت؛ خونسردی‌ات عالی بود.`);
  else parts.push(`${faNum(Math.round(r.timeMs / 1000))} ثانیه دوام آوردی؛ شروع خوبی بود.`);
  if (r.hits >= 3) parts.push(`${faNum(r.hits)} برخورد داشتی؛ زودتر از تقاطع‌ها فرمان بده و وسط خیابان بمان.`);
  else if (r.scrapes >= 3) parts.push('زیاد به دیوار مالیدی؛ در پیچ‌ها کوتاه‌تر فرمان بده.');
  else if (r.closeCalls < 4) parts.push('جاخالی‌های نزدیک کم بود؛ از کنار ماشین‌ها رد شو تا امتیاز و ضریب بگیری.');
  else parts.push(`با ${faNum(r.closeCalls)} جاخالی، زنجیره‌ات را با دریفت زنده نگه دار تا ضریب ×۵ برسی.`);
  return parts.join(' ');
}
