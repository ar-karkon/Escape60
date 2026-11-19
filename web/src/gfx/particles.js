import * as T from "../../vendor/three.js";

/* Instanced billboard particles from one procedural atlas (4 × 4 cells of 128 px):
   0 soft smoke · 1 comic cloud · 2 flame · 3 spark · 4 star · 5 ring · 6 chip · 7 dark smoke
   8 glow · 9 splat · 10 bolt · 11 droplet · 12 wrench · 13 sparkle · 14 burst · 15 skid band */
export const CELL = { SMOKE: 0, COMIC: 1, FLAME: 2, SPARK: 3, STAR: 4, RING: 5, CHIP: 6, DARK: 7, GLOW: 8, SPLAT: 9, BOLT: 10, DROP: 11, WRENCH: 12, SPARKLE: 13, BURST: 14, SKID: 15 };

function atlas() {
  const S = 128, c = document.createElement("canvas");
  c.width = c.height = S * 4;
  const x = c.getContext("2d");
  const at = (i, fn) => { x.save(); x.translate((i % 4) * S, Math.floor(i / 4) * S); x.beginPath(); x.rect(0, 0, S, S); x.clip(); fn(x, S); x.restore(); };
  const R = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const puff = (g, S, col, edge, n = 9) => {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, r = S * (0.12 + R() * 0.12), px = S / 2 + Math.cos(a) * S * 0.18, py = S / 2 + Math.sin(a) * S * 0.16;
      const gr = g.createRadialGradient(px, py, 0, px, py, r * 1.6);
      gr.addColorStop(0, col); gr.addColorStop(1, edge);
      g.fillStyle = gr; g.beginPath(); g.arc(px, py, r * 1.6, 0, Math.PI * 2); g.fill();
    }
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.3);
    gr.addColorStop(0, col); gr.addColorStop(1, edge);
    g.fillStyle = gr; g.beginPath(); g.arc(S / 2, S / 2, S * 0.3, 0, Math.PI * 2); g.fill();
  };
  at(0, (g, S) => puff(g, S, "rgba(255,255,255,0.55)", "rgba(255,255,255,0)"));
  at(1, (g, S) => {
    // comic cloud: flat white lobes, ink outline, halftone shade
    const lobes = [[0.5, 0.52, 0.26], [0.32, 0.56, 0.18], [0.68, 0.56, 0.19], [0.42, 0.36, 0.17], [0.6, 0.38, 0.16]];
    g.fillStyle = "#14121c";
    for (const [lx, ly, lr] of lobes) { g.beginPath(); g.arc(lx * S, ly * S, lr * S + 5, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = "#ffffff";
    for (const [lx, ly, lr] of lobes) { g.beginPath(); g.arc(lx * S, ly * S, lr * S, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = "rgba(120,130,170,0.55)";
    for (let yy = 0; yy < S; yy += 7) for (let xx = (yy / 7) % 2 ? 3 : 0; xx < S; xx += 7) {
      const inside = lobes.some(([lx, ly, lr]) => Math.hypot(xx - lx * S, yy - ly * S) < lr * S - 2);
      if (inside && yy > S * 0.55) { g.beginPath(); g.arc(xx, yy, 1.8 * ((yy - S * 0.55) / (S * 0.45)) + 0.4, 0, Math.PI * 2); g.fill(); }
    }
  });
  at(2, (g, S) => {
    const gr = g.createRadialGradient(S / 2, S * 0.62, 2, S / 2, S * 0.55, S * 0.46);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,230,160,0.95)"); gr.addColorStop(0.6, "rgba(255,120,30,0.55)"); gr.addColorStop(1, "rgba(255,40,0,0)");
    g.fillStyle = gr; g.beginPath(); g.ellipse(S / 2, S * 0.56, S * 0.3, S * 0.44, 0, 0, Math.PI * 2); g.fill();
  });
  at(3, (g, S) => { const gr = g.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(S * 0.42, 0, S * 0.16, S); });
  at(4, (g, S) => {
    g.fillStyle = "#14121c"; star(g, S / 2, S / 2, S * 0.47, S * 0.2, 5); g.fill();
    g.fillStyle = "#ffffff"; star(g, S / 2, S / 2, S * 0.38, S * 0.15, 5); g.fill();
  });
  at(5, (g, S) => { g.strokeStyle = "rgba(255,255,255,1)"; g.lineWidth = S * 0.07; g.beginPath(); g.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2); g.stroke(); g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = S * 0.16; g.stroke(); });
  at(6, (g, S) => { g.fillStyle = "#fff"; g.beginPath(); g.moveTo(S * 0.2, S * 0.3); g.lineTo(S * 0.75, S * 0.18); g.lineTo(S * 0.85, S * 0.7); g.lineTo(S * 0.3, S * 0.85); g.closePath(); g.fill(); });
  at(7, (g, S) => puff(g, S, "rgba(40,36,40,0.8)", "rgba(40,36,40,0)", 11));
  at(8, (g, S) => { const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.3, "rgba(255,255,255,0.45)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, S, S); });
  at(9, (g, S) => {
    g.fillStyle = "#fff"; g.beginPath(); g.arc(S / 2, S / 2, S * 0.24, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2 + R(), r = S * (0.26 + R() * 0.16); g.beginPath(); g.arc(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, S * (0.03 + R() * 0.05), 0, Math.PI * 2); g.fill(); }
  });
  at(10, (g, S) => { g.strokeStyle = "#fff"; g.lineWidth = 6; g.lineJoin = "bevel"; g.beginPath(); g.moveTo(S * 0.55, 4); g.lineTo(S * 0.35, S * 0.45); g.lineTo(S * 0.6, S * 0.5); g.lineTo(S * 0.4, S - 4); g.stroke(); });
  at(11, (g, S) => { const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.4); gr.addColorStop(0, "rgba(255,255,255,0.95)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.beginPath(); g.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2); g.fill(); });
  at(12, (g, S) => {
    g.translate(S / 2, S / 2); g.rotate(-Math.PI / 4); g.fillStyle = "#fff";
    g.fillRect(-S * 0.07, -S * 0.08, S * 0.14, S * 0.46);
    g.beginPath(); g.arc(0, -S * 0.2, S * 0.18, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = "destination-out"; g.fillRect(-S * 0.06, -S * 0.42, S * 0.12, S * 0.2);
  });
  at(13, (g, S) => { g.fillStyle = "#fff"; star(g, S / 2, S / 2, S * 0.48, S * 0.06, 4); g.fill(); });
  at(14, (g, S) => { g.fillStyle = "#14121c"; star(g, S / 2, S / 2, S * 0.49, S * 0.3, 12); g.fill(); g.fillStyle = "#fff"; star(g, S / 2, S / 2, S * 0.42, S * 0.25, 12); g.fill(); });
  at(15, (g, S) => { const gr = g.createLinearGradient(0, 0, S, 0); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(0.2, "rgba(0,0,0,0.9)"); gr.addColorStop(0.8, "rgba(0,0,0,0.9)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, S, S); });
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
function star(g, cx, cy, ro, ri, n) { g.beginPath(); for (let i = 0; i < n * 2; i++) { const r = i % 2 ? ri : ro, a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.closePath(); }

const VERT = `attribute vec4 iPos; attribute vec4 iCol; attribute vec4 iData; attribute vec3 iVel;
varying vec2 vUv; varying vec4 vCol;
void main(){
  float camD = distance(cameraPosition, iPos.xyz);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec2 q = position.xy;
  float c = cos(iData.y), s = sin(iData.y);
  vec2 rq = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
  vec3 off;
  if (iData.z > 0.0 && iData.w < 0.5) {
    vec3 toCam = normalize(cameraPosition - iPos.xyz);
    vec3 v = iVel - dot(iVel, toCam) * toCam;
    float vl = length(v);
    vec3 dir = vl > 1e-4 ? v / vl : up;
    vec3 side = normalize(cross(dir, toCam));
    off = dir * q.y * iPos.w * (1.0 + iData.z) + side * q.x * iPos.w * 0.3;
  } else if (iData.w > 0.5) {
    vec2 q2 = vec2(q.x, q.y * (1.0 - iData.z));
    vec2 r2 = vec2(q2.x * c - q2.y * s, q2.x * s + q2.y * c);
    off = vec3(r2.x, 0.0, r2.y) * iPos.w;
  } else off = (right * rq.x + up * rq.y) * iPos.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(iPos.xyz + off, 1.0);
  float cell = iData.x;
  vec2 cc = vec2(mod(cell, 4.0), floor(cell / 4.0));
  vUv = vec2((cc.x + q.x + 0.5) / 4.0, (3.0 - cc.y + q.y + 0.5) / 4.0);
  vCol = iCol;
  if (iData.w < 0.5) vCol.a *= smoothstep(1.2, 4.5, camD - iPos.w * 0.35);
}`;
const FRAG_ALPHA = `uniform sampler2D uTex; varying vec2 vUv; varying vec4 vCol; void main(){ vec4 t = texture2D(uTex, vUv); float a = t.a * vCol.a; if (a < 0.004) discard; gl_FragColor = vec4(vCol.rgb * t.rgb, a); }`;
const FRAG_ADD = `uniform sampler2D uTex; varying vec2 vUv; varying vec4 vCol; void main(){ vec4 t = texture2D(uTex, vUv); gl_FragColor = vec4(vCol.rgb * t.rgb * t.a * vCol.a, 1.0); }`;

class System {
  constructor(scene, tex, cap, additive, flat = false) {
    this.cap = cap; this.items = []; this.flat = flat;
    const g = new T.InstancedBufferGeometry();
    const base = new T.PlaneGeometry(1, 1);
    g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
    this.pos = new Float32Array(cap * 4); this.col = new Float32Array(cap * 4); this.dat = new Float32Array(cap * 4); this.vel = new Float32Array(cap * 3);
    const A = (arr, n) => new T.InstancedBufferAttribute(arr, n).setUsage(T.DynamicDrawUsage);
    g.setAttribute("iPos", (this.aPos = A(this.pos, 4))); g.setAttribute("iCol", (this.aCol = A(this.col, 4)));
    g.setAttribute("iData", (this.aDat = A(this.dat, 4))); g.setAttribute("iVel", (this.aVel = A(this.vel, 3)));
    g.instanceCount = 0;
    const m = new T.ShaderMaterial({ uniforms: { uTex: { value: tex } }, vertexShader: VERT, fragmentShader: additive ? FRAG_ADD : FRAG_ALPHA, transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending, side: T.DoubleSide,
      polygonOffset: flat, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
    this.mesh = new T.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = flat ? 1 : additive ? 6 : 5;
    scene.add(this.mesh);
  }
  spawn(p) {
    if (this.items.length >= this.cap) this.items.splice(0, 1 + (this.items.length - this.cap));
    p.age = 0;
    this.items.push(p);
    return p;
  }
  clear() { this.items.length = 0; this.mesh.geometry.instanceCount = 0; }
  update(dt) {
    let n = 0;
    const items = this.items;
    let w = 0;
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      items[w++] = p;
      const k = p.age / p.life;
      const dr = p.drag ? Math.max(0, 1 - p.drag * dt) : 1;
      p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.vy -= (p.grav || 0) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.floor !== undefined && p.y < p.floor) { p.y = p.floor; p.vy = Math.abs(p.vy) * (p.bounce || 0); p.vx *= 0.7; p.vz *= 0.7; }
      p.rot += (p.spin || 0) * dt;
      const size = p.s0 + (p.s1 - p.s0) * (p.ease ? Math.sqrt(k) : k);
      const fade = p.fadeIn ? Math.min(1, p.age / p.fadeIn) : 1;
      const a = (p.a0 + (p.a1 - p.a0) * k) * fade;
      const c0 = p.c0, c1 = p.c1 || p.c0;
      this.pos[n * 4] = p.x; this.pos[n * 4 + 1] = p.y; this.pos[n * 4 + 2] = p.z; this.pos[n * 4 + 3] = size;
      this.col[n * 4] = c0[0] + (c1[0] - c0[0]) * k; this.col[n * 4 + 1] = c0[1] + (c1[1] - c0[1]) * k; this.col[n * 4 + 2] = c0[2] + (c1[2] - c0[2]) * k; this.col[n * 4 + 3] = a;
      this.dat[n * 4] = p.cell; this.dat[n * 4 + 1] = p.rot; this.dat[n * 4 + 2] = this.flat ? -(p.stretch || 0) : p.stretch || 0; this.dat[n * 4 + 3] = this.flat ? 1 : 0;
      this.vel[n * 3] = p.vx; this.vel[n * 3 + 1] = p.vy; this.vel[n * 3 + 2] = p.vz;
      n++;
    }
    items.length = w;
    this.mesh.geometry.instanceCount = n;
    if (n) { this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aDat.needsUpdate = true; this.aVel.needsUpdate = true; }
  }
}

export function createParticles(scene) {
  const tex = atlas();
  const alpha = new System(scene, tex, 1600, false);
  const add = new System(scene, tex, 1400, true);
  const flat = new System(scene, tex, 900, false, true);
  const flatAdd = new System(scene, tex, 200, true, true);
  return {
    alpha, add, flat, flatAdd,
    clear() { alpha.clear(); add.clear(); flat.clear(); flatAdd.clear(); },
    update(dt) { alpha.update(dt); add.update(dt); flat.update(dt); flatAdd.update(dt); },
  };
}
