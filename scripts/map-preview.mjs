/* Dev tool: rasterise the shared world map (field, water, pads, stations) to a PNG. */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { BOUNDS, sample, water, nodes, edges, stations, pads, spawnPoint, district } from '../web/src/map.js';
const step = Number(process.argv[3] || 2), out = process.argv[2] || 'map.png';
if (process.argv[4]) { const [a, b, c, d] = process.argv[4].split(',').map(Number); Object.assign(BOUNDS, { minX: a, minY: b, maxX: c, maxY: d }); }
const W = Math.ceil((BOUNDS.maxX - BOUNDS.minX) / step), H = Math.ceil((BOUNDS.maxY - BOUNDS.minY) / step);
const img = Buffer.alloc((W * 4 + 1) * H);
const r = {};
const DC = [[150, 150, 160], [235, 215, 170], [140, 140, 150], [200, 170, 150], [140, 175, 110], [175, 140, 110], [110, 170, 100], [160, 175, 130]];
const t0 = performance.now();
for (let j = 0; j < H; j++) {
  img[j * (W * 4 + 1)] = 0;
  for (let i = 0; i < W; i++) {
    const x = BOUNDS.minX + (i + 0.5) * step, y = BOUNDS.minY + (j + 0.5) * step;
    sample(x, y, r);
    let c;
    if (r.f < 0) c = [52, 54, 62];
    else if (r.g <= 0) c = [190, 190, 196];
    else if (water(x, y) > 0) c = [40, 110, 170];
    else c = DC[district(x, y)];
    if (r.g > 0 && r.g < 1.2) c = [230, 60, 60];
    const o = j * (W * 4 + 1) + 1 + i * 4;
    img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; img[o + 3] = 255;
  }
}
const ms = performance.now() - t0;
const dot = (x, y, col, rad = 3) => {
  const ci = Math.round((x - BOUNDS.minX) / step), cj = Math.round((y - BOUNDS.minY) / step);
  for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) {
    const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= W || j >= H) continue;
    const o = j * (W * 4 + 1) + 1 + i * 4; img[o] = col[0]; img[o + 1] = col[1]; img[o + 2] = col[2];
  }
};
for (const n of nodes) dot(n.x, n.y, n.edges.length >= 3 ? [255, 210, 0] : [255, 0, 255], 2);
for (const s of stations) dot(s.x, s.y, [0, 255, 120], 5);
for (let k = 0; k < 6; k++) { let s; try { s = spawnPoint(k); } catch { console.log("bad spawn", k); continue; } dot(s.x, s.y, [0, 200, 255], 4); dot(s.x + s.tx * 12, s.y + s.ty * 12, [0, 200, 255], 2); }
function png(w, h, data) {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(data)), chunk('IEND', Buffer.alloc(0))]);
}
writeFileSync(out, png(W, H, img));
let len = 0; for (const e of edges) len += e.len;
console.log(`${W}x${H} in ${ms.toFixed(0)} ms (${(ms * 1000 / (W * H)).toFixed(2)} µs/sample); nodes ${nodes.length}, edges ${edges.length}, road ${(len / 1000).toFixed(1)} km, pads ${pads.length}`);
