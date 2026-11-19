/* /edge — the edge referee dashboard: live telemetry from every edge node, the verification
   pipeline, a Live Lab where a bot drives a real run that the edge referees while you try to cheat,
   and an edge benchmark. Separate from the game UI. English + Persian. */
import { createGame, stepGame, gameResult, encodeTrace, encodeInput, TICK_RATE } from './simulation.js';
import { pilot } from './autopilot.js';
import { createMinimap } from './ui/minimap.js';
import { carById } from './cars.js';

const $ = (id) => document.getElementById(id);
const S = {
  en: {
    title: 'EDGE REFEREE', sub: 'Every rank, rival and share card in ESCAPE 60 is decided on Arvan Edge Compute — while you drive. The browser only sends its inputs; the edge re-simulates the game and is the only judge.',
    countersTitle: 'Live edge telemetry', countersSub: 'Real counters merged from every edge isolate into object storage (no personal data).', today: 'Today', total: 'All time',
    runs: 'Runs verified', live: 'Live checks', drive: 'Driving re-simulated', cpu: 'Edge CPU for replays', rejects: 'Cheats refused', rivals: 'Ghost rivals served', cards: 'PNG cards drawn', previews: 'Link previews', saved: 'Bytes saved (Brotli)', statics: 'Files served', api: 'API calls', isolates: 'Edge isolates', ticksSub: '{n} ticks at 60 Hz', perRun: '{n} ms per run',
    pipeTitle: 'What the edge does for every run', pipeSub: 'Stateless: everything the edge needs travels inside HMAC-signed tickets and checkpoints, so any edge node can answer any request.',
    steps: [
      ['Run ticket', 'An HMAC-signed ticket binds run id, route, car and start time.'],
      ['Live referee', 'Every 5 s the browser sends ~300 bytes of inputs; the edge re-simulates those 300 ticks of the 60 Hz game.'],
      ['Pacing proof', 'Inputs may not arrive faster than real time (+10 %, 3 s jitter) — speed hacks die mid-run.'],
      ['Live global rank', 'The edge answers with its own score and where it ranks on today\'s board right now.'],
      ['Final verdict', 'Only the last seconds are replayed; the result is compared field by field and stored once.'],
      ['Rival · card · preview', 'Verified inputs become ghost rivals; pixel-art PNG cards and link previews are drawn on the edge.'],
    ],
    labTitle: 'Live Lab — try to cheat', labSub: 'A bot drives a real run here in your browser, at real-time speed, and the edge referees it live. Lab runs are verified exactly like real ones but never touch the leaderboard.',
    browserSays: 'Browser says', edgeSays: 'Edge says', labStart: 'Start bot run', labFake: 'Fake +5,000 pts', labSpeed: 'Speed hack ×3', labForge: 'Forge final score', labCrash: 'Crash & finish',
    benchTitle: 'Edge benchmark', benchSub: 'Steps the real simulation for 600 ticks on the edge node that answers you, and the same work on your device.', benchRun: 'Run benchmark', benchEdge: 'This edge node', benchLocal: 'Your device',
    recentTitle: 'Latest verified runs', recentSub: 'Accepted by the edge after full replay. Live = how many times the edge checked the run while it was driven.', none: 'No runs yet today — play one!',
    rejectTitle: 'Refused, by reason', rejectSub: 'Every request the edge turned down today.',
    reasons: { pacing: 'Inputs faster than real time', mismatch: 'Score does not match replay', checkpoint: 'Forged checkpoint', ticket: 'Invalid ticket', replayed: 'Run submitted twice', replay: 'Impossible inputs', trace: 'Malformed inputs', expired: 'Ticket expired', version: 'Old game version', json: 'Bad request', size: 'Too large', seed: 'Bad route' },
    play: 'PLAY ESCAPE 60', th: ['Driver', 'Car', 'Score', 'Time', 'Live', 'Replay'],
    l: { starting: 'requesting a lab ticket…', ticket: 'ticket {id} · route {seed}', check: '✓ tick {t}: edge {e} = browser {b} · {ms} ms edge CPU · rank {r}', mismatch: '✗ tick {t}: edge {e} ≠ browser {b} — this run would be refused', refused: '✗ edge refused: {err}', fake: 'cheat: browser now claims +5,000 points', speed: 'cheat: game clock ×3', forge: 'cheat: final result will claim +5,000', crash: 'steering into the wall…', ended: 'run ended ({end}) at tick {t} — asking for the verdict', accepted: '✓ VERIFIED by the edge: {p} pts · {ms} ms CPU · {n} live checks · not stored (lab)', offline: 'game service unreachable' },
  },
  fa: {
    title: 'داور لبه', sub: 'همه‌ی رتبه‌ها، رقیب‌ها و کارت‌های اشتراک فرار ۶۰ روی پردازش لبه‌ی آروان تعیین می‌شوند — همان لحظه که رانندگی می‌کنی. مرورگر فقط ورودی‌هایش را می‌فرستد؛ لبه بازی را دوباره شبیه‌سازی می‌کند و تنها داور است.',
    countersTitle: 'آمار زنده‌ی لبه', countersSub: 'شمارنده‌های واقعی که از همه‌ی ایزوله‌های لبه در فضای ذخیره‌سازی جمع می‌شوند (بدون داده‌ی شخصی).', today: 'امروز', total: 'از ابتدا',
    runs: 'رانندگی تأییدشده', live: 'بررسی زنده', drive: 'رانندگی بازشبیه‌سازی‌شده', cpu: 'پردازنده‌ی لبه برای بازپخش', rejects: 'تقلب ردشده', rivals: 'رقیب شبح ارسال‌شده', cards: 'کارت PNG ساخته‌شده', previews: 'پیش‌نمایش لینک', saved: 'صرفه‌جویی حجم (Brotli)', statics: 'فایل ارسال‌شده', api: 'درخواست API', isolates: 'ایزوله‌های لبه', ticksSub: '{n} تیک ۶۰ هرتزی', perRun: '{n} میلی‌ثانیه برای هر رانندگی',
    pipeTitle: 'لبه برای هر رانندگی چه می‌کند', pipeSub: 'بدون حالت: هر چیزی که لبه لازم دارد داخل بلیت‌ها و نقطه‌های بازبینی امضاشده با HMAC جابه‌جا می‌شود، پس هر گره‌ی لبه می‌تواند به هر درخواستی جواب بدهد.',
    steps: [
      ['بلیت رانندگی', 'یک بلیت امضاشده (HMAC) شناسه، مسیر، ماشین و زمان شروع را قفل می‌کند.'],
      ['داور زنده', 'هر ۵ ثانیه مرورگر حدود ۳۰۰ بایت ورودی می‌فرستد و لبه همان ۳۰۰ تیک بازی ۶۰ هرتزی را دوباره شبیه‌سازی می‌کند.'],
      ['اثبات سرعت واقعی', 'ورودی‌ها نباید سریع‌تر از زمان واقعی برسند (۱۰٪ و ۳ ثانیه لرزش شبکه) — هک سرعت وسط بازی رد می‌شود.'],
      ['رتبه‌ی جهانی زنده', 'لبه امتیاز خودش و جایگاهت در جدول امروز را همان لحظه برمی‌گرداند.'],
      ['حکم نهایی', 'فقط چند ثانیه‌ی آخر بازپخش می‌شود؛ نتیجه فیلد به فیلد مقایسه و فقط یک بار ثبت می‌شود.'],
      ['رقیب · کارت · پیش‌نمایش', 'ورودی‌های تأییدشده رقیب شبح می‌شوند؛ کارت PNG پیکسلی و پیش‌نمایش لینک روی لبه ساخته می‌شوند.'],
    ],
    labTitle: 'آزمایشگاه زنده — تقلب کن!', labSub: 'یک ربات همین‌جا در مرورگرت با سرعت واقعی یک رانندگی واقعی انجام می‌دهد و لبه زنده داوری‌اش می‌کند. رانندگی‌های آزمایشگاه دقیقاً مثل بازی واقعی تأیید می‌شوند ولی وارد جدول رتبه نمی‌شوند.',
    browserSays: 'مرورگر می‌گوید', edgeSays: 'لبه می‌گوید', labStart: 'شروع رانندگی ربات', labFake: '۵٬۰۰۰ امتیاز جعلی', labSpeed: 'هک سرعت ×۳', labForge: 'جعل امتیاز نهایی', labCrash: 'تصادف و پایان',
    benchTitle: 'سنجش لبه', benchSub: 'شبیه‌سازی واقعی را ۶۰۰ تیک روی همان گره‌ی لبه‌ای که جوابت را می‌دهد اجرا می‌کند و همین کار را روی دستگاه خودت.', benchRun: 'اجرای سنجش', benchEdge: 'این گره‌ی لبه', benchLocal: 'دستگاه تو',
    recentTitle: 'آخرین رانندگی‌های تأییدشده', recentSub: 'پس از بازپخش کامل روی لبه پذیرفته شده‌اند. «زنده» یعنی لبه چند بار رانندگی را حین بازی بررسی کرده.', none: 'امروز هنوز رانندگی‌ای ثبت نشده — یکی بازی کن!',
    rejectTitle: 'ردشده‌ها بر اساس دلیل', rejectSub: 'همه‌ی درخواست‌هایی که لبه امروز رد کرده.',
    reasons: { pacing: 'ورودی سریع‌تر از زمان واقعی', mismatch: 'امتیاز با بازپخش نمی‌خواند', checkpoint: 'نقطه‌ی بازبینی جعلی', ticket: 'بلیت نامعتبر', replayed: 'ارسال دوباره‌ی یک رانندگی', replay: 'ورودی غیرممکن', trace: 'ورودی خراب', expired: 'بلیت منقضی', version: 'نسخه‌ی قدیمی بازی', json: 'درخواست نامعتبر', size: 'حجم زیاد', seed: 'مسیر نامعتبر' },
    play: 'بازی فرار ۶۰', th: ['راننده', 'ماشین', 'امتیاز', 'زمان', 'زنده', 'بازپخش'],
    l: { starting: 'requesting a lab ticket…', ticket: 'ticket {id} · route {seed}', check: '✓ tick {t}: edge {e} = browser {b} · {ms} ms edge CPU · rank {r}', mismatch: '✗ tick {t}: edge {e} ≠ browser {b} — this run would be refused', refused: '✗ edge refused: {err}', fake: 'cheat: browser now claims +5,000 points', speed: 'cheat: game clock ×3', forge: 'cheat: final result will claim +5,000', crash: 'steering into the wall…', ended: 'run ended ({end}) at tick {t} — asking for the verdict', accepted: '✓ VERIFIED by the edge: {p} pts · {ms} ms CPU · {n} live checks · not stored (lab)', offline: 'game service unreachable' },
  },
};
let lang = (() => { const q = new URLSearchParams(location.search).get('lang'); if (q === 'fa' || q === 'en') return q; try { const v = localStorage.getItem('escape60-lang'); if (v === 'fa' || v === 'en') return v; } catch {} return /^fa\b/i.test(navigator.language || '') ? 'fa' : 'en'; })();
const T = (k) => S[lang][k] ?? S.en[k] ?? k;
const fill = (s, v) => Object.entries(v).reduce((a, [k, x]) => a.replaceAll(`{${k}}`, x), s);
const fmtN = (n) => Math.round(n || 0).toLocaleString('en-US');
const fmtTime = (ms) => { const s = ms / 1000, m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
async function api(path, opts = {}) {
  const res = await fetch(`/api/v1${path}`, { ...opts, headers: { 'Content-Type': 'application/json' } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

/* ---------- static text ---------- */
function applyLang() {
  document.documentElement.lang = lang; document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = T(el.dataset.t);
  $('ep-lang').textContent = lang === 'fa' ? 'English' : 'فارسی';
  $('ep-pipe').innerHTML = T('steps').map(([b, s]) => `<div class="ep-step"><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('');
  if (last) renderStats(last);
}
$('ep-lang').addEventListener('click', () => { lang = lang === 'fa' ? 'en' : 'fa'; try { localStorage.setItem('escape60-lang', lang); } catch {} applyLang(); });

/* ---------- telemetry ---------- */
let last = null, scope = 'today';
for (const b of document.querySelectorAll('[data-scope]')) b.addEventListener('click', () => { scope = b.dataset.scope; for (const x of document.querySelectorAll('[data-scope]')) x.classList.toggle('on', x === b); if (last) renderStats(last); });
const bytes = (n) => (n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
function renderStats(d) {
  const s = d[scope] || { c: {}, rejects: {} }, c = s.c || {};
  const runs = c.runs || 0;
  const tiles = [
    ['runs', fmtN(runs), runs && c.cpuMs ? fill(T('perRun'), { n: (c.cpuMs / Math.max(1, runs)).toFixed(1) }) : '', 'gr'],
    ['live', fmtN(c.live), `${fmtN(c.liveTicks)} ticks`, 'cy'],
    ['drive', `${((c.ticks || 0) / TICK_RATE / 60).toFixed(1)} min`, fill(T('ticksSub'), { n: fmtN(c.ticks) }), ''],
    ['cpu', (c.cpuMs || 0) < 1000 ? `${Math.round(c.cpuMs || 0)} ms` : `${((c.cpuMs || 0) / 1000).toFixed(1)} s`, '', ''],
    ['rejects', fmtN(c.rejects), '', 'hot'],
    ['rivals', fmtN(c.rivals), '', 'cy'],
    ['cards', fmtN(c.cards), c.cards ? `${((c.cardMs || 0) / c.cards).toFixed(1)} ms / card` : '', ''],
    ['previews', fmtN(c.previews), '', ''],
    ['saved', bytes(c.savedBytes || 0), `${bytes(c.staticBytes || 0)} sent`, 'gr'],
    ['statics', fmtN(c.static), '', ''],
    ['api', fmtN(c.api), '', ''],
    ...(scope === 'today' ? [['isolates', fmtN(s.isolates?.length || 0), `you: ${d.isolate?.id || '—'}`, 'cy']] : []),
  ];
  $('ep-counters').innerHTML = tiles.map(([k, v, sub, cls]) => `<div class="ep-tile ${cls}"><small>${esc(T(k))}</small><b>${esc(v)}</b><i>${esc(sub)}</i></div>`).join('');
  const rec = d.today?.recent || [];
  const th = T('th');
  $('ep-recent').innerHTML = rec.length ? `<table class="ep-table"><tr>${th.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${rec.map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(carById(r.car).name)}</td><td class="n">${fmtN(r.points)}</td><td>${fmtTime(r.timeMs)}</td><td>${r.live || 0}×</td><td>${r.verifyMs} ms</td></tr>`).join('')}</table>` : `<p class="ep-empty">${esc(T('none'))}</p>`;
  const rj = Object.entries(d.today?.rejects || {}).sort((a, b) => b[1] - a[1]), max = Math.max(1, ...rj.map((x) => x[1]));
  $('ep-rejects').innerHTML = rj.length ? rj.map(([k, n]) => `<div class="ep-bar"><span>${esc(T('reasons')[k] || k)}</span><i><u style="width:${(100 * n) / max}%"></u></i><b>${n}</b></div>`).join('') : `<p class="ep-empty">—</p>`;
  $('ep-status').textContent = `API ${d.api} · SIM ${d.version} · ${d.storage}${d.secured ? ' · signed' : ''}`;
}
async function poll() {
  try { last = await api('/edge'); renderStats(last); } catch { $('ep-status').textContent = T('l').offline; }
  setTimeout(poll, 4000);
}

/* ---------- Live Lab ---------- */
const mm = createMinimap($('ep-map'));
const lab = { state: 'idle', game: null };
const log = (text, cls = '') => { const li = document.createElement('li'); li.className = cls; li.textContent = text; const ol = $('ep-log'); ol.prepend(li); while (ol.children.length > 60) ol.lastChild.remove(); };
const L = (k, v = {}) => fill(T('l')[k], v);
function setButtons() {
  const run = lab.state === 'running';
  $('lab-start').disabled = run;
  for (const id of ['lab-fake', 'lab-speed', 'lab-forge', 'lab-crash']) $(id).disabled = !run;
  $('ep-state').textContent = lab.state.toUpperCase();
}
async function labStart() {
  Object.assign(lab, { state: 'running', ticket: null, trace: [], acc: 0, speed: 1, offset: 0, forge: false, crash: false, checkpoint: null, expect: new Map(), inflight: null, sent: 0, n: 0 });
  setButtons(); $('ep-log').textContent = ''; log(L('starting'), 'info');
  try { lab.ticket = await api('/runs/start', { method: 'POST', body: JSON.stringify({ lab: true, car: 'kaze' }) }); }
  catch (e) { log(L('refused', { err: e.message }), 'bad'); lab.state = 'idle'; setButtons(); return; }
  lab.game = createGame(lab.ticket.seed, { car: lab.ticket.car });
  log(L('ticket', { id: lab.ticket.runId.slice(0, 8), seed: lab.ticket.seed }), 'info');
}
function labSend() {
  const g = lab.game, n = lab.trace.length, claim = g.points + lab.offset;
  lab.sent = n; lab.expect.set(n, claim);
  lab.inflight = api('/runs/live', { method: 'POST', body: JSON.stringify({ runId: lab.ticket.runId, token: lab.ticket.token, trace: encodeTrace(lab.trace), checkpoint: lab.checkpoint }) }).then((x) => {
    lab.checkpoint = x.checkpoint; lab.n++;
    const b = lab.expect.get(x.verified);
    $('ep-edge').textContent = fmtN(x.points); $('ep-edge-sub').textContent = `tick ${x.verified} · ${x.cpuMs} ms`;
    if (b === undefined || b === x.points) log(L('check', { t: x.verified, e: fmtN(x.points), b: fmtN(b ?? x.points), ms: x.cpuMs, r: x.standing?.rank ?? 'lab' }), 'ok');
    else log(L('mismatch', { t: x.verified, e: fmtN(x.points), b: fmtN(b) }), 'bad');
  }).catch((e) => { log(L('refused', { err: e.message }), 'bad'); lab.state = 'refused'; setButtons(); }).finally(() => { lab.inflight = null; });
}
async function labFinish() {
  lab.state = 'verdict'; setButtons();
  if (lab.inflight) await lab.inflight;
  const r = gameResult(lab.game);
  log(L('ended', { end: r.end, t: lab.game.ticks }), 'info');
  const claim = { ...r, points: r.points + lab.offset + (lab.forge ? 5000 : 0) };
  let checkpoint = lab.checkpoint;
  try {
    for (let i = 0; i < 160; i++) {
      const x = await api('/runs/finish', { method: 'POST', body: JSON.stringify({ runId: lab.ticket.runId, token: lab.ticket.token, trace: encodeTrace(lab.trace), result: claim, checkpoint }) });
      if (x.continue) { checkpoint = x.checkpoint; continue; }
      log(L('accepted', { p: fmtN(x.result.points), ms: x.verifyMs, n: x.live }), 'ok'); lab.state = 'verified'; break;
    }
  } catch (e) { log(L('refused', { err: e.message }), 'bad'); lab.state = 'refused'; }
  setButtons();
}
$('lab-start').addEventListener('click', labStart);
$('lab-fake').addEventListener('click', () => { lab.offset += 5000; log(L('fake'), 'bad'); });
$('lab-speed').addEventListener('click', () => { lab.speed = 3; log(L('speed'), 'bad'); });
$('lab-forge').addEventListener('click', () => { lab.forge = true; log(L('forge'), 'bad'); });
$('lab-crash').addEventListener('click', () => { lab.crash = true; log(L('crash'), 'info'); });
let prev = 0;
function frame(t) {
  const dt = Math.min(0.1, (t - (prev || t)) / 1000); prev = t;
  if (lab.state === 'running' && lab.ticket && lab.game) {
    lab.acc += dt * lab.speed;
    let steps = 0;
    while (lab.acc >= 1 / TICK_RATE && steps++ < 30 && lab.game.state === 'playing') {
      const v = pilot(lab.game, { crash: lab.crash });
      lab.trace.push(v); stepGame(lab.game, v); lab.game.events.length = 0; lab.acc -= 1 / TICK_RATE;
    }
    $('ep-local').textContent = fmtN(lab.game.points + lab.offset); $('ep-local-sub').textContent = `tick ${lab.game.ticks}`;
    if (lab.game.state === 'ended') labFinish();
    else if (!lab.inflight && lab.trace.length - lab.sent >= 2 * TICK_RATE) labSend();
  }
  if (lab.game) mm.draw(lab.game, t);
  requestAnimationFrame(frame);
}

/* ---------- benchmark ---------- */
$('bench-run').addEventListener('click', async () => {
  $('bench-edge').textContent = '…';
  try { const b = await api('/edge/bench?ticks=600'); $('bench-edge').textContent = fmtN(b.usPerTick); $('bench-edge-sub').textContent = `µs / tick · ${b.ticks} ticks · ${b.ms} ms · isolate ${b.isolate}`; }
  catch (e) { $('bench-edge').textContent = '—'; $('bench-edge-sub').textContent = e.message; }
  const g = createGame('edge-bench', { car: 'kaze' }), t0 = performance.now(); let i = 0;
  for (; i < 600 && g.state === 'playing'; i++) { stepGame(g, encodeInput(((i >> 5) % 7) - 3, false, i % 240 > 225, i % 400 < 50)); if (g.events.length > 64) g.events.length = 0; }
  $('bench-local').textContent = fmtN(((performance.now() - t0) * 1000) / Math.max(1, i));
});

applyLang(); setButtons(); poll(); requestAnimationFrame(frame);
