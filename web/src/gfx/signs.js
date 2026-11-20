import * as T from "../../vendor/three.js";

/* One canvas atlas for every printed / neon graphic in the city: billboard ads (original fictional
   brands), shop signs, the repair-station sign, the hillside SUNSET BAY letters, district gate signs
   and vertical neon blade signs. 1024 x 2048. */
export const ATLAS = { size: 1024, height: 2048 };
const BLADES = [["HOTEL", "#ff3d9a"], ["ARCADE", "#3df0ff"], ["RAMEN", "#ffd23f"], ["CLUB", "#c77dff"], ["BAR", "#ff6a3c"], ["KARAOKE", "#7cff9a"], ["24H", "#3df0ff"], ["NOODLE", "#ff3d6e"]];
const GATES = [
  ["neon", "NEON MILE", "#ff3d9a", "#3df0ff", "#140a22"], ["oldtown", "OLD TOWN", "#ffd9a0", "#e8b46a", "#3a1f14"], ["port", "THE DOCKS", "#ffc21a", "#ffffff", "#16202a"],
  ["midtown", "BRICK ROW", "#fff4e6", "#ff6a3c", "#3a1a14"], ["north", "TECH PARK", "#9ff6ff", "#5dffb0", "#0c1a24"], ["beach", "OCEAN DRIVE", "#ff8fb8", "#7ff3ff", "#2a1240"],
];
const cells = {};
const ADS = [
  { bg: ["#ff3d6e", "#ff9a3c"], title: "NEON NOODLES", sub: "OPEN ALL NIGHT", ink: "#fff" },
  { bg: ["#0f1b3d", "#1e4fd6"], title: "BAY FM 96.6", sub: "SYNTHWAVE · 24/7", ink: "#7ff3ff" },
  { bg: ["#16a37a", "#9be35a"], title: "GRIP TYRES", sub: "STICK TO THE ROAD", ink: "#fff" },
  { bg: ["#2b1052", "#c93cff"], title: "TURBO JUICE", sub: "ZERO TO HERO", ink: "#ffe14d" },
  { bg: ["#f4efe6", "#f7c9a3"], title: "PALM MOTEL", sub: "VACANCY · POOL · TV", ink: "#e2384d" },
  { bg: ["#111", "#3a3a3a"], title: "ESCAPE 60", sub: "HOW LONG CAN YOU RUN?", ink: "#ff2d6f" },
];
const SHOPS = [["CAFÉ", "#ff9a3c"], ["DINER", "#ff3d6e"], ["BAR", "#3df0ff"], ["SUSHI", "#ff5ad8"], ["PIZZA", "#ffd23f"], ["قهوه", "#7cff9a"], ["24H", "#3df0ff"], ["MOTEL", "#ff3d6e"]];
let texture = null, canvas = null;

export function atlasTexture() {
  if (texture) return texture;
  canvas = document.createElement("canvas");
  canvas.width = ATLAS.size; canvas.height = ATLAS.height;
  draw();
  texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = aniso;
  return texture;
}
let aniso = 4;
/** Called once the renderer is known: min(8, GPU max), so angled shop signs stay sharp without blur. */
export function setAtlasAnisotropy(n) { aniso = Math.max(1, n | 0); if (texture && texture.anisotropy !== aniso) { texture.anisotropy = aniso; texture.needsUpdate = true; } }
export function redrawAtlas() { if (!canvas) return; draw(); texture.needsUpdate = true; }
export function cell(name) { atlasTexture(); return cells[name]; }

function put(name, x, y, w, h) { const S = ATLAS.size, H = ATLAS.height; cells[name] = [x / S, 1 - (y + h) / H, (x + w) / S, 1 - y / H]; }
function draw() {
  const c = canvas.getContext("2d"), S = ATLAS.size;
  c.clearRect(0, 0, S, ATLAS.height);
  const font = (px, w = 400) => `${w} ${Math.round(px * 1.15)}px "Jersey 10", "Rooyin", "Vazirmatn", monospace`;
  ADS.forEach((ad, i) => {
    const x = (i % 2) * 512, y = Math.floor(i / 2) * 256;
    const g = c.createLinearGradient(x, y, x + 512, y + 256);
    g.addColorStop(0, ad.bg[0]); g.addColorStop(1, ad.bg[1]);
    c.fillStyle = g; c.fillRect(x, y, 512, 256);
    // diagonal speed stripes
    c.save(); c.beginPath(); c.rect(x, y, 512, 256); c.clip();
    c.globalAlpha = 0.18; c.fillStyle = "#fff";
    for (let k = -2; k < 8; k++) { c.beginPath(); c.moveTo(x + k * 80, y + 256); c.lineTo(x + k * 80 + 40, y + 256); c.lineTo(x + k * 80 + 160, y); c.lineTo(x + k * 80 + 120, y); c.fill(); }
    c.restore();
    c.globalAlpha = 1; c.fillStyle = ad.ink; c.textAlign = "left"; c.textBaseline = "alphabetic";
    c.font = font(86); c.fillText(ad.title, x + 30, y + 140, 450);
    c.font = font(36, 700); c.globalAlpha = 0.9; c.fillText(ad.sub, x + 34, y + 196, 440); c.globalAlpha = 1;
    put("ad" + i, x, y, 512, 256);
  });
  SHOPS.forEach(([text, col], i) => {
    const x = (i % 4) * 256, y = 768 + Math.floor(i / 4) * 64;
    c.fillStyle = "#08080c"; c.fillRect(x, y, 256, 64);
    c.shadowColor = col; c.shadowBlur = 14; c.fillStyle = col; c.textAlign = "center"; c.textBaseline = "middle";
    c.font = font(48); c.fillText(text, x + 128, y + 34, 230); c.shadowBlur = 0;
    put("shop" + i, x, y, 256, 64);
  });
  // repair station sign
  {
    const x = 0, y = 896, w = 512, h = 128;
    const g = c.createLinearGradient(x, y, x + w, y); g.addColorStop(0, "#0b1422"); g.addColorStop(1, "#13263f");
    c.fillStyle = g; c.fillRect(x, y, w, h);
    c.fillStyle = "#2ee6a0"; c.fillRect(x, y + h - 14, w, 14);
    wrench(c, x + 64, y + 58, 42, "#2ee6a0");
    c.fillStyle = "#ffffff"; c.textAlign = "left"; c.textBaseline = "middle"; c.font = font(64); c.fillText("PIT STOP", x + 124, y + 48, 370);
    c.fillStyle = "#9fffd8"; c.font = font(30, 700); c.fillText("REPAIR · NITRO · FUEL", x + 128, y + 92, 360);
    put("station", x, y, w, h);
  }
  // hillside letters
  {
    const x = 512, y = 896, w = 512, h = 128;
    c.clearRect(x, y, w, h);
    c.fillStyle = "#f6f3ec"; c.textAlign = "center"; c.textBaseline = "middle"; c.font = `400 112px "Jersey 10", monospace`;
    c.fillText("SUNSET BAY", x + w / 2, y + h / 2 + 4, w - 20);
    put("hill", x, y, w, h);
  }
  // vertical neon blade signs (letters stacked top to bottom)
  BLADES.forEach(([text, col], i) => {
    const x = i * 64, y = 1024, w = 64, h = 320;
    c.fillStyle = "#0a0710"; c.fillRect(x, y, w, h);
    c.strokeStyle = col; c.lineWidth = 4; c.strokeRect(x + 5, y + 5, w - 10, h - 10);
    c.shadowColor = col; c.shadowBlur = 12; c.fillStyle = col; c.textAlign = "center"; c.textBaseline = "middle";
    const n = text.length, step = Math.min(44, (h - 30) / n);
    c.font = font(Math.min(46, step * 1.05));
    for (let k = 0; k < n; k++) c.fillText(text[k], x + w / 2, y + 18 + step * (k + 0.5) + (h - 36 - step * n) / 2);
    c.shadowBlur = 0;
    put("blade" + i, x, y, w, h);
  });
  // district gate signs
  GATES.forEach(([id, text, col, col2, bg], i) => {
    const x = (i % 2) * 512, y = 1344 + Math.floor(i / 2) * 128, w = 512, h = 128;
    c.fillStyle = bg; c.fillRect(x, y, w, h);
    c.fillStyle = col2; c.fillRect(x, y, w, 8); c.fillRect(x, y + h - 8, w, 8);
    for (let k = 0; k < 16; k++) { c.fillStyle = k % 2 ? col : col2; c.fillRect(x + 6 + k * 31.5, y + 14, 14, 6); c.fillRect(x + 6 + k * 31.5, y + h - 20, 14, 6); }
    c.shadowColor = col; c.shadowBlur = 16; c.fillStyle = col; c.textAlign = "center"; c.textBaseline = "middle";
    c.font = font(78); c.fillText(text, x + w / 2, y + h / 2 + 4, w - 40); c.shadowBlur = 0;
    put("gate_" + id, x, y, w, h);
  });
}
function wrench(c, x, y, r, col) {
  c.save(); c.translate(x, y); c.rotate(-Math.PI / 4); c.fillStyle = col;
  c.fillRect(-r * 0.16, -r * 0.2, r * 0.32, r * 1.1);
  c.beginPath(); c.arc(0, -r * 0.45, r * 0.42, 0, Math.PI * 2); c.fill();
  c.globalCompositeOperation = "destination-out"; c.fillRect(-r * 0.14, -r * 0.95, r * 0.28, r * 0.5); c.globalCompositeOperation = "source-over";
  c.restore();
}
