/* Client-side progression: XP, levels, cosmetic paint unlocks, daily missions, day streak and
   friend-challenge targets. Cosmetic only — it never touches the simulation or ranking.
   Stored in localStorage on this device; no accounts and no personal data. */
import { hashSeed } from './simulation.js';

const KEY = 'escape60-profile-v1';
export const PAINTS = [
  { id: 'sunset', name: 'نارنجی غروب', body: 0xff873c, stripe: 0xfff1de, level: 1 },
  { id: 'flamingo', name: 'صورتی فلامینگو', body: 0xff5d95, stripe: 0xfff1de, level: 2 },
  { id: 'lagoon', name: 'فیروزه‌ای تالاب', body: 0x19b8bc, stripe: 0x111633, level: 3 },
  { id: 'violet', name: 'بنفش نیمه‌شب', body: 0x7a3df0, stripe: 0x3dd8e7, level: 4 },
  { id: 'gold', name: 'طلای ساحل', body: 0xffc93c, stripe: 0x2a1240, level: 5 },
  { id: 'night', name: 'شب مخملی', body: 0x23203a, stripe: 0xff5d95, level: 6 },
  { id: 'ice', name: 'یخ نئونی', body: 0xe9f4ff, stripe: 0x3f98ff, level: 8 },
  { id: 'lava', name: 'گدازه', body: 0xe0221f, stripe: 0xffe37c, level: 10 },
];
const MISSIONS = [
  { id: 'near5', text: '۵ جاخالی در یک دور', goal: 5, stat: (r) => r.closeCalls },
  { id: 'near10', text: '۱۰ جاخالی در یک دور', goal: 10, stat: (r) => r.closeCalls },
  { id: 'chain3', text: 'ضریب ×۳ بگیر', goal: 3, stat: (r) => r.bestChain },
  { id: 'chain5', text: 'ضریب ×۵ بگیر', goal: 5, stat: (r) => r.bestChain },
  { id: 'survive40', text: '۴۰ ثانیه دوام بیاور', goal: 40, stat: (r) => Math.floor(r.timeMs / 1000) },
  { id: 'win', text: '۶۰ ثانیه کامل فرار کن', goal: 1, stat: (r) => (r.win ? 1 : 0) },
  { id: 'clean', text: 'با بیش از ۷۵٪ سلامت فرار کن', goal: 1, stat: (r) => (r.win && r.health >= 75 ? 1 : 0) },
  { id: 'noscrape', text: 'یک دور بدون مالیدن به دیوار', goal: 1, stat: (r) => (r.timeMs >= 30000 && !r.scrapes ? 1 : 0) },
  { id: 'dodge', text: 'از کنار یک راه‌بند جاخالی بده', goal: 1, stat: (r) => r.dodges || 0 },
  { id: 'score600', text: '۶۰۰ امتیاز در یک دور', goal: 600, stat: (r) => r.points },
  { id: 'runs3', text: '۳ دور بازی کن', goal: 3, stat: () => 1, sum: true },
];
const today = () => new Date().toISOString().slice(0, 10);
export const xpForLevel = (n) => 400 + 260 * (n - 1);

export function loadProfile() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
  p.xp ??= 0; p.level ??= 1; p.runs ??= 0; p.wins ??= 0; p.paint ??= 'sunset';
  p.bestChain ??= 0; p.streak ??= { last: '', days: 0 };
  refreshMissions(p);
  return p;
}
export function saveProfile(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} }
function refreshMissions(p) {
  const d = today();
  if (p.missions?.date === d) return;
  const h = hashSeed('missions-' + d);
  const picks = [];
  for (let i = 0; picks.length < 3; i++) {
    const m = MISSIONS[(h + i * 7 + (h >>> (i % 16))) % MISSIONS.length];
    if (!picks.includes(m.id)) picks.push(m.id);
  }
  p.missions = { date: d, list: picks.map((id) => ({ id, progress: 0, done: false })) };
}
export function missionInfo(m) { const def = MISSIONS.find((x) => x.id === m.id); return { ...m, text: def.text, goal: def.goal }; }
export const unlockedPaints = (p) => PAINTS.filter((x) => x.level <= p.level);
export const paintById = (id) => PAINTS.find((x) => x.id === id) || PAINTS[0];

/** Apply a finished run. Returns a summary for the results screen. */
export function applyRun(p, r) {
  refreshMissions(p);
  const d = today();
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  let streakUp = false;
  if (p.streak.last !== d) {
    p.streak.days = p.streak.last === yesterday ? p.streak.days + 1 : 1;
    p.streak.last = d;
    streakUp = true;
  }
  const completed = [];
  for (const m of p.missions.list) {
    if (m.done) continue;
    const def = MISSIONS.find((x) => x.id === m.id);
    const v = def.stat(r);
    m.progress = def.sum ? m.progress + v : Math.max(m.progress, v);
    if (m.progress >= def.goal) { m.done = true; completed.push(def.text); }
  }
  const base = Math.floor(r.timeMs / 100) + Math.floor(r.points / 4) + (r.win ? 250 : 0) + (r.bestChain || 0) * 15 + (r.dodges || 0) * 40;
  const streakBonus = Math.min(0.5, (p.streak.days - 1) * 0.1);
  const gained = Math.round(base * (1 + streakBonus)) + completed.length * 150;
  const before = p.level;
  const unlocks = [];
  p.xp += gained;
  while (p.xp >= xpForLevel(p.level)) {
    p.xp -= xpForLevel(p.level);
    p.level++;
    for (const paint of PAINTS) if (paint.level === p.level) unlocks.push(paint);
  }
  p.runs++;
  if (r.win) p.wins++;
  p.bestChain = Math.max(p.bestChain, r.bestChain || 0);
  saveProfile(p);
  return { gained, levelUp: p.level > before, level: p.level, unlocks, completed, streak: p.streak.days, streakUp, streakBonus };
}

/** Friend challenge carried in the link: ?seed=…&c=<timeMs>.<points>. Unverified by design. */
export function parseChallenge(qs) {
  const c = qs.get('c');
  if (!c || !/^\d{1,5}\.\d{1,6}$/.test(c)) return null;
  const [t, pts] = c.split('.').map(Number);
  if (t > 60000) return null;
  return { timeMs: t, points: pts };
}
export function beats(r, target) { return r.timeMs > target.timeMs || (r.timeMs === target.timeMs && r.points > target.points); }
