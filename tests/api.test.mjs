import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, callsign } from '../edge/app.mjs';
import { memoryStore } from '../edge/s3.mjs';
import { createGame, stepGame, encodeTrace, gameResult } from '../web/src/simulation.js';
import { sanitizeMission, judgeMission, fallbackMission, OBJECTIVES } from '../web/src/mission.js';

const DAY = Date.parse('2026-11-19T10:00:00Z');
function harness({ aiReply, aiFail = false, chunk } = {}) {
  let clock = DAY; const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    assert.match(init.headers.Authorization, /^apikey /);
    if (aiFail) return new Response('{}', { status: 500 });
    return new Response(JSON.stringify({ choices: [{ message: { content: typeof aiReply === 'function' ? aiReply(calls.at(-1).body) : aiReply } }] }), { status: 200 });
  };
  const store = memoryStore();
  const app = createApp({ env: { AI_API_KEY: aiReply || aiFail ? 'k' : '', RUN_SECRET: 'test', REPLAY_CHUNK: chunk || 4000, SINGLE_PASS: !chunk }, store, fetchImpl, now: () => clock });
  const call = async (path, payload) => {
    const res = await app.handle(new Request('http://edge' + path, payload ? { method: 'POST', body: JSON.stringify(payload) } : {}));
    return { status: res.status, body: await res.json() };
  };
  return { app, store, calls, call, advance: (ms) => { clock += ms; } };
}
function play(seed, pattern = (t) => (t % 140 < 70 ? 0 : 1)) {
  const game = createGame(seed), steps = [];
  while (game.state === 'playing') { const steer = pattern(game.ticks); steps.push(steer * 3); stepGame(game, steer); }
  return { trace: encodeTrace(steps), result: gameResult(game) };
}
const AI_MISSION = JSON.stringify({ title: 'محاصره <b>اسکله</b>', briefing: 'پلیس همه‌ی خروجی‌ها را بسته؛ یک دقیقه وقت داری. https://evil.example', objectives: [{ type: 'near', goal: 99 }, { type: 'escape', goal: 1 }, { type: 'survive', goal: 40 }, { type: 'teleport', goal: 1 }, { type: 'health', goal: 5 }], radio: { start: ['همه‌ی واحدها، سوژه در اسکله است!'] } });

test('health reports the edge service', async () => {
  const { call } = harness();
  const r = await call('/api/v1/health');
  assert.equal(r.status, 200); assert.equal(r.body.status, 'ok'); assert.equal(r.body.storage, 'memory');
});

test('AI mission is validated, clamped, stored once and reused for everyone', async () => {
  const h = harness({ aiReply: '```json\n' + AI_MISSION + '\n```' });
  const a = await h.call('/api/v1/challenges/today');
  assert.equal(a.body.seed, 'daily-2026-11-19');
  const m = a.body.mission;
  assert.equal(m.source, 'ai');
  assert.equal(m.title, 'محاصره bاسکله/b');
  assert.ok(!m.briefing.includes('http'));
  assert.deepEqual(m.objectives.map((o) => o.type), ['near', 'escape', 'health']);
  assert.equal(m.objectives[0].goal, OBJECTIVES.near.max);
  assert.equal(m.objectives[2].goal, OBJECTIVES.health.min);
  assert.ok(m.radio.start.length >= 1 && m.radio.busted.length >= 1);
  await h.call('/api/v1/mission');
  assert.equal(h.calls.length, 1, 'model is called once per day');
  assert.ok(h.store.data.has('missions/v1/2026-11-19.json'));
  // A second edge node (fresh isolate, same storage) adopts the stored mission without calling AI.
  const other = createApp({ env: { AI_API_KEY: 'k', RUN_SECRET: 'test' }, store: h.store, fetchImpl: () => { throw Error('no'); }, now: () => DAY });
  const m2 = await other.mission('2026-11-19');
  assert.equal(m2.title, m.title);
});

test('broken model output falls back to a deterministic mission', async () => {
  const h = harness({ aiReply: 'not json at all' });
  const r = await h.call('/api/v1/mission');
  assert.equal(r.body.source, 'fallback');
  assert.deepEqual(r.body, fallbackMission('2026-11-19', 'daily-2026-11-19'));
  const h2 = harness({ aiFail: true });
  assert.equal((await h2.call('/api/v1/mission')).body.source, 'fallback');
});

test('edge verifies runs by replay, rejects tampering, reuse, forgery and speed-runs', async () => {
  const h = harness({ aiReply: AI_MISSION });
  const seed = 'daily-2026-11-19';
  const ticket = (await h.call('/api/v1/runs/start', { seed })).body;
  assert.ok(ticket.runId && ticket.token && ticket.missionId === 'm-2026-11-19');
  const { trace, result } = play(seed);
  // Too fast: the ticket was issued a moment ago.
  assert.equal((await h.call('/api/v1/runs/finish', { ...ticket, trace, result })).status, 422);
  h.advance(result.timeMs + 1000);
  assert.equal((await h.call('/api/v1/runs/finish', { ...ticket, trace, result: { ...result, points: result.points + 9999 } })).status, 422);
  assert.equal((await h.call('/api/v1/runs/finish', { ...ticket, token: ticket.token.slice(0, -2) + 'xx', trace, result })).status, 401);
  const forged = (await h.call('/api/v1/runs/start', { seed: 'other-seed' })).body;
  assert.equal((await h.call('/api/v1/runs/finish', { ...forged, runId: ticket.runId, trace, result })).status, 401);
  const ok = await h.call('/api/v1/runs/finish', { ...ticket, trace, result });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.rank, 1); assert.equal(ok.body.label, callsign(ticket.runId));
  assert.equal(ok.body.mission.list.length, 3);
  assert.equal(typeof ok.body.verifyMs, 'number');
  assert.equal((await h.call('/api/v1/runs/finish', { ...ticket, trace, result })).status, 409);
  const lb = (await h.call(`/api/v1/leaderboard?seed=${seed}`)).body;
  assert.equal(lb.entries.length, 1); assert.equal(lb.entries[0].timeMs, result.timeMs);
  const stats = (await h.call('/api/v1/stats')).body;
  assert.equal(stats.runs, 1); assert.equal(stats.mission.source, 'ai');
});

test('leaderboard keeps the best runs sorted across many submissions', async () => {
  const h = harness();
  const seed = 'race-1';
  for (const pat of [(t) => 0, (t) => (t % 90 < 45 ? 1 : 0), (t) => (t % 140 < 70 ? 0 : 1)]) {
    const ticket = (await h.call('/api/v1/runs/start', { seed })).body;
    const { trace, result } = play(seed, pat);
    h.advance(70000);
    assert.equal((await h.call('/api/v1/runs/finish', { ...ticket, trace, result })).status, 200);
  }
  const lb = (await h.call(`/api/v1/leaderboard?seed=${seed}`)).body.entries;
  assert.equal(lb.length, 3);
  for (let i = 1; i < lb.length; i++) assert.ok(lb[i - 1].timeMs > lb[i].timeMs || (lb[i - 1].timeMs === lb[i].timeMs && lb[i - 1].points >= lb[i].points));
});

test('pursuit report: only for verified runs, AI when available, cached', async () => {
  const h = harness({ aiReply: (b) => (b.messages[0].content.includes('mission writer') ? AI_MISSION : 'دریفت‌هایت عالی بود. در تقاطع‌ها زودتر فرمان بده تا به راه‌بند نخوری.') });
  const ticket = (await h.call('/api/v1/runs/start', { seed: 'coach-1' })).body;
  assert.equal((await h.call('/api/v1/runs/report', ticket)).status, 404);
  const { trace, result } = play('coach-1');
  h.advance(70000);
  await h.call('/api/v1/runs/finish', { ...ticket, trace, result });
  const r1 = await h.call('/api/v1/runs/report', ticket);
  assert.equal(r1.body.source, 'ai'); assert.match(r1.body.report, /تقاطع/);
  const before = h.calls.length;
  assert.equal((await h.call('/api/v1/runs/report', ticket)).body.report, r1.body.report);
  assert.equal(h.calls.length, before);
  const plain = harness();
  const t2 = (await plain.call('/api/v1/runs/start', { seed: 'coach-2' })).body;
  const p2 = play('coach-2'); plain.advance(70000);
  await plain.call('/api/v1/runs/finish', { ...t2, ...p2 });
  const r2 = await plain.call('/api/v1/runs/report', t2);
  assert.equal(r2.body.source, 'fallback'); assert.ok(r2.body.report.length > 20);
});

test('mission judging uses verified stats only', () => {
  const m = sanitizeMission({ title: 'تست', briefing: 'یک مأموریت آزمایشی ساده.', objectives: [{ type: 'near', goal: 3 }, { type: 'escape', goal: 1 }] }, { date: 'd', seed: 's' });
  const j = judgeMission(m, { timeMs: 60000, win: true, closeCalls: 5, health: 50, bestChain: 1, dodges: 0, points: 100 });
  assert.equal(j.complete, true);
  assert.equal(judgeMission(m, { timeMs: 20000, win: false, closeCalls: 5 }).complete, false);
  assert.throws(() => sanitizeMission({ title: 'x' }, {}));
});

test('long runs are replayed in signed chunks; tampered checkpoints are rejected', async () => {
  const h = harness({ chunk: 300 });
  const seed = 'chunky-1';
  const ticket = (await h.call('/api/v1/runs/start', { seed })).body;
  const { trace, result } = play(seed, (t) => ((t / 53) | 0) % 3 - 1);
  h.advance(70000);
  let r = await h.call('/api/v1/runs/finish', { ...ticket, trace, result });
  assert.equal(r.status, 202); assert.ok(r.body.continue && r.body.checkpoint.sig);
  // Forged state, forged timing and a swapped trace must all fail the signature.
  const cp = r.body.checkpoint, st = JSON.parse(cp.state);
  st.points += 500;
  assert.equal((await h.call('/api/v1/runs/finish', { ...ticket, trace, result, checkpoint: { ...cp, state: JSON.stringify(st) } })).status, 401);
  assert.equal((await h.call('/api/v1/runs/finish', { ...ticket, trace, result, checkpoint: { ...cp, ms: 0 } })).status, 401);
  const other = play(seed, () => 0).trace;
  assert.equal((await h.call('/api/v1/runs/finish', { ...ticket, trace: other, result, checkpoint: cp })).status, 401);
  let rounds = 1;
  while (r.status === 202) { r = await h.call('/api/v1/runs/finish', { ...ticket, trace, result, checkpoint: r.body.checkpoint }); rounds++; }
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(rounds, Math.ceil((result.timeMs * 60 / 1000) / 300) + 1); // + commit request
  assert.deepEqual(r.body.result, result);
});
