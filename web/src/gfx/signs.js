import * as T from "../../vendor/three.js";

/* Original pixel-art neon signs and billboard ads drawn into one small atlas texture.
   All names and brands are invented for the fictional Sunset Bay. */
const W = 512, H = 512;
const PIX = '"Jersey 10", "Courier New", monospace';
const FA = 'Vazirmatn, Tahoma, sans-serif';

const SIGNS = [
  // name, w, h, kind, text, colour, extra
  ["hotel", 64, 16, "neon", "HOTEL", "#ff5d95"],
  ["motel", 64, 16, "neon", "MOTEL", "#3dd8e7"],
  ["cafe", 48, 16, "neon", "CAFE", "#ffe37c"],
  ["cafeFa", 48, 16, "neonFa", "کافه", "#3dd8e7"],
  ["superFa", 48, 16, "neonFa", "سوپر", "#5dffb0"],
  ["hotelFa", 48, 16, "neonFa", "هتل", "#ff8a3d"],
  ["juiceFa", 56, 16, "neonFa", "آبمیوه", "#ff5d95"],
  ["sweetFa", 56, 16, "neonFa", "شیرینی", "#ffe37c"],
  ["pizzaFa", 48, 16, "neonFa", "پیتزا", "#ff8a3d"],
  ["sushi", 48, 16, "neon", "SUSHI", "#c77dff"],
  ["pizza", 48, 16, "neon", "PIZZA", "#ff8a3d"],
  ["bar", 32, 16, "neon", "BAR", "#ff5d95"],
  ["disco", 48, 16, "neon", "DISCO", "#c77dff"],
  ["surf", 48, 16, "neon", "SURF", "#3dd8e7"],
  ["diner", 48, 16, "neon", "DINER", "#ff416a"],
  ["open", 40, 16, "neon", "OPEN", "#5dffb0"],
  ["tacos", 48, 16, "neon", "TACOS", "#ffe37c"],
  ["gym", 32, 16, "neon", "GYM", "#3dd8e7"],
  ["vPalms", 16, 72, "vert", "PALMS", "#ff5d95"],
  ["vAzure", 16, 72, "vert", "AZURE", "#3dd8e7"],
  ["vNeon", 16, 64, "vert", "NEON", "#c77dff"],
  ["vHotel", 16, 72, "vert", "HOTEL", "#ffe37c"],
  ["vBay", 16, 48, "vert", "BAY", "#ff8a3d"],
  ["adEscape", 128, 64, "adEscape"],
  ["adRadio", 128, 64, "adRadio"],
  ["adCola", 128, 64, "adCola"],
  ["adBay", 128, 64, "adBay"],
  ["adBurger", 128, 64, "adBurger"],
  ["adTurbo", 128, 64, "adTurbo"],
  ["exit", 96, 32, "highway", "EXIT 60  ►", "مرکز شهر"],
  ["beach", 96, 32, "highway", "◄ BEACH", "ساحل غروب"],
  ["iconPalm", 32, 32, "iconPalm"],
  ["iconFlamingo", 32, 32, "iconFlamingo"],
  ["iconCocktail", 32, 32, "iconCocktail"],
  ["iconArrow", 32, 32, "iconArrow"],
  ["motelBig", 48, 96, "motelBig"],
  ["shopFront", 64, 16, "awningTxt", "BOUTIQUE", "#fff4e6"],
  ["kiosk", 32, 16, "neon", "24/7", "#5dffb0"],
  ["police", 64, 16, "plain", "POLICE", "#1a1d33"],
  ["welcome", 128, 24, "neonWide", "SUNSET BAY", "#ff5d95"],
  ["welcomeFa", 96, 24, "neonWideFa", "خلیج غروب", "#3dd8e7"],
];

let canvas = null, ctx = null;
export const atlasRects = {};
{
  // Shelf-pack once; layout never changes so geometry UVs stay valid after redraws.
  let x = 0, y = 0, row = 0;
  for (const s of SIGNS) {
    const [name, w, h] = s;
    if (x + w + 2 > W) { x = 0; y += row + 2; row = 0; }
    atlasRects[name] = { x, y, w, h, u0: x / W, v0: 1 - (y + h) / H, u1: (x + w) / W, v1: 1 - y / H, aspect: w / h };
    x += w + 2;
    row = Math.max(row, h);
  }
}
export const atlasTexture = (() => {
  canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  if (!canvas) return null;
  canvas.width = W;
  canvas.height = H;
  ctx = canvas.getContext("2d");
  drawAll();
  const tex = new T.CanvasTexture(canvas);
  tex.magFilter = T.NearestFilter;
  tex.minFilter = T.NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = true;
  return tex;
})();

export function redrawAtlas() {
  if (!ctx) return;
  drawAll();
  atlasTexture.needsUpdate = true;
}

function px(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
function frame(r, bg, edge) {
  px(r.x, r.y, r.w, r.h, bg);
  ctx.strokeStyle = edge; ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
}
function glowText(text, cx, cy, size, color, font, align = "center") {
  ctx.font = `bold ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.shadowColor = color; ctx.shadowBlur = 3;
  ctx.fillStyle = color;
  ctx.fillText(text, cx, cy);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = 0.55;
  ctx.fillText(text, cx, cy - 0.5);
  ctx.globalAlpha = 1;
}
function sunsetBg(r, top, bottom) {
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  g.addColorStop(0, top); g.addColorStop(1, bottom);
  ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h);
}
function pixelSun(cx, cy, rad) {
  for (let yy = -rad; yy <= 0; yy++) {
    const half = Math.floor(Math.sqrt(rad * rad - yy * yy));
    if (yy > -rad / 2 && (yy & 1)) continue;
    px(cx - half, cy + yy, half * 2, 1, yy < -rad / 2 ? "#ffe37c" : "#ffad65");
  }
}
function palmSil(x, y, s, c) {
  for (let i = 0; i < 12 * s; i++) px(x + Math.round(i * 0.18), y - i, 2, 1, c);
  const tx = x + Math.round(12 * s * 0.18), ty = y - 12 * s;
  for (const [dx, dy] of [[-6, 2], [6, 2], [-5, -2], [5, -2], [0, -4], [-8, 5], [8, 5]]) {
    const n = 7;
    for (let k = 0; k < n; k++) px(tx + Math.round((dx * k) / n), ty + Math.round((dy * k) / n + (k * k) / 14), 2, 1, c);
  }
}
function drawAll() {
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  for (const s of SIGNS) {
    const [name, , , kind, text, color, extra] = s;
    const r = atlasRects[name];
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    if (kind === "neon" || kind === "neonFa") {
      frame(r, "#180f2b", "#3b2a5c");
      glowText(text, r.x + r.w / 2, r.y + r.h / 2 + (kind === "neonFa" ? 1 : 1), kind === "neonFa" ? 11 : 11, color, kind === "neonFa" ? FA : PIX);
    } else if (kind === "neonWide" || kind === "neonWideFa") {
      frame(r, "#160b28", color);
      glowText(text, r.x + r.w / 2, r.y + r.h / 2 + 1, kind === "neonWide" ? 20 : 15, color, kind === "neonWide" ? PIX : FA);
    } else if (kind === "vert") {
      frame(r, "#180f2b", color);
      const n = text.length;
      for (let i = 0; i < n; i++) glowText(text[i], r.x + r.w / 2, r.y + 8 + i * ((r.h - 12) / n) + 2, 11, color, PIX);
    } else if (kind === "plain") {
      px(r.x, r.y, r.w, r.h, "#f4f1ea");
      ctx.font = `bold 11px ${PIX}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = color; ctx.fillText(text, r.x + r.w / 2, r.y + r.h / 2 + 1);
    } else if (kind === "awningTxt") {
      px(r.x, r.y, r.w, r.h, "#2a1c3f");
      glowText(text, r.x + r.w / 2, r.y + r.h / 2 + 1, 10, color, PIX);
    } else if (kind === "highway") {
      frame(r, "#0f6b4d", "#e9f7ef");
      ctx.fillStyle = "#f4fff8"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = `bold 11px ${PIX}`; ctx.fillText(text, r.x + r.w / 2, r.y + 10);
      ctx.font = `bold 10px ${FA}`; ctx.fillText(color, r.x + r.w / 2, r.y + 23);
    } else if (kind === "adEscape") {
      sunsetBg(r, "#3b1d6e", "#ff5d95");
      pixelSun(r.x + 92, r.y + 44, 18);
      px(r.x, r.y + 44, r.w, 20, "#2a1240");
      for (let i = 0; i < 6; i++) px(r.x, r.y + 46 + i * 3, r.w, 1, i % 2 ? "#ff5d9555" : "#3dd8e744");
      palmSil(r.x + 14, r.y + 46, 2.2, "#1a0d2b");
      palmSil(r.x + 112, r.y + 50, 1.6, "#1a0d2b");
      glowText("ESCAPE", r.x + 52, r.y + 16, 16, "#fff4e6", PIX);
      glowText("60", r.x + 52, r.y + 33, 18, "#ff416a", PIX);
    } else if (kind === "adRadio") {
      sunsetBg(r, "#1b1140", "#51216c");
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = ["#3dd8e7", "#c77dff", "#ff5d95", "#ffe37c"][i];
        ctx.beginPath(); ctx.arc(r.x + 22, r.y + 32, 6 + i * 5, -0.9, 0.9); ctx.stroke();
      }
      glowText("SUNSET", r.x + 78, r.y + 18, 14, "#ffad65", PIX);
      glowText("FM 60.6", r.x + 78, r.y + 36, 14, "#3dd8e7", PIX);
      ctx.font = `bold 9px ${FA}`; ctx.fillStyle = "#fff4e6"; ctx.textAlign = "center";
      ctx.fillText("رادیو ساحل", r.x + 78, r.y + 53);
    } else if (kind === "adCola") {
      sunsetBg(r, "#0b4f5c", "#19b8bc");
      px(r.x + 18, r.y + 14, 10, 40, "#e8fbff"); px(r.x + 20, r.y + 8, 6, 8, "#e8fbff");
      px(r.x + 19, r.y + 26, 8, 10, "#ff5d95");
      glowText("NEON", r.x + 80, r.y + 20, 16, "#fff4e6", PIX);
      glowText("COLA", r.x + 80, r.y + 40, 16, "#ff5d95", PIX);
    } else if (kind === "adBay") {
      sunsetBg(r, "#ff8872", "#ffe37c");
      pixelSun(r.x + 30, r.y + 40, 16);
      px(r.x, r.y + 40, r.w, 24, "#19b8bc");
      for (let i = 0; i < 5; i++) px(r.x + 10 + i * 23, r.y + 46 + (i % 2) * 6, 14, 1, "#e8fbff");
      palmSil(r.x + 104, r.y + 44, 2, "#2a1240");
      ctx.font = `bold 15px ${FA}`; ctx.fillStyle = "#2a1240"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("خلیج غروب", r.x + 72, r.y + 18);
    } else if (kind === "adBurger") {
      sunsetBg(r, "#ffad65", "#ff5d95");
      px(r.x + 12, r.y + 18, 30, 8, "#c86b2c"); px(r.x + 10, r.y + 26, 34, 4, "#5dd06f");
      px(r.x + 10, r.y + 30, 34, 6, "#5b2b1a"); px(r.x + 12, r.y + 36, 30, 6, "#c86b2c");
      glowText("BAY", r.x + 86, r.y + 20, 16, "#2a1240", PIX);
      glowText("BURGER", r.x + 86, r.y + 40, 14, "#fff4e6", PIX);
    } else if (kind === "adTurbo") {
      sunsetBg(r, "#111633", "#8d54e9");
      for (let i = 0; i < 8; i++) px(r.x, r.y + 40 + i * 3, r.w, 1, "#3dd8e755");
      px(r.x + 64, r.y + 30, 50, 10, "#ff873c"); px(r.x + 74, r.y + 23, 28, 8, "#ff873c");
      px(r.x + 78, r.y + 25, 20, 5, "#1a1b33"); px(r.x + 70, r.y + 38, 8, 6, "#111"); px(r.x + 100, r.y + 38, 8, 6, "#111");
      px(r.x + 112, r.y + 32, 3, 3, "#ffe37c");
      glowText("TURBO", r.x + 34, r.y + 18, 14, "#3dd8e7", PIX);
      ctx.font = `bold 10px ${FA}`; ctx.fillStyle = "#fff4e6"; ctx.textAlign = "center";
      ctx.fillText("تعمیرگاه", r.x + 34, r.y + 40);
    } else if (kind === "iconPalm") {
      px(r.x, r.y, r.w, r.h, "#180f2b"); palmSil(r.x + 14, r.y + 30, 1.6, "#3dd8e7");
    } else if (kind === "iconFlamingo") {
      px(r.x, r.y, r.w, r.h, "#180f2b");
      const c = "#ff5d95";
      px(r.x + 10, r.y + 14, 12, 6, c); px(r.x + 20, r.y + 6, 2, 9, c); px(r.x + 20, r.y + 5, 5, 2, c);
      px(r.x + 15, r.y + 20, 1, 9, c); px(r.x + 13, r.y + 28, 4, 1, c);
    } else if (kind === "iconCocktail") {
      px(r.x, r.y, r.w, r.h, "#180f2b");
      ctx.strokeStyle = "#ffe37c"; ctx.beginPath(); ctx.moveTo(r.x + 6, r.y + 6); ctx.lineTo(r.x + 26, r.y + 6);
      ctx.lineTo(r.x + 16, r.y + 18); ctx.closePath(); ctx.stroke();
      px(r.x + 15, r.y + 18, 2, 8, "#ffe37c"); px(r.x + 10, r.y + 26, 12, 2, "#ffe37c"); px(r.x + 20, r.y + 3, 2, 6, "#5dffb0");
    } else if (kind === "iconArrow") {
      px(r.x, r.y, r.w, r.h, "#180f2b");
      for (let i = 0; i < 10; i++) px(r.x + 6 + i, r.y + 16 - i, 2, i * 2 + 1, "#ffe37c");
      px(r.x + 16, r.y + 12, 12, 8, "#ffe37c");
    } else if (kind === "motelBig") {
      frame(r, "#180f2b", "#ff5d95");
      const letters = "MOTEL";
      for (let i = 0; i < 5; i++) glowText(letters[i], r.x + 24, r.y + 12 + i * 15, 13, i % 2 ? "#3dd8e7" : "#ff5d95", PIX);
      glowText("★", r.x + 24, r.y + 88, 9, "#ffe37c", PIX);
    }
    ctx.restore();
  }
}
