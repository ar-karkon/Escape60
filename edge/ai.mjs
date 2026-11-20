/* AIaaS on the edge: Arvan's AI gateway (OpenAI-compatible chat completions), model DeepSeek-V4-Flash
   by default. Four jobs, all written as game content (nothing in the game is labelled "AI"):
     director  — once per UTC day: theme, briefing, three contracts and the police tactics of the day
                 (bounded rules the simulation plays by; frozen, identical for everyone)
     radio     — once per UTC day and language: police-radio lines for twelve moments of a chase
     dispatch  — once per run: the dispatcher's call announcing you, from your car, district and last run
     chief     — once per verified run: crew-chief tip, next target, share headline, ghost persona + taunt bank
   Every answer goes through the sanitizers in web/src/director.js; nothing the model writes can reach
   physics, scoring or ranking except through the clamped contract/tactic ranges. */
import { sanitizeDirector, sanitizeChief, clean, RADIO_EVENTS, SCHEMA, TAUNT_MOMENTS, heatText } from '../web/src/director.js';
import { ZONES, ZONE_NAMES, contractText } from '../web/src/rules.js';
import { carById } from '../web/src/cars.js';

export function parseModelJson(text) {
  const t = String(text || '').replace(/```(?:json)?/gi, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw Error('no JSON in model answer');
  return JSON.parse(t.slice(a, b + 1));
}
const ZONE_LIST = ZONES.map((z, i) => `${z} = ${ZONE_NAMES.en[i]} / ${ZONE_NAMES.fa[i]}`).join('; ');
const SYSTEM = 'You write game content for ESCAPE 60, an arcade street-pursuit racing game set in Sunset Bay, a fictional synthwave coastal city with palm trees, neon and a striped retro sun. The player is a getaway driver; the police chase them. Tone: punchy, cinematic, playful, family friendly. Never mention real brands, real places, real people, weapons, injuries or politics. Persian text must be natural, fluent Persian (not transliteration).';

export function createAI({ env = {}, fetchImpl = (...a) => fetch(...a), metrics = { add() {} }, log = () => {} }) {
  const key = String(env.AI_API_KEY || '').trim().replace(/^apikey\s+/i, '');
  const cfg = key ? { key, base: String(env.AI_BASE || 'https://api.arvancloudai.ir/v1').trim().replace(/\/$/, ''), model: String(env.AI_MODEL || 'DeepSeek-V4-Flash').trim() } : null;

  async function chat(kind, user, { maxTokens = 500, temperature = 0.9, timeoutMs = 14000, json = true } = {}) {
    if (!cfg) throw Error('AIaaS not configured');
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs), t0 = performance.now();
    try {
      const res = await fetchImpl(`${cfg.base}/chat/completions`, {
        method: 'POST', signal: ctl.signal,
        headers: { Authorization: `apikey ${cfg.key}`, 'Content-Type': 'application/json' },
        // DeepSeek-V4-Flash on Arvan reasons by default (hidden tokens, slow); short game text needs none.
        body: JSON.stringify({ model: cfg.model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }], max_tokens: maxTokens, temperature, thinking: { type: 'disabled' } }),
      });
      if (!res.ok) throw Error(`AIaaS ${res.status}`);
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content || '';
      metrics.add('aiCalls'); metrics.add(`ai_${kind}`); metrics.add('aiMs', performance.now() - t0); metrics.add('aiTokens', Number(data?.usage?.total_tokens) || 0);
      return json ? parseModelJson(text) : text;
    } catch (e) { metrics.add('aiFails'); log('ai', kind, e.message); throw e; }
    finally { clearTimeout(timer); }
  }

  /** Today's briefing + rules. Returns a sanitized briefing (source "ai"), or throws.
      `heat` (optional): yesterday's per-district outcome summary — the commander reacts to it. */
  async function director(date, heat = null) {
    const dow = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    const user = `Design today's pursuit in Sunset Bay for ${dow} ${date}. Everyone plays the same city today.
Districts (use the id): ${ZONE_LIST}.
Contract types (pick exactly 3 different types; goal must be inside the range; "zone" only for drift/near, at most 2 contracts bound to a district, use a district id):
${Object.entries(SCHEMA.contracts).map(([k, v]) => `- ${k}: goal ${v.min}-${v.max}${v.zone ? ` (or ${v.zoneMin}-${v.zoneMax} when bound to a zone)` : ''}`).join('\n')}
(drift = drift points, near = near misses with traffic or police, takedown = police cars wrecked, dodge = roadblocks dodged, speed = top speed km/h, chain = best skill chain, survive = seconds survived, explore = different districts driven through)
Police tactics (numbers inside the range; base value in brackets): ${Object.entries(SCHEMA.tactics).map(([k, v]) => `${k} ${v.min}-${v.max} [${v.base}]`).join(', ')}.
(pace = how fast heat rises, patrol = police spawn rate, intercept = chance a new unit comes head-on, blocks = roadblock rate, spikes = heat level from which roadblocks carry spike strips, traffic = civilian cars around, focus = index of the district in the list above (0 = first) where police concentrate today or -1 for none, focusRate = how much faster patrols and roadblocks come inside the focus district)
${heat ? `Pursuit commander report: ${heatText(heat)} Suggested focus district: ${heat.focus} (rate ${heat.focusRate}). Set tactics.focus/focusRate to react to it and mention the move in the briefing as story.\n` : ''}Make the theme, contracts and tactics tell one story (e.g. a docks lockdown means docks contracts and more roadblocks). Vary it from day to day.
Reply with JSON only, exactly this shape:
{"theme":{"en":"≤30 chars","fa":"≤30 chars"},"briefing":{"en":"≤200 chars, second person","fa":"≤200 chars"},"dispatcher":{"en":"police dispatcher callsign ≤20 chars","fa":"..."},"contracts":[{"type":"drift","goal":1500,"zone":"port","title":{"en":"≤26 chars","fa":"≤26 chars"}}],"tactics":{"pace":1,"patrol":1,"intercept":0.35,"blocks":1,"spikes":4,"traffic":18}}`;
    const t0 = performance.now();
    const raw = await chat('director', user, { maxTokens: 700, temperature: 1, timeoutMs: 15000 });
    if (heat && heat.focus >= 0 && raw?.tactics && typeof raw.tactics === 'object' && raw.tactics.focus === undefined) Object.assign(raw.tactics, { focus: heat.focus, focusRate: heat.focusRate });
    const d = sanitizeDirector(raw, { date, source: 'ai', model: cfg.model });
    if (d.source !== 'ai') throw Error(`briefing rejected (${d.note || 'invalid'})`);
    d.genMs = Math.round(performance.now() - t0);
    return d;
  }

  /** Police-radio bank for one language, in the voice of today's briefing. */
  async function radio(d, lang) {
    const L = lang === 'fa' ? 'Persian' : 'English';
    const user = `Today's operation in Sunset Bay: "${d.theme.en}" — ${d.briefing.en}
Police dispatcher callsign: ${d.dispatcher.en}.
Write police-radio chatter in ${L} for these moments of a car chase. 3 different lines per moment, each ≤ 80 characters, short and urgent like real radio. You may use the placeholders {zone} (district name) and {car} (the suspect's car) literally.
Moments: start = pursuit begins; heat = pursuit escalates; roadblock = roadblock set ahead; takedown = the suspect wrecked a police car; nearCop = the suspect slipped past a cruiser; hit = suspect car damaged; pit = suspect pulled into a repair station; contract = the suspect pulled off a daring stunt; milestone = suspect survived 60 seconds; bust = police boxing the suspect in; wrecked = suspect car destroyed; busted = suspect caught.
Reply with JSON only: {${RADIO_EVENTS.map((e) => `"${e}":["...","...","..."]`).join(',')}}`;
    const raw = await chat(`radio_${lang}`, user, { maxTokens: 1100, temperature: 1, timeoutMs: 15000 });
    const out = {};
    for (const ev of RADIO_EVENTS) {
      const lines = (Array.isArray(raw?.[ev]) ? raw[ev] : []).map((l) => clean(l, 90)).filter((l) => l.length >= 6 && (lang === 'fa' ? /[؀-ۿ]/.test(l) : !/[؀-ۿ]/.test(l))).slice(0, 4);
      if (lines.length) out[ev] = lines;
    }
    if (Object.keys(out).length < RADIO_EVENTS.length / 2) throw Error('radio rejected');
    return out;
  }

  /** The dispatcher announces this run (one line, in the player's language). */
  async function dispatch({ d, car, zone, lang, last }) {
    const c = carById(car), L = lang === 'fa' ? 'Persian' : 'English';
    const lastLine = last ? `This driver already ran today: ${last.end === 'busted' ? 'got caught' : last.end === 'wrecked' ? 'wrecked the car' : 'survived to the time limit'} after ${Math.round(last.timeMs / 1000)} s with ${last.points} points.` : 'First sighting of this driver today.';
    const user = `You are "${d.dispatcher.en}", the police dispatcher in Sunset Bay. Today's operation: "${d.theme.en}" — ${d.briefing.en}
A getaway car was just spotted: a ${c.name} (${c.tag}) in ${ZONE_NAMES.en[zone] || 'Downtown'}. ${lastLine}
Write the single radio call that starts the chase, in ${L}, one or two short sentences, at most 150 characters. Mention the car and the district. Reply with the line only, no quotes.`;
    const text = await chat('dispatch', user, { maxTokens: 90, temperature: 1, timeoutMs: 6000, json: false });
    const line = clean(String(text).replace(/^["'«»“”]+|["'«»“”]+$/g, ''), 160);
    if (line.length < 8 || (lang === 'fa') !== /[؀-ۿ]/.test(line)) throw Error('dispatch rejected');
    return line;
  }

  /** Crew chief: specific advice from the verified numbers of one run. */
  async function chief({ result: r, car, rank, of, better, d, zone, cdone }) {
    const c = carById(car);
    const facts = {
      car: `${c.name} (${c.tag})`, ended: r.end, seconds: Math.round(r.timeMs / 1000), points: r.points, rank: rank ? `#${rank} of ${of} today` : 'unranked',
      betterThanPercentOfTodaysRuns: better, takedowns: r.takedowns, nearMisses: r.near, driftPoints: r.driftPts, bestChain: r.bestChain, topSpeedKmh: r.topSpeed,
      hitsTaken: r.hits, pitStopsUsed: `${r.repairs} of 3`, roadblocksDodged: r.dodges, heatReached: `${r.heat} of 5`, lastDistrict: ZONE_NAMES.en[zone] || '',
      todaysContracts: d ? d.contracts.map((k, i) => `${contractText(k, 'en')}: ${cdone?.[i] ? 'completed' : 'not completed'}`) : 'none on this route',
    };
    const user = `You are Ray, the player's crew chief in ESCAPE 60. Facts of the run that just ended (verified by replay): ${JSON.stringify(facts)}
Game knowledge: brake while steering to drift; drifts and near misses build a chain multiplier up to ×8; takedowns only count when the player causes them (ram 800, wall slam 1000, knocking traffic into a cop 1000, pile-up 1200, baiting a chasing cop into a crash 500) and each one refills nitro and gives a short speed surge, so hunting cops makes you faster; cops that crash on their own give nothing; pit stops repair the car up to 3 times; standing still near police fills the bust meter; nitro is earned mainly from takedowns (it refills only slowly on its own); at 60 s there is a +2,500 bonus and the chase continues.
Reply with JSON only:
{"tip":{"en":"one specific, actionable tip based on the weakest number, ≤160 chars","fa":"same in Persian"},
"headline":{"en":"a punchy sports-style headline about this run, ≤70 chars","fa":"..."},
"taunt":{"en":"a cheeky line this driver's ghost says to rivals, ≤60 chars","fa":"..."},
"persona":{"en":"a nickname-style title for this driver from the run's strongest number (e.g. Smoke Artist), ≤24 chars","fa":"..."},
"taunts":{${TAUNT_MOMENTS.map((k) => `"${k}":{"en":"≤60 chars","fa":"..."}`).join(',')}} (lines this driver's ghost says when racing others: start = race begins, passYou = the ghost overtakes the other driver, youPass = the other driver overtakes the ghost, milestone = 60 seconds survived, beaten = the other driver beat this score),
"next":{"type":"one of points|survive|drift|near|takedown|chain","goal":number a bit above this run}}`;
    const raw = await chat('chief', user, { maxTokens: 800, temperature: 0.8, timeoutMs: 9000 });
    return sanitizeChief(raw, r);
  }

  return { configured: !!cfg, model: cfg?.model || null, director, radio, dispatch, chief, chat };
}
