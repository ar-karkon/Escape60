import { createGame, stepGame, gameResult, encodeTrace, TICK_RATE, MAX_TICKS, SIM_VERSION } from './simulation.js';
import { createRenderer } from './render.js';
import { SoundEngine } from './audio.js';
import { hydrateIcons, iconSVG } from './ui/icons.js';
import { redrawAtlas } from './gfx/signs.js';
import * as api from './api.js';

const $ = (id) => document.getElementById(id);
hydrateIcons();
const canvas = $('game'), render = createRenderer(canvas);
document.fonts?.ready.then(() => redrawAtlas()).catch(() => {});
const els = {
  overlay: $('overlay'), home: $('home'), results: $('results'), hud: $('hud'), controls: $('controls'), pause: $('pause'),
  time: $('time'), score: $('score'), health: $('health'), power: $('power'), count: $('count'), pressure: $('pressure'),
  resultTime: $('result-time'), resultScore: $('result-score'), resultNear: $('result-near'), resultHits: $('result-hits'),
  resultTitle: $('result-title'), resultDetail: $('result-detail'), resultTag: $('result-tag'), resultStatus: $('result-status'),
  daily: $('daily-label'), online: $('online-state'), rank: $('rank'), popups: $('popups'), banner: $('banner'),
  countdown: $('countdown'), hurt: $('hurt'),
};
let game = null, paused = false, seed = '', runTicket = null, trace = [], last = 0, acc = 0, steer = 0;
let pressedLeft = false, pressedRight = false, dragging = false, dragX = 0, finishQueued = false, lastEvent = -1, online = false;
let countdown = 0, countStep = -1, shownHealth = -1, shownPolice = -1, heliShown = false, driftPts = 0, driftShownAt = 0;
const sound = new SoundEngine();
let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const daySeed = () => `daily-${new Date().toISOString().slice(0, 10)}`;
const qs = new URLSearchParams(location.search);
const externalSeed = qs.get('seed');
const sanitizedSeed = typeof externalSeed === 'string' && /^[a-zA-Z0-9_-]{2,64}$/.test(externalSeed) ? externalSeed : null;
const initialSeed = sanitizedSeed || daySeed();
// ?q=high pins full quality (benchmarks / screenshot capture); ?q=low forces the light renderer.
const qualityLock = qs.get('q');
if (qualityLock === 'low') document.getElementById('quality').checked = true;
// ?capture=1 exposes a freeze switch so screenshot scripts can hold an exact frame without UI.
let frozen = false;
if (qs.has('capture')) window.__escape60 = { freeze: (v) => { frozen = !!v; } };
const persisted = {};
try { Object.assign(persisted, JSON.parse(localStorage.getItem('escape60-bests-' + SIM_VERSION) || '{}')); } catch {}
const formatTime = (ms) => (ms / 1000).toFixed(2).padStart(5, '0');
const fmt = (n) => Math.round(n).toLocaleString('en-US');

function setView(name) {
  els.overlay.classList.toggle('hidden', name === 'game');
  els.home.classList.toggle('hidden', name !== 'home');
  els.results.classList.toggle('hidden', name !== 'results');
  els.hud.classList.toggle('hidden', name !== 'game');
  els.controls.classList.toggle('hidden', name !== 'game');
  els.pause.classList.add('hidden');
  document.body.dataset.view = name;
}
async function checkOnline() {
  try {
    const res = await api.today();
    online = !!res.seed;
    els.online.textContent = '● رقابت آنلاین فعال';
    els.online.className = 'chip chip-status online';
  } catch {
    online = false;
    els.online.textContent = 'آفلاین · رکورد روی همین دستگاه';
    els.online.className = 'chip chip-status offline';
  }
}
checkOnline();
function updateMode() {
  seed = initialSeed;
  els.daily.textContent = sanitizedSeed ? 'چالش دوستانه · یک مسیر مشترک' : 'چالش امروز · مسیر مشترک برای همه';
}
updateMode();

/* ---------- HUD helpers ---------- */
const HEART = iconSVG('heart'), HEART_EMPTY = iconSVG('heartEmpty'), SIREN = iconSVG('siren'), SIREN_OFF = iconSVG('sirenOff');
function renderHearts(n) {
  els.health.innerHTML = [0, 1, 2].map((i) => `<span>${i < n ? HEART : HEART_EMPTY}</span>`).join('');
  els.health.setAttribute('aria-label', `${n} جان باقی‌مانده`);
}
function renderSirens(n) {
  els.pressure.innerHTML = [0, 1, 2, 3, 4].map((i) => `<span class="${i < n ? 'on' : ''}">${i < n ? SIREN : SIREN_OFF}</span>`).join('');
}
function popup(text, sub = '', cls = '') {
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
  const slot = els.popups.childElementCount % 4;
  el.style.left = `${50 + (slot % 2 ? 14 : -14)}%`;
  el.style.top = `${slot * 44}px`;
  el.style.translate = '-50% 0';
  el.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
  els.popups.appendChild(el);
  setTimeout(() => el.remove(), 1150);
}
let bannerTimer = 0;
function banner(text, info = false, ms = 1600) {
  els.banner.textContent = text;
  els.banner.className = 'banner' + (info ? ' info' : '');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => els.banner.classList.add('hidden'), ms);
}
function vibrate(ms) { try { if (!reducedMotion) navigator.vibrate?.(ms); } catch {} }

async function begin() {
  game = createGame(seed); trace = []; steer = 0; pressedLeft = false; pressedRight = false; paused = false;
  finishQueued = false; lastEvent = -1; runTicket = null; countdown = 1.8; countStep = -1;
  shownHealth = -1; shownPolice = -1; heliShown = false; driftPts = 0;
  els.popups.textContent = ''; els.banner.classList.add('hidden');
  setView('game'); updateHud();
  // Play must remain responsive even when network is down.
  if (online) { const started = game; api.startRun(seed).then((r) => { if (game === started && !finishQueued) runTicket = r; }).catch(() => {}); }
  sound.start();
  last = performance.now(); acc = 0;
}
function skipCountdown() { if (countdown > 0) { countdown = 0; showCount(3); } }
function showCount(step) {
  if (step === countStep) return;
  countStep = step;
  els.countdown.classList.remove('hidden');
  if (step < 3) { els.countdown.innerHTML = `<b>${3 - step}</b>`; sound.beep(520, 0.12, 'square', 0.03); }
  else { els.countdown.innerHTML = '<b class="go">برو!</b>'; sound.beep(880, 0.25, 'square', 0.035); setTimeout(() => { if (countStep === 3) els.countdown.classList.add('hidden'); }, 650); }
}
function quantizeSteer() { const v = pressedLeft ? -1 : pressedRight ? 1 : steer; return Math.max(-3, Math.min(3, Math.round(v * 3))); }
function updateHud() {
  if (!game) return;
  els.time.textContent = formatTime(Math.min(60000, game.ticks * 1000 / TICK_RATE));
  els.score.textContent = fmt(game.points);
  els.count.textContent = `${Math.max(0, 60 - Math.floor(game.ticks / TICK_RATE))}`;
  els.power.style.width = `${100 * game.ticks / MAX_TICKS}%`;
  if (game.health !== shownHealth) {
    if (shownHealth > game.health) { els.health.classList.remove('hit'); void els.health.offsetWidth; els.health.classList.add('hit'); }
    shownHealth = game.health; renderHearts(game.health);
  }
  if (game.police.length !== shownPolice) { shownPolice = game.police.length; renderSirens(Math.min(5, shownPolice)); }
  els.hud.classList.toggle('final', game.ticks > 50 * TICK_RATE);
}
function finish() {
  if (finishQueued) return;
  finishQueued = true;
  const result = gameResult(game);
  const prev = persisted[seed];
  if (!prev || result.timeMs > prev.timeMs || (result.timeMs === prev.timeMs && result.points > prev.points)) {
    persisted[seed] = result;
    try { localStorage.setItem('escape60-bests-' + SIM_VERSION, JSON.stringify(persisted)); } catch {}
  }
  els.resultTime.textContent = formatTime(result.timeMs);
  els.resultScore.textContent = fmt(result.points);
  els.resultNear.textContent = fmt(result.closeCalls);
  els.resultHits.textContent = fmt(result.hits);
  els.results.classList.toggle('bust', !result.win);
  els.resultTitle.textContent = result.win ? 'فرار کردی!' : 'گیر افتادی!';
  els.resultTag.textContent = result.win ? 'RUN COMPLETE' : 'BUSTED';
  els.resultTag.classList.toggle('bust', !result.win);
  els.resultStatus.innerHTML = result.win ? `<span>${iconSVG('check')}</span><b>فرار موفق!</b>` : `<span>${iconSVG('siren')}</span><b>دستگیر شدی</b>`;
  els.resultDetail.textContent = `بهترین زمان این مسیر روی دستگاه: ${formatTime(persisted[seed].timeMs)} · جان باقی‌مانده: ${result.health}`;
  els.rank.textContent = runTicket ? 'در انتظار تأیید سرور…' : 'رکورد فقط روی این دستگاه ذخیره شد';
  sound.end(result.win);
  // Short beat so the crash / finish moment reads before the card slides in.
  setTimeout(() => { if (game?.state === 'ended') setView('results'); }, result.win ? 450 : 650);
  if (runTicket) {
    const finished = game;
    api.finishRun(runTicket.runId, runTicket.token, encodeTrace(trace), result).then((r) => {
      if (game !== finished) return;
      els.rank.textContent = r.rank ? `رتبه تأییدشده در جدول این مسیر: #${r.rank}` : 'نتیجه ثبت شد';
      return api.leaderboard(seed);
    }).then((r) => { if (game === finished && r && r.entries?.length) els.rank.textContent += ` · ${r.entries.length} رکورد برتر`; })
      .catch(() => { if (game === finished) els.rank.textContent = 'رکورد فقط روی این دستگاه ذخیره شد'; });
  }
}
function tick() {
  if (!game || paused || game.state !== 'playing') return;
  const v = quantizeSteer();
  trace.push(v);
  const before = game.points;
  stepGame(game, v / 3);
  const gained = game.points - before;
  const e = game.events;
  for (let i = lastEvent + 1; i < e.length; i++) {
    const event = e[i];
    if (event.type === 'near') { popup(`+${gained > 8 ? gained : 55}`, 'جاخالی!'); sound.near(); vibrate(15); }
    else if (event.type === 'hit') { popup('-150', event.kind === 'police' ? 'ضربه پلیس!' : event.kind === 'roadblock' ? 'راه‌بند!' : 'تصادف!', 'bad'); sound.hit(); vibrate(90); els.hurt.classList.remove('on'); void els.hurt.offsetWidth; els.hurt.classList.add('on'); }
    else if (event.type === 'roadblock') { banner('⚠ راه‌بند پلیس جلوتر — مسیر باز را پیدا کن!'); sound.alarm(); }
    else if (event.type === 'police') { banner('🚨 پلیس تازه به تعقیب پیوست', true, 1200); sound.siren(); }
    else if (event.type === 'scrape') sound.scrape();
  }
  if (gained === 8 && !e.slice(lastEvent + 1).some((ev) => ev.type === 'near')) {
    driftPts += 8;
    if (performance.now() - driftShownAt > 500) { popup(`+${driftPts}`, 'دریفت', 'cyan'); driftPts = 0; driftShownAt = performance.now(); }
  }
  lastEvent = e.length - 1;
  if (!heliShown && game.ticks >= 25 * TICK_RATE) { heliShown = true; banner('🚁 هلیکوپتر پلیس بالای سرت است!', true, 1500); }
  sound.music(game.ticks, game.police.length);
  if (game.ticks % 3 === 0) updateHud();
  if (game.state === 'ended') { updateHud(); finish(); }
}
function frame(t) {
  if (!last) last = t;
  const dt = Math.min((t - last) / 1000, 0.25);
  last = t;
  if (!paused && !frozen && game?.state === 'playing') {
    if (countdown > 0) {
      countdown -= dt;
      showCount(countdown > 1.2 ? 0 : countdown > 0.6 ? 1 : countdown > 0 ? 2 : 3);
      acc = 0;
    } else {
      if (countStep < 3) showCount(3);
      acc = Math.min(acc + dt, 0.25);
      let steps = 0;
      while (acc >= 1 / TICK_RATE && steps < 15) { tick(); acc -= 1 / TICK_RATE; steps++; }
    }
  }
  const p = game?.player;
  sound.engine(game?.state === 'playing' && !paused && countdown <= 0, p ? p.speed / 279 : 0, p ? p.drift : 0, game?.police.length ?? 0);
  render(game, t, { reducedMotion, low: $('quality').checked, seed, alpha: acc * TICK_RATE, countdown: Math.max(0, countdown), lockHigh: qualityLock === 'high' });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
function togglePause() {
  if (!game || game.state !== 'playing') return;
  paused = !paused;
  els.pause.classList.toggle('hidden', !paused);
  els.hud.classList.toggle('hidden', paused);
  els.controls.classList.toggle('hidden', paused);
  last = performance.now(); acc = 0;
  sound.pause(paused);
}
window.addEventListener('visibilitychange', () => { if (document.hidden && game?.state === 'playing' && !paused) togglePause(); });
function button(id, fn) { $(id).addEventListener('click', () => { sound.ui(); fn(); }); }
$('motion').checked = reducedMotion;
$('motion').onchange = () => { reducedMotion = $('motion').checked; };
button('settings', () => $('config').showModal());
button('close-config', () => $('config').close());
button('daily-play', () => { seed = daySeed(); begin(); });
button('board', async () => {
  const list = $('entries');
  list.textContent = 'در حال دریافت…';
  $('records').showModal();
  try {
    const { entries } = await api.leaderboard(seed);
    list.innerHTML = entries.length
      ? entries.map((r, i) => `<div class="row"><span>#${i + 1}</span><span>${formatTime(r.timeMs)}s</span><span>${fmt(r.points)} ★</span></div>`).join('')
      : 'هنوز رکوردی برای این مسیر ثبت نشده است.';
  } catch {
    const mine = persisted[seed];
    list.textContent = 'جدول آنلاین در دسترس نیست.' + (mine ? `\nبهترین رکورد شما روی این دستگاه: ${formatTime(mine.timeMs)} ثانیه · ${fmt(mine.points)} امتیاز` : '');
  }
});
button('close-board', () => $('records').close());
button('home-button', () => { game = null; updateMode(); setView('home'); });
button('play', begin);
button('replay', begin);
button('resume', togglePause);
button('pause-button', togglePause);
button('quit', () => { paused = false; game = null; sound.pause(false); setView('home'); });
button('sound', () => {
  const enabled = sound.toggle();
  $('sound-label').textContent = enabled ? 'صدا روشن' : 'صدا خاموش';
  $('sound-ico').innerHTML = iconSVG(enabled ? 'sound' : 'mute');
  $('sound').setAttribute('aria-pressed', String(enabled));
});
button('share', async () => {
  const url = new URL(location.href);
  url.searchParams.set('seed', seed);
  const best = gameResult(game);
  const text = `من ${formatTime(best.timeMs)} ثانیه در فرار ۶۰ دوام آوردم و ${fmt(best.points)} امتیاز گرفتم! می‌تونی رکوردم رو بزنی؟`;
  const label = $('share').querySelector('b');
  try {
    if (navigator.share) await navigator.share({ title: 'فرار ۶۰', text, url: String(url) });
    else { await navigator.clipboard.writeText(`${text}\n${url}`); label.textContent = 'لینک کپی شد ✓'; setTimeout(() => (label.textContent = 'اشتراک رکورد'), 2000); }
  } catch {}
});
button('random', () => { seed = `challenge-${Math.random().toString(36).slice(2, 10)}`; els.daily.textContent = 'چالش تازه · مسیر مشترک'; begin(); });

/* ---------- input ---------- */
const left = $('left'), right = $('right');
function bindHold(el, side) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    skipCountdown();
    if (side === 'left') pressedLeft = true; else pressedRight = true;
    el.classList.add('down');
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(type, () => {
    if (side === 'left') pressedLeft = false; else pressedRight = false;
    el.classList.remove('down');
  });
}
bindHold(left, 'left');
bindHold(right, 'right');
canvas.addEventListener('pointerdown', (e) => {
  if (!game || game.state !== 'playing') return;
  skipCountdown();
  dragging = true; dragX = e.clientX;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => { if (!dragging) return; steer = Math.max(-1, Math.min(1, (e.clientX - dragX) / 90)); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, () => { dragging = false; steer = 0; });
window.addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') { pressedLeft = true; skipCountdown(); }
  if (e.code === 'ArrowRight' || e.code === 'KeyD') { pressedRight = true; skipCountdown(); }
  if (e.code === 'KeyP' || e.code === 'Escape') { if (!e.repeat) togglePause(); }
  if (e.code === 'Space' && game?.state === 'ended') begin();
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') pressedLeft = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') pressedRight = false;
});
setView('home');
