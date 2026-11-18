import * as T from "../vendor/three.js";
import { rng } from "./simulation.js";
export const cube = new T.BoxGeometry(),
  paint = new T.MeshLambertMaterial();
const transform = new T.Object3D();
export function batch(build) {
  const parts = [];
  function box(x, y, z, w, h, d, color, angle = 0, tilt = 0) {
    transform.position.set(x, y, z);
    transform.scale.set(w, h, d);
    transform.rotation.set(0, angle, tilt, "YXZ");
    transform.updateMatrix();
    parts.push([transform.matrix.clone(), color]);
  }
  build(box);
  const mesh = new T.InstancedMesh(cube, paint, parts.length);
  parts.forEach(([matrix, color], i) => {
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, new T.Color(color));
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
function palm(b, x, z) {
  for (let i = 0; i < 6; i++)
    b(x + i * 0.13, i + 0.5, z, 0.62, 1.1, 0.7, i % 2 ? 0x875049 : 0xab6953);
  for (let j = 0; j < 7; j++)
    for (let k = 0; k < 4; k++) {
      const a = j * 0.898;
      b(
        x + 0.75 + Math.cos(a) * k * 0.88,
        6.5 + Math.sin(k * 1.05) * 0.8 - k * 0.21,
        z + Math.sin(a) * k * 0.88,
        1.5,
        0.55,
        1.2 - k * 0.15,
        j % 2 ? 0x258461 : 0x49964f,
        -a,
      );
    }
}
import { district } from "./simulation.js";
const signLetters = {
  B: ["110", "101", "110", "101", "110"],
  A: ["010", "101", "111", "101", "101"],
  Y: ["101", "101", "010", "010", "010"],
  I: ["111", "010", "010", "010", "111"],
  N: ["101", "111", "111", "111", "101"],
  P: ["110", "101", "110", "100", "100"],
  R: ["110", "101", "110", "101", "101"],
};
function marquee(b, x, z, word, color) {
  b(x, 5, z, 0.5, 2.3, 5.6, 0x342b4d);
  Array.from(word).forEach((letter, index) =>
    signLetters[letter].forEach((row, r) => {
      Array.from(row).forEach((pixel, c) => {
        if (pixel === "1")
          b(
            x + 0.27,
            5.7 - r * 0.33,
            z + 1.8 - index * 1.36 - c * 0.33,
            0.12,
            0.31,
            0.31,
            color,
          );
      });
    }),
  );
}
export function chunk(seed, i, j) {
  const rand = rng(seed + "/" + i + "/" + j),
    area = district(i, j);
  const mesh = batch((b) => {
    b(26, -0.51, 26, 52, 1, 52, 0x3c3752);
    for (let n = 2; n < 52; n += 6) {
      b(0, 0.015, n, 0.18, 0.05, 2.8, 0xffd495);
      b(n, 0.015, 0, 2.8, 0.05, 0.18, 0xffd495);
    }
    for (let n = -7; n < 8; n += 2) {
      b(n, 0.025, 8.2, 1, 0.04, 2, 0xffe0cb);
      b(8.2, 0.025, n, 2, 0.04, 1, 0xffe0cb);
    }
    b(26, 0.08, 26, 33.6, 0.24, 33.6, 0xb591a6);
    const neon = rand() < 0.5 ? 0xff5d95 : 0x3dd8e7;
    if (area === 0) {
      b(26, 0.4, 26, 29.2, 0.6, 29.2, 0x19b8bc);
      for (const v of [11.5, 40.5]) {
        b(v, 0.74, 26, 0.4, 1.3, 29.2, 0xdebfa9);
        b(26, 0.74, v, 29.2, 1.3, 0.4, 0xdebfa9);
      }
      for (let k = 0; k < 45; k++)
        b(
          13 + rand() * 26,
          0.72,
          13 + rand() * 26,
          0.4 + rand() * 2,
          0.04,
          0.2,
          k % 4 ? 0x64d9cf : 0xffbc93,
        );
      b(24, 1, 26, 2.9, 1, 7, 0xffeed2);
      b(24, 2, 26, 2.3, 1.1, 3.7, 0x605d90);
    } else if (area === 3) {
      b(26, 0.22, 26, 8, 0.12, 33.6, 0x5c4760);
      b(26, 0.22, 26, 33.6, 0.12, 8, 0x5c4760);
      for (const x of [16.7, 35.3])
        for (const z of [16.7, 35.3]) {
          const h = 4 + rand() * 2,
            c = rand() < 0.5 ? 0xf5a388 : 0x8bcabe;
          b(x, h / 2, z, 10.6, h, 10.6, c);
          b(x, h + 0.15, z, 10.9, 0.3, 10.9, 0xffdfb6);
          for (const side of [-1, 1]) {
            b(x + side * 5.31, 1.7, z, 0.14, 2.8, 8.6, 0x413650);
            for (let n = -3; n <= 3; n += 2)
              b(x + side * 5.44, 1.65, z + n, 0.1, 2.35, 1.5, 0xffce88);
            b(x + side * 5.4, 3.43, z, 1.3, 0.35, 9, neon);
          }
        }
    } else {
      b(26, 0.6, 26, 29.2, 1.2, 29.2, 0xdd9ba5);
      for (const x of [18.9, 33.1])
        for (const z of [18.9, 33.1]) {
          const floors =
              area === 1
                ? 5 + Math.floor(rand() * 5)
                : area === 2
                  ? 2
                  : 2 + Math.floor(rand() * 3),
            h = floors * 2.5,
            shell = [0xf3a394, 0xb0c6c9, 0xc68cab, 0xffbc95][
              Math.floor(rand() * 4)
            ];
          b(x, h / 2, z, 14.1, h, 14.1, shell);
          b(x, h + 0.3, z, 14.4, 0.6, 14.4, 0xffceb9);
          b(x, h + 1, z, 10, 1.4, 10, shell);
          for (let f = 0; f < floors; f++) {
            const y = 1.5 + 2.5 * f;
            for (const side of [-1, 1]) {
              b(x + side * 7.08, y, z, 0.12, 1.28, 12, 0x403852);
              b(x, y, z + side * 7.08, 12, 1.28, 0.12, 0x403852);
              for (let n = -4; n <= 4; n += 4) {
                const c = rand() < 0.6 ? 0xffd497 : 0x8488a6;
                b(x + side * 7.17, y, z + n, 0.1, 1, 1.8, c);
                b(x + n, y, z + side * 7.17, 1.8, 1, 0.1, c);
              }
            }
          }
          for (const side of [-1, 1]) {
            // Striped canvas awnings and lit display windows face both streets.
            const wall = x + side * 7.12;
            b(wall, 1.35, z, 0.18, 2.4, 11, 0x383452);
            for (let n = -5; n < 6; n++)
              b(
                wall + side * 0.42,
                2.78,
                z + n,
                1.45,
                0.32,
                0.96,
                n % 2 ? 0xffeac9 : neon,
              );
            for (let n = -4; n <= 4; n += 3)
              b(wall + side * 0.16, 1.36, z + n, 0.14, 2, 1.95, 0xffcb86);
          }
          b(x, 3.3, z, 14.9, 0.25, 14.9, neon);
        }
    }
    if (area !== 0) marquee(b, 40.4, 33, area === 3 ? "INN" : "BAY", neon);
    for (const z of [14, 38]) {
      palm(b, 10.4, z);
      palm(b, 41.6, z);
    }
    for (const x of [10, 42]) {
      b(x, 0.65, 27, 0.9, 0.28, 3, 0xc4866a);
      b(x + 0.34, 1.1, 27, 0.18, 0.85, 3, 0xba7760);
      for (const z of [26, 28]) b(x, 0.3, z, 0.64, 0.6, 0.24, 0x46394e);
    }

    b(41.5, 2.6, 13, 0.26, 5.2, 0.26, 0x42384a);
    b(41.5, 5.3, 13, 1.3, 0.5, 1.1, 0xffe37c);
    for (let n = 0; n < 8; n++)
      b(
        8 - rand() * 2,
        0.031,
        12 + rand() * 27,
        rand() * 0.7 + 0.2,
        0.04,
        1 + rand() * 3,
        n % 2 ? 0x946177 : 0x796180,
      );
    if (area === 2) {
      // Portal columns stand on the sidewalks, with clearance for every car.
      for (const x of [-10, 10]) b(x, 3.5, 32, 0.5, 7, 0.5, 0x687288);
      // Elevated cross-street bridge and stepped approaches above the highway.
      b(0, 8.4, 25, 26, 0.75, 6, 0x776786);
      for (const side of [-1, 1]) {
        b(0, 9, 25 + side * 3, 26, 0.6, 0.25, 0xe5afad);
        b(side * 10, 4, 25, 1, 8, 2.4, 0xa78fa6);
        for (let n = 0; n < 6; n++)
          b(side * (14 + n * 2), 8.05 - n * 0.35, 25, 2, 0.8, 6, 0x806b87);
      }
      b(0, 7, 32, 20.6, 0.5, 0.6, 0xa3a9b4);
      b(0, 6.8, 32, 8, 2, 0.28, 0x146b73);
      for (const x of [-2, 2]) {
        b(x, 6.8, 32, 0.3, 1, 0.36, 0xffefd4);
        b(x + 0.25, 7.15, 32, 0.75, 0.22, 0.36, 0xffefd4);
      }
    } else if (area === 3) {
      for (const z of [18, 34]) {
        b(39.8, 0.58, z, 2.2, 0.84, 4.5, 0x548ca3);
        b(39.8, 1.27, z, 1.8, 0.72, 2.3, 0x333851);
      }
    }
  });
  mesh.position.set(i * 52, 0, j * 52);
  return mesh;
}
export function vehicle(police = false, color = 0xff873c, style = 0) {
  const group = new T.Group(),
    glass = 0x24283d,
    cream = 0xffedcb;
  const body = batch((b) => {
    b(0, 0.08, 0, 2.8, 0.09, 5.5, 0x262438);
    b(0, 0.89, 0, 2.6, 1, 5.3, police ? 0x252738 : color);
    b(0, 1.46, -0.2, 2.24, 0.28, 4.6, police ? cream : color);
    b(0, 1.92, 0.26, 2.04, 0.86, 2.55, glass);
    b(0, 2.4, 0.3, 2.08, 0.18, 1.85, police ? cream : color);
    for (const s of [-1, 1]) {
      if (!police) {
        b(s * 0.49, 1.62, -1.68, 0.28, 0.05, 1.65, cream);
        b(s * 0.49, 2.51, 0.3, 0.28, 0.05, 1.85, cream);
      }
      b(s * 0.92, 1.1, -2.67, 0.64, 0.44, 0.13, 0xffe37c);
      b(s * 0.92, 1.1, 2.67, 0.64, 0.3, 0.13, 0xff416a);
      b(s * 1.21, 1.75, -0.6, 0.44, 0.26, 0.5, color);
      b(s * 1.31, 1.15, 0.15, 0.08, 0.44, 2, police ? cream : color);
    }
    b(0, 0.52, -2.71, 2.72, 0.2, 0.23, 0x555366);
    b(0, 1.16, -2.68, 1.04, 0.26, 0.11, glass);
    for (const side of [-1, 1]) {
      b(side * 1.18, 1.13, -2.73, 0.12, 0.36, 0.09, 0xfff8d0);
      b(side * 1.32, 1.18, 0.66, 0.12, 0.12, 0.4, 0xe4b59d);
      b(side * 1.31, 0.71, 0.05, 0.14, 0.19, 2.4, 0x4d4355);
    }
    if (style === 1) b(0, 2.1, 1, 2.2, 1.65, 2.8, color);
    if (style === 2) b(0, 2.62, 0.4, 0.9, 0.36, 0.58, 0xffe37c);
    if (style === 3) b(0, 1.66, 1.87, 2.1, 0.25, 1.85, color);
    b(0, 0.67, -2.68, 1.6, 0.28, 0.1, glass);
    b(0, 1.6, 2.25, 2.52, 0.2, 0.44, glass);
  });
  group.add(body);
  group.userData.wheels = [];
  for (const s of [-1, 1])
    for (const z of [-1.64, 1.6]) {
      const wheel = batch((b) => {
        b(0, 0, 0, 0.48, 0.93, 1, 0x201d2c);
        b(s * 0.25, 0, 0, 0.07, 0.48, 0.54, 0xa7a2ad);
      });
      wheel.position.set(s * 1.24, 0.57, z);
      group.add(wheel);
      if (z < 0) group.userData.wheels.push(wheel);
    }
  if (police) {
    const bar = batch((b) => {
      b(-0.53, 0, 0, 0.9, 0.35, 0.53, 0xff416a);
      b(0.53, 0, 0, 0.9, 0.35, 0.53, 0x3f98ff);
    });
    bar.position.y = 2.68;
    group.add(bar);
    group.userData.bar = bar;
  }
  return group;
}
