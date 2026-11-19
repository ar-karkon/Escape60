let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require("playwright-core")); }
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || undefined,
    args: [
      "--no-sandbox",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 780 },
      hasTouch: true,
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const p = await ctx.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (e) => {
      if (e.type() === "error") errors.push(e.text());
    });
    const shot = (name) =>
      process.env.SMOKE_SHOTS ? p.screenshot({ path: process.env.SMOKE_SHOTS + "/" + name + ".png" }) : null;
    await p.goto(
      new URL(
        "/?seed=sunset-1",
        process.env.GAME_URL || "http://localhost:4173",
      ).href,
    );
    await p.waitForTimeout(900);
    await shot("menu");
    await p.locator("#settings").tap();
    await p.locator("#motion").check();
    await p.locator("#motion").uncheck();
    await p.locator("#close-config").tap();
    await p.locator("#garage-open").tap();
    await p.locator("#close-garage").tap();
    await p.locator("#missions-open").tap();
    assert.equal(await p.locator("#mission-list li").count(), 3);
    await p.locator("#close-missions").tap();
    await p.locator("#board").tap();
    await p.locator("#close-board").tap();
    await p.locator("#play").tap();
    await p.locator("#pause-button").tap();
    await p.locator("#resume").tap();
    const time = (t) =>
      p.waitForFunction(
        (t) => Number(document.querySelector("#time").textContent) >= t,
        t,
        { timeout: 160000 },
      );
    await time(2.4);
    await shot("coastal");
    await time(52.15);
    await shot("pursuit");
    await p.locator("#results").waitFor({ timeout: 90000 });
    await p.waitForFunction(() =>
      document.querySelector("#rank").textContent.includes("تأییدشده"),
    );
    await p.waitForTimeout(600);
    await shot("results");
    console.log(await p.locator("#results").innerText());
    await p.locator("#share").tap();
    await p.locator("#share-sheet").waitFor();
    await p.waitForFunction(() => document.querySelector("#share-preview").src.startsWith("data:image"), null, { timeout: 120000 });
    await p.locator("#copy-link").tap();
    const copied = await p.evaluate(() => navigator.clipboard.readText());
    assert.match(copied, /seed=sunset-1/);
    assert.match(copied, /[?&]c=\d+\.\d+/);
    assert.match(await p.locator("#net-telegram").getAttribute("href"), /^https:\/\/t\.me\/share\/url\?/);
    assert.match(await p.locator("#net-x").getAttribute("href"), /^https:\/\/x\.com\/intent\/post\?/);
    await p.locator("#close-share").tap();
    await p.locator("#replay").tap();
    await p.locator("#hud").waitFor();
    const cdp = await ctx.newCDPSession(p),
      rect = await p.locator("#left").boundingBox();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: rect.x + 20, y: rect.y + 20 }],
    });
    await p.waitForTimeout(1100);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    assert.ok(Number((await p.locator("#score").innerText()).replace(/,/g, "")) > 0, "steering should earn drift points");
    await p.locator("#pause-button").tap();
    await p.locator("#quit").tap();
    await p.locator("#home").waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "Mobile controls, pause, board, settings, share, replay, quit and console checks passed.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
