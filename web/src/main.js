import { createGame, stepGame, gameResult, encodeTrace, comboMult, TICK_RATE, MAX_TICKS, SIM_VERSION, COMBO_WINDOW } from './simulation.js';
import { createRenderer } from './render.js';
import { AudioEngine } from './audio.js';
import { hydrateIcons, iconSVG } from './ui/icons.js';
import { redrawAtlas } from './gfx/signs.js';
import { loadProfile, saveProfile, applyRun, xpForLevel, missionInfo, PAINTS, paintById, parseChallenge, beats } from './meta.js';
import * as api from './api.js';
import { createMinimap } from './ui/minimap.js';
import { fallbackMission, judgeMission, objectiveText, pickRadio } from './mission.js';

const $ = (id) => document.getElementById(id);
hydrateIcons();
const canvas = $('game'), render = createRenderer(canvas);
const minimap = createMinimap($('minimap'));
document.fonts?.ready.then(() => redrawAtlas()).catch(() => {});
const els = {
  overlay: $('overlay'), home: $('home'), results: $('results'), hud: $('hud'), controls: $('controls'), pause: $('pause'),
  time: $('time'), score: $('score'), health: $('health'), power: $('power'), count: $('count'), pressure: $('pressure'),
  resultTime: $('result-time'), resultScore: $('result-score'), resultNear: $('result-near'), resultChain: $('result-chain'),
  resultTitle: $('result-title'), resultDetail: $('result-detail'), resultTag: $('result-tag'), resultStatus: $('result-status'),
  daily: $('daily-label'), online: $('online-state'), rank: $('rank'), popups: $('popups'), banner: $('banner'),
  countdown: $('countdown'), hurt: $('hurt'), combo: $('combo'), comboX: $('combo-x'), comboFill: $('combo-fill'),
  markBest: $('mark-best'), markTarget: $('mark-target'), newBest: $('new-best'), challengeResult: $('challenge-result'),
  xpGain: $('xp-gain'), xpFill2: $('xp-fill2'), lvl2: $('lvl2'), unlocks: $('result-unlocks'),
};
let game = null, paused = false, seed = '', runTicket = null, trace = [], last = 0, acc = 0, steer = 0;
let pressedLeft = false, pressedRight = false, dragging = false, dragX = 0, finishQueued = false, lastEvent = -1, online = false;
let countdown = 0, countStep = -1, shownHealth = -1, shownPolice = -1, heliShown = false, driftPts = 0, driftShownAt = 0;
let shownMult = 1, bestPassed = false, targetPassed = false, lastResult = null, lastSecond = -1;
let mission = null, radioAt = -1e9, radioTimer = 0, radioSalt = 0, chainSaid = false, finalSaid = false, lastTicket = null;
const audio = new AudioEngine();
let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const daySeed = () => `daily-${new Date().toISOString().slice(0, 10)}`;
const qs = new URLSearchParams(location.search);
const externalSeed = qs.get('seed');
const sanitizedSeed = typeof externalSeed === 'string' && /^[a-zA-Z0-9_-]{2,64}$/.test(externalSeed) ? externalSeed : null;
const initialSeed = sanitizedSeed || daySeed();
const challenge = sanitizedSeed ? parseChallenge(qs) : null;
// ?q=high pins full quality (benchmarks / screenshot capture); ?q=low forces the light renderer.
const qualityLock = qs.get('q');
if (qualityLock === 'low') $('quality').checked = true;
// ?capture=1 exposes a freeze switch so screenshot scripts can hold an exact frame without UI.
let frozen = false;
if (qs.has('capture')) window.__escape60 = { freeze: (v) => { frozen = !!v; }, clear: () => !!game && game.invuln === 0 && game.state === 'playing', audioState: () => ({ ctx: audio.ctx?.state ?? 'none', buffers: audio.buffers.size, tracks: [...audio.tracks.keys()], mode: audio.mode }) };
const persisted = {};
try { Object.assign(persisted, JSON.parse(localStorage.getItem('escape60-bests-' + SIM_VERSION) || '{}')); } catch {}
const profile = loadProfile();
const formatTime = (ms) => (ms / 1000).toFixed(2).padStart(5, '0');
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const faNum = (n) => Number(n).toLocaleString('fa-IR');
$('ver').textContent = `v2.3 · SIM ${SIM_VERSION}`;

function applyPaint() { const p = paintById(profile.paint); render.setPaint(p.body, p.stripe); }
applyPaint();

function setView(name) {
  els.overlay.classList.toggle('hidden', name === 'game');
  els.home.classList.toggle('hidden', name !== 'home');
  els.results.classList.toggle('hidden', name !== 'results');
  els.hud.classList.toggle('hidden', name !== 'game');
  els.controls.classList.toggle('hidden', name !== 'game');
  els.pause.classList.add('hidden');
  document.body.dataset.view = name;
  if (name === 'home') { renderProfile(); audio.setMode('menu'); }
  if (name === 'results') audio.setMode('results');
}
async function checkOnline() {
  try {
    const res = await api.today();
    online = !!res.seed;
    els.online.textContent = '● رقابت آنلاین · تأیید روی لبه‌ی آروان';
    els.online.className = 'chip chip-status online';
    if (res.mission?.objectives) setMission(res.mission);
  } catch {
    online = false;
    els.online.textContent = 'آفلاین · رکورد روی همین دستگاه';
    els.online.className = 'chip chip-status offline';
    setMission(fallbackMission(daySeed().slice(6), daySeed()));
  }
}
/* ---------- AI special event + police radio ---------- */
const eventKey = () => 'escape60-event-' + daySeed();
function eventBest() { try { return JSON.parse(localStorage.getItem(eventKey()) || 'null'); } catch { return null; } }
function goalChips(list) { return list.map((o) => `<span class="${o.done ? 'done' : ''}">${o.done ? '✓ ' : ''}${o.text || objectiveText(o)}</span>`).join(''); }
function setMission(m) {
  mission = m;
  const ai = m.source === 'ai';
  for (const id of ['ev-src', 'evd-src']) { $(id).textContent = ai ? 'AI' : 'BOT'; $(id).classList.toggle('fallback', !ai); $(id).title = ai ? `نوشته‌شده با ${m.model} روی AIaaS آروان` : 'نسخه‌ی آماده (هوش مصنوعی در دسترس نبود)'; }
  $('ev-title').textContent = m.title; $('ev-brief').textContent = m.briefing;
  $('evd-title').textContent = m.title; $('evd-brief').textContent = m.briefing;
  renderEventGoals();
  $('event-card').classList.remove('hidden'); $('ev-detail').classList.remove('hidden');
}
function renderEventGoals() {
  if (!mission) return;
  const best = eventBest();
  const list = mission.objectives.map((o, i) => ({ ...o, text: objectiveText(o), done: !!best?.done?.[i] }));
  $('ev-goals').innerHTML = goalChips(list);
  $('evd-goals').innerHTML = list.map((o) => `<li class="${o.done ? 'done' : ''}"><span>${iconSVG(o.done ? 'check' : 'star')}</span><b>${o.text}</b><i><u style="width:${o.done ? 100 : 0}%"></u></i><small>${o.done ? 'انجام شد' : ''}</small></li>`).join('')
    + `<li class="${best?.complete ? 'done' : ''}"><span>${iconSVG('trophy')}</span><b>همه در یک دور = نشان ★ در جدول</b><i><u style="width:${best?.complete ? 100 : 0}%"></u></i><small>${best?.complete ? '★' : ''}</small></li>`;
}
function radioSay(event, force = false) {
  if (!mission || !game) return;
  const t = performance.now();
  if (!force && t - radioAt < 3800) return;
  const line = pickRadio(mission, event, radioSalt++);
  if (!line) return;
  radioAt = t;
  $('radio-text').textContent = line;
  const box = $('radio'); box.classList.remove('hidden'); box.style.animation = 'none'; void box.offsetWidth; box.style.animation = '';
  audio.radio();
  clearTimeout(radioTimer); radioTimer = setTimeout(() => box.classList.add('hidden'), 3200);
}
checkOnline();
$('event-card').addEventListener('click', () => { audio.play('click', { gain: 0.6 }); renderMissions(); $('missions').showModal(); });
function updateMode() {
  seed = initialSeed;
  els.daily.textContent = sanitizedSeed ? 'چالش دوستانه · یک مسیر مشترک' : 'چالش امروز · مسیر مشترک برای همه';
  const banner = $('challenge-banner');
  if (challenge) {
    banner.classList.remove('hidden');
    banner.innerHTML = `<span>${iconSVG('flame')}</span><p><b>دوستت به چالشت کشیده!</b> رکورد ادعاشده در لینک: <b class="num">${formatTime(challenge.timeMs)}</b> ثانیه · <b class="num">${fmt(challenge.points)}</b> امتیاز. همین مسیر رو برو و بزنش!</p>`;
  }
}
updateMode();

/* ---------- profile / missions / garage ---------- */
function renderProfile() {
  $('lvl').textContent = `LV ${profile.level}`;
  $('xp-fill').style.width = `${(100 * profile.xp) / xpForLevel(profile.level)}%`;
  $('xp-text').textContent = `${fmt(profile.xp)} / ${fmt(xpForLevel(profile.level))} XP`;
  $('streak-n').textContent = profile.streak.days || 0;
  $('streak').classList.toggle('hot', profile.streak.days >= 2);
  const open = profile.missions.list.filter((m) => !m.done).length;
  $('missions-badge').textContent = open;
  $('missions-badge').classList.toggle('hidden', open === 0);
}
function renderMissions() {
  renderEventGoals();
  $('mission-list').innerHTML = profile.missions.list.map((m) => {
    const info = missionInfo(m);
    const pct = Math.min(100, (100 * m.progress) / info.goal);
    return `<li class="${m.done ? 'done' : ''}"><span>${iconSVG(m.done ? 'check' : 'star')}</span><b>${info.text}</b><i><u style="width:${pct}%"></u></i><small>${m.done ? 'انجام شد' : `${fmt(Math.min(m.progress, info.goal))}/${fmt(info.goal)}`}</small></li>`;
  }).join('');
}
function renderGarage() {
  $('paint-list').innerHTML = PAINTS.map((p) => {
    const locked = p.level > profile.level;
    const hex = (c) => '#' + c.toString(16).padStart(6, '0');
    return `<button class="paint ${p.id === profile.paint ? 'active' : ''} ${locked ? 'locked' : ''}" data-paint="${p.id}" ${locked ? 'disabled' : ''} aria-label="${p.name}">
      <span class="swatch" style="--b:${hex(p.body)};--s:${hex(p.stripe)}"></span><b>${p.name}</b><small>${locked ? `سطح ${faNum(p.level)}` : p.id === profile.paint ? 'انتخاب شده' : 'انتخاب'}</small></button>`;
  }).join('');
}
$('paint-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-paint]');
  if (!b || b.disabled) return;
  profile.paint = b.dataset.paint; saveProfile(profile); applyPaint(); renderGarage(); audio.play('levelup', { gain: 0.5 });
});

/* ---------- HUD helpers ---------- */
const SIREN = iconSVG('siren'), SIREN_OFF = iconSVG('sirenOff');
let trailHp = 100, trailHold = 0;
function renderHealth(hp, dt = 0) {
  const v = Math.max(0, Math.min(100, hp));
  $('hp-fill').style.width = v + '%';
  // Damage trail: the lost chunk lingers, then drains (fighting-game style) so every hit reads.
  if (v > trailHp) trailHp = v;
  else if (trailHold > 0) trailHold -= dt;
  else trailHp = Math.max(v, trailHp - dt * 45);
  $('hp-trail').style.width = trailHp + '%';
  $('hp-num').textContent = Math.ceil(v);
  els.health.dataset.level = v > 60 ? 'ok' : v > 30 ? 'warn' : 'crit';
  els.health.classList.toggle('regen', !!game && game.calm >= 5 && v < 100 && game.state === 'playing');
  els.health.setAttribute('aria-valuenow', String(Math.ceil(v)));
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
function placeMark(el, ms) { if (!ms) { el.classList.add('hidden'); return; } el.classList.remove('hidden'); el.style.left = `${Math.min(100, ms / 600)}%`; }

async function begin() {
  audio.unlock();
  game = createGame(seed); trace = []; steer = 0; pressedLeft = false; pressedRight = false; paused = false;
  finishQueued = false; lastEvent = -1; runTicket = null; countdown = 1.8; countStep = -1;
  shownHealth = 100; trailHp = 100; trailHold = 0; shownPolice = -1; heliShown = false; driftPts = 0; shownMult = 1; lastSecond = -1;
  radioAt = -1e9; chainSaid = false; finalSaid = false; lastTicket = null; $('radio').classList.add('hidden');
  const best = persisted[seed]?.timeMs;
  bestPassed = !best; targetPassed = !challenge || seed !== initialSeed;
  placeMark(els.markBest, best && best < 60000 ? best : 0);
  placeMark(els.markTarget, !targetPassed ? challenge.timeMs : 0);
  els.popups.textContent = ''; els.banner.classList.add('hidden');
  setView('game'); updateHud();
  // Play must remain responsive even when network is down.
  if (online) { const started = game; api.startRun(seed).then((r) => { if (game === started && !finishQueued) runTicket = r; }).catch(() => {}); }
  audio.nextChaseTrack();
  audio.setMode('chase');
  last = performance.now(); acc = 0;
}
function skipCountdown() { if (countdown > 0) { countdown = 0; showCount(3); } }
function showCount(step) {
  if (step === countStep) return;
  countStep = step;
  els.countdown.classList.remove('hidden');
  if (step < 3) { els.countdown.innerHTML = `<b>${3 - step}</b>`; audio.play('beep', { gain: 0.8 }); }
  else { els.countdown.innerHTML = '<b class="go">برو!</b>'; audio.play('go'); setTimeout(() => radioSay('start', true), 700); setTimeout(() => { if (countStep === 3) els.countdown.classList.add('hidden'); }, 650); }
}
function quantizeSteer() { const v = pressedLeft ? -1 : pressedRight ? 1 : steer; return Math.max(-3, Math.min(3, Math.round(v * 3))); }
function updateHud() {
  if (!game) return;
  els.time.textContent = formatTime(Math.min(60000, game.ticks * 1000 / TICK_RATE));
  els.score.textContent = fmt(game.points);
  const left = Math.max(0, 60 - Math.floor(game.ticks / TICK_RATE));
  els.count.textContent = `${left}`;
  els.power.style.width = `${100 * game.ticks / MAX_TICKS}%`;
  if (game.health < shownHealth - 0.5) { els.health.classList.remove('hit'); void els.health.offsetWidth; els.health.classList.add('hit'); trailHold = 0.45; }
  shownHealth = game.health;
  if (game.police.length !== shownPolice) { shownPolice = game.police.length; renderSirens(Math.min(5, shownPolice)); }
  els.hud.classList.toggle('final', game.ticks > 50 * TICK_RATE);
  const mult = comboMult(game);
  els.combo.classList.toggle('off', mult < 2);
  els.combo.dataset.m = mult;
  els.comboX.textContent = `×${mult}`;
  els.comboFill.style.width = `${(100 * game.comboTimer) / COMBO_WINDOW}%`;
  if (mult !== shownMult) { if (mult > shownMult) { els.combo.classList.remove('pump'); void els.combo.offsetWidth; els.combo.classList.add('pump'); } shownMult = mult; }
}
function finish() {
  if (finishQueued) return;
  finishQueued = true;
  const result = gameResult(game);
  lastResult = result;
  const prev = persisted[seed];
  const newBest = !prev || result.timeMs > prev.timeMs || (result.timeMs === prev.timeMs && result.points > prev.points);
  if (newBest) {
    persisted[seed] = result;
    try { localStorage.setItem('escape60-bests-' + SIM_VERSION, JSON.stringify(persisted)); } catch {}
  }
  const meta = applyRun(profile, result);
  els.resultTime.textContent = formatTime(result.timeMs);
  els.resultScore.textContent = fmt(result.points);
  els.resultNear.textContent = fmt(result.closeCalls);
  els.resultChain.textContent = fmt(result.bestChain);
  els.results.classList.toggle('bust', !result.win);
  els.resultTitle.textContent = result.win ? 'فرار کردی!' : 'گیر افتادی!';
  els.resultTag.textContent = result.win ? 'RUN COMPLETE' : 'BUSTED';
  els.resultTag.classList.toggle('bust', !result.win);
  els.resultStatus.innerHTML = result.win ? `<span>${iconSVG('check')}</span><b>فرار موفق!</b>` : `<span>${iconSVG('siren')}</span><b>دستگیر شدی</b>`;
  els.newBest.classList.toggle('hidden', !(newBest && prev));
  els.resultDetail.textContent = `بهترین زمان این مسیر: ${formatTime(persisted[seed].timeMs)} · سلامت: ${faNum(result.health)}٪ · برخورد: ${faNum(result.hits)} · جاخالی از راه‌بند: ${faNum(result.dodges)}`;
  els.rank.textContent = runTicket ? 'در حال بازپخش و تأیید روی لبه‌ی آروان…' : 'رکورد فقط روی این دستگاه ذخیره شد';
  if (result.win) radioSay('escaped', true); else radioSay('busted', true);
  const isEvent = mission && seed === daySeed();
  showMission(isEvent ? judgeMission(mission, result) : null, runTicket ? 'pending' : 'local');
  $('coach').classList.toggle('hidden', !runTicket);
  $('coach-btn').classList.remove('hidden'); $('coach-text').classList.add('hidden');
  lastTicket = runTicket;
  // friend challenge outcome (target came from the link, so it is labelled unverified)
  if (challenge && seed === initialSeed) {
    const won = beats(result, challenge);
    els.challengeResult.className = 'challenge-result ' + (won ? 'won' : 'lost');
    els.challengeResult.textContent = won ? '🏆 رکورد دوستت رو زدی! حالا تو به چالشش بکش.' : `${formatTime(Math.max(0, challenge.timeMs - result.timeMs))} ثانیه تا رکورد دوستت مونده — یک دور دیگه!`;
  } else els.challengeResult.className = 'challenge-result hidden';
  // XP + unlocks
  els.lvl2.textContent = `LV ${meta.level}`;
  els.xpGain.textContent = `+${fmt(meta.gained)} XP`;
  els.xpFill2.style.width = '0%';
  setTimeout(() => (els.xpFill2.style.width = `${(100 * profile.xp) / xpForLevel(profile.level)}%`), 350);
  const notes = [];
  if (meta.levelUp) notes.push(`⬆ سطح ${faNum(meta.level)}!`);
  for (const u of meta.unlocks) notes.push(`🎨 رنگ تازه: ${u.name}`);
  for (const m of meta.completed) notes.push(`✓ ${m}`);
  if (meta.streakUp && meta.streak > 1) notes.push(`🔥 ${faNum(meta.streak)} روز پشت سر هم`);
  els.unlocks.classList.toggle('hidden', !notes.length);
  els.unlocks.textContent = notes.slice(0, 3).join('  ·  ') + (notes.length > 3 ? `  · +${faNum(notes.length - 3)}` : '');
  if (result.win) audio.play('win'); else { audio.play('busted'); audio.duckMusic(0.2, 900); }
  if (meta.levelUp) audio.play('levelup', { delay: 0.9 });
  // Short beat so the crash / finish moment reads before the card slides in.
  setTimeout(() => { if (game?.state === 'ended') setView('results'); }, result.win ? 450 : 650);
  if (runTicket) {
    const finished = game;
    api.finishRun(runTicket.runId, runTicket.token, encodeTrace(trace), result, (pct) => { if (game === finished) els.rank.textContent = `بازپخش و تأیید روی لبه‌ی آروان… ${faNum(pct)}٪`; }).then((r) => {
      if (game !== finished) return;
      els.rank.textContent = r.rank ? `تأیید شد روی لبه: رتبه #${faNum(r.rank)} از ${faNum(r.of)} · نام رمز: ${r.label}` : 'نتیجه روی لبه تأیید و ثبت شد';
      if (r.mission) { showMission(r.mission, 'verified'); rememberEvent(r.mission); }
    }).catch(() => { if (game === finished) { els.rank.textContent = 'تأیید آنلاین انجام نشد · رکورد روی همین دستگاه ذخیره شد'; $('coach').classList.add('hidden'); } });
  }
}
function showMission(j, state) {
  const box = $('result-mission');
  if (!j) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden'); box.classList.toggle('complete', j.complete);
  $('rm-title').textContent = mission.title;
  $('rm-state').textContent = j.complete ? (state === 'verified' ? '★ کامل · تأیید لبه' : '★ کامل') : `${faNum(j.done)}/${faNum(j.list.length)}`;
  $('rm-list').innerHTML = goalChips(j.list);
  if (state === 'local') rememberEvent(j);
}
function rememberEvent(j) {
  const prev = eventBest();
  const next = { done: j.list.map((o, i) => o.done || !!prev?.done?.[i]), complete: j.complete || !!prev?.complete };
  try { localStorage.setItem(eventKey(), JSON.stringify(next)); } catch {}
}
function tick() {
  if (!game || paused || game.state !== 'playing') return;
  const v = quantizeSteer();
  trace.push(v);
  const before = game.points;
  stepGame(game, v / 3);
  const gained = game.points - before;
  const e = game.events;
  let skillEvent = false;
  for (let i = lastEvent + 1; i < e.length; i++) {
    const event = e[i];
    if (event.type === 'near' || event.type === 'dodge') {
      skillEvent = true;
      const m = event.mult || 1;
      popup(`+${event.pts}`, event.type === 'dodge' ? 'جاخالی از راه‌بند!' : m > 1 ? `جاخالی ×${m}` : 'جاخالی!', m >= 3 ? 'hot' : '');
      audio.play('near', { rate: 1 + 0.09 * (m - 1), gain: 0.8 });
      audio.play('whoosh', { gain: 0.55, rate: 0.9 + Math.random() * 0.2 });
      if (m >= 2) audio.play('combo', { rate: 0.85 + 0.1 * m, gain: 0.6, delay: 0.05 });
      if (event.type === 'near' && Math.random() < 0.35) audio.play('horn', { delay: 0.12, gain: 0.5, rate: 0.9 + Math.random() * 0.25 });
      if (m >= 3 && !chainSaid) { chainSaid = true; radioSay('chain', true); } else if (Math.random() < 0.3) radioSay('near');
      vibrate(m >= 3 ? 25 : 12);
    } else if (event.type === 'hit') {
      popup(`-${event.dmg}`, event.kind === 'police' ? 'ضربه پلیس!' : event.kind === 'roadblock' ? 'راه‌بند!' : 'تصادف!', 'bad');
      audio.play('crash', { gain: 0.5 + event.dmg / 60 }); audio.duckMusic(0.4, 500); vibrate(40 + event.dmg * 2);
      els.hurt.classList.remove('on'); void els.hurt.offsetWidth; els.hurt.classList.add('on');
      chainSaid = false; radioSay('hit');
    } else if (event.type === 'roadblock') { banner('⚠ راه‌بند پلیس جلوتر — از کنارش جاخالی بده!'); for (let k = 0; k < 3; k++) audio.play('beep', { delay: k * 0.15, rate: 1.4 }); radioSay('roadblock', true); }
    else if (event.type === 'police') { banner('🚨 پلیس تازه به تعقیب پیوست', true, 1200); if (event.tick > 0) radioSay('police'); }
    else if (event.type === 'scrape') { audio.play('scrape', { gain: 0.6 }); vibrate(15); }
  }
  if (gained > 0 && !skillEvent) {
    driftPts += gained;
    if (performance.now() - driftShownAt > 500) { popup(`+${driftPts}`, 'دریفت', 'cyan'); audio.play('coin', { gain: 0.35, rate: 1.2 }); driftPts = 0; driftShownAt = performance.now(); }
  }
  lastEvent = e.length - 1;
  const ms = (game.ticks * 1000) / TICK_RATE;
  if (!heliShown && game.ticks >= 25 * TICK_RATE) { heliShown = true; banner('🚁 هلیکوپتر پلیس بالای سرت است!', true, 1500); radioSay('heli', true); }
  if (!finalSaid && game.ticks >= 50 * TICK_RATE) { finalSaid = true; radioSay('final', true); }
  if (!bestPassed && ms > persisted[seed].timeMs) { bestPassed = true; popup('رکورد شکست!', 'از بهترین زمانت جلو زدی', 'cyan'); audio.play('levelup'); }
  if (!targetPassed && ms > challenge.timeMs) { targetPassed = true; popup('از دوستت جلو زدی!', 'فقط زنده بمون', 'hot'); audio.play('levelup'); }
  const sec = Math.floor(ms / 1000);
  if (sec !== lastSecond) { lastSecond = sec; if (sec >= 55 && sec < 60) audio.play('beep', { rate: 1 + (sec - 55) * 0.1, gain: 0.7 }); }
  if (game.ticks % 3 === 0) updateHud();
  if (game.state === 'ended') { updateHud(); finish(); }
}
function audioMix() {
  const p = game?.player, playing = game?.state === 'playing' && !paused && countdown <= 0;
  let siren = 0, pan = 0, close = false;
  if (game && p) {
    let best = Infinity, bx = 0, by = 0;
    for (const c of game.police) { const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < best) { best = d; bx = c.x - p.x; by = c.y - p.y; } }
    if (best < Infinity) {
      siren = Math.pow(Math.max(0, 1 - best / 750), 1.4);
      const rel = Math.atan2(by, bx) - p.angle;
      pan = Math.max(-0.85, Math.min(0.85, Math.sin(rel)));
      close = best < 170;
    }
  }
  audio.update({ active: playing, speed: p ? p.speed / 279 : 0, drift: p ? p.drift : 0, siren, sirenPan: pan, close, heli: game ? game.ticks >= 25 * TICK_RATE : false });
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
  audioMix();
  if (game) renderHealth(game.health, dt);
  if (game && document.body.dataset.view === 'game') minimap.draw(game, game.map, t);
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
  audio.pause(paused);
}
window.addEventListener('visibilitychange', () => { if (document.hidden && game?.state === 'playing' && !paused) togglePause(); });
// Audio may only start after a gesture; the first tap anywhere unlocks it.
for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, () => audio.unlock(), { capture: true, passive: true });
function button(id, fn) { $(id).addEventListener('click', () => { audio.play('click', { gain: 0.6 }); fn(); }); }
$('motion').checked = reducedMotion;
$('motion').onchange = () => { reducedMotion = $('motion').checked; };
$('music-toggle').checked = audio.musicOn;
$('sfx-toggle').checked = audio.sfxOn;
$('music-toggle').onchange = () => audio.setMusicEnabled($('music-toggle').checked);
$('sfx-toggle').onchange = () => audio.setSfxEnabled($('sfx-toggle').checked);
button('settings', () => $('config').showModal());
button('close-config', () => $('config').close());
button('credits-open', () => $('credits').showModal());
button('close-credits', () => $('credits').close());
button('missions-open', () => { renderMissions(); $('missions').showModal(); });
button('close-missions', () => $('missions').close());
button('daily-play', () => { $('missions').close(); seed = daySeed(); begin(); });
button('garage-open', () => { renderGarage(); $('garage').showModal(); });
button('close-garage', () => $('garage').close());
button('board', async () => {
  const list = $('entries');
  list.textContent = 'در حال دریافت…';
  $('records').showModal();
  const mine = persisted[seed];
  const own = mine ? `<p class="own">بهترین شما در این مسیر: <b class="num">${formatTime(mine.timeMs)}</b> ثانیه · <b class="num">${fmt(mine.points)}</b> امتیاز</p>` : '';
  try {
    const { entries } = await api.leaderboard(seed);
    list.innerHTML = own + (entries.length
      ? entries.map((r, i) => `<div class="row"><span>#${i + 1}</span><span class="who">${(r.label || '').replace(/[<>&"]/g, '')}${r.mission ? ' ★' : ''}</span><span>${formatTime(r.timeMs)}s</span><span>${fmt(r.points)}</span></div>`).join('') + '<p class="lb-note">★ = رویداد ویژه‌ی AI کامل شد · همه‌ی رکوردها با بازپخش روی لبه‌ی آروان تأیید شده‌اند</p>'
      : 'هنوز رکوردی برای این مسیر ثبت نشده است.');
  } catch {
    list.innerHTML = own + '<p>جدول آنلاین در دسترس نیست.</p>';
  }
});
button('close-board', () => $('records').close());
button('coach-btn', async () => {
  const t = lastTicket; if (!t) return;
  const btn = $('coach-btn'), out = $('coach-text');
  btn.disabled = true; btn.lastChild.textContent = 'مربی در حال تحلیل…';
  try {
    const r = await api.report(t.runId, t.token);
    if (t !== lastTicket) return;
    out.textContent = r.report;
    const tag = document.createElement('small');
    tag.textContent = r.source === 'ai' ? 'تحلیل هوش مصنوعی · AIaaS آروان (از آمار تأییدشده‌ی همین دور)' : 'تحلیل خودکار از آمار تأییدشده‌ی همین دور';
    out.appendChild(tag);
    out.classList.remove('hidden'); btn.classList.add('hidden');
  } catch { btn.lastChild.textContent = 'تحلیل در دسترس نیست — دوباره تلاش کن'; }
  finally { btn.disabled = false; }
});
button('home-button', () => { game = null; updateMode(); setView('home'); });
button('play', begin);
button('replay', begin);
button('resume', togglePause);
button('pause-button', togglePause);
button('quit', () => { paused = false; game = null; audio.pause(false); setView('home'); });
button('random', () => { seed = `challenge-${Math.random().toString(36).slice(2, 10)}`; els.daily.textContent = 'چالش تازه · مسیر مشترک'; begin(); });

/* ---------- share sheet ---------- */
let shareFormat = 'story', shareMod = null, shareCanvas = null, shareBlob = null, shareFrames = {};
async function buildCard() {
  shareMod ??= await import('./share.js');
  const F = shareMod.FORMATS[shareFormat];
  // Real in-engine frame of the current results scene at the card's aspect ratio.
  const scale = shareFormat === 'wide' ? 0.6 : 0.62;
  shareFrames[shareFormat] ??= render.snapshot(Math.round((shareFormat === 'wide' ? F.w * 0.56 : F.w) * scale), Math.round(F.h * scale));
  const result = lastResult;
  shareCanvas = await shareMod.drawCard(shareFormat, shareFrames[shareFormat], {
    result, seed, title: result.win ? 'فرار کردی!' : 'گیر افتادی!', level: profile.level, chain: result.bestChain,
    url: shareMod.challengeUrl(seed, result), daily: seed.startsWith('daily-'),
  });
  $('share-preview').src = shareCanvas.toDataURL('image/jpeg', 0.85);
  $('share-hint').textContent = F.hint;
  const text = shareMod.shareText(result), url = shareMod.challengeUrl(seed, result);
  $('net-telegram').href = shareMod.networkLink('telegram', text, url);
  $('net-x').href = shareMod.networkLink('x', text, url);
  $('net-whatsapp').href = shareMod.networkLink('whatsapp', text, url);
  shareBlob = await shareMod.cardBlob(shareCanvas);
}
button('share', async () => {
  if (!lastResult) return;
  shareFrames = {};
  $('share-sheet').showModal();
  $('share-preview').removeAttribute('src');
  await buildCard().catch(() => {});
});
for (const tab of document.querySelectorAll('.tab')) tab.addEventListener('click', async () => {
  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t === tab);
  shareFormat = tab.dataset.format;
  audio.play('click', { gain: 0.5 });
  await buildCard().catch(() => {});
});
button('share-image', async () => {
  if (!shareBlob) return;
  try {
    const how = await shareMod.shareImage(shareBlob, shareMod.shareText(lastResult), shareMod.challengeUrl(seed, lastResult), `escape60-${shareFormat}.png`);
    if (how === 'downloaded') $('share-hint').textContent = 'تصویر ذخیره شد — در استوری یا پست بگذار و لینک چالش رو هم بفرست.';
  } catch {}
});
button('save-image', () => { if (shareBlob) shareMod.downloadBlob(shareBlob, `escape60-${shareFormat}.png`); });
button('copy-link', async () => {
  shareMod ??= await import('./share.js');
  const url = shareMod.challengeUrl(seed, lastResult), text = shareMod.shareText(lastResult);
  const label = $('copy-link').querySelector('b');
  try { await navigator.clipboard.writeText(`${text}\n${url}`); label.textContent = 'لینک کپی شد ✓'; }
  catch { label.textContent = url; }
  setTimeout(() => (label.textContent = 'کپی لینک چالش'), 2200);
});
button('close-share', () => $('share-sheet').close());

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
  if ((e.code === 'Space' || e.code === 'Enter') && game?.state === 'ended' && document.body.dataset.view === 'results' && !document.querySelector('dialog[open]')) begin();
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') pressedLeft = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') pressedRight = false;
});
setView('home');
