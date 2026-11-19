/* Client-side progression: XP, levels, car / paint / effect unlocks, garage choices, daily missions,
   day streak and friend-challenge targets. Cosmetic choices never touch the simulation; the car choice
   does (its stats), and it is sent with the run for the authoritative replay.
   Stored in localStorage on this device; no accounts and no personal data. */
import { hashSeed } from './simulation.js';
import { CARS, PAINTS, LIVERIES } from './cars.js';
import { EFFECTS, ACCENTS } from './gfx/effects.js';

const KEY = 'escape60-profile-v2';
const MISSIONS = [
  { id: 'escape', goal: 1, stat: (r) => (r.escaped ? 1 : 0) },
  { id: 'survive90', goal: 90, stat: (r) => Math.floor(r.timeMs / 1000) },
  { id: 'near8', goal: 8, stat: (r) => r.near },
  { id: 'drift3k', goal: 3000, stat: (r) => r.driftPts },
  { id: 'takedown1', goal: 1, stat: (r) => r.takedowns },
  { id: 'takedown3', goal: 3, stat: (r) => r.takedowns },
  { id: 'chain5', goal: 5, stat: (r) => r.bestChain },
  { id: 'speed250', goal: 250, stat: (r) => r.topSpeed },
  { id: 'repair', goal: 1, stat: (r) => r.repairs },
  { id: 'score10k', goal: 10000, stat: (r) => r.points },
  { id: 'runs3', goal: 3, stat: () => 1, sum: true },
  { id: 'dodge', goal: 1, stat: (r) => r.dodges },
];
const today = () => new Date().toISOString().slice(0, 10);
export const xpForLevel = (n) => 600 + 300 * (n - 1);

export function loadProfile() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
  p.xp ??= 0; p.level ??= 1; p.runs ??= 0; p.car ??= 'kaze'; p.paints ??= {};
  p.fx ??= { smoke: 'clean', nitro: 'blue', trail: 'tail', burst: 'graffiti', accent: ACCENTS[0] };
  p.streak ??= { last: '', days: 0 }; p.best ??= { points: 0, timeMs: 0 };
  if (!CARS.some((c) => c.id === p.car && c.level <= p.level)) p.car = 'kaze';
  refreshMissions(p);
  return p;
}
export function saveProfile(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} }
function refreshMissions(p) {
  const d = today();
  if (p.missions?.date === d) return;
  const h = hashSeed('missions-' + d);
  const picks = [];
  for (let i = 0; picks.length < 3; i++) { const m = MISSIONS[(h + i * 7 + (h >>> (i % 16))) % MISSIONS.length]; if (!picks.includes(m.id)) picks.push(m.id); }
  p.missions = { date: d, list: picks.map((id) => ({ id, progress: 0, done: false })) };
}
export function missionInfo(m) { const def = MISSIONS.find((x) => x.id === m.id); return { ...m, goal: def.goal }; }
export const carUnlocked = (p, c) => c.level <= p.level;
export function carLook(p, id) { const l = p.paints[id] || {}; return { paint: l.paint ?? 'stock', livery: l.livery ?? 'clean' }; }

/** Apply a finished run. Returns a summary for the results screen. */
export function applyRun(p, r) {
  refreshMissions(p);
  const d = today(), yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  let streakUp = false;
  if (p.streak.last !== d) { p.streak.days = p.streak.last === yesterday ? p.streak.days + 1 : 1; p.streak.last = d; streakUp = true; }
  const completed = [];
  for (const m of p.missions.list) {
    if (m.done) continue;
    const def = MISSIONS.find((x) => x.id === m.id), v = def.stat(r);
    m.progress = def.sum ? m.progress + v : Math.max(m.progress, v);
    if (m.progress >= def.goal) { m.done = true; completed.push(m.id); }
  }
  const base = Math.floor(r.timeMs / 100) + Math.floor(r.points / 20) + r.takedowns * 60 + r.near * 10 + (r.escaped ? 300 : 0);
  const streakBonus = Math.min(0.5, (p.streak.days - 1) * 0.1);
  const gained = Math.round(base * (1 + streakBonus)) + completed.length * 300;
  const before = p.level, unlocks = { cars: [], paints: false, fx: [] };
  p.xp += gained;
  while (p.xp >= xpForLevel(p.level)) {
    p.xp -= xpForLevel(p.level); p.level++;
    for (const c of CARS) if (c.level === p.level) unlocks.cars.push(c);
    if (PAINTS.some((x) => x.level === p.level) || LIVERIES.some((x) => x.level === p.level)) unlocks.paints = true;
    for (const [cat, list] of Object.entries(EFFECTS)) for (const e of list) if (e.level === p.level) unlocks.fx.push(cat + '_' + e.id);
  }
  p.runs++;
  const newBest = r.points > p.best.points;
  if (newBest) p.best = { points: r.points, timeMs: r.timeMs };
  saveProfile(p);
  return { gained, levelUp: p.level > before, level: p.level, unlocks, completed, streak: p.streak.days, streakUp };
}

/** Friend challenge carried in the link: ?seed=…&c=<timeMs>.<points>. Unverified by design. */
export function parseChallenge(qs) {
  const c = qs.get('c');
  if (!c || !/^\d{1,6}\.\d{1,7}$/.test(c)) return null;
  const [t, pts] = c.split('.').map(Number);
  if (t > 600000) return null;
  return { timeMs: t, points: pts };
}
export function beats(r, target) { return r.points > target.points || (r.points === target.points && r.timeMs > target.timeMs); }
