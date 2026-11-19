import * as T from "../../vendor/three.js";
import { rng, district } from "../simulation.js";
import { cityMap, SEG, STUB } from "../map.js";
import { VoxelBuilder, GlowBuilder, P, SKIP, GLOW, shade, mixHex } from "./voxel.js";
import { C, PASTELS, DEEP, NEONS } from "./palette.js";
import * as prop from "./props.js";

/* Sunset Bay city tiles. One simulation block (520 units) = one 52-unit tile. Roads run along
   tile borders (half width 9.2). Solid simulation footprints are [11.4, 40.6] in local tile
   coordinates (Old Town: four 10.6 lots with 8-unit alleys). Every visible wall sits on that
   footprint so the drawn city matches the authoritative colliders. */
export const TILE = 52;
const RH = 9.2, CB = 11.4, CE = 40.6, MID = 26;
const FLOOR = 2.5, GROUND = 3.4;
const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];
const SMALL_SIGNS = ["cafe", "cafeFa", "superFa", "juiceFa", "sweetFa", "pizzaFa", "sushi", "pizza", "bar", "surf", "diner", "open", "tacos", "gym", "kiosk"];
const ADS = ["adEscape", "adRadio", "adCola", "adBay", "adBurger", "adTurbo"];
const VSIGNS = ["vPalms", "vAzure", "vNeon", "vHotel", "vBay"];

/* ---------------- Ground & street network ---------------- */
// Segment states from map.js: 0 closed, 1 through street, 2 stub from the low end, 3 stub from the high end.
const STUB_L = STUB * TILE; // 32.24: stub length from its open node
function junctionBits(net, farI, farJ, nearI, nearJ) {
  return (net.degree(farI, farJ) >= 3 ? 1 : 0) | (net.degree(nearI, nearJ) >= 3 ? 2 : 0);
}
/** Road ranges [a0, a1] along a segment in tile-local coordinates, plus the solid range. */
function segRanges(state) {
  if (state === SEG.FULL) return { road: [RH, TILE - RH], solid: null };
  if (state === SEG.STUB_START) return { road: [RH, STUB_L], solid: [STUB_L, CE], cap: STUB_L, capDir: 1 };
  if (state === SEG.STUB_END) return { road: [TILE - STUB_L, TILE - RH], solid: [CB, TILE - STUB_L], cap: TILE - STUB_L, capDir: -1 };
  return { road: null, solid: [CB, CE] };
}
function ground(b, g, area, rand, net, i, j) {
  const asphalt = 0x241c36;
  const deg = net.degree(i, j);
  if (deg > 0) b.flat(0, 0, 0, RH * 2, RH * 2, asphalt, { p: P.JUNCTION, n: 0.3 });
  const tileQ = area === 3 ? 2 : area === 1 ? 0 : 1;
  const walk = area === 3 ? 0x9a7f8f : area === 0 ? 0xb39a9a : C.sidewalk;
  const slab = (x0, z0, x1, z1, y0 = -0.4) =>
    b.box((x0 + x1) / 2, (0.2 + y0) / 2, (z0 + z1) / 2, x1 - x0, 0.2 - y0, z1 - z0, C.curb, { topP: P.TILE, topQ: tileQ, top: walk, n: 0.2 });
  // the two segments this tile owns: vertical (local x = 0) and horizontal (local z = 0)
  for (const axis of [0, 1]) {
    const state = net.seg(axis, i, j);
    const R = segRanges(state);
    const far = axis === 0 ? [i, j + 1] : [i + 1, j];
    // place(along0, along1, across0, across1) -> world-local rectangle for this axis
    const rect = (a0, a1, c0, c1) => (axis === 0 ? [c0, a0, c1, a1] : [a0, c0, a1, c1]);
    if (R.road) {
      const [a0, a1] = R.road, len = a1 - a0, mid = (a0 + a1) / 2;
      let q = 0;
      if (state === SEG.FULL) q = junctionBits(net, far[0], far[1], i, j);
      else if (state === SEG.STUB_START) q = net.degree(i, j) >= 3 ? 2 : 0;
      else q = net.degree(far[0], far[1]) >= 3 ? 1 : 0;
      if (axis === 0) b.flat(0, 0, mid, RH * 2, len, asphalt, { p: P.ROAD, u0: -RH, fw: len, n: 0.3, q });
      else b.flat(mid, 0, 0, RH * 2, len, asphalt, { p: P.ROAD, u0: -RH, fw: len, n: 0.3, ry: Math.PI / 2, q });
      for (let k = 0; k < 2; k++) {
        const t = a0 + 3 + rand() * (len - 6), o = -4 + rand() * 8;
        if (axis === 0) b.flat(o, 0.012, t, 0.9, 0.9, 0x1b1628, { n: 0.5 }); else b.flat(t, 0.012, o, 0.9, 0.9, 0x1b1628, { n: 0.5 });
      }
    }
    if (R.cap !== undefined) deadEndCap(b, g, axis, R.cap, R.capDir, rand);
    if (R.solid) infillRegion(b, g, ...rect(R.solid[0], R.solid[1], -CB, CB), rand, axis, area);
    // curb pieces where a junction square meets a closed approach
    const nearOpen = state === SEG.FULL || state === SEG.STUB_START, farOpen = state === SEG.FULL || state === SEG.STUB_END;
    if (!nearOpen && deg > 0) slab(...rect(RH, CB, -CB, CB));
    if (!farOpen && net.degree(far[0], far[1]) > 0) slab(...rect(CE, TILE - RH, -CB, CB));
    if (R.road && state !== SEG.FULL) {
      // sidewalks run along both sides of a stub and wrap its end
      const [a0, a1] = R.road;
      slab(...rect(a0, a1, -CB, -RH)); slab(...rect(a0, a1, RH, CB));
    }
  }
  if (deg === 0) infillRegion(b, g, -CB, -CB, CB, CB, rand, 2, area);
  if (area === 3) {
    const A = RH, Bm = MID - 4, Cc = MID + 4, D = TILE - RH;
    for (const [x0, x1] of [[A, Bm], [Cc, D]]) for (const [z0, z1] of [[A, Bm], [Cc, D]]) slab(x0, z0, x1, z1);
    b.flat(MID, 0.005, MID, 8, TILE - RH * 2, 0x4a3a52, { p: P.BRICK, n: 0.3 });
    b.flat(MID, 0.006, MID, TILE - RH * 2, 8, 0x4a3a52, { p: P.BRICK, n: 0.3 });
  } else if (area === 0) {
    const D = TILE - RH;
    slab(RH, RH, D, CB, -1.6); slab(RH, TILE - CB, D, D, -1.6);
    slab(RH, CB, CB, TILE - CB, -1.6); slab(TILE - CB, CB, D, TILE - CB, -1.6);
  } else slab(RH, RH, TILE - RH, TILE - RH);
  for (const v of [RH + 0.12, TILE - RH - 0.12]) {
    b.box(v, 0.21, MID, 0.24, 0.02, TILE - RH * 2, 0xe9d8e2, { n: 0 });
    b.box(MID, 0.21, v, TILE - RH * 2, 0.02, 0.24, 0xe9d8e2, { n: 0 });
  }
}
/** Barrier, dead-end sign and planters closing a stub street. */
function deadEndCap(b, g, axis, at, dir, rand) {
  const P2 = (along, across) => (axis === 0 ? [across, along] : [along, across]);
  const yaw = axis === 0 ? 0 : Math.PI / 2;
  for (let k = -3; k <= 3; k++) {
    const [x, z] = P2(at - dir * 0.6, k * 2.4);
    b.box(x, 0.5, z, axis === 0 ? 2.2 : 0.7, 0.8, axis === 0 ? 0.7 : 2.2, 0xd9d2dc, { n: 0.15, ao: true });
    const [sx, sz] = P2(at - dir * 0.97, k * 2.4);
    b.box(sx, 0.62, sz, axis === 0 ? 2 : 0.04, 0.32, axis === 0 ? 0.04 : 2, 0xff416a, { p: P.STRIPE, q: 6, n: 0 });
  }
  for (const s of [-1, 1]) {
    const [lx, lz] = P2(at - dir * 0.6, s * 8.6);
    b.box(lx, 1.1, lz, 0.28, 0.28, 0.28, 0xffb000, { p: P.NEON, e: 5, q: 21 + (s > 0 ? 1 : 0) });
  }
  const [px, pz] = P2(at - dir * 0.4, 0);
  b.box(px, 1.5, pz, 0.14, 3, 0.14, 0x4a4560);
  if (axis === 0) prop.signBox(b, "deadEnd", px, 3.3, pz - dir * 0.08, 1.8, 1.2, 0.1, dir > 0 ? 32 : 16, { e: 1.2 });
  else prop.signBox(b, "deadEnd", px - dir * 0.08, 3.3, pz, 0.1, 1.2, 1.8, dir > 0 ? 2 : 1, { e: 1.2 });
  if (g) {
    const [gx, gz] = P2(at - dir * 2, 0);
    g.add(GLOW.POOL, gx, 0.08, gz, 6, 2.5, axis === 0 ? 0 : Math.PI / 2, 0xffa020, 0.35);
  }
}
/** Solid space between blocks where a street is closed: pocket park, plaza, mini mall or car park.
 * Everything here stays inside the simulation's solid rectangle. */
function infillRegion(b, g, x0, z0, x1, z1, rand, axis, area) {
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, small = Math.min(w, d) < 10;
  const r = rand();
  if (small || r < 0.35) {
    // pocket park: hedge wall, lawn, palms, a bench and lights
    b.box(cx, 0.45, cz, w, 0.9, d, 0x3a7a46, { p: P.LEAF, n: 0.7, ao: true, top: 0x4fa45a });
    b.box(cx, 0.95, cz, w - 1.2, 0.12, d - 1.2, 0x5fb35f, { p: P.GRASS, n: 0.6 });
    const n = Math.max(1, Math.round((w * d) / 120));
    for (let k = 0; k < n; k++) prop.palm(b, x0 + 2 + rand() * (w - 4), z0 + 2 + rand() * (d - 4), rand, { y: 1 });
    if (!small) {
      for (let k = 0; k < 3; k++) prop.bush(b, x0 + 2 + rand() * (w - 4), z0 + 2 + rand() * (d - 4), 0.7, rand() < 0.4 ? 0xd35d9a : 0x3f9e4c);
      b.box(cx, 1.6, cz, 0.18, 1.4, 0.18, 0x3a3150);
      b.box(cx, 2.4, cz, 0.5, 0.5, 0.5, 0xffd9a0, { p: P.LIGHT, e: 3 });
      if (g) g.add(GLOW.POOL, cx, 1.05, cz, 3, 3, 0, 0xffc27a, 0.25);
    }
  } else if (r < 0.6) {
    // plaza: raised paving, fountain or statue, bollards and string lights
    b.box(cx, 0.35, cz, w, 0.7, d, 0xd9c7c0, { topP: P.TILE, topQ: 2, top: 0xcab3c4, n: 0.2, ao: true });
    for (let k = 0; k < Math.floor((w + d) / 3); k++) {
      const t = k / Math.floor((w + d) / 3);
      const [bx, bz] = t < 0.5 ? [x0 + 0.5 + t * 2 * (w - 1), z0 + 0.5] : [x0 + 0.5 + (t - 0.5) * 2 * (w - 1), z1 - 0.5];
      prop.bollard(b, bx, bz);
    }
    if (rand() < 0.5) {
      b.box(cx, 1.0, cz, 5, 0.6, 5, 0xe8dccf, { ao: true });
      b.flat(cx, 1.32, cz, 4.2, 4.2, 0x2fa6c4, { p: P.WATER });
      b.box(cx, 2.1, cz, 0.8, 1.6, 0.8, 0xe8dccf);
      b.box(cx, 3.2, cz, 0.4, 1, 0.4, 0x8ff3ff, { p: P.LIGHT, e: 2 });
      if (g) g.add(GLOW.HALO, cx, 2.8, cz, 2.6, 0, 0, C.cyan, 0.22);
    } else {
      b.box(cx, 1.4, cz, 2.4, 1.4, 2.4, 0xb9b4c4, { ao: true });
      b.box(cx, 3.2, cz, 0.9, 2.2, 0.7, 0xffc93c, { n: 0.2 });
      b.box(cx, 4.6, cz, 0.6, 0.6, 0.6, 0xffc93c, { n: 0.2 });
      if (g) g.add(GLOW.HALO, cx, 3.5, cz, 3, 0, 0, 0xffd27a, 0.2);
    }
    prop.stringLights(b, x0 + 1, 4.2, z0 + 1, x1 - 1, 4.2, z1 - 1, 0.6);
    for (let k = 0; k < 3; k++) prop.person(b, x0 + 1.5 + rand() * (w - 3), z0 + 1.5 + rand() * (d - 3), rand() * 6, rand);
  } else if (r < 0.82) {
    // mini mall: two-storey pastel block with shop windows on every side and a neon roof band
    const color = pick(rand, PASTELS), H = 5.6 + rand() * 2.5;
    b.box(cx, H / 2, cz, w - 0.4, H, d - 0.4, color, { ao: true, n: 0.3, topP: P.ROOF, top: shade(color, 0.7),
      faces: { 1: { p: P.WIN, q: 1 }, 2: { p: P.WIN, q: 1 }, 16: { p: P.WIN, q: 1 }, 32: { p: P.WIN, q: 1 } } });
    b.box(cx, 1.6, cz, w - 0.2, 2.6, d - 0.2, 0xffffff, { p: P.SHOP, q: Math.floor(rand() * 4), n: 0, skip: SKIP.NY | SKIP.PY });
    neonOutline(b, x0 + 0.2, z0 + 0.2, x1 - 0.2, z1 - 0.2, H + 0.1, pick(rand, NEONS), 3);
    neonOutline(b, x0 + 0.1, z0 + 0.1, x1 - 0.1, z1 - 0.1, 3.05, pick(rand, NEONS), 2.6);
    rooftopClutter(b, x0 + 1, z0 + 1, x1 - 1, z1 - 1, H, rand, 2);
    if (g) g.add(GLOW.POOL, cx, 0.24, cz, w * 0.6, d * 0.6, 0, 0xffa860, 0.18);
  } else {
    // fenced car park with parked cars and a P sign
    b.box(cx, 0.1, cz, w, 0.2, d, 0x3a3348, { topP: P.ROAD, n: 0.2 });
    prop.railing(b, x0 + 0.2, z0 + 0.2, x1 - 0.2, z0 + 0.2, 0.2, 0xe8e2ee);
    prop.railing(b, x0 + 0.2, z1 - 0.2, x1 - 0.2, z1 - 0.2, 0.2, 0xe8e2ee);
    prop.railing(b, x0 + 0.2, z0 + 0.2, x0 + 0.2, z1 - 0.2, 0.2, 0xe8e2ee);
    prop.railing(b, x1 - 0.2, z0 + 0.2, x1 - 0.2, z1 - 0.2, 0.2, 0xe8e2ee);
    const along = w > d, n = Math.floor((along ? w : d) / 3.2);
    for (let k = 0; k < n; k++) for (const sd of [-1, 1]) {
      if (rand() < 0.3) continue;
      const t = (along ? x0 : z0) + 1.8 + k * 3.2;
      const px = along ? t : cx + sd * (w / 2 - 3), pz = along ? cz + sd * (d / 2 - 3) : t;
      const col = pick(rand, [0x19b8bc, 0xffe37c, 0xae86db, 0xe85a7a, 0xf2f0ea, 0x3d6be0]);
      b.box(px, 0.75, pz, along ? 2.2 : 4.2, 0.9, along ? 4.2 : 2.2, col, { p: P.PAINT, n: 0.3 });
      b.box(px, 1.45, pz, along ? 1.8 : 2.2, 0.55, along ? 2.2 : 1.8, 0x1a1b33, { p: P.GLASS });
    }
    b.box(cx, 2.4, cz, 0.16, 4.4, 0.16, 0x4a4560);
    prop.signBox(b, "parking", cx, 4.2, cz, 1.2, 1.2, 1.2, [1, 2, 16, 32], { e: 1.6 });
    if (g) g.add(GLOW.POOL, cx, 0.24, cz, w * 0.45, d * 0.45, 0, 0xe8f0ff, 0.22);
  }
}

/* ---------------- Building kit ---------------- */
// Lot: {x0,z0,x1,z1, street:{px,nx,pz,nz}}
const FACE_BITS = { px: 1, nx: 2, pz: 16, nz: 32 };
function faceList(lot) {
  const out = [];
  const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
  if (lot.street.nx) out.push({ bit: 2, nx: -1, nz: 0, x: lot.x0, z: cz, len: lot.z1 - lot.z0, axis: "z" });
  if (lot.street.px) out.push({ bit: 1, nx: 1, nz: 0, x: lot.x1, z: cz, len: lot.z1 - lot.z0, axis: "z" });
  if (lot.street.nz) out.push({ bit: 32, nx: 0, nz: -1, x: cx, z: lot.z0, len: lot.x1 - lot.x0, axis: "x" });
  if (lot.street.pz) out.push({ bit: 16, nx: 0, nz: 1, x: cx, z: lot.z1, len: lot.x1 - lot.x0, axis: "x" });
  return out;
}
/** Body box with patterned street faces. */
function body(b, x0, z0, x1, z1, y0, y1, color, street, p, q, extra = {}, skip = SKIP.NY) {
  const faces = {};
  for (const k in FACE_BITS) if (street[k]) faces[FACE_BITS[k]] = { p, q, ...extra };
  if (!(skip & SKIP.NY)) faces[8] = { p: P.PLAIN, color: shade(color, 0.55) };
  b.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, color, {
    faces, ao: true, n: 0.35, topP: P.ROOF, top: shade(color, 0.7), v0: y0, skip,
  });
}
/* Ocean-Drive style colonnade: ground floor recessed 2.2 behind columns standing on the
   collider line, with lit shopfronts, café tables, ceiling lamps and hanging signs. */
const ARC = 2.2;
function arcade(b, g, lot, rand, color, trim = 0xfff4e6) {
  const st = lot.street;
  const ix0 = lot.x0 + (st.nx ? ARC : 0), ix1 = lot.x1 - (st.px ? ARC : 0);
  const iz0 = lot.z0 + (st.nz ? ARC : 0), iz1 = lot.z1 - (st.pz ? ARC : 0);
  b.box((ix0 + ix1) / 2, GROUND / 2, (iz0 + iz1) / 2, ix1 - ix0, GROUND, iz1 - iz0, shade(color, 0.8), { ao: true, n: 0.3, skip: SKIP.NY | SKIP.PY });
  for (const f of faceList(lot)) {
    const inner = { ...f, x: f.axis === "z" ? f.x - f.nx * ARC : f.x, z: f.axis === "z" ? f.z : f.z - f.nz * ARC, len: f.len - (f.axis === "z" ? (st.nz ? ARC : 0) + (st.pz ? ARC : 0) : (st.nx ? ARC : 0) + (st.px ? ARC : 0)) };
    if (f.axis === "z") inner.z = (iz0 + iz1) / 2; else inner.x = (ix0 + ix1) / 2;
    storefront(b, g, inner, rand, 0.2, GROUND - 0.5, false, true);
    // fascia band + columns on the collider line
    faceBox(b, f, 0, GROUND - 0.25, f.len, 0.5, 0.35, 0.02, trim, { n: 0.15 });
    faceBox(b, f, 0, GROUND - 0.52, f.len, 0.08, 0.08, 0.2, NEONS[Math.floor(rand() * NEONS.length)], { p: P.NEON, e: 3, n: 0 });
    const n = Math.max(2, Math.round(f.len / 3.6));
    for (let k = 0; k <= n; k++) {
      const sx = -f.len / 2 + 0.3 + ((f.len - 0.6) * k) / n;
      faceBox(b, f, sx, GROUND / 2, 0.5, GROUND, 0.5, -0.25, trim, { n: 0.15, ao: true });
      faceBox(b, f, sx, 0.35, 0.7, 0.5, 0.7, -0.25, shade(trim, 0.85), { n: 0.15 });
    }
    // ceiling lamps + light spill
    for (let k = 0; k < n; k++) {
      const sx = -f.len / 2 + 0.3 + ((f.len - 0.6) * (k + 0.5)) / n;
      faceBox(b, f, sx, GROUND - 0.06, 0.4, 0.06, 0.4, -ARC / 2, 0xffe0b0, { p: P.LIGHT, e: 4, n: 0 });
      if (g) { const [lx, lz] = onFace(f, sx, -ARC / 2); g.add(GLOW.POOL, lx, 0.23, lz, 1.6, 1.6, 0, 0xffa860, 0.3); }
      const r = rand();
      const [cx, cz] = onFace(f, sx, -ARC / 2 - 0.1);
      if (r < 0.45) prop.cafeSet(b, cx, cz, 0, false, rand);
      else if (r < 0.52) { const [qx, qz] = onFace(f, sx + 0.6, -ARC / 2); prop.person(b, qx, qz, Math.atan2(f.nx, f.nz), rand); }
      else if (r < 0.62) prop.planter(b, cx, cz, 0.9, 0.9, pick(rand, [0xff5d95, 0xffe37c, 0]));
      else if (r < 0.7) prop.bin(b, cx, cz);
      // hanging blade sign between columns
      if (rand() < 0.35) {
        const name = pick(rand, SMALL_SIGNS);
        const [hx, hz] = onFace(f, sx, -0.25);
        if (f.axis === "z") prop.signBox(b, name, hx, GROUND - 1.05, hz, 0.12, 0.55, 1.75, [1, 2], {});
        else prop.signBox(b, name, hx, GROUND - 1.05, hz, 1.75, 0.55, 0.12, [16, 32], {});
      }
    }
    if (g) { const [sx2, sz2] = onFace(f, 0, 2); g.add(GLOW.STREAK, sx2, 0.05, sz2, 1.2, 9, 0, 0xffa860, 0.3); }
  }
}
// Place a thin element hugging a facade: s along facade (-len/2..len/2), y, out distance.
function onFace(f, s, out) {
  return f.axis === "z" ? [f.x + f.nx * out, f.z + s] : [f.x + s, f.z + f.nz * out];
}
function faceBox(b, f, s, y, along, h, depth, out, color, o = {}) {
  const [x, z] = onFace(f, s, out);
  if (f.axis === "z") b.box(x, y, z, depth, h, along, color, o);
  else b.box(x, y, z, along, h, depth, color, o);
}
function ledges(b, lot, faces, y0, y1, step, color) {
  for (let y = y0; y <= y1 + 0.01; y += step) for (const f of faces) faceBox(b, f, 0, y, f.len + 0.3, 0.18, 0.3, 0.12, color, { n: 0.15 });
}
function neonOutline(b, x0, z0, x1, z1, y, color, e = 3.2, t = 0.16) {
  const o = { p: P.NEON, e, n: 0 };
  b.box((x0 + x1) / 2, y, z0, x1 - x0 + t, t, t, color, o);
  b.box((x0 + x1) / 2, y, z1, x1 - x0 + t, t, t, color, o);
  b.box(x0, y, (z0 + z1) / 2, t, t, z1 - z0, color, o);
  b.box(x1, y, (z0 + z1) / 2, t, t, z1 - z0, color, o);
}
function parapet(b, x0, z0, x1, z1, y, color, h = 0.7) {
  const t = 0.3;
  b.box((x0 + x1) / 2, y + h / 2, z0 + t / 2, x1 - x0, h, t, color, { n: 0.2 });
  b.box((x0 + x1) / 2, y + h / 2, z1 - t / 2, x1 - x0, h, t, color, { n: 0.2 });
  b.box(x0 + t / 2, y + h / 2, (z0 + z1) / 2, t, h, z1 - z0 - 2 * t, color, { n: 0.2 });
  b.box(x1 - t / 2, y + h / 2, (z0 + z1) / 2, t, h, z1 - z0 - 2 * t, color, { n: 0.2 });
}
function awning(b, g, f, s, len, y, color) {
  const depth = 1.5;
  const [x0, z0] = onFace(f, s, 0.05), [x1, z1] = onFace(f, s, depth);
  const half = len / 2;
  let pts;
  if (f.axis === "z") {
    const za = z0 - half, zb = z0 + half;
    pts = [[x0, y, za], [x1, y - 0.55, za], [x0, y + 0.25, za], [x1, y - 0.35, za], [x0, y, zb], [x1, y - 0.55, zb], [x0, y + 0.25, zb], [x1, y - 0.35, zb]];
    if (f.nx < 0) pts = [pts[1], pts[0], pts[3], pts[2], pts[5], pts[4], pts[7], pts[6]];
  } else {
    const xa = x0 - half, xb = x0 + half;
    pts = [[xa, y, z0], [xb, y, z0], [xa, y + 0.25, z0], [xb, y + 0.25, z0], [xa, y - 0.55, z1], [xb, y - 0.55, z1], [xa, y - 0.35, z1], [xb, y - 0.35, z1]];
    if (f.nz < 0) pts = [pts[4], pts[5], pts[6], pts[7], pts[0], pts[1], pts[2], pts[3]];
  }
  b.hexa(pts, color, { p: P.STRIPE, q: 9, n: 0.1, skip: 0 });
  if (g) {
    const [gx, gz] = onFace(f, s, 1.6);
    g.add(GLOW.POOL, gx, 0.24, gz, len * 0.45, 1.4, f.axis === "z" ? Math.PI / 2 : 0, 0xffb070, 0.22);
  }
}
function storefront(b, g, f, rand, y0 = 0.2, h = GROUND - 0.2, signs = true, inner = false) {
  const n = Math.max(1, Math.round(f.len / 7.5));
  const seg = f.len / n;
  for (let k = 0; k < n; k++) {
    const s = -f.len / 2 + seg * (k + 0.5);
    const tint = Math.floor(rand() * 4);
    faceBox(b, f, s, y0 + h * 0.45, seg - 0.8, h * 0.8, 0.1, 0.04, 0xffffff, { p: P.SHOP, q: tint, n: 0, faces: undefined });
    const ac = pick(rand, [C.flamingo, C.sea, C.violet, 0xff8a3d, 0x2f9e7a, 0xe0453f]);
    if (!inner && rand() < 0.75) awning(b, g, f, s, seg - 1, y0 + h + 0.15, ac);
    if (signs && rand() < 0.8) {
      const name = pick(rand, SMALL_SIGNS);
      const r = prop.signBox;
      const [x, z] = onFace(f, s, 0.2);
      const w = Math.min(seg - 1.4, 3.6), hh = w / 3.2;
      if (f.axis === "z") r(b, name, x, y0 + h + 0.95, z, 0.2, hh, w, f.bit, { flicker: rand() < 0.15 ? 3 : 0 });
      else r(b, name, x, y0 + h + 0.95, z, w, hh, 0.2, f.bit, { flicker: rand() < 0.15 ? 3 : 0 });
      if (g) {
        const [sx, sz] = onFace(f, s, 2.6);
        g.add(GLOW.STREAK, sx, 0.05, sz, 0.9, 9, 0, NEONS[k % NEONS.length], 0.5);
      }
    }
    if (g && !inner) {
      const [px, pz] = onFace(f, s, 1.2);
      g.add(GLOW.POOL, px, 0.24, pz, seg * 0.42, 1.5, f.axis === "z" ? Math.PI / 2 : 0, 0xffa860, 0.22);
    }
  }
}
function balconyRow(b, f, y, len, color, rail = 0xf4ece4, rand) {
  const depth = 1.1;
  faceBox(b, f, 0, y, len, 0.22, depth, depth / 2, color, { n: 0.2 });
  // railing front + posts
  faceBox(b, f, 0, y + 0.62, len, 0.1, 0.1, depth - 0.05, rail);
  const n = Math.round(len / 0.8);
  for (let k = 0; k <= n; k++) faceBox(b, f, -len / 2 + (len * k) / n, y + 0.36, 0.08, 0.5, 0.08, depth - 0.05, rail);
  if (rand && rand() < 0.5) faceBox(b, f, (rand() - 0.5) * len * 0.8, y + 0.42, 0.5, 0.5, 0.5, 0.5, 0x3f9e4c, { p: P.LEAF, n: 0.8 });
}

/* Art Deco hotel: pastel body, eyebrow ledges, neon corners, vertical sign, stepped crown. */
function decoHotel(b, g, lot, rand, floors) {
  const { x0, z0, x1, z1 } = lot;
  const color = pick(rand, PASTELS), accent = pick(rand, NEONS), trim = 0xfff4e6;
  const H = GROUND + floors * FLOOR;
  const faces = faceList(lot);
  const arc = rand() < 0.6;
  if (arc) arcade(b, g, lot, rand, color, trim);
  else body(b, x0, z0, x1, z1, 0, GROUND, shade(color, 0.92), lot.street, P.PLAIN, 0);
  body(b, x0, z0, x1, z1, GROUND, H, color, lot.street, P.WIN, (rand() < 0.5 ? 0 : 2) + 4 * Math.floor(rand() * 60), { v0: 0 }, arc ? 0 : SKIP.NY);
  if (!arc) for (const f of faces) storefront(b, g, f, rand);
  ledges(b, lot, faces, GROUND, H - FLOOR, FLOOR, trim);
  // rounded Art Deco corner towers with neon rings on street corners
  for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
    const sx = cx === x0 ? -1 : 1, sz = cz === z0 ? -1 : 1;
    const st = (sx < 0 ? lot.street.nx : lot.street.px) || (sz < 0 ? lot.street.nz : lot.street.pz);
    if (!st) continue;
    roundCorner(b, cx, cz, sx, sz, GROUND, H + 0.6, shade(color, 1.06), accent);
  }
  // balconies on the main facade centre
  const main = faces[0];
  if (main && rand() < 0.75) for (let fl = 1; fl < floors; fl += 1) balconyRow(b, main, GROUND + fl * FLOOR - 0.1, Math.min(6, main.len * 0.4), trim, trim, rand);
  // vertical hotel sign
  if (main) {
    const name = pick(rand, VSIGNS);
    const [x, z] = onFace(main, main.len * 0.3, 0.9);
    const h = Math.min(H - GROUND - 1.5, 9);
    if (main.axis === "z") prop.signBox(b, name, x, GROUND + 1 + h / 2, z, 1.4, h, 0.35, [16, 32], {});
    else prop.signBox(b, name, x, GROUND + 1 + h / 2, z, 0.35, h, 1.4, [1, 2], {});
    // also visible from the street axis: emit a streak
    if (g) { const [sx, sz] = onFace(main, main.len * 0.3, 4); g.add(GLOW.STREAK, sx, 0.05, sz, 1.1, 14, 0, accent, 0.7); }
  }
  // stepped crown
  const ix0 = x0 + 1.4, iz0 = z0 + 1.4, ix1 = x1 - 1.4, iz1 = z1 - 1.4;
  parapet(b, x0, z0, x1, z1, H, trim, 0.6);
  neonOutline(b, x0 - 0.05, z0 - 0.05, x1 + 0.05, z1 + 0.05, H + 0.62, accent, 3);
  const crownH = 2 + rand() * 2.5;
  b.box((ix0 + ix1) / 2, H + crownH / 2, (iz0 + iz1) / 2, ix1 - ix0, crownH, iz1 - iz0, shade(color, 1.05), { top: 0x8a7a90, ao: false });
  neonOutline(b, ix0, iz0, ix1, iz1, H + crownH + 0.05, accent, 3);
  if (rand() < 0.6) {
    const r2 = { x: (ix0 + ix1) / 2, z: (iz0 + iz1) / 2 };
    const sname = rand() < 0.5 ? "hotel" : "hotelFa";
    const w = Math.min(ix1 - ix0 - 1, 6);
    if (main && main.axis === "z") prop.signBox(b, sname, main.nx < 0 ? ix0 - 0.2 : ix1 + 0.2, H + crownH + 1.1, r2.z, 0.3, w / 3, w, main.bit, {});
    else if (main) prop.signBox(b, sname, r2.x, H + crownH + 1.1, main.nz < 0 ? iz0 - 0.2 : iz1 + 0.2, w, w / 3, 0.3, main.bit, {});
  }
  const ccx = (ix0 + ix1) / 2, ccz = (iz0 + iz1) / 2, top = H + crownH;
  const crown = rand();
  if (crown < 0.4) {
    // stepped spire with neon rings and a blinking tip
    for (let k = 0; k < 3; k++) {
      const w2 = 3.2 - k * 0.9, y2 = top + k * 1.6;
      b.box(ccx, y2 + 0.8, ccz, w2, 1.6, w2, trim, { n: 0.15 });
      b.box(ccx, y2 + 1.62, ccz, w2 + 0.12, 0.12, w2 + 0.12, accent, { p: P.NEON, e: 3.4, n: 0 });
    }
    b.box(ccx, top + 7, ccz, 0.3, 3.6, 0.3, 0xe8e2ee);
    b.box(ccx, top + 9, ccz, 0.4, 0.4, 0.4, 0xff2d4a, { p: P.NEON, q: 24, e: 6 });
  } else if (crown < 0.75 && main) {
    // Deco fin: tall vertical slab with neon edges facing the main street
    const along = main.axis === "z";
    const fw = Math.min(5, (along ? iz1 - iz0 : ix1 - ix0) - 1), fh = 6 + rand() * 4;
    b.box(ccx, top + fh / 2, ccz, along ? 0.5 : fw, fh, along ? fw : 0.5, trim, { n: 0.15 });
    for (const sgn of [-1, 1]) b.box(along ? ccx : ccx + sgn * fw / 2, top + fh / 2, along ? ccz + sgn * fw / 2 : ccz, 0.16, fh, 0.16, accent, { p: P.NEON, e: 3.6, n: 0 });
    b.box(ccx, top + fh + 0.08, ccz, along ? 0.6 : fw + 0.16, 0.16, along ? fw + 0.16 : 0.6, accent, { p: P.NEON, e: 3.6, n: 0 });
  }
  rooftopClutter(b, ix0, iz0, ix1, iz1, top, rand, 2);
}
function roundCorner(b, cx, cz, sx, sz, y0, y1, color, accent) {
  const r = 1.8, x = cx - sx * 0.8, z = cz - sz * 0.8, h = y1 - y0;
  for (const ry of [0, Math.PI / 4]) {
    b.box(x, (y0 + y1) / 2, z, r, h, r, color, { n: 0.2, ry, ao: true });
    for (let y = y0 + FLOOR; y < y1 - 0.5; y += FLOOR * 2) b.box(x, y, z, r + 0.14, 0.14, r + 0.14, accent, { p: P.NEON, e: 3, n: 0, ry });
    b.box(x, y1 + 0.1, z, r + 0.3, 0.2, r + 0.3, 0xfff4e6, { ry, n: 0.1 });
  }
}

/* Glass tower with podium, curtain wall, crown lights and antenna. */
function glassTower(b, g, lot, rand) {
  const { x0, z0, x1, z1 } = lot;
  const faces = faceList(lot);
  const podium = pick(rand, [0xd9c2d2, 0xbfb3d8, 0xe7c9b8]);
  const glassTint = pick(rand, [0x5d6fb8, 0x6b5aa8, 0x4f86a8, 0x7a5f9e]);
  body(b, x0, z0, x1, z1, 0, GROUND + FLOOR, podium, lot.street, P.PLAIN, 0);
  for (const f of faces) storefront(b, g, f, rand, 0.2, GROUND - 0.2);
  ledges(b, lot, faces, GROUND + FLOOR, GROUND + FLOOR, 1, 0xf4ece4);
  const inset = 1.2, tx0 = x0 + inset, tz0 = z0 + inset, tx1 = x1 - inset, tz1 = z1 - inset;
  const H = 22 + rand() * 24;
  const allStreet = { px: 1, nx: 1, pz: 1, nz: 1 };
  body(b, tx0, tz0, tx1, tz1, GROUND + FLOOR, H, glassTint, allStreet, P.CURTAIN, Math.floor(rand() * 200), { v0: 0 });
  // vertical mullion fins
  for (const fx of [tx0, tx1]) for (const fz of [tz0, tz1]) b.box(fx, (H + GROUND) / 2, fz, 0.35, H - GROUND, 0.35, 0xe6e2ee, { n: 0.1 });
  const accent = pick(rand, [C.cyan, C.flamingo, 0xc77dff]);
  neonOutline(b, tx0, tz0, tx1, tz1, H, accent, 3.4, 0.2);
  // crown setback
  const c2 = 2.2, h2 = 2.5 + rand() * 3;
  body(b, tx0 + c2, tz0 + c2, tx1 - c2, tz1 - c2, H, H + h2, shade(glassTint, 0.8), allStreet, P.CURTAIN, Math.floor(rand() * 200));
  neonOutline(b, tx0 + c2, tz0 + c2, tx1 - c2, tz1 - c2, H + h2, accent, 3.4, 0.2);
  const cx = (tx0 + tx1) / 2, cz = (tz0 + tz1) / 2;
  if (rand() < 0.5) prop.antenna(b, cx, H + h2, cz, 5 + rand() * 4);
  else {
    // helipad
    b.box(cx, H + h2 + 0.1, cz, 5, 0.2, 5, 0x3a3150, { n: 0.2 });
    b.box(cx, H + h2 + 0.22, cz, 0.5, 0.04, 2.6, 0xfff4e6);
    b.box(cx - 0.9, H + h2 + 0.22, cz, 0.5, 0.04, 2.6, 0xfff4e6);
    b.box(cx + 0.9, H + h2 + 0.22, cz, 0.5, 0.04, 2.6, 0xfff4e6);
    b.box(cx, H + h2 + 0.22, cz, 1.8, 0.04, 0.45, 0xfff4e6);
    for (const [dx, dz] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]]) b.box(cx + dx, H + h2 + 0.3, cz + dz, 0.2, 0.2, 0.2, 0x5dffb0, { p: P.NEON, e: 4, q: 22 });
  }
}

/* Mid-rise apartments with balconies, AC units and water tanks. */
function apartment(b, g, lot, rand, floors) {
  const { x0, z0, x1, z1 } = lot;
  const faces = faceList(lot);
  const color = rand() < 0.5 ? pick(rand, DEEP) : pick(rand, PASTELS);
  const H = GROUND + floors * FLOOR;
  const arc = rand() < 0.4;
  if (arc) arcade(b, g, lot, rand, color, 0xe9e1e8);
  else {
    body(b, x0, z0, x1, z1, 0, GROUND, shade(color, 0.85), lot.street, P.PLAIN, 0);
    for (const f of faces) storefront(b, g, f, rand);
  }
  body(b, x0, z0, x1, z1, GROUND, H, color, lot.street, P.WIN, 1 + 4 * Math.floor(rand() * 60), { v0: 0 }, arc ? 0 : SKIP.NY);
  ledges(b, lot, faces, GROUND, GROUND, 1, 0xf4ece4);
  for (const f of faces) {
    const nb = Math.max(1, Math.floor(f.len / 5));
    for (let fl = 1; fl < floors; fl++) for (let k = 0; k < nb; k++) {
      if (rand() < 0.35) continue;
      const s = -f.len / 2 + (f.len / nb) * (k + 0.5);
      const [x, z] = onFace(f, s, 0);
      const sub = { ...f, x: f.axis === "z" ? f.x : x, z: f.axis === "z" ? z : f.z, len: 3 };
      balconyRow(b, sub, GROUND + fl * FLOOR - 0.15, 3, 0xe9e1e8, 0xf4ece4, rand);
      if (rand() < 0.4) faceBox(b, f, s + 2, GROUND + fl * FLOOR + 0.6, 0.9, 0.7, 0.6, 0.35, 0xd8d4dc, { n: 0.2 });
    }
  }
  parapet(b, x0, z0, x1, z1, H, shade(color, 1.15), 0.6);
  rooftopClutter(b, x0 + 1, z0 + 1, x1 - 1, z1 - 1, H, rand, 3);
}

/* Small Old Town shop house (all four sides face road or alley). */
function shopHouse(b, g, lot, rand) {
  const { x0, z0, x1, z1 } = lot;
  const faces = faceList(lot);
  const color = pick(rand, PASTELS);
  const floors = 1 + Math.floor(rand() * 3);
  const H = GROUND + floors * FLOOR;
  const arc = rand() < 0.45;
  if (arc) arcade(b, g, lot, rand, color);
  else body(b, x0, z0, x1, z1, 0, GROUND, shade(color, 0.9), lot.street, P.PLAIN, 0);
  body(b, x0, z0, x1, z1, GROUND, H, color, lot.street, P.WIN, 3 + 4 * Math.floor(rand() * 60), { v0: 0 }, arc ? 0 : SKIP.NY);
  if (!arc) for (const f of faces) storefront(b, g, f, rand);
  ledges(b, lot, faces, GROUND, H - FLOOR, FLOOR, 0xfff4e6);
  for (const f of faces) if (floors > 1 && rand() < 0.6) balconyRow(b, f, GROUND + FLOOR - 0.15, Math.min(4, f.len * 0.4), 0xfff4e6, 0x3a3150, rand);
  parapet(b, x0, z0, x1, z1, H, 0xfff4e6, 0.55);
  const r = rand();
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (r < 0.4) {
    // rooftop terrace with pergola + string lights
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) b.box(cx + dx, H + 1.3, cz + dz, 0.25, 2.6, 0.25, 0x6b4a3a);
    for (let k = -3; k <= 3; k += 1) b.box(cx + k, H + 2.65, cz, 0.15, 0.15, 6.4, 0x8a5a44, { p: P.WOOD });
    prop.stringLights(b, cx - 3, H + 2.5, cz - 3, cx + 3, H + 2.5, cz + 3, 0.5);
    prop.stringLights(b, cx + 3, H + 2.5, cz - 3, cx - 3, H + 2.5, cz + 3, 0.5);
    prop.cafeSet(b, cx - 1.5, cz + 1, pick(rand, [C.flamingo, C.sea]));
    prop.bush(b, cx + 2.5, cz - 2.5, 0.8);
    b.box(cx, H + 0.06, cz, 7, 0.12, 7, 0xa0663f, { p: P.WOOD, n: 0.3 });
  } else rooftopClutter(b, x0 + 0.8, z0 + 0.8, x1 - 0.8, z1 - 0.8, H, rand, 2);
}

/* Motel: two-storey walkway block + giant neon pole sign + pool courtyard. */
function motel(b, g, lot, rand) {
  const { x0, z0, x1, z1 } = lot;
  const faces = faceList(lot);
  const color = pick(rand, [0xf7a7b8, 0xa6e3d8, 0xfde2b4]);
  const H = 2 * 3;
  body(b, x0, z0, x1, z1, 0, H, color, lot.street, P.WIN, 2 + 4 * Math.floor(rand() * 60), { v0: -0.4 });
  for (const f of faces) {
    faceBox(b, f, 0, 3.1, f.len, 0.25, 1.6, 0.8, 0xfff4e6);
    faceBox(b, f, 0, 4.0, f.len, 0.12, 0.12, 1.55, 0x3dd8e7, { p: P.NEON, e: 2.4, n: 0 });
  }
  parapet(b, x0, z0, x1, z1, H, 0xfff4e6, 0.5);
  neonOutline(b, x0, z0, x1, z1, H + 0.55, C.flamingo, 3);
  const f = faces[0];
  if (f) {
    const [x, z] = onFace(f, -f.len / 2 + 2.2, 0.9);
    b.box(x, 4.5, z, 0.5, 9, 0.5, 0x3a3150);
    if (f.axis === "z") prop.signBox(b, "motelBig", x, 10.5, z, 0.5, 6, 3, [16, 32], { frame: 0x180f2b });
    else prop.signBox(b, "motelBig", x, 10.5, z, 3, 6, 0.5, [1, 2], { frame: 0x180f2b });
    prop.signBox(b, "iconArrow", x + (f.axis === "x" ? 2.2 : 0), 7.2, z + (f.axis === "z" ? 2.2 : 0), f.axis === "z" ? 0.3 : 1.6, 1.6, f.axis === "z" ? 1.6 : 0.3, f.bit, {});
    if (g) {
      const [sx, sz] = onFace(f, -f.len / 2 + 2.2, 5);
      g.add(GLOW.STREAK, sx, 0.05, sz, 1.3, 14, 0, C.flamingo, 0.6);
      g.add(GLOW.HALO, x, 10.5, z, 4, 0, 0, C.flamingo, 0.18);
    }
  }
  rooftopClutter(b, x0 + 1, z0 + 1, x1 - 1, z1 - 1, H, rand, 2);
}

/* Gas station canopy + kiosk (low, very bright). */
function gasStation(b, g, lot, rand) {
  const { x0, z0, x1, z1 } = lot;
  const faces = faceList(lot);
  // perimeter low wall keeps the collider readable
  b.flat((x0 + x1) / 2, 0.21, (z0 + z1) / 2, x1 - x0, z1 - z0, 0x5a5068, { p: P.TILE, q: 0 });
  for (const f of faces) faceBox(b, f, 0, 0.45, f.len, 0.5, 0.4, -0.2, 0xffe37c, { n: 0.1 });
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (const [dx, dz] of [[-4, -3], [4, -3], [-4, 3], [4, 3]]) b.box(cx + dx, 2.6, cz + dz, 0.5, 4.8, 0.5, 0xf4ece4);
  b.box(cx, 5.3, cz, 11, 0.7, 8.5, 0xf4ece4, { faces: { 8: { p: P.LIGHT, e: 3.4, color: 0xf6f8ff } }, skip: 0 });
  b.box(cx, 5.3, cz, 11.1, 0.35, 8.6, C.flamingo, { p: P.NEON, e: 2.6, n: 0, skip: SKIP.NY | SKIP.PY });
  for (const dx of [-2.5, 2.5]) {
    b.box(cx + dx, 0.9, cz, 0.8, 1.4, 0.5, 0xe8e2ee);
    b.box(cx + dx, 1.3, cz + 0.26, 0.5, 0.4, 0.05, 0x3dd8e7, { p: P.LIGHT, e: 2 });
  }
  if (g) {
    g.add(GLOW.POOL, cx, 0.25, cz, 7.5, 6, 0, 0xe8f0ff, 0.42);
    for (const f of faces) { const [sx, sz] = onFace(f, 0, 2.5); g.add(GLOW.STREAK, sx, 0.05, sz, 2.5, 10, 0, 0xe8f0ff, 0.45); }
  }
  // kiosk in the back corner
  const kx = x1 - 3.2, kz = z1 - 3.2;
  b.box(kx, 1.8, kz, 5, 3.4, 5, 0xfff4e6, { ao: true, faces: { 2: { p: P.SHOP, q: 3 }, 32: { p: P.SHOP, q: 3 } } });
  prop.signBox(b, "kiosk", kx - 2.65, 3.1, kz, 0.2, 0.9, 1.8, 2, {});
  prop.billboard(b, g, x0 + 3, 7, z0 + 3, Math.PI / 4 + Math.PI, pick(rand, ADS), 6, 3);
}

/* Parking garage with open decks, parked cars and a big rooftop billboard. */
function garage(b, g, lot, rand) {
  const { x0, z0, x1, z1 } = lot;
  const faces = faceList(lot);
  const levels = 3 + Math.floor(rand() * 2);
  const col = 0xb3a7bc;
  for (let l = 0; l <= levels; l++) {
    const y = l * 3;
    b.box((x0 + x1) / 2, y + 0.3, (z0 + z1) / 2, x1 - x0, 0.6, z1 - z0, col, { ao: true, n: 0.2, topP: P.ROAD });
    if (l < levels) {
      for (const f of faces) {
        faceBox(b, f, 0, y + 1.25, f.len, 0.7, 0.3, -0.15, shade(col, 1.08), { n: 0.15 });
        faceBox(b, f, 0, y + 0.85, f.len, 0.08, 0.08, 0.05, l % 2 ? C.cyan : C.flamingo, { p: P.NEON, e: 2.5 });
      }
      for (let k = 0; k < 4; k++) if (rand() < 0.7) {
        const px = x0 + 3 + rand() * (x1 - x0 - 6), pz = z0 + 3 + rand() * (z1 - z0 - 6);
        b.box(px, y + 1.25, pz, 2.4, 1.1, 4.4, pick(rand, [0x19b8bc, 0xffe37c, 0xae86db, 0xe85a7a, 0xf2f0ea]), { n: 0.3 });
      }
      for (const [dx, dz] of [[x0 + 0.5, z0 + 0.5], [x1 - 0.5, z0 + 0.5], [x0 + 0.5, z1 - 0.5], [x1 - 0.5, z1 - 0.5]]) b.box(dx, y + 1.8, dz, 0.8, 2.4, 0.8, shade(col, 0.9));
    }
  }
  const f = faces[0];
  if (f) {
    const yaw = f.axis === "z" ? (f.nx > 0 ? Math.PI / 2 : -Math.PI / 2) : f.nz > 0 ? 0 : Math.PI;
    prop.billboard(b, g, (x0 + x1) / 2, levels * 3 + 1, (z0 + z1) / 2, yaw, pick(rand, ADS), 10, 5);
  }
}

function rooftopClutter(b, x0, z0, x1, z1, y, rand, n) {
  for (let k = 0; k < n; k++) {
    const x = x0 + 1 + rand() * Math.max(0.1, x1 - x0 - 2), z = z0 + 1 + rand() * Math.max(0.1, z1 - z0 - 2);
    const r = rand();
    if (r < 0.35) prop.acUnit(b, x, y, z);
    else if (r < 0.6) prop.waterTank(b, x, y, z);
    else if (r < 0.8) prop.dish(b, x, y, z, rand() * 6);
    else prop.antenna(b, x, y, z, 2.5 + rand() * 2);
  }
}

/* ---------------- Ambient movers (never interact with the simulation) ---------------- */
function moverCar(color) {
  const b = new VoxelBuilder(256);
  b.box(0, 0.62, 0, 2.3, 0.7, 4.6, color, { p: P.PAINT, n: 0.3 });
  b.box(0, 1.25, 0.3, 1.9, 0.6, 2.4, color, { faces: { 1: { p: P.GLASS }, 2: { p: P.GLASS }, 16: { p: P.GLASS }, 32: { p: P.GLASS } } });
  for (const s of [-1, 1]) {
    b.box(s * 0.75, 0.68, -2.32, 0.5, 0.2, 0.06, 0xfff3d6, { p: P.LIGHT, e: 5, n: 0 });
    b.box(s * 0.8, 0.7, 2.32, 0.5, 0.18, 0.06, 0xff2d4a, { p: P.LIGHT, e: 4, n: 0 });
    for (const z of [-1.5, 1.5]) b.box(s * 1.1, 0.42, z, 0.3, 0.84, 0.84, 0x15131c);
  }
  return new T.Mesh(b.geometry(), null);
}
function moverBoat(rand) {
  const b = new VoxelBuilder(512);
  const hull = pick(rand, [0xf4f1ec, 0xffe37c, 0xff5d95, 0x3dd8e7]);
  b.hexa([[-0.2, -0.3, -3], [0.2, -0.3, -3], [-0.3, 0.7, -3.6], [0.3, 0.7, -3.6], [-1.2, -0.4, 2.6], [1.2, -0.4, 2.6], [-1.4, 0.7, 2.6], [1.4, 0.7, 2.6]], hull, { n: 0.15 });
  b.box(0, 1.1, 0.6, 1.6, 0.8, 2.2, 0xf4f1ec, { faces: { 1: { p: P.GLASS }, 2: { p: P.GLASS }, 32: { p: P.GLASS } } });
  b.box(0, 1.65, 0.6, 0.15, 0.6, 0.15, 0xe8e6ee);
  b.box(0, 2.0, 0.6, 0.25, 0.25, 0.25, 0xffe0a0, { p: P.LIGHT, e: 5 });
  b.box(0, 0.35, 2.75, 1.0, 0.2, 0.3, 0xfff1d0, { p: P.LIGHT, e: 2 });
  return new T.Mesh(b.geometry(), null);
}

/* ---------------- District 0: waterfront ---------------- */
function yacht(b, x, z, yaw, len, rand) {
  const prevYaw = b.oyaw, pox = b.ox, poz = b.oz;
  b.frame(b.ox + x, b.oy, b.oz + z, yaw);
  const L = len / 2, W = len * 0.17;
  b.hexa([[-0.2, -0.4, -L], [0.2, -0.4, -L], [-0.3, 1.2, -L - 0.8], [0.3, 1.2, -L - 0.8], [-W * 0.6, -0.6, L], [W * 0.6, -0.6, L], [-W, 0.9, L], [W, 0.9, L]], 0xf4f1ec, { n: 0.15 });
  b.box(0, 0.35, 0, W * 2 + 0.02, 0.18, len * 0.85, 0x1f6fb3, { n: 0.1 });
  b.box(0, 0.95, L * 0.15, W * 1.8, 0.12, len * 0.7, 0xa0663f, { p: P.WOOD });
  b.box(0, 1.65, L * 0.2, W * 1.3, 1.3, len * 0.42, 0xf4f1ec, { faces: { 1: { p: P.GLASS }, 2: { p: P.GLASS }, 32: { p: P.GLASS } } });
  b.box(0, 2.55, L * 0.25, W * 1.0, 0.6, len * 0.26, 0xf4f1ec, { faces: { 1: { p: P.GLASS }, 2: { p: P.GLASS } } });
  for (let k = -2; k <= 2; k++) b.box(W + 0.01, 0.75, k * len * 0.12, 0.05, 0.16, 0.25, 0xffe0a0, { p: P.LIGHT, e: 3 });
  for (let k = -2; k <= 2; k++) b.box(-W - 0.01, 0.75, k * len * 0.12, 0.05, 0.16, 0.25, 0xffe0a0, { p: P.LIGHT, e: 3 });
  b.box(0, 3.4, L * 0.3, 0.1, 1.4, 0.1, 0xe8e6ee);
  b.box(0, 4.15, L * 0.3, 0.2, 0.2, 0.2, 0x5dffb0, { p: P.NEON, e: 4, q: 24 });
  b.frame(pox, b.oy, poz, prevYaw);
}
function waterfront(b, g, rand, i, j, animated, coast = false) {
  const vr = rand();
  const variant = coast ? (vr < 0.45 ? 4 : vr < 0.75 ? 0 : vr < 0.88 ? 1 : 3) : Math.floor(vr * 5);
  const water = 0x0f5f78;
  const inner0 = CB, inner1 = CE;
  // railings + bollards + lamps along the promenade (sea wall at collider edge)
  const edges = [
    [CB, CB, CB, CE], [CE, CB, CE, CE], [CB, CB, CE, CB], [CB, CE, CE, CE],
  ];
  for (const [ax, az, bx, bz] of edges) prop.railing(b, ax, az, bx, bz, 0.2, 0xf4ece4);
  const fill = (y, color, p) => b.flat(MID, y, MID, inner1 - inner0, inner1 - inner0, color, { p, n: 0.2 });
  if (variant === 4) {
    // open bay: clear water view, a pier with a striped lighthouse and boats cruising
    fill(-0.32, water, P.WATER);
    const pz = MID + (rand() - 0.5) * 10;
    b.box(MID + 4, -0.2, pz, 18, 0.25, 2.4, 0xa0663f, { p: P.WOOD, n: 0.3 });
    for (let x = MID - 4; x <= MID + 12; x += 3) for (const s of [-1, 1]) b.box(x, -0.6, pz + s * 1.15, 0.3, 1.0, 0.3, 0x6b4a3a);
    for (const s of [-1, 1]) prop.railing(b, MID - 5, pz + s * 1.15, MID + 13, pz + s * 1.15, -0.1, 0xf4ece4);
    const lx = CE - 3.2, lz = pz;
    for (let k = 0; k < 6; k++) b.box(lx, 0.2 + k * 1.1 + 0.55, lz, 2 - k * 0.12, 1.1, 2 - k * 0.12, k % 2 ? 0xfff4e6 : 0xe23b4c, { n: 0.2, ao: k === 0 });
    b.box(lx, 7.4, lz, 1.4, 1.2, 1.4, 0xfff1c0, { p: P.LIGHT, e: 6 });
    b.box(lx, 8.2, lz, 1.7, 0.4, 1.7, 0x2a2340);
    if (g) { g.add(GLOW.HALO, lx, 7.4, lz, 4, 0, 0, 0xfff1c0, 0.35); g.add(GLOW.STREAK, lx - 6, 0.05, lz, 2, 14, 0, 0xfff1c0, 0.4); }
    for (let k = 0; k < 3; k++) {
      const boat = moverBoat(rand);
      const lane = inner0 + 4 + k * 8 + rand() * 2, phase = rand() * 6, spd = 0.12 + rand() * 0.1, dir = k % 2 ? 1 : -1;
      boat.userData.update = (t) => {
        const u = Math.sin(t * spd + phase);
        boat.position.set(MID + u * 9, -0.2 + Math.sin(t * 1.7 + phase) * 0.08, lane);
        boat.rotation.y = (Math.cos(t * spd + phase) * dir > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.sin(t * 1.3 + phase) * 0.04;
      };
      boat.userData.update(0);
      animated.push(boat);
    }
    for (let k = 0; k < 4; k++) b.box(inner0 + 2 + rand() * 25, -0.55, inner0 + 2 + rand() * 25, 0.45, 0.45, 0.45, k % 2 ? 0xff6b2c : 0xfff4e6);
  } else if (variant === 0 || variant === 3) {
    fill(-0.32, water, P.WATER);
    // docks
    const dz = MID + (rand() - 0.5) * 6;
    b.box(MID - 2, -0.2, dz, inner1 - inner0 - 6, 0.25, 2.2, 0xa0663f, { p: P.WOOD, n: 0.3 });
    for (let x = inner0 + 4; x < inner1 - 4; x += 3) b.box(x, -0.6, dz + 1.15, 0.3, 1.0, 0.3, 0x6b4a3a);
    yacht(b, MID - 3, dz - 5, Math.PI / 2 + (rand() - 0.5) * 0.2, 11 + rand() * 3, rand);
    yacht(b, MID + 2, dz + 5.4, -Math.PI / 2 + (rand() - 0.5) * 0.2, 8 + rand() * 3, rand);
    if (rand() < 0.6) yacht(b, MID + 9, MID - 9, Math.PI * 0.1, 7, rand);
    for (let k = 0; k < 5; k++) b.box(inner0 + 2 + rand() * 25, -0.55, inner0 + 2 + rand() * 25, 0.45, 0.45, 0.45, k % 2 ? 0xff6b2c : 0xfff4e6);
    if (variant === 3) ferrisWheel(b, g, rand, animated);
  } else if (variant === 1) {
    // beach + shallow water
    const split = MID + 2;
    b.flat(MID, -0.32, (split + inner1) / 2, inner1 - inner0, inner1 - split, water, { p: P.WATER });
    b.box(MID, -0.25, (inner0 + split) / 2, inner1 - inner0, 1.0, split - inner0, 0xf3cf9b, { topP: P.SAND, n: 0.4, skip: SKIP.NY });
    b.box(MID, -0.62, split + 1, inner1 - inner0, 0.3, 2, 0xd8b383, { p: P.SAND });
    for (let k = 0; k < 5; k++) {
      const x = inner0 + 3 + k * 5.5, z = inner0 + 4 + rand() * 6;
      prop.umbrella(b, x, z, pick(rand, [C.flamingo, C.sea, 0xffe37c, 0xff8a3d]), 0.25, 2.4);
      b.box(x + 1.2, 0.45, z + 0.4, 0.9, 0.18, 2, 0xf4f1ec);
      if (rand() < 0.6) prop.person(b, x - 1.3, z + 1.2, rand() * 6, rand);
    }
    // lifeguard tower
    const lx = inner1 - 5, lz = split - 1.5;
    for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) b.box(lx + dx, 1.5, lz + dz, 0.2, 3, 0.2, 0xf4ece4);
    b.box(lx, 3.6, lz, 2.6, 1.6, 2.6, 0x3dd8e7, { faces: { 32: { p: P.GLASS }, 16: { p: P.GLASS } } });
    b.box(lx, 4.55, lz, 3, 0.3, 3, C.flamingo);
    // beach bar
    const bx = inner0 + 4, bz = inner0 + 3.5;
    b.box(bx, 1.3, bz, 5, 2.6, 3.4, 0xa0663f, { p: P.WOOD, ao: true });
    b.box(bx, 2.9, bz, 6, 0.5, 4.4, 0xe0b46a, { p: P.LEAF, n: 0.6 });
    prop.signBox(b, "surf", bx, 3.5, bz - 2.25, 3, 0.9, 0.2, 32, {});
    prop.stringLights(b, bx - 3, 3, bz + 2.2, bx + 8, 3, bz + 4, 0.6);
    for (let k = 0; k < 3; k++) prop.palm(b, inner0 + 8 + k * 8 + rand() * 2, inner0 + 2 + rand() * 4, rand, { y: 0.25 });
  } else {
    // waterfront park with fountain and gazebo
    b.box(MID, 0.1, MID, inner1 - inner0, 0.2, inner1 - inner0, 0x3f9e4c, { topP: P.GRASS, n: 0.6 });
    b.flat(MID, 0.21, MID, 2.4, inner1 - inner0, 0xc9b4c4, { p: P.TILE, q: 1 });
    b.flat(MID, 0.21, MID, inner1 - inner0, 2.4, 0xc9b4c4, { p: P.TILE, q: 1 });
    // fountain
    b.box(MID, 0.5, MID, 6, 0.6, 6, 0xe8dccf, { ao: true });
    b.flat(MID, 0.78, MID, 5.2, 5.2, 0x2fa6c4, { p: P.WATER });
    b.box(MID, 1.5, MID, 1, 2, 1, 0xe8dccf);
    b.box(MID, 2.8, MID, 0.5, 1.4, 0.5, 0x8ff3ff, { p: P.LIGHT, e: 2.2 });
    if (g) g.add(GLOW.HALO, MID, 2.4, MID, 3, 0, 0, C.cyan, 0.25);
    for (let k = 0; k < 6; k++) prop.palm(b, inner0 + 3 + rand() * 23, inner0 + 3 + rand() * 23, rand, { y: 0.2 });
    for (let k = 0; k < 6; k++) prop.bush(b, inner0 + 2 + rand() * 25, inner0 + 2 + rand() * 25, 0.8 + rand() * 0.6, rand() < 0.3 ? 0xd35d9a : 0x3f9e4c);
    for (let k = 0; k < 7; k++) prop.person(b, MID + (rand() - 0.5) * 2, inner0 + 2 + rand() * 25, rand() * 6, rand);
    // gazebo
    const gx = inner1 - 6, gz = inner0 + 6;
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) b.box(gx + dx, 1.5, gz + dz, 0.25, 3, 0.25, 0xfff4e6);
    b.hexa([[gx - 2.6, 3, gz - 2.6], [gx + 2.6, 3, gz - 2.6], [gx - 0.2, 4.4, gz - 0.2], [gx + 0.2, 4.4, gz - 0.2], [gx - 2.6, 3, gz + 2.6], [gx + 2.6, 3, gz + 2.6], [gx - 0.2, 4.4, gz + 0.2], [gx + 0.2, 4.4, gz + 0.2]], C.flamingo, { n: 0.2 });
    prop.stringLights(b, gx - 2.6, 3, gz - 2.6, gx + 2.6, 3, gz + 2.6, 0.4);
    prop.stringLights(b, gx + 2.6, 3, gz - 2.6, gx - 2.6, 3, gz + 2.6, 0.4);
  }
}
function ferrisWheel(b, g, rand, animated) {
  const wb = new VoxelBuilder(4096);
  const R = 10.5, cx = MID + 4, cz = MID + 3, cy = 13;
  // support legs (static)
  for (const s of [-1, 1]) for (const d of [-1, 1]) {
    const lx = cx + s * 1.6, lz = cz + d * 5;
    b.hexa([[lx - 0.3, -0.7, lz - 0.3], [lx + 0.3, -0.7, lz - 0.3], [cx + s * 1.6 - 0.2, cy, cz - 0.2], [cx + s * 1.6 + 0.2, cy, cz - 0.2], [lx - 0.3, -0.7, lz + 0.3], [lx + 0.3, -0.7, lz + 0.3], [cx + s * 1.6 - 0.2, cy, cz + 0.2], [cx + s * 1.6 + 0.2, cy, cz + 0.2]], 0xe8e2ee, { n: 0.1 });
  }
  b.box(cx, -0.25, cz, 8, 0.6, 14, 0xa0663f, { p: P.WOOD });
  b.box(cx, cy, cz, 3.6, 0.6, 0.6, 0xe8e2ee);
  // wheel (local: plane YZ, rotate around X)
  const N = 28;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2, a2 = ((k + 1) / N) * Math.PI * 2;
    const y1 = Math.sin(a) * R, z1 = Math.cos(a) * R, y2 = Math.sin(a2) * R, z2 = Math.cos(a2) * R;
    const segLen = Math.hypot(y2 - y1, z2 - z1);
    const rot = Math.atan2(y2 - y1, z2 - z1);
    for (const sx of [-0.7, 0.7]) wb.box(sx, (y1 + y2) / 2, (z1 + z2) / 2, 0.18, 0.18, segLen + 0.1, k % 2 ? C.flamingo : C.cyan, { rx: -rot, p: P.NEON, e: 3.5, n: 0 });
    if (k % 2 === 0) {
      wb.box(0, Math.sin(a) * R * 0.5, Math.cos(a) * R * 0.5, 0.1, 0.1, R, 0xfff4e6, { rx: -a, n: 0, p: P.NEON, e: 1.2 });
      wb.box(0, y1 - 0.9, z1, 1.2, 1.1, 1.0, pick(rand, [0xffe37c, 0xff5d95, 0x3dd8e7, 0xc77dff]), { n: 0.2 });
    }
  }
  wb.box(0, 0, 0, 1.6, 1.2, 1.2, 0xffe37c, { p: P.LIGHT, e: 3 });
  const wheel = new T.Mesh(wb.geometry(), null);
  wheel.position.set(cx, cy, cz);
  wheel.userData.spin = 0.18;
  animated.push(wheel);
  if (g) {
    g.add(GLOW.HALO, cx, cy, cz, 12, 0, 0, C.flamingo, 0.07);
    g.add(GLOW.STREAK, cx - 12, 0.05, cz, 4, 20, 0, C.flamingo, 0.35);
  }
}

/* ---------------- District 2 extra: elevated highway overpass ---------------- */
function overpass(b, g, rand, animated) {
  const z = MID + (rand() < 0.5 ? -4 : 4), y = 12.6, w = 7;
  // abutment towers inside both footprints
  for (const s of [-1, 1]) {
    b.box(s * 13.2, y / 2, z, 3, y + 1.4, w + 1, 0x8e86a3, { ao: true, n: 0.3, top: 0x5a5068 });
    b.box(s * 13.2 - s * 1.52, y / 2, z, 0.1, y - 1, 0.18, C.cyan, { p: P.NEON, e: 2.5 });
  }
  b.box(0, y, z, 30, 1.4, w, 0x9a90ad, { n: 0.25, top: 0x3a3048, faces: { 8: { color: 0x5b5270 } }, skip: 0 });
  b.box(0, y - 0.78, z - w / 2 + 0.05, 30, 0.12, 0.12, C.flamingo, { p: P.NEON, e: 3.5, n: 0 });
  b.box(0, y - 0.78, z + w / 2 - 0.05, 30, 0.12, 0.12, C.cyan, { p: P.NEON, e: 3.5, n: 0 });
  for (const s of [-1, 1]) b.box(0, y + 1.1, z + s * (w / 2 - 0.15), 30, 0.8, 0.3, 0xe6dfee, { n: 0.15 });
  // under-deck lights
  for (let x = -7.5; x <= 7.5; x += 5) {
    b.box(x, y - 0.75, z, 0.8, 0.1, 0.8, 0xfff1d0, { p: P.LIGHT, e: 4 });
    if (g) g.add(GLOW.POOL, x, 0.06, z, 3.2, 3.2, 0, 0xffe0b0, 0.25);
  }
  // ambient traffic crossing the deck (purely decorative, high above the playable road)
  for (let k = 0; k < 3; k++) {
    const car = moverCar(pick(rand, [0x19b8bc, 0xffe37c, 0xff5d95, 0xf2f0ea, 0x8d54e9]));
    const dir = k % 2 ? 1 : -1, lane = z + (dir > 0 ? 1.6 : -1.6), off = rand() * 30, spd = 9 + rand() * 4;
    car.userData.update = (t) => {
      const u = ((t * spd + off) % 34) - 17;
      car.position.set(u * dir, y + 0.7, lane);
      car.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      car.visible = Math.abs(u) < 15.5;
    };
    car.userData.update(0);
    animated.push(car);
  }
  // highway sign hanging under deck facing both ways
  prop.signBox(b, "exit", -3.5, y - 1.7, z - w / 2 - 0.1, 5.2, 1.7, 0.2, 32, { frame: 0x0f6b4d, e: 1.6 });
  prop.signBox(b, "beach", 3.5, y - 1.7, z + w / 2 + 0.1, 5.2, 1.7, 0.2, 16, { frame: 0x0f6b4d, e: 1.6 });
  // deck lamps
  for (const x of [-10, 0, 10]) {
    b.box(x, y + 2.4, z - w / 2 + 0.3, 0.16, 2.6, 0.16, 0x4a4560);
    b.box(x, y + 3.8, z - w / 2 + 0.3, 0.5, 0.3, 0.5, 0xffd9a0, { p: P.LIGHT, e: 4 });
    if (g) g.add(GLOW.HALO, x, y + 3.8, z - w / 2 + 0.3, 1.2, 0, 0, 0xffd9a0, 0.4);
  }
}

/* Neon welcome arch spanning the boulevard (pylons stand inside both footprints). */
function welcomeArch(b, g, alongZ, at, rand) {
  const H = 12.6, x = 13.1;
  const frame = (fx, fz) => (alongZ ? [fx, fz] : [fz, fx]);
  for (const s of [-1, 1]) {
    const [px, pz] = frame(s * x, at);
    b.box(px, H / 2, pz, 1.4, H, 1.4, 0xf4ece4, { ao: true, n: 0.15 });
    b.box(px, H / 2, pz, 1.5, 0.3, 1.5, 0xff5d95, { p: P.NEON, e: 3 });
    b.box(px, 1.2, pz, 2, 2.4, 2, 0xd9c2d2, { ao: true });
    prop.palm(b, px + (alongZ ? s * 1.6 : 0), pz + (alongZ ? 0 : s * 1.6), rand, { kind: 0, h: 7, y: 0.2 });
  }
  const [cx, cz] = frame(0, at);
  const w = x * 2 + 1.4;
  b.box(cx, H + 0.9, cz, alongZ ? w : 1.2, 1.8, alongZ ? 1.2 : w, 0x2a1840, { n: 0.2 });
  for (const dy of [-0.05, 1.85]) b.box(cx, H + dy, cz, alongZ ? w : 1.3, 0.16, alongZ ? 1.3 : w, dy < 0 ? C.cyan : C.flamingo, { p: P.NEON, e: 3.6, n: 0, q: 3 });
  const fa = rand() < 0.5;
  const sw = fa ? 9 : 12, sh = sw / (fa ? 4 : 5.33);
  if (alongZ) prop.signBox(b, fa ? "welcomeFa" : "welcome", cx, H + 0.9, cz, sw, sh, 1.3, [16, 32], { e: 3.6 });
  else prop.signBox(b, fa ? "welcomeFa" : "welcome", cx, H + 0.9, cz, 1.3, sh, sw, [1, 2], { e: 3.6 });
  if (g) {
    g.add(GLOW.HALO, cx, H + 1, cz, 9, 0, 0, C.flamingo, 0.12);
    const [sx, sz] = frame(0, at + 3);
    g.add(GLOW.STREAK, sx, 0.05, sz, 4, 18, 0, C.flamingo, 0.4);
  }
}
function overheadLights(b, alongZ, at) {
  const f = (a, c) => (alongZ ? [a, c] : [c, a]);
  const [x0, z0] = f(-11.1, at), [x1, z1] = f(11.1, at + 0.01);
  prop.stringLights(b, x0, 11.8, z0, x1, 11.8, z1, 1.6, [0xffe37c, 0xff5d95, 0x3dd8e7, 0xc77dff]);
}

/* ---------------- Sidewalk dressing ---------------- */
function dressSidewalks(b, g, area, rand, net, i, j) {
  // Four sidewalk strips around the block; props hug the footprint edge, only along open streets.
  const edge = 11.1;
  const strips = [
    { x: edge, z: null, dir: [-1, 0], st: net.seg(0, i, j) },
    { x: TILE - edge, z: null, dir: [1, 0], st: net.seg(0, i + 1, j) },
    { x: null, z: edge, dir: [0, -1], st: net.seg(1, i, j) },
    { x: null, z: TILE - edge, dir: [0, 1], st: net.seg(1, i, j + 1) },
  ];
  let lampToggle = 0;
  for (const s of strips) {
    if (s.st === SEG.NONE) continue;
    const along = (t) => (s.x !== null ? [s.x, t] : [t, s.z]);
    let ranges = area === 3 ? [[14, 20.5], [31.5, 38]] : [[14, 38]];
    if (s.st === SEG.STUB_START) ranges = [[14, STUB * TILE - 2]];
    else if (s.st === SEG.STUB_END) ranges = [[TILE - STUB * TILE + 2, 38]];
    for (const [a, bnd] of ranges) {
      let t = a + rand() * 1.5;
      while (t < bnd) {
        const [x, z] = along(t);
        const r = rand();
        if (lampToggle++ % 2 === 0) {
          if (area === 1 || area === 2) prop.lampArm(b, g, x, z, s.dir[0], s.dir[1]);
          else prop.lampClassic(b, g, x, z);
        } else if (r < (area === 1 ? 0.4 : 0.8)) {
          prop.palm(b, x, z, rand, { kind: area === 0 ? (rand() < 0.5 ? 0 : 2) : undefined, y: 0.2 });
          if (rand() < 0.45 && g) {
            b.box(x + 0.45, 0.28, z + 0.45, 0.3, 0.16, 0.3, 0xfff1d0, { p: P.LIGHT, e: 3 });
            g.add(GLOW.POOL, x, 0.24, z, 1.6, 1.6, 0, 0xffd27a, 0.35);
          }
        } else if (r < 0.9) prop.planter(b, x, z, 1.4, 1.4, pick(rand, [0xff5d95, 0xffe37c, 0xc77dff, 0]));
        else prop.bush(b, x, z, 0.9);
        // small items between
        const tt = t + 3 + rand() * 1.5;
        if (tt < bnd) {
          const [ix, iz] = along(tt);
          const q = rand();
          const yaw = s.x !== null ? (s.dir[0] < 0 ? Math.PI / 2 : -Math.PI / 2) : s.dir[1] < 0 ? 0 : Math.PI;
          if (q < 0.3) prop.bench(b, ix, iz, yaw);
          else if (q < 0.45) prop.bin(b, ix, iz);
          else if (q < 0.55) prop.hydrant(b, ix, iz);
          else if (q < 0.62 && area !== 0) prop.busStop(b, g, ix, iz, yaw, pick(rand, ADS));
          else if (q < 0.75 && area === 0) prop.bollard(b, ix, iz);
        }
        t += 6.5 + rand() * 2.5;
      }
    }
  }
  // traffic lights only where streets really cross (local 0,0)
  if (net.degree(i, j) >= 3) {
    const t = net.touches(i, j);
    if (t.px || t.py) prop.trafficLight(b, 10.5, 10.5, -1, 0, 0);
    if (t.nx || t.ny) prop.trafficLight(b, -10.5, -10.5, 1, 0, 0);
    if (t.nx || t.py) prop.trafficLight(b, -10.5, 10.5, 0, -1, 1);
    if (t.px || t.ny) prop.trafficLight(b, 10.5, -10.5, 0, 1, 1);
  }
}

/* ---------------- Lots per district ---------------- */
function lotsFor(rand) {
  const g = 0.25;
  const L = CB, R = CE, M = (CB + CE) / 2;
  const v = rand();
  if (v < 0.4) return [
    { x0: L, z0: L, x1: M - g, z1: M - g, street: { nx: 1, nz: 1 } },
    { x0: M + g, z0: L, x1: R, z1: M - g, street: { px: 1, nz: 1 } },
    { x0: L, z0: M + g, x1: M - g, z1: R, street: { nx: 1, pz: 1 } },
    { x0: M + g, z0: M + g, x1: R, z1: R, street: { px: 1, pz: 1 } },
  ];
  if (v < 0.7) return [
    { x0: L, z0: L, x1: M - g, z1: R, street: { nx: 1, nz: 1, pz: 1 } },
    { x0: M + g, z0: L, x1: R, z1: M - g, street: { px: 1, nz: 1 } },
    { x0: M + g, z0: M + g, x1: R, z1: R, street: { px: 1, pz: 1 } },
  ];
  return [
    { x0: L, z0: L, x1: R, z1: M - g, street: { nx: 1, px: 1, nz: 1 } },
    { x0: L, z0: M + g, x1: M - g, z1: R, street: { nx: 1, pz: 1 } },
    { x0: M + g, z0: M + g, x1: R, z1: R, street: { px: 1, pz: 1 } },
  ];
}
function infill(b, lot) {
  // Hidden courtyard fill so the footprint reads solid from the air.
  b.box((lot.x0 + lot.x1) / 2, 1, (lot.z0 + lot.z1) / 2, lot.x1 - lot.x0, 2, lot.z1 - lot.z0, 0x4a3f5c, { n: 0.2 });
}

/** Build one city tile. Returns { object, animated }. */
export function buildChunk(seed, i, j, mats) {
  const rand = rng(seed + "/" + i + "/" + j);
  const simArea = district(i, j);
  // Visual theme. Footprints of districts 0-2 are identical in the simulation, so the east side of
  // the starting boulevard becomes a continuous coastline (Ocean Drive) and the west side hotels.
  const coast = simArea !== 3 && i === 0 && j <= 0;
  const area = coast ? 0 : simArea === 0 && i === -1 && j <= 0 ? 1 : simArea;
  const net = cityMap(seed);
  const vOpen = net.seg(0, i, j) === SEG.FULL, hOpen = net.seg(1, i, j) === SEG.FULL;
  const sides = { nx: net.seg(0, i, j), px: net.seg(0, i + 1, j), nz: net.seg(1, i, j), pz: net.seg(1, i, j + 1) };
  const b = new VoxelBuilder(16384);
  const g = new GlowBuilder(240);
  const animated = [];
  ground(b, g, area, rand, net, i, j);
  dressSidewalks(b, g, area, rand, net, i, j);
  if (area === 0 || area === 3) {
    const r1 = rand(), r2 = rand(), r3 = rand(), r4 = rand();
    if (vOpen && r1 < 0.3) welcomeArch(b, g, true, MID + (r2 < 0.5 ? -8 : 8), rand);
    else if (vOpen && r3 < 0.5) for (const at of [16, 36]) overheadLights(b, true, at);
    if (hOpen && r4 < 0.35) for (const at of [16, 36]) overheadLights(b, false, at);
  }
  if (area === 0) waterfront(b, g, rand, i, j, animated, coast);
  else if (area === 3) {
    const lo = [CB, MID + 4], size = 10.6;
    for (const x0 of lo) for (const z0 of lo) shopHouse(b, g, { x0, z0, x1: x0 + size, z1: z0 + size, street: { px: 1, nx: 1, pz: 1, nz: 1 } }, rand);
    // string lights across the alleys
    prop.stringLights(b, MID - 4, 5.2, CB + 2, MID + 4, 5.2, CB + 4, 0.7);
    prop.stringLights(b, MID - 4, 5.2, CE - 4, MID + 4, 5.2, CE - 2, 0.7);
    prop.stringLights(b, CB + 3, 5.2, MID - 4, CB + 5, 5.2, MID + 4, 0.7);
    prop.stringLights(b, CE - 5, 5.2, MID - 4, CE - 3, 5.2, MID + 4, 0.7);
  } else {
    const lots = lotsFor(rand);
    for (const lot of lots) {
      // faces toward a closed street become plain walls (no shopfronts into a park or plaza)
      for (const k of ["nx", "px", "nz", "pz"]) if (lot.street[k] && sides[k] === SEG.NONE) delete lot.street[k];
      const big = Math.min(lot.x1 - lot.x0, lot.z1 - lot.z0) > 13;
      const r = rand();
      if (area === 1) {
        if (r < 0.42 && big) glassTower(b, g, lot, rand);
        else if (r < 0.75) decoHotel(b, g, lot, rand, 5 + Math.floor(rand() * 6));
        else apartment(b, g, lot, rand, 4 + Math.floor(rand() * 5));
      } else {
        if (r < 0.2) motel(b, g, lot, rand);
        else if (r < 0.34 && big) gasStation(b, g, lot, rand);
        else if (r < 0.48 && big) garage(b, g, lot, rand);
        else if (r < 0.8) decoHotel(b, g, lot, rand, 2 + Math.floor(rand() * 3));
        else apartment(b, g, lot, rand, 2 + Math.floor(rand() * 3));
      }
      if (lot.x1 - lot.x0 < 29 || lot.z1 - lot.z0 < 29) infill(b, { x0: lot.x0 + 0.5, z0: lot.z0 + 0.5, x1: lot.x1 - 0.5, z1: lot.z1 - 0.5 });
    }
    if (area === 2 && vOpen) overpass(b, g, rand, animated);
    else if (rand() < 0.5) prop.billboard(b, g, CB + 2, 0.1, CB + 2, Math.PI * 1.25, pick(rand, ADS), 6, 3);
  }
  const object = new T.Group();
  const mesh = new T.Mesh(b.geometry(), mats.city);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  object.add(mesh);
  for (const a of animated) {
    a.material = mats.city;
    a.castShadow = true;
    object.add(a);
  }
  if (g.count) object.add(g.mesh(mats.glow));
  object.position.set(i * TILE, 0, j * TILE);
  return { object, animated, area };
}

export function disposeChunk(chunk) {
  chunk.object.traverse((o) => o.geometry?.dispose());
}
