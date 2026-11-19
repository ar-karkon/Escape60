import * as T from "../../vendor/three.js";
import { VoxelBuilder, P, SKIP, shade } from "./voxel.js";
import { atlasRects } from "./signs.js";
import { C } from "./palette.js";

/* Vehicles face local -z. 1 world unit = 10 simulation units. */
const DARK = 0x1b1726, TRIM = 0x2b2638, CHROME = 0xd8d8e6;

function hexaBox(b, x0, x1, yb, z0, z1, ytF, ytB, inset, color, o) {
  // Box whose top slopes from front (z0) height ytF to back (z1) ytB, top narrowed by inset.
  b.hexa(
    [
      [x0, yb, z0], [x1, yb, z0], [x0 + inset, ytF, z0], [x1 - inset, ytF, z0],
      [x0, yb, z1], [x1, yb, z1], [x0 + inset, ytB, z1], [x1 - inset, ytB, z1],
    ],
    color,
    o,
  );
}
function cabin(b, hw, yb, yt, zfB, zfT, zbT, zbB, topInset, color, glassOpts = {}) {
  // Greenhouse with sloped windshield and rear glass; glass on all four sides, painted roof.
  b.hexa(
    [
      [-hw, yb, zfB], [hw, yb, zfB], [-hw + topInset, yt, zfT], [hw - topInset, yt, zfT],
      [-hw, yb, zbB], [hw, yb, zbB], [-hw + topInset, yt, zbT], [hw - topInset, yt, zbT],
    ],
    color,
    { p: P.PAINT, n: 0.25, faces: { 1: { p: P.GLASS, q: 1 }, 2: { p: P.GLASS, q: 2 }, 16: { p: P.GLASS, q: 3 }, 32: { p: P.GLASS, q: 4 } }, ...glassOpts },
  );
  // pillars (A + C) as thin painted strips at the corners
  for (const s of [-1, 1]) {
    b.hexa(
      [
        [s < 0 ? -hw - 0.01 : hw - 0.09, yb, zfB - 0.02], [s < 0 ? -hw + 0.09 : hw + 0.01, yb, zfB - 0.02],
        [s < 0 ? -hw + topInset - 0.01 : hw - topInset - 0.09, yt, zfT - 0.02], [s < 0 ? -hw + topInset + 0.09 : hw - topInset + 0.01, yt, zfT - 0.02],
        [s < 0 ? -hw - 0.01 : hw - 0.09, yb, zfB + 0.14], [s < 0 ? -hw + 0.09 : hw + 0.01, yb, zfB + 0.14],
        [s < 0 ? -hw + topInset - 0.01 : hw - topInset - 0.09, yt, zfT + 0.14], [s < 0 ? -hw + topInset + 0.09 : hw - topInset + 0.01, yt, zfT + 0.14],
      ],
      color,
      { p: P.PAINT, n: 0.2 },
    );
  }
}

/** Orange hero muscle coupe with cream racing stripes. */
export function heroBody() {
  const b = new VoxelBuilder(2048);
  const body = C.hero, low = shade(C.hero, 0.86), stripe = 0xfff1de;
  const paint = { p: P.PAINT, n: 0.3 };
  // chassis + lower body
  b.box(0, 0.62, 0.05, 2.62, 0.62, 5.3, body, paint);
  b.box(0, 0.36, 0, 2.5, 0.16, 5.2, DARK, { n: 0.1 });
  // fender flares (muscle stance)
  for (const s of [-1, 1]) {
    b.box(s * 1.33, 0.82, -1.72, 0.14, 0.42, 1.5, low, paint);
    b.box(s * 1.36, 0.84, 1.72, 0.18, 0.46, 1.6, low, paint);
    b.box(s * 1.29, 0.42, 0, 0.12, 0.16, 1.9, TRIM); // skirt
    b.box(s * 1.315, 0.8, -0.05, 0.02, 0.44, 0.05, shade(body, 0.6)); // door seam
    b.box(s * 1.315, 0.95, 0.35, 0.03, 0.06, 0.32, CHROME, { p: P.CHROME }); // handle
    b.box(s * 1.33, 0.7, 0.75, 0.04, 0.16, 0.7, DARK); // side intake
    // wheel wells
    b.box(s * 1.18, 0.56, -1.72, 0.32, 0.72, 1.18, 0x0e0c14, { n: 0 });
    b.box(s * 1.18, 0.56, 1.72, 0.32, 0.72, 1.18, 0x0e0c14, { n: 0 });
    // mirrors
    b.box(s * 1.38, 1.3, -0.62, 0.24, 0.16, 0.28, body, paint);
  }
  // hood with bulge, sloping to the nose
  hexaBox(b, -1.28, 1.28, 0.92, -2.72, -0.82, 1.04, 1.18, 0.06, body, paint);
  b.box(0, 1.2, -1.55, 0.92, 0.1, 1.3, body, paint);
  b.box(0, 1.24, -1.25, 0.6, 0.04, 0.3, DARK);
  // trunk deck
  hexaBox(b, -1.28, 1.28, 0.92, 1.42, 2.74, 1.16, 1.1, 0.06, body, paint);
  // cabin
  cabin(b, 1.2, 1.12, 1.84, -0.84, -0.12, 0.92, 1.46, 0.2, body);
  b.box(0, 1.875, 0.4, 1.86, 0.07, 1.0, body, paint);
  // racing stripes (hood, roof, trunk, spoiler)
  for (const s of [-1, 1]) {
    const x = s * 0.33;
    hexaBox(b, x - 0.17, x + 0.17, 1.03, -2.73, -0.8, 1.06, 1.2, 0, stripe, { n: 0.15, skip: SKIP.NY | SKIP.PZ });
    b.box(x, 1.915, 0.4, 0.34, 0.02, 1.0, stripe, { n: 0.1 });
    hexaBox(b, x - 0.17, x + 0.17, 1.1, 1.44, 2.75, 1.18, 1.12, 0, stripe, { n: 0.15, skip: SKIP.NY | SKIP.NZ });
  }
  // nose: grille, headlights, bumper, splitter
  b.box(0, 0.62, -2.71, 2.56, 0.42, 0.24, TRIM, { n: 0.1 });
  b.box(0, 0.8, -2.75, 1.25, 0.3, 0.08, 0x0b0910, { n: 0 });
  for (const y of [0.74, 0.86]) b.box(0, y, -2.79, 1.15, 0.03, 0.03, CHROME, { p: P.CHROME });
  for (const s of [-1, 1]) {
    b.box(s * 0.92, 0.83, -2.75, 0.5, 0.24, 0.1, 0xfff6dc, { p: P.LIGHT, e: 3.2, n: 0 });
    b.box(s * 0.92, 0.83, -2.73, 0.6, 0.32, 0.06, CHROME, { p: P.CHROME });
    b.box(s * 1.2, 0.6, -2.76, 0.18, 0.1, 0.06, 0xffb347, { p: P.LIGHT, e: 3, n: 0 });
  }
  b.box(0, 0.3, -2.86, 2.4, 0.06, 0.28, DARK, { n: 0 });
  // rear: tail lights, bumper, exhaust, plate
  b.box(0, 0.86, 2.76, 2.44, 0.26, 0.1, 0x2a0710, { n: 0 });
  for (const s of [-1, 1]) {
    b.box(s * 0.85, 0.86, 2.82, 0.6, 0.18, 0.04, 0xff2d4a, { p: P.LIGHT, e: 4.5, n: 0 });
    b.box(s * 0.3, 0.86, 2.82, 0.22, 0.12, 0.04, 0xff6b80, { p: P.LIGHT, e: 2.5, n: 0 });
    b.box(s * 0.58, 0.36, 2.83, 0.22, 0.18, 0.22, CHROME, { p: P.CHROME });
    b.box(s * 0.58, 0.36, 2.94, 0.14, 0.1, 0.02, 0x0b0910);
  }
  b.box(0, 0.5, 2.72, 2.56, 0.34, 0.22, TRIM);
  b.box(0, 0.62, 2.84, 0.62, 0.2, 0.03, 0xf4f1ea);
  // spoiler
  for (const s of [-1, 1]) b.box(s * 0.82, 1.32, 2.42, 0.12, 0.36, 0.18, DARK);
  b.box(0, 1.53, 2.47, 2.56, 0.1, 0.52, body, paint);
  for (const s of [-1, 1]) b.box(s * 0.33, 1.585, 2.47, 0.34, 0.02, 0.52, stripe);
  for (const s of [-1, 1]) b.box(s * 1.29, 1.5, 2.47, 0.06, 0.3, 0.6, DARK);
  return b.geometry();
}

function sedanBody(paint, opts = {}) {
  const b = new VoxelBuilder(1536);
  const L = opts.len ?? 5.3, hl = L / 2;
  const roof = opts.roof ?? paint, lower = opts.lower ?? paint, door = opts.door ?? paint;
  const po = { p: P.PAINT, n: 0.3 };
  b.box(0, 0.38, 0, 2.48, 0.18, L - 0.1, DARK, { n: 0.1 });
  b.box(0, 0.68, 0, 2.56, 0.5, L, lower, po);
  b.box(0, 0.98, 0, 2.58, 0.18, L - 0.2, door, po);
  for (const s of [-1, 1]) {
    b.box(s * 1.17, 0.55, -hl + 1.3, 0.3, 0.68, 1.1, 0x0e0c14, { n: 0 });
    b.box(s * 1.17, 0.55, hl - 1.3, 0.3, 0.68, 1.1, 0x0e0c14, { n: 0 });
    b.box(s * 1.3, 0.85, 0.15, 0.02, 0.45, 0.05, shade(door, 0.55));
    b.box(s * 1.34, 1.25, -0.5, 0.2, 0.14, 0.24, roof, po);
  }
  hexaBox(b, -1.26, 1.26, 1.0, -hl, -0.9, 1.08, 1.14, 0.05, opts.hood ?? lower, po);
  hexaBox(b, -1.26, 1.26, 1.0, 1.35, hl, 1.14, 1.1, 0.05, opts.hood ?? lower, po);
  cabin(b, 1.18, 1.08, opts.cabinTop ?? 1.9, -0.9, -0.2, 1.0, 1.35, 0.18, roof);
  b.box(0, (opts.cabinTop ?? 1.9) + 0.02, 0.4, 1.8, 0.06, 1.15, roof, po);
  // lights
  for (const s of [-1, 1]) {
    b.box(s * 0.85, 0.82, -hl - 0.03, 0.5, 0.2, 0.08, 0xfff3d6, { p: P.LIGHT, e: 5, n: 0 });
    b.box(s * 0.88, 0.85, hl + 0.03, 0.5, 0.18, 0.06, 0xff2d4a, { p: P.LIGHT, e: 3.5, n: 0 });
  }
  b.box(0, 0.62, -hl - 0.02, 2.5, 0.28, 0.12, TRIM);
  b.box(0, 0.62, hl + 0.02, 2.5, 0.28, 0.12, TRIM);
  b.box(0, 0.85, -hl - 0.05, 0.9, 0.18, 0.04, 0x0b0910);
  return b;
}

/** Police cruiser (light) or SUV (heavy). Light bar pieces returned separately for strobing. */
export function policeBody(heavy = false) {
  const b = heavy
    ? (() => {
        const v = new VoxelBuilder(1536);
        const po = { p: P.PAINT, n: 0.3 };
        v.box(0, 0.42, 0, 2.6, 0.24, 5.6, DARK);
        v.box(0, 0.85, 0, 2.7, 0.9, 5.7, 0x161722, po);
        v.box(0, 1.12, 0.3, 2.72, 0.36, 3.2, 0xf2f2f6, po);
        hexaBox(v, -1.3, 1.3, 1.25, -2.85, -1.2, 1.3, 1.38, 0.05, 0x161722, po);
        cabin(v, 1.28, 1.3, 2.35, -1.2, -0.6, 2.5, 2.7, 0.12, 0xf2f2f6);
        v.box(0, 2.38, 0.95, 2.4, 0.06, 3.0, 0xf2f2f6, po);
        for (const s of [-1, 1]) {
          v.box(s * 1.22, 0.62, -1.7, 0.32, 0.8, 1.2, 0x0e0c14, { n: 0 });
          v.box(s * 1.22, 0.62, 1.8, 0.32, 0.8, 1.2, 0x0e0c14, { n: 0 });
          v.box(s * 0.9, 1.0, -2.88, 0.5, 0.22, 0.08, 0xfff3d6, { p: P.LIGHT, e: 5, n: 0 });
          v.box(s * 1.0, 1.0, 2.88, 0.4, 0.3, 0.06, 0xff2d4a, { p: P.LIGHT, e: 3.5, n: 0 });
        }
        // push bar
        v.box(0, 0.75, -3.02, 2.2, 0.7, 0.14, 0x0b0910);
        for (const s of [-1, 1]) v.box(s * 0.7, 0.75, -2.95, 0.14, 0.9, 0.2, 0x0b0910);
        return v;
      })()
    : (() => {
        const v = sedanBody(0x161722, { roof: 0xf2f2f6, door: 0xf2f2f6, lower: 0x161722, hood: 0x161722, len: 5.5 });
        for (const s of [-1, 1]) v.box(s * 0.6, 0.72, -2.85, 0.14, 0.62, 0.16, 0x0b0910);
        v.box(0, 0.7, -2.9, 1.5, 0.5, 0.08, 0x0b0910);
        return v;
      })();
  // POLICE door decals and gold badge
  const r = atlasRects.police;
  const y = heavy ? 1.12 : 0.98;
  for (const s of [-1, 1]) {
    b.box(s * (heavy ? 1.37 : 1.3), y, -0.35, 0.02, 0.24, 1.6, 0xffffff, {
      faces: { [s > 0 ? 1 : 2]: { p: P.SIGN, e: 0.15, uvr: [r.u0, r.v0, r.u1, r.v1] } }, skip: SKIP.NY | SKIP.PY,
    });
    b.box(s * (heavy ? 1.37 : 1.31), y + 0.02, 0.85, 0.03, 0.3, 0.26, 0xf5c542, { n: 0.2, p: P.CHROME });
  }
  // light bar base
  const top = heavy ? 2.42 : 1.98;
  b.box(0, top + 0.06, 0.3, 1.9, 0.12, 0.5, 0x22222c);
  b.box(0, top + 0.18, 0.3, 0.3, 0.14, 0.42, 0xf4f4ff, { p: P.LIGHT, e: 2 });
  if (!heavy) b.box(-0.9, top - 0.05, 1.6, 0.04, 0.9, 0.04, 0x22222c); // antenna
  return { geometry: b.geometry(), barY: top + 0.2 };
}

export const TRAFFIC_TYPES = ["sedan", "taxi", "van", "hatch"];
export function trafficBody(type, paint) {
  if (type === "taxi") {
    const b = sedanBody(0xffd23e, { len: 5.3 });
    b.box(0, 2.05, 0.3, 0.9, 0.3, 0.5, 0xfff7d6, { p: P.LIGHT, e: 2.2 });
    for (const s of [-1, 1]) for (let k = 0; k < 6; k++) b.box(s * 1.3, 1.13, -1.5 + k * 0.5, 0.03, 0.12, 0.25, k % 2 ? 0x1b1726 : 0xf4f1ea);
    return b.geometry();
  }
  if (type === "van") {
    const b = new VoxelBuilder(1024);
    const po = { p: P.PAINT, n: 0.3 };
    b.box(0, 0.45, 0, 2.5, 0.25, 5.6, DARK);
    b.box(0, 1.45, 0.45, 2.6, 2.05, 4.7, paint, { ...po, faces: { 1: { p: P.PAINT }, 2: { p: P.PAINT } } });
    hexaBox(b, -1.3, 1.3, 0.55, -2.85, -1.9, 1.25, 1.45, 0.05, paint, po);
    b.hexa([[-1.25, 1.35, -1.95], [1.25, 1.35, -1.95], [-1.15, 2.35, -1.6], [1.15, 2.35, -1.6], [-1.25, 1.35, -1.7], [1.25, 1.35, -1.7], [-1.15, 2.35, -1.35], [1.15, 2.35, -1.35]], 0x161a2c, { p: P.GLASS });
    for (const s of [-1, 1]) {
      b.box(s * 1.31, 1.95, -0.8, 0.03, 0.6, 1.2, 0x161a2c, { p: P.GLASS });
      b.box(s * 1.31, 1.2, 1.2, 0.03, 0.5, 2.6, shade(paint, 0.8));
      b.box(s * 1.17, 0.6, -1.85, 0.3, 0.72, 1.1, 0x0e0c14, { n: 0 });
      b.box(s * 1.17, 0.6, 1.85, 0.3, 0.72, 1.1, 0x0e0c14, { n: 0 });
      b.box(s * 0.85, 0.95, -2.88, 0.45, 0.22, 0.08, 0xfff3d6, { p: P.LIGHT, e: 5, n: 0 });
      b.box(s * 1.05, 1.0, 2.83, 0.3, 0.5, 0.06, 0xff2d4a, { p: P.LIGHT, e: 3, n: 0 });
    }
    return b.geometry();
  }
  if (type === "hatch") {
    const b = sedanBody(paint, { len: 4.5, cabinTop: 1.95 });
    return b.geometry();
  }
  return sedanBody(paint).geometry();
}

export function wheelGeometry(rimColor = CHROME, sporty = false) {
  const b = new VoxelBuilder(256);
  const r = sporty ? 0.54 : 0.48, w = sporty ? 0.46 : 0.4;
  b.box(0, 0, 0, w, r * 2, r * 1.38, 0x15131c, { p: P.TIRE, n: 0.2, skip: 0 });
  b.box(0, 0, 0, w, r * 1.38, r * 2, 0x15131c, { p: P.TIRE, n: 0.2, skip: 0 });
  // rim on both sides (wheels are mirrored)
  for (const s of [-1, 1]) {
    b.box(s * (w / 2 + 0.01), 0, 0, 0.04, r * 1.2, r * 1.2, rimColor, { p: P.CHROME, n: 0.1 });
    b.box(s * (w / 2 + 0.03), 0, 0, 0.04, r * 1.1, 0.12, 0x6d6a7a, { p: P.CHROME });
    b.box(s * (w / 2 + 0.03), 0, 0, 0.04, 0.12, r * 1.1, 0x6d6a7a, { p: P.CHROME });
    b.box(s * (w / 2 + 0.05), 0, 0, 0.05, 0.2, 0.2, sporty ? 0xff873c : 0x3a3648);
  }
  return { geometry: b.geometry(), radius: r };
}

/** Assemble a car group with separate wheel meshes. */
export function makeCar(geometry, material, opts = {}) {
  const group = new T.Group();
  const bodyMesh = new T.Mesh(geometry, material);
  bodyMesh.castShadow = true;
  group.add(bodyMesh);
  const wheel = opts.wheel ?? wheelGeometry();
  const wheels = [];
  const zf = opts.zf ?? -1.72, zb = opts.zb ?? 1.72, wx = opts.wx ?? 1.17;
  for (const z of [zf, zb]) for (const s of [-1, 1]) {
    const pivot = new T.Group();
    pivot.position.set(s * wx, wheel.radius, z);
    const m = new T.Mesh(wheel.geometry, material);
    m.castShadow = true;
    pivot.add(m);
    group.add(pivot);
    wheels.push({ pivot, mesh: m, front: z < 0 });
  }
  group.userData = { body: bodyMesh, wheels, radius: wheel.radius };
  return group;
}

/** Light bar pieces whose colour is animated every frame. */
export function lightBar(group, y, heavy) {
  const red = new T.MeshBasicMaterial({ color: 0xff2040 });
  const blue = new T.MeshBasicMaterial({ color: 0x2f7dff });
  const geo = new T.BoxGeometry(0.72, 0.2, 0.44);
  const L = new T.Mesh(geo, red), R = new T.Mesh(geo, blue);
  L.position.set(-0.58, y, 0.3);
  R.position.set(0.58, y, 0.3);
  group.add(L, R);
  group.userData.bar = { red, blue };
  return group;
}

/** Roadblock barricade: striped boards, amber blinkers, cones. Local x spans the road. */
export function barricadeGeometry() {
  const b = new VoxelBuilder(1024);
  for (const x of [-1.6, 1.6]) {
    for (const s of [-1, 1]) b.box(x + s * 1.1, 0.75, 0, 0.14, 1.5, 0.14, 0xe8e2ee, { rz: s * 0.18 });
    b.box(x, 1.15, 0, 3.1, 0.42, 0.12, 0xff416a, { p: P.STRIPE, q: 6, n: 0.1 });
    b.box(x, 0.55, 0, 3.1, 0.3, 0.12, 0xff416a, { p: P.STRIPE, q: 6, n: 0.1 });
    b.box(x - 1.2, 1.5, 0, 0.26, 0.22, 0.2, 0xffb000, { p: P.NEON, e: 5, q: 21 });
    b.box(x + 1.2, 1.5, 0, 0.26, 0.22, 0.2, 0xffb000, { p: P.NEON, e: 5, q: 22 });
  }
  for (const x of [-3.6, 3.6, -2.8]) {
    b.box(x, 0.06, 0.8, 0.7, 0.12, 0.7, 0xff6b2c);
    b.hexa([[x - 0.3, 0.12, 0.5], [x + 0.3, 0.12, 0.5], [x - 0.08, 1.0, 0.72], [x + 0.08, 1.0, 0.72], [x - 0.3, 0.12, 1.1], [x + 0.3, 0.12, 1.1], [x - 0.08, 1.0, 0.88], [x + 0.08, 1.0, 0.88]], 0xff6b2c, { n: 0.2 });
    b.box(x, 0.58, 0.8, 0.38, 0.16, 0.38, 0xfff4e6, { p: P.LIGHT, e: 0.8 });
  }
  // spike strip
  b.box(0, 0.05, -1.2, 6, 0.1, 0.4, 0x2b2638);
  for (let k = -2.8; k <= 2.8; k += 0.35) b.box(k, 0.14, -1.2, 0.08, 0.1, 0.08, CHROME, { p: P.CHROME });
  return b.geometry();
}

/** Decorative police helicopter. Rotor returned for animation. */
export function helicopter(material) {
  const b = new VoxelBuilder(1024);
  const navy = 0x1e2240, white = 0xeeeef6;
  b.box(0, 0, 0, 2.2, 1.8, 4.2, navy, { p: P.PAINT, n: 0.3 });
  b.box(0, 0.15, -2.4, 2.0, 1.5, 0.9, 0x161a2c, { p: P.GLASS });
  b.box(0, -0.25, 0, 2.24, 0.5, 4.2, white, { p: P.PAINT });
  b.box(0, 0.35, 4.2, 0.5, 0.5, 4.6, navy, { p: P.PAINT });
  b.box(0, 1.0, 6.4, 0.16, 1.6, 0.8, navy);
  b.box(0, 1.1, 0, 0.6, 0.5, 0.6, 0x3a3648);
  for (const s of [-1, 1]) {
    b.box(s * 1.0, -1.3, 0, 0.12, 0.12, 4.2, 0x3a3648);
    b.box(s * 1.0, -1.0, -1, 0.1, 0.6, 0.1, 0x3a3648);
    b.box(s * 1.0, -1.0, 1, 0.1, 0.6, 0.1, 0x3a3648);
  }
  b.box(0, -0.75, -2.0, 0.6, 0.4, 0.6, 0xffffff, { p: P.LIGHT, e: 7 });
  b.box(1.15, 0.2, 0.5, 0.12, 0.2, 0.2, 0x5dff7a, { p: P.NEON, e: 6, q: 23 });
  b.box(-1.15, 0.2, 0.5, 0.12, 0.2, 0.2, 0xff2d4a, { p: P.NEON, e: 6, q: 24 });
  const group = new T.Group();
  const bodyMesh = new T.Mesh(b.geometry(), material);
  group.add(bodyMesh);
  const rb = new VoxelBuilder(64);
  rb.box(0, 0, 0, 11, 0.08, 0.5, 0x2a2738, { skip: 0 });
  rb.box(0, 0, 0, 0.5, 0.08, 11, 0x2a2738, { skip: 0 });
  const rotor = new T.Mesh(rb.geometry(), material);
  rotor.position.y = 1.4;
  group.add(rotor);
  const tb = new VoxelBuilder(32);
  tb.box(0, 0, 0, 0.06, 2.2, 0.3, 0x2a2738, { skip: 0 });
  const tail = new T.Mesh(tb.geometry(), material);
  tail.position.set(0.3, 1.0, 6.6);
  group.add(tail);
  group.userData = { rotor, tail };
  return group;
}
