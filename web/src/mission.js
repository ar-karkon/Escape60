/* AI Special Event (daily mission) — shared by the browser and the Arvan Edge worker.
   The language model only writes *content*: a title, a briefing, police-radio lines and a choice of
   objectives from a fixed whitelist with clamped goals. It never touches physics, spawns or scoring.
   Objectives are judged from the replay-verified result, so every player faces identical rules. */
import { hashSeed } from './simulation.js';

export const MISSION_VERSION = 1;
/** Whitelisted objective types. `min`/`max` clamp whatever the model proposes. */
export const OBJECTIVES = {
  survive: { min: 30, max: 60, text: (g) => `${fa(g)} ثانیه دوام بیاور`, stat: (r) => Math.floor(r.timeMs / 1000) },
  escape: { min: 1, max: 1, text: () => '۶۰ ثانیه کامل فرار کن', stat: (r) => (r.win ? 1 : 0) },
  near: { min: 3, max: 14, text: (g) => `${fa(g)} جاخالی نزدیک ثبت کن`, stat: (r) => r.closeCalls },
  health: { min: 20, max: 80, text: (g) => `با حداقل ${fa(g)}٪ سلامت فرار کن`, stat: (r) => (r.win ? r.health : 0) },
  chain: { min: 2, max: 5, text: (g) => `زنجیره ×${fa(g)} بساز`, stat: (r) => r.bestChain },
  dodge: { min: 1, max: 3, text: (g) => `${fa(g)} بار از کنار راه‌بند جاخالی بده`, stat: (r) => r.dodges || 0 },
  points: { min: 300, max: 1500, text: (g) => `${fa(g)} امتیاز بگیر`, stat: (r) => r.points },
};
/** Moments in a run the radio reacts to (keys of `mission.radio`). */
export const RADIO_EVENTS = ['start', 'police', 'roadblock', 'hit', 'near', 'chain', 'heli', 'final', 'busted', 'escaped'];
const fa = (n) => Number(n).toLocaleString('fa-IR');
const clean = (s, max) => String(s ?? '')
  .replace(/[<>{}[\]`\\]/g, '')
  .replace(/https?:\/\/\S+/gi, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

/** Validate untrusted (model) output into a safe mission, or throw. */
export function sanitizeMission(raw, { date, seed, source = 'ai', model = '' } = {}) {
  if (!raw || typeof raw !== 'object') throw Error('mission: not an object');
  const title = clean(raw.title, 42), briefing = clean(raw.briefing, 220);
  if (title.length < 3 || briefing.length < 10) throw Error('mission: missing text');
  const seen = new Set(), objectives = [];
  for (const o of Array.isArray(raw.objectives) ? raw.objectives : []) {
    const def = OBJECTIVES[o?.type];
    if (!def || seen.has(o.type)) continue;
    if (o.type === 'escape' && seen.has('survive')) continue;
    if (o.type === 'survive' && seen.has('escape')) continue;
    const goal = Math.round(Math.max(def.min, Math.min(def.max, Number(o.goal) || def.min)));
    seen.add(o.type); objectives.push({ type: o.type, goal });
    if (objectives.length === 3) break;
  }
  if (objectives.length < 2) throw Error('mission: objectives');
  const radio = {};
  for (const k of RADIO_EVENTS) {
    const lines = (Array.isArray(raw.radio?.[k]) ? raw.radio[k] : [raw.radio?.[k]]).map((l) => clean(l, 90)).filter((l) => l.length >= 4).slice(0, 4);
    radio[k] = lines.length ? lines : FALLBACK_RADIO[k];
  }
  return { v: MISSION_VERSION, id: `m-${date}`, date, seed, title, briefing, objectives, radio, source, model: clean(model, 40) };
}

export function objectiveText(o) { return OBJECTIVES[o.type]?.text(o.goal) ?? ''; }
/** Per-objective progress from a (replay-verified) result. */
export function judgeMission(mission, result) {
  const list = (mission?.objectives || []).map((o) => {
    const v = OBJECTIVES[o.type]?.stat(result) ?? 0;
    return { ...o, value: v, done: v >= o.goal, text: objectiveText(o) };
  });
  return { list, complete: list.length > 0 && list.every((o) => o.done), done: list.filter((o) => o.done).length };
}
export function pickRadio(mission, event, salt = 0) {
  const lines = mission?.radio?.[event] || FALLBACK_RADIO[event];
  if (!lines?.length) return '';
  return lines[(hashSeed(`${mission?.id}|${event}|${salt}`) >>> 0) % lines.length];
}

/* ---------- deterministic fallback (no network, AI quota exhausted, invalid model output) ---------- */
const FALLBACK_RADIO = {
  start: ['همه‌ی واحدها توجه کنند! خودروی نارنجی در بلوار ساحلی دیده شد.', 'مرکز به واحدها: سوژه حرکت کرد، تعقیب را شروع کنید!'],
  police: ['واحد تازه به تعقیب پیوست، از پشت نزدیک شوید!', 'واحد هفت، به ستون تعقیب ملحق شو!'],
  roadblock: ['راه‌بند آماده است، خروجی جلویی را ببندید!', 'مسیر را مسدود کنید، سوژه به سمت شما می‌آید!'],
  hit: ['سوژه آسیب دیده، فاصله را حفظ کنید!', 'خودروی سوژه ضربه خورد، فشار را بیشتر کنید!'],
  near: ['دوباره از بین ماشین‌ها رد شد!', 'عجب راننده‌ای… از دست‌مان لیز خورد!'],
  chain: ['سوژه دارد حرکات نمایشی می‌کند، تمرکز کنید!', 'این راننده حرفه‌ای است، محاصره را تنگ کنید!'],
  heli: ['بالگرد هوایی رسید، سوژه را از بالا دنبال کنید.', 'پشتیبانی هوایی در منطقه است!'],
  final: ['فقط ده ثانیه تا خروج سوژه از منطقه!', 'الان یا هیچ‌وقت! همه‌ی واحدها جلو بروند!'],
  busted: ['سوژه متوقف شد. تعقیب تمام است.', 'گرفتیمش! همه‌ی واحدها برگردند.'],
  escaped: ['سوژه از منطقه خارج شد… گمش کردیم!', 'مرکز به واحدها: تعقیب ناموفق بود.'],
};
const FALLBACK_SCENES = [
  { title: 'محاصره‌ی اسکله!', briefing: 'پلیس همه‌ی خروجی‌های اسکله را زیر نظر دارد. یک دقیقه فرصت داری از حلقه‌ی محاصره بیرون بزنی.', objectives: [{ type: 'escape', goal: 1 }, { type: 'near', goal: 4 }, { type: 'health', goal: 40 }] },
  { title: 'شب نئون', briefing: 'تابلوهای نئون روشن شده‌اند و خیابان‌ها شلوغ است. از لای ترافیک رد شو و دوربین‌ها را گیج کن.', objectives: [{ type: 'survive', goal: 45 }, { type: 'near', goal: 7 }, { type: 'chain', goal: 3 }] },
  { title: 'بلوار طوفانی', briefing: 'راه‌بندها روی بلوار ساحلی چیده شده‌اند. با جاخالی‌های دقیق از کنارشان رد شو.', objectives: [{ type: 'escape', goal: 1 }, { type: 'dodge', goal: 1 }, { type: 'points', goal: 600 }] },
  { title: 'تعقیب بی‌وقفه', briefing: 'امروز پلیس کوتاه نمی‌آید. سالم بمان و زنجیره‌ی حرکات نمایشی‌ات را حفظ کن.', objectives: [{ type: 'survive', goal: 50 }, { type: 'chain', goal: 4 }, { type: 'health', goal: 30 }] },
];
export function fallbackMission(date, seed) {
  const scene = FALLBACK_SCENES[hashSeed('scene-' + date) % FALLBACK_SCENES.length];
  return sanitizeMission({ ...scene, radio: FALLBACK_RADIO }, { date, seed, source: 'fallback' });
}

/* ---------- prompt for the language model (used on the edge) ---------- */
export function missionPrompt(date) {
  const types = Object.entries(OBJECTIVES).map(([k, d]) => `${k} (goal ${d.min}..${d.max})`).join(', ');
  return [
    { role: 'system', content: 'You are the mission writer of "Escape 60", a family-friendly, cartoon-style 60-second car chase arcade game set in an imaginary tropical neon beach city called Sunset Bay. Write short, exciting, playful Persian (Farsi) text. Strictly no violence, weapons, injuries, politics, religion, real people, real places, brands or insults. Police are cartoon pursuers on radio. Reply with ONE JSON object only, no markdown.' },
    { role: 'user', content: `Create today's special event for ${date}.
JSON shape:
{"title": "<= 6 Persian words", "briefing": "1-2 Persian sentences, <= 200 chars", "objectives": [{"type": "...", "goal": <int>}, ... exactly 3 distinct], "radio": {${RADIO_EVENTS.map((e) => `"${e}": ["2 short Persian police radio lines"]`).join(', ')}}}
Allowed objective types: ${types}. Use "escape" OR "survive", not both. Keep goals fair for a casual player.
Radio events: start=chase begins, police=new police car joins, roadblock=roadblock ahead, hit=player car hit, near=player dodged traffic closely, chain=player on a skill streak, heli=helicopter arrives, final=last 10 seconds, busted=player caught, escaped=player escaped. Each line <= 80 chars, radio style.` },
  ];
}
/** Extract the first JSON object from a model reply (tolerates code fences). */
export function parseModelJson(text) {
  const s = String(text || ''), a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw Error('no json');
  return JSON.parse(s.slice(a, b + 1));
}
