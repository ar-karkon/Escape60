import { P, SKIP, GLOW, shade } from "./voxel.js";
import { atlasRects } from "./signs.js";

/* Reusable street furniture and vegetation. All functions draw into a VoxelBuilder `b`
   in its current frame and optionally register light emitters into glow builder `g`. */

const WARM = 0xffc27a;
export const TOP_ONLY = SKIP.NY | SKIP.PX | SKIP.NX | SKIP.PZ | SKIP.NZ;

export function signBox(b, name, x, y, z, w, h, d, facing, o = {}) {
  // facing: face bit (or list of bits) that shows the atlas image.
  const r = atlasRects[name];
  if (!r) return;
  const faces = {};
  for (const bit of [].concat(facing)) faces[bit] = { p: P.SIGN, e: o.e ?? 3.2, q: o.flicker ?? 0, uvr: [r.u0, r.v0, r.u1, r.v1], color: 0xffffff };
  b.box(x, y, z, w, h, d, o.frame ?? 0x22183a, { n: 0.2, faces });
}

/* ---- Palms ---- */
const TRUNK_A = 0x8a5a44, TRUNK_B = 0xb07a55;
const LEAF_A = 0x2f8f4e, LEAF_B = 0x4fb35a, LEAF_C = 0x9bd35a;
export function palm(b, x, z, rand, opt = {}) {
  const kind = opt.kind ?? (rand() < 0.62 ? 0 : rand() < 0.5 ? 1 : 2);
  const h = opt.h ?? (kind === 1 ? 2.2 + rand() * 1.2 : kind === 2 ? 9 + rand() * 3 : 6 + rand() * 4);
  const lean = (opt.lean ?? (rand() - 0.5)) * (kind === 2 ? 0.25 : 1.2);
  const la = rand() * Math.PI * 2;
  const segs = Math.max(3, Math.round(h / 0.8));
  let tx = x, tz = z, ty = opt.y ?? 0.2;
  const tw = kind === 2 ? 0.42 : kind === 1 ? 0.95 : 0.55;
  for (let s = 0; s < segs; s++) {
    const t = s / segs;
    const off = lean * t * t * h * 0.35;
    tx = x + Math.cos(la) * off;
    tz = z + Math.sin(la) * off;
    b.box(tx, ty + (s + 0.5) * (h / segs), tz, tw * (1 - t * 0.18), (h / segs) * 1.02, tw * (1 - t * 0.18), s % 2 ? TRUNK_A : TRUNK_B, { n: 0.5, ao: true });
    if (s % 2 === 0 && kind !== 1) b.box(tx, ty + (s + 0.05) * (h / segs), tz, tw * 1.15, 0.12, tw * 1.15, shade(TRUNK_A, 0.75), { n: 0.3 });
  }
  const top = ty + h;
  // crown core
  b.box(tx, top, tz, tw * 1.5, 0.6, tw * 1.5, LEAF_A, { p: P.LEAF, n: 0.6 });
  const fronds = kind === 2 ? 7 : kind === 1 ? 9 : 8 + Math.floor(rand() * 3);
  const flen = kind === 2 ? 3 : kind === 1 ? 4 : 4 + Math.floor(rand() * 2);
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + rand() * 0.4;
    const ca = Math.cos(a), sa = Math.sin(a);
    const lift = kind === 2 ? 0.25 : 0.55 + rand() * 0.3;
    for (let k = 0; k < flen; k++) {
      const dist = 0.55 + k * 0.82;
      const yy = top + 0.2 + lift * k - 0.16 * k * k;
      const w = (1.05 - k * 0.14) * (kind === 2 ? 0.8 : 1);
      const tilt = (lift - 0.32 * k) * 0.55;
      b.box(tx + ca * dist, yy, tz + sa * dist, 0.95, 0.16, w, k === flen - 1 ? LEAF_C : (f + k) % 2 ? LEAF_A : LEAF_B, {
        p: P.LEAF, q: f * 7 + k, n: 0.7, ry: -a, rz: tilt, skip: 0,
      });
    }
  }
  if (kind === 0) for (let c = 0; c < 3; c++) {
    const a = c * 2.1;
    b.box(tx + Math.cos(a) * 0.38, top - 0.35, tz + Math.sin(a) * 0.38, 0.3, 0.3, 0.3, 0x6b4a2a, { n: 0.3 });
  }
  return { x: tx, y: top, z: tz };
}

export function planter(b, x, z, w = 1.6, d = 1.6, flowers = 0xff5d95) {
  b.box(x, 0.45, z, w, 0.7, d, 0xd9c2b0, { ao: true, top: 0x4a3326 });
  b.box(x, 0.86, z, w - 0.3, 0.25, d - 0.3, 0x3f9e4c, { p: P.GRASS, n: 0.6 });
  if (flowers) for (let k = 0; k < 4; k++)
    b.box(x + ((k & 1) - 0.5) * (w - 0.6) * 0.8, 1.05, z + ((k >> 1) - 0.5) * (d - 0.6) * 0.8, 0.28, 0.22, 0.28, flowers, { n: 0.3 });
}

export function bush(b, x, z, s = 1, color = 0x3f9e4c) {
  b.box(x, 0.45 * s, z, 1.3 * s, 0.9 * s, 1.3 * s, color, { p: P.LEAF, n: 0.8, ao: true });
  b.box(x + 0.2 * s, 0.95 * s, z - 0.1 * s, 0.8 * s, 0.5 * s, 0.8 * s, shade(color, 1.2), { p: P.LEAF, n: 0.8 });
}

/* ---- Lamps ---- */
export function lampClassic(b, g, x, z, yaw = 0) {
  b.box(x, 0.35, z, 0.55, 0.5, 0.55, 0x2c2440, { n: 0.2 });
  b.box(x, 2.6, z, 0.18, 4.4, 0.18, 0x3a3150, { n: 0.2 });
  b.box(x, 4.9, z, 0.7, 0.1, 0.7, 0x2c2440);
  b.box(x, 5.3, z, 0.55, 0.7, 0.55, WARM, { p: P.LIGHT, e: 4.5, n: 0 });
  b.box(x, 5.75, z, 0.75, 0.15, 0.75, 0x2c2440);
  b.box(x, 5.95, z, 0.2, 0.25, 0.2, 0x2c2440);
  if (g) {
    g.add(GLOW.POOL, x, 0.24, z, 3.2, 3.2, 0, 0xff9a5a, 0.22);
    g.add(GLOW.HALO, x, 5.3, z, 1.5, 0, 0, WARM, 0.45);
    g.add(GLOW.STREAK, x, 0.05, z, 1, 13, 0, WARM, 0.8);
  }
}
export function lampArm(b, g, x, z, dirX, dirZ) {
  // Modern cobra-head lamp hanging over the road (dir points toward road centre).
  b.box(x, 0.3, z, 0.5, 0.4, 0.5, 0x2c2440);
  b.box(x, 3.6, z, 0.22, 6.6, 0.22, 0x4a4560, { n: 0.15 });
  const ax = x + dirX * 1.6, az = z + dirZ * 1.6;
  b.box((x + ax) / 2, 6.85, (z + az) / 2, Math.abs(dirX) * 3.3 + 0.16, 0.16, Math.abs(dirZ) * 3.3 + 0.16, 0x4a4560);
  b.box(ax + dirX * 0.4, 6.75, az + dirZ * 0.4, Math.abs(dirX) * 1.2 + 0.5, 0.26, Math.abs(dirZ) * 1.2 + 0.5, 0x2c2440, {
    faces: { 8: { p: P.LIGHT, e: 5, color: 0xffe1b0 } }, skip: 0,
  });
  if (g) {
    const lx = ax + dirX * 0.4, lz = az + dirZ * 0.4;
    g.add(GLOW.POOL, lx, 0.06, lz, 4, 4, 0, 0xffa060, 0.22);
    g.add(GLOW.HALO, lx, 6.55, lz, 1.4, 0, 0, 0xffd9a0, 0.4);
    g.add(GLOW.STREAK, lx, 0.05, lz, 1.1, 14, 0, 0xffd9a0, 0.75);
  }
}

/* ---- Street furniture ---- */
export function bench(b, x, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  let [px, pz] = at(0, 0);
  b.box(px, 0.62, pz, 2, 0.12, 0.6, 0xa0663f, { ry: yaw, p: P.WOOD, n: 0.3 });
  [px, pz] = at(0, 0.28);
  b.box(px, 1.0, pz, 2, 0.5, 0.1, 0xa0663f, { ry: yaw, p: P.WOOD, n: 0.3 });
  for (const lx of [-0.8, 0.8]) {
    [px, pz] = at(lx, 0);
    b.box(px, 0.3, pz, 0.1, 0.6, 0.55, 0x2c2440, { ry: yaw });
  }
}
export function bin(b, x, z) {
  b.box(x, 0.5, z, 0.55, 0.85, 0.55, 0x3d7f6b, { n: 0.3, ao: true });
  b.box(x, 0.97, z, 0.62, 0.1, 0.62, 0x2c2440);
}
export function hydrant(b, x, z) {
  b.box(x, 0.38, z, 0.32, 0.6, 0.32, 0xe0453f, { n: 0.2 });
  b.box(x, 0.72, z, 0.24, 0.12, 0.24, 0xffd25e);
  b.box(x, 0.45, z, 0.5, 0.12, 0.12, 0xe0453f);
}
export function bollard(b, x, z) {
  b.box(x, 0.45, z, 0.22, 0.75, 0.22, 0xe8dccf, { n: 0.1 });
  b.box(x, 0.86, z, 0.26, 0.08, 0.26, 0xffe37c, { p: P.LIGHT, e: 1.5 });
}
export function umbrella(b, x, z, color, y = 0.2, size = 2.2) {
  b.box(x, y + 1.2, z, 0.08, 2.4, 0.08, 0xe8dccf);
  const h = size / 2, t = 0.12;
  b.hexa(
    [
      [x - h, y + 2.2, z - h], [x + h, y + 2.2, z - h], [x - t, y + 2.75, z - t], [x + t, y + 2.75, z - t],
      [x - h, y + 2.2, z + h], [x + h, y + 2.2, z + h], [x - t, y + 2.75, z + t], [x + t, y + 2.75, z + t],
    ],
    color,
    { p: P.STRIPE, q: 6, n: 0.1, skip: 0 },
  );
}
export function cafeSet(b, x, z, color, withUmbrella = true, rand = null) {
  b.box(x, 0.85, z, 0.9, 0.08, 0.9, 0xf2e8dd);
  b.box(x, 0.5, z, 0.1, 0.7, 0.1, 0x2c2440);
  for (const [dx, dz] of [[-0.75, 0], [0.75, 0]]) {
    b.box(x + dx, 0.52, z + dz, 0.45, 0.08, 0.45, 0x3a3150);
    b.box(x + dx * 1.22, 0.85, z + dz, 0.08, 0.6, 0.45, 0x3a3150);
  }
  b.box(x, 0.98, z, 0.14, 0.18, 0.14, 0xffe0a0, { p: P.LIGHT, e: 3 });
  if (withUmbrella) umbrella(b, x, z, color, 0.2, 2);
  if (rand) {
    if (rand() < 0.7) person(b, x - 0.72, z, Math.PI / 2, rand, true);
    if (rand() < 0.5) person(b, x + 0.72, z, -Math.PI / 2, rand, true);
  }
}
export function railing(b, x0, z0, x1, z1, y = 0.2, color = 0xf2e6dc) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 1.4));
  const yaw = -Math.atan2(z1 - z0, x1 - x0);
  b.box((x0 + x1) / 2, y + 1.0, (z0 + z1) / 2, len, 0.14, 0.16, color, { ry: yaw, n: 0.1 });
  b.box((x0 + x1) / 2, y + 0.5, (z0 + z1) / 2, len, 0.08, 0.08, shade(color, 0.85), { ry: yaw });
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    b.box(x0 + (x1 - x0) * t, y + 0.5, z0 + (z1 - z0) * t, 0.18, 1.0, 0.18, color, { n: 0.1 });
  }
}
export function stringLights(b, x0, y0, z0, x1, y1, z1, sag = 0.8, colors = [0xffe37c, 0xff5d95, 0x3dd8e7]) {
  const n = Math.max(4, Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.9));
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const y = y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * sag;
    b.box(x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t, 0.18, 0.18, 0.18, colors[k % colors.length], { p: P.LIGHT, e: 4, n: 0 });
  }
}
export function trafficLight(b, x, z, dirX, dirZ, axis) {
  // pole on the corner, arm over the road toward (dirX, dirZ)
  b.box(x, 2.7, z, 0.24, 5.4, 0.24, 0x3a3150);
  const len = 4.2;
  b.box(x + dirX * len / 2, 5.3, z + dirZ * len / 2, Math.abs(dirX) * len + 0.16, 0.16, Math.abs(dirZ) * len + 0.16, 0x3a3150);
  const hx = x + dirX * len, hz = z + dirZ * len;
  b.box(hx, 4.7, hz, 0.45, 1.25, 0.45, 0x231b33);
  const ox = -dirZ, oz = dirX; // face oncoming traffic (perpendicular)
  for (let k = 0; k < 3; k++) {
    const col = [0x5dffb0, 0xffd25e, 0xff416a][k];
    b.box(hx + ox * 0.24, 5.1 - k * 0.38, hz + oz * 0.24, 0.26, 0.26, 0.26, col, { p: P.NEON, q: 40 + axis * 3 + k, e: 4, n: 0 });
  }
  b.box(x + dirX * 1.2, 4.6, z + dirZ * 1.2, Math.abs(dirZ) * 1.1 + 0.06, 0.32, Math.abs(dirX) * 1.1 + 0.06, 0x1d7d55);
}
export function busStop(b, g, x, z, yaw, ad = "adCola") {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  let p = at(0, 0.5);
  b.box(p[0], 2.6, p[1], 3.4, 0.12, 1.4, 0xe8dccf, { ry: yaw });
  for (const lx of [-1.6, 1.6]) { p = at(lx, 0.9); b.box(p[0], 1.3, p[1], 0.1, 2.6, 0.1, 0x3a3150, { ry: yaw }); }
  p = at(0, 1.1);
  b.box(p[0], 1.4, p[1], 3.0, 2.0, 0.06, 0x8fd8e8, { ry: yaw, p: P.GLASS });
  p = at(1.85, 0.5);
  const r = atlasRects[ad];
  b.box(p[0], 1.4, p[1], 0.14, 1.4, 1.2, 0x22183a, { ry: yaw, faces: { 1: { p: P.SIGN, e: 2.4, uvr: [r.u0, r.v0, r.u1, r.v1], color: 0xffffff }, 2: { p: P.SIGN, e: 2.4, uvr: [r.u0, r.v0, r.u1, r.v1], color: 0xffffff } } });
  p = at(0, 0.8);
  b.box(p[0], 0.55, p[1], 2.4, 0.1, 0.5, 0xa0663f, { ry: yaw, p: P.WOOD });
  if (g) g.add(GLOW.POOL, p[0], 0.24, p[1], 2, 2, 0, 0x9fe8ff, 0.18);
}
export function billboard(b, g, x, y, z, yaw, ad, w = 7, h = 3.5, legs = true) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  if (legs) for (const lx of [-w * 0.3, w * 0.3]) {
    const px = x + lx * c, pz = z - lx * s;
    b.box(px, y / 2 + 0.6, pz, 0.35, y + 1.2, 0.35, 0x3a3150);
  }
  b.box(x, y + h / 2 + 0.6, z, w + 0.4, h + 0.4, 0.5, 0x2a2340, { ry: yaw, n: 0.2 });
  const r = atlasRects[ad];
  // front face is +z in local frame
  b.box(x + s * 0.27, y + h / 2 + 0.6, z + c * 0.27, w, h, 0.06, 0xffffff, {
    ry: yaw, faces: { 16: { p: P.SIGN, e: 2.6, uvr: [r.u0, r.v0, r.u1, r.v1], color: 0xffffff } }, skip: SKIP.NY | SKIP.NZ,
  });
  b.box(x + s * 0.3, y + 0.45, z + c * 0.3, w, 0.25, 0.6, 0x2a2340, { ry: yaw });
  for (const lx of [-w * 0.33, 0, w * 0.33]) {
    b.box(x + lx * c + s * 0.8, y + 0.55, z - lx * s + c * 0.8, 0.3, 0.2, 0.3, 0xfff1d0, { p: P.LIGHT, e: 4 });
  }
  if (g) g.add(GLOW.HALO, x + s * 0.6, y + h / 2 + 0.6, z + c * 0.6, w * 0.45, 0, 0, 0xff8fc0, 0.1);
}
export function acUnit(b, x, y, z) {
  b.box(x, y + 0.4, z, 1.2, 0.8, 0.9, 0xd8d4dc, { n: 0.2 });
  b.box(x, y + 0.45, z + 0.46, 0.6, 0.6, 0.04, 0x4a4560);
}
export function waterTank(b, x, y, z) {
  for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) b.box(x + dx, y + 0.8, z + dz, 0.16, 1.6, 0.16, 0x4a4560);
  b.box(x, y + 2.3, z, 1.8, 1.6, 1.8, 0x8a6a5a, { p: P.WOOD, n: 0.4 });
  b.box(x, y + 3.25, z, 2.0, 0.3, 2.0, 0x5b4a4a);
}
export function dish(b, x, y, z, yaw) {
  b.box(x, y + 0.4, z, 0.12, 0.8, 0.12, 0x9a96a6);
  b.box(x, y + 0.95, z, 1.0, 1.0, 0.12, 0xe8e6ee, { ry: yaw, rx: -0.5 });
}
export function antenna(b, x, y, z, h = 4) {
  b.box(x, y + h / 2, z, 0.14, h, 0.14, 0xb9b4c4);
  b.box(x, y + h * 0.6, z, 1.0, 0.08, 0.08, 0xb9b4c4);
  b.box(x, y + h + 0.1, z, 0.28, 0.28, 0.28, 0xff2d4a, { p: P.NEON, q: 25, e: 6 });
}
export function cone(b, x, z) {
  b.box(x, 0.06, z, 0.7, 0.12, 0.7, 0xff6b2c);
  b.hexa(
    [
      [x - 0.3, 0.12, z - 0.3], [x + 0.3, 0.12, z - 0.3], [x - 0.08, 1.0, z - 0.08], [x + 0.08, 1.0, z - 0.08],
      [x - 0.3, 0.12, z + 0.3], [x + 0.3, 0.12, z + 0.3], [x - 0.08, 1.0, z + 0.08], [x + 0.08, 1.0, z + 0.08],
    ],
    0xff6b2c,
    { n: 0.2 },
  );
  b.box(x, 0.58, z, 0.38, 0.16, 0.38, 0xfff4e6, { p: P.LIGHT, e: 0.6 });
}

/* Static voxel pedestrians (only ever placed inside solid footprints). */
const SKIN = [0xf1c7a5, 0xd9a27a, 0xb07a55, 0x8a5a3c];
const CLOTH = [0xff5d95, 0x3dd8e7, 0xffe37c, 0xffffff, 0x8d54e9, 0xff8a3d, 0x5dffb0, 0x2a2a3a];
export function person(b, x, z, yaw, rand, seated = false) {
  const skin = SKIN[Math.floor(rand() * SKIN.length)], top = CLOTH[Math.floor(rand() * CLOTH.length)];
  const legs = rand() < 0.5 ? 0x2b3a6a : rand() < 0.5 ? 0xe8e2d6 : 0x3a2a2a, hair = rand() < 0.5 ? 0x2a1a14 : rand() < 0.5 ? 0x7a4a2a : 0xe8c070;
  const y0 = seated ? 0.62 : 0.2;
  if (seated) b.box(x, 0.68, z, 0.36, 0.16, 0.5, legs, { ry: yaw });
  else for (const s of [-0.1, 0.1]) b.box(x + s * Math.cos(yaw), y0 + 0.42, z - s * Math.sin(yaw), 0.16, 0.84, 0.18, legs, { ry: yaw });
  const ty = seated ? 1.05 : y0 + 1.12;
  b.box(x, ty, z, 0.42, 0.6, 0.26, top, { ry: yaw, n: 0.3 });
  for (const s of [-0.27, 0.27]) b.box(x + s * Math.cos(yaw), ty - 0.05, z - s * Math.sin(yaw), 0.1, 0.5, 0.14, top, { ry: yaw });
  b.box(x, ty + 0.46, z, 0.28, 0.3, 0.28, skin, { ry: yaw, n: 0.2 });
  b.box(x, ty + 0.62, z, 0.3, 0.1, 0.3, hair, { ry: yaw });
}
