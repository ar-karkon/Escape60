/* The city briefing ("director") and the crew chief — shared by the browser and the edge.
   A briefing is written once per UTC day by a language model on the edge and frozen in storage; this
   module is the gate every model answer passes: only whitelisted contract types, clamped goals,
   bounded tactics, length-capped text, safe placeholders and real Persian in Persian fields survive.
   When there is no model answer (no key, timeout, bad JSON) a handwritten briefing for the day is used,
   so the game never depends on the model being up. */
import { hashSeed } from './simulation.js';
import { cleanRules, contractText, CONTRACTS, TACTICS, ZONES, ZONE_NAMES } from './rules.js';

export const DIRECTOR_VERSION = 1;
/** Moments the police radio reacts to. Lines may use {zone} (current district) and {car}. */
export const RADIO_EVENTS = ['start', 'heat', 'roadblock', 'takedown', 'nearCop', 'hit', 'pit', 'contract', 'milestone', 'bust', 'wrecked', 'busted'];
const FA_RE = /[؀-ۿ]/;

export function clean(s, max) {
  return String(s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\{(zone|car)\}/g, '\u0001$1\u0002')
    .replace(/https?:\/\/\S+|www\.\S+/gi, '')
    .replace(/[<>{}[\]`\\|*_#@$^~]/g, '')
    .replace(/[\u0000\u0003-\u001f\u007f\u200b\u2028\u2029]/g, ' ')
    .replace(/\u0001(zone|car)\u0002/g, '{$1}')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
/** Both languages from the model, or English for both, or the fallback pair — never a mismatched mix. */
const pair = (raw, max, fb) => {
  let en = clean(raw?.en, max), fa = clean(raw?.fa, max);
  en = en.length >= 3 && !FA_RE.test(en) ? en : ''; fa = fa.length >= 3 && FA_RE.test(fa) ? fa : '';
  return en ? { en, fa: fa || en } : { ...fb };
};
const TYPE_TITLES = { drift: ['Sideways', 'دریفت'], near: ['Close Calls', 'یک مو فاصله'], takedown: ['Takedown', 'از کار انداختن'], dodge: ['Gate Crasher', 'از ایست رد شو'], speed: ['Top End', 'ته گاز'], chain: ['Chain Reaction', 'واکنش زنجیره‌ای'], survive: ['Stay Out', 'دوام بیاور'], explore: ['Cross Town', 'شهرگردی'] };
const rulesIdOf = (date, rules) => `d-${date}-${(hashSeed(JSON.stringify([rules.contracts, rules.tactics])) >>> 0).toString(36)}`;

/** Validate untrusted briefing JSON (from the model) into a safe briefing; missing parts come from the fallback. */
export function sanitizeDirector(raw, { date, source = 'ai', model = '' } = {}) {
  const fb = fallbackDirector(date);
  if (!raw || typeof raw !== 'object') return fb;
  const zoneOf = (z) => (typeof z === 'number' ? z : ZONES.indexOf(String(z || '').toLowerCase().replace(/[^a-z]/g, '')));
  // the focus district may come back as a district id ("port") instead of its index
  const tactics = raw.tactics && typeof raw.tactics === 'object' && raw.tactics.focus !== undefined ? { ...raw.tactics, focus: zoneOf(raw.tactics.focus) } : raw.tactics;
  const rules = cleanRules({ contracts: (Array.isArray(raw.contracts) ? raw.contracts : []).map((c) => ({ type: c?.type, goal: c?.goal, zone: zoneOf(c?.zone) })), tactics });
  if (rules.contracts.length < 2) return { ...fb, note: 'contracts' };
  const titles = new Map((Array.isArray(raw.contracts) ? raw.contracts : []).map((c) => [c?.type, c?.title]));
  const contracts = rules.contracts.map((c) => ({ ...c, title: pair(titles.get(c.type), 30, { en: TYPE_TITLES[c.type][0], fa: TYPE_TITLES[c.type][1] }) }));
  const radio = { en: {}, fa: {} };
  for (const lang of ['en', 'fa']) for (const ev of RADIO_EVENTS) {
    const lines = (Array.isArray(raw.radio?.[lang]?.[ev]) ? raw.radio[lang][ev] : []).map((l) => clean(l, 90)).filter((l) => l.length >= 6 && (lang === 'fa' ? FA_RE.test(l) : !FA_RE.test(l))).slice(0, 4);
    radio[lang][ev] = lines.length ? lines : fb.radio[lang][ev];
  }
  const d = {
    v: DIRECTOR_VERSION, date, seed: `daily-${date}`, source, model: clean(model, 40),
    theme: pair(raw.theme, 34, fb.theme), briefing: pair(raw.briefing, 220, fb.briefing), dispatcher: pair(raw.dispatcher, 24, fb.dispatcher),
    contracts, tactics: rules.tactics, radio,
  };
  d.id = rulesIdOf(date, rules);
  return d;
}
/** The part of a briefing the simulation plays by. */
export function rulesOf(d) { return d ? cleanRules({ id: d.id, contracts: d.contracts, tactics: d.tactics }) : null; }
export function pickRadio(d, event, lang = 'en', salt = 0) {
  const lines = d?.radio?.[lang]?.[event] || FALLBACK_RADIO[lang]?.[event] || FALLBACK_RADIO.en[event];
  if (!lines?.length) return '';
  return lines[(hashSeed(`${d?.id}|${event}|${salt}`) >>> 0) % lines.length];
}
export function fillRadio(line, { zone = 0, car = '', lang = 'en' } = {}) {
  return String(line).replace(/\{zone\}/g, (ZONE_NAMES[lang] || ZONE_NAMES.en)[zone] || '').replace(/\{car\}/g, car);
}
export { contractText };

/* ---------- crew chief (after a verified run) ---------- */
/** Personal targets for the next run (checked in the browser; they do not touch the score). */
export const TARGETS = {
  points: (r) => [r.points + 300, Math.max(r.points + 800, r.points * 2 + 1500)],
  survive: (r) => [Math.floor(r.timeMs / 1000) + 5, Math.floor(r.timeMs / 1000) + 90],
  drift: (r) => [r.driftPts + 300, r.driftPts * 2 + 3000],
  near: (r) => [r.near + 2, r.near * 2 + 12],
  takedown: (r) => [r.takedowns + 1, r.takedowns + 5],
  chain: (r) => [r.bestChain + 1, 8],
};
export function cleanTarget(t, result) {
  const range = TARGETS[t?.type]?.(result);
  if (!range) return null;
  const [lo, hi] = range, goal = Math.round(Math.max(lo, Math.min(Math.max(lo, hi), Number(t.goal) || lo)));
  return { type: t.type, goal: t.type === 'points' || t.type === 'drift' ? Math.round(goal / 50) * 50 : goal };
}
export function targetText(t, lang = 'en') {
  if (!t) return '';
  const g = lang === 'fa' ? Number(t.goal).toLocaleString('fa-IR') : Number(t.goal).toLocaleString('en-US');
  const fa = { points: `${g} امتیاز بگیر`, survive: `${g} ثانیه دوام بیاور`, drift: `${g} امتیاز دریفت`, near: `${g} جاخالی نزدیک`, takedown: `${g} پلیس را از کار بینداز`, chain: `زنجیره‌ی ×${g}` };
  const en = { points: `Score ${g}`, survive: `Survive ${g} s`, drift: `Drift ${g} pts`, near: `${g} near misses`, takedown: `Take down ${g} police`, chain: `Build a ×${g} chain` };
  return (lang === 'fa' ? fa : en)[t.type] || '';
}
/** Moments a ghost's driver speaks during your run (shown in the ghost's own voice). */
export const TAUNT_MOMENTS = ['start', 'passYou', 'youPass', 'milestone', 'beaten'];
export function sanitizeChief(raw, result) {
  const fb = fallbackChief(result);
  if (!raw || typeof raw !== 'object') return fb;
  const taunts = Object.fromEntries(TAUNT_MOMENTS.map((k) => [k, pair(raw.taunts?.[k], 64, fb.taunts[k])]));
  return { tip: pair(raw.tip, 170, fb.tip), headline: pair(raw.headline, 72, fb.headline), taunt: pair(raw.taunt, 64, fb.taunt), persona: pair(raw.persona, 26, fb.persona), taunts, next: cleanTarget(raw.next, result) || fb.next, source: 'ai' };
}
/** A driver nickname from the run's strongest number. */
function personaOf(r) {
  if (r.takedowns >= 3) return { en: 'Cop Magnet', fa: 'آهن‌ربای پلیس' };
  if (r.driftPts >= 3000) return { en: 'Smoke Artist', fa: 'هنرمند دود' };
  if (r.near >= 10) return { en: 'Needle Threader', fa: 'نخ‌کش سوزن' };
  if (r.topSpeed >= 230) return { en: 'Redline Rocket', fa: 'موشک خط قرمز' };
  if (r.escaped) return { en: 'Night Escapist', fa: 'فراری شب' };
  return { en: 'Street Runner', fa: 'دونده‌ی خیابان' };
}
const FALLBACK_TAUNTS = {
  start: { en: 'Catch me if you can.', fa: 'اگه می‌تونی بگیرم.' },
  passYou: { en: 'See you in the mirror.', fa: 'تو آینه می‌بینمت.' },
  youPass: { en: 'Lucky gap. Won\'t happen twice.', fa: 'شانسی بود. دوباره نمی‌شه.' },
  milestone: { en: 'Sixty seconds? I was just warming up.', fa: 'شصت ثانیه؟ تازه گرم شده بودم.' },
  beaten: { en: 'Fine. Enjoy it while it lasts.', fa: 'باشه. تا وقتی دووم داره کیف کن.' },
};
/** Rule-based crew chief from the verified numbers. */
export function fallbackChief(r) {
  const s = Math.floor(r.timeMs / 1000);
  let tip;
  if (r.end === 'busted') tip = { en: 'They boxed you in at low speed. Keep moving: a stop under 25 km/h with cops close fills the bust meter.', fa: 'با سرعت کم محاصره‌ات کردند. حرکت را حفظ کن؛ توقف زیر ۲۵ کیلومتر کنار پلیس‌ها نوار دستگیری را پر می‌کند.' };
  else if (r.hits >= 6) tip = { en: `${r.hits} hits wore you down. Brake before the bend, not in it — and use a pit stop below 60 health.`, fa: `${r.hits} ضربه از پا درت آورد. قبل از پیچ ترمز کن نه وسطش — و زیر ۶۰ سلامت به پیت‌استاپ برو.` };
  else if (r.driftPts < 600) tip = { en: 'Almost no drift points. Tap brake while steering to slide — long drifts feed the chain.', fa: 'تقریباً امتیاز دریفت نگرفتی. موقع پیچیدن ترمز را بزن تا سُر بخوری — دریفت بلند زنجیره را پر می‌کند.' };
  else if (r.takedowns === 0) tip = { en: 'No takedowns yet. Hit a cop from the side at speed, or make one crash into a wall — 800 points each.', fa: 'هنوز پلیسی را از کار نینداختی. با سرعت از پهلو بزن یا به دیوار بکوبانش — هر کدام ۸۰۰ امتیاز.' };
  else tip = { en: `Solid run: ${s} s and a ×${r.bestChain} chain. Keep nitro for the straight after a drift to stack combos.`, fa: `رانندگی خوبی بود: ${s} ثانیه و زنجیره‌ی ×${r.bestChain}. نیترو را برای مسیر صاف بعد از دریفت نگه دار تا ترکیب‌ها جمع شوند.` };
  return {
    tip,
    headline: { en: `${Number(r.points).toLocaleString('en-US')} points in ${s} seconds of chaos`, fa: `${Number(r.points).toLocaleString('fa-IR')} امتیاز در ${Number(s).toLocaleString('fa-IR')} ثانیه تعقیب` },
    taunt: { en: 'Catch me if you can.', fa: 'اگه می‌تونی بگیرم.' },
    persona: personaOf(r), taunts: { ...FALLBACK_TAUNTS },
    next: cleanTarget({ type: 'points', goal: Math.round(r.points * 1.25) }, r),
    source: 'rules',
  };
}

/* ---------- handwritten briefings (no model needed) ---------- */
const THEMES = [
  { theme: { en: 'Harbor Lockdown', fa: 'قفل اسکله' }, briefing: { en: 'Port Authority sealed the docks overnight. Every exit has a checkpoint and the spike crews are already out.', fa: 'اداره‌ی بندر اسکله را شبانه بسته. هر خروجی ایست بازرسی دارد و تیم‌های میخ‌انداز از الان آماده‌اند.' },
    tactics: { blocks: 1.3, spikes: 3, pace: 1 }, contracts: [{ type: 'drift', goal: 1200, zone: 2, title: { en: 'Smoke the Docks', fa: 'دود در اسکله' } }, { type: 'dodge', goal: 2, title: { en: 'Gate Crasher', fa: 'از ایست رد شو' } }, { type: 'survive', goal: 75, title: { en: 'Stay Out', fa: 'دوام بیاور' } }] },
  { theme: { en: 'Neon Night Sweep', fa: 'پاکسازی شب نئون' }, briefing: { en: 'Extra patrols on the Neon Mile tonight. They come in fast and head-on — keep your eyes up.', fa: 'امشب گشت‌های بیشتری در راسته‌ی نئون هست. سریع و از روبه‌رو می‌آیند — حواست جمع باشد.' },
    tactics: { patrol: 1.2, intercept: 0.5 }, contracts: [{ type: 'near', goal: 8, zone: 8, title: { en: 'Neon Thread', fa: 'نخ نئون' } }, { type: 'takedown', goal: 2, title: { en: 'Lights Out', fa: 'چراغ‌ها خاموش' } }, { type: 'chain', goal: 5, title: { en: 'Chain Reaction', fa: 'واکنش زنجیره‌ای' } }] },
  { theme: { en: 'Canyon Pressure', fa: 'فشار در دره' }, briefing: { en: 'Highway units pushed into Red Canyon. Heat climbs faster today — the hairpins are your friends.', fa: 'واحدهای بزرگراه وارد دره‌ی سرخ شده‌اند. امروز تعقیب سریع‌تر داغ می‌شود — پیچ‌های تند رفیقت هستند.' },
    tactics: { pace: 1.1 }, contracts: [{ type: 'drift', goal: 1500, zone: 5, title: { en: 'Hairpin Hero', fa: 'قهرمان پیچ' } }, { type: 'speed', goal: 220, title: { en: 'Top End', fa: 'ته گاز' } }, { type: 'explore', goal: 3, title: { en: 'Cross Town', fa: 'شهرگردی' } }] },
  { theme: { en: 'Rush Hour', fa: 'ساعت شلوغی' }, briefing: { en: 'The bay is jammed. Fewer cruisers can get through, but every gap between cars is a gamble.', fa: 'خلیج قفل شده. گشتی‌های کمتری رد می‌شوند، ولی هر فاصله‌ی بین ماشین‌ها یک ریسک است.' },
    tactics: { traffic: 24, patrol: 0.9 }, contracts: [{ type: 'near', goal: 14, title: { en: 'Lane Splitter', fa: 'لایی‌کش' } }, { type: 'chain', goal: 6, title: { en: 'Flow State', fa: 'در جریان' } }, { type: 'survive', goal: 60, title: { en: 'Clock Out', fa: 'پایان شیفت' } }] },
  { theme: { en: 'Interceptor Day', fa: 'روز رهگیرها' }, briefing: { en: 'The fast units are on shift. They cut you off from the front — make them pay for it.', fa: 'واحدهای سریع سر کارند. از جلو راهت را می‌بندند — تاوانش را بده‌اند.' },
    tactics: { intercept: 0.6, blocks: 0.9 }, contracts: [{ type: 'takedown', goal: 3, title: { en: 'Interceptor Hunter', fa: 'شکارچی رهگیر' } }, { type: 'dodge', goal: 1, title: { en: 'Thread the Gap', fa: 'از شکاف رد شو' } }, { type: 'speed', goal: 200, title: { en: 'Outrun', fa: 'جا بگذارشان' } }] },
  { theme: { en: 'Grand Tour', fa: 'تور بزرگ شهر' }, briefing: { en: 'A slow start for the police today. Use it — see the whole bay before they wake up.', fa: 'پلیس امروز دیر راه می‌افتد. از این فرصت استفاده کن — قبل از بیدار شدنشان کل خلیج را ببین.' },
    tactics: { pace: 0.9 }, contracts: [{ type: 'explore', goal: 5, title: { en: 'Grand Tour', fa: 'تور بزرگ' } }, { type: 'drift', goal: 3000, title: { en: 'Sideways Postcard', fa: 'کارت‌پستال دریفت' } }, { type: 'near', goal: 10, title: { en: 'Close Shave', fa: 'یک مو فاصله' } }] },
];
export const FALLBACK_RADIO = {
  en: {
    start: ['All units, suspect vehicle {car} moving in {zone}.', 'Dispatch to all units: we have a runner in {zone}.'],
    heat: ['Heat is rising, more units joining the pursuit.', 'All available units, converge on {zone}!'],
    roadblock: ['Roadblock set ahead, close the road!', 'Block the street, suspect is coming your way.'],
    takedown: ['Unit down! Unit down in {zone}!', 'We lost a cruiser — suspect is ramming!'],
    nearCop: ['He just slipped past us!', 'Close one — stay on him!'],
    hit: ['Suspect vehicle is damaged, keep the pressure on.', 'He took a hit, don\'t let up!'],
    pit: ['Suspect pulled into a pit stop — watch the exits!', 'He\'s getting repairs, block the station!'],
    contract: ['Word is the suspect is doing this for a contract.', 'That stunt was on purpose — he\'s showing off.'],
    milestone: ['Sixty seconds and he\'s still out there!', 'This one won\'t stop. Bring everything.'],
    bust: ['We have him boxed in, hold position!', 'Surround the vehicle, don\'t let him move!'],
    wrecked: ['Suspect vehicle is down. Pursuit over.', 'He\'s wrecked. Get the tow truck.'],
    busted: ['Suspect in custody. Good work, units.', 'Got him. All units, stand down.'],
  },
  fa: {
    start: ['همه‌ی واحدها، خودروی سوژه {car} در {zone} حرکت کرد.', 'مرکز به همه‌ی واحدها: یک فراری در {zone} داریم.'],
    heat: ['تعقیب داغ‌تر شد، واحدهای بیشتری اضافه می‌شوند.', 'همه‌ی واحدهای آزاد به سمت {zone} بروند!'],
    roadblock: ['راه‌بند جلوتر آماده است، مسیر را ببندید!', 'خیابان را مسدود کنید، سوژه به سمت شما می‌آید.'],
    takedown: ['یک واحد از کار افتاد! در {zone}!', 'یک گشتی را از دست دادیم — سوژه دارد می‌کوبد!'],
    nearCop: ['همین الان از کنارمان لیز خورد!', 'نزدیک بود — ولش نکنید!'],
    hit: ['خودروی سوژه آسیب دیده، فشار را حفظ کنید.', 'ضربه خورد، کوتاه نیایید!'],
    pit: ['سوژه وارد پیت‌استاپ شد — خروجی‌ها را بپایید!', 'دارد تعمیر می‌کند، جایگاه را ببندید!'],
    contract: ['گویا سوژه برای یک قرارداد این کارها را می‌کند.', 'آن حرکت عمدی بود — دارد قدرت‌نمایی می‌کند.'],
    milestone: ['شصت ثانیه گذشت و هنوز فرار می‌کند!', 'این یکی دست‌بردار نیست. همه را بیاورید.'],
    bust: ['محاصره‌اش کردیم، سر جایتان بمانید!', 'دور خودرو را بگیرید، نگذارید حرکت کند!'],
    wrecked: ['خودروی سوژه از کار افتاد. تعقیب تمام شد.', 'داغان شد. یدک‌کش بفرستید.'],
    busted: ['سوژه بازداشت شد. آفرین به همه‌ی واحدها.', 'گرفتیمش. همه‌ی واحدها برگردند.'],
  },
};
/* ---------- pursuit commander: yesterday's per-district outcomes steer today's police focus ---------- */
/** Per-district counters kept by the edge at every verified finish (heat/<sim>/<date>.json). */
export const HEAT_KINDS = ['busts', 'wrecks', 'escapes', 'takedowns'];
const argmax = (z, k) => { let best = -1, n = 0; z.forEach((row, i) => { if ((row?.[k] || 0) > n) { n = row[k]; best = i; } }); return best; };
/** Summary of a day's heat file, or null: where players got caught, wrecked, escaped and hunted cops,
    and the district the police concentrate on next (where players did best: escapes + takedowns). */
export function heatSummary(h) {
  if (!h || !Array.isArray(h.z) || !(h.n > 0)) return null;
  const z = h.z.slice(0, ZONES.length).map((row) => (Array.isArray(row) ? row.map((v) => Math.max(0, Number(v) || 0)) : [0, 0, 0, 0]));
  const score = z.map((row) => [0, 0, row[2] * 2 + row[3]]);
  const focus = argmax(score, 2), total = score.reduce((a, r) => a + r[2], 0);
  const share = focus >= 0 && total > 0 ? score[focus][2] / total : 0;
  return { date: h.date || null, runs: h.n, bust: argmax(z, 0), wreck: argmax(z, 1), escape: argmax(z, 2), takedown: argmax(z, 3), focus, focusRate: focus >= 0 ? Math.min(1.5, Math.round((1.15 + share * 0.5) * 20) / 20) : 1 };
}
/** One line for the model prompt. */
export function heatText(s) {
  if (!s) return '';
  const n = (i) => (i >= 0 ? ZONE_NAMES.en[i] : 'nowhere in particular');
  return `Yesterday ${s.runs} verified runs: most busts in ${n(s.bust)}, most wrecks in ${n(s.wreck)}, most escapes in ${n(s.escape)}, most police cars taken down in ${n(s.takedown)}.`;
}
/** League of a verified run, from the share of today's runs it beat (and its board rank). */
export const LEAGUES = ['bronze', 'silver', 'gold', 'neon', 'legend'];
export function leagueOf(better, rank = null, runs = 0) {
  if (!Number.isFinite(better)) return null;
  if ((rank && rank <= 3 && runs >= 10) || better >= 99) return 'legend';
  return better >= 90 ? 'neon' : better >= 70 ? 'gold' : better >= 40 ? 'silver' : 'bronze';
}
export function fallbackDirector(date, heat = null) {
  const t = THEMES[(hashSeed(`brief-${date}`) >>> 0) % THEMES.length];
  const focus = heat && heat.focus >= 0 ? heat.focus : -1;
  const rules = cleanRules({ contracts: t.contracts, tactics: focus >= 0 ? { ...t.tactics, focus, focusRate: heat.focusRate } : t.tactics });
  const briefing = focus >= 0
    ? { en: `${t.briefing.en} After yesterday, the commander moved extra units into ${ZONE_NAMES.en[focus]}.`, fa: `${t.briefing.fa} بعد از دیروز، فرمانده واحدهای بیشتری به ${ZONE_NAMES.fa[focus]} فرستاده.` }
    : t.briefing;
  const d = {
    v: DIRECTOR_VERSION, date, seed: `daily-${date}`, source: 'fallback', model: '',
    theme: t.theme, briefing, dispatcher: { en: 'Bay Dispatch', fa: 'مرکز خلیج' },
    contracts: rules.contracts.map((c, i) => ({ ...c, title: t.contracts[i].title })), tactics: rules.tactics, radio: FALLBACK_RADIO,
  };
  d.id = rulesIdOf(date, rules);
  return d;
}
/** Contract and tactic ranges, for prompts and docs. */
export const SCHEMA = { contracts: Object.fromEntries(Object.entries(CONTRACTS).map(([k, v]) => [k, { min: v.min, max: v.max, zone: !!v.zone, zoneMin: v.zmin, zoneMax: v.zmax }])), tactics: Object.fromEntries(Object.entries(TACTICS).map(([k, v]) => [k, { min: v[0], max: v[1], base: v[2] }])), zones: ZONES };
