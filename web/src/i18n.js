/* English (default) and Persian UI strings. Language follows the browser (fa* → Persian) until the
   player picks one in Settings. `t(key, vars)` fills {name} placeholders. */
const S = {
  en: {
    title: "ESCAPE 60", tagline: "One city. 60 seconds. How long can you last?", playTag: "SUNSET BAY · 60s",
    loading: "Building Sunset Bay…", loadRoads: "Paving roads", loadTextures: "Painting streets", loadBuildings: "Raising the skyline", loadStreets: "Lane markings", loadWalls: "Guard rails & walls", loadProps: "Palms, lamps & pit stops", loadDone: "Ready",
    play: "START ESCAPE", playSub: "Lose the cops · survive · score", garage: "Garage", missions: "Missions", records: "Records", settings: "Settings", chain: "chain", mmLeft: "to escape", timeLabel: "survival time",
    daily: "Daily route · a new start point every run", friend: "Friend challenge · same start", random: "New random route",
    online: "● Global leaderboard online", offline: "Offline · records saved on this device", checking: "Connecting…",
    cars: "Cars", paint: "Paint", effects: "Effects", race: "Start escape", back: "Back", select: "SELECT", selected: "SELECTED", locked: "LV {n}",
    statSpeed: "Speed", statAccel: "Acceleration", statHandling: "Handling", statDrift: "Drift", statNitro: "Nitro", statArmor: "Armor",
    livery: "Livery", liv_clean: "Clean", liv_stripes: "Racing stripes", liv_side: "Side stripe", liv_twotone: "Two-tone", liv_race: "Race",
    paintStock: "Factory", accent: "Effect colour",
    fxSmoke: "Drift smoke", fxNitro: "Nitro flame", fxTrail: "Trail", fxBurst: "Combo burst",
    smoke_clean: "Clean", smoke_comic: "Comic", smoke_neon: "Neon", smoke_rainbow: "Rainbow", smoke_flame: "Fire",
    nitro_blue: "Blue jet", nitro_toxic: "Toxic", nitro_purple: "Plasma", nitro_inferno: "Inferno",
    trail_tail: "Light trails", trail_neon: "Neon tyres", trail_off: "Off",
    burst_graffiti: "Graffiti", burst_electric: "Electric", burst_clean: "Minimal",
    fxHint: "Effects are cosmetic. Pick a style before every run.",
    time: "TIME", score: "Total score", escapeIn: "ESCAPE {n}s", overtime: "overtime", heat: "pursuit", kmh: "KM/H",
    pit: "PIT STOP", noRepairs: "No repairs left", repaired: "REPAIRED! {n} LEFT", repairedLast: "REPAIRED! LAST ONE",
    drift: "DRIFT", driftLost: "DRIFT LOST", near: "CLOSE CALL", nearCop: "COP DODGE", dodge: "ROADBLOCK DODGE", takedown: "TAKEDOWN!",
    heatUp: "HEAT LEVEL {n}", roadblock: "⚠ ROADBLOCK AHEAD — find the gap", spikes: "SPIKE STRIP!", police: "Police unit joined",
    go: "GO!", milestone: "60 seconds!", milestoneSub: "You escaped — keep going!", bestTime: "Best", newRecord: "NEW RECORD", bonus: "+2,500 BONUS",
    busting: "BUSTING", pause: "Paused", resume: "Resume", restart: "Restart", quit: "Back to menu",
    wrecked: "Wrecked!", busted: "Busted!", legend: "Legend!", wreckedSub: "Your car exploded.", bustedSub: "The police boxed you in.", legendSub: "Ten minutes. Untouchable.",
    survived: "Survived", topSpeed: "Top speed", driftPts: "Drift points", nearMisses: "Close calls", takedowns: "Takedowns", bestChain: "Best chain", repairsUsed: "Pit stops", escapedBadge: "ESCAPED 60",
    retry: "Play again", menu: "Main menu", share: "Share & challenge",
    rankLocal: "Record saved on this device", rankPending: "Verifying run…", rankDone: "Global rank #{rank} of {of}", rankSaved: "Verified and saved", rankFail: "Could not verify online · saved on this device",
    xp: "XP", levelUp: "LEVEL {n}!", newCar: "New car: {name}", newPaint: "New paints unlocked", newFx: "New effect: {name}",
    lbTitle: "LEADERBOARD", lbEmpty: "No verified runs on this route yet. Be the first!", lbOff: "Global leaderboard unavailable.", lbYou: "Your best here: {score} pts · {time}",
    missionsTitle: "DAILY MISSIONS", missionHint: "+300 XP each · play on consecutive days for a streak bonus", playDaily: "PLAY TODAY'S ROUTE", done: "Done",
    m_escape: "Survive 60 seconds", m_survive90: "Survive 90 seconds", m_near8: "8 close calls in one run", m_drift3k: "3,000 drift points in one run", m_takedown1: "Take down a police car",
    m_takedown3: "3 takedowns in one run", m_chain5: "Reach a ×5 chain", m_speed250: "Hit 250 km/h", m_repair: "Use a pit stop", m_score10k: "Score 10,000 in one run", m_runs3: "Play 3 runs", m_dodge: "Dodge a roadblock",
    settingsTitle: "SETTINGS", language: "Language", music: "Music", sfx: "Sound effects", shake: "Camera shake", motion: "Reduce motion", graphics: "Graphics", g_auto: "Auto", g_high: "High", g_low: "Low",
    tod: "Time of day", tod_sunset: "Sunset", tod_night: "Night", tod_day: "Day", credits: "Credits & licenses", close: "CLOSE",
    howTo: "HOW TO PLAY", howKeys: "← → steer · ↓ brake · SPACE drift · SHIFT / ↑ nitro · P pause", howTouch: "Hold the LEFT or RIGHT half of the screen to steer · BRAKE while steering = drift · tap NITRO to boost",
    howGoal: "Lose the police for 60 seconds, then keep going. Drift, near-miss and take down cops to score. Damaged? Drive through a green PIT STOP (3 repairs).",
    shareTitle: "SHOW OFF YOUR RUN", story: "Story 9:16", post: "Post 4:5", wide: "Wide 16:9", shareImage: "SHARE IMAGE", copyLink: "COPY CHALLENGE LINK", copied: "Link copied ✓", save: "Save",
    friendBanner: "A friend challenged you: {score} pts in {time}. Same route — beat it!", friendWon: "🏆 You beat your friend's score!", friendLost: "{n} points short of your friend — one more run!",
    left: "Steer left", right: "Steer right", brake: "BRAKE", handbrake: "DRIFT", nitro: "NITRO", brakeDrift: "BRAKE · DRIFT",
    shareText: "I survived {time} in ESCAPE 60 and scored {score} points with the {car}. Beat that! #Escape60",
    you: "YOU", copBehind: "COP ON YOUR TAIL!", tailBanner: "⚠ PURSUIT — A COP LOCKED ON", city: "SUNSET BAY", skipIntro: "TAP TO SKIP",
    d_downtown: "DOWNTOWN", d_beach: "OCEAN DRIVE", d_port: "THE DOCKS", d_oldtown: "OLD TOWN", d_hills: "PALM HEIGHTS", d_canyon: "RED CANYON", d_park: "LAKESIDE PARK", d_north: "TECH PARK", d_neon: "NEON MILE", d_midtown: "BRICK ROW",
  },
  fa: {
    title: "فرار ۶۰", tagline: "یک شهر. شصت ثانیه برای فرار. بعدش تا کجا دووم میاری؟", playTag: "START ESCAPE",
    loading: "در حال ساختن خلیج غروب…", loadRoads: "آسفالت خیابان‌ها", loadTextures: "رنگ‌آمیزی خیابان‌ها", loadBuildings: "بالا بردن آسمان‌خراش‌ها", loadStreets: "خط‌کشی خیابان‌ها", loadWalls: "گاردریل و دیوارها", loadProps: "نخل، چراغ و پیت‌استاپ", loadDone: "آماده",
    play: "شروع فرار", playSub: "از پلیس فرار کن · زنده بمون · امتیاز بگیر", garage: "گاراژ", missions: "مأموریت روز", records: "رکوردها", settings: "تنظیمات", chain: "زنجیره", mmLeft: "تا فرار", timeLabel: "زمان بقا",
    daily: "مسیر روزانه · هر بار از یک جای شهر", friend: "چالش دوستانه · همان نقطه شروع", random: "مسیر تصادفی تازه",
    online: "● جدول جهانی آنلاین است", offline: "آفلاین · رکورد روی همین دستگاه", checking: "در حال اتصال…",
    cars: "ماشین‌ها", paint: "رنگ", effects: "افکت‌ها", race: "شروع فرار", back: "بازگشت", select: "انتخاب", selected: "انتخاب شده", locked: "سطح {n}",
    statSpeed: "سرعت", statAccel: "شتاب", statHandling: "کنترل", statDrift: "دریفت", statNitro: "نیترو", statArmor: "استحکام",
    livery: "طرح بدنه", liv_clean: "ساده", liv_stripes: "خط مسابقه", liv_side: "خط کناری", liv_twotone: "دو رنگ", liv_race: "مسابقه‌ای",
    paintStock: "کارخانه", accent: "رنگ افکت",
    fxSmoke: "دود دریفت", fxNitro: "شعله نیترو", fxTrail: "رد نور", fxBurst: "انفجار کمبو",
    smoke_clean: "سفید", smoke_comic: "کمیک", smoke_neon: "نئون", smoke_rainbow: "رنگین‌کمان", smoke_flame: "آتش",
    nitro_blue: "جت آبی", nitro_toxic: "سمی", nitro_purple: "پلاسما", nitro_inferno: "جهنمی",
    trail_tail: "رد چراغ", trail_neon: "رد لاستیک نئون", trail_off: "خاموش",
    burst_graffiti: "گرافیتی", burst_electric: "برقی", burst_clean: "ساده",
    fxHint: "افکت‌ها فقط ظاهری‌اند. قبل از هر مسابقه سبکت رو انتخاب کن.",
    time: "زمان", score: "امتیاز کل", escapeIn: "فرار تا {n} ثانیه", overtime: "وقت اضافه", heat: "تعقیب", kmh: "KM/H",
    pit: "پیت‌استاپ", noRepairs: "تعمیر باقی نمانده", repaired: "تعمیر شد! {n} بار دیگر", repairedLast: "تعمیر شد! آخرین بار",
    drift: "دریفت", driftLost: "دریفت از دست رفت", near: "از بیخ گوشش!", nearCop: "جاخالی از پلیس", dodge: "جاخالی از راه‌بند", takedown: "پلیس رو زدی!",
    heatUp: "سطح تعقیب {n}", roadblock: "⚠ راه‌بند جلوتر — راه باریک رو پیدا کن", spikes: "میخ‌های جاده!", police: "پلیس تازه رسید",
    go: "برو!", milestone: "۶۰ ثانیه!", milestoneSub: "فرار کردی — ادامه بده", bestTime: "بهترین", newRecord: "رکورد جدید", bonus: "+۲٬۵۰۰ جایزه",
    busting: "دستگیری", pause: "توقف بازی", resume: "ادامه بازی", restart: "از نو", quit: "برگشت به منو",
    wrecked: "منفجر شدی!", busted: "گیر افتادی!", legend: "افسانه شدی!", wreckedSub: "ماشینت منفجر شد.", bustedSub: "پلیس محاصره‌ات کرد.", legendSub: "ده دقیقه. دست‌نیافتنی.",
    survived: "زمان بقا", topSpeed: "بیشترین سرعت", driftPts: "امتیاز دریفت", nearMisses: "از بیخ گوش", takedowns: "پلیس‌های نابود", bestChain: "بهترین زنجیره", repairsUsed: "پیت‌استاپ", escapedBadge: "۶۰ ثانیه فرار",
    retry: "دوباره بازی کن", menu: "منوی اصلی", share: "اشتراک و چالش",
    rankLocal: "رکورد روی همین دستگاه ذخیره شد", rankPending: "در حال تأیید رکورد…", rankDone: "رتبه جهانی #{rank} از {of}", rankSaved: "تأیید و ثبت شد", rankFail: "تأیید آنلاین نشد · رکورد روی همین دستگاه ذخیره شد",
    xp: "XP", levelUp: "سطح {n}!", newCar: "ماشین تازه: {name}", newPaint: "رنگ‌های تازه باز شد", newFx: "افکت تازه: {name}",
    lbTitle: "جدول رکوردها", lbEmpty: "هنوز رکورد تأییدشده‌ای برای این مسیر نیست. اولی باش!", lbOff: "جدول جهانی در دسترس نیست.", lbYou: "بهترین تو: {score} امتیاز · {time}",
    missionsTitle: "مأموریت‌های روزانه", missionHint: "هر مأموریت +۳۰۰ XP · بازی روزهای پشت سر هم جایزه دارد", playDaily: "مسیر امروز", done: "انجام شد",
    m_escape: "۶۰ ثانیه دوام بیاور", m_survive90: "۹۰ ثانیه دوام بیاور", m_near8: "۸ بار از بیخ گوش در یک دور", m_drift3k: "۳٬۰۰۰ امتیاز دریفت در یک دور", m_takedown1: "یک ماشین پلیس رو نابود کن",
    m_takedown3: "۳ پلیس در یک دور", m_chain5: "زنجیره ×۵", m_speed250: "به ۲۵۰ کیلومتر برس", m_repair: "از پیت‌استاپ استفاده کن", m_score10k: "۱۰٬۰۰۰ امتیاز در یک دور", m_runs3: "۳ دور بازی کن", m_dodge: "از یک راه‌بند جاخالی بده",
    settingsTitle: "تنظیمات", language: "زبان", music: "موسیقی", sfx: "افکت صوتی", shake: "لرزش دوربین", motion: "کاهش حرکت", graphics: "گرافیک", g_auto: "خودکار", g_high: "بالا", g_low: "سبک",
    tod: "زمان روز", tod_sunset: "غروب", tod_night: "شب", tod_day: "روز", credits: "سازندگان و مجوزها", close: "بستن",
    howTo: "راهنما", howKeys: "← → فرمان · ↓ ترمز · SPACE دریفت · SHIFT / ↑ نیترو · P توقف", howTouch: "نیمه‌ی چپ یا راست صفحه رو نگه دار تا بپیچی · ترمز موقع پیچیدن = دریفت · برای نیترو یک بار بزن",
    howGoal: "۶۰ ثانیه از پلیس فرار کن و بعد ادامه بده. با دریفت، رد شدن از بیخ گوش و زدن پلیس امتیاز بگیر. ماشین آسیب دید؟ از پیت‌استاپ سبز رد شو (۳ تعمیر).",
    shareTitle: "رکوردت رو به رخ بکش", story: "استوری ۹:۱۶", post: "پست ۴:۵", wide: "افقی ۱۶:۹", shareImage: "اشتراک تصویر", copyLink: "کپی لینک چالش", copied: "لینک کپی شد ✓", save: "ذخیره",
    friendBanner: "دوستت به چالشت کشیده: {score} امتیاز در {time}. همین مسیر — بزنش!", friendWon: "🏆 امتیاز دوستت رو زدی!", friendLost: "{n} امتیاز تا رکورد دوستت — یک دور دیگه!",
    left: "فرمان چپ", right: "فرمان راست", brake: "ترمز", handbrake: "دریفت", nitro: "نیترو", brakeDrift: "ترمز · دریفت",
    shareText: "در فرار ۶۰ با {car} {time} دوام آوردم و {score} امتیاز گرفتم. بزنش! #Escape60",
    you: "تو", copBehind: "پلیس پشت سرته!", tailBanner: "⚠ تعقیب — پلیس روت قفل کرده", city: "خلیج غروب", skipIntro: "برای رد شدن بزن",
    d_downtown: "مرکز شهر", d_beach: "بلوار ساحلی", d_port: "اسکله", d_oldtown: "شهر قدیم", d_hills: "تپه‌های نخل", d_canyon: "دره سرخ", d_park: "پارک دریاچه", d_north: "شهرک فناوری", d_neon: "راسته نئون", d_midtown: "محله آجری",
  },
};
const KEY = "escape60-lang";
let lang = (() => { try { const v = localStorage.getItem(KEY); if (v === "en" || v === "fa") return v; } catch {} return /^fa\b/i.test(navigator.language || "") ? "fa" : "en"; })();
export const getLang = () => lang;
export function setLang(l) { lang = l === "fa" ? "fa" : "en"; try { localStorage.setItem(KEY, lang); } catch {} applyI18n(); }
export function t(key, vars) {
  let s = S[lang][key] ?? S.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}
export const num = (n) => (lang === "fa" ? Number(n).toLocaleString("fa-IR") : Math.round(n).toLocaleString("en-US"));
export function applyI18n(root = document) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
  for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll("[data-i18n-label]")) el.setAttribute("aria-label", t(el.dataset.i18nLabel));
}
