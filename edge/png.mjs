/* Pixel-art canvas + indexed-colour PNG encoder for the edge.
   The image is drawn at a small logical size and scaled by an integer factor when encoded. Deflate
   tokens (fixed Huffman) are produced straight from colour runs, and Adler-32 uses closed forms for
   runs, so encoding costs O(logical pixels) — a 1200×628 card costs about as much as its 300×157
   source. That keeps it far inside a small per-request CPU budget. No dependencies. */

const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(bytes, start, end) { let c = -1; for (let i = start; i < end; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];

/** A palette-indexed drawing surface. `palette` is a list of 0xRRGGBB colours. */
export function createPix(w, h, palette) {
  const px = new Uint8Array(w * h);
  const pix = {
    w, h, px, palette,
    rect(x, y, rw, rh, c) {
      const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0), x1 = Math.min(w, (x + rw) | 0), y1 = Math.min(h, (y + rh) | 0);
      for (let yy = y0; yy < y1; yy++) px.fill(c, yy * w + x0, yy * w + x1);
    },
    dot(x, y, c) { if (x >= 0 && y >= 0 && x < w && y < h) px[(y | 0) * w + (x | 0)] = c; },
    get(x, y) { return px[y * w + x]; },
    /** Filled disc; `color(y)` may vary per row (gradients, stripes); return -1 to skip a row. */
    disc(cx, cy, r, color, clipY = h) {
      for (let y = Math.max(0, Math.ceil(cy - r)); y <= Math.min(clipY - 1, Math.floor(cy + r)); y++) {
        const c = typeof color === 'function' ? color(y) : color; if (c < 0) continue;
        const dx = Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy)));
        pix.rect(Math.round(cx - dx), y, Math.round(dx * 2), 1, c);
      }
    },
    line(x0, y0, x1, y1, c) {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let i = 0; i <= n; i++) pix.dot(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
    },
    encode(scale = 1) { return encodePNG(pix, scale); },
  };
  return pix;
}

function encodePNG(pix, S) {
  const { w, h, px, palette } = pix, W = w * S, H = h * S;
  // ---- deflate stream (one fixed-Huffman block) ----
  let out = new Uint8Array(1 << 15), n = 0, acc = 0, nb = 0;
  const byte = (b) => { if (n === out.length) { const o = new Uint8Array(out.length * 2); o.set(out); out = o; } out[n++] = b; };
  const put = (v, len) => { acc |= v << nb; nb += len; while (nb >= 8) { byte(acc & 255); acc >>>= 8; nb -= 8; } };
  const putRev = (code, len) => { let r = 0; for (let i = 0; i < len; i++) { r = (r << 1) | (code & 1); code >>>= 1; } put(r, len); };
  const lit = (b) => (b < 144 ? putRev(0x30 + b, 8) : putRev(0x190 + b - 144, 9));
  const sym = (s) => (s < 280 ? putRev(s - 256, 7) : putRev(0xc0 + s - 280, 8));
  const match1 = (len) => { // distance 1: repeat the previous byte
    let i = 28; while (LBASE[i] > len) i--;
    sym(257 + i); if (LEXT[i]) put(len - LBASE[i], LEXT[i]);
    putRev(0, 5); // distance code 0 = distance 1, no extra bits
  };
  const repeat = (b, count) => { // `count` more copies of b, the byte just written
    while (count >= 3) { let k = Math.min(258, count); if (count - k > 0 && count - k < 3) k = count - 3; match1(k); count -= k; }
    while (count-- > 0) lit(b);
  };
  // ---- Adler-32 over the raw scanlines, run by run ----
  let s1 = 1, s2 = 0;
  const adler = (b, k) => { s2 = (s2 + k * s1 + ((b * k * (k + 1)) / 2) % 65521) % 65521; s1 = (s1 + k * b) % 65521; };
  const run = (b, k) => { lit(b); repeat(b, k - 1); adler(b, k); };

  put(1, 1); put(1, 2); // BFINAL, BTYPE = fixed Huffman
  for (let y = 0; y < h; y++) {
    run(0, 1); // filter: none
    const row = y * w;
    for (let x = 0; x < w;) { const c = px[row + x]; let e = x + 1; while (e < w && px[row + e] === c) e++; run(c, (e - x) * S); x = e; }
    for (let k = 1; k < S; k++) { run(2, 1); run(0, W); } // filter: up — identical rows become zeros
  }
  sym(256);
  if (nb > 0) byte(acc & 255);
  const zlen = 2 + n + 4;
  // ---- PNG container ----
  const plte = palette.length * 3;
  const total = 8 + (12 + 13) + (12 + plte) + (12 + zlen) + 12;
  const png = new Uint8Array(total); let o = 0;
  const u32 = (v) => { png[o++] = v >>> 24; png[o++] = (v >>> 16) & 255; png[o++] = (v >>> 8) & 255; png[o++] = v & 255; };
  const chunk = (type, len, write) => { u32(len); const start = o; for (let i = 0; i < 4; i++) png[o++] = type.charCodeAt(i); write(); u32(crc32(png, start, o)); };
  for (const b of [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) png[o++] = b;
  chunk('IHDR', 13, () => { u32(W); u32(H); png[o++] = 8; png[o++] = 3; png[o++] = 0; png[o++] = 0; png[o++] = 0; });
  chunk('PLTE', plte, () => { for (const c of palette) { png[o++] = (c >> 16) & 255; png[o++] = (c >> 8) & 255; png[o++] = c & 255; } });
  chunk('IDAT', zlen, () => { png[o++] = 0x78; png[o++] = 0x01; png.set(out.subarray(0, n), o); o += n; u32(((s2 << 16) | s1) >>> 0); });
  chunk('IEND', 0, () => {});
  return png;
}

/* ---- 5×7 pixel font (original glyph drawings, one 5-bit row per entry) ---- */
const G = {
  '0': [14, 17, 19, 21, 25, 17, 14], '1': [4, 12, 4, 4, 4, 4, 14], '2': [14, 17, 1, 2, 4, 8, 31], '3': [31, 2, 4, 2, 1, 17, 14], '4': [2, 6, 10, 18, 31, 2, 2],
  '5': [31, 16, 30, 1, 1, 17, 14], '6': [6, 8, 16, 30, 17, 17, 14], '7': [31, 1, 2, 4, 8, 8, 8], '8': [14, 17, 17, 14, 17, 17, 14], '9': [14, 17, 17, 15, 1, 2, 12],
  A: [14, 17, 17, 17, 31, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [28, 18, 17, 17, 17, 18, 28], E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31], M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17], Y: [17, 17, 17, 10, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31], ' ': [0, 0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12], ',': [0, 0, 0, 0, 12, 4, 8], ':': [0, 12, 12, 0, 12, 12, 0],
  '!': [4, 4, 4, 4, 4, 0, 4], '?': [14, 17, 1, 2, 4, 0, 4], '#': [10, 10, 31, 10, 31, 10, 10], '+': [0, 4, 4, 31, 4, 4, 0], '-': [0, 0, 0, 31, 0, 0, 0],
  '/': [0, 1, 2, 4, 8, 16, 0], "'": [4, 4, 8, 0, 0, 0, 0], '%': [24, 25, 2, 4, 8, 19, 3], '·': [0, 0, 0, 12, 12, 0, 0], '×': [0, 17, 10, 4, 10, 17, 0],
  '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8], '>': [8, 4, 2, 1, 2, 4, 8], '<': [2, 4, 8, 16, 8, 4, 2], '★': [4, 21, 14, 31, 14, 21, 4], '&': [12, 18, 20, 8, 21, 18, 13],
  '✓': [0, 1, 1, 2, 18, 12, 4],
};
export const textWidth = (s, k = 1) => Math.max(0, String(s).length * 6 * k - k);
/** Draw text with the pixel font at integer scale k; optional 1-step drop shadow colour. */
export function text(pix, s, x, y, k, c, shadow = -1) {
  const str = String(s).toUpperCase();
  if (shadow >= 0) { const d = Math.max(1, k >> 1); text(pix, str, x + d, y + d, k, shadow); }
  for (let i = 0; i < str.length; i++) {
    const g = G[str[i]] || G['?'], ox = x + i * 6 * k;
    for (let r = 0; r < 7; r++) { const bits = g[r]; if (!bits) continue; for (let col = 0; col < 5; col++) if (bits & (16 >> col)) pix.rect(ox + col * k, y + r * k, k, k, c); }
  }
}
