import { CELL } from "./particles.js";

/* Driving effects. Smoke, nitro, trail and burst styles are chosen in the garage before a run; the
   renderer calls these emitters from the car state each frame. Visual only. */
export const EFFECTS = {
  smoke: [{ id: "clean", level: 1 }, { id: "comic", level: 1 }, { id: "neon", level: 2 }, { id: "rainbow", level: 4 }, { id: "flame", level: 6 }],
  nitro: [{ id: "blue", level: 1 }, { id: "toxic", level: 1 }, { id: "purple", level: 3 }, { id: "inferno", level: 5 }],
  trail: [{ id: "tail", level: 1 }, { id: "neon", level: 1 }, { id: "off", level: 1 }],
  burst: [{ id: "graffiti", level: 1 }, { id: "electric", level: 2 }, { id: "clean", level: 1 }],
};
export const ACCENTS = [0xff5d95, 0x3dd8e7, 0xffe37c, 0x8d54e9, 0x5dffb0, 0xffad65, 0xfff4e6];
const rgb = (hex, k = 1) => [((hex >> 16) & 255) / 255 * k, ((hex >> 8) & 255) / 255 * k, (hex & 255) / 255 * k];
const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a;
function hsl(h, s, l) { const f = (n) => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)]; }

export function createEffects(P) {
  const style = { smoke: "clean", nitro: "blue", trail: "tail", burst: "graffiti", accent: ACCENTS[0] };
  const emitters = [];
  let t = 0;
  const fx = {
    style,
    setStyle(s) { Object.assign(style, s); },
    accent(k = 1) { return rgb(style.accent, k); },
    /** Tyre smoke at a rear wheel. k = 0..1 intensity; vx, vz = car velocity. */
    drift(x, y, z, vx, vz, k, low) {
      const s = style.smoke;
      const back = 0.15;
      if (s === "comic") {
        if (Math.random() < 0.55 * k) P.alpha.spawn({ x: x + rnd(0.3), y: y + 0.3, z: z + rnd(0.3), vx: vx * back + rnd(1.2), vy: 0.8 + Math.random() * 0.8, vz: vz * back + rnd(1.2), life: 0.75 + Math.random() * 0.35, s0: 0.9, s1: 2.6 + k * 1.2, a0: 1, a1: 0.85, rot: Math.random() * 6, spin: rnd(1.2), cell: CELL.COMIC, c0: [1, 1, 1], c1: [0.92, 0.94, 1], drag: 1.8, ease: 1 });
        if (Math.random() < 0.06 * k) P.alpha.spawn({ x, y: y + 0.6, z, vx: vx * 0.1 + rnd(2), vy: 2 + Math.random() * 2, vz: vz * 0.1 + rnd(2), life: 0.6, s0: 0.5, s1: 0.9, a0: 1, a1: 0, rot: Math.random() * 6, spin: rnd(4), cell: Math.random() < 0.5 ? CELL.STAR : CELL.SPLAT, c0: fx.accent(), drag: 1.5 });
        return;
      }
      if (s === "flame") {
        if (Math.random() < 0.9 * k) P.add.spawn({ x: x + rnd(0.3), y: y + 0.2, z: z + rnd(0.3), vx: vx * 0.25 + rnd(0.8), vy: 1.5 + Math.random() * 1.5, vz: vz * 0.25 + rnd(0.8), life: 0.32 + Math.random() * 0.2, s0: 0.9, s1: 0.3, a0: 1, a1: 0, rot: rnd(0.4), cell: CELL.FLAME, c0: [2, 1.2, 0.5], c1: [1.6, 0.3, 0.05], drag: 2 });
        if (!low && Math.random() < 0.35 * k) P.alpha.spawn({ x, y: y + 0.4, z, vx: vx * 0.15 + rnd(1), vy: 1.2, vz: vz * 0.15 + rnd(1), life: 1.2, s0: 1, s1: 3.5, a0: 0.35, a1: 0, rot: Math.random() * 6, spin: rnd(0.5), cell: CELL.DARK, c0: [0.6, 0.6, 0.6], drag: 1.5 });
        return;
      }
      let c = [0.92, 0.92, 0.95];
      if (s === "neon") c = fx.accent(1.15);
      if (s === "rainbow") c = hsl((t * 0.35 + Math.random() * 0.08) % 1, 0.9, 0.62);
      if (Math.random() < (low ? 0.45 : 0.85) * k) P.alpha.spawn({ x: x + rnd(0.25), y: y + 0.25, z: z + rnd(0.25), vx: vx * back + rnd(1.4), vy: 0.5 + Math.random() * 0.9, vz: vz * back + rnd(1.4), life: 0.9 + Math.random() * 0.6, s0: 0.8, s1: 2.4 + k * 1.6, a0: s === "clean" ? 0.34 : 0.45, a1: 0, rot: Math.random() * 6, spin: rnd(0.6), cell: CELL.SMOKE, c0: c, c1: s === "clean" ? [0.8, 0.8, 0.84] : c, drag: 1.4, fadeIn: 0.08, ease: 1 });
      if (s === "neon" && Math.random() < 0.25 * k) P.add.spawn({ x, y: y + 0.3, z, vx: vx * 0.1, vy: 0.4, vz: vz * 0.1, life: 0.5, s0: 1.4, s1: 2.6, a0: 0.25, a1: 0, rot: 0, cell: CELL.GLOW, c0: fx.accent(1.4), drag: 2 });
    },
    /** Exhaust flame for nitro. (dx, dz) = backwards unit vector, (vx, vz) = car velocity. */
    nitro(x, y, z, dx, dz, vx, vz, k, low) {
      const s = style.nitro;
      const cols = { blue: [[2.2, 2.4, 3], [0.2, 0.55, 2.2]], purple: [[2.4, 1.6, 3], [1.4, 0.15, 2.2]], toxic: [[1.8, 3, 1.4], [0.4, 1.8, 0.2]], inferno: [[3, 2.2, 1.2], [2.2, 0.45, 0.05]] }[s] || [[2, 2, 3], [0.3, 0.6, 2]];
      for (let i = 0; i < (low ? 1 : 2); i++) {
        const sp = 9 + Math.random() * 6;
        P.add.spawn({ x: x + dx * 0.1, y, z: z + dz * 0.1, vx: vx + dx * sp + rnd(0.6), vy: rnd(0.3), vz: vz + dz * sp + rnd(0.6), life: 0.1 + Math.random() * 0.08, s0: 0.62 * k + 0.2, s1: 0.12, a0: 1, a1: 0.2, rot: Math.random() * 6, cell: CELL.FLAME, c0: cols[0], c1: cols[1], stretch: 1.2 });
      }
      P.add.spawn({ x, y, z, vx: vx, vy: 0, vz: vz, life: 0.06, s0: 1.4 * k, s1: 1.2 * k, a0: 0.55, a1: 0.2, rot: 0, cell: CELL.GLOW, c0: cols[1] });
      if (s === "toxic" && Math.random() < 0.5) P.alpha.spawn({ x: x + dx * 0.6, y: y + 0.1, z: z + dz * 0.6, vx: vx * 0.3 + dx * 3 + rnd(1), vy: 0.6 + Math.random(), vz: vz * 0.3 + dz * 3 + rnd(1), life: 1.1, s0: 0.8, s1: 3.6, a0: 0.55, a1: 0, rot: Math.random() * 6, spin: rnd(1), cell: CELL.SMOKE, c0: [0.45, 1.25, 0.25], drag: 1.6, fadeIn: 0.05 });
      if ((s === "purple" || s === "inferno") && Math.random() < 0.5) P.add.spawn({ x, y, z, vx: vx + dx * 6 + rnd(3), vy: rnd(2) + 1, vz: vz + dz * 6 + rnd(3), life: 0.35, s0: 0.25, s1: 0.05, a0: 1, a1: 0, rot: 0, cell: CELL.SPARK, c0: cols[0], c1: cols[1], stretch: 3, grav: 6 });
    },
    /** Exhaust backfire pop on lift-off. */
    backfire(x, y, z, dx, dz, vx, vz) {
      for (let i = 0; i < 4; i++) P.add.spawn({ x, y, z, vx: vx + dx * (4 + Math.random() * 4) + rnd(1), vy: rnd(0.8), vz: vz + dz * (4 + Math.random() * 4) + rnd(1), life: 0.12 + Math.random() * 0.06, s0: 0.5, s1: 0.1, a0: 1, a1: 0, rot: Math.random() * 6, cell: CELL.FLAME, c0: [3, 2, 0.8], c1: [2, 0.4, 0.05] });
      P.add.spawn({ x, y, z, vx, vy: 0, vz, life: 0.08, s0: 1.3, s1: 1.6, a0: 0.8, a1: 0, rot: 0, cell: CELL.GLOW, c0: [2.4, 1, 0.3] });
    },
    sparks(x, y, z, nx, nz, n = 10, speed = 8, col = [3, 2, 0.8]) {
      for (let i = 0; i < n; i++) P.add.spawn({ x, y, z, vx: nx * speed * (0.4 + Math.random()) + rnd(speed * 0.5), vy: 1 + Math.random() * speed * 0.5, vz: nz * speed * (0.4 + Math.random()) + rnd(speed * 0.5), life: 0.3 + Math.random() * 0.35, s0: 0.22, s1: 0.06, a0: 1, a1: 0.4, rot: 0, cell: CELL.SPARK, c0: col, c1: [2, 0.5, 0.1], stretch: 2.5, grav: 14, floor: 0.05, bounce: 0.35 });
    },
    impact(x, y, z, power, color = [0.85, 0.85, 0.9]) {
      fx.sparks(x, y, z, 0, 0, 10 + Math.round(power * 0.6), 6 + power * 0.15);
      for (let i = 0; i < 4 + power * 0.25; i++) P.alpha.spawn({ x, y, z, vx: rnd(5), vy: 2 + Math.random() * 4, vz: rnd(5), life: 0.9 + Math.random() * 0.6, s0: 0.14, s1: 0.1, a0: 1, a1: 1, rot: Math.random() * 6, spin: rnd(12), cell: CELL.CHIP, c0: Math.random() < 0.5 ? color : [0.7, 0.85, 1], grav: 12, floor: 0.03, bounce: 0.3 });
      for (let i = 0; i < 5; i++) P.alpha.spawn({ x: x + rnd(0.6), y: y + 0.2, z: z + rnd(0.6), vx: rnd(1.5), vy: 1 + Math.random(), vz: rnd(1.5), life: 1, s0: 0.8, s1: 2.8, a0: 0.4, a1: 0, rot: Math.random() * 6, cell: CELL.SMOKE, c0: [0.75, 0.73, 0.72], drag: 1.6 });
      P.add.spawn({ x, y, z, vx: 0, vy: 0, vz: 0, life: 0.15, s0: 2.5 + power * 0.08, s1: 4, a0: 0.9, a1: 0, rot: 0, cell: CELL.GLOW, c0: [2.2, 1.6, 1] });
    },
    burst(x, y, z, kind = "near", mult = 1) {
      const s = style.burst, c = fx.accent(1.2);
      const n = kind === "takedown" ? 10 : 4 + mult;
      if (s === "graffiti") {
        for (let i = 0; i < n; i++) P.alpha.spawn({ x: x + rnd(1), y: y + 0.5 + Math.random(), z: z + rnd(1), vx: rnd(4), vy: 2 + Math.random() * 3, vz: rnd(4), life: 0.7 + Math.random() * 0.3, s0: 0.4, s1: kind === "takedown" ? 1.6 : 1.0, a0: 1, a1: 0, rot: Math.random() * 6, spin: rnd(5), cell: i % 3 ? CELL.STAR : CELL.SPLAT, c0: i % 2 ? c : [1, 1, 1], drag: 2.2, ease: 1 });
        P.alpha.spawn({ x, y: y + 1, z, vx: 0, vy: 0.5, vz: 0, life: 0.45, s0: 1.2, s1: kind === "takedown" ? 6 : 3.4, a0: 1, a1: 0, rot: Math.random(), cell: CELL.BURST, c0: c, ease: 1 });
      } else if (s === "electric") {
        for (let i = 0; i < n; i++) P.add.spawn({ x: x + rnd(1.5), y: y + 0.8 + Math.random() * 1.5, z: z + rnd(1.5), vx: rnd(1), vy: rnd(1), vz: rnd(1), life: 0.18 + Math.random() * 0.12, s0: 1.4, s1: 1.8, a0: 1, a1: 0, rot: Math.random() * 6, cell: CELL.BOLT, c0: [0.8, 1.6, 3] });
        for (let i = 0; i < n * 2; i++) P.add.spawn({ x, y: y + 1, z, vx: rnd(6), vy: rnd(6) + 2, vz: rnd(6), life: 0.35, s0: 0.5, s1: 0.1, a0: 1, a1: 0, rot: Math.random() * 6, cell: CELL.SPARKLE, c0: [1, 2.4, 3], drag: 3 });
      } else {
        P.add.spawn({ x, y: y + 0.8, z, vx: 0, vy: 0, vz: 0, life: 0.35, s0: 1, s1: kind === "takedown" ? 9 : 5, a0: 0.8, a1: 0, rot: 0, cell: CELL.RING, c0: c, ease: 1 });
      }
    },
    /** Engine damage smoke / fire from the bonnet (hp 0..100). */
    damage(x, y, z, hp, vx, vz, dt) {
      if (hp > 62) return;
      const k = (62 - hp) / 62;
      if (Math.random() < dt * (8 + 22 * k)) P.alpha.spawn({ x: x + rnd(0.3), y: y + 0.2, z: z + rnd(0.3), vx: vx * 0.5 + rnd(0.6), vy: 1.8 + Math.random() * 1.4, vz: vz * 0.5 + rnd(0.6), life: 0.9 + k * 0.8, s0: 0.35, s1: 1.3 + k * 1.5, a0: 0.3 + k * 0.25, a1: 0, rot: Math.random() * 6, spin: rnd(0.8), cell: hp < 35 ? CELL.DARK : CELL.SMOKE, c0: hp < 35 ? [0.42, 0.4, 0.4] : [0.82, 0.82, 0.84], drag: 0.9, fadeIn: 0.1, ease: 1 });
      if (hp < 30 && Math.random() < dt * (8 + 40 * (1 - hp / 30))) P.add.spawn({ x: x + rnd(0.35), y: y + 0.15, z: z + rnd(0.35), vx: vx * 0.8 + rnd(0.5), vy: 1.4 + Math.random() * 1.5, vz: vz * 0.8 + rnd(0.5), life: 0.3 + Math.random() * 0.25, s0: 0.7, s1: 0.2, a0: 1, a1: 0, rot: rnd(0.5), cell: CELL.FLAME, c0: [2.6, 1.5, 0.5], c1: [1.8, 0.35, 0.05] });
      if (hp < 22 && Math.random() < dt * 4) fx.sparks(x, y, z, rnd(1), rnd(1), 3, 4);
    },
    explosion(x, y, z, big = 1) {
      for (let i = 0; i < 46 * big; i++) {
        const a = Math.random() * Math.PI * 2, u = Math.random(), sp = 4 + u * 11;
        P.add.spawn({ x: x + rnd(0.8), y: y + 0.6 + Math.random(), z: z + rnd(0.8), vx: Math.cos(a) * sp, vy: 2 + Math.random() * 9, vz: Math.sin(a) * sp, life: 0.6 + Math.random() * 0.6, s0: 2.6 + Math.random() * 2, s1: 0.8, a0: 1, a1: 0, rot: Math.random() * 6, spin: rnd(2), cell: CELL.FLAME, c0: [2.6, 1.7, 0.75], c1: [1.6, 0.28, 0.04], drag: 2.8 });
      }
      for (let i = 0; i < 40 * big; i++) P.alpha.spawn({ x: x + rnd(2), y: y + 1 + Math.random() * 2, z: z + rnd(2), vx: rnd(4), vy: 2 + Math.random() * 5, vz: rnd(4), life: 2.6 + Math.random() * 2.5, s0: 2, s1: 9 + Math.random() * 5, a0: 0.75, a1: 0, rot: Math.random() * 6, spin: rnd(0.5), cell: CELL.DARK, c0: [0.3, 0.27, 0.27], c1: [0.5, 0.48, 0.5], drag: 1.2, fadeIn: 0.15, ease: 1 });
      for (let i = 0; i < 70 * big; i++) P.add.spawn({ x, y: y + 1, z, vx: rnd(18), vy: 4 + Math.random() * 14, vz: rnd(18), life: 0.6 + Math.random() * 0.9, s0: 0.3, s1: 0.06, a0: 1, a1: 0.3, rot: 0, cell: CELL.SPARK, c0: [3, 2.2, 1], c1: [2, 0.6, 0.1], stretch: 3, grav: 16, floor: 0.05, bounce: 0.4 });
      for (let i = 0; i < 30 * big; i++) P.alpha.spawn({ x, y: y + 1, z, vx: rnd(10), vy: 5 + Math.random() * 9, vz: rnd(10), life: 2 + Math.random(), s0: 0.35, s1: 0.3, a0: 1, a1: 1, rot: Math.random() * 6, spin: rnd(14), cell: CELL.CHIP, c0: Math.random() < 0.6 ? [0.08, 0.08, 0.09] : [0.6, 0.6, 0.62], grav: 15, floor: 0.04, bounce: 0.35 });
      P.add.spawn({ x, y: y + 1.5, z, vx: 0, vy: 0, vz: 0, life: 0.45, s0: 8, s1: 18, a0: 0.8, a1: 0, rot: 0, cell: CELL.GLOW, c0: [2.2, 1.3, 0.6] });
      P.flatAdd.spawn({ x, y: 0.12, z, vx: 0, vy: 0, vz: 0, life: 0.7, s0: 2, s1: 36, a0: 1, a1: 0, rot: 0, cell: CELL.RING, c0: [2.4, 1.6, 1], ease: 1 });
      P.flat.spawn({ x, y: 0.05, z, vx: 0, vy: 0, vz: 0, life: 30, s0: 9, s1: 9.5, a0: 0.75, a1: 0, rot: Math.random() * 6, cell: CELL.DARK, c0: [0.05, 0.05, 0.05] });
    },
    /** Burning wreck (call per frame). */
    burning(x, y, z, dt, k = 1) {
      if (Math.random() < dt * 30 * k) P.add.spawn({ x: x + rnd(1), y: y + 0.6, z: z + rnd(1.4), vx: rnd(0.5), vy: 2 + Math.random() * 2.5, vz: rnd(0.5), life: 0.45 + Math.random() * 0.3, s0: 1.3, s1: 0.3, a0: 1, a1: 0, rot: rnd(0.4), cell: CELL.FLAME, c0: [3, 1.8, 0.6], c1: [2, 0.3, 0.04] });
      if (Math.random() < dt * 12 * k) P.alpha.spawn({ x: x + rnd(0.8), y: y + 1.6, z: z + rnd(0.8), vx: rnd(0.8), vy: 2.4 + Math.random() * 1.5, vz: rnd(0.8), life: 3 + Math.random() * 2, s0: 1.5, s1: 8, a0: 0.6, a1: 0, rot: Math.random() * 6, spin: rnd(0.4), cell: CELL.DARK, c0: [0.22, 0.2, 0.2], drag: 0.6, fadeIn: 0.2, ease: 1 });
    },
    repair(x, y, z) {
      for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; P.add.spawn({ x: x + Math.cos(a) * 2.6, y: y + 0.2, z: z + Math.sin(a) * 2.6, vx: Math.cos(a) * 0.4, vy: 2 + Math.random() * 3, vz: Math.sin(a) * 0.4, life: 1 + Math.random() * 0.6, s0: 0.55, s1: 0.1, a0: 1, a1: 0, rot: Math.random() * 6, spin: rnd(3), cell: CELL.SPARKLE, c0: i % 2 ? [0.4, 3, 1.8] : [1.4, 3, 3], drag: 0.5 }); }
      for (let i = 0; i < 6; i++) P.add.spawn({ x: x + rnd(1.5), y: y + 1 + Math.random(), z: z + rnd(1.5), vx: rnd(0.4), vy: 1.5 + Math.random(), vz: rnd(0.4), life: 1.3, s0: 0.9, s1: 0.6, a0: 1, a1: 0, rot: rnd(0.5), spin: rnd(1), cell: CELL.WRENCH, c0: [0.5, 2.8, 1.8] });
      P.flatAdd.spawn({ x, y: 0.1, z, vx: 0, vy: 0, vz: 0, life: 0.9, s0: 2, s1: 16, a0: 1, a1: 0, rot: 0, cell: CELL.RING, c0: [0.4, 2.6, 1.6], ease: 1 });
      P.add.spawn({ x, y: y + 1, z, vx: 0, vy: 0, vz: 0, life: 0.4, s0: 5, s1: 9, a0: 0.8, a1: 0, rot: 0, cell: CELL.GLOW, c0: [0.6, 2.4, 1.6] });
    },
    skid(x, z, dx, dz, len, a = 0.5) {
      P.flat.spawn({ x, y: 0.035, z, vx: 0, vy: 0, vz: 0, life: 7, s0: 0.3, s1: 0.3, a0: a, a1: 0, rot: Math.atan2(-dx, dz), stretch: len / 0.3 - 1, cell: CELL.SKID, c0: [1, 1, 1] });
    },
    tireStreak(x, z, dx, dz, len, color) {
      P.flatAdd.spawn({ x, y: 0.05, z, vx: 0, vy: 0, vz: 0, life: 0.9, s0: 0.22, s1: 0.18, a0: 0.9, a1: 0, rot: Math.atan2(-dx, dz), stretch: len / 0.22 - 1, cell: CELL.GLOW, c0: color });
    },
    fountain(x, z, r) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * r * 0.25;
      P.alpha.spawn({ x, y: 2.6, z, vx: Math.cos(a) * sp, vy: 5 + Math.random() * 3, vz: Math.sin(a) * sp, life: 1.3, s0: 0.5, s1: 0.9, a0: 0.75, a1: 0.1, rot: 0, cell: CELL.DROP, c0: [0.8, 0.9, 1], grav: 9.5, floor: 0.6 });
    },
    hydrant(x, z) { emitters.push({ kind: "geyser", x, z, t: 5 }); },
    beacon(x, y, z, time) {
      const bob = Math.sin(time / 500) * 0.3;
      P.add.spawn({ x, y: y + bob, z, vx: 0, vy: 0, vz: 0, life: 0.034, s0: 2.6, s1: 2.6, a0: 1, a1: 1, rot: Math.sin(time / 900) * 0.5, cell: CELL.WRENCH, c0: [0.4, 2.6, 1.6] });
      P.add.spawn({ x, y: y + bob, z, vx: 0, vy: 0, vz: 0, life: 0.034, s0: 6, s1: 6, a0: 0.5, a1: 0.5, rot: 0, cell: CELL.GLOW, c0: [0.2, 1.4, 0.9] });
    },
    lighthouse(x, y, z, time) {
      const k = 0.5 + 0.5 * Math.sin(time / 400);
      P.add.spawn({ x, y, z, vx: 0, vy: 0, vz: 0, life: 0.034, s0: 4 + 10 * k * k, s1: 4 + 10 * k * k, a0: 0.4 + 0.6 * k, a1: 0.4 + 0.6 * k, rot: 0, cell: CELL.GLOW, c0: [2.4, 2.1, 1.4] });
    },
    /** Takedown reward: ~24 gold and cyan sparkles stream from the wreck at (x, z) into your car over
        about 0.5 s and pop on arrival. `target` is any live {x, z} (the hero's position), so the stream
        follows the car at speed. Visual only. */
    absorb(x, z, target, n = 24, cyan = false) {
      const parts = [];
      for (let i = 0; i < n; i++) {
        const gold = cyan ? i % 3 === 0 : i % 3 !== 0;
        const p = P.add.spawn({ x, y: 1.2, z, vx: 0, vy: 0, vz: 0, life: 9, s0: 0.55, s1: 0.55, a0: 1, a1: 1, rot: Math.random() * 6, spin: rnd(6), cell: i % 4 ? CELL.SPARKLE : CELL.STAR, c0: gold ? [3, 2.3, 0.7] : [0.7, 2.6, 3] });
        parts.push({ p, ox: rnd(1.6), oy: Math.random() * 1.5, oz: rnd(1.6), side: rnd(5), lift: 2.5 + Math.random() * 3, delay: Math.random() * 0.16, dur: 0.38 + Math.random() * 0.14 });
      }
      emitters.push({ kind: "absorb", x, z, target, parts, age: 0, t: 1.2, popped: false });
    },
    /** Gold ring that blooms on the ground under the car. */
    goldRing(x, z, cyan = false) {
      P.flatAdd.spawn({ x, y: 0.1, z, vx: 0, vy: 0, vz: 0, life: 0.6, s0: 2, s1: 14, a0: 1, a1: 0, rot: 0, cell: CELL.RING, c0: cyan ? [0.6, 2.4, 3] : [3, 2.2, 0.7], ease: 1 });
      P.add.spawn({ x, y: 1, z, vx: 0, vy: 0, vz: 0, life: 0.3, s0: 3, s1: 7, a0: 0.7, a1: 0, rot: 0, cell: CELL.GLOW, c0: cyan ? [0.6, 2, 2.6] : [2.6, 1.9, 0.6] });
    },
    confetti(x, y, z, n = 40) {
      for (let i = 0; i < n; i++) P.alpha.spawn({ x: x + rnd(5), y: y + 4 + Math.random() * 4, z: z + rnd(5), vx: rnd(3), vy: 2 + Math.random() * 3, vz: rnd(3), life: 2.2, s0: 0.45, s1: 0.4, a0: 1, a1: 0.6, rot: Math.random() * 6, spin: rnd(6), cell: i % 3 ? CELL.STAR : CELL.SPARKLE, c0: rgb(ACCENTS[i % 6], 1.1), grav: 3, drag: 0.8 });
    },
    update(dt) {
      t += dt;
      for (let i = emitters.length - 1; i >= 0; i--) {
        const e = emitters[i];
        e.t -= dt;
        if (e.kind === "geyser") for (let k = 0; k < 3; k++) P.alpha.spawn({ x: e.x + rnd(0.15), y: 0.8, z: e.z + rnd(0.15), vx: rnd(1.2), vy: 9 + Math.random() * 4, vz: rnd(1.2), life: 1.6, s0: 0.4, s1: 1.2, a0: 0.8, a1: 0, rot: 0, cell: CELL.DROP, c0: [0.85, 0.92, 1], grav: 9.8, floor: 0.05 });
        if (e.kind === "absorb") {
          e.age += dt;
          const tx = e.target.x, tz = e.target.z;
          let left = 0;
          for (const q of e.parts) {
            const p = q.p;
            if (p.age >= p.life) continue;
            const u = Math.max(0, Math.min(1, (e.age - q.delay) / q.dur));
            if (u >= 1) { p.life = p.age; continue; }
            left++;
            // quadratic arc: up and sideways out of the wreck, then down into the car
            const ease = u * u * (3 - 2 * u), m = 1 - ease;
            const sx = e.x + q.ox, sz = e.z + q.oz, cx = (sx + tx) / 2 + q.side * (tz - sz) * 0.02, cz = (sz + tz) / 2 - q.side * (tx - sx) * 0.02;
            p.x = m * m * sx + 2 * m * ease * cx + ease * ease * tx;
            p.z = m * m * sz + 2 * m * ease * cz + ease * ease * tz;
            p.y = m * m * (1.2 + q.oy) + 2 * m * ease * (1.2 + q.lift) + ease * ease * 1;
            p.vx = p.vy = p.vz = 0;
            p.s0 = p.s1 = 0.55 - 0.25 * u;
          }
          if (!e.popped && e.age > 0.3 && left < e.parts.length * 0.5) { e.popped = true; P.add.spawn({ x: tx, y: 1, z: tz, vx: 0, vy: 0, vz: 0, life: 0.25, s0: 2.5, s1: 5, a0: 0.8, a1: 0, rot: 0, cell: CELL.GLOW, c0: [2.6, 2, 0.8] }); }
          if (!left && e.age > 0.2) e.t = 0;
        }
        if (e.t <= 0) emitters.splice(i, 1);
      }
    },
    clear() { for (const e of emitters) if (e.parts) for (const q of e.parts) q.p.life = q.p.age; emitters.length = 0; },
  };
  return fx;
}
