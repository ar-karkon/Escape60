import * as T from "../../vendor/three.js";
import { VoxelBuilder, P } from "./voxel.js";

/* Ambient pedestrians: purely visual, never read by the simulation.
   They stroll the sidewalks, wait, chat, use crosswalks and leap out of the way of any car.
   All pedestrians share 7 instanced meshes (one per body part) — 7 draw calls in total. */
const TILE = 52, WALK = 10.3, CAP = 96;
const SKIN = [0xf1c7a5, 0xd9a27a, 0xb07a55, 0x8a5a3c, 0xe8b48c];
const TOPS = [0xff5d95, 0x3dd8e7, 0xffe37c, 0xffffff, 0x8d54e9, 0xff8a3d, 0x5dffb0, 0x2a2a3a, 0xe85a7a, 0x19b8bc, 0xf2e8dd];
const LEGS = [0x2b3a6a, 0xe8e2d6, 0x3a2a2a, 0x23203a, 0x7a5a3a, 0x19b8bc];
const HAIR = [0x2a1a14, 0x7a4a2a, 0xe8c070, 0x111111, 0xd05a3a, 0xc7a0ff];

function part(build) { const b = new VoxelBuilder(64); build(b); return b.geometry(); }
const GEO = {
  legL: part((b) => b.box(0, -0.42, 0, 0.17, 0.84, 0.2, 0xffffff, { n: 0.2, skip: 0 })),
  legR: part((b) => b.box(0, -0.42, 0, 0.17, 0.84, 0.2, 0xffffff, { n: 0.2, skip: 0 })),
  torso: part((b) => { b.box(0, 0.3, 0, 0.44, 0.62, 0.27, 0xffffff, { n: 0.3, skip: 0 }); b.box(0, 0.02, 0, 0.42, 0.08, 0.26, 0xdddddd, { skip: 0 }); }),
  armL: part((b) => b.box(0, -0.25, 0, 0.11, 0.52, 0.14, 0xffffff, { n: 0.2, skip: 0 })),
  armR: part((b) => b.box(0, -0.25, 0, 0.11, 0.52, 0.14, 0xffffff, { n: 0.2, skip: 0 })),
  head: part((b) => { b.box(0, 0, 0, 0.3, 0.32, 0.3, 0xffffff, { n: 0.15, skip: 0 }); b.box(0, 0.02, 0.155, 0.2, 0.05, 0.01, 0x222222, { p: P.PLAIN }); }),
  hair: part((b) => { b.box(0, 0.13, -0.02, 0.33, 0.1, 0.34, 0xffffff, { n: 0.3, skip: 0 }); b.box(0, 0.02, -0.15, 0.33, 0.2, 0.06, 0xffffff, { skip: 0 }); }),
};
const PARTS = Object.keys(GEO);

export function createPeds(scene, material) {
  const meshes = {};
  for (const k of PARTS) {
    const m = new T.InstancedMesh(GEO[k], material, CAP);
    m.instanceMatrix.setUsage(T.DynamicDrawUsage);
    m.setColorAt(0, new T.Color(1, 1, 1));
    m.frustumCulled = false;
    m.castShadow = true;
    m.count = 0;
    scene.add(m);
    meshes[k] = m;
  }
  const peds = [];
  const dummy = new T.Object3D();
  const col = new T.Color();
  let seedN = 1;
  const rnd = () => { seedN = (seedN * 16807) % 2147483647; return (seedN - 1) / 2147483646; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];

  let net = null;
  // Is the sidewalk at (axis, line, along-u) next to an open street?
  const walkable = (axis, line, u) => {
    if (!net) return true;
    const li = Math.round(line / TILE), ci = Math.floor(u / TILE);
    const st = axis === "z" ? net.seg(0, li, ci) : net.seg(1, ci, li);
    if (st === 1) return true;
    if (st === 0) return false;
    const local = u - ci * TILE;
    return st === 2 ? local < 30 : local > 22;
  };
  function place(p, cx, cz, hx, hz, minD, maxD, ahead) {
    for (let k = 0; k < 8; k++) { placeOnce(p, cx, cz, hx, hz, minD, maxD, ahead); if (walkable(p.axis, p.line, p.u)) return; }
  }
  function placeOnce(p, cx, cz, hx, hz, minD, maxD, ahead) {
    // Random sidewalk spot on the street grid around (cx, cz), biased ahead of the player.
    const d = minD + rnd() * (maxD - minD);
    const spread = ahead ? (rnd() - 0.5) * 1.4 : rnd() * Math.PI * 2;
    const base = ahead ? Math.atan2(hz, hx) + spread : spread;
    const tx = cx + Math.cos(base) * d, tz = cz + Math.sin(base) * d;
    p.axis = rnd() < 0.5 ? "x" : "z";
    p.line = Math.round((p.axis === "z" ? tx : tz) / TILE) * TILE;
    p.side = rnd() < 0.5 ? -1 : 1;
    p.lat = p.side * (WALK + (rnd() - 0.5) * 1.2);
    p.u = p.axis === "z" ? tz : tx;
    const cell = Math.floor(p.u / TILE) * TILE;
    p.u = Math.min(cell + 41, Math.max(cell + 11, p.u));
    p.dir = rnd() < 0.5 ? -1 : 1;
    p.speed = 1.05 + rnd() * 0.65;
    p.mode = rnd() < 0.2 ? "idle" : "walk";
    p.timer = 1 + rnd() * 5;
    p.phase = rnd() * 6;
    p.cross = 0;
    p.hop = 0; p.fleeLat = 0; p.fleeU = 0; p.fleeUTarget = 0; p.fleeTarget = 0; p.panic = 0;
    p.colors = [pick(LEGS), pick(TOPS), pick(SKIN), pick(HAIR)];
    p.scale = 0.92 + rnd() * 0.18;
  }
  function world(p) {
    const lat = p.lat + p.fleeLat;
    return p.axis === "z" ? [p.line + lat, p.u + p.fleeU] : [p.u + p.fleeU, p.line + lat];
  }

  return {
    clear() { peds.length = 0; },
    update(dt, time, cx, cz, hx, hz, threats, reduced, count = 72, map = null) {
      if (map !== net) { net = map; peds.length = 0; }
      if (peds.length < count) {
        const fresh = !peds.length;
        while (peds.length < count) { const p = {}; place(p, cx, cz, hx, hz, fresh ? 6 : 62, fresh ? 85 : 92, !fresh); peds.push(p); }
      }
      let n = 0;
      for (const p of peds) {
        let [x, z] = world(p);
        const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
        // Recycle walkers that fell far behind, to a sidewalk ahead beyond the fogged distance.
        if (d2 > 95 * 95 || (dx * hx + dz * hz < -38 && d2 > 30 * 30)) { place(p, cx, cz, hx, hz, 64, 92, true); [x, z] = world(p); }
        // ---- threat avoidance: any car heading at us -> leap toward the wall side / nearest curb
        let threat = null;
        for (const c of threats) {
          const rx = x - c.x, rz = z - c.z, dd = rx * rx + rz * rz;
          if (dd > 110) continue;
          const sp = Math.hypot(c.vx, c.vz) || 1, along = (rx * c.vx + rz * c.vz) / sp;
          const lateral = Math.abs(rx * c.vz - rz * c.vx) / sp;
          if (along > -1.5 && along < 9 && lateral < 3.4) { threat = c; break; }
        }
        if (threat && p.panic <= 0) {
          p.panic = 1.1;
          p.mode = "flee";
          const localU = p.u - Math.round(p.u / TILE) * TILE;
          p.fleeUTarget = 0;
          if (Math.abs(localU) < 9.4 && Math.abs(p.lat) >= 9.2) {
            // On a crosswalk of the cross street: jump back onto the nearest sidewalk corner.
            p.fleeTarget = Math.sign(p.lat) * 11.55 - p.lat;
            p.fleeUTarget = (Math.sign(localU) || 1) * 10.8 - localU;
          } else {
            // Cars cannot reach |lat| >= 11.4 (building footprint), so the wall side is always safe.
            const inRoad = Math.abs(p.lat) < 9.2;
            p.fleeTarget = ((inRoad && p.cross ? Math.sign(p.cross) : Math.sign(p.lat)) || 1) * 11.55 - p.lat;
          }
        }
        if (p.panic > 0) {
          p.panic -= dt;
          p.fleeLat += (p.fleeTarget - p.fleeLat) * Math.min(1, dt * 9);
          p.fleeU += (p.fleeUTarget - p.fleeU) * Math.min(1, dt * 9);
          p.hop = Math.max(0, Math.sin(Math.min(1, (1.1 - p.panic) / 0.45) * Math.PI)) * 0.55;
          p.phase += dt * 16;
          if (p.panic <= 0) { p.lat += p.fleeLat; p.fleeLat = 0; p.u += p.fleeU; p.fleeU = 0; p.mode = "walk"; p.speed = 1.7 + rnd() * 0.5; p.timer = 2; }
        } else if (p.mode === "idle") {
          p.timer -= dt;
          p.phase += dt * 1.2;
          if (p.timer <= 0) { p.mode = "walk"; p.timer = 3 + rnd() * 6; }
        } else {
          p.u += p.dir * p.speed * dt;
          p.phase += dt * p.speed * 5.2;
          // turn back where the sidewalk ends (closed street, dead end)
          if (!p.cross && !walkable(p.axis, p.line, p.u + p.dir * 1.5)) { p.u -= p.dir * p.speed * dt; p.dir *= -1; }
          if (p.cross) {
            // crossing the main road along a crosswalk: move laterally to the other side
            const target = -Math.sign(p.cross) * WALK;
            p.u -= p.dir * p.speed * dt;
            p.lat += Math.sign(target - p.lat) * p.speed * 1.15 * dt;
            if (Math.abs(target - p.lat) < 0.15) { p.lat = target; p.cross = 0; p.side = Math.sign(target); }
          } else {
            const cell = Math.floor(p.u / TILE) * TILE, local = p.u - cell;
            const atEnd = (p.dir > 0 && local > 41 && local < 43) || (p.dir < 0 && local < 11 && local > 9);
            if (atEnd && !p.decided) {
              p.decided = true;
              const r = rnd();
              if (r < 0.28) p.dir *= -1;
              else if (r < 0.42 && net && net.degree(Math.round((p.axis === "z" ? p.line : p.u) / TILE), Math.round((p.axis === "z" ? p.u : p.line) / TILE)) >= 3) { p.cross = p.side; }
              else if (r < 0.52) { p.mode = "idle"; p.timer = 1 + rnd() * 3; }
            }
            if (!atEnd) p.decided = false;
            p.timer -= dt;
            if (p.timer <= 0) { p.timer = 4 + rnd() * 8; if (rnd() < 0.3) { p.mode = "idle"; p.timer = 1.5 + rnd() * 4; } }
          }
        }
        [x, z] = world(p);
        if (n >= CAP) continue;
        // ---- pose
        const latAbs = Math.abs(p.lat + p.fleeLat);
        const uAbs = Math.abs(p.u + p.fleeU - Math.round((p.u + p.fleeU) / TILE) * TILE);
        const ground = latAbs >= 9.2 && uAbs >= 9.2 ? 0.2 : 0;
        let yaw;
        if (p.mode === "flee") yaw = p.axis === "z" ? (p.fleeTarget > 0 ? Math.PI / 2 : -Math.PI / 2) : (p.fleeTarget > 0 ? 0 : Math.PI);
        else if (p.cross) yaw = p.axis === "z" ? (p.cross > 0 ? -Math.PI / 2 : Math.PI / 2) : (p.cross > 0 ? Math.PI : 0);
        else if (p.mode === "idle") yaw = p.axis === "z" ? (p.side > 0 ? -Math.PI / 2 : Math.PI / 2) : (p.side > 0 ? Math.PI : 0);
        else yaw = p.axis === "z" ? (p.dir > 0 ? 0 : Math.PI) : (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        const walking = p.mode !== "idle";
        const swing = reduced ? 0 : walking ? Math.sin(p.phase) * (p.mode === "flee" ? 0.9 : 0.5) : Math.sin(p.phase) * 0.05;
        const bob = walking && !reduced ? Math.abs(Math.cos(p.phase)) * 0.05 : 0;
        const s = p.scale, hip = ground + 0.84 * s + bob + p.hop;
        const cy = Math.cos(yaw), sy = Math.sin(yaw);
        const put = (k, lx, ly, lz, pitch, color) => {
          dummy.position.set(x + lx * cy + lz * sy, ly, z - lx * sy + lz * cy);
          dummy.rotation.set(pitch, yaw, 0, "YXZ");
          dummy.scale.setScalar(s);
          dummy.updateMatrix();
          meshes[k].setMatrixAt(n, dummy.matrix);
          meshes[k].setColorAt(n, col.setHex(color));
        };
        const [cLeg, cTop, cSkin, cHair] = p.colors;
        const armUp = p.mode === "flee" ? -2.6 : 0;
        put("legL", 0.1 * s, hip, 0, swing, cLeg);
        put("legR", -0.1 * s, hip, 0, -swing, cLeg);
        put("torso", 0, hip, 0, p.mode === "flee" ? -0.2 : 0, cTop);
        put("armL", 0.29 * s, hip + 0.56 * s, 0, armUp || -swing * 0.9, cTop);
        put("armR", -0.29 * s, hip + 0.56 * s, 0, armUp ? armUp + 0.3 : swing * 0.9, cTop);
        put("head", 0, hip + 0.82 * s, 0, 0, cSkin);
        put("hair", 0, hip + 0.82 * s, 0, 0, cHair);
        n++;
      }
      for (const k of PARTS) {
        const m = meshes[k];
        m.count = n;
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    },
  };
}
