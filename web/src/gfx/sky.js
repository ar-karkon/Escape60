import * as T from "../../vendor/three.js";
import { U, GLSL_NOISE } from "./materials.js";

/* Sky dome (gradient, sun, clouds, stars), distant mountains, time-of-day presets and the environment
   map used for car paint, glass and wet-road reflections. */
export const TOD = {
  sunset: { top: 0x24356e, horizon: 0xff9c66, haze: 0xf2a37c, sun: 0xffb27a, sunI: 2.1, elev: 0.13, az: 2.55, hemiSky: 0xb9b2d6, hemiGround: 0x6a5048, hemiI: 0.95,
    fog: 0xe0a184, fogD: 0.0017, exposure: 1.0, night: 0.4, head: 1.2, wet: 0.35, cloud: 0xffc2a0, stars: 0, sat: 1.12, mount: 0x5a4a74 },
  night: { top: 0x040815, horizon: 0x1c2a5a, haze: 0x2a2f5e, sun: 0x9fb6ff, sunI: 0.45, elev: 0.55, az: 1.0, hemiSky: 0x3b4d8f, hemiGround: 0x150f1e, hemiI: 0.75,
    fog: 0x161c38, fogD: 0.0022, exposure: 1.25, night: 1, head: 1.7, wet: 0.7, cloud: 0x2a3160, stars: 1, sat: 1.15, mount: 0x0e1226 },
  day: { top: 0x2f6fd0, horizon: 0xc4dcf2, haze: 0xd7e4ee, sun: 0xfff2dd, sunI: 3.1, elev: 0.85, az: 2.2, hemiSky: 0xbcd4ff, hemiGround: 0x7d6e58, hemiI: 1.2,
    fog: 0xc9d9e8, fogD: 0.0011, exposure: 0.95, night: 0, head: 0.6, wet: 0.08, cloud: 0xffffff, stars: 0, sat: 1.08, mount: 0x7d8fa8 },
};

const SKY_VERT = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = vec4(p.xy, p.w * 0.99999, p.w); }`;
const SKY_FRAG = `varying vec3 vDir; uniform vec3 uSkyTop, uSkyHorizon, uSunDir, uSunColor, uHaze, uCloud; uniform float uTime, uStars, uNight;
${GLSL_NOISE}
void main(){
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 c = mix(uHaze, uSkyHorizon, smoothstep(-0.02, 0.06, y));
  c = mix(c, uSkyTop, pow(smoothstep(0.02, 0.85, y), 0.65));
  float sd = max(dot(d, uSunDir), 0.);
  c += uSunColor * (pow(sd, 7.) * 0.45 + pow(sd, 60.) * 0.6) * (1. - uNight * 0.6);
  c += uSunColor * smoothstep(0.9985, 0.9993, sd) * mix(8., 1.6, uNight);
  // clouds on a high plane
  if (y > 0.0) {
    vec2 cp = d.xz / (y + 0.12) * 1.6 + vec2(uTime * 0.004, 0.);
    float cl = smoothstep(0.52, 0.8, fbm(cp * 1.4)) * smoothstep(0.0, 0.18, y);
    vec3 cc = uCloud * (0.7 + 0.5 * pow(sd, 3.)) ;
    c = mix(c, cc, cl * 0.75);
    // stars
    vec2 sp = d.xz / (y + 0.35) * 90.;
    float sh = h21(floor(sp));
    float st = step(0.985, sh) * smoothstep(0.09, 0.0, length(fract(sp) - 0.5)) * smoothstep(0.12, 0.35, y) * uStars * (0.6 + 0.4 * sin(uTime * 3. + sh * 40.));
    c += vec3(st);
  }
  gl_FragColor = vec4(c, 1.);
}`;

export function createSky(renderer) {
  const group = new T.Group();
  const skyU = { ...U, uHaze: { value: new T.Color() }, uCloud: { value: new T.Color() }, uStars: { value: 0 } };
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
    skyU.uHaze.value.set(p.haze); skyU.uCloud.value.set(p.cloud); skyU.uStars.value = p.stars;
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
