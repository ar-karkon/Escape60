import * as T from "../../vendor/three.js";

/* Tail-light trails: two additive ribbons that follow the hero's tail lights at speed, fading toward
   the tail — the street-racing "light trail" look. Visual only. */
const N = 28;
const VERT = `attribute float aFade; varying float vFade; void main(){ vFade=aFade; gl_Position=projectionMatrix*viewMatrix*vec4(position,1.); }`;
const FRAG = `uniform vec3 uColor; uniform float uK; varying float vFade; void main(){ gl_FragColor=vec4(uColor*vFade*vFade*uK,1.); }`;

export function createTrails(scene) {
  const ribbons = [];
  for (let r = 0; r < 2; r++) {
    const g = new T.BufferGeometry();
    const pos = new Float32Array(N * 2 * 3), fade = new Float32Array(N * 2), idx = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setAttribute("position", new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage));
    g.setAttribute("aFade", new T.BufferAttribute(fade, 1).setUsage(T.DynamicDrawUsage));
    g.setIndex(idx);
    const m = new T.Mesh(g, new T.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uColor: { value: new T.Color(1.6, 0.12, 0.3) }, uK: { value: 0 } }, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
    m.frustumCulled = false;
    m.renderOrder = 3;
    scene.add(m);
    ribbons.push({ mesh: m, pts: [] });
  }
  let acc = 0;
  return {
    clear() { for (const r of ribbons) r.pts.length = 0; },
    /** lights: [[x,y,z],[x,y,z]] world positions of the two tail lights; k: 0..1 intensity */
    update(dt, lights, k, camPos) {
      acc += dt;
      const push = acc > 1 / 40;
      if (push) acc = 0;
      ribbons.forEach((r, ri) => {
        const [x, y, z] = lights[ri];
        if (push || !r.pts.length) { r.pts.unshift([x, y, z]); if (r.pts.length > N) r.pts.pop(); }
        else r.pts[0] = [x, y, z];
        const pos = r.mesh.geometry.attributes.position.array, fade = r.mesh.geometry.attributes.aFade.array;
        const n = r.pts.length;
        for (let i = 0; i < N; i++) {
          const p = r.pts[Math.min(i, n - 1)];
          const q = r.pts[Math.min(i + 1, n - 1)];
          // ribbon faces the camera: widen perpendicular to both the trail and the view direction
          let tx = q[0] - p[0], tz = q[2] - p[2];
          const vx = camPos.x - p[0], vy = camPos.y - p[1], vz = camPos.z - p[2];
          let wx = 0 * vz - tz * vy, wy = tz * vx - tx * vz, wz = tx * vy - 0 * vx;
          const wl = Math.hypot(wx, wy, wz) || 1, t = i / (N - 1), w = 0.13 * (1 - t * 0.6);
          wx = (wx / wl) * w; wy = (wy / wl) * w; wz = (wz / wl) * w;
          pos.set([p[0] - wx, p[1] - wy, p[2] - wz, p[0] + wx, p[1] + wy, p[2] + wz], i * 6);
          const f = i < n ? 1 - t : 0;
          fade[i * 2] = fade[i * 2 + 1] = f;
        }
        r.mesh.geometry.attributes.position.needsUpdate = true;
        r.mesh.geometry.attributes.aFade.needsUpdate = true;
        r.mesh.material.uniforms.uK.value = k;
        r.mesh.visible = k > 0.01;
      });
    },
  };
}
