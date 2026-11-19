import * as T from "../../vendor/three.js";
import * as M from "../map.js";
import { U, groundMaterial, waterMaterial, kitMaterial, facadeMaterial, glowMaterial } from "./materials.js";
import { Kit } from "./kit.js";
import { PROP_TYPES, buildProps } from "./props.js";
import { atlasTexture, cell } from "./signs.js";

/* Sunset Bay, built from the shared road map:
   - one ground plane shaded from a half-float road field texture (asphalt, curbs, sidewalks, verges)
     and a zone texture (grass / sand / rock / paving), plus sea + lake water;
   - buildings placed along every street frontage (they follow the curves) and infill towers,
     merged into 16 regional meshes with procedural facades;
   - lane markings, crosswalks and stop lines; walls, hedges and guard rails traced along the exact
     collision boundary (marching squares on the wall field), so what you hit is what you see;
   - streamed instanced props (lamps, palms, trees, rocks, benches, hydrants, cones, billboards...),
     knock-over breakables, and landmarks (repair stations, fountains, ferris wheel, lighthouse,
     cranes, bridge, hillside letters). Visual only: the simulation never reads any of this. */
const STEP = 2, REG = 6;
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
const lerp = (a, b, t) => a + (b - a) * t;

const DIST = [
  /* downtown */ { w: [14, 24], d: [16, 30], h: [14, 44], gap: [0, 1.2], styles: [1, 1, 2, 3, 3, 0], colors: [0xd8d2c8, 0xb8bcc4, 0x9aa3ad, 0xe6dccb, 0x7d8794, 0xc9b79c, 0xa7b4c2] },
  /* beach */ { w: [16, 28], d: [14, 24], h: [10, 30], gap: [1, 4], styles: [6, 6, 3, 2], colors: [0xf7c6c7, 0xbfe8dc, 0xfde3b0, 0xf9d5e5, 0xf4f1ea, 0xcfe3f7, 0xffd0a8] },
  /* port */ { w: [24, 44], d: [18, 30], h: [8, 14], gap: [3, 8], styles: [4], colors: [0x6d7f8f, 0x8a5a44, 0x4f6d7a, 0xa0a6ad, 0x3f5f8a, 0x9c8a6a] },
  /* oldtown */ { w: [9, 16], d: [10, 16], h: [6, 13], gap: [0, 1], styles: [3, 2, 5, 3], colors: [0xd98c5f, 0xe8c27a, 0xf2e6d0, 0xc9654b, 0xb9d3c2, 0xe9d5b7] },
  /* hills */ { w: [10, 14], d: [9, 13], h: [4.5, 7.5], gap: [5, 11], styles: [5], colors: [0xf5efe3, 0xe7d8bf, 0xf2f2f2, 0xd9e6ec, 0xf0d9c4] },
  /* canyon */ null,
  /* park */ null,
  /* north */ { w: [14, 24], d: [14, 22], h: [9, 24], gap: [1, 4], styles: [2, 1, 3, 2], colors: [0xd6cfc4, 0xc4b5a0, 0xe2ddd3, 0x9fb0bf, 0xe8c9a8] },
];
const GLASS = [0x8fa3b5, 0x5c6b7a, 0xb08d6a, 0x6f8fa6, 0x485566];
const AWN = [0xd62839, 0x1d6fd8, 0x2a9d8f, 0xf4a261, 0x6b2bd9, 0x111111, 0xe9c46a];
const NEON = [0xff2d6f, 0x19e3ff, 0xb6ff2e, 0xffd23f, 0xc77dff, 0xff7a1a];

/** Facade geometry builder (position, normal, color, aFac, aBld) */
class Fac {
  constructor() { this.p = []; this.n = []; this.c = []; this.f = []; this.b = []; }
  face(pts, uv, col, bld, fh, ww) {
    const [a, b, c, d] = pts;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const order = [0, 1, 2, 0, 2, 3];
    for (const i of order) {
      const p = pts[i];
      this.p.push(p[0], p[1], p[2]); this.n.push(nx, ny, nz); this.c.push(col.r, col.g, col.b);
      this.f.push(uv[i][0], uv[i][1], fh, ww); this.b.push(bld[0], bld[1], bld[2], bld[3]);
    }
  }
  /** Oriented block: centre (cx, cz), along (ux, uz), depth dir (vx, vz), size w × d, from y0 to y1. */
  block(cx, cz, ux, uz, vx, vz, w, d, y0, y1, col, bld, fh, ww, roof = true) {
    const P = (lx, lz, y) => [cx + ux * lx + vx * lz, y, cz + uz * lx + vz * lz];
    const C = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = C[i], [bx, bz] = C[(i + 1) % 4], len = Math.hypot(bx - ax, bz - az);
      let A = P(ax, az, y0), B = P(bx, bz, y0), Bt = P(bx, bz, y1), At = P(ax, az, y1);
      // outward test
      const mx = (A[0] + B[0]) / 2 - cx, mz = (A[2] + B[2]) / 2 - cz, tx = B[0] - A[0], tz = B[2] - A[2];
      if (-tz * mx + tx * mz < 0) { [A, B] = [B, A]; [At, Bt] = [Bt, At]; }
      this.face([A, B, Bt, At], [[0, y0], [len, y0], [len, y1], [0, y1]], col, bld, fh, ww);
    }
    if (roof) {
      let pts = C.map(([lx, lz]) => P(lx, lz, y1));
      const ux2 = pts[1][0] - pts[0][0], uz2 = pts[1][2] - pts[0][2], vx2 = pts[3][0] - pts[0][0], vz2 = pts[3][2] - pts[0][2];
      if (uz2 * vx2 - ux2 * vz2 < 0) pts = [pts[0], pts[3], pts[2], pts[1]];
      this.face(pts, [[0, -1], [0, -1], [0, -1], [0, -1]], col.clone().multiplyScalar(0.8), [7, bld[1], 0, 0], 1, 1);
    }
  }
  geometry() {
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new T.Float32BufferAttribute(this.n, 3));
    g.setAttribute("color", new T.Float32BufferAttribute(this.c, 3));
    g.setAttribute("aFac", new T.Float32BufferAttribute(this.f, 4));
    g.setAttribute("aBld", new T.Float32BufferAttribute(this.b, 4));
    g.computeBoundingSphere();
    return g;
  }
}
/** Textured quads for signs (atlas UVs) */
class Signs {
  constructor() { this.p = []; this.u = []; this.c = []; }
  quad(cx, cy, cz, ux, uz, nx, nz, w, h, uv, k = 1, col = [1, 1, 1]) {
    const hw = w / 2, hh = h / 2;
    const P = (a, b) => [cx + ux * a + nx * 0.02, cy + b, cz + uz * a + nz * 0.02];
    const pts = [P(-hw, -hh), P(hw, -hh), P(hw, hh), P(-hw, hh)];
    const uvs = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
    // make sure the quad faces (nx, nz): (b - a) x (c - a) is proportional to (-tz, 0, tx)
    const tx = pts[1][0] - pts[0][0], tz = pts[1][2] - pts[0][2];
    const fx = -tz, fz = tx;
    let order = [0, 1, 2, 0, 2, 3];
    if (fx * nx + fz * nz < 0) order = [0, 2, 1, 0, 3, 2];
    for (const i of order) { this.p.push(...pts[i]); this.u.push(...uvs[i]); this.c.push(col[0] * k, col[1] * k, col[2] * k); }
  }
  geometry() {
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(this.p, 3));
    g.setAttribute("uv", new T.Float32BufferAttribute(this.u, 2));
    g.setAttribute("color", new T.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}

export function createWorld(scene) {
  const mats = {
    ground: groundMaterial(), water: waterMaterial(), kit: kitMaterial(), facade: facadeMaterial(), glow: glowMaterial(),
    mark: kitMaterial({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    sign: new T.MeshBasicMaterial({ map: atlasTexture(), vertexColors: true, transparent: true, alphaTest: 0.05, side: T.DoubleSide }),
  };
  const root = new T.Group();
  scene.add(root);
  const B = M.BOUNDS;
  let F = null; // field grid
  let occ = null, gw = 0, gh = 0;
  const regions = []; for (let i = 0; i < REG * REG; i++) regions.push({ fac: new Fac(), kit: new Kit(), mark: new Kit(), wall: new Kit(), sign: new Signs() });
  const regionOf = (x, z) => { const i = Math.min(REG - 1, Math.max(0, Math.floor(((x - B.minX) / (B.maxX - B.minX)) * REG))), j = Math.min(REG - 1, Math.max(0, Math.floor(((z - B.minY) / (B.maxY - B.minY)) * REG))); return regions[j * REG + i]; };
  const r = {};
  const sampleG = (x, z) => M.sample(x, z, r).g;
  const props = {}; for (const k of Object.keys(PROP_TYPES)) props[k] = [];
  const animated = [];
  const buildings = [];
  const lampsList = [];

  /* ---------------- occupancy (2 m) ---------------- */
  function occIndex(x, z) { const i = Math.floor((x - B.minX) / STEP), j = Math.floor((z - B.minY) / STEP); return i < 0 || j < 0 || i >= gw || j >= gh ? -1 : j * gw + i; }
  function occTest(cx, cz, ux, uz, vx, vz, w, d, mark) {
    const ext = Math.hypot(w, d) / 2 + 2;
    for (let z = cz - ext; z <= cz + ext; z += STEP) for (let x = cx - ext; x <= cx + ext; x += STEP) {
      const lx = (x - cx) * ux + (z - cz) * uz, lz = (x - cx) * vx + (z - cz) * vz;
      if (Math.abs(lx) > w / 2 - 0.6 || Math.abs(lz) > d / 2 - 0.6) continue;
      const o = occIndex(x, z);
      if (o < 0) return false;
      if (mark) occ[o] = 1; else if (occ[o]) return false;
    }
    return true;
  }
  function footprintOk(cx, cz, ux, uz, vx, vz, w, d, minG) {
    for (const a of [-0.5, -0.25, 0, 0.25, 0.5]) for (const b of [-0.5, 0, 0.5]) {
      const x = cx + ux * a * w + vx * b * d, z = cz + uz * a * w + vz * b * d;
      if (M.sample(x, z, r).g < minG) return false;
      if (M.water(x, z) > -3) return false;
    }
    return true;
  }

  /* ---------------- buildings ---------------- */
  function placeFrontage() {
    const R = rng(9001);
    M.edges.forEach((e, ei) => {
      const k = e.k;
      if (k.id === 4) return; // canyon: no buildings
      for (const side of [1, -1]) {
        let s = R() * 8;
        while (s < e.len - 6) {
          const pt = M.pointAt(ei, s, {});
          const dist = M.district(pt.x, pt.y);
          const P = DIST[dist];
          if (!P || (k.id === 0 && dist !== 1 && dist !== 2)) { s += 18; continue; }
          let w = lerp(P.w[0], P.w[1], R()), d = lerp(P.d[0], P.d[1], R());
          const m = M.pointAt(ei, Math.min(e.len, s + w / 2), {});
          const ux = m.tx, uz = m.ty, vx = -uz * side, vz = ux * side;
          const front = k.hw + k.lim + (k.id === 0 ? 7 : k.id === 5 ? 3 : 1.25);
          let ok = false;
          for (let tries = 0; tries < 3 && !ok; tries++) {
            const cx = m.x + vx * (front + d / 2), cz = m.y + vz * (front + d / 2);
            if (footprintOk(cx, cz, ux, uz, vx, vz, w, d, 0.9) && occTest(cx, cz, ux, uz, vx, vz, w, d, false)) {
              occTest(cx, cz, ux, uz, vx, vz, w, d, true);
              addBuilding({ x: cx, z: cz, ux, uz, vx, vz, w, d, dist, R, front: true });
              ok = true;
            } else { w *= 0.75; d *= 0.7; if (w < 8) break; }
          }
          s += (ok ? w : 4) + lerp(P.gap[0], P.gap[1], R());
        }
      }
    });
  }
  function placeInfill() {
    const R = rng(4242);
    for (let z = B.minY + 20; z < B.maxY - 20; z += 26) for (let x = B.minX + 20; x < B.maxX - 20; x += 26) {
      const px = x + (R() - 0.5) * 12, pz = z + (R() - 0.5) * 12;
      const dist = M.district(px, pz);
      if (![0, 1, 3, 7, 2].includes(dist)) continue;
      M.sample(px, pz, r);
      if (r.g < 4 || r.g > 38 || r.e < 0) continue;
      const pt = M.pointAt(r.e, r.s, {});
      const ux = pt.tx, uz = pt.ty, vx = -uz, vz = ux;
      const big = dist === 0 ? 1 : 0.7;
      const w = lerp(16, 34, R()) * big, d = lerp(16, 30, R()) * big;
      if (!footprintOk(px, pz, ux, uz, vx, vz, w, d, 2) || !occTest(px, pz, ux, uz, vx, vz, w, d, false)) continue;
      occTest(px, pz, ux, uz, vx, vz, w, d, true);
      addBuilding({ x: px, z: pz, ux, uz, vx, vz, w, d, dist, R, front: false });
    }
    // landmark tower downtown
    const L = M.LANDMARKS.find((l) => l.type === "tower");
    if (L && occTest(L.x, L.y, 1, 0, 0, 1, 30, 30, false) && footprintOk(L.x, L.y, 1, 0, 0, 1, 30, 30, 1)) {
      occTest(L.x, L.y, 1, 0, 0, 1, 30, 30, true);
      addBuilding({ x: L.x, z: L.y, ux: 1, uz: 0, vx: 0, vz: 1, w: 30, d: 30, dist: 0, R: rng(7), front: false, spire: true });
    }
  }
  function addBuilding(b) {
    const { R, dist } = b, P = DIST[dist];
    let style = pick(R, P.styles);
    let h = lerp(P.h[0], P.h[1], Math.pow(R(), 1.6));
    if (!b.front && dist === 0) { style = R() < 0.6 ? 0 : 1; h = lerp(40, 125, Math.pow(R(), 1.3)); }
    if (!b.front && dist === 1) { style = 6; h = lerp(18, 42, R()); }
    if (b.spire) { style = 0; h = 150; }
    if (style === 0 && b.front) h = Math.max(h, 30);
    const col = new T.Color(style === 0 ? pick(R, GLASS) : pick(R, P.colors));
    const reg = regionOf(b.x, b.z);
    const seed = Math.floor(R() * 97);
    const lit = style === 4 ? 0.2 : 0.35 + R() * 0.35, glass = style === 0 ? 1 : 0.6;
    const fh = style === 0 ? 3.8 : style === 4 ? 6 : style === 5 ? 3.2 : 3.4, ww = style === 0 ? 2.2 : style === 4 ? 4 : lerp(2.2, 3.4, R());
    const { x, z, ux, uz, vx, vz, w, d } = b;
    const F2 = reg.fac, K = reg.kit;
    buildings.push({ x, z, w, d, h, style });
    if (style === 0) {
      // podium + tower + optional setback crown
      const podH = b.front ? lerp(5, 9, R()) : 7;
      F2.block(x, z, ux, uz, vx, vz, w, d, 0, podH, new T.Color(0xd9d4cc), [3, seed, lit, 0.7], 4.5, 3, true);
      const tw = w * lerp(0.62, 0.86, R()), td = d * lerp(0.62, 0.86, R());
      const set = R() < 0.55 && h > 50;
      const h1 = set ? h * lerp(0.62, 0.8, R()) : h;
      F2.block(x, z, ux, uz, vx, vz, tw, td, podH, h1, col, [0, seed, lit, 1], fh, ww);
      if (set) F2.block(x, z, ux, uz, vx, vz, tw * 0.72, td * 0.72, h1, h, col, [0, seed + 1, lit, 1], fh, ww);
      K.set(0xe9f4ff, 0.3, 0, 1.6, 1).at(x, h - 0.4, z, Math.atan2(vx, vz)).cbox(0, 0, 0, (set ? tw * 0.72 : tw) + 0.3, 0.25, (set ? td * 0.72 : td) + 0.3, "b");
      if (b.spire || R() < 0.35) { K.set(0x9aa3ad, 0.3, 0.8).at(x, h, z).cyl(0, 0, 0, b.spire ? 1.2 : 0.4, 0.1, b.spire ? 45 : 12, 6); K.set(0xff2030, 0.3, 0, 4, 2).at(x, h + (b.spire ? 45 : 12), z).blob(0, 0, 0, 0.5, 0.5, 0.5, 0); }
      K.reset();
      return;
    }
    const bld = [style, seed, lit, glass];
    F2.block(x, z, ux, uz, vx, vz, w, d, 0, h, col, bld, fh, ww, style !== 5 && style !== 4);
    const yaw = Math.atan2(vx, vz); // local x along the frontage, local z into the building
    // front of the building faces -v (toward the road)
    const fx = x - vx * (d / 2), fz = z - vz * (d / 2);
    if (style === 5 || style === 4) {
      // pitched roof (houses: tiles, warehouses: metal)
      const roofCol = style === 5 ? pick(R, [0xb4533a, 0x8c3b2a, 0x5a5f68, 0x7a4a3a]) : pick(R, [0x9aa3ad, 0x6d7781, 0x8a3f2a]);
      K.set(roofCol, style === 5 ? 0.85 : 0.5, style === 5 ? 0 : 0.5).at(x, 0, z, yaw).gable(-w / 2, -d / 2, w / 2, d / 2, h, style === 5 ? d * 0.35 : d * 0.16, 0.5);
      if (style === 5) { K.set(0x7a5a46, 0.9).at(x, 0, z, yaw).cbox(w * 0.25, h + d * 0.25, 0, 0.8, 1.8, 0.8); K.set(0x5a3d2a, 0.8).at(fx - vx * 0.05, 0, fz - vz * 0.05, yaw).cbox(0, 1.1, 0, 1.1, 2.2, 0.12); }
      else for (let q = -1; q <= 1; q += 2) K.set(0xc9cdd2, 0.6, 0.4).at(fx - vx * 0.06, 0, fz - vz * 0.06, yaw).cbox(q * w * 0.22, 2.4, 0, Math.min(6, w * 0.3), 4.8, 0.15);
      K.reset();
      return;
    }
    // roof parapet + rooftop units
    K.set(col.clone().multiplyScalar(0.75), 0.85).at(x, h, z, yaw);
    K.cbox(0, 0.45, -d / 2 + 0.2, w, 0.9, 0.4).cbox(0, 0.45, d / 2 - 0.2, w, 0.9, 0.4).cbox(-w / 2 + 0.2, 0.45, 0, 0.4, 0.9, d).cbox(w / 2 - 0.2, 0.45, 0, 0.4, 0.9, d);
    for (let u = 0; u < 1 + Math.floor(R() * 3); u++) K.set(0x9aa0a8, 0.6, 0.3).cbox((R() - 0.5) * w * 0.6, 0.8, (R() - 0.5) * d * 0.6, 2 + R() * 2, 1.6, 1.6 + R());
    if (style === 2 && R() < 0.4) K.set(0x7a5a3a, 0.9).cyl((R() - 0.5) * w * 0.4, 0, (R() - 0.5) * d * 0.4, 1.4, 1.4, 3.2, 8);
    K.reset();
    if (style === 3 || style === 6 || (style === 2 && R() < 0.3)) {
      // awning + neon sign at street level
      const aw = pick(R, AWN), aWidth = w * 0.86;
      K.set(aw, 0.7).at(fx - vx * 0.7, 3.4, fz - vz * 0.7, yaw, 1, 1, 1, -0.32).cbox(0, 0, 0, aWidth, 0.12, 1.5);
      K.reset();
      if (b.front) {
        const sc = cell("shop" + Math.floor(R() * 8));
        const nx = -vx, nz = -vz;
        reg.sign.quad(fx - vx * 0.25, 4.6, fz - vz * 0.25, ux, uz, nx, nz, Math.min(6, w * 0.4), 1.5, sc, 2.4);
      }
    }
    if (style === 6) {
      // art-deco hotel: vertical neon fin and roof crown light
      const nc = pick(R, NEON);
      K.set(nc, 0.3, 0, 1.1, 2).at(fx - vx * 0.5, 0, fz - vz * 0.5, yaw).cbox(-w * 0.32, Math.min(h - 2, 4 + h * 0.3), 0, 0.45, Math.min(h * 0.45, 12), 0.9);
      K.set(nc, 0.3, 0, 1.8, 2).at(x, h + 0.95, z, yaw).cbox(0, 0, -d / 2 + 0.25, w * 0.9, 0.18, 0.12);
      K.reset();
    }
    if (style === 2 && h > 12) {
      // balconies
      const n = Math.floor((h - 4) / fh);
      K.set(0xe8e6e0, 0.8).at(fx, 0, fz, yaw);
      for (let f = 1; f < n; f += 1) for (let q = -1; q <= 1; q += 2) K.cbox(q * w * 0.24, f * fh + 0.1, -0.6, w * 0.3, 0.14, 1.2);
      K.reset();
    }
  }

  /* ---------------- lane markings ---------------- */
  function buildMarkings() {
    const W = new T.Color(0xf2f2ee), Y = new T.Color(0xffc21a);
    M.edges.forEach((e, ei) => {
      const k = e.k, lines = [];
      const two = k.lanes >= 2 || k.id === 0;
      if (two) { lines.push({ o: 0.18, w: 0.13, col: Y }, { o: -0.18, w: 0.13, col: Y }); }
      else lines.push({ o: 0, w: 0.13, col: k.town ? W : Y, dash: [3, 5] });
      for (let l = 1; l < k.lanes; l++) for (const sd of [1, -1]) lines.push({ o: sd * l * k.laneW, w: 0.13, col: W, dash: [3, 6] });
      if (!k.town) for (const sd of [1, -1]) lines.push({ o: sd * (k.hw - 0.45), w: 0.16, col: W });
      const step = 1.5, pt = {}, p2 = {};
      for (let s = 0; s < e.len - step; s += step) {
        M.pointAt(ei, s, pt); M.pointAt(ei, s + step, p2);
        const jm = M.asphaltExcept((pt.x + p2.x) / 2, (pt.y + p2.y) / 2, ei);
        if (jm < 2.2) continue;
        const reg = regionOf(pt.x, pt.y), K = reg.mark;
        for (const L of lines) {
          if (L.dash && (s % (L.dash[0] + L.dash[1])) >= L.dash[0]) continue;
          const nx0 = -pt.ty, nz0 = pt.tx, nx1 = -p2.ty, nz1 = p2.tx;
          const a = [pt.x + nx0 * (L.o - L.w), 0.025, pt.y + nz0 * (L.o - L.w)], b = [p2.x + nx1 * (L.o - L.w), 0.025, p2.y + nz1 * (L.o - L.w)];
          const c = [p2.x + nx1 * (L.o + L.w), 0.025, p2.y + nz1 * (L.o + L.w)], d = [pt.x + nx0 * (L.o + L.w), 0.025, pt.y + nz0 * (L.o + L.w)];
          K.set(L.col, 0.55, 0, 0.04, 0);
          K.quad(a, d, c, b, [0, 1, 0]);
        }
      }
    });
    // crosswalks + stop lines at town junctions (and traffic lights)
    M.nodes.forEach((n) => {
      if (n.edges.length < 3) return;
      for (const l of n.edges) {
        const e = M.edges[l.e], k = e.k;
        if (!k.town) continue;
        let s0 = 0;
        for (let s = 2; s < Math.min(40, e.len / 2); s += 0.5) {
          const at = l.end === 0 ? s : e.len - s, p = M.pointAt(l.e, at, {});
          if (M.asphaltExcept(p.x, p.y, l.e) > 1.2) { s0 = s; break; }
        }
        if (!s0) continue;
        const dir = l.end === 0 ? 1 : -1;
        const at0 = l.end === 0 ? s0 + 0.6 : e.len - s0 - 0.6;
        const p = M.pointAt(l.e, at0, {}), tx = p.tx * dir, tz = p.ty * dir, nx = -tz, nz = tx;
        const reg = regionOf(p.x, p.y), K = reg.mark;
        K.set(0xf2f2ee, 0.55, 0, 0.04, 0);
        for (let o = -k.hw + 0.7; o <= k.hw - 0.7; o += 1.1) {
          const cx = p.x + tx * 1.9 + nx * o, cz = p.y + tz * 1.9 + nz * o;
          const hx = 0.28, hz = 1.6;
          K.quad([cx + nx * hx - tx * hz, 0.026, cz + nz * hx - tz * hz], [cx + nx * hx + tx * hz, 0.026, cz + nz * hx + tz * hz], [cx - nx * hx + tx * hz, 0.026, cz - nz * hx + tz * hz], [cx - nx * hx - tx * hz, 0.026, cz - nz * hx - tz * hz], [0, 1, 0]);
        }
        // stop line on the lanes that arrive at the junction (left of the outward direction)
        const sx = p.x + tx * 4.3, sz = p.y + tz * 4.3;
        K.quad([sx - tx * 0.22, 0.026, sz - tz * 0.22], [sx + tx * 0.22, 0.026, sz + tz * 0.22], [sx + tx * 0.22 - nx * (k.hw - 0.4), 0.026, sz + tz * 0.22 - nz * (k.hw - 0.4)], [sx - tx * 0.22 - nx * (k.hw - 0.4), 0.026, sz - tz * 0.22 - nz * (k.hw - 0.4)], [0, 1, 0]);
        // traffic light on the right-hand corner facing arriving traffic
        const lx = p.x + tx * 5 + nx * (-(k.hw + 0.9)), lz = p.y + tz * 5 + nz * (-(k.hw + 0.9));
        if (M.sample(lx, lz, r).g < 0.2) props.tlight.push({ x: lx, z: lz, ry: Math.atan2(nx, nz), s: 1, br: true });
      }
    });
  }

  /* ---------------- walls / rails along the collision boundary ---------------- */
  function buildWalls() {
    const iso = 1.05, G = F.G, Ed = F.E, w = F.w, h = F.h;
    const val = (i, j) => G[j * w + i] - iso;
    const R = rng(77);
    let n = 0;
    for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) {
      const a = val(i, j), b = val(i + 1, j), c = val(i + 1, j + 1), d = val(i, j + 1);
      const code = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
      if (code === 0 || code === 15) continue;
      if (Math.max(G[j * w + i], G[j * w + i + 1]) > 6) { /* far field */ }
      const x0 = B.minX + (i + 0.5) * STEP, z0 = B.minY + (j + 0.5) * STEP;
      const ip = (va, vb) => va / (va - vb);
      const E = [[x0 + ip(a, b) * STEP, z0], [x0 + STEP, z0 + ip(b, c) * STEP], [x0 + ip(d, c) * STEP, z0 + STEP], [x0, z0 + ip(a, d) * STEP]];
      const segs = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[0, 2]], 10: [[0, 1], [2, 3]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[3, 0]] }[code];
      const ei = Ed[j * w + i];
      const kind = ei >= 0 ? M.edges[ei].k : null;
      for (const [p, q] of segs) {
        let [ax, az] = E[p], [bx, bz] = E[q];
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        // outward normal from the field gradient
        const gx = (G[j * w + i + 1] - G[j * w + i] + G[(j + 1) * w + i + 1] - G[(j + 1) * w + i]) / 2, gz = (G[(j + 1) * w + i] - G[j * w + i] + G[(j + 1) * w + i + 1] - G[j * w + i + 1]) / 2;
        const gl = Math.hypot(gx, gz) || 1, nx = gx / gl, nz = gz / gl;
        if (-(bz - az) * nx + (bx - ax) * nz > 0) { [ax, bx] = [bx, ax]; [az, bz] = [bz, az]; }
        const wet = M.water(mx, mz) > -4;
        const reg = regionOf(mx, mz), K = reg.wall;
        const onPad = M.pads.some((pd) => Math.abs((mx - pd.x) * pd.ca + (mz - pd.y) * pd.sa) < pd.hx + 3 && Math.abs(-(mx - pd.x) * pd.sa + (mz - pd.y) * pd.ca) < pd.hy + 3);
        if ((kind && kind.rail) || wet) {
          // guard rail: two rails + posts
          K.set(0xc4c9cf, 0.35, 0.8);
          for (const [y0, y1] of [[0.48, 0.66], [0.72, 0.8]]) {
            K.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]);
            K.quad([bx, y0, bz], [ax, y0, az], [ax, y1, az], [bx, y1, bz]);
          }
          if ((n++ & 1) === 0) K.set(0x6a6f76, 0.5, 0.6).at(ax + nx * 0.18, 0, az + nz * 0.18).cbox(0, 0.42, 0, 0.12, 0.84, 0.12).reset();
          if (wet && !kind?.town) { K.set(0x9a958c, 0.9).quad([ax + nx * 0.4, -1.6, az + nz * 0.4], [bx + nx * 0.4, -1.6, bz + nz * 0.4], [bx + nx * 0.4, 0.05, bz + nz * 0.4], [ax + nx * 0.4, 0.05, az + nz * 0.4]); }
        } else if (kind && kind.id === 5) {
          // port: concrete barrier with yellow cap
          wallStrip(K, ax, az, bx, bz, nx, nz, 0.95, 0.5, 0xb3aea6, 0.9); K.set(0xffc21a, 0.6).quad([ax, 0.96, az], [bx, 0.96, bz], [bx + nx * 0.5, 0.96, bz + nz * 0.5], [ax + nx * 0.5, 0.96, az + nz * 0.5], [0, 1, 0]);
        } else {
          // town: skip where a building already forms the wall
          const o = occIndex(mx + nx * 2.2, mz + nz * 2.2);
          if (o >= 0 && occ[o]) continue;
          if (onPad) wallStrip(K, ax, az, bx, bz, nx, nz, 0.45, 0.4, 0xc8c2b8, 0.9);
          else if (R() < 0.82) { wallStrip(K, ax, az, bx, bz, nx, nz, 0.5, 0.6, 0xbdb6aa, 0.9); hedge(K, ax, az, bx, bz, nx, nz); }
          else wallStrip(K, ax, az, bx, bz, nx, nz, 0.9, 0.35, 0xd8d2c6, 0.85);
        }
      }
    }
  }
  function wallStrip(K, ax, az, bx, bz, nx, nz, hgt, thick, col, rough) {
    K.set(col, rough);
    const ox = nx * thick, oz = nz * thick;
    K.quad([ax, 0, az], [bx, 0, bz], [bx, hgt, bz], [ax, hgt, az]);
    K.quad([bx + ox, 0, bz + oz], [ax + ox, 0, az + oz], [ax + ox, hgt, az + oz], [bx + ox, hgt, bz + oz]);
    K.quad([ax, hgt, az], [bx, hgt, bz], [bx + ox, hgt, bz + oz], [ax + ox, hgt, az + oz], [0, 1, 0]);
  }
  function hedge(K, ax, az, bx, bz, nx, nz) {
    K.set(0x3a6a2a, 0.95);
    const ox = nx * 0.55, oz = nz * 0.55, y0 = 0.5, y1 = 1.25;
    K.quad([ax + nx * 0.05, y0, az + nz * 0.05], [bx + nx * 0.05, y0, bz + nz * 0.05], [bx + nx * 0.1, y1, bz + nz * 0.1], [ax + nx * 0.1, y1, az + nz * 0.1]);
    K.quad([ax + nx * 0.1, y1, az + nz * 0.1], [bx + nx * 0.1, y1, bz + nz * 0.1], [bx + ox, y1, bz + oz], [ax + ox, y1, az + oz], [0, 1, 0]);
  }

  /* ---------------- props placement ---------------- */
  function placeProps() {
    const R = rng(31337);
    const add = (type, x, z, ry = 0, s = 1, extra = {}) => props[type].push({ x, z, ry, s, ...extra });
    M.edges.forEach((e, ei) => {
      const k = e.k, pt = {};
      for (const side of [1, -1]) {
        // street lamps / highway lamps
        const spacing = k.id === 0 ? 46 : k.town ? 34 : k.id === 4 ? 0 : 42;
        if (spacing) for (let s = 8 + (side > 0 ? 0 : spacing / 2); s < e.len - 4; s += spacing) {
          M.pointAt(ei, s, pt);
          const nx = -pt.ty * side, nz = pt.tx * side;
          const off = k.town ? k.hw + 0.8 : k.hw + 2.6;
          const x = pt.x + nx * off, z = pt.y + nz * off;
          if (M.asphaltExcept(x, z, ei) < 3 || M.water(x, z) > -2) continue;
          const g = M.sample(x, z, r).g;
          if (k.town && (g > 0.1 || r.f < 0.3)) continue;
          if (!k.town && g < 0.9) continue;
          const ry = Math.atan2(-nx, -nz);
          const L = { x, z, ry, s: 1, br: !!k.town };
          (k.town ? props.lamp : props.hwlamp).push(L);
          lampsList.push({ x: x - nx * (k.town ? 2.3 : 3.7), z: z - nz * (k.town ? 2.3 : 3.7) });
        }
        // sidewalk trees, benches, bins, hydrants, bus stops (town)
        if (k.town) for (let s = 14 + R() * 10; s < e.len - 6; s += 13 + R() * 14) {
          M.pointAt(ei, s, pt);
          const nx = -pt.ty * side, nz = pt.tx * side;
          const roll = R();
          const off = k.hw + k.lim - 0.2 - (roll < 0.5 ? 0.4 : 0);
          const x = pt.x + nx * off, z = pt.y + nz * off;
          if (M.asphaltExcept(x, z, ei) < 4 || M.sample(x, z, r).g > 0.6) continue;
          const ry = Math.atan2(-nx, -nz);
          const dist = M.district(x, z);
          if (roll < 0.42) add(dist === 1 ? "palm" : "streettree", x, z, R() * 6, 0.85 + R() * 0.3, { br: true });
          else if (roll < 0.56) add("bench", x, z, ry, 1, { br: true });
          else if (roll < 0.68) add("bin", x, z, 0, 1, { br: true });
          else if (roll < 0.76) add("hydrant", pt.x + nx * (k.hw + 0.7), pt.y + nz * (k.hw + 0.7), 0, 1, { br: true });
          else if (roll < 0.82 && dist !== 4) add("busstop", x, z, ry, 1, { br: true });
          else if (roll < 0.9) add("planter", x, z, 0, 1, { br: true });
        }
        // palms along the coastal highway (beyond the rail) and power poles in the hills
        if (k.id === 0) for (let s = 10; s < e.len; s += 20 + R() * 8) {
          M.pointAt(ei, s, pt);
          const nx = -pt.ty * side, nz = pt.tx * side, off = k.hw + 5 + R() * 5;
          const x = pt.x + nx * off, z = pt.y + nz * off;
          if (M.water(x, z) > -3 || M.sample(x, z, r).g < 2) continue;
          add("palm", x, z, R() * 6, 1 + R() * 0.5);
        }
        if (k.id === 5) for (let s = 30; s < e.len; s += 200) {
          M.pointAt(ei, s, pt);
          const nx = -pt.ty * side, nz = pt.tx * side, off = k.hw + k.lim + 9;
          const x = pt.x + nx * off, z = pt.y + nz * off;
          if (M.sample(x, z, r).g < 5 || M.water(x, z) > -3) continue;
          add("billboard", x, z, Math.atan2(-nx, -nz), 1, { ad: Math.floor(R() * 6) });
        }
        if (k.id === 0) for (let s = 60 + (side > 0 ? 0 : 120); s < e.len; s += 240) {
          M.pointAt(ei, s, pt);
          const nx = -pt.ty * side, nz = pt.tx * side, off = k.hw + 12;
          const x = pt.x + nx * off, z = pt.y + nz * off;
          if (M.sample(x, z, r).g < 6 || M.water(x, z) > -5) continue;
          add("billboard", x, z, Math.atan2(-nx, -nz), 1, { ad: Math.floor(R() * 6) });
        }
      }
    });
    // scatter by zone
    for (let z = B.minY; z < B.maxY; z += 9) for (let x = B.minX; x < B.maxX; x += 9) {
      const px = x + R() * 9, pz = z + R() * 9;
      const dist = M.district(px, pz), wat = M.water(px, pz);
      if (wat > 0) {
        if (wat > 25 && R() < 0.0035) add(R() < 0.3 ? "yacht" : "boat", px, pz, R() * 6, 1);
        continue;
      }
      const g = M.sample(px, pz, r).g;
      if (g < 2.2) continue;
      const o = occIndex(px, pz);
      if (o >= 0 && occ[o]) continue;
      const roll = R();
      if (dist === 5) {
        if (g > 9 && roll < 0.05) add("cliff", px, pz, R() * 6, 0.6 + R() * 0.9);
        else if (roll < 0.22) add("pine", px, pz, R() * 6, 0.8 + R() * 0.6);
        else if (roll < 0.3) add("rock", px, pz, R() * 6, 0.6 + R() * 1.2);
      } else if (dist === 4 || dist === 6 || dist === 7) {
        if (roll < 0.1) add("tree", px, pz, R() * 6, 0.8 + R() * 0.5);
        else if (roll < 0.15) add("bush", px, pz, R() * 6, 0.8 + R() * 0.5);
        else if (dist === 4 && roll < 0.17) add("pine", px, pz, R() * 6, 0.9);
      } else if (dist === 1) {
        if (wat > -40 && wat < -8 && roll < 0.06) add("umbrella", px, pz, R() * 6, 1, { tint: pick(R, [0xff4d6d, 0x2ec4b6, 0xffd23f, 0x3a86ff, 0xff7a1a]) });
        else if (wat > -50 && wat < -10 && roll < 0.008) add("lifeguard", px, pz, Math.PI, 1);
        else if (wat < -12 && roll < 0.035) add("palm", px, pz, R() * 6, 0.9 + R() * 0.5);
      } else if (dist === 2) {
        if (px > 890 && roll < 0.05) {
          const base = Math.floor(R() * 3);
          for (let st = 0; st <= base; st++) add("container", px, pz, Math.PI / 2 * Math.round(R() * 2), 1, { y: st * 2.6, tint: pick(R, [0xd62839, 0x1d6fd8, 0x2a9d8f, 0xf4a261, 0x6b2bd9, 0x8d99ae, 0xe9c46a, 0x264653]) });
        }
      } else if (dist === 0 || dist === 3) {
        if (roll < 0.02) add("tree", px, pz, R() * 6, 0.7 + R() * 0.3);
      }
    }
    // lot palms + plaza planters (solid obstacles in the simulation)
    for (const ob of M.obstacles) if (ob.r < 3) add(ob.r < 2 ? "palm" : "planter", ob.x, ob.y, 0, ob.r < 2 ? 1.1 : 1.6);
    // roundabout palms
    const rb = M.roundabout;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; add("palm", rb.x + Math.cos(a) * 21, rb.y + Math.sin(a) * 21, a, 1.1); }
  }

  /* ---------------- landmarks ---------------- */
  function buildLandmarks() {
    const K = new Kit();
    const S = new Signs();
    // repair stations
    for (const st of M.stations) {
      const ca = st.ca, sa = st.sa, nx = -sa * st.side, nz = ca * st.side; // nx/nz points away from the road
      const yaw = Math.atan2(nx, nz);
      const at = (lx, ly) => [st.x + ca * lx + nx * ly, st.y + sa * lx + nz * ly];
      // canopy (cantilevered from the far side)
      const [cx, cz] = at(0, 1.5);
      K.set(0xf2f4f7, 0.5, 0.2).at(cx, 5.6, cz, yaw).cbox(0, 0, 0, 24, 0.6, 13);
      K.set(0x2ee6a0, 0.4, 0, 2.2, 2).cbox(0, -0.36, 0, 24.2, 0.14, 13.2, "t");
      K.reset();
      for (const lx of [-9, 0, 9]) { const [px, pz] = at(lx, st.hy + 1.4); K.set(0x2b2f36, 0.5, 0.5).at(px, 0, pz).cbox(0, 2.8, 0, 0.7, 5.6, 0.7).reset(); }
      // pumps behind the drive lane
      for (const lx of [-6, 6]) { const [px, pz] = at(lx, st.hy + 1.6); K.set(0xe9edf2, 0.5).at(px, 0, pz, yaw).cbox(0, 0.9, 0, 1.4, 1.8, 0.7).set(0x2ee6a0, 0.4, 0, 1.4, 2).cbox(0, 1.55, -0.36, 1.1, 0.35, 0.04).reset(); }
      // kiosk / garage
      const [kx, kz] = at(-2, st.hy + 9);
      K.set(0xe9edf2, 0.6).at(kx, 0, kz, yaw).cbox(0, 2.2, 0, 16, 4.4, 8).set(0x0c1220, 0.1, 0.5).cbox(-3, 1.6, -4.02, 7, 2.4, 0.05).set(0x3a3f47, 0.6, 0.4).cbox(4, 1.8, -4.02, 4.2, 3.4, 0.05).reset();
      // pylon sign at the entrance
      const [sx, sz] = at(st.hx + 2, -1);
      K.set(0x1b2230, 0.5, 0.4).at(sx, 0, sz, yaw).cbox(0, 3.5, 0, 0.6, 7, 0.6).cbox(0, 7.4, 0, 4.4, 2.4, 0.5).reset();
      const sc = cell("station");
      for (const d of [1, -1]) S.quad(sx - nx * 0.27 * d, 7.4, sz - nz * 0.27 * d, ca, sa, -nx * d, -nz * d, 4.2, 1.05, sc, 2.2);
      // floor marking: glowing repair bay
      const [fx, fz] = at(0, 0);
      K.set(0x2ee6a0, 0.5, 0, 1.2, 2).at(fx, 0.03, fz, yaw);
      for (const [x0, x1, z0, z1] of [[-13, 13, -6.4, -6.0], [-13, 13, 6.0, 6.4], [-13, -12.6, -6.4, 6.4], [12.6, 13, -6.4, 6.4]]) K.box(x0, 0, z0, x1, 0.02, z1, "b");
      K.reset();
      animated.push({ type: "beacon", x: st.x, z: st.y, y: 9.5 });
    }
    // roundabout monument + fountain
    const rb = M.roundabout;
    K.set(0xd8d2c6, 0.8).at(rb.x, 0, rb.y).cyl(0, 0, 0, 8.6, 8.6, 0.7, 24).set(0x3fa7d6, 0.1, 0.3, 0.25, 0).cyl(0, 0.05, 0, 8.0, 8.0, 0.62, 24, true);
    K.set(0xf0ece4, 0.6).cyl(0, 0, 0, 2.4, 1.8, 3, 8).set(0xff6a3c, 0.4, 0.5).cyl(0, 3, 0, 1.2, 0.2, 13, 6).set(0x2ee6c8, 0.3, 0.6).blob(0, 13.5, 0, 1.4, 1.4, 1.4, 0).reset();
    animated.push({ type: "fountain", x: rb.x, z: rb.y, r: 6.5 });
    const pl = M.pads.find((p) => p.kind === "plaza");
    if (pl) { K.set(0xd8d2c6, 0.8).at(pl.x, 0, pl.y).cyl(0, 0, 0, 6.6, 6.6, 0.8, 20).set(0x3fa7d6, 0.1, 0.3, 0.2, 0).cyl(0, 0.05, 0, 6.0, 6.0, 0.7, 20).set(0xf0ece4, 0.6).cyl(0, 0, 0, 1.2, 0.8, 2.6, 8).reset(); animated.push({ type: "fountain", x: pl.x, z: pl.y, r: 4.5, small: 1 }); }
    // ferris wheel on the pier
    const fw = M.LANDMARKS.find((l) => l.type === "ferris");
    if (fw) {
      const shore = M.coastY(fw.x);
      K.set(0x8a6a4a, 0.9).at(fw.x, 0, (shore - 20 + fw.y + 40) / 2).cbox(0, 0.4, 0, 16, 0.8, fw.y + 40 - (shore - 20)).reset();
      for (let z = shore; z < fw.y + 40; z += 8) for (const x of [-7, 7]) K.set(0x5a4a3a, 0.9).at(fw.x + x, 0, z).cyl(0, -3, 0, 0.4, 0.4, 0.2, 6).reset();
      K.set(0xe9edf2, 0.5, 0.4).at(fw.x, 0, fw.y).cbox(-5, 13, 0, 0.8, 26, 0.8).cbox(5, 13, 0, 0.8, 26, 0.8).reset();
      const wheel = new Kit();
      const R = 20;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, a2 = ((i + 1) / 16) * Math.PI * 2;
        wheel.set(0xf2f2f2, 0.4, 0.5, 0.6, 1);
        const p1 = [0, Math.cos(a) * R, Math.sin(a) * R], p2 = [0, Math.cos(a2) * R, Math.sin(a2) * R];
        for (const x of [-1.2, 1.2]) wheel.quad([x, p1[1], p1[2]], [x, p2[1], p2[2]], [x, p2[1] * 0.97, p2[2] * 0.97], [x, p1[1] * 0.97, p1[2] * 0.97]);
        wheel.set(0xdfe6ee, 0.4, 0.6).quad([0, 0, 0], [0, p1[1], p1[2]], [0, p1[1] * 1.0, p1[2] * 1.0 + 0.2], [0, 0, 0.2]);
        wheel.set(pick(rng(i), NEON), 0.4, 0, 1.4, 1).at(0, Math.cos(a) * R, Math.sin(a) * R).cbox(0, -1.2, 0, 2, 1.8, 1.6).reset();
      }
      const wm = new T.Mesh(wheel.geometry(), mats.kit);
      wm.position.set(fw.x, 26, fw.y);
      root.add(wm);
      animated.push({ type: "spin", obj: wm, speed: 0.12 });
    }
    // lighthouse
    const lh = M.LANDMARKS.find((l) => l.type === "lighthouse");
    if (lh) {
      props.cliff.push({ x: lh.x, z: lh.y, ry: 0, s: 0.9 });
      for (let i = 0; i < 6; i++) K.set(i % 2 ? 0xd62839 : 0xf4f4f0, 0.6).at(lh.x, 9 + i * 4, lh.y).cyl(0, 0, 0, 3.0 - i * 0.25, 2.75 - i * 0.25, 4, 12, false).reset();
      K.set(0x2b2f36, 0.5, 0.5).at(lh.x, 33, lh.y).cyl(0, 0, 0, 2.6, 2.6, 0.6, 12).set(0xfff2c8, 0.2, 0, 4, 1).cyl(0, 0.6, 0, 1.6, 1.6, 3, 10).set(0x2b2f36, 0.5, 0.5).cyl(0, 3.6, 0, 2.2, 0.3, 5.2, 10).reset();
      animated.push({ type: "lighthouse", x: lh.x, z: lh.y, y: 35 });
    }
    // port cranes
    const cr = M.LANDMARKS.find((l) => l.type === "cranes");
    if (cr) for (let i = 0; i < 3; i++) {
      const z = cr.y - 160 + i * 140, x = Math.min(cr.x, M.coastX(z) - 8);
      K.set(i % 2 ? 0xd62839 : 0x1d6fd8, 0.5, 0.4).at(x, 0, z);
      for (const [dx, dz] of [[-6, -5], [6, -5], [-6, 5], [6, 5]]) K.cbox(dx, 14, dz, 1.2, 28, 1.2);
      K.cbox(0, 28, 0, 14, 2, 12).cbox(10, 34, 0, 46, 2.2, 2.2).cbox(-4, 38, 0, 2, 10, 2).set(0xff2030, 0.3, 0, 3, 2).cbox(32, 35.4, 0, 0.6, 0.6, 0.6).reset();
    }
    // bridge towers over the marina inlet
    const br = M.LANDMARKS.find((l) => l.type === "bridge");
    if (br) {
      M.sample(br.x, br.y, r);
      const p = M.pointAt(r.e, r.s, {});
      const hw = M.edges[r.e].k.hw + 2.5;
      for (const along of [-30, 30]) {
        const bx = p.x + p.tx * along, bz = p.y + p.ty * along, nx = -p.ty, nz = p.tx;
        for (const sd of [-1, 1]) K.set(0xd8dde3, 0.4, 0.5).at(bx + nx * hw * sd, 0, bz + nz * hw * sd).cbox(0, 11, 0, 1.4, 22, 1.4).reset();
        K.set(0xd8dde3, 0.4, 0.5).at(bx, 21, bz, Math.atan2(nx, nz)).cbox(0, 0, 0, 1.2, 1.2, hw * 2 + 1.4).reset();
      }
      for (let along = -36; along <= 36; along += 12) { const bx = p.x + p.tx * along, bz = p.y + p.ty * along; K.set(0x9a958c, 0.9).at(bx, 0, bz).cyl(0, -8, 0, 1.6, 1.6, -0.2, 8).reset(); }
      // cables (thin quads from tower tops to the deck edges)
      for (const sd of [-1, 1]) for (let k = -5; k <= 5; k++) {
        if (k === 0) continue;
        const nx = -p.ty, nz = p.tx, t0 = k < 0 ? -30 : 30;
        const ax = p.x + p.tx * t0 + nx * hw * sd, az = p.y + p.ty * t0 + nz * hw * sd;
        const bx = p.x + p.tx * (t0 + k * 5.5 - Math.sign(k) * 0) + nx * hw * sd, bz = p.y + p.ty * (t0 + k * 5.5) + nz * hw * sd;
        K.set(0xe8eef4, 0.4, 0.6).quad([ax, 21.5, az], [ax + nx * 0.1, 21.5, az + nz * 0.1], [bx + nx * 0.1, 1.2, bz + nz * 0.1], [bx, 1.2, bz]);
        K.quad([ax + nx * 0.1, 21.5, az + nz * 0.1], [ax, 21.5, az], [bx, 1.2, bz], [bx + nx * 0.1, 1.2, bz + nz * 0.1]);
      }
    }
    // hillside letters
    const hs = M.LANDMARKS.find((l) => l.type === "sign");
    if (hs) {
      props.cliff.push({ x: hs.x, z: hs.y + 14, ry: 0, s: 1.6 }, { x: hs.x - 40, z: hs.y + 20, ry: 1, s: 1.3 }, { x: hs.x + 40, z: hs.y + 18, ry: 2, s: 1.3 });
      for (let i = -3; i <= 3; i++) K.set(0x5a5f68, 0.6, 0.4).at(hs.x + i * 9, 0, hs.y + 6).cyl(0, 12, 0, 0.3, 0.3, 24, 5).reset();
      S.quad(hs.x, 30, hs.y + 6.3, 1, 0, 0, 1, 66, 16.5, cell("hill"), 1.25);
    }
    root.add(Object.assign(new T.Mesh(K.geometry(), mats.kit), { castShadow: true, receiveShadow: true }));
    root.add(new T.Mesh(S.geometry(), mats.sign));
  }

  /* ---------------- textures, ground, water ---------------- */
  function buildTextures() {
    const w = F.w, h = F.h, N = w * h;
    const half = T.DataUtils.toHalfFloat;
    const data = new Uint16Array(N * 4);
    for (let j = 0; j < h; j++) {
      const z = B.minY + (j + 0.5) * STEP;
      for (let i = 0; i < w; i++) {
        const o = j * w + i, x = B.minX + (i + 0.5) * STEP, e = F.E[o];
        data[o * 4] = half(Math.max(-30, Math.min(60, F.F[o])));
        data[o * 4 + 1] = half(Math.max(-30, Math.min(60, F.G[o])));
        data[o * 4 + 2] = half(e >= 0 && M.edges[e].k.town ? 1 : 0);
        data[o * 4 + 3] = half(Math.max(-60, Math.min(30, M.water(x, z))));
      }
    }
    const tex = new T.DataTexture(data, w, h, T.RGBAFormat, T.HalfFloatType);
    tex.magFilter = T.LinearFilter; tex.minFilter = T.LinearFilter; tex.wrapS = tex.wrapT = T.ClampToEdgeWrapping; tex.needsUpdate = true;
    U.uField.value = tex;
    U.uFieldMin.value.set(B.minX, B.minY);
    U.uFieldSize.value.set(w * STEP, h * STEP);
    // zone texture (4 m): grass, sand, rock, paving
    const zw = Math.ceil(w / 2), zh = Math.ceil(h / 2), Z = new Uint8Array(zw * zh * 4);
    const rb = M.roundabout;
    for (let j = 0; j < zh; j++) for (let i = 0; i < zw; i++) {
      const x = B.minX + (i + 0.5) * 4, z = B.minY + (j + 0.5) * 4, o = (j * zw + i) * 4;
      const d = M.district(x, z), wat = M.water(x, z);
      let grass = d === 4 || d === 6 || d === 7 ? 1 : 0, sand = 0, rock = 0, pave = 0;
      if (d === 5) { const n = 0.5 + 0.5 * Math.sin(x * 0.03) * Math.cos(z * 0.027); rock = 0.55 + 0.45 * n; grass = 1 - rock * 0.8; }
      if (wat > -60 && wat < 6 && (d === 1 || d === 2 || z > 450)) sand = Math.min(1, Math.max(0, (wat + 60) / 18));
      if (Math.hypot(x - M.LAKE.x, z - M.LAKE.y) < 120 && wat < 0) { grass = 1; sand = Math.max(0, Math.min(1, (wat + 8) / 8)) * 0.8; }
      if (Math.hypot(x - rb.x, z - rb.y) < rb.r - 9) grass = 1;
      for (const p of M.pads) {
        const lx = Math.abs((x - p.x) * p.ca + (z - p.y) * p.sa), ly = Math.abs(-(x - p.x) * p.sa + (z - p.y) * p.ca);
        if (lx < p.hx + 2 && ly < p.hy + (p.kind === "station" ? 12 : 2)) pave = 1;
      }
      Z[o] = grass * 255; Z[o + 1] = sand * 255; Z[o + 2] = rock * 255; Z[o + 3] = pave * 255;
    }
    const zt = new T.DataTexture(Z, zw, zh, T.RGBAFormat, T.UnsignedByteType);
    zt.magFilter = T.LinearFilter; zt.minFilter = T.LinearFilter; zt.needsUpdate = true;
    U.uZone.value = zt;
  }
  function buildGround() {
    const g = new T.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2);
    const ground = new T.Mesh(g, mats.ground);
    ground.position.set((B.minX + B.maxX) / 2, 0, (B.minY + B.maxY) / 2);
    ground.receiveShadow = true;
    ground.renderOrder = -1;
    root.add(ground);
    const water = new T.Mesh(new T.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), mats.water);
    water.position.set(0, -0.22, 0);
    root.add(water);
  }
  function flushRegions() {
    for (const reg of regions) {
      if (reg.fac.p.length) { const m = new T.Mesh(reg.fac.geometry(), mats.facade); m.receiveShadow = true; root.add(m); }
      if (reg.kit.count) { const m = new T.Mesh(reg.kit.geometry(), mats.kit); m.receiveShadow = true; root.add(m); }
      if (reg.mark.count) { const m = new T.Mesh(reg.mark.geometry(), mats.mark); m.receiveShadow = true; m.renderOrder = 1; root.add(m); }
      if (reg.wall.count) { const m = new T.Mesh(reg.wall.geometry(), mats.kit); m.receiveShadow = true; root.add(m); }
      if (reg.sign.p.length) root.add(new T.Mesh(reg.sign.geometry(), mats.sign));
    }
  }

  /* ---------------- instanced props (streamed by distance) ---------------- */
  const inst = {};
  const BUCKET = 64;
  let geos = null;
  function setupInstances() {
    geos = buildProps();
    for (const [type, list] of Object.entries(props)) {
      if (!list.length) continue;
      const meta = PROP_TYPES[type];
      const cap = Math.min(list.length, type === "pine" ? 1100 : type === "rock" ? 700 : 600);
      const mesh = new T.InstancedMesh(geos[type], mats.kit, cap);
      mesh.count = 0; mesh.frustumCulled = false;
      mesh.castShadow = type === "cliff" || type === "palm"; mesh.receiveShadow = false;
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      const tinted = list.some((p) => p.tint);
      if (tinted) mesh.instanceColor = new T.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(T.DynamicDrawUsage);
      root.add(mesh);
      const buckets = new Map();
      list.forEach((p, i) => { p.i = i; const k = Math.floor(p.x / BUCKET) + "," + Math.floor(p.z / BUCKET); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(p); });
      const range = type === "cliff" || type === "billboard" || type === "yacht" || type === "boat" ? 900 : type === "hwlamp" || type === "palm" || type === "pine" ? 460 : type === "tree" ? 380 : type === "rock" || type === "bush" || type === "container" ? 300 : 240;
      inst[type] = { mesh, list, buckets, cap, range, tinted };
    }
    // billboard faces (atlas)
    const bb = props.billboard;
    if (bb.length) {
      const S = new Signs();
      for (const p of bb) { const c = Math.cos(p.ry), s = Math.sin(p.ry); S.quad(p.x + s * 0.27, 7.5, p.z + c * 0.27, c, -s, s, c, 11, 4.6, cell("ad" + p.ad), 1.4); }
      root.add(new T.Mesh(S.geometry(), mats.sign));
    }
    // lamp light pools (night)
    pools = new T.InstancedMesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mats.glow, 600);
    pools.geometry.setAttribute("aCol", new T.InstancedBufferAttribute(new Float32Array(600 * 4), 4).setUsage(T.DynamicDrawUsage));
    pools.count = 0; pools.frustumCulled = false; pools.renderOrder = 2;
    root.add(pools);
  }
  let pools = null;
  const tmpM = new T.Matrix4(), tmpQ = new T.Quaternion(), tmpE = new T.Euler(), tmpV = new T.Vector3(), tmpS = new T.Vector3(), tmpC = new T.Color();
  let lastX = 1e9, lastZ = 1e9, dirty = true;
  function stream(cx, cz) {
    if (!dirty && Math.hypot(cx - lastX, cz - lastZ) < 25) return;
    lastX = cx; lastZ = cz; dirty = false;
    for (const I of Object.values(inst)) {
      let n = 0;
      const R2 = I.range * I.range, bi0 = Math.floor((cx - I.range) / BUCKET), bi1 = Math.floor((cx + I.range) / BUCKET), bj0 = Math.floor((cz - I.range) / BUCKET), bj1 = Math.floor((cz + I.range) / BUCKET);
      outer: for (let bj = bj0; bj <= bj1; bj++) for (let bi = bi0; bi <= bi1; bi++) {
        const L = I.buckets.get(bi + "," + bj);
        if (!L) continue;
        for (const p of L) {
          if (p.broken) continue;
          const dx = p.x - cx, dz = p.z - cz;
          if (dx * dx + dz * dz > R2) continue;
          tmpM.compose(tmpV.set(p.x, p.y || 0, p.z), tmpQ.setFromEuler(tmpE.set(0, p.ry, 0)), tmpS.setScalar(p.s));
          I.mesh.setMatrixAt(n, tmpM);
          if (I.tinted) I.mesh.setColorAt(n, tmpC.set(p.tint || 0xffffff));
          p.slot = n;
          if (++n >= I.cap) break outer;
        }
      }
      I.mesh.count = n;
      I.mesh.instanceMatrix.needsUpdate = true;
      if (I.tinted && I.mesh.instanceColor) I.mesh.instanceColor.needsUpdate = true;
    }
    // light pools near the camera
    let n = 0;
    const aCol = pools.geometry.getAttribute("aCol");
    const nightK = Math.max(0, (U.uNight.value - 0.3) / 0.7) * 0.3;
    for (const l of lampsList) {
      const dx = l.x - cx, dz = l.z - cz;
      if (dx * dx + dz * dz > 150 * 150 || n >= 600) continue;
      tmpM.compose(tmpV.set(l.x, 0.06, l.z), tmpQ.identity(), tmpS.set(10, 1, 10));
      pools.setMatrixAt(n, tmpM);
      aCol.setXYZW(n, 1.0, 0.72, 0.42, nightK);
      n++;
    }
    pools.count = n; pools.instanceMatrix.needsUpdate = true; aCol.needsUpdate = true;
  }

  /* ---------------- breakables ---------------- */
  const BR = new Map();
  function indexBreakables() {
    for (const [type, list] of Object.entries(props)) {
      const meta = PROP_TYPES[type];
      if (!meta.breakable) continue;
      for (const p of list) {
        if (!p.br) continue;
        const k = Math.floor(p.x / 16) + "," + Math.floor(p.z / 16);
        if (!BR.has(k)) BR.set(k, []);
        BR.get(k).push({ p, type, hit: meta.hit * p.s });
      }
    }
  }
  /** Knock over any breakable within reach of a car at (x, z). Returns hits [{ type, x, z, p }]. */
  function smash(x, z, reach = 1.3, out = []) {
    const i0 = Math.floor((x - 3) / 16), i1 = Math.floor((x + 3) / 16), j0 = Math.floor((z - 3) / 16), j1 = Math.floor((z + 3) / 16);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const L = BR.get(i + "," + j);
      if (!L) continue;
      for (const b of L) {
        if (b.p.broken) continue;
        const dx = b.p.x - x, dz = b.p.z - z;
        if (dx * dx + dz * dz < (b.hit + reach) * (b.hit + reach)) { b.p.broken = true; dirty = true; out.push({ type: b.type, x: b.p.x, z: b.p.z, ry: b.p.ry, s: b.p.s, geo: geos[b.type] }); }
      }
    }
    return out;
  }
  function resetBreakables() { for (const L of BR.values()) for (const b of L) b.p.broken = false; dirty = true; }

  /* ---------------- init pipeline (spread over frames) ---------------- */
  function* steps() {
    yield ["roads", 0];
    F = M.fieldGrid(STEP);
    gw = F.w; gh = F.h; occ = new Uint8Array(gw * gh);
    while (!F.run(24)) yield ["roads", F.F && 0.35 * (1 - 0)];
    yield ["textures", 0.4];
    buildTextures();
    buildGround();
    yield ["buildings", 0.5];
    placeFrontage();
    yield ["buildings", 0.6];
    placeInfill();
    yield ["streets", 0.7];
    buildMarkings();
    yield ["walls", 0.78];
    buildWalls();
    yield ["props", 0.86];
    placeProps();
    buildLandmarks();
    yield ["props", 0.94];
    flushRegions();
    setupInstances();
    indexBreakables();
    yield ["done", 1];
  }
  let ready = false;
  function init(onProgress = () => {}) {
    const it = steps();
    let rows = 0;
    return new Promise((resolve) => {
      const tick = () => {
        const t0 = performance.now();
        while (performance.now() - t0 < 30) {
          const { value, done } = it.next();
          if (done) { ready = true; onProgress(1, "done"); resolve(); return; }
          const [label] = value;
          if (label === "roads") rows++;
          const p = label === "roads" ? Math.min(0.38, (rows * 24) / (F?.h || 1000) * 0.38) : value[1];
          onProgress(p, label);
          if (label !== "roads") break;
        }
        setTimeout(tick, 0);
      };
      tick();
    });
  }

  /* ---------------- per frame ---------------- */
  function update(cx, cz, t, dt, fx) {
    if (!ready) return;
    stream(cx, cz);
    for (const a of animated) {
      if (a.type === "spin") a.obj.rotation.x += a.speed * dt;
      else if (fx && a.type === "fountain") { if (Math.random() < dt * (a.small ? 14 : 26)) fx.fountain(a.x, a.z, a.r); }
      else if (fx && a.type === "beacon") fx.beacon(a.x, a.y, a.z, t);
      else if (fx && a.type === "lighthouse") fx.lighthouse(a.x, a.y, a.z, t);
    }
  }
  /** Is (x, z) inside a building footprint? (camera collision) */
  function blocked(x, z) { if (!occ) return false; const o = occIndex(x, z); return o >= 0 && occ[o] === 1; }
  return { init, update, smash, resetBreakables, blocked, refresh() { dirty = true; }, root, mats, get ready() { return ready; }, buildings, props };
}
