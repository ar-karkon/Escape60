/* Sunset Bay world map (v2). One fixed, handcrafted city shared by the simulation, the authoritative
 * replay, the renderer and the minimap.
 *
 * Roads are authored as paths through named junction nodes and free control points. Each path is cut
 * into graph edges at its named nodes and every edge is a Catmull-Rom curve sampled every ~3 m, so the
 * city has sweeping highways, warped downtown avenues, a roundabout, a lake loop and canyon hairpins.
 *
 * Drivable space is a signed distance field built from the road centre lines:
 *   f(p) = asphalt edge distance (negative on asphalt),
 *   g(p) = wall distance for the car centre (negative = drivable).
 * Roads are joined with an angle-weighted smooth minimum, which fillets junction corners without
 * widening straight joins or bridging parallel roads. Repair stations and plazas are rounded boxes.
 *
 * Determinism: only + - * / and Math.sqrt / Math.floor plus dmath's sin/cos are used, so every JS
 * engine builds exactly the same map and the same field values. Units are metres. +x east, +y south. */
import { dsin, dcos } from './dmath.js';

export const MAP_VERSION = 2;
export const BOUNDS = { minX: -1180, minY: -1080, maxX: 1180, maxY: 980 };
const K_SMOOTH = 7;
const BIG = 40;

/** Road kinds. hw = asphalt half width, lim = how far beyond the asphalt edge the car centre may go
 * (sidewalk in town, shoulder before a guard rail outside). */
export const KINDS = {
  highway:   { id: 0, hw: 11.6, lim: 0.4, lanes: 3, laneW: 3.5, town: 0, rail: 1 },
  boulevard: { id: 1, hw: 9.2, lim: 4.4, lanes: 2, laneW: 3.6, town: 1, rail: 0 },
  avenue:    { id: 2, hw: 7.6, lim: 4.0, lanes: 2, laneW: 3.4, town: 1, rail: 0 },
  street:    { id: 3, hw: 6.0, lim: 3.6, lanes: 1, laneW: 3.7, town: 1, rail: 0 },
  canyon:    { id: 4, hw: 6.6, lim: 0.4, lanes: 1, laneW: 3.9, town: 0, rail: 1 },
  port:      { id: 5, hw: 8.8, lim: 1.8, lanes: 2, laneW: 3.6, town: 0, rail: 0 },
  lane:      { id: 6, hw: 5.6, lim: 3.2, lanes: 1, laneW: 3.5, town: 1, rail: 0 },
};
export const KIND_LIST = Object.keys(KINDS);

/* ------------------------------------------------------------------ authoring ---------- */
const NODES = new Map(); // name -> [x, y]
const ROADS = [];        // { kind, path: [name | [x, y]], closed }
const PADS = [];         // { kind, x, y, hx, hy, r, ca, sa, station }
const OBSTACLES = [];    // { type:'circle'|'box', x, y, r | hx,hy,ca,sa }

const warp = (x, y) => [x + 22 * dsin(y / 160 + 0.6), y + 16 * dsin(x / 190 + 0.3)];
const def = (name, x, y) => { NODES.set(name, [x, y]); return name; };
const road = (kind, path, closed = false) => ROADS.push({ kind, path, closed });

// Downtown: a warped 7 x 6 grid, avenues every third line, a roundabout and a few closed blocks.
const GX = (i) => -360 + 120 * i, GY = (j) => -320 + 120 * j;
for (let i = 0; i <= 6; i++) for (let j = 0; j <= 5; j++) { const [x, y] = warp(GX(i), GY(j)); def(`G${i}_${j}`, x, y); }
const W3 = (x, y) => warp(x, y);
const RC = warp(0, 40), RR = 38;
for (const [n, a] of [['RN', -0.5], ['RE', 0], ['RS', 0.5], ['RW', 1]]) def(n, RC[0] + RR * dcos(a * Math.PI), RC[1] + RR * dsin(a * Math.PI));
const colKind = (i) => (i % 3 === 0 ? 'avenue' : 'street');
const rowKind = (j) => (j === 5 ? 'boulevard' : j === 1 || j === 4 ? 'avenue' : 'street');
// closed grid segments ([axis, i, j]: axis 0 = column i from row j to j+1, axis 1 = row j from col i to i+1)
const CLOSED = new Set(['0,1,3', '0,5,1', '1,4,2', '1,1,3', '0,2,0']);
function gridLine(axis, k, lo, hi) {
  // emit runs of open segments as roads
  let run = null;
  const flush = () => { if (run && run.length > 1) road(axis === 0 ? colKind(k) : rowKind(k), run); run = null; };
  for (let m = lo; m < hi; m++) {
    const key = `${axis},${axis === 0 ? k : m},${axis === 0 ? m : k}`;
    const a = axis === 0 ? `G${k}_${m}` : `G${m}_${k}`, b = axis === 0 ? `G${k}_${m + 1}` : `G${m + 1}_${k}`;
    const roundabout = (axis === 0 && k === 3 && (m === 2 || m === 3)) || (axis === 1 && k === 3 && (m === 2 || m === 3));
    if (CLOSED.has(key)) { flush(); continue; }
    if (roundabout) {
      // the roundabout replaces node G3_3
      if (m === 2) { run ??= [a]; run.push(axis === 0 ? 'RN' : 'RW'); flush(); }
      else { run = [axis === 0 ? 'RS' : 'RE']; run.push(b); }
      continue;
    }
    const [x0, y0] = axis === 0 ? [GX(k), GY(m)] : [GX(m), GY(k)];
    const [dx, dy] = axis === 0 ? [0, 120] : [120, 0];
    run ??= [a];
    run.push(W3(x0 + dx / 3, y0 + dy / 3), W3(x0 + (2 * dx) / 3, y0 + (2 * dy) / 3), b);
  }
  flush();
}
for (let i = 0; i <= 6; i++) gridLine(0, i, 0, 5);
for (let j = 0; j <= 5; j++) gridLine(1, j, 0, 6);
{ // roundabout ring
  const ring = ['RN'];
  const names = ['RN', 'RE', 'RS', 'RW'];
  for (let q = 0; q < 4; q++) {
    for (let s = 1; s < 4; s++) { const a = (q * 0.5 - 0.5 + s * 0.125) * Math.PI; ring.push([RC[0] + RR * dcos(a), RC[1] + RR * dsin(a)]); }
    ring.push(names[(q + 1) % 4]);
  }
  road('avenue', ring, true);
  OBSTACLES.push({ type: 'circle', x: RC[0], y: RC[1], r: 8.5 }); // fountain plinth (inside the island anyway)
}

// Outer loop nodes
def('WS', -992, 556); def('HWM', -720, 624); def('HWW', -470, 594); def('HW0', -352, 598); def('HW3', 4, 628); def('HW6', 364, 606); def('HWE', 528, 616); def('ES', 848, 468);
def('E4', 878, 168); def('E1', 870, -196); def('EN', 790, -478);
def('NE', 458, -772); def('NE2', 612, -694); def('NEC', 300, -824); def('NC', 2, -848); def('NW', -362, -778);
def('WN', -1002, -214); def('W4', -1000, 156); def('WHA', -784, 60); def('WHB', -764, 156);
def('OBW', -520, 452); def('OB0', -360, 452); def('OB3', 2, 462); def('OB6', 364, 452); def('OBE', 520, 456);
def('P3', 6, -560); def('LK', -66, -568); def('OTA', 444, -484); def('OTB', 626, -520);

// Coastal highway (south), sweeping along the beach with a bridge over the marina inlet.
road('highway', ['WS', [-900, 612], [-800, 628], 'HWM', [-640, 612], [-560, 604], 'HWW', [-410, 590], 'HW0', [-250, 606], [-120, 626], 'HW3',
  [120, 618], [250, 600], 'HW6', [450, 608], 'HWE', [640, 600], [760, 548], 'ES']);
// Port road (east) along the docks
road('port', ['ES', [884, 360], [882, 262], 'E4', [868, 0], 'E1', [862, -330], 'EN']);
// North-east avenue into the hills and the north boulevard
road('avenue', ['EN', [722, -604], 'NE2', [540, -742], 'NE', [380, -808], 'NEC', [160, -850], 'NC']);
road('boulevard', ['NC', [-120, -838], [-250, -812], 'NW']);
// Canyon: hairpins down the hills on the west
road('canyon', ['NW', [-470, -742], [-580, -762], [-690, -806], [-800, -796], [-866, -736], [-850, -664], [-770, -632], [-668, -612], [-604, -560],
  [-626, -494], [-724, -470], [-846, -482], [-944, -436], [-990, -344], 'WN']);
// West boulevard down to the coast
road('boulevard', ['WN', [-1012, -60], 'W4', [-1012, 300], [-1002, 440], 'WS']);
// Downtown connections
road('avenue', ['G0_1', [-470, -204], [-600, -186], [-760, -224], [-900, -232], 'WN']);
road('avenue', ['G0_4', [-500, 172], [-640, 142], 'WHB', [-880, 176], 'W4']);
road('lane', ['G0_2', [-480, -66], [-590, -18], [-700, 40], 'WHA', [-890, 110], 'W4']);
road('lane', ['WHA', [-780, 108], 'WHB']);
road('street', ['WHB', [-724, 270], [-664, 372], [-650, 470], [-690, 560], 'HWM']);
road('avenue', ['G6_1', [470, -190], [620, -210], [760, -190], 'E1']);
road('avenue', ['G6_4', [480, 168], [640, 150], [770, 172], 'E4']);
road('avenue', ['G3_0', [14, -420], [-24, -500], 'P3', [24, -650], [-6, -748], 'NC']);
road('avenue', ['G0_0', [-404, -430], [-424, -560], [-384, -680], 'NW']);
road('lane', ['G6_0', [392, -404], 'OTA', [530, -526], 'OTB', [722, -496], 'EN']);
road('lane', ['OTA', [430, -590], [468, -676], 'NE']);
road('lane', ['OTB', [650, -612], 'NE2']);
road('street', ['G4_0', [126, -420], [150, -540], [230, -680], [270, -780], 'NEC']);
// Ocean Boulevard, between downtown and the beach
road('boulevard', ['HWW', [-506, 520], 'OBW', [-440, 456], 'OB0', [-180, 470], 'OB3', [180, 452], 'OB6', [450, 448], 'OBE', [540, 540], 'HWE']);
road('avenue', ['G0_5', [-356, 340], [-366, 400], 'OB0', [-362, 520], 'HW0']);
road('avenue', ['G3_5', [-6, 350], [10, 410], 'OB3', [-8, 540], 'HW3']);
road('avenue', ['G6_5', [366, 344], [354, 400], 'OB6', [372, 530], 'HW6']);
// Lake loop in Palm Park (north)
{
  const cx = -172, cy = -572, r = 106, ring = ['LK'];
  for (let s = 1; s < 12; s++) { const a = (s / 12) * 2 * Math.PI; ring.push([cx + r * dcos(a), cy + r * 0.86 * dsin(a)]); }
  ring.push('LK');
  road('lane', ring, true);
  road('street', ['LK', [-30, -566], 'P3']);
}
// Repair & fuel stations: drivable pull-in pads next to the road.
// Each is placed beside the nearest road at (x, y), on `side` (+1 = right of the edge direction).
const STATIONS = [[-240, -213, -1, 'downtown'], [196, 610, -1, 'coast'], [-720, -800, -1, 'canyon'], [870, -40, 1, 'port'], [-1008, 230, -1, 'west']];
// Open plazas and lots
PADS.push({ kind: 'plaza', x: -168, y: -24, hx: 50, hy: 56, r: 12, ca: 1, sa: 0 });
PADS.push({ kind: 'lot', x: -232, y: 537, hx: 46, hy: 60, r: 6, ca: 1, sa: 0 });
OBSTACLES.push({ type: 'circle', x: -168, y: -24, r: 7 }); // plaza fountain
for (const [dx, dy] of [[-26, -26], [26, -26], [-26, 26], [26, 26]]) OBSTACLES.push({ type: 'circle', x: -168 + dx, y: -24 + dy, r: 2.4 }); // planters
for (const [dx, dy] of [[-20, -28], [0, -28], [20, -28], [-20, 28], [0, 28], [20, 28]]) OBSTACLES.push({ type: 'circle', x: -232 + dx, y: 537 + dy, r: 1.6 }); // lot palms

/* ------------------------------------------------------------------ build ---------- */
const nodeIndex = new Map();
export const nodes = []; // { x, y, name, edges: [{ e, end }] }
export const edges = []; // { a, b, kind, k, pts, cum, len, road, seq }
function nodeId(name) {
  if (!nodeIndex.has(name)) { const [x, y] = NODES.get(name); nodeIndex.set(name, nodes.length); nodes.push({ x, y, name, edges: [] }); }
  return nodeIndex.get(name);
}
ROADS.forEach((r, ri) => {
  let cur = null, ctrl = [], seq = 0;
  for (const p of r.path) {
    if (typeof p === 'string') {
      const id = nodeId(p);
      if (cur !== null) { edges.push({ a: cur, b: id, kind: r.kind, k: KINDS[r.kind], ctrl, road: ri, seq: seq++ }); }
      cur = id; ctrl = [];
    } else ctrl.push(p);
  }
});
edges.forEach((e, i) => { nodes[e.a].edges.push({ e: i, end: 0 }); nodes[e.b].edges.push({ e: i, end: 1 }); });

/** Neighbour control point that continues an edge smoothly through node n (same road first). */
function phantom(ei, end) {
  const e = edges[ei], n = nodes[end ? e.b : e.a];
  let best = null;
  for (const l of n.edges) {
    if (l.e === ei) continue;
    const o = edges[l.e];
    const sameRoad = o.road === e.road && Math.abs(o.seq - e.seq) === 1;
    const closedJoin = o.road === e.road && ROADS[e.road].closed;
    if (sameRoad || closedJoin || n.edges.length === 2) { best = l; if (sameRoad) break; }
  }
  if (!best) return null;
  const o = edges[best.e];
  const pts = [[nodes[o.a].x, nodes[o.a].y], ...o.ctrl, [nodes[o.b].x, nodes[o.b].y]];
  return best.end === 0 ? pts[1] : pts[pts.length - 2];
}
const SAMPLE = 3;
for (let ei = 0; ei < edges.length; ei++) {
  const e = edges[ei];
  const P = [[nodes[e.a].x, nodes[e.a].y], ...e.ctrl, [nodes[e.b].x, nodes[e.b].y]];
  const first = phantom(ei, 0) || [2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]];
  const n = P.length;
  const last = phantom(ei, 1) || [2 * P[n - 1][0] - P[n - 2][0], 2 * P[n - 1][1] - P[n - 2][1]];
  const Q = [first, ...P, last];
  const out = [P[0][0], P[0][1]];
  for (let i = 1; i < Q.length - 2; i++) {
    const p0 = Q[i - 1], p1 = Q[i], p2 = Q[i + 1], p3 = Q[i + 2];
    const sx = p2[0] - p1[0], sy = p2[1] - p1[1], span = Math.sqrt(sx * sx + sy * sy);
    const steps = Math.max(1, Math.ceil(span / SAMPLE));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push(x, y);
    }
  }
  e.pts = Float64Array.from(out);
  const m = out.length / 2;
  e.cum = new Float64Array(m);
  for (let i = 1; i < m; i++) { const dx = out[2 * i] - out[2 * i - 2], dy = out[2 * i + 1] - out[2 * i - 1]; e.cum[i] = e.cum[i - 1] + Math.sqrt(dx * dx + dy * dy); }
  e.len = e.cum[m - 1];
}
for (const e of edges) delete e.ctrl;

// Segments + uniform grid (CSR) for fast field queries.
let segCount = 0;
for (const e of edges) segCount += e.pts.length / 2 - 1;
const SAX = new Float64Array(segCount), SAY = new Float64Array(segCount), SDX = new Float64Array(segCount), SDY = new Float64Array(segCount);
const SINV = new Float64Array(segCount), SS0 = new Float64Array(segCount), SLEN = new Float64Array(segCount), SE = new Int32Array(segCount);
{
  let k = 0;
  edges.forEach((e, ei) => {
    const p = e.pts;
    for (let i = 0; i < p.length / 2 - 1; i++, k++) {
      SAX[k] = p[2 * i]; SAY[k] = p[2 * i + 1]; SDX[k] = p[2 * i + 2] - p[2 * i]; SDY[k] = p[2 * i + 3] - p[2 * i + 1];
      const l2 = SDX[k] * SDX[k] + SDY[k] * SDY[k];
      SINV[k] = l2 > 0 ? 1 / l2 : 0; SS0[k] = e.cum[i]; SLEN[k] = e.cum[i + 1] - e.cum[i]; SE[k] = ei;
    }
  });
}
const CELL = 24;
const GX0 = BOUNDS.minX, GY0 = BOUNDS.minY;
const GW = Math.ceil((BOUNDS.maxX - BOUNDS.minX) / CELL), GH = Math.ceil((BOUNDS.maxY - BOUNDS.minY) / CELL);
const cellStart = new Int32Array(GW * GH + 1);
let cellItems;
{
  const R = (k) => k.hw + k.lim + K_SMOOTH + 3;
  const ranges = new Int32Array(segCount * 4);
  for (let s = 0; s < segCount; s++) {
    const r = R(edges[SE[s]].k);
    const x0 = Math.min(SAX[s], SAX[s] + SDX[s]) - r, x1 = Math.max(SAX[s], SAX[s] + SDX[s]) + r;
    const y0 = Math.min(SAY[s], SAY[s] + SDY[s]) - r, y1 = Math.max(SAY[s], SAY[s] + SDY[s]) + r;
    const i0 = Math.max(0, Math.floor((x0 - GX0) / CELL)), i1 = Math.min(GW - 1, Math.floor((x1 - GX0) / CELL));
    const j0 = Math.max(0, Math.floor((y0 - GY0) / CELL)), j1 = Math.min(GH - 1, Math.floor((y1 - GY0) / CELL));
    ranges.set([i0, i1, j0, j1], s * 4);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cellStart[j * GW + i + 1]++;
  }
  for (let c = 0; c < GW * GH; c++) cellStart[c + 1] += cellStart[c];
  cellItems = new Int32Array(cellStart[GW * GH]);
  const fill = cellStart.slice(0, GW * GH);
  for (let s = 0; s < segCount; s++) {
    const i0 = ranges[s * 4], i1 = ranges[s * 4 + 1], j0 = ranges[s * 4 + 2], j1 = ranges[s * 4 + 3];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cellItems[fill[j * GW + i]++] = s;
  }
}

// Resolve station pads next to their roads (brute-force nearest segment; build time only).
for (const [x, y, side, name] of STATIONS) {
  let best = 1e18, bs = 0;
  for (let s = 0; s < segCount; s++) {
    const px = x - SAX[s], py = y - SAY[s];
    let t = (px * SDX[s] + py * SDY[s]) * SINV[s]; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = px - SDX[s] * t, qy = py - SDY[s] * t, d2 = qx * qx + qy * qy;
    if (d2 < best) { best = d2; bs = s; }
  }
  const l = Math.sqrt(SDX[bs] * SDX[bs] + SDY[bs] * SDY[bs]), tx = SDX[bs] / l, ty = SDY[bs] / l;
  const k = edges[SE[bs]].k, hy = 8.5, off = side * (k.hw + hy - 1.5);
  const px = x - SAX[bs], py = y - SAY[bs];
  let t = (px * SDX[bs] + py * SDY[bs]) * SINV[bs]; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = SAX[bs] + SDX[bs] * t, cy = SAY[bs] + SDY[bs] * t;
  PADS.push({ kind: 'station', name, x: cx - ty * off, y: cy + tx * off, hx: 17, hy, r: 3, ca: tx, sa: ty, side, edge: SE[bs], tx, ty });
}

/* ------------------------------------------------------------------ queries ---------- */
export const pads = PADS.map((p, i) => ({ ...p, id: i }));
export const stations = pads.filter((p) => p.kind === 'station');
export const obstacles = OBSTACLES;
for (const p of pads) { const ext = Math.sqrt(p.hx * p.hx + p.hy * p.hy) + K_SMOOTH + 2; p.bx0 = p.x - ext; p.bx1 = p.x + ext; p.by0 = p.y - ext; p.by1 = p.y + ext; }
const roundabout = { x: RC[0], y: RC[1], r: RR };
export { roundabout };

function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const d = a - b, h = (k - (d < 0 ? -d : d)) / k;
  if (h <= 0) return a < b ? a : b;
  return (a < b ? a : b) - h * h * k * 0.25;
}

/** Field sample: res = { f, g, nx, ny, e, s, side, d }. nx/ny point toward increasing g (walls). */
export function sample(x, y, res = {}) {
  let g1 = BIG, f1 = BIG, n1x = 0, n1y = 0, e1 = -1, s1 = 0, side1 = 0, d1 = BIG;
  let g2 = BIG, f2 = BIG, n2x = 0, n2y = 0;
  const ci = Math.floor((x - GX0) / CELL), cj = Math.floor((y - GY0) / CELL);
  if (ci >= 0 && cj >= 0 && ci < GW && cj < GH) {
    const c = cj * GW + ci, a = cellStart[c], b = cellStart[c + 1];
    let ce = -1, cd2 = 1e18, cs = -1, ct = 0;
    for (let n = a; n <= b; n++) {
      const sg = n < b ? cellItems[n] : -1;
      const e = sg >= 0 ? SE[sg] : -2;
      if (e !== ce) {
        if (ce >= 0) {
          const k = edges[ce].k, d = Math.sqrt(cd2);
          const gv = d - k.hw - k.lim;
          if (gv < g2) {
            const px = x - SAX[cs] - SDX[cs] * ct, py = y - SAY[cs] - SDY[cs] * ct;
            const inv = d > 1e-9 ? 1 / d : 0;
            const nx = px * inv, ny = py * inv;
            if (gv < g1) {
              g2 = g1; f2 = f1; n2x = n1x; n2y = n1y;
              g1 = gv; f1 = d - k.hw; n1x = nx; n1y = ny; e1 = ce; s1 = SS0[cs] + SLEN[cs] * ct; d1 = d;
              // signed offset to the right of the travel direction (right = (-dy, dx))
              const l = Math.sqrt(SDX[cs] * SDX[cs] + SDY[cs] * SDY[cs]) || 1;
              side1 = (-(SDY[cs]) * px + SDX[cs] * py) / l;
            } else { g2 = gv; f2 = d - k.hw; n2x = nx; n2y = ny; }
          }
        }
        ce = e; cd2 = 1e18;
      }
      if (sg < 0) break;
      const px = x - SAX[sg], py = y - SAY[sg];
      let t = (px * SDX[sg] + py * SDY[sg]) * SINV[sg];
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = px - SDX[sg] * t, qy = py - SDY[sg] * t, d2 = qx * qx + qy * qy;
      if (d2 < cd2) { cd2 = d2; cs = sg; ct = t; }
    }
  }
  // pads (rounded boxes)
  for (let i = 0; i < pads.length; i++) {
    const p = pads[i];
    if (x < p.bx0 || x > p.bx1 || y < p.by0 || y > p.by1) continue;
    const lx = (x - p.x) * p.ca + (y - p.y) * p.sa, ly = -(x - p.x) * p.sa + (y - p.y) * p.ca;
    const ax = (lx < 0 ? -lx : lx) - p.hx + p.r, ay = (ly < 0 ? -ly : ly) - p.hy + p.r;
    const ox = ax > 0 ? ax : 0, oy = ay > 0 ? ay : 0;
    const outside = Math.sqrt(ox * ox + oy * oy);
    const inside = ax > ay ? (ax < 0 ? ax : 0) : (ay < 0 ? ay : 0);
    const d = outside + inside - p.r;
    const gv = d - 0.4;
    if (gv >= g2) continue;
    let gx, gy;
    if (outside > 1e-9) { gx = (ox / outside) * (lx < 0 ? -1 : 1); gy = (oy / outside) * (ly < 0 ? -1 : 1); }
    else if (ax > ay) { gx = lx < 0 ? -1 : 1; gy = 0; } else { gx = 0; gy = ly < 0 ? -1 : 1; }
    const nx = gx * p.ca - gy * p.sa, ny = gx * p.sa + gy * p.ca;
    if (gv < g1) { g2 = g1; f2 = f1; n2x = n1x; n2y = n1y; g1 = gv; f1 = d; n1x = nx; n1y = ny; }
    else { g2 = gv; f2 = d; n2x = nx; n2y = ny; }
  }
  let f = f1, g = g1, nx = n1x, ny = n1y;
  if (g2 < BIG) {
    const dot = n1x * n2x + n1y * n2y, k = K_SMOOTH * (1 - (dot < 0 ? -dot : dot));
    f = smin(f1, f2, k); g = smin(g1, g2, k);
    if (k > 0) {
      let w = 0.5 + (0.5 * (g2 - g1)) / k; w = w < 0 ? 0 : w > 1 ? 1 : w;
      nx = n1x * w + n2x * (1 - w); ny = n1y * w + n2y * (1 - w);
      const l = Math.sqrt(nx * nx + ny * ny);
      if (l > 1e-9) { nx /= l; ny /= l; } else { nx = n1x; ny = n1y; }
    }
  }
  // solid obstacles inside drivable areas
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    const dx = x - o.x, dy = y - o.y;
    if (dx > 14 || dx < -14 || dy > 14 || dy < -14) continue;
    const dd = Math.sqrt(dx * dx + dy * dy), od = dd - o.r;
    const go = 1.1 - od;
    if (go > g) { g = go; const inv = dd > 1e-9 ? 1 / dd : 0; nx = -dx * inv; ny = -dy * inv; }
  }
  res.f = f; res.g = g; res.nx = nx; res.ny = ny; res.e = e1; res.s = s1; res.side = side1; res.d = d1;
  return res;
}

/** Point and unit tangent at arc length s along edge e (clamped). */
export function pointAt(e, s, out = {}) {
  const E = edges[e], c = E.cum, p = E.pts, m = c.length;
  if (s <= 0) s = 0; else if (s >= E.len) s = E.len;
  let lo = 0, hi = m - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (c[mid] <= s) lo = mid; else hi = mid; }
  const seg = c[hi] - c[lo] || 1, t = (s - c[lo]) / seg;
  const ax = p[2 * lo], ay = p[2 * lo + 1], bx = p[2 * hi], by = p[2 * hi + 1];
  out.x = ax + (bx - ax) * t; out.y = ay + (by - ay) * t;
  const dx = bx - ax, dy = by - ay, l = Math.sqrt(dx * dx + dy * dy) || 1;
  out.tx = dx / l; out.ty = dy / l;
  return out;
}
/** Is the car centre allowed here? */
export const drivable = (x, y) => sample(x, y, scratch).g <= 0;
const scratch = {};

/** Edge length-weighted shortest-path distances from a position on edge e at arc s to every node. */
export function routeFrom(e, s, out) {
  const n = nodes.length;
  if (!out || out.length !== n) out = new Float64Array(n);
  out.fill(1e12);
  const E = edges[e];
  out[E.a] = s; out[E.b] = E.len - s;
  const done = new Uint8Array(n);
  for (let iter = 0; iter < n; iter++) {
    let u = -1, best = 1e12;
    for (let i = 0; i < n; i++) if (!done[i] && out[i] < best) { best = out[i]; u = i; }
    if (u < 0) break;
    done[u] = 1;
    for (const l of nodes[u].edges) {
      const o = edges[l.e], v = l.end === 0 ? o.b : o.a, nd = best + o.len;
      if (nd < out[v]) out[v] = nd;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ world areas (visual + spawn) ---- */
export const coastY = (x) => 676 + 34 * dsin(x / 170 + 1.1) + 14 * dsin(x / 61);
export const coastX = (y) => 990 + 26 * dsin(y / 150 + 0.4);
export const LAKE = { x: -172, y: -572, rx: 58, ry: 46 };
/** Water depth-ish mask (>0 = water). Visual only. */
export function water(x, y) {
  let w = y - coastY(x);
  if (y > -760) w = Math.max(w, x - coastX(y));
  // marina inlet (crossed by the highway bridge)
  if (y > 470 && x > -636 && x < -566) w = Math.max(w, Math.min(x + 636, -566 - x) - 4);
  const lx = (x - LAKE.x) / LAKE.rx, ly = (y - LAKE.y) / LAKE.ry;
  w = Math.max(w, (1 - Math.sqrt(lx * lx + ly * ly)) * 40);
  return w;
}
/** District id for building style. */
export const DISTRICTS = ['downtown', 'beach', 'port', 'oldtown', 'hills', 'canyon', 'park', 'north'];
export function district(x, y) {
  if (x > 780) return 2;
  if (y > 330) return 1;
  if (x < -560 && y < -300) return 5;
  if (x < -420) return 4;
  if (x > 400 && y < -330) return 3;
  if (y < -420 && x > -320 && x < 120) return 6;
  if (y < -380) return 7;
  return 0;
}
export const LANDMARKS = [
  { type: 'fountain', x: RC[0], y: RC[1] },
  { type: 'fountain', x: -170, y: -10, small: 1 },
  { type: 'ferris', x: 120, y: 760 },
  { type: 'lighthouse', x: 1050, y: 640 },
  { type: 'sign', x: -760, y: -930 },
  { type: 'cranes', x: 960, y: -120 },
  { type: 'bridge', x: -600, y: 608 },
  { type: 'tower', x: 60, y: -150 },
];

/** Start grid: seeds pick one. [x, y, heading]. */
const SPAWNS = [[-300, 145, 0], [-160, 461, 0], [520, -196, 0], [-1005, 20, Math.PI / 2], [878, 60, -Math.PI / 2], [-240, -808, Math.PI]];
export function spawnPoint(seedHash) {
  const [x, y, a] = SPAWNS[seedHash % SPAWNS.length];
  const r = sample(x, y, {});
  // snap onto the right-hand lane of the nearest road and face along it
  const pt = pointAt(r.e, r.s, {});
  let tx = pt.tx, ty = pt.ty;
  if (tx * dcos(a) + ty * dsin(a) < 0) { tx = -tx; ty = -ty; }
  const lane = edges[r.e].k.laneW * 0.5;
  return { x: pt.x - ty * lane, y: pt.y + tx * lane, tx, ty, edge: r.e };
}

/** Whole-map field on a regular grid (renderer textures, building placement). Calls back per row. */
export function fieldGrid(step, onRow) {
  const w = Math.ceil((BOUNDS.maxX - BOUNDS.minX) / step), h = Math.ceil((BOUNDS.maxY - BOUNDS.minY) / step);
  const F = new Float32Array(w * h), G = new Float32Array(w * h), E = new Int16Array(w * h);
  const r = {};
  let j = 0;
  return {
    w, h, F, G, E, step,
    /** compute up to `rows` rows; returns true when finished */
    run(rows = h) {
      for (let k = 0; k < rows && j < h; k++, j++) {
        const y = BOUNDS.minY + (j + 0.5) * step;
        for (let i = 0; i < w; i++) {
          sample(BOUNDS.minX + (i + 0.5) * step, y, r);
          const o = j * w + i;
          F[o] = r.f; G[o] = r.g; E[o] = r.e;
        }
        onRow?.(j, h);
      }
      return j >= h;
    },
  };
}
export const ROAD_COUNT = ROADS.length;

/** Asphalt distance to roads other than edge `e` and its smooth continuations (degree-2 joins and
 * the same road through a junction). Used by the renderer to keep lane markings out of junctions. */
export function asphaltExcept(x, y, e) {
  const E = edges[e];
  const skip = (o) => {
    if (o === e) return true;
    const O = edges[o];
    for (const n of [E.a, E.b]) if ((O.a === n || O.b === n) && nodes[n].edges.length === 2) return true;
    return false;
  };
  const ci = Math.floor((x - GX0) / CELL), cj = Math.floor((y - GY0) / CELL);
  if (ci < 0 || cj < 0 || ci >= GW || cj >= GH) return BIG;
  const c = cj * GW + ci;
  let best = BIG;
  for (let n = cellStart[c]; n < cellStart[c + 1]; n++) {
    const sg = cellItems[n], o = SE[sg];
    if (skip(o)) continue;
    const px = x - SAX[sg], py = y - SAY[sg];
    let t = (px * SDX[sg] + py * SDY[sg]) * SINV[sg]; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = px - SDX[sg] * t, qy = py - SDY[sg] * t;
    const d = Math.sqrt(qx * qx + qy * qy) - edges[o].k.hw;
    if (d < best) best = d;
  }
  for (const p of pads) {
    if (x < p.bx0 || x > p.bx1 || y < p.by0 || y > p.by1) continue;
    const lx = (x - p.x) * p.ca + (y - p.y) * p.sa, ly = -(x - p.x) * p.sa + (y - p.y) * p.ca;
    const ax = Math.abs(lx) - p.hx, ay = Math.abs(ly) - p.hy;
    const d = Math.sqrt(Math.max(ax, 0) ** 2 + Math.max(ay, 0) ** 2) + Math.min(Math.max(ax, ay), 0);
    if (d < best) best = d;
  }
  return best;
}
