// Captures four REAL in-engine screenshots at 390x780 (menu, driving, high-pressure chase, results).
// Usage: npm start (in another shell), then `node scripts/capture-screens.cjs` (GAME_URL / OUT_DIR optional).
// Inputs are scripted key presses fed to the real game loop; nothing is composited or mocked.
const { chromium } = require("playwright");
const path = require("node:path");
const OUT = process.env.OUT_DIR || path.join(__dirname, "..", "docs", "screenshots");
const URL_BASE = process.env.GAME_URL || "http://localhost:4173";
const SEED = process.env.SEED || "sunset-1";

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 1, hasTouch: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (e) => { if (e.type() === "error") errors.push(e.text()); });
  const shot = (name) => p.screenshot({ path: path.join(OUT, name + ".png") });
  const time = () => p.evaluate(() => Number(document.querySelector("#time").textContent));
  const waitTime = (t) => p.waitForFunction((t) => Number(document.querySelector("#time").textContent) >= t || document.body.dataset.view === "results", t, { timeout: 400000, polling: 50 });
  await p.goto(new URL("/?capture=1&seed=" + SEED + "&q=" + (process.env.QUALITY || "high"), URL_BASE).href);
  const freeze = (v) => p.evaluate((v) => window.__escape60.freeze(v), v);
  await p.waitForTimeout(6000);
  await shot("menu");
  await p.locator("#play").click();
  await waitTime(Number(process.env.DRIVE_AT || 7.4));
  await freeze(true);
  await shot("coastal");
  await freeze(false);
  // Weave between lanes to provoke drifts while the pursuit director escalates.
  const weaveFrom = Number(process.env.WEAVE_FROM || 44);
  const chaseAt = Number(process.env.CHASE_AT || 52.25);
  await waitTime(weaveFrom);
  let dir = "ArrowRight";
  while ((await time()) < chaseAt - 0.6 && !(await p.locator("#results").isVisible())) {
    await p.keyboard.down(dir);
    const start = await time();
    await p.waitForFunction(([s, h]) => Number(document.querySelector("#time").textContent) >= s + h || document.body.dataset.view !== "game", [start, Number(process.env.WEAVE_HOLD || 0.42)], { timeout: 60000, polling: 30 });
    await p.keyboard.up(dir);
    dir = dir === "ArrowRight" ? "ArrowLeft" : "ArrowRight";
  }
  await waitTime(chaseAt).catch(() => {});
  if ((await p.evaluate(() => document.body.dataset.view)) === "game") {
    await freeze(true);
    await p.waitForTimeout(400);
    await shot("pursuit");
    await freeze(false);
  } else console.log("Run ended before the pursuit capture time; no pursuit screenshot taken.");
  await p.locator("#results").waitFor({ state: "visible", timeout: 400000 });
  await p.waitForTimeout(Number(process.env.RESULT_WAIT || 2500));
  await shot("results");
  console.log((await p.locator("#results").innerText()).replace(/\n+/g, " | "));
  console.log(errors.length ? "Console errors:\n" + errors.join("\n") : "No console errors.");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
