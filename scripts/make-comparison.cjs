// Builds docs/screenshots/comparison.jpg: each concept reference next to the REAL engine screenshot.
// The real screenshots must already exist (npm run capture). Images are only placed side by side.
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const pairs = [
  ["01_main_menu_reference.png", "menu.png", "Main menu"],
  ["02_coastal_chase_reference.png", "coastal.png", "Driving"],
  ["03_action_intersection_reference.png", "pursuit.png", "High-pressure chase"],
  ["04_results_reference.png", "results.png", "Results"],
];
const data = (p) => "data:image/png;base64," + fs.readFileSync(p).toString("base64");
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 4 * 880 + 60, height: 900 } });
  const cols = pairs.map(([ref, real, title]) => `
    <div class="pair"><h2>${title}</h2><div class="row">
      <figure><img src="${data(path.join(root, "design/references", ref))}" style="height:780px"><figcaption>Concept reference</figcaption></figure>
      <figure><img src="${data(path.join(root, "docs/screenshots", real))}" style="height:780px"><figcaption>Real engine · 390×780 · ${real}</figcaption></figure>
    </div></div>`).join("");
  await page.setContent(`<style>body{margin:0;background:#1b0b2b;color:#fff4e6;font:600 18px sans-serif;display:flex;gap:20px;padding:10px 20px}
    .row{display:flex;gap:6px}figure{margin:0}figcaption{font-size:14px;opacity:.75;margin-top:4px}h2{margin:4px 0 8px;font-size:20px}</style>${cols}`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(root, "docs/screenshots/comparison.jpg"), fullPage: true, type: "jpeg", quality: 82 });
  await b.close();
  console.log("docs/screenshots/comparison.jpg written");
})();
