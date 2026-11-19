/* Mobile smoke test against a running server (npm start): menus, garage, a real autopiloted run that
   ends naturally, server-side replay verification and the share sheet. */
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require("playwright-core")); }
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, permissions: ["clipboard-read", "clipboard-write"] });
    const p = await ctx.newPage(), errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (e) => { if (e.type() === "error" && !/status of 4\d\d/.test(e.text())) errors.push(e.text()); });
    await p.goto(new URL("/?seed=smoke-1&q=low&capture=1", process.env.GAME_URL || "http://localhost:4173").href);
    await p.waitForFunction(() => document.body.dataset.view === "home", null, { timeout: 120000 });
    await p.locator("#settings-open").tap(); await p.locator("#shake-toggle + .switch").tap(); await p.locator("#close-config").tap();
    await p.locator("#missions-open").tap(); assert.equal(await p.locator("#mission-list li").count(), 3); await p.locator("#close-missions").tap();
    await p.locator("#board-open").tap(); await p.locator("#close-board").tap();
    await p.locator("#garage-open").tap();
    assert.equal(await p.locator(".car-card").count(), 14);
    await p.locator('.tab[data-tab="fx"]').tap(); await p.locator('[data-fx="smoke"][data-v="comic"]').tap();
    await p.locator("#garage-back").tap();
    // autopilot (input only: the run stays legitimate and must verify on the server)
    await p.evaluate(() => {
      const E = window.__escape60, M = E.map;
      E.override = (g) => {
        const q = g.player, r = M.sample(q.x, q.y, {});
        if (r.e < 0) return 3;
        const pt = M.pointAt(r.e, r.s, {}), f = pt.tx * Math.cos(q.h) + pt.ty * Math.sin(q.h) >= 0 ? 1 : -1, L = M.edges[r.e].len;
        const t = M.pointAt(r.e, Math.max(0, Math.min(L, r.s + f * (12 + q.v * 0.45))), {});
        let d = Math.atan2(t.y + t.tx * f * 2.5 - q.y, t.x - t.ty * f * 2.5 - q.x) - q.h; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        return (Math.max(-3, Math.min(3, Math.round(d * 5))) + 3) | (Math.abs(d) > 0.4 && q.v > 28 ? 8 : 0);
      };
    });
    await p.locator("#play").tap();
    await p.waitForFunction(() => window.__escape60.state()?.ticks > 120, null, { timeout: 60000 });
    await p.locator("#pause-btn").tap(); await p.locator("#resume").tap();
    await p.waitForFunction(() => document.body.dataset.view === "results", null, { timeout: 400000 });
    console.log(await p.locator(".res-card").innerText());
    await p.waitForFunction(() => /Global rank|Verified|verify/i.test(document.querySelector("#rank").textContent) && !/Verifying/.test(document.querySelector("#rank").textContent), null, { timeout: 60000 });
    const rank = await p.locator("#rank").innerText();
    console.log("rank:", rank);
    if (!process.env.OFFLINE) assert.match(rank, /Global rank|Verified/);
    await p.locator("#share").tap();
    await p.waitForFunction(() => document.querySelector("#share-preview").src.startsWith("data:image"), null, { timeout: 120000 });
    await p.locator("#copy-link").tap();
    assert.match(await p.evaluate(() => navigator.clipboard.readText()), /seed=smoke-1&c=\d+\.\d+/);
    await p.locator("#close-share").tap();
    assert.deepEqual(errors, []);
    console.log("smoke OK");
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
