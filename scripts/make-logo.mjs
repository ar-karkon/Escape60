// Generates web/assets/logo.svg: an original chunky pixel-art ESCAPE 60 wordmark.
// Run: node scripts/make-logo.mjs
import { writeFile } from "node:fs/promises";

const G = {
  E: ["111111", "111111", "110000", "11111.", "11111.", "110000", "111111", "111111"],
  S: [".11111", "111111", "110000", "11111.", ".11111", "....11", "111111", "11111."],
  C: [".11111", "111111", "110000", "110000", "110000", "110000", "111111", ".11111"],
  A: [".1111.", "111111", "11..11", "11..11", "111111", "111111", "11..11", "11..11"],
  P: ["11111.", "111111", "11..11", "11..11", "111111", "11111.", "11....", "11...."],
  6: [".111111.", "11111111", "111.....", "1111111.", "11111111", "111..111", "111..111", "111..111", "11111111", ".111111."],
  0: [".111111.", "11111111", "111..111", "111..111", "111..111", "111..111", "111..111", "111..111", "11111111", ".111111."],
};

function glyphPixels(word, scale, x0, y0, gap) {
  const px = [];
  let x = x0;
  for (const ch of word) {
    const g = G[ch];
    g.forEach((row, r) => [...row].forEach((c, k) => {
      if (c === "1") for (let a = 0; a < scale; a++) for (let b = 0; b < scale; b++) px.push([x + k * scale + a, y0 + r * scale + b]);
    }));
    x += g[0].length * scale + gap;
  }
  return { px, width: x - gap - x0 };
}
const key = (x, y) => x + "," + y;
function toPath(set) {
  // merge horizontal runs per row
  const rows = new Map();
  for (const k of set) {
    const [x, y] = k.split(",").map(Number);
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push(x);
  }
  let d = "";
  for (const [y, xs] of [...rows].sort((a, b) => a[0] - b[0])) {
    xs.sort((a, b) => a - b);
    let s = xs[0], p = xs[0];
    for (let i = 1; i <= xs.length; i++) {
      if (i < xs.length && xs[i] === p + 1) { p = xs[i]; continue; }
      d += `M${s} ${y}h${p - s + 1}v1h-${p - s + 1}z`;
      if (i < xs.length) { s = xs[i]; p = xs[i]; }
    }
  }
  return d;
}
function grow(set, r) {
  const out = new Set();
  for (const k of set) {
    const [x, y] = k.split(",").map(Number);
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) if (Math.abs(a) + Math.abs(b) <= r + (r > 1 ? 1 : 0)) out.add(key(x + a, y + b));
  }
  return out;
}
function shift(set, dx, dy) {
  const out = new Set();
  for (const k of set) { const [x, y] = k.split(",").map(Number); out.add(key(x + dx, y + dy)); }
  return out;
}
const union = (...sets) => { const o = new Set(); for (const s of sets) for (const k of s) o.add(k); return o; };

const W = 170, H = 112;
// Words
const esc = glyphPixels("ESCAPE", 3, 0, 0, 3);
const escX = Math.round((W - esc.width) / 2);
const E = new Set(glyphPixels("ESCAPE", 3, escX, 34, 3).px.map(([x, y]) => key(x, y)));
const sixty = glyphPixels("60", 4, 0, 0, 4);
const sx = Math.round((W - sixty.width) / 2);
const S = new Set(glyphPixels("60", 4, sx, 64, 4).px.map(([x, y]) => key(x, y)));

// Layers
const outlineE = grow(E, 2), outlineS = grow(S, 2);
let extrude = new Set();
for (let i = 1; i <= 4; i++) extrude = union(extrude, shift(outlineE, i, i), shift(outlineS, i, i));
const outline = union(outlineE, outlineS);

// Sun + skyline + palm behind the wordmark
const sun = new Set(), sunGaps = [];
const scx = 85, scy = 36, sr = 26;
for (let y = scy - sr; y < scy; y++) for (let x = scx - sr; x <= scx + sr; x++) {
  if ((x - scx) ** 2 + (y - scy + 0.5) ** 2 <= sr * sr) {
    const t = (scy - y) / sr;
    const gap = t < 0.5 && (y % 4 === 0 || (t < 0.25 && y % 4 === 1));
    if (!gap) sun.add(key(x, y));
  }
}
const sky = new Set();
const towers = [[50, 14, 7], [58, 22, 5], [64, 10, 6], [104, 18, 6], [111, 26, 8], [120, 12, 5], [127, 8, 4], [44, 6, 5]];
for (const [x0, h, w] of towers) for (let x = x0; x < x0 + w; x++) for (let y = 34 - h; y < 34; y++) sky.add(key(x, y));
const lit = new Set();
for (const [x0, h, w] of towers) for (let x = x0 + 1; x < x0 + w - 1; x += 2) for (let y = 34 - h + 2; y < 32; y += 3) if ((x * 7 + y * 3) % 5 < 2) lit.add(key(x, y));
// palm silhouette
const palm = new Set();
for (let i = 0; i < 16; i++) { palm.add(key(Math.round(138 + i * 0.25), 34 - i)); palm.add(key(Math.round(139 + i * 0.25), 34 - i)); }
const ptx = 142, pty = 18;
for (const [dx, dy] of [[-9, 4], [9, 4], [-8, -2], [8, -2], [0, -5], [-11, 8], [11, 8]]) {
  for (let k = 0; k <= 9; k++) {
    const x = Math.round(ptx + (dx * k) / 9), y = Math.round(pty + (dy * k) / 9 + (k * k) / 18);
    palm.add(key(x, y)); palm.add(key(x, y + 1));
  }
}

// Checkered flags beside "60"
const flags = { a: new Set(), b: new Set() };
for (const [fx, dir] of [[sx - 34, 1], [sx + sixty.width + 6, -1]]) {
  for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) {
    const set = (r + c) % 2 ? flags.a : flags.b;
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) set.add(key(fx + c * 4 + a + (dir > 0 ? -r : r), 74 + r * 4 + b));
  }
}
const flagOutline = grow(union(flags.a, flags.b), 1);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -2 ${W + 12} ${H}" shape-rendering="crispEdges">
<defs>
<linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe37c"/><stop offset=".55" stop-color="#ffad65"/><stop offset="1" stop-color="#ff5d95"/></linearGradient>
<linearGradient id="cream" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#fff4e6"/><stop offset=".56" stop-color="#ffd9e6"/><stop offset="1" stop-color="#ffb3cc"/></linearGradient>
<linearGradient id="hot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8fb4"/><stop offset=".45" stop-color="#ff416a"/><stop offset="1" stop-color="#c8174a"/></linearGradient>
</defs>
<path d="${toPath(sun)}" fill="url(#sun)"/>
<path d="${toPath(sky)}" fill="#2a1240"/>
<path d="${toPath(lit)}" fill="#ffe37c"/>
<path d="${toPath(palm)}" fill="#2a1240"/>
<g transform="skewX(-8) translate(9 0)">
<path d="${toPath(flagOutline)}" fill="#1b0b2b"/>
<path d="${toPath(flags.a)}" fill="#fff4e6"/>
<path d="${toPath(flags.b)}" fill="#3a2054"/>
<path d="${toPath(extrude)}" fill="#3b0f4f"/>
<path d="${toPath(outline)}" fill="#1b0b2b"/>
<path d="${toPath(E)}" fill="url(#cream)"/>
<path d="${toPath(S)}" fill="url(#hot)"/>
<path d="${toPath(new Set([...E].filter((k) => !E.has(key(+k.split(",")[0], +k.split(",")[1] - 1)))))}" fill="#ffffff"/>
<path d="${toPath(new Set([...S].filter((k) => !S.has(key(+k.split(",")[0], +k.split(",")[1] - 1)))))}" fill="#ffc2d6"/>
</g>
</svg>
`;
await writeFile(new URL("../web/assets/logo.svg", import.meta.url), svg);
console.log("logo.svg written", svg.length, "bytes");
