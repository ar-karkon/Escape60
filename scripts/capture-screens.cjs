/* Real in-engine screenshots for docs/screenshots (needs `npm start`). Uses the capture hooks
   (?capture=1) to drive with an input-only autopilot and to jump to key moments. */
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require("playwright-core")); }
const path = require("node:path");
const OUT = path.join(__dirname, "..", "docs", "screenshots");
const URL0 = process.env.GAME_URL || "http://localhost:4173";
const pilot = () => {
  const E = window.__escape60, M = E.map;
  E.override = (g) => {
    const q = g.player, r = M.sample(q.x, q.y, {});
    if (r.e < 0) return 3;
    const pt = M.pointAt(r.e, r.s, {}), f = pt.tx * Math.cos(q.h) + pt.ty * Math.sin(q.h) >= 0 ? 1 : -1, L = M.edges[r.e].len;
    const t = M.pointAt(r.e, Math.max(0, Math.min(L, r.s + f * (12 + q.v * 0.45))), {});
    let d = Math.atan2(t.y + t.tx * f * 2.5 - q.y, t.x - t.ty * f * 2.5 - q.x) - q.h; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const nitro = window.__nitro && Math.abs(d) < 0.15, hand = window.__hand;
    return (Math.max(-3, Math.min(3, Math.round(d * 5 + (hand ? 2 : 0)))) + 3) | (Math.abs(d) > 0.4 && q.v > 28 ? 8 : 0) | (hand ? 16 : 0) | (nitro ? 32 : 0);
  };
};
async function open(browser, w, h, q = "", lang = "en") {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < h ? 2 : 1, hasTouch: w < h });
  const p = await ctx.newPage();
  await p.addInitScript((l) => { try { localStorage.setItem("escape60-lang", l); localStorage.setItem("escape60-profile-v2", JSON.stringify({ level: 18, xp: 0, runs: 5 })); } catch {} }, lang);
  await p.goto(`${URL0}/?capture=1&q=high&seed=capture-3${q}`);
  await p.waitForFunction(() => document.body.dataset.view === "home", null, { timeout: 180000 });
  await p.evaluate(pilot);
  await p.waitForTimeout(1500);
  return p;
}
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name) });
(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    let p = await open(browser, 390, 780);
    await shot(p, "menu.png");
    await p.click("#garage-open"); await p.waitForTimeout(1200); await shot(p, "garage.png");
    await p.click('.tab[data-tab="fx"]'); await p.waitForTimeout(600); await shot(p, "effects.png");
    await p.click("#garage-back"); await p.click("#play");
    await p.waitForTimeout(6000); await shot(p, "drive.png");
    await p.evaluate(() => { window.__nitro = true; window.__escape60.game().nitro = 1; }); await p.waitForTimeout(2200); await shot(p, "nitro.png");
    await p.evaluate(() => { window.__nitro = false; window.__hand = true; }); await p.waitForTimeout(900); await shot(p, "drift.png");
    await p.evaluate(() => { window.__hand = false; const E = window.__escape60; while (E.game().ticks < 3560 && E.game().state === "playing") { E.game().health = 100; E.fast(Math.min(300, 3560 - E.game().ticks)); } });
    await p.waitForTimeout(2600); await shot(p, "milestone.png");
    await p.evaluate(() => { const g = window.__escape60.game(); g.health = 28; });
    await p.waitForTimeout(2500); await shot(p, "damage.png");
    await p.evaluate(() => { const g = window.__escape60.game(); g.health = 2; g.repairs = 0; g.invuln = 0; window.__escape60.override = () => 6 | 32; });
    await p.waitForFunction(() => window.__escape60.state().state === "ended", null, { timeout: 90000 });
    await p.waitForTimeout(700); await shot(p, "explosion.png");
    await p.waitForFunction(() => document.body.dataset.view === "results", null, { timeout: 30000 });
    await p.waitForTimeout(1500); await shot(p, "results.png");
    await p.context().close();
    p = await open(browser, 390, 780, "&tod=night", "fa");
    await shot(p, "menu-fa-night.png");
    await p.click("#play"); await p.waitForTimeout(6500); await shot(p, "night.png");
    await p.context().close();
    p = await open(browser, 1280, 720, "&tod=sunset");
    await shot(p, "desktop-menu.png");
    await p.click("#play"); await p.waitForTimeout(6500); await shot(p, "desktop-drive.png");
    await p.screenshot({ path: path.join(__dirname, "..", "web", "assets", "og-card.jpg"), type: "jpeg", quality: 82, clip: { x: 40, y: 45, width: 1200, height: 630 } });
    await p.context().close();
    p = await open(browser, 1280, 720, "&tod=day");
    await p.click("#play"); await p.waitForTimeout(6500); await shot(p, "desktop-day.png");
    console.log("screenshots written to", OUT);
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
