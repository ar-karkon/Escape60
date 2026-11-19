import { Kit } from "./kit.js";

/* Street furniture, vegetation and set dressing. Each prop's origin is its base centre; +z faces the
   road. `hit` = radius for knock-over checks (breakables only); `shadow` = casts shadows. */
const C = {
  metal: 0x3a3e46, darkMetal: 0x23262c, concrete: 0xb9b5ad, wood: 0x7a5236, bark: 0x6b4a32, palmBark: 0x8a6a48,
  leaf: 0x3f7a2c, leafDark: 0x2c5a24, pine: 0x24452a, red: 0xc8202a, orange: 0xff6a12, white: 0xf2f2ee, yellow: 0xffc21a,
};
export const PROP_TYPES = {};
function def(name, meta, build) { PROP_TYPES[name] = { name, ...meta, build }; }

def("lamp", { hit: 0.6, breakable: true, shadow: false, light: [0, 7.15, 2.3] }, (k) => {
  k.set(C.darkMetal, 0.5, 0.6).cyl(0, 0, 0, 0.2, 0.2, 0.5, 6).cyl(0, 0.5, 0, 0.11, 0.08, 7.4, 6);
  k.cbox(0, 7.32, 1.1, 0.1, 0.1, 2.3);
  k.cbox(0, 7.25, 2.25, 0.36, 0.14, 0.8);
  k.set(0xfff0d0, 0.3, 0, 1.7, 1).cbox(0, 7.17, 2.25, 0.28, 0.02, 0.66);
});
def("hwlamp", { shadow: false, light: [0, 10.6, 3.6] }, (k) => {
  k.set(0x80868f, 0.45, 0.7).cyl(0, 0, 0, 0.25, 0.14, 11, 6);
  k.cbox(0, 10.85, 1.8, 0.12, 0.12, 3.8);
  k.cbox(0, 10.75, 3.7, 0.5, 0.18, 1.0);
  k.set(0xffe2b8, 0.3, 0, 1.8, 1).cbox(0, 10.65, 3.7, 0.38, 0.02, 0.82);
});
def("palm", { hit: 0.5, breakable: true, shadow: true }, (k) => {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < 7; i++) {
    const nx = x + 0.08 + i * 0.03, ny = y + 1.35, r0 = 0.24 - i * 0.015, r1 = r0 - 0.015;
    k.set(i % 2 ? C.palmBark : 0x7a5c3e, 0.95).at(x, y, z).cyl(0, 0, 0, r0, r1, 1.36, 7, false);
    x = nx; y = ny;
  }
  k.reset();
  for (let f = 0; f < 8; f++) {
    const a = (f / 8) * Math.PI * 2 + 0.3, ca = Math.cos(a), sa = Math.sin(a), L = 3.4 + (f % 3) * 0.4;
    const base = [x, y, z], mid = [x + ca * L * 0.55, y + 0.55, z + sa * L * 0.55], tip = [x + ca * L, y - 1.2, z + sa * L];
    const w = 0.6, px = -sa * w, pz = ca * w;
    k.set(f % 2 ? C.leaf : C.leafDark, 0.9);
    k.tri(base, [mid[0] + px, mid[1], mid[2] + pz], mid); k.tri(base, mid, [mid[0] - px, mid[1], mid[2] - pz]);
    k.tri(mid, [mid[0] + px, mid[1], mid[2] + pz], tip); k.tri(mid, tip, [mid[0] - px, mid[1], mid[2] - pz]);
    k.tri(base, mid, [mid[0] + px, mid[1], mid[2] + pz]); k.tri(base, [mid[0] - px, mid[1], mid[2] - pz], mid);
    k.tri(mid, tip, [mid[0] + px, mid[1], mid[2] + pz]); k.tri(mid, [mid[0] - px, mid[1], mid[2] - pz], tip);
  }
  k.set(0x5a3d22, 0.9).blob(x, y - 0.2, z, 0.35, 0.3, 0.35, 0);
});
def("tree", { shadow: true }, (k) => {
  k.set(C.bark, 0.95).cyl(0, 0, 0, 0.3, 0.2, 2.6, 6);
  k.set(C.leaf, 0.9).blob(0, 4.2, 0, 2.4, 2.1, 2.4, 0).set(C.leafDark, 0.9).blob(0.9, 3.4, 0.6, 1.6, 1.4, 1.6, 0).blob(-0.8, 3.6, -0.5, 1.5, 1.3, 1.5, 0);
});
def("streettree", { hit: 0.45, breakable: true, shadow: true }, (k) => {
  k.set(0x6a6660, 0.9).cbox(0, 0.06, 0, 1.3, 0.12, 1.3);
  k.set(C.bark, 0.95).cyl(0, 0, 0, 0.14, 0.1, 2.3, 6);
  k.set(C.leaf, 0.9).blob(0, 3.3, 0, 1.4, 1.5, 1.4, 0).set(C.leafDark, 0.9).blob(0.4, 2.9, 0.3, 0.9, 0.8, 0.9, 0);
});
def("pine", { shadow: true }, (k) => {
  k.set(C.bark, 0.95).cyl(0, 0, 0, 0.28, 0.2, 1.8, 6);
  k.set(C.pine, 0.92).cyl(0, 1.4, 0, 2.2, 0.1, 5.2, 6, false).cyl(0, 3.6, 0, 1.7, 0.05, 7.4, 6, false).cyl(0, 5.8, 0, 1.1, 0, 9.0, 6, false);
});
def("bush", { shadow: false }, (k) => { k.set(C.leaf, 0.95).blob(0, 0.6, 0, 1.3, 0.8, 1.2, 0).set(C.leafDark, 0.95).blob(0.8, 0.5, 0.3, 0.8, 0.6, 0.8, 0); });
def("rock", { shadow: true }, (k) => { k.set(0x8a7a6a, 0.95).blob(0, 0.5, 0, 1.6, 1.1, 1.3, 0).set(0x7a6a5c, 0.95).blob(0.9, 0.3, 0.6, 0.9, 0.7, 0.8, 0); });
def("cliff", { shadow: true }, (k) => {
  k.set(0x9a7a5e, 0.95).blob(0, 6, 0, 9, 9, 7, 0).set(0x8a6a50, 0.95).blob(5, 3, 3, 6, 6, 5, 0).blob(-5, 4, -2, 6, 7, 6, 0).set(0xa58a6a, 0.95).blob(1, 11, -1, 5, 4, 4, 0);
});
def("bench", { hit: 0.7, breakable: true }, (k) => {
  k.set(C.darkMetal, 0.5, 0.5).cbox(-0.8, 0.22, 0, 0.08, 0.44, 0.45).cbox(0.8, 0.22, 0, 0.08, 0.44, 0.45);
  k.set(C.wood, 0.8).cbox(0, 0.46, 0, 1.9, 0.07, 0.48).cbox(0, 0.78, -0.22, 1.9, 0.38, 0.06);
});
def("bin", { hit: 0.4, breakable: true }, (k) => { k.set(0x2d4a3a, 0.6, 0.3).cyl(0, 0, 0, 0.3, 0.32, 0.95, 8).set(0x1a1c20, 0.6).cyl(0, 0.95, 0, 0.34, 0.3, 1.02, 8); });
def("hydrant", { hit: 0.35, breakable: true, water: true }, (k) => { k.set(C.red, 0.5, 0.2).cyl(0, 0, 0, 0.17, 0.15, 0.7, 8).cyl(0, 0.7, 0, 0.18, 0.08, 0.86, 8).cbox(0, 0.48, 0, 0.5, 0.1, 0.12); });
def("cone", { hit: 0.35, breakable: true }, (k) => { k.set(0x1a1a1a, 0.8).cbox(0, 0.02, 0, 0.5, 0.04, 0.5); k.set(C.orange, 0.6).cyl(0, 0.04, 0, 0.2, 0.03, 0.75, 8); k.set(C.white, 0.5).cyl(0, 0.38, 0, 0.12, 0.09, 0.5, 8, false); });
def("barrier", { hit: 0.9, breakable: true }, (k) => {
  for (let i = 0; i < 4; i++) k.set(i % 2 ? C.white : C.red, 0.6).cbox(-0.75 + i * 0.5, 0.75, 0, 0.5, 0.25, 0.08);
  k.set(C.darkMetal, 0.6, 0.4).cbox(-0.85, 0.4, 0, 0.06, 0.8, 0.5).cbox(0.85, 0.4, 0, 0.06, 0.8, 0.5);
});
def("tlight", { hit: 0.5, breakable: true }, (k) => {
  k.set(C.darkMetal, 0.5, 0.5).cyl(0, 0, 0, 0.13, 0.11, 5.6, 6).cbox(0, 5.5, 2.4, 0.12, 0.12, 4.8);
  k.set(0x16171a, 0.6).cbox(0, 4.95, 4.4, 0.42, 1.2, 0.32);
  k.set(0xff2a2a, 0.3, 0, 0.6, 2).cbox(0, 5.32, 4.58, 0.22, 0.22, 0.04);
  k.set(0xffaa22, 0.3, 0, 0.25, 2).cbox(0, 4.95, 4.58, 0.22, 0.22, 0.04);
  k.set(0x3dff7a, 0.3, 0, 2.2, 2).cbox(0, 4.58, 4.58, 0.22, 0.22, 0.04);
  k.set(0x16171a, 0.6).cbox(0, 2.6, 0.2, 0.3, 0.6, 0.25);
  k.set(0xff3a2a, 0.3, 0, 1.2, 2).cbox(0, 2.68, 0.33, 0.18, 0.16, 0.02);
});
def("billboard", { shadow: true, board: [0, 7.5, 0.35, 11, 4.6] }, (k) => {
  k.set(0x5a5f68, 0.5, 0.6).cyl(-3.2, 0, 0, 0.3, 0.26, 6, 6).cyl(3.2, 0, 0, 0.3, 0.26, 6, 6);
  k.set(0x30333a, 0.6, 0.4).cbox(0, 7.5, 0, 11.6, 5.2, 0.5);
  k.set(0x6a6f78, 0.5, 0.6).cbox(0, 5.0, 0.9, 11, 0.12, 1.2);
});
def("container", { shadow: true }, (k) => {
  k.set(0xffffff, 0.7, 0.3).cbox(0, 1.3, 0, 2.44, 2.6, 6.06);
  for (let i = 0; i < 9; i++) k.set(0xdddddd, 0.7, 0.3).cbox(1.24, 1.3, -2.7 + i * 0.68, 0.04, 2.3, 0.14).cbox(-1.24, 1.3, -2.7 + i * 0.68, 0.04, 2.3, 0.14);
  k.set(0xbbbbbb, 0.7, 0.3).cbox(0, 1.3, 3.04, 2.3, 2.4, 0.04);
});
def("umbrella", { shadow: false }, (k) => {
  k.set(C.white, 0.6).cyl(0, 0, 0, 0.04, 0.04, 2.3, 5);
  k.set(0xffffff, 0.8).cyl(0, 2.0, 0, 1.6, 0, 2.6, 8);
  k.set(0xf4f0e6, 0.8).cbox(1.3, 0.25, 0, 0.7, 0.1, 1.8);
});
def("boat", { shadow: false }, (k) => {
  k.set(0xf6f6f2, 0.4).quad([-1.4, 0, -4], [1.4, 0, -4], [1.4, 1.2, -4], [-1.4, 1.2, -4]);
  k.quad([-1.4, 0, -4], [-1.4, 1.2, -4], [0, 1.2, 4.5], [0, 0, 4.5]); k.quad([1.4, 0, -4], [0, 0, 4.5], [0, 1.2, 4.5], [1.4, 1.2, -4]);
  k.tri([-1.4, 1.2, -4], [1.4, 1.2, -4], [0, 1.2, 4.5]);
  k.set(0x1d4fd8, 0.5).cbox(0, 1.8, -1.2, 1.8, 1.2, 2.6).set(0x0c1220, 0.1, 0.4).cbox(0, 1.95, -0.1, 1.6, 0.6, 0.3);
});
def("pole", { shadow: false }, (k) => { k.set(0x6a4e36, 0.95).cyl(0, 0, 0, 0.16, 0.12, 9, 6); k.set(0x4a3a2a, 0.9).cbox(0, 8.4, 0, 2.4, 0.12, 0.12); k.set(0x9aa0a8, 0.4, 0.4).cbox(-1, 8.55, 0, 0.1, 0.2, 0.1).cbox(1, 8.55, 0, 0.1, 0.2, 0.1); });
def("busstop", { hit: 1.2, breakable: true }, (k) => {
  k.set(0x9aa3ad, 0.4, 0.6).cyl(-1.6, 0, -0.5, 0.06, 0.06, 2.5, 5).cyl(1.6, 0, -0.5, 0.06, 0.06, 2.5, 5).cbox(0, 2.55, 0, 3.6, 0.1, 1.5);
  k.set(0x9fd8ff, 0.08, 0.2, 0.2, 2).cbox(0, 1.3, -0.62, 3.2, 2.2, 0.04);
  k.set(C.wood, 0.8).cbox(0, 0.45, -0.35, 2.4, 0.06, 0.4);
});
def("planter", { hit: 0.8, breakable: true }, (k) => { k.set(0xa49d94, 0.9).cbox(0, 0.3, 0, 1.4, 0.6, 1.4); k.set(C.leaf, 0.95).blob(0, 0.9, 0, 0.8, 0.55, 0.8, 0); });
def("lifeguard", { shadow: true }, (k) => {
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.set(C.white, 0.7).cyl(x, 0, z, 0.08, 0.08, 2.4, 5);
  k.set(0xff5a3c, 0.7).cbox(0, 3.2, 0, 2.6, 1.6, 2.6).set(0xf6efe2, 0.7).cbox(0, 4.1, 0, 3, 0.2, 3).set(0x3a4a5a, 0.2).cbox(0, 3.3, 1.31, 1.8, 0.7, 0.02);
});
def("yacht", { shadow: false }, (k) => {
  k.set(0xffffff, 0.35).at(0, 0, 0, 0, 1.6).quad([-1.4, 0, -4], [1.4, 0, -4], [1.4, 1.2, -4], [-1.4, 1.2, -4]);
  k.quad([-1.4, 0, -4], [-1.4, 1.2, -4], [0, 1.2, 4.5], [0, 0, 4.5]); k.quad([1.4, 0, -4], [0, 0, 4.5], [0, 1.2, 4.5], [1.4, 1.2, -4]);
  k.tri([-1.4, 1.2, -4], [1.4, 1.2, -4], [0, 1.2, 4.5]);
  k.reset().set(0xf2f2f2, 0.3).cbox(0, 2.6, -1.5, 3.2, 1.0, 5).set(0x0c1220, 0.08, 0.5).cbox(0, 2.7, 1.05, 3.0, 0.6, 0.1).set(0xffffff, 0.3).cbox(0, 3.4, -2.2, 2.2, 0.7, 2.6);
  k.set(0xe8eef4, 0.4, 0.6).cyl(0, 3.6, -1, 0.06, 0.04, 14, 5);
});

/** Build every prop geometry once. */
export function buildProps() {
  const out = {};
  for (const [name, t] of Object.entries(PROP_TYPES)) { const k = new Kit(); t.build(k); out[name] = k.geometry(); }
  return out;
}
