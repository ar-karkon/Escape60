import * as T from "../../vendor/three.js";

/* Procedural low-poly car bodies. A body is lofted through ~40 stations along its length: each station
   is a 10-point half cross-section (sill, side, shoulder, glasshouse, roof) driven by a side profile
   (nose, hood, windshield, roof, rear glass, deck, tail) and a plan taper. Quads are emitted
   unindexed with analytic normals (smooth inside a smoothing group, creased between groups and at
   the cowl / deck lines), so the cars read clean and faceted at the same time.

   Vertex attributes: position, normal, color (paint / glass / trim colours), aMat = (roughness,
   metalness, emissive, kind). Kinds: 0 paint, 1 glass, 2 trim, 3 headlight, 4 taillight, 5 chrome,
   6 siren red, 7 siren blue, 8 amber, 9 plate. Model space: forward = -z, up = +y, right = +x. */
export const KIND = { PAINT: 0, GLASS: 1, TRIM: 2, HEAD: 3, TAIL: 4, CHROME: 5, RED: 6, BLUE: 7, AMBER: 8, PLATE: 9, TIRE: 10, RIM: 11 };
const MAT = {
  0: [0.32, 0.25, 0], 1: [0.06, 0.4, 0], 2: [0.62, 0.05, 0], 3: [0.2, 0.0, 2.2], 4: [0.25, 0.0, 1.0], 5: [0.12, 1.0, 0],
  6: [0.3, 0, 0.3], 7: [0.3, 0, 0.3], 8: [0.3, 0, 0.9], 9: [0.5, 0, 0.15], 10: [0.85, 0, 0], 11: [0.22, 0.9, 0],
};
const COL = { glass: new T.Color(0x0c1220), trim: new T.Color(0x16171b), head: new T.Color(0xfff4dc), tail: new T.Color(0xff1428), chrome: new T.Color(0xd8dce2),
  red: new T.Color(0xff2030), blue: new T.Color(0x1f6bff), amber: new T.Color(0xffa21a), plate: new T.Color(0xeeeeea), tire: new T.Color(0x18181a), rim: new T.Color(0xb8bec8) };

class Builder {
  constructor() { this.p = []; this.n = []; this.c = []; this.m = []; }
  vert(x, y, z, nx, ny, nz, col, kind) {
    const mm = MAT[kind];
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(col.r, col.g, col.b); this.m.push(mm[0], mm[1], mm[2], kind);
  }
  tri(a, b, c, col, kind, na, nb, nc) {
    if (!na) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      na = nb = nc = [nx, ny, nz];
    }
    this.vert(...a, ...na, col, kind); this.vert(...b, ...nb, col, kind); this.vert(...c, ...nc, col, kind);
  }
  quad(a, b, c, d, col, kind, na, nb, nc, nd) { this.tri(a, b, c, col, kind, na, nb, nc); this.tri(a, c, d, col, kind, na, nc, nd); }
  /** Axis-aligned box (optionally rotated about x by `tilt`), centre (x, y, z), size (sx, sy, sz). */
  box(x, y, z, sx, sy, sz, col, kind, tilt = 0) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2, c = Math.cos(tilt), s = Math.sin(tilt);
    const P = (dx, dy, dz) => [x + dx, y + dy * c - dz * s, z + dy * s + dz * c];
    const v = [P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(-hx, hy, -hz), P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz)];
    const f = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4]];
    for (const q of f) this.quad(v[q[0]], v[q[1]], v[q[2]], v[q[3]], col, kind);
  }
  /** Disc facing ±z (dir) made of n segments, centre (x, y, z). */
  disc(x, y, z, r, n, dir, col, kind, depth = 0.04) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const p0 = [x + Math.cos(a0) * r, y + Math.sin(a0) * r, z], p1 = [x + Math.cos(a1) * r, y + Math.sin(a1) * r, z];
      const c = [x, y, z + dir * 0.005];
      if (dir < 0) this.tri(c, p1, p0, col, kind); else this.tri(c, p0, p1, col, kind);
      const b0 = [p0[0], p0[1], z - dir * depth], b1 = [p1[0], p1[1], z - dir * depth];
      if (dir < 0) this.quad(p0, p1, b1, b0, col, kind); else this.quad(p0, b0, b1, p1, col, kind);
    }
  }
  /** Cylinder along x (wheels, exhausts) */
  cylX(x, y, z, r, len, n, col, kind) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const y0 = y + Math.cos(a0) * r, z0 = z + Math.sin(a0) * r, y1 = y + Math.cos(a1) * r, z1 = z + Math.sin(a1) * r;
      const na = [0, Math.cos(a0), Math.sin(a0)], nb = [0, Math.cos(a1), Math.sin(a1)];
      this.quad([x - len / 2, y0, z0], [x - len / 2, y1, z1], [x + len / 2, y1, z1], [x + len / 2, y0, z0], col, kind, na, nb, nb, na);
      this.tri([x + len / 2, y, z], [x + len / 2, y0, z0], [x + len / 2, y1, z1], col, kind, [1, 0, 0], [1, 0, 0], [1, 0, 0]);
      this.tri([x - len / 2, y, z], [x - len / 2, y1, z1], [x - len / 2, y0, z0], col, kind, [-1, 0, 0], [-1, 0, 0], [-1, 0, 0]);
    }
  }
  /** Cylinder along z (exhaust tips) */
  cylZ(x, y, z, r, len, n, col, kind) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const x0 = x + Math.cos(a0) * r, y0 = y + Math.sin(a0) * r, x1 = x + Math.cos(a1) * r, y1 = y + Math.sin(a1) * r;
      this.quad([x0, y0, z - len / 2], [x1, y1, z - len / 2], [x1, y1, z + len / 2], [x0, y0, z + len / 2], col, kind, [Math.cos(a0), Math.sin(a0), 0], [Math.cos(a1), Math.sin(a1), 0], [Math.cos(a1), Math.sin(a1), 0], [Math.cos(a0), Math.sin(a0), 0]);
    }
  }
  geometry() {
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new T.Float32BufferAttribute(this.n, 3));
    g.setAttribute("color", new T.Float32BufferAttribute(this.c, 3));
    g.setAttribute("aMat", new T.Float32BufferAttribute(this.m, 4));
    g.computeBoundingSphere();
    return g;
  }
}

const ease = (t) => 1 - (1 - t) * (1 - t);
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

/** Build a car body. spec: body params from cars.js; opts: { paint, stripe, livery, police, taxiColor } */
export function buildCar(spec, opts = {}) {
  const b = new Builder();
  const L = spec.L, W = spec.W, H = spec.H, wr = spec.wr, lift = spec.lift || 0;
  const paint = new T.Color(opts.paint ?? 0xcccccc), stripe = new T.Color(opts.stripe ?? 0x111111);
  const uF = spec.fo / L, uR = (spec.fo + spec.wb) / L, archU = (wr * 1.18) / L;
  const sillBase = wr * 0.62 + lift, archY = wr * 2 + 0.05 + lift;
  const z = (u) => -L / 2 + u * L;
  const halfW = (u) => {
    let k = 1;
    if (u < 0.2) k = spec.noseW + (1 - spec.noseW) * ease(u / 0.2);
    else if (u > 0.8) k = 1 - (1 - spec.tailW) * smooth((u - 0.8) / 0.2);
    let w = (W / 2) * k;
    const fl = spec.flare || 0;
    for (const ax of [uF, uR]) { const d = Math.abs(u - ax) / (archU * 1.6); if (d < 1) w += (W / 2) * fl * (1 - d * d); }
    return w;
  };
  const sill = (u) => {
    let y = sillBase;
    for (const ax of [uF, uR]) { const d = Math.abs(u - ax) / archU; if (d < 1) y = Math.max(y, sillBase + (archY - sillBase) * Math.sqrt(1 - d * d)); }
    return y;
  };
  const top = (u) => {
    // hood / belt / deck line (top of the lower body)
    const lf = lift;
    if (u <= spec.cowl) { const t = u / spec.cowl; return lf + spec.nose + (spec.hood - spec.nose) * (spec.wedge ? t : ease(t)); }
    if (u <= spec.r0) return lf + spec.hood + (spec.belt - spec.hood) * smooth((u - spec.cowl) / (spec.r0 - spec.cowl));
    if (u <= spec.deck) return lf + spec.belt + (spec.deckY - spec.belt) * smooth(clamp01((u - spec.r1) / Math.max(0.01, spec.deck - spec.r1)));
    const t = (u - spec.deck) / Math.max(0.01, 1 - spec.deck);
    return lf + spec.deckY + (spec.tail - spec.deckY) * t;
  };
  const roofH = H + lift;
  const roof = (u) => {
    if (u <= spec.cowl || u >= spec.deck) return null;
    const t0 = top(u);
    if (u < spec.r0) { const t = (u - spec.cowl) / (spec.r0 - spec.cowl); return t0 + (roofH - t0) * (spec.boxy ? Math.pow(t, 0.8) : ease(t)); }
    if (u <= spec.r1) return roofH - 0.02 * Math.pow((u - (spec.r0 + spec.r1) / 2) / ((spec.r1 - spec.r0) / 2 + 1e-6), 2);
    const t = (u - spec.r1) / (spec.deck - spec.r1);
    return roofH + (t0 - roofH) * (spec.van ? t * t * t : spec.boxy ? smooth(t) : t * (2 - t) * 0.5 + t * 0.5);
  };
  // stations
  const us = new Set([0, 0.012, 0.035, 0.07, 1, 0.988, 0.965, 0.93]);
  for (let i = 1; i < 26; i++) us.add(i / 26);
  for (const ax of [uF, uR]) for (const k of [-1, -0.88, -0.6, -0.3, 0, 0.3, 0.6, 0.88, 1]) us.add(ax + k * archU);
  for (const k of [spec.cowl, spec.r0, spec.r1, spec.deck]) { us.add(k); us.add(k + 0.012); }
  us.add((spec.r0 + spec.r1) / 2);
  const U = [...us].filter((u) => u >= 0 && u <= 1).sort((a, b2) => a - b2).filter((u, i, a) => i === 0 || u - a[i - 1] > 0.004);
  const crease = new Set([spec.cowl, spec.deck].map((k) => U.reduce((best, u) => (Math.abs(u - k) < Math.abs(best - k) ? u : best), 0)));
  const crown = spec.boxy ? 0.025 : 0.05;
  const NP = 10;
  const rings = U.map((u) => {
    const w = halfW(u), y0 = sill(u), t = top(u), r = roof(u), ry = r === null ? null : Math.max(r, t);
    const bulge = spec.boxy ? 0.0 : 0.025;
    const pts = [
      [0, y0 + 0.02], [w * 0.9, y0], [w, y0 + 0.07], [w * (1 + bulge), y0 + (t - y0) * 0.45], [w * 0.985, t - 0.07], [w * 0.93, t],
    ];
    const rw = (W / 2) * spec.roofW * (u < spec.r0 ? 0.92 + 0.08 * clamp01((u - spec.cowl) / (spec.r0 - spec.cowl)) : 1) * (u > 0.8 ? halfW(u) / (W / 2) : 1);
    if (ry !== null && ry > t + 0.03) pts.push([w * 0.9, t + 0.01], [rw, ry - 0.05], [rw * 0.55, ry + crown * 0.6], [0, ry + crown]);
    else pts.push([w * 0.8, t + crown * 0.3], [w * 0.6, t + crown * 0.55], [w * 0.32, t + crown * 0.85], [0, t + crown]);
    return { u, z: z(u), pts, gh: ry !== null && ry > t + 0.03 };
  });
  const GROUP = [0, 1, 2, 2, 2, 3, 4, 5, 5]; // smoothing group per strip j (between point j and j+1)
  const P = (i, j, side = 1) => [rings[i].pts[j][0] * side, rings[i].pts[j][1], rings[i].z];
  function normalAt(i, j, iNeighbor, jStrip, side) {
    // along-length derivative (one-sided at crease stations), around-section derivative within group
    const n = rings.length;
    let ia = i - 1, ib = i + 1;
    if (crease.has(rings[i].u)) { if (iNeighbor > i) ia = i; else ib = i; }
    ia = Math.max(0, ia); ib = Math.min(n - 1, ib);
    if (ia === ib) { ia = Math.max(0, i - 1); ib = Math.min(n - 1, i + 1); }
    const A = P(ia, j), B = P(ib, j);
    const du = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const g = GROUP[jStrip];
    let ja = j - 1, jb = j + 1;
    if (j === jStrip) { if (j === 0 || GROUP[j - 1] !== g) ja = j; } else if (j === jStrip + 1) { if (j === NP - 1 || GROUP[j] !== g) jb = j; }
    ja = Math.max(0, ja); jb = Math.min(NP - 1, jb);
    const C = P(i, ja), D = P(i, jb);
    const dj = [D[0] - C[0], D[1] - C[1], D[2] - C[2]];
    let nx = du[1] * dj[2] - du[2] * dj[1], ny = du[2] * dj[0] - du[0] * dj[2], nz = du[0] * dj[1] - du[1] * dj[0];
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    // outward for the right side
    if (nx * (rings[i].pts[j][0] + 0.001) + (ny * (rings[i].pts[j][1] - 0.6)) * 0.3 < 0 && j < 9) { nx = -nx; ny = -ny; nz = -nz; }
    if (j === 9 && ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    return [nx * side, ny, nz];
  }
  const roofDark = spec.twoTone ? new T.Color(0x15161a) : null;
  function strip(i, j) {
    const a = rings[i], c = rings[i + 1], um = (a.u + c.u) / 2, gh = a.gh && c.gh;
    let col = paint, kind = KIND.PAINT;
    if (j === 0) { col = COL.trim; kind = KIND.TRIM; }
    else if (j === 1) { col = COL.trim; kind = KIND.TRIM; }
    else if (j === 6) {
      if (gh && um > spec.r0 - 0.045 && um < spec.r1 + (spec.boxy ? 0.03 : 0.06)) { col = COL.glass; kind = KIND.GLASS; }
      else if (um > spec.cowl && um < spec.r0) { col = COL.trim; kind = KIND.TRIM; }
    } else if (j >= 7) {
      if (um > spec.cowl && um < spec.r0) { col = COL.glass; kind = KIND.GLASS; }
      else if (um > spec.r1 && um < spec.deck && (a.gh || c.gh)) { col = COL.glass; kind = KIND.GLASS; }
      else if (um >= spec.r0 && um <= spec.r1 && roofDark) col = roofDark;
    }
    if (kind === KIND.PAINT && opts.livery) col = liveryColor(opts.livery, um, j, paint, stripe, spec);
    for (const side of [1, -1]) {
      const p00 = P(i, j, side), p01 = P(i, j + 1, side), p10 = P(i + 1, j, side), p11 = P(i + 1, j + 1, side);
      const n00 = normalAt(i, j, i + 1, j, side), n01 = normalAt(i, j + 1, i + 1, j, side), n10 = normalAt(i + 1, j, i, j, side), n11 = normalAt(i + 1, j + 1, i, j, side);
      if (side > 0) b.quad(p00, p01, p11, p10, col, kind, n00, n01, n11, n10);
      else b.quad(p00, p10, p11, p01, col, kind, n00, n10, n11, n01);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < NP - 1; j++) strip(i, j);
  // end caps (front / rear faces)
  for (const [i, dir] of [[0, -1], [rings.length - 1, 1]]) {
    const r = rings[i], zc = r.z, pts = r.pts;
    const cy = (pts[0][1] + pts[9][1]) / 2;
    const ring = [...pts.map((p) => [p[0], p[1]]), ...pts.slice().reverse().map((p) => [-p[0], p[1]])];
    for (let k = 0; k < ring.length - 1; k++) {
      const a = [ring[k][0], ring[k][1], zc], c = [ring[k + 1][0], ring[k + 1][1], zc], m = [0, cy, zc];
      if (dir < 0) b.tri(m, c, a, paint, KIND.PAINT, [0, 0, -1], [0, 0, -1], [0, 0, -1]);
      else b.tri(m, a, c, paint, KIND.PAINT, [0, 0, 1], [0, 0, 1], [0, 0, 1]);
    }
  }
  // ----- details -----
  const zf = -L / 2 - 0.012, zb = L / 2 + 0.012;
  const nose = spec.nose + lift, tail = spec.tail + lift;
  const fw = halfW(0), bw = halfW(1);
  // grille + bumper lip
  b.box(0, nose * 0.62, zf + 0.01, fw * 0.9, nose * 0.32, 0.03, COL.trim, KIND.TRIM);
  b.box(0, sillBase + 0.04, -L / 2 + 0.06, fw * 1.85, 0.07, 0.18, COL.trim, KIND.TRIM);
  // headlights
  const hy = nose - 0.09, hx = fw * 0.66;
  for (const sd of [-1, 1]) {
    const x = hx * sd;
    switch (spec.lights) {
      case "round": b.disc(x, hy - 0.02, zf, 0.085, 10, -1, COL.head, KIND.HEAD); if (spec.boxy) b.box(x, hy - 0.02, zf + 0.01, 0.26, 0.2, 0.02, COL.trim, KIND.TRIM); break;
      case "quad": b.box(x - sd * 0.08, hy - 0.03, zf, 0.14, 0.12, 0.03, COL.head, KIND.HEAD); b.box(x + sd * 0.09, hy - 0.03, zf, 0.14, 0.12, 0.03, COL.head, KIND.HEAD); break;
      case "rect": b.box(x, hy - 0.03, zf, 0.36, 0.13, 0.03, COL.head, KIND.HEAD); break;
      case "popup": b.box(x, hy + 0.06, -L / 2 + 0.28, 0.38, 0.03, 0.3, COL.trim, KIND.TRIM, 0.12); b.box(x * 1.1, sillBase + 0.16, zf, 0.2, 0.05, 0.03, COL.amber, KIND.AMBER); b.box(x, hy - 0.04, zf, 0.3, 0.04, 0.03, COL.head, KIND.HEAD); break;
      default: b.box(x, hy, zf, 0.42, 0.07, 0.03, COL.head, KIND.HEAD); b.box(x - sd * 0.02, hy - 0.06, zf, 0.3, 0.025, 0.03, COL.head, KIND.HEAD);
    }
  }
  // taillights
  const ty = tail - 0.12, tx = bw * 0.7;
  switch (spec.tails) {
    case "bar": b.box(0, ty, zb, bw * 1.75, 0.09, 0.03, COL.tail, KIND.TAIL); break;
    case "round": for (const sd of [-1, 1]) { b.disc(sd * tx, ty, zb, 0.075, 10, 1, COL.tail, KIND.TAIL); b.disc(sd * (tx - 0.2), ty, zb, 0.075, 10, 1, COL.tail, KIND.TAIL); } break;
    case "slim": b.box(0, ty + 0.02, zb, bw * 1.8, 0.04, 0.03, COL.tail, KIND.TAIL); for (const sd of [-1, 1]) b.box(sd * tx, ty - 0.02, zb, 0.36, 0.06, 0.03, COL.tail, KIND.TAIL); break;
    default: for (const sd of [-1, 1]) b.box(sd * tx, ty, zb, 0.38, 0.16, 0.03, COL.tail, KIND.TAIL);
  }
  // plate + rear bumper + diffuser
  b.box(0, (ty + sillBase) / 2 + 0.02, zb + 0.005, 0.46, 0.13, 0.02, COL.plate, KIND.PLATE);
  b.box(0, sillBase + 0.05, L / 2 - 0.08, bw * 1.85, 0.08, 0.18, COL.trim, KIND.TRIM);
  // exhausts
  const exhausts = [];
  const nEx = spec.exhaust || 1;
  for (let k = 0; k < nEx; k++) {
    const x = nEx === 1 ? bw * 0.55 : nEx === 2 ? (k ? 1 : -1) * bw * 0.6 : (k - 1) * 0.12;
    const r = spec.cls === "S" ? 0.05 : 0.045;
    b.cylZ(x, sillBase + 0.07, L / 2 - 0.02, r, 0.16, 8, COL.chrome, KIND.CHROME);
    exhausts.push([x, sillBase + 0.07, L / 2 + 0.06]);
  }
  // mirrors
  for (const sd of [-1, 1]) { const u = spec.cowl + 0.05; b.box(sd * (halfW(u) * 0.93 + 0.05), top(u) + 0.07, z(u), 0.1, 0.07, 0.11, COL.trim, KIND.TRIM); }
  // hood scoop
  if (spec.scoop) b.box(0, top(spec.cowl * 0.55) + 0.05, z(spec.cowl * 0.55), 0.46, 0.08, 0.5, COL.trim, KIND.TRIM);
  // spoilers
  const dz = z(Math.min(0.985, (spec.deck + 1) / 2 + 0.02)), dy = top(0.985);
  switch (spec.spoiler) {
    case "lip": b.box(0, dy + 0.035, L / 2 - 0.12, bw * 1.6, 0.05, 0.2, opts.police ? COL.trim : paint, KIND.PAINT); break;
    case "duck": b.box(0, dy + 0.06, L / 2 - 0.14, bw * 1.75, 0.07, 0.26, paint, KIND.PAINT, -0.35); break;
    case "wing": for (const sd of [-1, 1]) b.box(sd * bw * 0.62, dy + 0.12, dz, 0.05, 0.22, 0.1, COL.trim, KIND.TRIM); b.box(0, dy + 0.24, dz + 0.02, bw * 1.8, 0.04, 0.3, paint, KIND.PAINT, 0.08); break;
    case "gt": for (const sd of [-1, 1]) { b.box(sd * bw * 0.55, dy + 0.2, dz, 0.05, 0.38, 0.1, COL.trim, KIND.TRIM); b.box(sd * bw * 0.95, dy + 0.39, dz + 0.02, 0.03, 0.14, 0.4, COL.trim, KIND.TRIM); } b.box(0, dy + 0.4, dz + 0.02, bw * 1.95, 0.04, 0.38, COL.trim, KIND.TRIM, 0.1); break;
    case "hoop": for (const sd of [-1, 1]) b.box(sd * bw * 0.85, dy + 0.14, dz + 0.04, 0.07, 0.28, 0.42, paint, KIND.PAINT, 0.3); b.box(0, dy + 0.27, dz + 0.1, bw * 1.75, 0.045, 0.28, paint, KIND.PAINT, 0.1); break;
    default: break;
  }
  // police equipment
  let barY = 0;
  if (opts.police || spec.police) {
    const ru = (spec.r0 + spec.r1) / 2;
    barY = roof(ru) + 0.02;
    b.box(0, barY + 0.03, z(ru) - 0.05, W * 0.62, 0.05, 0.28, COL.trim, KIND.TRIM);
    b.box(-W * 0.17, barY + 0.1, z(ru) - 0.05, W * 0.27, 0.1, 0.24, COL.red, KIND.RED);
    b.box(W * 0.17, barY + 0.1, z(ru) - 0.05, W * 0.27, 0.1, 0.24, COL.blue, KIND.BLUE);
    if (spec.bull) { b.box(0, nose * 0.55, zf - 0.12, fw * 1.5, 0.08, 0.06, COL.trim, KIND.TRIM); b.box(0, nose * 0.85, zf - 0.12, fw * 1.5, 0.06, 0.06, COL.trim, KIND.TRIM); for (const sd of [-1, 1]) b.box(sd * fw * 0.45, nose * 0.7, zf - 0.1, 0.06, nose * 0.4, 0.06, COL.trim, KIND.TRIM); }
    // grille strobes
    for (const sd of [-1, 1]) b.box(sd * fw * 0.25, nose * 0.62, zf - 0.005, 0.12, 0.05, 0.02, sd < 0 ? COL.red : COL.blue, sd < 0 ? KIND.RED : KIND.BLUE);
  }
  if (spec.taxi) { const ru = (spec.r0 + spec.r1) / 2; const y = roof(ru); b.box(0, y + 0.1, z(ru), 0.7, 0.18, 0.26, new T.Color(0xffd23f), KIND.AMBER); }
  const wheels = [];
  const track = W / 2 - 0.13;
  for (const [u, front] of [[uF, true], [uR, false]]) for (const sd of [-1, 1]) wheels.push({ x: sd * track, y: wr, z: z(u), front, side: sd });
  return {
    geometry: b.geometry(), wheels, exhausts, barY, wr, ww: spec.ww || 0.24,
    head: [[-hx, hy, zf], [hx, hy, zf]], tail: [[-tx, ty, zb], [tx, ty, zb]], size: [W, H + lift, L],
    roofY: roofH,
  };
}

function liveryColor(livery, u, j, paint, stripe, spec) {
  switch (livery) {
    case "stripes": return j >= 8 && (u < spec.cowl || u > spec.r1 || true) ? stripe : paint;
    case "side": return j === 3 && u > 0.1 && u < 0.92 ? stripe : paint;
    case "twotone": return j >= 5 ? stripe : paint;
    case "race": return (j === 3 && u > 0.12 && u < 0.9) || j >= 8 ? stripe : paint;
    default: return paint;
  }
}

/** Wheel: rounded tyre + five-spoke rim (+ brake caliper). Spins about x. */
export function buildWheel(r = 0.33, w = 0.24, rimColor = 0xb8bec8, caliper = 0xd01f2c) {
  const b = new Builder();
  const n = 14, tire = COL.tire, rim = new T.Color(rimColor);
  // tyre: outer tread + sidewalls
  b.cylX(0, 0, 0, r, w, n, tire, KIND.TIRE);
  // rim face (outer side, +x) — spokes and hub drawn slightly outside the tyre wall
  const rx = w / 2 + 0.006, rr = r * 0.68;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    b.quad([rx, Math.cos(a0) * rr, Math.sin(a0) * rr], [rx, Math.cos(a0) * rr * 0.86, Math.sin(a0) * rr * 0.86], [rx, Math.cos(a1) * rr * 0.86, Math.sin(a1) * rr * 0.86], [rx, Math.cos(a1) * rr, Math.sin(a1) * rr], rim, KIND.RIM, [1, 0, 0], [1, 0, 0], [1, 0, 0], [1, 0, 0]);
    b.tri([rx - 0.03, 0, 0], [rx - 0.03, Math.cos(a0) * rr * 0.86, Math.sin(a0) * rr * 0.86], [rx - 0.03, Math.cos(a1) * rr * 0.86, Math.sin(a1) * rr * 0.86], COL.trim, KIND.TRIM, [1, 0, 0], [1, 0, 0], [1, 0, 0]);
  }
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), wd = r * 0.13;
    const p = (d, o) => [rx + 0.004, ca * d - sa * o, sa * d + ca * o];
    b.quad(p(0.03, -wd * 0.7), p(rr * 0.88, -wd), p(rr * 0.88, wd), p(0.03, wd * 0.7), rim, KIND.RIM, [1, 0, 0], [1, 0, 0], [1, 0, 0], [1, 0, 0]);
  }
  const g = b.geometry();
  return g;
}
/** Static brake caliper (does not spin): small box placed behind the rim. */
export function caliperGeometry(r = 0.33, color = 0xd01f2c) {
  const b = new Builder();
  b.box(0.06, r * 0.36, -r * 0.18, 0.05, r * 0.38, r * 0.3, new T.Color(color), KIND.PAINT);
  return b.geometry();
}
