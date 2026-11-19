/* Daily rules: the part of the city briefing that changes gameplay. Shared by the simulation (browser
   and edge replay) and the edge that writes the briefing. Everything here is bounded and quantised, so
   whatever a briefing proposes, the simulation only ever sees values from these ranges — and the same
   values on every JS engine.

   contracts: up to three objectives with point rewards, judged inside the simulation every run.
   tactics:   how the police play today (heat pace, patrol rate, interceptors, roadblocks, spikes, traffic).
   Defaults reproduce the base rules exactly. */

export const ZONES = ['downtown', 'beach', 'port', 'oldtown', 'hills', 'canyon', 'park', 'north', 'neon', 'midtown'];
export const ZONE_NAMES = {
  en: ['Downtown', 'Ocean Drive', 'The Docks', 'Old Town', 'Palm Heights', 'Red Canyon', 'Lakeside Park', 'Tech Park', 'Neon Mile', 'Brick Row'],
  fa: ['مرکز شهر', 'بلوار ساحلی', 'اسکله', 'شهر قدیم', 'تپه‌های نخل', 'دره سرخ', 'پارک دریاچه', 'شهرک فناوری', 'راسته نئون', 'محله آجری'],
};

/** Contract types. `zone`: may be bound to one district. Rewards come from the goal (never from the briefing). */
export const CONTRACTS = {
  drift: { min: 800, max: 6000, zmin: 400, zmax: 3000, step: 100, zone: true, reward: (g, z) => g * (z ? 0.8 : 0.4) },
  near: { min: 4, max: 24, zmin: 3, zmax: 12, step: 1, zone: true, reward: (g, z) => g * (z ? 180 : 110) },
  takedown: { min: 1, max: 6, step: 1, reward: (g) => g * 500 },
  dodge: { min: 1, max: 4, step: 1, reward: (g) => g * 550 },
  speed: { min: 170, max: 260, step: 5, reward: (g) => (g - 140) * 14 },
  chain: { min: 3, max: 8, step: 1, reward: (g) => g * 260 },
  survive: { min: 45, max: 150, step: 5, reward: (g) => g * 14 },
  explore: { min: 2, max: 6, step: 1, reward: (g) => g * 320 },
};
/** [min, max, default, step] */
export const TACTICS = {
  pace: [0.85, 1.2, 1, 0.05], // heat rises this much faster
  patrol: [0.8, 1.25, 1, 0.05], // police spawn rate
  intercept: [0.15, 0.6, 0.35, 0.05], // chance a new unit comes head-on
  blocks: [0.7, 1.4, 1, 0.05], // roadblock rate
  spikes: [3, 5, 4, 1], // heat level from which roadblocks carry spike strips
  traffic: [12, 24, 18, 1], // civilian cars around you
};
export const DEFAULT_TACTICS = Object.fromEntries(Object.entries(TACTICS).map(([k, v]) => [k, v[2]]));

const q = (v, step) => Math.round(Math.round(v / step) * step * 1000) / 1000;
const clampQ = (v, min, max, step, dflt) => { const n = Number(v); return Number.isFinite(n) ? q(Math.max(min, Math.min(max, n)), step) : dflt; };
export function contractReward(c) {
  const def = CONTRACTS[c.type];
  return def ? Math.max(300, Math.min(3000, Math.round(def.reward(c.goal, c.zone >= 0) / 50) * 50)) : 0;
}
/** Bounded rules the simulation can trust, or null for base rules. */
export function cleanRules(r) {
  if (!r || typeof r !== 'object') return null;
  const contracts = [], seen = new Set();
  for (const c of Array.isArray(r.contracts) ? r.contracts : []) {
    const def = CONTRACTS[c?.type];
    if (!def || seen.has(c.type)) continue;
    const zone = def.zone && Number.isInteger(c.zone) && c.zone >= 0 && c.zone < ZONES.length ? c.zone : -1;
    const lo = zone >= 0 ? def.zmin : def.min, hi = zone >= 0 ? def.zmax : def.max;
    const goal = clampQ(c.goal, lo, hi, def.step, lo);
    const out = { type: c.type, goal, zone };
    out.reward = contractReward(out);
    contracts.push(out); seen.add(c.type);
    if (contracts.length === 3) break;
  }
  const tactics = {};
  for (const [k, [min, max, dflt, step]] of Object.entries(TACTICS)) tactics[k] = clampQ(r.tactics?.[k], min, max, step, dflt);
  return { id: String(r.id || 'rules').replace(/[^\w.-]/g, '').slice(0, 48), contracts, tactics };
}

/* ---------- requirement text (always from the rules, never from the briefing) ---------- */
const N = (n, lang) => (lang === 'fa' ? Number(n).toLocaleString('fa-IR') : Number(n).toLocaleString('en-US'));
export function contractText(c, lang = 'en') {
  const z = c.zone >= 0 ? (ZONE_NAMES[lang] || ZONE_NAMES.en)[c.zone] : null, g = N(c.goal, lang);
  if (lang === 'fa') {
    switch (c.type) {
      case 'drift': return z ? `${g} امتیاز دریفت در ${z}` : `${g} امتیاز دریفت`;
      case 'near': return z ? `${g} جاخالی نزدیک در ${z}` : `${g} جاخالی نزدیک`;
      case 'takedown': return `${g} پلیس را از کار بینداز`;
      case 'dodge': return `از ${g} راه‌بند جاخالی بده`;
      case 'speed': return `به سرعت ${g} کیلومتر برس`;
      case 'chain': return `زنجیره‌ی ×${g} بساز`;
      case 'survive': return `${g} ثانیه دوام بیاور`;
      case 'explore': return `از ${g} محله‌ی مختلف رد شو`;
    }
  }
  switch (c.type) {
    case 'drift': return z ? `Drift ${g} pts in ${z}` : `Drift ${g} pts`;
    case 'near': return z ? `${g} near misses in ${z}` : `${g} near misses`;
    case 'takedown': return `Take down ${g} police`;
    case 'dodge': return `Dodge ${g} roadblocks`;
    case 'speed': return `Hit ${g} km/h`;
    case 'chain': return `Build a ×${g} chain`;
    case 'survive': return `Survive ${g} s`;
    case 'explore': return `Drive through ${g} districts`;
  }
  return '';
}
