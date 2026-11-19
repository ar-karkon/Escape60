/* Share cards for social networks, drawn from a real in-engine frame plus the run's real numbers.
   Formats: story 1080×1920, post 1080×1350, wide 1200×675. Loaded lazily the first time the player shares. */
import qrcode from '../vendor/qrcode.js';

export const FORMATS = { story: { w: 1080, h: 1920 }, post: { w: 1080, h: 1350 }, wide: { w: 1200, h: 675 } };
const DISPLAY = '"Jersey 10", "Rooyin", "Vazirmatn", monospace';
const fmtTime = (ms) => { const s = ms / 1000, m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`; };
const fmt = (n) => Math.round(n).toLocaleString('en-US');

export function challengeUrl(seed, result) {
  const u = new URL(location.href);
  u.search = ''; u.hash = '';
  u.searchParams.set('seed', seed);
  u.searchParams.set('c', `${result.timeMs}.${result.points}`);
  return u.toString();
}
function cover(ctx, img, x, y, w, h) {
  const k = Math.max(w / img.width, h / img.height), iw = img.width * k, ih = img.height * k;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  ctx.restore();
}
function text(ctx, s, x, y, size, color, { weight = 400, align = 'center', stroke = 0, shadow = null } = {}) {
  ctx.font = `${weight} ${Math.round(size * 1.15)}px ${DISPLAY}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (shadow) { ctx.fillStyle = shadow; ctx.fillText(s, x + size * 0.05, y + size * 0.05); }
  if (stroke) { ctx.lineWidth = stroke; ctx.strokeStyle = '#1b0b2b'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}
function skewBox(ctx, x, y, w, h, fill) { ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.transform(1, 0, -0.14, 1, 0, 0); ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, h * 0.18); ctx.fill(); ctx.restore(); }
function drawQR(ctx, data, x, y, size) {
  const q = qrcode(0, 'M'); q.addData(data); q.make();
  const n = q.getModuleCount(), cell = Math.floor(size / (n + 4)), s = cell * (n + 4);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(x, y, s, s, cell * 2); ctx.fill();
  ctx.fillStyle = '#1b0b2b';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect(x + (c + 2) * cell, y + (r + 2) * cell, cell, cell);
  return s;
}

/** Draw a card. `frame` is a canvas holding a real rendered game frame. */
export async function drawCard(format, frame, d) {
  const F = FORMATS[format], cv = document.createElement('canvas');
  cv.width = F.w; cv.height = F.h;
  const ctx = cv.getContext('2d');
  const { result: r, car, title, level, url, labels } = d;
  ctx.fillStyle = '#1b0b2b'; ctx.fillRect(0, 0, F.w, F.h);
  const wide = format === 'wide';
  cover(ctx, frame, 0, 0, wide ? F.w * 0.62 : F.w, wide ? F.h : F.h * 0.72);
  const g = wide ? ctx.createLinearGradient(F.w * 0.42, 0, F.w * 0.66, 0) : ctx.createLinearGradient(0, F.h * 0.38, 0, F.h * 0.74);
  g.addColorStop(0, 'rgba(27,11,43,0)'); g.addColorStop(1, 'rgba(27,11,43,1)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, F.w, F.h);
  const top = ctx.createLinearGradient(0, 0, 0, F.h * 0.2); top.addColorStop(0, 'rgba(27,11,43,0.7)'); top.addColorStop(1, 'rgba(27,11,43,0)');
  ctx.fillStyle = top; ctx.fillRect(0, 0, F.w, F.h * 0.2);
  const s = wide ? 0.56 : format === 'post' ? 0.8 : 1;
  const cx = wide ? F.w * 0.79 : F.w / 2;
  // logo
  const ly = wide ? 70 : 110 * s;
  text(ctx, 'ESCAPE', cx - 70 * s, ly, 92 * s, '#ffffff', { shadow: '#ff5d95' });
  const lg = ctx.createLinearGradient(cx, 0, cx + 200 * s, 0); lg.addColorStop(0, '#ffe37c'); lg.addColorStop(1, '#ff5d95');
  text(ctx, '60', cx + 150 * s, ly - 8 * s, 150 * s, lg);
  let y = wide ? 190 : F.h * (format === 'story' ? 0.6 : 0.56);
  skewBox(ctx, cx - 210 * s, y - 42 * s, 420 * s, 84 * s, title === 'LEGEND' ? '#ffe37c' : '#ff416a');
  text(ctx, title, cx, y, 64 * s, '#ffffff');
  y += 120 * s;
  text(ctx, labels.score, cx, y - 30 * s, 34 * s, '#cdb9e6', { weight: 400 });
  const sg = ctx.createLinearGradient(cx - 300 * s, 0, cx + 300 * s, 0); sg.addColorStop(0, '#ffe37c'); sg.addColorStop(1, '#ff5d95');
  text(ctx, fmt(r.points), cx, y + 60 * s, 170 * s, sg);
  y += 190 * s;
  const items = [[labels.time, fmtTime(r.timeMs)], [labels.top, `${fmt(r.topSpeed)} KM/H`], [labels.td, fmt(r.takedowns)]];
  const bw = 300 * s, gap = 24 * s, x0 = cx - (bw * 3 + gap * 2) / 2;
  items.forEach(([k, v], i) => {
    const bx = x0 + i * (bw + gap);
    skewBox(ctx, bx, y, bw, 120 * s, 'rgba(255,255,255,0.08)');
    text(ctx, k, bx + bw / 2, y + 34 * s, 26 * s, '#cdb9e6', { weight: 400 });
    text(ctx, v, bx + bw / 2, y + 82 * s, 50 * s, '#ffffff');
  });
  y += 170 * s;
  text(ctx, `${car} · LV ${level}`, cx, y, 38 * s, '#3dd8e7', { weight: 400 });
  const qs = wide ? 150 : 230 * s;
  if (wide) drawQR(ctx, url, 36, F.h - qs - 36, qs);
  else { drawQR(ctx, url, cx - qs / 2, y + 50 * s, qs); }
  text(ctx, 'BEAT MY SCORE', cx, wide ? F.h - 40 : F.h - 60 * s, 40 * s, '#ffffff', { weight: 400 });
  return cv;
}
export async function cardBlob(cv) { return new Promise((ok) => cv.toBlob((b) => ok(b), 'image/png')); }
/** Native share sheet with the image (Instagram / Telegram / WhatsApp targets on phones). */
export async function shareImage(blob, msg, url, name = 'escape60.png') {
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text: msg + '\n' + url, title: 'ESCAPE 60' }); return 'shared'; }
  downloadBlob(blob, name);
  return 'downloaded';
}
export function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export function networkLink(net, msg, url) {
  const t = encodeURIComponent(msg), u = encodeURIComponent(url);
  if (net === 'telegram') return `https://t.me/share/url?url=${u}&text=${t}`;
  if (net === 'x') return `https://x.com/intent/post?text=${t}&url=${u}`;
  if (net === 'whatsapp') return `https://wa.me/?text=${t}%20${u}`;
  return url;
}
