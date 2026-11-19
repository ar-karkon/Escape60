/* Share card drawn on the edge for a verified run (link previews on Telegram, WhatsApp, X …).
   Pixel art in the Sunset Bay identity: banded synthwave sky, striped retro sun, neon grid,
   the player's car, verified score. 300×157 logical pixels encoded at 4× → 1200×628 PNG. */
import { createPix, text, textWidth } from './png.mjs';

const PAL = [0x1b0b2b, 0x2a1240, 0x3a1a5c, 0x8d54e9, 0xc23a8a, 0xff5d95, 0xff416a, 0xffad65, 0xffe37c, 0xfff4e6, 0x3dd8e7, 0xcdb9e6,
  0x2b0f4c, 0x5a1d6e, 0xa12d7a, 0x7a2a7a, 0x5dffb0, 0x14082a, 0x8a8fa0, 0x9ff6ff, 0x000000];
const INK = 0, PLUM = 1, DEEP = 2, VIOLET = 3, MAGENTA = 4, PINK = 5, HOT = 6, AMBER = 7, GOLD = 8, CREAM = 9, CYAN = 10, MUTED = 11,
  SKY0 = 12, SKY1 = 13, SKY2 = 14, GRID = 15, GREEN = 16, NIGHT = 17, GRAY = 18, GLASS = 19, PAINT = 20;
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const fmtTime = (ms) => { const s = ms / 1000, m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`; };

export function drawCard({ label, carName, carPaint = 0xff873c, result, rank, of }) {
  const pal = PAL.slice(); pal[PAINT] = carPaint & 0xffffff;
  const W = 300, H = 157, HORIZON = 104, p = createPix(W, H, pal);
  // banded sky with 2-row dither between bands
  const bands = [[0, SKY0], [34, SKY1], [64, SKY2], [90, MAGENTA]];
  for (let y = 0; y < HORIZON; y++) {
    let c = SKY0; for (const [y0, col] of bands) if (y >= y0) c = col;
    p.rect(0, y, W, 1, c);
    const next = bands.find(([y0]) => y0 > y && y0 - y <= 2);
    if (next) for (let x = (y & 1); x < W; x += 2) p.dot(x, y, next[1]);
  }
  // pixel stars
  for (let i = 0; i < 40; i++) { const x = (i * 97 + 13) % W, y = (i * 53 + 7) % 50; p.dot(x, y, i % 3 ? MUTED : CREAM); }
  // striped retro sun
  const sx = 226, sy = 88, sr = 44;
  p.disc(sx, sy, sr, (y) => {
    const d = y - (sy - 12);
    if (d > 0 && d % 7 < 1 + d / 11) return -1;
    return y < sy - 26 ? GOLD : y < sy - 10 ? AMBER : y < sy + 4 ? PINK : HOT;
  }, HORIZON);
  // pixel clouds
  for (const [cx, cy, cw] of [[150, 30, 34], [262, 22, 26], [190, 58, 22]]) { p.rect(cx, cy, cw, 3, VIOLET); p.rect(cx + 5, cy - 3, cw - 12, 3, VIOLET); p.rect(cx + 2, cy + 3, cw - 6, 1, DEEP); }
  // ground + perspective grid
  p.rect(0, HORIZON, W, H - HORIZON, NIGHT);
  p.rect(0, HORIZON, W, 1, PINK);
  for (let k = 1; k < 9; k++) { const y = HORIZON + Math.round(k * k * 0.72); if (y < H) p.rect(0, y, W, 1, GRID); }
  for (let k = -12; k <= 12; k++) p.line(sx + k * 6, HORIZON, sx + k * 46, H + 10, GRID);
  // the car, side view, on the road
  const cx = 214, cy = 112;
  p.rect(cx - 4, cy + 14, 66, 3, INK);
  p.rect(cx, cy + 4, 58, 9, PAINT); p.rect(cx + 2, cy + 2, 54, 2, PAINT);
  p.rect(cx + 14, cy - 4, 26, 6, PAINT); p.rect(cx + 17, cy - 3, 9, 5, GLASS); p.rect(cx + 28, cy - 3, 9, 5, GLASS);
  p.rect(cx, cy + 8, 58, 1, CREAM); p.rect(cx + 55, cy + 5, 3, 2, GOLD); p.rect(cx, cy + 5, 2, 2, HOT);
  for (const wx of [cx + 12, cx + 46]) { p.disc(wx, cy + 13, 5, INK); p.disc(wx, cy + 13, 2, GRAY); }
  for (let i = 0; i < 4; i++) p.rect(cx - 30 + i * 6, cy + 6 + (i % 2) * 3, 4 - (i % 2), 1, CYAN); // speed lines
  // info panel with a pixel frame (cut corners)
  const px0 = 8, py0 = 8, pw = 164, ph = 141;
  p.rect(px0 + 2, py0, pw - 4, ph, INK); p.rect(px0, py0 + 2, pw, ph - 4, INK);
  p.rect(px0 + 2, py0, pw - 4, 1, PINK); p.rect(px0 + 2, py0 + ph - 1, pw - 4, 1, PINK);
  p.rect(px0, py0 + 2, 1, ph - 4, PINK); p.rect(px0 + pw - 1, py0 + 2, 1, ph - 4, PINK);
  p.dot(px0 + 1, py0 + 1, PINK); p.dot(px0 + pw - 2, py0 + 1, PINK); p.dot(px0 + 1, py0 + ph - 2, PINK); p.dot(px0 + pw - 2, py0 + ph - 2, PINK);
  let y = py0 + 7;
  text(p, 'ESCAPE', px0 + 8, y + 4, 2, CREAM, PINK);
  text(p, '60', px0 + 8 + textWidth('ESCAPE', 2) + 6, y, 3, GOLD, HOT);
  y += 28;
  const end = String(result.end || 'legend').toUpperCase();
  const tag = end === 'LEGEND' ? 'LEGEND RUN' : end === 'BUSTED' ? 'BUSTED' : 'WRECKED';
  p.rect(px0 + 8, y, textWidth(tag, 1) + 8, 11, end === 'LEGEND' ? GOLD : HOT);
  text(p, tag, px0 + 12, y + 2, 1, INK);
  text(p, 'SCORE', px0 + 8 + textWidth(tag, 1) + 14, y + 2, 1, MUTED);
  y += 15;
  const score = fmt(result.points), k = textWidth(score, 4) <= pw - 16 ? 4 : 3;
  text(p, score, px0 + 8, y, k, GOLD, HOT);
  y += 7 * k + 7;
  text(p, `TIME ${fmtTime(result.timeMs)}`, px0 + 8, y, 1, CREAM);
  text(p, `TAKEDOWNS ${result.takedowns || 0}`, px0 + 86, y, 1, CREAM);
  y += 11;
  text(p, `TOP ${fmt(result.topSpeed || 0)} KM/H`, px0 + 8, y, 1, CREAM);
  text(p, `CHAIN ${result.bestChain || 1}×`, px0 + 86, y, 1, CREAM);
  y += 13;
  text(p, `${label} · ${carName}`.slice(0, 26), px0 + 8, y, 1, CYAN);
  y += 13;
  p.rect(px0 + 8, y - 2, pw - 16, 1, DEEP);
  text(p, '✓ VERIFIED', px0 + 8, y + 2, 1, GREEN);
  if (rank) text(p, `#${rank} OF ${of} TODAY`, px0 + pw - 8 - textWidth(`#${rank} OF ${of} TODAY`, 1), y + 2, 1, GOLD);
  // call to action on the road
  const cta = 'BEAT IT >';
  text(p, cta, W - 10 - textWidth(cta, 2), H - 17, 2, CREAM, PINK);
  return p.encode(4);
}
