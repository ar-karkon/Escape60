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
function play(seed, car, spawn, rules = null) {
  const g = createGame(seed, { car, spawn, rules }), steps = [];
  while (g.state === 'playing') { const v = pilot(g); steps.push(v); stepGame(g, v); g.events.length = 0; }
  return { trace: encodeTrace(steps), result: gameResult(g) };
}

test('health reports the game service', async () => {
  const r = await harness().call('/api/v1/health');
  assert.equal(r.status, 200); assert.equal(r.body.status, 'ok'); assert.equal(r.body.storage, 'memory');
  assert.deepEqual(r.body.ai, { configured: false, model: null }, 'AIaaS is optional');
});

test('daily route', async () => {
  const r = await harness().call('/api/v1/challenges/today');
  assert.equal(r.body.seed, 'daily-2026-11-19');
});

test('a played run is replayed, verified and ranked; replays are single-use', async () => {
  const h = harness();
  const day = (await h.call('/api/v1/challenges/today')).body;
  assert.equal(day.brief.source, 'fallback'); assert.equal(day.rules.contracts.length, 3);
  const refused = await h.call('/api/v1/runs/start', { seed: 'daily-2026-11-19', car: 'raiden' });
  assert.equal(refused.status, 409, 'a daily run must use the day\'s briefing');
  const t = await h.call('/api/v1/runs/start', { seed: 'daily-2026-11-19', car: 'raiden', rules: day.rules.id });
  assert.equal(t.status, 200); assert.equal(t.body.car, 'raiden'); assert.equal(t.body.rules, day.rules.id);
  const { trace, result } = play('daily-2026-11-19', 'raiden', undefined, day.rules);
  assert.equal(result.rules, day.rules.id);
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
  const rules = (await h.call('/api/v1/challenges/today')).body.rules;
  const t = await h.call('/api/v1/runs/start', { seed: 'daily-2026-11-19', car: 'kaze', spawn: 17, rules: rules.id });
  assert.equal(t.body.spawn, 17);
  const { trace, result } = play('daily-2026-11-19', 'kaze', 17, rules);
  assert.equal(result.spawn, 17);
  h.advance(result.timeMs + 1000);
  const ok = await h.call('/api/v1/runs/finish', { runId: t.body.runId, token: t.body.token, trace, result });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const t2 = await h.call('/api/v1/runs/start', { seed: 'daily-2026-11-19', car: 'kaze', spawn: 18, rules: rules.id });
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
  assert.match(page, /history\.replaceState\(null,"","\/\?seed=cards&c=\d+\.\d+&sp=\d+&r=[a-f0-9]{12}"\)/);
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

/* ---------- AIaaS (mocked gateway) ---------- */
function mockAI({ fail = false, evil = false } = {}) {
  const calls = [];
  const reply = (content) => new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: 321 } }), { headers: { 'content-type': 'application/json' } });
  const fetchImpl = async (url, opts) => {
    const body = JSON.parse(opts.body), prompt = body.messages[1].content;
    calls.push({ url, auth: opts.headers.Authorization, body, prompt });
    if (fail) return new Response('{"error":"down"}', { status: 503 });
    if (prompt.startsWith("Design today's pursuit")) return reply(evil ? 'Sure! ```json\n{"theme":{"en":"<b>Tide</b> Run https://x.y","fa":"فرار جزر"},"briefing":{"en":"Go.","fa":"برو."},"contracts":[{"type":"drift","goal":999999,"zone":"oldtown"},{"type":"teleport","goal":1},{"type":"speed","goal":10}],"tactics":{"pace":99,"spikes":0}}\n```'
      : JSON.stringify({ theme: { en: 'Midnight Tide', fa: 'جزر نیمه‌شب' }, briefing: { en: 'The tide is out and so are the cruisers. Own the docks.', fa: 'آب پایین رفته و گشتی‌ها بیرون آمده‌اند. اسکله مال توست.' }, dispatcher: { en: 'Harbor Control', fa: 'کنترل بندر' },
        contracts: [{ type: 'survive', goal: 45, title: { en: 'Low Tide', fa: 'جزر' } }, { type: 'explore', goal: 2, title: { en: 'Tour', fa: 'گشت' } }, { type: 'speed', goal: 170, title: { en: 'Flat Out', fa: 'تمام‌گاز' } }], tactics: { pace: 1.15, blocks: 1.3, spikes: 3, intercept: 0.5 } }));
    if (prompt.includes('Write police-radio chatter in Persian')) return reply(JSON.stringify({ start: ['همه‌ی واحدها، {car} در {zone}!'], heat: ['تعقیب داغ شد!'], roadblock: ['راه را ببندید!'], takedown: ['یک گشتی رفت!'], nearCop: ['لیز خورد!'], hit: ['ضربه خورد!'], pit: ['در پیت‌استاپ است!'] }));
    if (prompt.includes('Write police-radio chatter in English')) return reply(JSON.stringify({ start: ['Harbor Control: {car} rolling in {zone}!'], heat: ['Bring everyone!'], roadblock: ['Wall it off!'], takedown: ['Cruiser down!'], nearCop: ['He slipped us!'], hit: ['He is hurt!'], pit: ['Pit stop, watch it!'] }));
    if (prompt.includes('Write the single radio call')) return reply(body.messages[1].content.includes('in Persian') ? '«کنترل بندر: یک کازه نارنجی در اسکله!»' : '"Harbor Control: orange Kaze S15 spotted on The Docks, all units!"');
    if (prompt.includes('You are Ray')) return reply(JSON.stringify({ tip: { en: 'Brake earlier into the canyon hairpins.', fa: 'زودتر قبل از پیچ‌های دره ترمز کن.' }, headline: { en: 'Kaze survives the tide', fa: 'کازه از جزر جان سالم برد' }, taunt: { en: 'See you at the docks.', fa: 'در اسکله می‌بینمت.' }, next: { type: 'points', goal: 999999999 } }));
    return reply('{}');
  };
  return { calls, fetchImpl };
}
function aiHarness(opts) {
  let clock = DAY;
  const store = memoryStore(), m = mockAI(opts);
  const app = createApp({ env: { RUN_SECRET: 't', REPLAY_CHUNK: 40000, SINGLE_PASS: true, AI_API_KEY: 'apikey SECRET123' }, store, now: () => clock, aiFetch: m.fetchImpl, loadIndex: async () => '<html><head></head><body></body></html>' });
  const call = async (path, payload) => { const res = await app.handle(new Request('http://edge' + path, payload ? { method: 'POST', body: JSON.stringify(payload) } : {})); return { status: res.status, body: res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text() }; };
  return { app, store, call, m, advance: (ms) => { clock += ms; } };
}

test('AIaaS writes the daily briefing once; the simulation plays by its rules and the edge verifies it', async () => {
  const h = aiHarness();
  const day = (await h.call('/api/v1/challenges/today')).body;
  assert.equal(day.brief.source, 'ai'); assert.equal(day.brief.theme.fa, 'جزر نیمه‌شب'); assert.equal(day.brief.model, 'DeepSeek-V4-Flash');
  assert.deepEqual(day.rules.contracts.map((c) => c.type), ['survive', 'explore', 'speed']);
  assert.equal(day.rules.tactics.pace, 1.15);
  const c0 = h.m.calls[0];
  assert.equal(c0.url, 'https://api.arvancloudai.ir/v1/chat/completions');
  assert.equal(c0.auth, 'apikey SECRET123', 'Arvan AIaaS key header (prefix normalised)');
  assert.deepEqual(c0.body.thinking, { type: 'disabled' }); assert.equal(c0.body.model, 'DeepSeek-V4-Flash');
  await h.call('/api/v1/challenges/today');
  assert.equal(h.m.calls.filter((c) => c.prompt.startsWith("Design today's pursuit")).length, 1, 'frozen for the day');
  // a full daily run under the AI rules
  const t = await h.call('/api/v1/runs/start', { seed: day.seed, car: 'raiden', rules: day.rules.id });
  const { trace, result } = play(day.seed, 'raiden', t.body.spawn, day.rules);
  assert.ok(result.contracts >= 1, 'contracts paid out');
  h.advance(result.timeMs + 2000);
  const f = await h.call('/api/v1/runs/finish', { runId: t.body.runId, token: t.body.token, trace, result });
  assert.equal(f.status, 200, JSON.stringify(f.body));
  // a run that ignores the rules does not verify
  const t2 = await h.call('/api/v1/runs/start', { seed: day.seed, car: 'raiden', rules: day.rules.id });
  const plain = play(day.seed, 'raiden', t2.body.spawn);
  h.advance(plain.result.timeMs + 2000);
  assert.equal((await h.call('/api/v1/runs/finish', { runId: t2.body.runId, token: t2.body.token, trace: plain.trace, result: plain.result })).status, 422);
  // crew chief: generated once, sanitized, cached, used by rivals and previews
  const d1 = await h.call('/api/v1/runs/debrief', { id: f.body.id });
  assert.equal(d1.body.chief.source, 'ai'); assert.equal(d1.body.chief.tip.fa, 'زودتر قبل از پیچ‌های دره ترمز کن.');
  assert.ok(d1.body.chief.next.goal <= result.points * 2 + 1500, 'next target clamped');
  await h.call('/api/v1/runs/debrief', { id: f.body.id });
  assert.equal(h.m.calls.filter((c) => c.prompt.includes('You are Ray')).length, 1, 'cached');
  const rv = await h.call(`/api/v1/rival?seed=${day.seed}`);
  assert.equal(rv.body.rival.taunt.en, 'See you at the docks.');
  assert.match((await h.call(`/r/${f.body.id}`)).body, /Kaze survives the tide/);
  // radio bank and dispatcher call
  const radio = (await h.call('/api/v1/radio')).body;
  assert.deepEqual(radio.source, { en: 'ai', fa: 'ai' });
  assert.equal(radio.radio.fa.start[0], 'همه‌ی واحدها، {car} در {zone}!');
  assert.ok(radio.radio.en.busted.length > 0, 'missing moments filled from the handwritten bank');
  const dis = (await h.call('/api/v1/dispatch', { seed: day.seed, car: 'kaze', zone: 2, lang: 'fa' })).body;
  assert.equal(dis.source, 'ai'); assert.equal(dis.line, 'کنترل بندر: یک کازه نارنجی در اسکله!'); assert.equal(dis.who, 'کنترل بندر');
  const m = (await h.call('/api/v1/edge')).body;
  assert.equal(m.ai.brief.source, 'ai'); assert.ok(m.today.c.aiCalls >= 5); assert.ok(m.today.c.aiTokens >= 5 * 321);
});

test('hostile or broken model output is contained; a down gateway falls back everywhere', async () => {
  const h = aiHarness({ evil: true });
  const day = (await h.call('/api/v1/challenges/today')).body;
  assert.equal(day.brief.source, 'ai');
  assert.equal(day.brief.theme.en, 'Tide Run');
  assert.deepEqual(day.rules.contracts.map((c) => [c.type, c.goal]), [['drift', 3000], ['speed', 170]]);
  assert.equal(day.rules.tactics.pace, 1.2); assert.equal(day.rules.tactics.spikes, 3);
  const down = aiHarness({ fail: true });
  const d2 = (await down.call('/api/v1/challenges/today')).body;
  assert.equal(d2.brief.source, 'fallback'); assert.equal(d2.rules.contracts.length, 3);
  assert.equal((await down.call('/api/v1/dispatch', { seed: d2.seed, car: 'kaze', zone: 1, lang: 'en' })).body.line, null);
  assert.deepEqual((await down.call('/api/v1/radio')).body.source, { en: 'fallback', fa: 'fallback' });
  const m = (await down.call('/api/v1/edge')).body;
  assert.ok(m.today.c.aiFails >= 3);
});
