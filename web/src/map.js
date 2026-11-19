/** Sunset Bay street network. Deterministic from the run seed and shared by the browser renderer,
 * the minimap, the simulation and the authoritative server replay.
 *
 * The city sits on a 520-unit lattice of junction nodes. Every third line in each direction is an
 * avenue that is always open, which keeps the whole city connected. Every other street segment is
 * open, closed (the gap becomes a plaza, park or building), or a dead-end stub that runs part of the
 * way from one junction. A road corridor is 2 × 114 units wide (road plus sidewalk). */
export const BLOCK = 520;
export const CORRIDOR = 114; // half width of road + sidewalk (simulation units)
export const ROAD_HALF = 92;
export const STUB = 0.62; // fraction of a segment a dead-end stub covers from its open end
export const SEG = { NONE: 0, FULL: 1, STUB_START: 2, STUB_END: 3 };

const mod = (a, n) => ((a % n) + n) % n;
function mix(h, a, b, c) {
  h = Math.imul(h ^ (a | 0), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13) ^ (b | 0), 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16) ^ (c | 0), 0x27d4eb2d);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
function seedHash(value) {
  let h = 2166136261 >>> 0;
  for (const c of String(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function district(i, j) { return ((i + Math.floor(-j / 4)) % 4 + 4) % 4; }
export const isAvenueV = (i) => mod(i, 3) === 0;
export const isAvenueH = (j) => mod(j, 3) === 0;

const maps = new Map();
export function cityMap(seed) {
  const key = String(seed);
  let m = maps.get(key);
  if (m) return m;
  const h = seedHash("city/" + key);
  const cache = new Map();
  /** Vertical segment at x = i*B from node (i, j) to (i, j+1): axis 0. Horizontal at y = j*B from
   * (i, j) to (i+1, j): axis 1. */
  function seg(axis, i, j) {
    const k = axis * 1e12 + i * 1e6 + j;
    let v = cache.get(k);
    if (v !== undefined) return v;
    if (axis === 0 ? isAvenueV(i) : isAvenueH(j)) v = SEG.FULL;
    else {
      const r = mix(h, i, j, axis + 7);
      v = r < 0.6 ? SEG.FULL : r < 0.7 ? SEG.STUB_START : r < 0.8 ? SEG.STUB_END : SEG.NONE;
    }
    if (cache.size > 20000) cache.clear();
    cache.set(k, v);
    return v;
  }
  /** Segments touching node (i, j) that actually reach it. */
  function touches(i, j) {
    const up = seg(0, i, j), down = seg(0, i, j - 1), right = seg(1, i, j), left = seg(1, i - 1, j);
    return {
      // +y, -y, +x, -x
      py: up === SEG.FULL || up === SEG.STUB_START,
      ny: down === SEG.FULL || down === SEG.STUB_END,
      px: right === SEG.FULL || right === SEG.STUB_START,
      nx: left === SEG.FULL || left === SEG.STUB_END,
    };
  }
  function degree(i, j) { const t = touches(i, j); return +t.py + +t.ny + +t.px + +t.nx; }
  /** Full (through) segment leaving node (i, j) in direction dx, dy (unit grid step). */
  function open(i, j, dx, dy) {
    if (dx > 0) return seg(1, i, j) === SEG.FULL;
    if (dx < 0) return seg(1, i - 1, j) === SEG.FULL;
    if (dy > 0) return seg(0, i, j) === SEG.FULL;
    return seg(0, i, j - 1) === SEG.FULL;
  }
  /** Solid rectangles [x0, y0, x1, y1] that can touch a circle centred inside cell (ci, cj). */
  function solidsInCell(ci, cj, out) {
    out.length = 0;
    const B = BLOCK, W = CORRIDOR, x0 = ci * B, y0 = cj * B;
    // block interior (Old Town blocks are split into four lots by alleys)
    if (district(ci, cj) === 3) {
      const half = (B - 2 * W) / 2, off = (half + 40) / 2, hh = half - off;
      const cx = x0 + B / 2, cy = y0 + B / 2;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) out.push([cx + sx * off - hh, cy + sy * off - hh, cx + sx * off + hh, cy + sy * off + hh]);
    } else out.push([x0 + W, y0 + W, x0 + B - W, y0 + B - W]);
    // the four bounding segments
    const strip = (axis, i, j) => {
      const s = seg(axis, i, j);
      if (s === SEG.FULL) return;
      const a0 = (axis === 0 ? j : i) * B, line = (axis === 0 ? i : j) * B;
      let lo = a0 + W, hi = a0 + B - W;
      if (s === SEG.STUB_START) lo = a0 + STUB * B;
      else if (s === SEG.STUB_END) hi = a0 + B - STUB * B;
      if (axis === 0) out.push([line - W, lo, line + W, hi]);
      else out.push([lo, line - W, hi, line + W]);
    };
    strip(0, ci, cj); strip(0, ci + 1, cj); strip(1, ci, cj); strip(1, ci, cj + 1);
    // isolated junction squares
    for (const [ni, nj] of [[ci, cj], [ci + 1, cj], [ci, cj + 1], [ci + 1, cj + 1]]) {
      if (degree(ni, nj) === 0) out.push([ni * B - W, nj * B - W, ni * B + W, nj * B + W]);
    }
    return out;
  }
  // Cell geometry is a pure function of the map, so it is built once per cell as a flat array
  // (x0, y0, x1, y1, ...). Same rectangles in the same order: results are unchanged, but the
  // replay on Arvan Edge no longer rebuilds them thousands of times per run.
  const cells = new Map();
  function cellSolids(ci, cj) {
    const k = ci * 1e6 + cj;
    let flat = cells.get(k);
    if (flat) return flat;
    const rects = solidsInCell(ci, cj, []);
    flat = new Float64Array(rects.length * 4);
    rects.forEach((r, n) => flat.set(r, n * 4));
    if (cells.size > 4000) cells.clear();
    cells.set(k, flat);
    return flat;
  }
  function circleHits(x, y, r = 18) {
    const f = cellSolids(Math.floor(x / BLOCK), Math.floor(y / BLOCK));
    const r2 = r * r;
    for (let n = 0; n < f.length; n += 4) {
      const a = f[n], b = f[n + 1], c = f[n + 2], d = f[n + 3];
      const cx = x < a ? a : x > c ? c : x, cy = y < b ? b : y > d ? d : y;
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < r2) return true;
    }
    return false;
  }
  /** Is point (x, y) on asphalt or sidewalk of an open street? */
  function onStreet(x, y) { return !circleHits(x, y, 0.5); }
  m = { seed: key, seg, touches, degree, open, solidsInCell, circleHits, onStreet };
  maps.set(key, m);
  if (maps.size > 8) maps.delete(maps.keys().next().value);
  return m;
}
