/* Share cards for social networks, drawn from a real in-engine frame plus the run's real numbers.
   Formats: story 1080×1920 (Instagram / Telegram / WhatsApp status), post 1080×1350 (feed),
   wide 1200×675 (X / Telegram link posts). Loaded lazily the first time the player shares. */
import qrcode from '../vendor/qrcode.js';

export const FORMATS = {
  story: { w: 1080, h: 1920, label: 'استوری', hint: 'اینستاگرام · تلگرام · واتساپ' },
  post: { w: 1080, h: 1350, label: 'پست', hint: 'اینستاگرام · تلگرام' },
  wide: { w: 1200, h: 675, label: 'افقی', hint: 'X · تلگرام · دیسکورد' },
};
const FA = 'Vazirmatn, Tahoma, sans-serif', PX = '"Jersey 10", monospace';
let logoImg = null;
function loadLogo() {
  if (logoImg) return logoImg;
  logoImg = new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = new URL('../assets/logo.svg', import.meta.url).href; });
  return logoImg;
}
const fmtTime = (ms) => (ms / 1000).toFixed(2).padStart(5, '0');
const fmt = (n) => Math.round(n).toLocaleString('en-US');

export function challengeUrl(seed, result) {
  const u = new URL(location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('seed', seed);
  u.searchParams.set('c', `${result.timeMs}.${result.points}`);
  return u.toString();
}
export function shareText(result) {
  return result.win
    ? `🚨 ${fmtTime(result.timeMs)} ثانیه از دست پلیس‌های خلیج غروب فرار کردم و ${fmt(result.points)} امتیاز گرفتم! جرئت داری رکوردم رو بزنی؟ 🏁 #فرار۶۰ #Escape60`
    : `🚔 ${fmtTime(result.timeMs)} ثانیه دوام آوردم و ${fmt(result.points)} امتیاز گرفتم… تو بیشتر دووم میاری؟ 🏁 #فرار۶۰ #Escape60`;
}

function pixelText(ctx, text, x, y, size, fill, { font = PX, outline = 0, shadow = null, align = 'center', dir = 'ltr' } = {}) {
  ctx.font = `${font === FA ? 800 : 400} ${size}px ${font}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.direction = dir;
  const o = outline || Math.max(2, Math.round(size / 18));
  if (shadow) { ctx.fillStyle = shadow; ctx.fillText(text, x, y + o * 2); }
  ctx.fillStyle = '#1b0b2b';
  for (const [dx, dy] of [[o, 0], [-o, 0], [0, o], [0, -o], [o, o], [-o, o], [o, -o], [-o, -o]]) ctx.fillText(text, x + dx, y + dy);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}
function pixelFrame(ctx, x, y, w, h, edge, fill, b = 6) {
  ctx.fillStyle = '#1b0b2b'; ctx.fillRect(x - b * 2, y, w + b * 4, h); ctx.fillRect(x, y - b * 2, w, h + b * 4); ctx.fillRect(x - b, y - b, w + b * 2, h + b * 2);
  ctx.fillStyle = edge; ctx.fillRect(x - b, y, w + b * 2, h); ctx.fillRect(x, y - b, w, h + b * 2);
  ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
}
function drawQR(ctx, text, x, y, size) {
  const q = qrcode(0, 'M');
  q.addData(text); q.make();
  const n = q.getModuleCount(), cell = Math.floor(size / (n + 4)), s = cell * (n + 4);
  pixelFrame(ctx, x, y, s, s, '#3dd8e7', '#fff4e6', Math.max(3, cell));
  ctx.fillStyle = '#1b0b2b';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect(x + (c + 2) * cell, y + (r + 2) * cell, cell, cell);
  return s;
}
function cover(ctx, img, x, y, w, h) {
  const k = Math.max(w / img.width, h / img.height), iw = img.width * k, ih = img.height * k;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}
function stat(ctx, x, y, w, h, label, value, color, scale) {
  pixelFrame(ctx, x, y, w, h, '#5b3d8f', 'rgba(20,10,38,.9)', Math.round(4 * scale));
  ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `800 ${Math.round(26 * scale)}px ${FA}`; ctx.fillStyle = '#cdb9e6'; ctx.fillText(label, x + w / 2, y + h * 0.3);
  pixelText(ctx, value, x + w / 2, y + h * 0.68, Math.round(64 * scale), color);
}

/** Draw a card. `frame` is a canvas holding a real rendered game frame for this format. */
export async function drawCard(format, frame, data) {
  const F = FORMATS[format], cv = document.createElement('canvas');
  cv.width = F.w; cv.height = F.h;
  const ctx = cv.getContext('2d');
  const logo = await loadLogo();
  const { result, seed, title, level, chain, url, daily } = data;
  ctx.fillStyle = '#1b0b2b'; ctx.fillRect(0, 0, F.w, F.h);
  const wide = format === 'wide';
  if (wide) {
    cover(ctx, frame, 0, 0, F.w * 0.56, F.h);
    const g = ctx.createLinearGradient(F.w * 0.4, 0, F.w * 0.6, 0);
    g.addColorStop(0, 'rgba(27,11,43,0)'); g.addColorStop(1, 'rgba(27,11,43,1)');
    ctx.fillStyle = g; ctx.fillRect(F.w * 0.4, 0, F.w * 0.2, F.h);
  } else {
    cover(ctx, frame, 0, 0, F.w, F.h);
    const g = ctx.createLinearGradient(0, 0, 0, F.h);
    g.addColorStop(0, 'rgba(27,11,43,.55)'); g.addColorStop(0.22, 'rgba(27,11,43,0)');
    g.addColorStop(format === 'story' ? 0.5 : 0.42, 'rgba(27,11,43,0)'); g.addColorStop(format === 'story' ? 0.66 : 0.6, 'rgba(27,11,43,.86)'); g.addColorStop(1, 'rgba(27,11,43,.97)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, F.w, F.h);
  }
  // scanline sparkle for a printed-poster feel
  ctx.fillStyle = 'rgba(255,255,255,.025)';
  for (let y = 0; y < F.h; y += 6) ctx.fillRect(0, y, F.w, 2);
  const cx = wide ? F.w * 0.78 : F.w / 2;
  const s = wide ? 0.62 : format === 'post' ? 0.82 : 1;
  // logo
  if (logo) {
    const lw = (wide ? 360 : format === 'post' ? 470 : 620) * (wide ? 1 : 1), lh = (lw * 112) / 182;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(logo, cx - lw / 2, wide ? 18 : 40, lw, lh);
  }
  let y = wide ? 270 : format === 'post' ? 640 : 1090;
  // title ribbon
  ctx.font = `800 ${Math.round(56 * s)}px ${FA}`;
  const tw = ctx.measureText(title).width + 120 * s;
  pixelFrame(ctx, cx - tw / 2, y - 44 * s, tw, 88 * s, result.win ? '#ff8fb4' : '#ff416a', result.win ? '#e3336a' : '#3d2f61', Math.round(6 * s));
  pixelText(ctx, title, cx, y, Math.round(56 * s), '#ffffff', { font: FA, dir: 'rtl' });
  y += 150 * s;
  ctx.font = `800 ${Math.round(30 * s)}px ${FA}`; ctx.fillStyle = '#cdb9e6'; ctx.textAlign = 'center'; ctx.direction = 'rtl';
  ctx.fillText(daily ? 'زمان بقا · چالش امروز' : 'زمان بقا', cx, y - 70 * s);
  pixelText(ctx, fmtTime(result.timeMs), cx, y + 18 * s, Math.round(190 * s), '#ffe37c', { shadow: '#c8174a', outline: Math.round(8 * s) });
  y += 170 * s;
  const sw = (wide ? 160 : 290) * (wide ? 1 : s), sh = (wide ? 108 : 150) * (wide ? 1 : s), gap = 26 * s;
  const sx0 = cx - (sw * 3 + gap * 2) / 2;
  const ss = wide ? 0.62 : s;
  stat(ctx, sx0 + (sw + gap) * 2, y, sw, sh, 'امتیاز', fmt(result.points), '#ffe37c', ss);
  stat(ctx, sx0 + (sw + gap), y, sw, sh, 'جاخالی', fmt(result.closeCalls), '#fff4e6', ss);
  stat(ctx, sx0, y, sw, sh, 'بهترین ضریب', '×' + Math.max(1, chain || 1), '#3dd8e7', ss);
  y += sh + 70 * s;
  // challenge call to action + QR
  const qrSize = wide ? 150 : format === 'post' ? 200 : 260;
  if (wide) {
    pixelText(ctx, 'رکوردم رو بزن!', cx, y, 44, '#3dd8e7', { font: FA, dir: 'rtl' });
    drawQR(ctx, url, 40, F.h - qrSize - 40, qrSize);
  } else {
    const qx = cx - qrSize / 2 - (format === 'story' ? 170 : 160) * s;
    drawQR(ctx, url, F.w - qrSize - 60 - (format === 'post' ? 0 : 20), y - 20, qrSize);
    ctx.direction = 'rtl'; ctx.textAlign = 'right';
    pixelText(ctx, 'رکوردم رو بزن!', F.w - qrSize - 120, y + 30 * s, Math.round(58 * s), '#3dd8e7', { font: FA, dir: 'rtl', align: 'right' });
    ctx.font = `800 ${Math.round(28 * s)}px ${FA}`; ctx.fillStyle = '#fff4e6'; ctx.direction = 'rtl'; ctx.textAlign = 'right';
    ctx.fillText('کد QR رو اسکن کن و همین مسیر رو برو', F.w - qrSize - 120, y + 100 * s);
    ctx.fillText(`سطح ${level} · فرار ۶۰`, F.w - qrSize - 120, y + 150 * s);
    void qx;
  }
  // footer
  ctx.direction = 'ltr'; ctx.textAlign = 'center'; ctx.font = `400 ${Math.round(34 * s)}px ${PX}`; ctx.fillStyle = 'rgba(255,244,230,.6)';
  ctx.fillText(`ESCAPE 60 · ${seed}`, cx, F.h - (wide ? 26 : 48));
  return cv;
}

export async function cardBlob(cv) {
  return new Promise((ok) => cv.toBlob((b) => ok(b), 'image/png'));
}
/** Native share sheet with the image (Instagram / Telegram / WhatsApp targets on phones). */
export async function shareImage(blob, text, url, name = 'escape60.png') {
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], text: text + '\n' + url, title: 'فرار ۶۰' });
    return 'shared';
  }
  downloadBlob(blob, name);
  return 'downloaded';
}
export function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export function networkLink(net, text, url) {
  const t = encodeURIComponent(text), u = encodeURIComponent(url);
  if (net === 'telegram') return `https://t.me/share/url?url=${u}&text=${t}`;
  if (net === 'x') return `https://x.com/intent/post?text=${t}&url=${u}`;
  if (net === 'whatsapp') return `https://wa.me/?text=${t}%20${u}`;
  return url;
}
