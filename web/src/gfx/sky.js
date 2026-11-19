import * as T from "../../vendor/three.js";
import { U, GLSL_NOISE } from "./materials.js";

/* Sky dome (gradient, sun, clouds, stars), distant mountains, time-of-day presets and the environment
   map used for car paint, glass and wet-road reflections. */
export const TOD = {
  sunset: { top: 0x2b1658, horizon: 0xff7a78, haze: 0xff9db4, sun: 0xff9a86, sunI: 2.0, elev: 0.12, az: 2.55, hemiSky: 0xb49cff, hemiGround: 0x4a2550, hemiI: 1.0,
    fog: 0xd27aa6, fogD: 0.0016, exposure: 1.02, night: 0.45, head: 1.2, wet: 0.35, cloud: 0xff9bb0, stars: 0, sat: 1.18, mount: 0x4a2d72, retro: 1,
    shadowTint: [0.42, 0.12, 0.62], highTint: [1, 0.5, 0.55] },
  night: { top: 0x07051a, horizon: 0x2a1650, haze: 0x3d1e5e, sun: 0xa9b4ff, sunI: 0.45, elev: 0.55, az: 1.0, hemiSky: 0x4a3f96, hemiGround: 0x180e24, hemiI: 0.78,
    fog: 0x1e1438, fogD: 0.0021, exposure: 1.25, night: 1, head: 1.7, wet: 0.7, cloud: 0x3a2a6a, stars: 1, sat: 1.18, mount: 0x120b2a,
    shadowTint: [0.25, 0.1, 0.6], highTint: [1, 0.45, 0.7] },
  day: { top: 0x2f6fd0, horizon: 0xc4dcf2, haze: 0xd7e4ee, sun: 0xfff2dd, sunI: 3.1, elev: 0.85, az: 2.2, hemiSky: 0xbcd4ff, hemiGround: 0x7d6e58, hemiI: 1.2,
    fog: 0xc9d9e8, fogD: 0.0011, exposure: 0.95, night: 0, head: 0.6, wet: 0.08, cloud: 0xffffff, stars: 0, sat: 1.1, mount: 0x7d8fa8,
    shadowTint: [0.2, 0.2, 0.5], highTint: [1, 0.7, 0.45] },
};

const SKY_VERT = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = vec4(p.xy, p.w * 0.99999, p.w); }`;
const SKY_FRAG = `varying vec3 vDir; uniform vec3 uSkyTop, uSkyHorizon, uSunDir, uSunColor, uHaze, uCloud; uniform float uTime, uStars, uNight, uRetro;
${GLSL_NOISE}
void main(){
  vec3 d = normalize(vDir);
  float az = atan(d.x, -d.z), el = asin(clamp(d.y, -1., 1.));
  // pixel-snapped direction: the Sunset Bay sky keeps crisp retro edges on the sun and clouds
  vec2 px = floor(vec2(az, el) * 150.);
  float y = d.y;
  vec3 c = mix(uHaze, uSkyHorizon, smoothstep(-0.02, 0.07, y));
  c = mix(c, uSkyTop, pow(smoothstep(0.03, 0.85, y), 0.6));
  vec3 s = normalize(uSunDir);
  float saz = atan(s.x, -s.z), sel = asin(s.y);
  vec2 sp = (px + 0.5) / 150. - vec2(saz, sel);
  sp.x = (mod(sp.x + 3.14159265, 6.2831853) - 3.14159265) * cos(el);
  float r = length(sp);
  if (uRetro > 0.5) {
    // retro striped sun (the original Sunset Bay sun)
    float R = 0.11;
    if (r < R) {
      float t = clamp((sp.y + R) / (2. * R), 0., 1.);
      vec3 sc = mix(vec3(1., 0.22, 0.38), vec3(1., 0.88, 0.4), smoothstep(0., 0.85, t)) * 3.2;
      float gap = 0.;
      if (t < 0.55) { float k = (0.55 - t) / 0.55; gap = step(fract(t * 11.), k * 0.55); }
      c = mix(sc, c, gap);
    }
    c += vec3(1., 0.42, 0.45) * 0.4 * exp(-r * 8.) * step(R, r);
  } else {
    float sd = max(dot(d, s), 0.);
    c += uSunColor * (pow(sd, 7.) * 0.4 + pow(sd, 60.) * 0.5) * (1. - uNight * 0.6);
    c += uSunColor * smoothstep(0.9986, 0.9993, sd) * mix(6., 1.4, uNight);
  }
  // pixel clouds, lit pink and orange from below on the sun side
  if (el > 0.03 && el < 0.45) {
    vec2 q = px * vec2(0.035, 0.11) + vec2(uTime * 0.12, 0.);
    float n = vnoise(q) * 0.6 + vnoise(q * 2.03 + 7.) * 0.3 + vnoise(q * 4.1 + 3.) * 0.1;
    float band = smoothstep(0.03, 0.1, el) * (1. - smoothstep(0.26, 0.45, el));
    float cl = step(0.62, n * band + 0.18 * band);
    vec2 q2 = (px + vec2(0., -2.)) * vec2(0.035, 0.11) + vec2(uTime * 0.12, 0.);
    float under = step(0.62, (vnoise(q2) * 0.6 + vnoise(q2 * 2.03 + 7.) * 0.3) * band + 0.18 * band);
    float side = 0.5 + 0.5 * dot(normalize(vec2(d.x, d.z)), normalize(vec2(s.x, s.z)));
    vec3 top = mix(uCloud * 0.35, uCloud * 0.6, side);
    vec3 lit = mix(uCloud * 0.85, uCloud * 1.15 + vec3(0.1, 0.05, 0.), side);
    c = mix(c, mix(lit, top, under * 0.75), cl * 0.9);
  }
  if (el > 0.12) {
    vec2 st = vec2(az, el) * 260.;
    float sh = h21(floor(st));
    c += vec3(0.9, 0.85, 1.) * step(0.992, sh) * smoothstep(0.35, 0.0, length(fract(st) - 0.5)) * uStars * (0.6 + 0.4 * sin(uTime * 3. + sh * 40.));
  }
  gl_FragColor = vec4(c, 1.);
}`;

export function createSky(renderer) {
  const group = new T.Group();
  const skyU = { ...U, uHaze: { value: new T.Color() }, uCloud: { value: new T.Color() }, uStars: { value: 0 }, uRetro: { value: 1 } };
  const skyMat = new T.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: T.BackSide, depthWrite: false, fog: false });
  const dome = new T.Mesh(new T.SphereGeometry(1, 32, 16), skyMat);
  dome.scale.setScalar(2500);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  group.add(dome);
  // distant mountains: a ring of low-poly ridges around the bay (north, west, east), seen through haze
  const mount = mountains();
  const mountMat = new T.MeshBasicMaterial({ vertexColors: true, fog: false });
  const mountMesh = new T.Mesh(mount, mountMat);
  group.add(mountMesh);

  // environment map from the same sky plus a few warm "city light" panels for reflections
  const pmrem = new T.PMREMGenerator(renderer);
  const envScene = new T.Scene();
  const envDome = new T.Mesh(new T.SphereGeometry(100, 24, 12), skyMat);
  envScene.add(envDome);
  const ground = new T.Mesh(new T.CircleGeometry(100, 16).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0x202024 }));
  ground.position.y = -6;
  envScene.add(ground);
  const panels = [];
  for (let i = 0; i < 10; i++) {
    const m = new T.Mesh(new T.PlaneGeometry(12 + (i % 3) * 6, 2 + (i % 2) * 3), new T.MeshBasicMaterial({ color: 0xffffff }));
    const a = (i / 10) * Math.PI * 2;
    m.position.set(Math.cos(a) * 60, 3 + (i % 4) * 2.5, Math.sin(a) * 60);
    m.lookAt(0, 4, 0);
    envScene.add(m); panels.push(m);
  }
  let envRT = null;
  let current = null;
  function apply(name, scene, lights) {
    const p = TOD[name] || TOD.sunset;
    current = name;
    U.uSkyTop.value.set(p.top); U.uSkyHorizon.value.set(p.horizon); U.uSunColor.value.set(p.sun);
    skyU.uHaze.value.set(p.haze); skyU.uCloud.value.set(p.cloud); skyU.uStars.value = p.stars; skyU.uRetro.value = p.retro ? 1 : 0;
    U.uSunDir.value.set(Math.cos(p.az) * Math.cos(p.elev), Math.sin(p.elev), Math.sin(p.az) * Math.cos(p.elev)).normalize();
    U.uNight.value = p.night; U.uHead.value = p.head; U.uWet.value = p.wet;
    U.uFogColor.value.set(p.fog);
    scene.fog = new T.FogExp2(p.fog, p.fogD);
    lights.hemi.color.set(p.hemiSky); lights.hemi.groundColor.set(p.hemiGround); lights.hemi.intensity = p.hemiI;
    lights.sun.color.set(p.sun); lights.sun.intensity = p.sunI;
    // mountains tinted to the haze
    const col = mount.getAttribute("color"), base = mount.userData.shade;
    const mc = new T.Color(p.mount), fc = new T.Color(p.haze);
    for (let i = 0; i < base.length; i++) { const k = base[i]; const c = mc.clone().lerp(fc, 0.35 + 0.5 * (1 - k)).multiplyScalar(0.6 + 0.4 * k); col.setXYZ(i, c.r, c.g, c.b); }
    col.needsUpdate = true;
    for (const [i, m] of panels.entries()) m.material.color.set(p.night > 0.5 ? (i % 2 ? 0xffb070 : 0x80b8ff) : p.night > 0.2 ? 0xffc39a : 0xffffff).multiplyScalar(p.night > 0.5 ? 1.6 : p.night > 0.2 ? 0.7 : 0.35);
    envRT?.dispose();
    envRT = pmrem.fromScene(envScene, 0.02);
    scene.environment = envRT.texture;
    return p;
  }
  return {
    group,
    apply,
    get current() { return current; },
    update(camera) { dome.position.copy(camera.position); mountMesh.position.set(camera.position.x * 0.92, 0, camera.position.z * 0.92); },
  };
}

function mountains() {
  const pos = [], col = [], shade = [];
  const R = 1650, N = 96;
  const ridge = (a) => {
    // taller in the north and west (canyon hills), low toward the open sea in the south
    const north = Math.max(0, -Math.sin(a));
    const h = 60 + 190 * north + 40 * Math.sin(a * 7.3) + 30 * Math.sin(a * 13.1 + 1) + 18 * Math.sin(a * 29.7);
    return Math.max(8, h * (Math.sin(a) > 0.35 ? 0.15 : 1));
  };
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const h0 = ridge(a0), h1 = ridge(a1), hm = ridge(am) * 1.12;
    const p = (a, r, h) => [Math.cos(a) * r, h, Math.sin(a) * r];
    const tris = [[p(a0, R, -20), p(a1, R, -20), p(am, R - 40, hm)], [p(a0, R, -20), p(am, R - 40, hm), p(a0, R - 20, h0)], [p(a1, R, -20), p(a1, R - 20, h1), p(am, R - 40, hm)]];
    for (const t of tris) for (const v of t) { pos.push(...v); const k = Math.min(1, Math.max(0, v[1] / 240)); shade.push(0.55 + 0.45 * k * (0.7 + 0.3 * Math.sin(am * 5))); col.push(1, 1, 1); }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new T.Float32BufferAttribute(col, 3));
  g.userData.shade = shade;
  return g;
}
