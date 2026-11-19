import * as T from "../../vendor/three.js";

/* Pooled voxel particles. All visual only; never read by the simulation. */
const box = new T.BoxGeometry(1, 1, 1);
const dummy = new T.Object3D();
const tmpColor = new T.Color();

class Pool {
  constructor(scene, material, cap) {
    this.mesh = new T.InstancedMesh(box, material, cap);
    this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.mesh.setColorAt(0, tmpColor.set(0xffffff));
    this.mesh.instanceColor.setUsage(T.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.items = [];
    this.cap = cap;
    scene.add(this.mesh);
  }
  spawn(p) {
    if (this.items.length >= this.cap) this.items.shift();
    this.items.push(p);
  }
  clear() { this.items.length = 0; this.mesh.count = 0; }
}

const SKID_VERT = `varying float vA; void main(){ vA=instanceColor.r; gl_Position=projectionMatrix*viewMatrix*modelMatrix*instanceMatrix*vec4(position,1.); }`;
const SKID_FRAG = `varying float vA; void main(){ gl_FragColor=vec4(.02,.015,.03,vA*.75); }`;

export function createFX(scene) {
  // Flat, bright two-tone smoke (cel look); the depth ink pass outlines it.
  const smokeMat = new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0x6c5a82 });
  const sparkMat = new T.MeshBasicMaterial({ color: 0xffffff });
  const skidMat = new T.ShaderMaterial({ vertexShader: SKID_VERT, fragmentShader: SKID_FRAG, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const smoke = new Pool(scene, smokeMat, 320);
  const sparks = new Pool(scene, sparkMat, 140);
  const skids = new Pool(scene, skidMat, 360);
  skids.mesh.renderOrder = 1;
  return {
    smoke, sparks, skids,
    puff(x, y, z, vx, vz, color = 0xf2dbe8, size = 1) {
      smoke.spawn({ x, y, z, vx, vy: 0.9 + Math.random() * 0.8, vz, age: 0, life: 0.7 + Math.random() * 0.5, size: size * (0.55 + Math.random() * 0.5), color, spin: Math.random() * 3 });
    },
    spark(x, y, z, speed = 9, color = 0xffd27a, k = 6) {
      const a = Math.random() * Math.PI * 2, u = Math.random();
      sparks.spawn({ x, y, z, vx: Math.cos(a) * speed * (0.3 + u), vy: 2 + Math.random() * speed * 0.7, vz: Math.sin(a) * speed * (0.3 + u), age: 0, life: 0.3 + Math.random() * 0.3, size: 0.07 + Math.random() * 0.07, color, k, g: 18 });
    },
    confetti(x, y, z) {
      const cols = [0xffe37c, 0xff5d95, 0x3dd8e7, 0xc77dff, 0x5dffb0];
      const a = Math.random() * Math.PI * 2, r = Math.random() * 7;
      sparks.spawn({ x: x + Math.cos(a) * r, y: y + 6 + Math.random() * 6, z: z + Math.sin(a) * r, vx: (Math.random() - 0.5) * 2, vy: -1 - Math.random() * 2, vz: (Math.random() - 0.5) * 2, age: 0, life: 2.8, size: 0.38, color: cols[Math.floor(Math.random() * cols.length)], k: 1.6, g: 1.2, spin: Math.random() * 8 });
    },
    skid(x, z, yaw, len = 0.9) {
      skids.spawn({ x, z, yaw, len, age: 0, life: 4.5 });
    },
    clear() { smoke.clear(); sparks.clear(); skids.clear(); },
    update(dt) {
      // smoke
      let n = 0;
      smoke.items = smoke.items.filter((p) => (p.age += dt) < p.life);
      for (const p of smoke.items) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vx *= 1 - dt * 2.5; p.vz *= 1 - dt * 2.5;
        const t = p.age / p.life;
        const s = p.size * (t < 0.25 ? 0.4 + t * 2.6 : 1.05 * (1 - (t - 0.25) / 0.75) + 0.08);
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, p.spin + t, 0);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        smoke.mesh.setMatrixAt(n, dummy.matrix);
        smoke.mesh.setColorAt(n, tmpColor.set(p.color));
        n++;
      }
      smoke.mesh.count = n;
      smoke.mesh.instanceMatrix.needsUpdate = true;
      smoke.mesh.instanceColor.needsUpdate = true;
      // sparks + confetti
      n = 0;
      sparks.items = sparks.items.filter((p) => (p.age += dt) < p.life);
      for (const p of sparks.items) {
        p.vy -= p.g * dt;
        p.x += p.vx * dt; p.y = Math.max(0.05, p.y + p.vy * dt); p.z += p.vz * dt;
        const t = p.age / p.life;
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(p.spin ? p.age * p.spin : 0, p.spin ? p.age * p.spin * 0.7 : Math.atan2(p.vx, p.vz), 0);
        const s = p.size * (1 - t * 0.6);
        dummy.scale.set(s, s, p.spin ? s * 0.3 : s * 2.4);
        dummy.updateMatrix();
        sparks.mesh.setMatrixAt(n, dummy.matrix);
        tmpColor.set(p.color).multiplyScalar(p.k * (1 - t * 0.5));
        sparks.mesh.setColorAt(n, tmpColor);
        n++;
      }
      sparks.mesh.count = n;
      sparks.mesh.instanceMatrix.needsUpdate = true;
      sparks.mesh.instanceColor.needsUpdate = true;
      // skid marks
      n = 0;
      skids.items = skids.items.filter((p) => (p.age += dt) < p.life);
      for (const p of skids.items) {
        dummy.position.set(p.x, 0.03, p.z);
        dummy.rotation.set(0, p.yaw, 0);
        dummy.scale.set(0.34, 0.01, p.len);
        dummy.updateMatrix();
        skids.mesh.setMatrixAt(n, dummy.matrix);
        skids.mesh.setColorAt(n, tmpColor.setRGB(1 - p.age / p.life, 0, 0));
        n++;
      }
      skids.mesh.count = n;
      skids.mesh.instanceMatrix.needsUpdate = true;
      skids.mesh.instanceColor.needsUpdate = true;
    },
  };
}
