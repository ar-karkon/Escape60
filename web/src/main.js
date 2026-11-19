import { createGame, stepGame, gameResult, encodeTrace, encodeInput, comboMult, TICK_RATE, MILESTONE_TICKS, SIM_VERSION, COMBO_WINDOW, REPAIRS, SPAWN_COUNT } from './simulation.js';
import { createRenderer } from './render.js';
import { AudioEngine, gearOf } from './audio.js';
import { hydrateIcons, iconSVG } from './ui/icons.js';
import { redrawAtlas } from './gfx/signs.js';
import { loadProfile, saveProfile, applyRun, xpForLevel, missionInfo, parseChallenge, beats, carUnlocked, carLook } from './meta.js';
import { CARS, carById, ratings, PAINTS, LIVERIES } from './cars.js';
import { EFFECTS, ACCENTS } from './gfx/effects.js';
import { stations, sample, pointAt, edges, district, DISTRICTS } from './map.js';
import { t, num, applyI18n, setLang, getLang } from './i18n.js';
import * as api from './api.js';
import { createMinimap } from './ui/minimap.js';
import { createThreats } from './ui/threats.js';

const $ = (id) => document.getElementById(id);
const VERSION = 'v3.3';
/** Seconds of aerial intro + countdown before you get control (skippable with any input). */
const INTRO = 4.8;
hydrateIcons();
applyI18n();
const canvas = $('game'), render = createRenderer(canvas);
const minimap = createMinimap($('minimap'));
const threats = createThreats($('threats'), render);
const audio = new AudioEngine();
const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.body.classList.toggle('no-touch', !touch);
document.fonts?.ready.then(() => redrawAtlas()).catch(() => {});

/* ---------- settings ---------- */
const SET_KEY = 'escape60-settings-v2';
const settings = Object.assign({ shake: true, motion: matchMedia('(prefers-reduced-motion: reduce)').matches, tod: 'sunset', gfx: 'auto' }, (() => { try { return JSON.parse(localStorage.getItem(SET_KEY) || '{}'); } catch { return {}; } })());
const saveSettings = () => { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch {} };
const qs = new URLSearchParams(location.search);
if (qs.get('q') === 'high' || qs.get('q') === 'low') settings.gfx = qs.get('q');
if (qs.get('tod')) settings.tod = qs.get('tod');
render.setTOD(settings.tod);
render.setQuality(settings.gfx);

/* ---------- state ---------- */
const profile = loadProfile();
const daySeed = () => `daily-${new Date().toISOString().slice(0, 10)}`;
const externalSeed = qs.get('seed');
const sanitizedSeed = typeof externalSeed === 'string' && /^[a-zA-Z0-9_-]{2,64}$/.test(externalSeed) ? externalSeed : null;
const initialSeed = sanitizedSeed || daySeed();
const challenge = sanitizedSeed ? parseChallenge(qs) : null;
let seed = initialSeed, game = null, paused = false, runTicket = null, trace = [], last = 0, acc = 0, countdown = 0, countStep = -1;
let lastEvent = -1, finishQueued = false, online = false, lastResult = null, view = 'loading', ready = false;
let frozen = false;
const persisted = (() => { try { return JSON.parse(localStorage.getItem('escape60-bests-' + SIM_VERSION) || '{}'); } catch { return {}; } })();
const input = { left: false, right: false, tl: false, tr: false, brake: false, nitroLatch: false, kb: { brake: false, hand: false, nitro: false }, pad: { x: 0, brake: false, hand: false, nitro: false } };
if (qs.has('capture')) window.__escape60 = { render, freeze: (v) => { frozen = !!v; }, state: () => game && { ticks: game.ticks, state: game.state, hp: game.health, repairs: game.repairs, points: game.points, end: game.end, view }, info: () => render.info(), input,
  map: { sample, pointAt, edges, stations }, game: () => game, override: null,
  /** run n simulation ticks immediately (test tooling) */ fast(n) { countdown = 0; for (let i = 0; i < n && game?.state === 'playing'; i++) tick(); updateHud(0); } };
$('ver').textContent = `${VERSION} · SIM ${SIM_VERSION}`;

const fmtTime = (ms) => { const s = ms / 1000, m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`; };
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const fmtN = (n) => Math.round(n).toLocaleString('en-US');

function applyLook() {
  const c = carById(profile.car), look = carLook(profile, profile.car);
  const p = PAINTS.find((x) => x.id === look.paint);
  render.setCar(c.id, p?.color ?? null, look.livery, null);
  render.setEffects(profile.fx);
}
applyLook();

/* ---------- views ---------- */
function setView(name) {
  view = name;
  if (name !== 'game') document.body.classList.remove('intro');
  document.body.dataset.view = name;
  for (const id of ['loading', 'home', 'garage', 'results', 'hud']) $(id).classList.toggle('hidden', id !== name && !(id === 'hud' && name === 'game'));
  $('controls').classList.toggle('hidden', name !== 'game');
  $('pause').classList.add('hidden');
  if (name === 'home') { renderHome(); audio.setMode('menu'); }
  if (name === 'garage') { renderGarage(); audio.setMode('menu'); }
  if (name === 'results') audio.setMode('results');
}
render.init((p, label) => {
  $('load-fill').style.width = Math.round(p * 100) + '%';
  const map = { roads: 'loadRoads', textures: 'loadTextures', buildings: 'loadBuildings', streets: 'loadStreets', walls: 'loadWalls', props: 'loadProps', done: 'loadDone' };
  $('load-text').textContent = t(map[label] || 'loading');
}).then(() => { ready = true; setView('home'); });

function renderHome() {
  const c = carById(profile.car);
  $('lvl').textContent = `LV ${profile.level}`;
  $('xp-fill').style.width = `${(100 * profile.xp) / xpForLevel(profile.level)}%`;
  $('streak-n').textContent = profile.streak.days || 0;
  $('streak').classList.toggle('hot', profile.streak.days >= 2);
  $('home-cls').textContent = c.cls; $('home-cls').dataset.c = c.cls;
  $('home-car').textContent = c.name; $('home-tag').textContent = c.tag;
  $('home-fx').innerHTML = ['smoke', 'nitro'].map((k) => `<span>${t(k + '_' + profile.fx[k])}</span>`).join('');
  $('mode-label').textContent = sanitizedSeed && seed === initialSeed ? t('friend') : seed.startsWith('daily-') ? t('daily') : t('random');
  const open = profile.missions.list.filter((m) => !m.done).length;
  $('missions-badge').textContent = open; $('missions-badge').classList.toggle('hidden', open === 0);
  if (challenge) { const b = $('challenge-banner'); b.classList.remove('hidden'); b.innerHTML = `<span>${iconSVG('flame')}</span><p>${t('friendBanner', { score: fmtN(challenge.points), time: fmtTime(challenge.timeMs) })}</p>`; }
}

/* ---------- online ---------- */
async function checkOnline() {
  try { const res = await api.today(); online = !!res.seed; $('online-state').textContent = t('online'); $('online-state').className = 'status online'; }
  catch { online = false; $('online-state').textContent = t('offline'); $('online-state').className = 'status'; }
}
checkOnline();

/* ---------- garage ---------- */
let gTab = 'cars', gCar = profile.car;
function renderGarage() {
  $('lvl-g').textContent = `LV ${profile.level}`;
  for (const b of document.querySelectorAll('.tab[data-tab]')) b.classList.toggle('active', b.dataset.tab === gTab);
  for (const b of document.querySelectorAll('.tab-body')) b.classList.toggle('hidden', b.dataset.body !== gTab);
  const c = carById(gCar), unlocked = carUnlocked(profile, c);
  $('g-cls').textContent = c.cls; $('g-cls').dataset.c = c.cls; $('g-name').textContent = c.name; $('g-tag').textContent = c.tag;
  $('g-lock').classList.toggle('hidden', unlocked); $('g-lock').innerHTML = `${iconSVG('lock')}${t('locked', { n: c.level })}`;
  const r = ratings(c);
  $('g-stats').innerHTML = [['statSpeed', r.speed], ['statAccel', r.accel], ['statHandling', r.handling], ['statDrift', r.drift], ['statNitro', r.nitro], ['statArmor', r.armor]]
    .map(([k, v]) => `<div class="stat-row"><span>${t(k)}</span><i><u style="width:${v * 10}%"></u></i></div>`).join('');
  $('car-list').innerHTML = CARS.map((x) => {
    const lk = !carUnlocked(profile, x), look = carLook(profile, x.id), pc = PAINTS.find((p) => p.id === look.paint)?.color ?? x.paint;
    return `<button class="car-card ${x.id === gCar ? 'active' : ''} ${lk ? 'locked' : ''}" data-car="${x.id}"><span class="mini-cls">${x.cls}</span><span class="sw" style="--c:${hex(pc)}"></span><b>${x.name}</b><small>${lk ? iconSVG('lock') + t('locked', { n: x.level }) : x.id === profile.car ? t('selected') : t('select')}</small></button>`;
  }).join('');
  const look = carLook(profile, gCar);
  $('paint-list').innerHTML = PAINTS.map((p) => {
    const lk = p.level > profile.level, col = p.color ?? c.paint;
    return `<button class="swatch ${p.id === 'stock' ? 'stock' : ''} ${look.paint === p.id ? 'active' : ''} ${lk ? 'locked' : ''}" data-paint="${p.id}" data-lvl="${p.level}" style="--c:${hex(col)}" aria-label="${p.id}"></button>`;
  }).join('');
  $('livery-list').innerHTML = LIVERIES.map((l) => `<button class="${look.livery === l.id ? 'active' : ''} ${l.level > profile.level ? 'locked' : ''}" data-livery="${l.id}">${t('liv_' + l.id)}${l.level > profile.level ? ' · ' + t('locked', { n: l.level }) : ''}</button>`).join('');
  const names = { smoke: 'fxSmoke', nitro: 'fxNitro', trail: 'fxTrail', burst: 'fxBurst' };
  $('fx-rows').innerHTML = Object.entries(EFFECTS).map(([cat, list]) => `<div class="fx-row"><p class="label">${t(names[cat])}</p><div class="chips">${list.map((e) => `<button class="${profile.fx[cat] === e.id ? 'active' : ''} ${e.level > profile.level ? 'locked' : ''}" data-fx="${cat}" data-v="${e.id}">${t(cat + '_' + e.id)}${e.level > profile.level ? ' · ' + t('locked', { n: e.level }) : ''}</button>`).join('')}</div></div>`).join('');
  $('accent-list').innerHTML = ACCENTS.map((a) => `<button class="swatch ${profile.fx.accent === a ? 'active' : ''}" data-accent="${a}" style="--c:${hex(a)}"></button>`).join('');
  previewCar();
}
function previewCar() {
  const look = carLook(profile, gCar);
  render.setCar(gCar, PAINTS.find((x) => x.id === look.paint)?.color ?? null, look.livery, null);
}
document.querySelector('.garage-panel').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab[data-tab]');
  if (tab) { gTab = tab.dataset.tab; click(); renderGarage(); return; }
  const card = e.target.closest('[data-car]');
  if (card) {
    gCar = card.dataset.car; click();
    if (carUnlocked(profile, carById(gCar))) { profile.car = gCar; saveProfile(profile); }
    renderGarage(); return;
  }
  const sw = e.target.closest('[data-paint]');
  if (sw && !sw.classList.contains('locked')) { profile.paints[gCar] = { ...carLook(profile, gCar), paint: sw.dataset.paint }; saveProfile(profile); click(); renderGarage(); return; }
  const lv = e.target.closest('[data-livery]');
  if (lv && !lv.classList.contains('locked')) { profile.paints[gCar] = { ...carLook(profile, gCar), livery: lv.dataset.livery }; saveProfile(profile); click(); renderGarage(); return; }
  const f = e.target.closest('[data-fx]');
  if (f && !f.classList.contains('locked')) { profile.fx[f.dataset.fx] = f.dataset.v; saveProfile(profile); render.setEffects(profile.fx); click(); renderGarage(); return; }
  const ac = e.target.closest('[data-accent]');
  if (ac) { profile.fx.accent = Number(ac.dataset.accent); saveProfile(profile); render.setEffects(profile.fx); click(); renderGarage(); }
});
{ // drag to spin the car in the garage
  let dx = null;
  const el = $('garage-drag');
  el.addEventListener('pointerdown', (e) => { dx = e.clientX; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => { if (dx === null) return; render.garageRotate((e.clientX - dx) * 0.012); dx = e.clientX; });
  for (const ty of ['pointerup', 'pointercancel']) el.addEventListener(ty, () => { dx = null; });
}

/* ---------- HUD helpers ---------- */
let shownHp = 100, trailHp = 100, trailHold = 0, shownMult = 1, shownHeat = 0, lastSecond = -1, bestPassed = false, targetPassed = false, msTimer = 0, howtoTimer = 0;
function renderHeat(n) { $('heat').innerHTML = [0, 1, 2, 3, 4].map((i) => `<span class="${i < n ? 'on' : ''}">${iconSVG(i < n ? 'siren' : 'sirenOff')}</span>`).join(''); }
function renderRepairs(n) { $('repairs').innerHTML = Array.from({ length: REPAIRS }, (_, i) => `<span class="${i < n ? '' : 'used'}">${iconSVG('wrench')}</span>`).join(''); }
const pops = $('popups');
function popup(text, sub = '', cls = '') {
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
  const n = pops.childElementCount;
  el.style.top = `${(n % 3) * 46}px`;
  el.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
  pops.appendChild(el);
  setTimeout(() => el.remove(), 1250);
}
let bannerTimer = 0;
function banner(text, cls = '', ms = 1800) { const b = $('banner'); b.textContent = text; b.className = 'banner ' + cls; clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.add('hidden'), ms); }
function vibrate(ms) { try { if (!settings.motion) navigator.vibrate?.(ms); } catch {} }
const click = () => audio.play('click', { gain: 0.5 });

function renderHealth(hp, dt) {
  const v = Math.max(0, Math.min(100, hp));
  $('hp-fill').style.height = v + '%';
  if (v > trailHp) trailHp = v; else if (trailHold > 0) trailHold -= dt; else trailHp = Math.max(v, trailHp - dt * 40);
  $('hp-trail').style.height = trailHp + '%';
  $('hp-num').textContent = Math.ceil(v);
  $('health').dataset.level = v > 60 ? 'ok' : v > 30 ? 'warn' : 'crit';
  $('hurt').classList.toggle('low', v < 30 && game?.state === 'playing');
}
function updateHud(dt) {
  if (!game) return;
  const ms = (game.ticks * 1000) / TICK_RATE, p = game.player;
  $('time').textContent = fmtTime(ms);
  $('score').textContent = fmtN(game.points);
  const over = game.ticks >= MILESTONE_TICKS;
  $('hud').classList.toggle('overtime', over);
  $('time-label').textContent = over ? t('overtime') : t('timeLabel');
  $('mm-count').textContent = over ? '∞' : String(Math.max(0, 60 - Math.floor(ms / 1000)));
  $('mm-label').textContent = over ? t('overtime') : t('mmLeft');
  $('milestone-fill').style.width = `${Math.min(100, (100 * game.ticks) / MILESTONE_TICKS)}%`;
  const kmh = p.v * 3.6, g = gearOf(kmh);
  $('speed').textContent = Math.round(kmh);
  $('gear').textContent = g.gear;
  const rpm = $('rpm-arc'); rpm.style.width = `${g.rpm * 100}%`; rpm.className = p.boost ? 'boost' : g.rpm > 0.85 ? 'red' : '';
  $('nitro-fill').style.height = `${game.nitro * 100}%`;
  $('nitro-num').textContent = Math.round(game.nitro * 100);
  $('nitro-bar').classList.toggle('full', game.nitro > 0.98);
  $('nitro-bar').classList.toggle('on', p.boost);
  $('nitro').classList.toggle('on', input.nitroLatch);
  $('nitro-ring').style.strokeDashoffset = String(360 * (1 - game.nitro));
  $('nitro').classList.toggle('ready', game.nitro > 0.25);
  if (game.health < shownHp - 0.5) { const h = $('health'); h.classList.remove('hit'); void h.offsetWidth; h.classList.add('hit'); trailHold = 0.4; }
  shownHp = game.health;
  renderHealth(game.health, dt);
  if (game.heat !== shownHeat) { shownHeat = game.heat; renderHeat(game.heat); }
  const mult = comboMult(game), m = $('mult-box');
  m.classList.toggle('off', mult < 2); m.dataset.m = mult; $('mult').textContent = `${mult}×`;
  $('chain-fill').style.width = `${(100 * game.comboTimer) / COMBO_WINDOW}%`;
  if (mult > shownMult) { m.classList.remove('pump'); void m.offsetWidth; m.classList.add('pump'); }
  shownMult = mult;
  $('bust').classList.toggle('hidden', game.bust < 0.05 || game.state !== 'playing');
  $('bust-fill').style.width = `${game.bust * 100}%`;
  // nearest pit stop when damaged
  const pa = $('pit-arrow');
  if (game.health < 65 && game.repairs > 0 && game.state === 'playing') {
    let best = null, bd = 1e9;
    for (const s of stations) { const d = Math.hypot(s.x - p.x, s.y - p.y); if (d < bd) { bd = d; best = s; } }
    pa.classList.remove('hidden');
    $('pit-dist').textContent = `${t('pit')} ${Math.round(bd)} m`;
    const rel = Math.atan2(best.y - p.y, best.x - p.x) - p.a;
    pa.querySelector('.arw').style.transform = `rotate(${rel + Math.PI / 4}rad)`;
  } else pa.classList.add('hidden');
}

/* ---------- pursuit reveal (the renderer calls this when a cop first locks onto your tail) ---------- */
render.onReveal = () => { if (view !== 'game') return; banner(t('tailBanner'), '', 1900); audio.sirenWhoop(); audio.duckMusic(0.5, 900); vibrate(35); };

/* ---------- run flow ---------- */
/** Every run starts somewhere new in the city (a friend challenge starts where the friend did). */
let lastSpawn = -1;
const fixedSpawn = qs.has('capture') && /^\d{1,3}$/.test(qs.get('spawn') || '') ? Number(qs.get('spawn')) : null;
function pickSpawn() {
  if (fixedSpawn !== null) return fixedSpawn % SPAWN_COUNT;
  if (challenge && seed === initialSeed && Number.isInteger(challenge.spawn) && challenge.spawn < SPAWN_COUNT) return challenge.spawn;
  let k = Math.floor(Math.random() * SPAWN_COUNT);
  if (k === lastSpawn) k = (k + 1 + Math.floor(Math.random() * (SPAWN_COUNT - 1))) % SPAWN_COUNT;
  return (lastSpawn = k);
}
function begin() {
  if (!ready) return;
  audio.unlock();
  applyLook();
  const spawn = pickSpawn();
  game = createGame(seed, { car: profile.car, spawn });
  trace = []; paused = false; finishQueued = false; input.nitroLatch = false; input.brake = false; lastEvent = -1; runTicket = null; countdown = INTRO; countStep = -1; acc = 0;
  $('countdown').classList.add('hidden');
  placeId = district(game.player.x, game.player.y); placeCand = placeId; placeT = 0; introWhoosh = false;
  showPlace(placeId, true);
  shownHp = 100; trailHp = 100; trailHold = 0; shownMult = 1; shownHeat = 0; lastSecond = -1; msTimer = 0;
  bestPassed = !persisted[seed]; targetPassed = !challenge || seed !== initialSeed;
  pops.textContent = ''; $('banner').classList.add('hidden'); $('milestone').classList.add('hidden');
  renderRepairs(REPAIRS); renderHeat(1);
  setView('game');
  updateHud(0);
  if (online) { const started = game; api.startRun(seed, profile.car, spawn).then((r) => { if (game === started && !finishQueued) runTicket = r; }).catch(() => {}); }
  audio.nextChaseTrack(); audio.setMode('chase');
  if (profile.runs < 3) { const h = $('howto'); h.innerHTML = `<b>${t('howTo')}</b><br>${touch ? t('howTouch') : t('howKeys')}<br>${t('howGoal')}`; h.classList.remove('hidden'); clearTimeout(howtoTimer); howtoTimer = setTimeout(() => h.classList.add('hidden'), 6500); }
  last = performance.now();
}
function skipCountdown() { if (countdown > 0.6) countdown = 0.6; }
/* ---------- location card: the district you start in (big, during the intro) or drive into ---------- */
let placeId = -1, placeCand = -1, placeT = 0, placeTimer = 0, introWhoosh = false;
function showPlace(id, intro = false) {
  const el = $('place');
  el.innerHTML = `<small>${t('city')}</small><b>${t('d_' + DISTRICTS[id])}</b>${intro ? `<i>${t('skipIntro')}</i>` : ''}`;
  el.className = 'place' + (intro ? ' intro' : ' mini');
  clearTimeout(placeTimer);
  if (!intro) placeTimer = setTimeout(() => el.classList.add('out'), 2300);
}
function hidePlace() { const el = $('place'); if (!el.classList.contains('hidden') && !el.classList.contains('out')) el.classList.add('out'); }
function trackPlace(dt) {
  const p = game.player, id = district(p.x, p.y);
  if (id === placeId) { placeCand = id; placeT = 0; return; }
  if (id !== placeCand) { placeCand = id; placeT = 0; return; }
  placeT += dt;
  if (placeT > 0.8) { placeId = id; showPlace(id); }
}
function showCount(step) {
  if (step === countStep) return;
  countStep = step;
  const el = $('countdown');
  if (step < 0) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  if (step < 3) { el.innerHTML = `<b>${3 - step}</b>`; audio.play('beep', { gain: 0.8 }); }
  else { el.innerHTML = `<b class="go">${t('go')}</b>`; audio.play('go'); setTimeout(() => { if (countStep === 3) el.classList.add('hidden'); }, 650); }
}
function currentInput() {
  if (window.__escape60?.override) return window.__escape60.override(game);
  const touchSteer = (input.tl ? -1 : 0) + (input.tr ? 1 : 0);
  const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0) + touchSteer;
  const s = Math.abs(input.pad.x) > 0.15 ? input.pad.x : Math.max(-1, Math.min(1, steer));
  // touch: the brake button drifts (handbrake) while you steer, and brakes when you go straight
  const touchHand = input.brake && touchSteer !== 0, touchBrake = input.brake && touchSteer === 0;
  if (input.nitroLatch && game && game.nitro <= 0.002) input.nitroLatch = false;
  return encodeInput(Math.round(s * 3), touchBrake || input.kb.brake || input.pad.brake, touchHand || input.kb.hand || input.pad.hand, input.nitroLatch || input.kb.nitro || input.pad.nitro);
}
let wasBoost = false;
function tick() {
  if (!game || paused || game.state !== 'playing') return;
  const v = currentInput();
  trace.push(v);
  stepGame(game, v);
  const p = game.player;
  if (p.boost && !wasBoost) { audio.nitroBurst(); vibrate(15); }
  wasBoost = p.boost;
  const e = game.events;
  for (let i = lastEvent + 1; i < e.length; i++) onEvent(e[i]);
  lastEvent = e.length - 1;
  if (e.length > 200) { e.splice(0, e.length - 50); lastEvent = e.length - 1; }
  const ms = (game.ticks * 1000) / TICK_RATE;
  if (!bestPassed && persisted[seed] && game.points > persisted[seed].points) { bestPassed = true; popup(t('newRecord'), '', 'good'); audio.play('levelup', { gain: 0.6 }); }
  if (!targetPassed && game.points > challenge.points) { targetPassed = true; popup(t('friendWon'), '', 'hot'); audio.play('levelup'); }
  const sec = Math.floor(ms / 1000);
  if (sec !== lastSecond) { lastSecond = sec; if (sec >= 55 && sec < 60) audio.play('beep', { rate: 1 + (sec - 55) * 0.1, gain: 0.7 }); }
  if (game.state === 'ended') finish();
}
function onEvent(ev) {
  switch (ev.type) {
    case 'near': case 'dodge': {
      const m = ev.mult || 1;
      popup(`+${fmtN(ev.pts)}`, ev.type === 'dodge' ? t('dodge') : ev.cop ? t('nearCop') : t('near'), m >= 3 ? 'hot' : '');
      audio.play('near', { rate: 1 + 0.08 * (m - 1), gain: 0.7 }); audio.play('whoosh', { gain: 0.6, rate: 0.9 + Math.random() * 0.2 });
      if (m >= 2) audio.play('combo', { rate: 0.85 + 0.08 * m, gain: 0.55, delay: 0.05 });
      vibrate(m >= 3 ? 25 : 12); break;
    }
    case 'drift': popup(`+${fmtN(ev.pts)}`, `${t('drift')}${ev.mult > 1 ? ' ×' + ev.mult : ''}`, 'drift'); audio.play('coin', { gain: 0.4, rate: 1.1 }); break;
    case 'driftLost': popup(`-${fmtN(ev.pts)}`, t('driftLost'), 'bad'); break;
    case 'takedown': popup(`+${fmtN(ev.pts)}`, t('takedown'), 'take'); audio.play('crash', { gain: 0.8 }); audio.explosion(0.55); audio.play('combo', { delay: 0.15, gain: 0.6 }); vibrate(60); break;
    case 'hit': {
      popup(`-${ev.dmg}`, '', 'bad');
      audio.play('crash', { gain: Math.min(1, 0.35 + ev.dmg / 40) }); audio.duckMusic(0.45, 400); vibrate(30 + ev.dmg * 2);
      const h = $('hurt'); h.classList.remove('on'); void h.offsetWidth; h.classList.add('on'); break;
    }
    case 'scrape': audio.play('scrape', { gain: 0.5 }); vibrate(10); break;
    case 'repair': popup(`+${ev.gained}`, ev.left > 0 ? t('repaired', { n: ev.left }) : t('repairedLast'), 'good'); renderRepairs(ev.left); audio.repairSound(); audio.play('levelup', { gain: 0.4, delay: 0.3 }); vibrate(30); break;
    case 'repairEmpty': banner(t('noRepairs'), '', 1600); audio.play('beep', { rate: 0.6 }); break;
    case 'roadblock': banner(t('roadblock') + (ev.spike ? ' · ' + t('spikes') : '')); for (let k = 0; k < 3; k++) audio.play('beep', { delay: k * 0.14, rate: 1.4 }); break;
    case 'spikes': popup('!!', t('spikes'), 'bad'); audio.play('scrape', { gain: 0.9, rate: 1.5 }); break;
    case 'heat': if (ev.heat > 1) { banner(t('heatUp', { n: ev.heat }), 'info', 1400); audio.play('busted', { gain: 0.35, rate: 1.3 }); } break;
    case 'milestone': {
      const ms = $('milestone'); ms.classList.remove('hidden', 'out');
      $('ms-score').textContent = fmtN(ev.points);
      const best = persisted[seed]; $('ms-best').textContent = best ? fmtN(best.points) : '—';
      audio.play('win'); audio.play('levelup', { delay: 0.4 }); audio.duckMusic(0.3, 1500); vibrate(80);
      clearTimeout(msTimer); msTimer = setTimeout(() => { ms.classList.add('out'); setTimeout(() => ms.classList.add('hidden'), 600); }, 3200);
      break;
    }
    case 'wrecked': audio.explosion(1.2); audio.duckMusic(0.15, 1800); vibrate(200); break;
    case 'busted': audio.play('busted'); audio.duckMusic(0.2, 1200); break;
    default: break;
  }
  if (ev.type === 'police' && ev.tick > 5) audio.play('horn', { gain: 0.25, rate: 0.8 });
}
function finish() {
  if (finishQueued) return;
  finishQueued = true;
  updateHud(0);
  const r = gameResult(game);
  lastResult = r;
  const prev = persisted[seed];
  const newBest = !prev || r.points > prev.points;
  if (newBest) { persisted[seed] = r; try { localStorage.setItem('escape60-bests-' + SIM_VERSION, JSON.stringify(persisted)); } catch {} }
  const meta = applyRun(profile, r);
  const end = r.end || 'legend';
  const res = $('results');
  res.classList.remove('wrecked', 'busted', 'legend'); res.classList.add(end);
  $('res-tag').textContent = end.toUpperCase(); $('res-title').textContent = t(end); $('res-sub').textContent = t(end + 'Sub');
  $('res-score').textContent = fmtN(r.points);
  $('res-time').textContent = fmtTime(r.timeMs);
  $('res-best').classList.toggle('hidden', !(newBest && prev));
  $('res-escaped').classList.toggle('hidden', !r.escaped);
  $('res-stats').innerHTML = [['topSpeed', 'speed', `${r.topSpeed}`], ['driftPts', 'drift', fmtN(r.driftPts)], ['nearMisses', 'combo', `${r.near}`], ['takedowns', 'siren', `${r.takedowns}`], ['bestChain', 'flame', `${r.bestChain}×`], ['repairsUsed', 'wrench', `${r.repairs}/${REPAIRS}`]]
    .map(([k, ic, v]) => `<div class="stat"><span class="stat-ico">${iconSVG(ic)}</span><small>${t(k)}</small><strong>${v}</strong></div>`).join('');
  $('lvl2').textContent = `LV ${meta.level}`; $('xp-gain').textContent = `+${fmtN(meta.gained)} XP`;
  $('xp-fill2').style.width = '0%';
  setTimeout(() => ($('xp-fill2').style.width = `${(100 * profile.xp) / xpForLevel(profile.level)}%`), 400);
  const notes = [];
  if (meta.levelUp) notes.push(t('levelUp', { n: meta.level }));
  for (const c of meta.unlocks.cars) notes.push(t('newCar', { name: c.name }));
  if (meta.unlocks.paints) notes.push(t('newPaint'));
  for (const f of meta.unlocks.fx) notes.push(t('newFx', { name: t(f) }));
  for (const m of meta.completed) notes.push('✓ ' + t('m_' + m));
  $('res-unlocks').classList.toggle('hidden', !notes.length); $('res-unlocks').textContent = notes.join('  ·  ');
  if (challenge && seed === initialSeed) { const won = beats(r, challenge), el = $('challenge-result'); el.className = 'challenge-result ' + (won ? 'won' : 'lost'); el.textContent = won ? t('friendWon') : t('friendLost', { n: num(challenge.points - r.points) }); }
  else $('challenge-result').className = 'challenge-result hidden';
  $('rank').textContent = runTicket ? t('rankPending') : t('rankLocal');
  if (end === 'legend') audio.play('win'); else if (end === 'busted') audio.play('busted');
  if (meta.levelUp) audio.play('levelup', { delay: 1.2 });
  setTimeout(() => { if (game?.state === 'ended' && view === 'game') setView('results'); }, end === 'wrecked' ? 2600 : 1300);
  if (runTicket) {
    const finished = game;
    api.finishRun(runTicket.runId, runTicket.token, encodeTrace(trace), r).then((x) => {
      if (game !== finished) return;
      $('rank').textContent = x.rank ? t('rankDone', { rank: num(x.rank), of: num(x.of) }) : t('rankSaved');
    }).catch(() => { if (game === finished) $('rank').textContent = t('rankFail'); });
  }
}

/* ---------- main loop ---------- */
let wasDown = false;
function frame(now) {
  if (!last) last = now;
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  pollPad();
  if (!paused && !frozen && game?.state === 'playing' && view === 'game') {
    if (countdown > 0) {
      countdown -= dt;
      showCount(countdown > 3 ? -1 : countdown > 2 ? 0 : countdown > 1 ? 1 : countdown > 0 ? 2 : 3);
      document.body.classList.toggle('intro', countdown > 3);
      if (countdown < 2.6) hidePlace();
      if (!introWhoosh && countdown < INTRO - 1.1) { introWhoosh = true; audio.play('whoosh', { gain: 0.55, rate: 0.55 }); }
      acc = 0;
    } else {
      if (countStep < 3) { showCount(3); hidePlace(); document.body.classList.remove('intro'); }
      acc = Math.min(acc + dt * render.timeScale, 0.25);
      let steps = 0;
      while (acc >= 1 / TICK_RATE && steps < 15) { tick(); acc -= 1 / TICK_RATE; steps++; }
    }
    if (game && game.ticks % 2 === 0) updateHud(dt);
    if (game && countdown <= 0 && game.state === 'playing') trackPlace(dt);
  }
  // audio mix
  const p = game?.player, playing = game?.state === 'playing' && !paused && countdown <= 0 && view === 'game';
  let siren = 0, pan = 0, close = false;
  if (game && p) {
    let best = Infinity, bx = 0, by = 0;
    for (const c of game.police) { if (c.wreck) continue; const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < best) { best = d; bx = c.x - p.x; by = c.y - p.y; } }
    if (best < Infinity) { siren = Math.pow(Math.max(0, 1 - best / 260), 1.3); pan = Math.max(-0.85, Math.min(0.85, Math.sin(Math.atan2(by, bx) - p.a))); close = best < 40; }
    const down = p.brake && p.v > 30;
    if (down && !wasDown) audio.backfire();
    wasDown = down;
  }
  const kmh = p ? p.v * 3.6 : 0, g = gearOf(kmh);
  audio.update({ active: playing, speed: p ? p.v / 70 : 0, rpm: g.rpm, gear: g.gear, drift: p ? Math.min(1, Math.abs(p.slip) * 1.6) * (p.v > 12 ? 1 : 0) : 0, brake: p && p.brake && p.v > 12 ? 1 : 0, nitro: !!p?.boost && playing, siren, sirenPan: pan, close, heli: game ? game.heat >= 4 : false });
  if (game && view === 'game') minimap.draw(game, now);
  const mode = view === 'garage' ? 'garage' : view === 'game' || view === 'results' ? 'game' : 'menu';
  render.frame(view === 'game' || view === 'results' ? game : null, now, { mode, alpha: acc * TICK_RATE, countdown: Math.max(0, countdown), introTotal: INTRO, reduced: settings.motion, shakeOn: settings.shake });
  threats.draw(game, now, { active: view === 'game' && !paused, reduced: settings.motion, tail: t('copBehind'), you: t('you') });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function togglePause(force) {
  if (!game || game.state !== 'playing' || view !== 'game') return;
  paused = force ?? !paused;
  $('pause').classList.toggle('hidden', !paused);
  last = performance.now(); acc = 0;
  audio.pause(paused);
}
window.addEventListener('visibilitychange', () => { if (document.hidden && game?.state === 'playing' && !paused) togglePause(true); });
for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, () => audio.unlock(), { capture: true, passive: true });

/* ---------- buttons ---------- */
function button(id, fn) { $(id).addEventListener('click', () => { click(); fn(); }); }
button('play', begin);
button('garage-race', () => { if (!carUnlocked(profile, carById(gCar))) { gCar = profile.car; } begin(); });
button('replay', begin);
button('garage-open', () => { gCar = profile.car; setView('garage'); });
button('res-garage', () => { gCar = profile.car; game = null; setView('garage'); });
button('garage-back', () => { applyLook(); setView('home'); });
button('home-button', () => { game = null; applyLook(); setView('home'); });
button('resume', () => togglePause(false));
button('pause-btn', () => togglePause(true));
button('restart', () => { togglePause(false); begin(); });
button('quit', () => { paused = false; game = null; audio.pause(false); applyLook(); setView('home'); $('place').className = 'place hidden'; });
button('pause-settings', () => openSettings());
button('settings-open', () => openSettings());
button('close-config', () => $('config').close());
button('credits-open', () => $('credits').showModal());
button('close-credits', () => $('credits').close());
button('missions-open', () => { renderMissions(); $('missions').showModal(); });
button('close-missions', () => $('missions').close());
button('daily-play', () => { $('missions').close(); seed = daySeed(); begin(); });
button('board-open', openBoard);
button('close-board', () => $('records').close());

function openSettings() {
  const seg = (id, v) => { for (const b of $(id).querySelectorAll('button')) b.classList.toggle('active', b.dataset.v === v); };
  seg('lang-seg', getLang()); seg('tod-seg', settings.tod); seg('gfx-seg', settings.gfx);
  $('music-toggle').checked = audio.musicOn; $('sfx-toggle').checked = audio.sfxOn; $('shake-toggle').checked = settings.shake; $('motion').checked = settings.motion;
  $('config').showModal();
}
$('lang-seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; setLang(b.dataset.v); click(); openSettings(); if (view === 'home') renderHome(); if (view === 'garage') renderGarage(); checkOnline(); });
$('tod-seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; settings.tod = b.dataset.v; saveSettings(); render.setTOD(settings.tod); click(); openSettings(); });
$('gfx-seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; settings.gfx = b.dataset.v; saveSettings(); render.setQuality(settings.gfx); click(); openSettings(); });
$('music-toggle').onchange = () => audio.setMusicEnabled($('music-toggle').checked);
$('sfx-toggle').onchange = () => audio.setSfxEnabled($('sfx-toggle').checked);
$('shake-toggle').onchange = () => { settings.shake = $('shake-toggle').checked; saveSettings(); };
$('motion').onchange = () => { settings.motion = $('motion').checked; saveSettings(); };

function renderMissions() {
  $('mission-list').innerHTML = profile.missions.list.map((m) => {
    const info = missionInfo(m), pct = Math.min(100, (100 * m.progress) / info.goal);
    return `<li class="${m.done ? 'done' : ''}"><span>${iconSVG(m.done ? 'check' : 'star')}</span><b>${t('m_' + m.id)}</b><small>${m.done ? t('done') : `${fmtN(Math.min(m.progress, info.goal))}/${fmtN(info.goal)}`}</small><i><u style="width:${pct}%"></u></i></li>`;
  }).join('');
}
async function openBoard() {
  const list = $('entries');
  list.textContent = '…';
  $('records').showModal();
  const mine = persisted[seed];
  const own = mine ? `<p class="own">${t('lbYou', { score: num(mine.points), time: fmtTime(mine.timeMs) })}</p>` : '';
  try {
    const { entries } = await api.leaderboard(seed);
    list.innerHTML = own + (entries.length ? entries.map((r, i) => `<div class="row"><b>#${i + 1}</b><span class="who">${String(r.label || '').replace(/[<>&"]/g, '')} · ${String(carById(r.car).name)}</span><span>${fmtTime(r.timeMs)}</span><b>${fmtN(r.points)}</b></div>`).join('') : `<p>${t('lbEmpty')}</p>`);
  } catch { list.innerHTML = own + `<p>${t('lbOff')}</p>`; }
}

/* ---------- share ---------- */
let shareFormat = 'story', shareMod = null, shareBlob = null, shareFrames = {};
async function buildCard() {
  shareMod ??= await import('./share.js');
  const F = shareMod.FORMATS[shareFormat];
  shareFrames[shareFormat] ??= render.snapshot(Math.round(F.w * 0.6), Math.round(F.h * 0.6));
  const r = lastResult, car = carById(r.car);
  const cv = await shareMod.drawCard(shareFormat, shareFrames[shareFormat], { result: r, car: car.name, title: t(r.end || 'legend'), level: profile.level, url: shareMod.challengeUrl(seed, r), labels: { score: t('score'), time: t('survived'), top: t('topSpeed'), td: t('takedowns') }, fa: getLang() === 'fa' });
  $('share-preview').src = cv.toDataURL('image/jpeg', 0.85);
  const text = t('shareText', { time: fmtTime(r.timeMs), score: num(r.points), car: car.name }), url = shareMod.challengeUrl(seed, r);
  $('net-telegram').href = shareMod.networkLink('telegram', text, url);
  $('net-x').href = shareMod.networkLink('x', text, url);
  $('net-whatsapp').href = shareMod.networkLink('whatsapp', text, url);
  shareBlob = await shareMod.cardBlob(cv);
}
button('share', async () => { if (!lastResult) return; shareFrames = {}; $('share-sheet').showModal(); $('share-preview').removeAttribute('src'); await buildCard().catch(() => {}); });
for (const tab of document.querySelectorAll('.tab.fmt')) tab.addEventListener('click', async () => {
  for (const x of document.querySelectorAll('.tab.fmt')) x.classList.toggle('active', x === tab);
  shareFormat = tab.dataset.format; click(); await buildCard().catch(() => {});
});
button('share-image', async () => { if (!shareBlob) return; const car = carById(lastResult.car); try { await shareMod.shareImage(shareBlob, t('shareText', { time: fmtTime(lastResult.timeMs), score: num(lastResult.points), car: car.name }), shareMod.challengeUrl(seed, lastResult), `escape60-${shareFormat}.png`); } catch {} });
button('save-image', () => { if (shareBlob) shareMod.downloadBlob(shareBlob, `escape60-${shareFormat}.png`); });
button('copy-link', async () => {
  shareMod ??= await import('./share.js');
  const url = shareMod.challengeUrl(seed, lastResult), label = $('copy-link').querySelector('b');
  try { await navigator.clipboard.writeText(url); label.textContent = t('copied'); } catch { label.textContent = url; }
  setTimeout(() => (label.textContent = t('copyLink')), 2200);
});
button('close-share', () => $('share-sheet').close());

/* ---------- input ---------- */
/* touch: hold the left / right half of the screen to steer; brake (drift while steering); tap nitro to boost */
const zone = $('steer-zone'), touches = new Map();
function updateTouchSteer() {
  let l = false, r = false;
  for (const side of touches.values()) { if (side < 0) l = true; else r = true; }
  input.tl = l; input.tr = r;
  $('hint-left').classList.toggle('on', l); $('hint-right').classList.toggle('on', r);
}
const sideOf = (e) => (e.clientX < window.innerWidth / 2 ? -1 : 1);
zone.addEventListener('pointerdown', (e) => { e.preventDefault(); try { zone.setPointerCapture(e.pointerId); } catch {} touches.set(e.pointerId, sideOf(e)); skipCountdown(); updateTouchSteer(); });
zone.addEventListener('pointermove', (e) => { if (!touches.has(e.pointerId)) return; touches.set(e.pointerId, sideOf(e)); updateTouchSteer(); });
for (const ty of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(ty, (e) => { touches.delete(e.pointerId); updateTouchSteer(); });
{
  const b = $('brake');
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch {} skipCountdown(); input.brake = true; b.classList.add('down'); });
  for (const ty of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ty, () => { input.brake = false; b.classList.remove('down'); });
  const n = $('nitro');
  n.addEventListener('pointerdown', (e) => { e.preventDefault(); skipCountdown(); if (game && (game.nitro > 0.05 || input.nitroLatch)) { input.nitroLatch = !input.nitroLatch; vibrate(12); } });
}
const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
window.addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  if (KEYS[e.code]) { input[KEYS[e.code]] = true; skipCountdown(); }
  if (e.code === 'ArrowDown' || e.code === 'KeyS') input.kb.brake = true;
  if (e.code === 'Space') input.kb.hand = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'KeyN') input.kb.nitro = true;
  if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat && view === 'game') togglePause();
  if ((e.code === 'Enter' || e.code === 'KeyR') && view === 'results' && !document.querySelector('dialog[open]')) begin();
  if (e.code === 'Enter' && view === 'home' && !document.querySelector('dialog[open]')) begin();
});
window.addEventListener('keyup', (e) => {
  if (KEYS[e.code]) input[KEYS[e.code]] = false;
  if (e.code === 'ArrowDown' || e.code === 'KeyS') input.kb.brake = false;
  if (e.code === 'Space') input.kb.hand = false;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'KeyN') input.kb.nitro = false;
});
window.addEventListener('blur', () => { for (const k of ['left', 'right', 'tl', 'tr', 'brake', 'nitroLatch']) input[k] = false; touches.clear(); input.kb = { brake: false, hand: false, nitro: false }; });
let padStart = false;
function pollPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = [...pads].find((x) => x && x.connected);
  if (!gp) { input.pad.x = 0; input.pad.brake = input.pad.hand = input.pad.nitro = false; return; }
  const b = (i) => !!gp.buttons[i]?.pressed || (gp.buttons[i]?.value || 0) > 0.4;
  input.pad.x = Math.abs(gp.axes[0]) > 0.15 ? gp.axes[0] : b(14) ? -1 : b(15) ? 1 : 0;
  input.pad.brake = b(6) || b(1); input.pad.hand = b(0); input.pad.nitro = b(7) || b(2) || b(5);
  if (input.pad.x || input.pad.hand || input.pad.nitro) skipCountdown();
  const st = b(9);
  if (st && !padStart) { if (view === 'game') togglePause(); else if (view === 'home' || view === 'results') begin(); }
  padStart = st;
}
setView('loading');
