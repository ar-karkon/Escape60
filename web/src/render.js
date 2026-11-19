import * as T from "../vendor/three.js";
import { SHARED, voxelMaterial, glowMaterial, GlowBuilder, GLOW } from "./gfx/voxel.js";
import { atlasTexture } from "./gfx/signs.js";
import { buildChunk, disposeChunk, TILE } from "./gfx/city.js";
import { heroBody, policeBody, trafficBody, TRAFFIC_TYPES, wheelGeometry, makeCar, lightBar, barricadeGeometry, helicopter } from "./gfx/cars.js";
import { createSky } from "./gfx/sky.js";
import { createFX } from "./gfx/fx.js";
import { createPost } from "./gfx/post.js";
import { createPeds } from "./gfx/peds.js";
import { createComic } from "./gfx/comic.js";
import { cityMap } from "./map.js";
import { createTrails } from "./gfx/trails.js";
import { CAR_COLORS } from "./gfx/palette.js";

/* Sunset Bay renderer. Consumes simulation state only; it never changes gameplay. */
const TICK = 1 / 60;
const FLARE_COL = new T.Color(0xbfd8ff);
const RED = new T.Color(0xff2a4a), BLUE = new T.Color(0x2f86ff), WARM = new T.Color(0xffd9a0), CYAN = new T.Color(0x3dd8e7), AMBER = new T.Color(0xffa020), PINK = new T.Color(0xff5d95);

export function createRenderer(canvas) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", stencil: false });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  const post = createPost(renderer);
  SHARED.uAtlas.value = atlasTexture;

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(58, 0.5, 0.3, 1300);
  const mats = { city: voxelMaterial({ cutout: true }), car: voxelMaterial(), glow: glowMaterial() };
  const sky = createSky(mats.city);
  scene.add(sky.group);

  // Lighting: warm low sun, cool sky fill, hemisphere ambience, practical lights.
  const hemi = new T.HemisphereLight(0x8a6cff, 0x2a1240, 1.05);
  const sunLight = new T.DirectionalLight(0xff7a7a, 2.1);
  const fill = new T.DirectionalLight(0x6a78ff, 0.85);
  scene.add(hemi, sunLight, sunLight.target, fill, fill.target);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  Object.assign(sunLight.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 220 });
  sunLight.shadow.camera.updateProjectionMatrix();
  sunLight.shadow.bias = -0.0008;
  sunLight.shadow.normalBias = 0.06;
  const headSpot = new T.SpotLight(0xffe2b8, 60, 34, 0.55, 0.6, 1.2);
  // Photographer-style key light that travels with the camera so the hero always reads.
  const key = new T.PointLight(0xffd2b0, 60, 30, 1.4);
  scene.add(key);
  scene.add(headSpot, headSpot.target);
  const beacons = [new T.PointLight(0xff2a4a, 40, 16, 1.6), new T.PointLight(0x2f86ff, 40, 16, 1.6)];
  for (const l of beacons) scene.add(l);

  const fx = createFX(scene);
  const peds = createPeds(scene, mats.car);
  const trails = createTrails(scene);
  const camDir = new T.Vector3();
  let driftHeld = 0, topSpeedT = 0, brake = 0, prevSpeed = 0, perfectShown = false;
  const inkCanvas = document.getElementById("ink");
  const comic = inkCanvas ? createComic(inkCanvas) : null;
  const sp = new T.Vector3();
  const toScreen = (x, y, z) => { sp.set(x, y, z).project(camera); return [(sp.x + 1) / 2, (1 - sp.y) / 2, sp.z < 1]; };
  const comicQueue = [];
  const threats = [];
  const dyn = new GlowBuilder(160, true);
  const dynMesh = dyn.mesh(mats.glow);
  scene.add(dynMesh);

  // Vehicles
  const heroWheel = wheelGeometry(0xe6e6f0, true);
  const hero = makeCar(heroBody(), mats.car, { wheel: heroWheel, zf: -1.72, zb: 1.72, wx: 1.12 });
  scene.add(hero);
  const policeGeo = [policeBody(false), policeBody(true)];
  const trafficGeo = new Map();
  const getTrafficGeo = (type, color) => {
    const key = type + color;
    if (!trafficGeo.has(key)) trafficGeo.set(key, trafficBody(type, color));
    return trafficGeo.get(key);
  };
  const barricadeGeo = barricadeGeometry();
  const actorMap = new WeakMap();
  const live = { police: new Set(), traffic: new Set(), marks: new Set() };
  const heli = helicopter(mats.car);
  heli.visible = false;
  scene.add(heli);

  function makePolice(i) {
    const heavy = i % 3 === 2;
    const g = makeCar(policeGeo[heavy ? 1 : 0].geometry, mats.car, { zf: heavy ? -1.7 : -1.75, zb: heavy ? 1.8 : 1.7, wx: 1.15 });
    lightBar(g, policeGeo[heavy ? 1 : 0].barY, heavy);
    g.userData.phase = Math.random() * 6;
    return g;
  }
  const mergedTraffic = new Map();
  function makeTraffic(state, idx) {
    const type = TRAFFIC_TYPES[state.color ?? idx % 4];
    const seed = Math.abs(Math.floor((state.x ?? 0) * 7 + (state.y ?? 0) * 13));
    const paint = CAR_COLORS[seed % CAR_COLORS.length];
    // One draw call per traffic car: wheels are baked into the body geometry (they don't need to spin).
    const key = type + paint;
    let geo = mergedTraffic.get(key);
    if (!geo) {
      const src = makeCar(getTrafficGeo(type, paint), mats.car, { zf: type === "hatch" ? -1.4 : -1.75, zb: type === "hatch" ? 1.35 : 1.7 });
      src.updateMatrixWorld(true);
      const parts = [];
      src.traverse((m) => { if (m.isMesh) parts.push(m.geometry.clone().applyMatrix4(m.matrixWorld)); });
      geo = mergeGeometries(parts);
      mergedTraffic.set(key, geo);
    }
    const g = new T.Group();
    const mesh = new T.Mesh(geo, mats.car);
    mesh.castShadow = true;
    g.add(mesh);
    g.userData = { body: mesh, wheels: [], radius: 0.5 };
    return g;
  }
  function mergeGeometries(list) {
    const names = ["position", "normal", "aCol", "aMat", "aUv"];
    let vCount = 0, iCount = 0;
    for (const g of list) { vCount += g.attributes.position.count; iCount += g.index.count; }
    const out = new T.BufferGeometry();
    for (const n of names) {
      const a0 = list[0].attributes[n];
      const arr = new a0.array.constructor(vCount * a0.itemSize);
      let off = 0;
      for (const g of list) { arr.set(g.attributes[n].array, off); off += g.attributes[n].array.length; }
      out.setAttribute(n, new T.BufferAttribute(arr, a0.itemSize, a0.normalized));
    }
    const idx = new Uint32Array(iCount);
    let io = 0, vo = 0;
    for (const g of list) { const src = g.index.array; for (let k = 0; k < src.length; k++) idx[io + k] = src[k] + vo; io += src.length; vo += g.attributes.position.count; }
    out.setIndex(new T.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
  }
  function makeMark() {
    const m = new T.Mesh(barricadeGeo, mats.car);
    m.castShadow = true;
    m.userData.born = performance.now();
    return m;
  }
  function sync(kind, states, factory, seen) {
    const set = live[kind];
    seen.clear();
    states.forEach((s, i) => {
      let o = actorMap.get(s);
      if (!o) {
        o = factory(s, i);
        actorMap.set(s, o);
        scene.add(o);
      }
      seen.add(o);
    });
    for (const o of set) if (!seen.has(o)) scene.remove(o);
    set.clear();
    for (const o of seen) set.add(o);
  }

  // City tiles
  const tiles = new Map();
  const animated = new Set();
  let tileSeed = "";
  function ensureTiles(seed, cx, cz, budget) {
    if (seed !== tileSeed) {
      for (const [, c] of tiles) { scene.remove(c.object); disposeChunk(c); for (const a of c.animated) animated.delete(a); }
      tiles.clear();
      tileSeed = seed;
    }
    const ci = Math.floor(cx / TILE), cj = Math.floor(cz / TILE);
    const want = [];
    for (let i = ci - 2; i <= ci + 2; i++) for (let j = cj - 2; j <= cj + 2; j++) {
      const key = i + "/" + j;
      if (!tiles.has(key)) want.push([Math.hypot(i + 0.5 - cx / TILE, j + 0.5 - cz / TILE), i, j, key]);
    }
    want.sort((a, b) => a[0] - b[0]);
    const t0 = performance.now();
    for (const [, i, j, key] of want) {
      if (budget >= 0 && performance.now() - t0 > budget) break;
      const c = buildChunk(seed, i, j, mats);
      tiles.set(key, c);
      scene.add(c.object);
      for (const a of c.animated) animated.add(a);
    }
    for (const [key, c] of tiles) {
      const [i, j] = key.split("/").map(Number);
      if (Math.abs(i - ci) > 3 || Math.abs(j - cj) > 3) {
        scene.remove(c.object);
        disposeChunk(c);
        for (const a of c.animated) animated.delete(a);
        tiles.delete(key);
      }
    }
  }

  // State
  let lastTime = 0, cost = 16, slowFrames = 0, fastFrames = 0;
  // Quality ladder (index 0 = best). Each step trades the least visible cost first.
  const LADDER = [
    { tier: 2, scale: 1, dpr: 1.6 },
    { tier: 2, scale: 0.85, dpr: 1.4 },
    { tier: 1, scale: 0.85, dpr: 1.3 },
    { tier: 1, scale: 0.7, dpr: 1.2 },
    { tier: 0, scale: 0.62, dpr: 1.1 },
    { tier: 0, scale: 0.5, dpr: 1 },
  ];
  // Starting point from what the device tells us; the frame-time monitor then moves along the ladder.
  const gpu = (() => {
    try {
      const gl = renderer.getContext(), ext = gl.getExtension("WEBGL_debug_renderer_info");
      return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase();
    } catch { return ""; }
  })();
  const mobile = matchMedia("(pointer: coarse)").matches || /android|iphone|ipad|mobile/i.test(navigator.userAgent);
  const weakGpu = /mali-[t4]|mali-g(31|51|52|57|68)|adreno \(tm\) [3-5]\d\d|adreno [3-5]\d\d|powervr|sgx|swiftshader|llvmpipe|intel\(r\) hd graphics [2-5]/.test(gpu);
  const lowMem = (navigator.deviceMemory || 8) <= 3 || (navigator.hardwareConcurrency || 8) <= 4;
  let rung = weakGpu || (mobile && lowMem) ? 4 : mobile ? 2 : 0;
  let scale = LADDER[rung].scale;
  let prevGame = null, heading = 0, lastAngle = 0, steerVis = 0, eventIndex = 0, shake = 0, flash = 0, flashCol = new T.Color();
  let wheelRot = 0, skidTimer = 0, lastDrift = 0, endTime = 0, menuStart = 0, comboPulse = 0, paintKey = "";
  const seenTmp = new Set();
  let pedGame = undefined;
  const demo = {
    police: [{ x: -36, y: 0, angle: Math.PI / 2, speed: 70 }, { x: 30, y: 0, angle: Math.PI / 2, speed: 70 }],
    traffic: [{ x: 45, y: 0, angle: -Math.PI / 2, speed: 60, color: 1 }],
  };
  const eye = new T.Vector3(), look = new T.Vector3(), tmp = new T.Vector3(), camLook = new T.Vector3();
  const heroPos = new T.Vector3();
  let camInit = false;
  const arrow = document.getElementById("threat");

  function lerpAngle(a, b, k) { return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k; }
  function placeCar(o, x, z, angle, speed, dt) {
    o.position.set(x, 0, z);
    o.rotation.y = -angle - Math.PI / 2;
    const ud = o.userData;
    if (ud.wheels) {
      ud.spin = (ud.spin ?? 0) - (speed * dt) / (ud.radius || 0.5);
      for (const w of ud.wheels) w.mesh.rotation.x = ud.spin;
    }
  }
  function policeLights(o, t, reduced, i) {
    const bar = o.userData.bar;
    if (!bar) return 0;
    const ph = (t / 1000) * 7 + o.userData.phase;
    const a = reduced ? 1 : Math.floor(ph) % 2 === 0 && ph % 1 < 0.75 ? 1 : 0.12;
    const b = reduced ? 1 : Math.floor(ph) % 2 === 1 && ph % 1 < 0.75 ? 1 : 0.12;
    bar.red.color.setRGB(5 * a + 0.2, 0.25 * a, 0.5 * a);
    bar.blue.color.setRGB(0.2 * b, 1.2 * b, 6 * b + 0.2);
    return a > b ? 1 : -1;
  }

  /** Headlights for other cars: twin-lobe beam on the road, and when they face the camera, lamp halos
   * plus a wide anamorphic flare (strongest for oncoming cars). Tail lights glow from behind. */
  function carLights(x, z, a, k) {
    const cx = Math.cos(a), cz = Math.sin(a);
    dyn.add(GLOW.CONE, x + cx * 2.6, 0.06, z + cz * 2.6, 2.6, 12, a, WARM, 0.24 * k);
    camDir.set(camera.position.x - x, 0, camera.position.z - z).normalize();
    const facing = cx * camDir.x + cz * camDir.z;
    if (facing > 0.2) {
      const f = (facing - 0.2) / 0.8;
      for (const sd of [-1, 1]) dyn.add(GLOW.HALO, x + cx * 2.75 - cz * 0.85 * sd, 0.85, z + cz * 2.75 + cx * 0.85 * sd, 0.6, 0, 0, WARM, 0.55 * f * k);
      dyn.add(GLOW.FLARE, x + cx * 2.9, 0.85, z + cz * 2.9, 4.5 + 3 * f, 0, 0, FLARE_COL, 0.35 * f * f * k);
    } else if (facing < -0.2) {
      for (const sd of [-1, 1]) dyn.add(GLOW.HALO, x - cx * 2.75 - cz * 0.85 * sd, 0.85, z - cz * 2.75 + cx * 0.85 * sd, 0.5, 0, 0, RED, 0.45 * k);
    }
    dyn.add(GLOW.STREAK, x - cx * 2.7, 0.06, z - cz * 2.7, 0.8, 5, 0, RED, 0.3 * k);
  }
  function draw(game, t, opts = {}) {
    const { reducedMotion = false, low = false, seed = "", alpha = 0, countdown = 0, lockHigh = false } = opts;
    const dt = Math.max(0.0001, Math.min(0.1, (t - lastTime) / 1000));
    lastTime = t;
    SHARED.uTime.value = t / 1000;
    // Adaptive quality: keep steering responsive by trading resolution, shadows and bloom first.
    cost += 0.08 * (dt * 1000 - cost);
    // Step down quickly when frames are slow (about 1 s below ~40 fps), step up slowly when there is headroom.
    if (cost > 25) { slowFrames++; fastFrames = 0; } else if (cost < 14.5) { fastFrames++; slowFrames = 0; } else { slowFrames = 0; fastFrames = Math.max(0, fastFrames - 1); }
    if (lockHigh) rung = 0;
    else if (slowFrames > (cost > 45 ? 25 : 60) && rung < LADDER.length - 1) { rung++; slowFrames = 0; }
    else if (fastFrames > 420 && rung > 0) { rung--; fastFrames = 0; }
    const step = low ? LADDER[Math.max(4, rung)] : LADDER[rung];
    scale = step.scale;
    const tier = step.tier;
    // Softer look: render closer to native resolution and let FXAA + smooth upscaling round the edges.
    const dpr = Math.min(window.devicePixelRatio || 1, step.dpr);
    const cw = canvas.clientWidth || 390, ch = canvas.clientHeight || 780;
    const k = scale * dpr * Math.min(1, 1300 / ch);
    const w = Math.max(1, Math.round(cw * k)), h = Math.max(1, Math.round(ch * k));
    if (canvas.width !== w || canvas.height !== h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    post.setSize(w, h);
    renderer.shadowMap.enabled = tier === 2 && !mobile;
    sunLight.castShadow = tier === 2 && !mobile;
    headSpot.visible = tier > 0;
    mats.glow.uniforms.uGlowScale.value = tier === 0 ? 0.8 : 1;
    post.uniforms.uInk.value = tier === 0 ? 0 : 1;
    post.uniforms.uHalftone.value = tier === 0 ? 0 : 0.42;

    const playing = game?.state === "playing";
    const ended = game?.state === "ended";
    if (game !== prevGame) {
      prevGame = game;
      eventIndex = 0;
      camInit = false;
      fx.clear();
      endTime = 0;
      menuStart = t;
      if (game) heading = game.player.angle;
    }

    // ---------- hero pose ----------
    let px, pz, angle, speed, drift = 0;
    if (game) {
      const p = game.player;
      const ex = playing ? alpha * TICK : 0;
      px = (p.x + Math.cos(p.angle) * p.speed * ex) / 10;
      pz = (p.y + Math.sin(p.angle) * p.speed * ex) / 10;
      angle = p.angle;
      speed = playing ? p.speed / 10 : 0;
      drift = playing ? p.drift : 0;
    } else {
      // Menu: the hero cruises up the sunset boulevard toward the camera, police in tow.
      const span = 150, v = 7;
      const s = (((t - menuStart) / 1000) * v) % span;
      px = -3.6; pz = -150 + s; angle = Math.PI / 2; speed = v; drift = 0.15 + 0.15 * Math.sin(t / 900);
    }
    const turn = Math.atan2(Math.sin(angle - lastAngle), Math.cos(angle - lastAngle));
    lastAngle = angle;
    steerVis += ((Math.abs(turn) > 0.0005 ? Math.sign(turn) : 0) - steerVis) * Math.min(1, dt * 10);
    const yawOffset = steerVis * drift * 0.38;
    placeCar(hero, px, pz, angle + yawOffset, speed, dt);
    heroPos.set(px, 0, pz);
    hero.userData.body.rotation.z = -steerVis * drift * 0.06;
    hero.userData.body.position.y = Math.sin(t / 70) * 0.012 * (speed > 0 ? 1 : 0);
    for (const wh of hero.userData.wheels) if (wh.front) wh.pivot.rotation.y = -steerVis * 0.38;
    hero.visible = reducedMotion || !game || !game.invuln || !playing || game.ticks % 10 < 6;

    // ---------- tiles ----------
    const dirx = Math.cos(angle), dirz = Math.sin(angle);
    const ahead = game ? 50 : -25;
    ensureTiles(game?.seed ?? seed, px + dirx * ahead, pz + dirz * ahead, camInit ? 7 : -1);
    for (const a of animated) {
      if (a.userData.update) a.userData.update(t / 1000, dt);
      else a.rotation.x += (a.userData.spin || 0) * dt * (reducedMotion ? 0.2 : 1);
    }

    // ---------- actors ----------
    if (!game) {
      // Persistent demo actors (identity matters: actors are keyed by state object).
      demo.police[0].y = pz * 10 - 115;
      demo.police[1].y = pz * 10 - 215;
      demo.traffic[0].y = pz * 10 + 420;
    }
    const policeStates = game ? game.police : demo.police;
    sync("police", policeStates, (s, i) => makePolice(i), seenTmp);
    dyn.count = 0;
    let beaconUsed = 0;
    const policeList = [];
    for (const s of policeStates) {
      const o = actorMap.get(s);
      const moving = playing && !(s.stun > 0);
      const ex = moving ? alpha * TICK : 0;
      const sx = (s.x + Math.cos(s.angle) * (s.speed ?? 0) * ex) / 10, sz = (s.y + Math.sin(s.angle) * (s.speed ?? 0) * ex) / 10;
      placeCar(o, game ? sx : sx, game ? sz : sz, s.angle, game ? (moving ? s.speed / 10 : 0) : speed, dt);
      policeList.push(o);
    }
    policeList.sort((a, b) => a.position.distanceToSquared(heroPos) - b.position.distanceToSquared(heroPos));
    policeList.forEach((o, i) => {
      const side = policeLights(o, t, reducedMotion, i);
      if (i < 4) {
        const ox = o.position.x, oz = o.position.z;
        const k = reducedMotion ? 0.35 : 0.55;
        dyn.add(GLOW.POOL, ox, 0.07, oz, 5.2, 5.2, 0, side > 0 ? RED : BLUE, k);
        dyn.add(GLOW.STREAK, ox, 0.06, oz, 1.4, 13, 0, side > 0 ? RED : BLUE, 1.2);
        const a = -o.rotation.y - Math.PI / 2;
        carLights(ox, oz, a, 0.9);
      }
      if (i < 2 && tier > 0) {
        const l = beacons[beaconUsed++];
        l.position.set(o.position.x, 3, o.position.z);
        l.color.copy(side > 0 ? RED : BLUE);
        l.intensity = reducedMotion ? 18 : 45;
      }
    });
    for (let i = beaconUsed; i < 2; i++) beacons[i].intensity = 0;

    const trafficStates = game ? game.traffic : demo.traffic;
    sync("traffic", trafficStates, makeTraffic, seenTmp);
    for (const s of trafficStates) {
      const o = actorMap.get(s);
      const ex = playing ? alpha * TICK : 0;
      const sx = (s.x + Math.cos(s.angle) * s.speed * ex) / 10, sz = (s.y + Math.sin(s.angle) * s.speed * ex) / 10;
      // Traffic turns 90° at junctions in the simulation; ease the drawn heading/lane change.
      const ud = o.userData;
      ud.va = ud.va === undefined ? s.angle : lerpAngle(ud.va, s.angle, 1 - Math.exp(-dt * 6));
      const gap = ud.vx === undefined ? 1e9 : Math.hypot(ud.vx - sx, ud.vz - sz);
      if (gap > 30 || gap < 1.2) { ud.vx = sx; ud.vz = sz; }
      else { const kk = 1 - Math.exp(-dt * 10); ud.vx += (sx - ud.vx) * kk; ud.vz += (sz - ud.vz) * kk; }
      placeCar(o, ud.vx, ud.vz, ud.va, playing || !game ? s.speed / 10 : 0, dt);
      if (o.position.distanceToSquared(heroPos) < 90 * 90) carLights(ud.vx, ud.vz, ud.va, 0.75);
    }
    const markStates = game ? game.marks : [];
    sync("marks", markStates, makeMark, seenTmp);
    for (const s of markStates) {
      const o = actorMap.get(s);
      // Deploy animation: the barricade drops in from above with a bounce instead of popping up.
      const age = Math.min(1, (performance.now() - o.userData.born) / 520);
      const drop = reducedMotion ? 0 : (1 - age) * (1 - age) * 7 - Math.sin(age * Math.PI) * 0.15 * (1 - age);
      o.position.set(s.x / 10, Math.max(0, drop), s.y / 10);
      o.scale.set(1, reducedMotion ? 1 : 0.6 + 0.4 * Math.min(1, age * 1.6), 1);
      o.rotation.y = -(s.angle ?? 0) - Math.PI / 2;
      if (age < 1 && age > 0.6 && !o.userData.dusted && !low) {
        o.userData.dusted = true;
        for (let k = 0; k < 8; k++) fx.puff(o.position.x + (Math.random() - 0.5) * 6, 0.3, o.position.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 2, 0xcdb9d6, 0.9);
      }
      const pulse = reducedMotion ? 0.6 : 0.45 + 0.4 * Math.abs(Math.sin(t / 160));
      dyn.add(GLOW.POOL, s.x / 10, 0.07, s.y / 10, 6, 6, 0, AMBER, pulse);
      dyn.add(GLOW.STREAK, s.x / 10, 0.06, s.y / 10, 1.6, 14, 0, RED, pulse);
    }

    // ---------- hero lights ----------
    const ha = angle + yawOffset;
    const hx = Math.cos(ha), hz = Math.sin(ha);
    // Natural lights: soft twin-lobe beam, small warm halo per lamp, tail lights brighten as you brake.
    if (speed > 0 && speed < prevSpeed - 0.05) brake = Math.min(1, brake + dt * 6); else brake = Math.max(0, brake - dt * 3);
    if (drift > 0.6) brake = Math.max(brake, 0.6);
    prevSpeed = speed;
    dyn.add(GLOW.CONE, px + hx * 2.7, 0.07, pz + hz * 2.7, 3.4, 17, ha, WARM, 0.36);
    dyn.add(GLOW.POOL, px, 0.07, pz, 1.9, 3.4, ha, t % 1600 < 800 || reducedMotion ? CYAN : PINK, 0.32);
    for (const sd of [-1, 1]) {
      const lx = px - hx * 2.82 - hz * 0.85 * sd, lz = pz - hz * 2.82 + hx * 0.85 * sd;
      dyn.add(GLOW.STREAK, lx, 0.06, lz, 0.5, 6 + brake * 3, 0, RED, 0.7 + brake * 0.6);
      dyn.add(GLOW.HALO, lx, 0.86, lz, 0.75 + brake * 0.35, 0, 0, RED, 0.4 + brake * 0.5);
      dyn.add(GLOW.HALO, px + hx * 2.78 - hz * 0.92 * sd, 0.83, pz + hz * 2.78 + hx * 0.92 * sd, 0.55, 0, 0, WARM, 0.35);
    }
    // Tail-light trails at speed (always faint, bright at top speed or in a drift).
    {
      const top = speed * 10 > 255 ? 1 : 0;
      topSpeedT = top ? topSpeedT + dt : 0;
      const k = reducedMotion || !game ? 0 : Math.min(1, 0.25 + top * 0.5 + drift * 0.6) * (playing ? 1 : 0);
      trails.update(dt, [[px - hx * 2.85 - hz * 0.85, 0.86, pz - hz * 2.85 + hx * 0.85], [px - hx * 2.85 + hz * 0.85, 0.86, pz - hz * 2.85 - hx * 0.85]], tier === 0 ? 0 : k, camera.position);
    }
    headSpot.position.set(px + hx * 2.2, 1.3, pz + hz * 2.2);
    headSpot.target.position.set(px + hx * 14, 0, pz + hz * 14);

    // ---------- helicopter ----------
    const elapsed = game ? game.ticks / 60 : 30;
    heli.visible = elapsed >= 25 && !low;
    if (heli.visible) {
      const ht = t / 1000;
      const sway2 = Math.sin(ht * 0.35) * 5;
      const hx2 = px + Math.cos(heading) * 34 - Math.sin(heading) * sway2, hz2 = pz + Math.sin(heading) * 34 + Math.cos(heading) * sway2;
      heli.position.set(hx2, 12.8 + Math.sin(ht * 0.8) * 0.6, hz2);
      heli.rotation.set(0.12, Math.atan2(hx2 - px, hz2 - pz), 0.08 * Math.sin(ht));
      heli.userData.rotor.rotation.y += dt * 28;
      heli.userData.tail.rotation.x += dt * 30;
      const sx = px + dirx * 4 + Math.sin(ht * 1.3) * 2, sz = pz + dirz * 4 + Math.cos(ht * 1.1) * 2;
      const bx = sx - heli.position.x, bz = sz - heli.position.z;
      dyn.add(GLOW.BEAM, heli.position.x, heli.position.y - 0.8, heli.position.z, 3.2, Math.hypot(bx, bz), Math.atan2(bz, bx), new T.Color(0.75, 0.82, 1), 0.16);
      dyn.add(GLOW.POOL, sx, 0.08, sz, 4.6, 4.6, 0, new T.Color(0.8, 0.85, 1), 0.38);
    }

    // ---------- events -> FX ----------
    if (game) {
      const ev = game.events;
      for (; eventIndex < ev.length; eventIndex++) {
        const e = ev[eventIndex];
        if (e.type === "hit" || e.type === "near" || e.type === "dodge") comicQueue.push(e);
        if (e.type === "hit") {
          shake = reducedMotion ? 0 : 1;
          flash = 0.55; flashCol.setRGB(1, 0.12, 0.3);
          if (!reducedMotion) for (let k = 0; k < 14; k++) fx.spark(px + hx * 1.5, 0.9, pz + hz * 1.5, 10, k % 3 ? 0xffd27a : 0xff6a3d, 3.2);
          for (let k = 0; k < 10; k++) fx.puff(px + (Math.random() - 0.5) * 2, 0.6, pz + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0x9a8aa8, 1.1);
        } else if (e.type === "scrape" && !reducedMotion) {
          for (let k = 0; k < 5; k++) fx.spark(px + hx * 2, 0.6, pz + hz * 2, 7, 0xffd27a, 3);
          shake = Math.max(shake, 0.35);
        } else if (e.type === "near" || e.type === "dodge") {
          const m = e.mult || 1;
          flash = Math.max(flash, 0.1 + 0.05 * m); flashCol.setRGB(m >= 3 ? 1 : 0.25, m >= 3 ? 0.4 : 0.9, 1);
          if (!reducedMotion) for (let k = 0; k < 4 + m * 3; k++) fx.spark(px + (Math.random() - 0.5) * 3, 1.2, pz + (Math.random() - 0.5) * 3, 5 + m, m >= 3 ? 0xff5d95 : 0x3dd8e7, 2.5);
          comboPulse = 1;
        } else if (e.type === "win") {
          flash = 0.4; flashCol.setRGB(1, 0.85, 0.4);
        } else if (e.type === "end") {
          flash = 0.6; flashCol.setRGB(1, 0.15, 0.25);
        }
      }
    }
    if (!reducedMotion && !low && speed > 0) {
      const rx = px - hx * 2.1, rz = pz - hz * 2.1;
      if (drift > 0.3) {
        const n = Math.min(6, Math.floor(dt * 70 * drift + Math.random()));
        for (let k = 0; k < n; k++) {
          const s = k % 2 ? 1 : -1;
          fx.puff(rx - hz * 1.15 * s + (Math.random() - 0.5) * 0.6, 0.4, rz + hx * 1.15 * s + (Math.random() - 0.5) * 0.6, -hx * 3 + (Math.random() - 0.5) * 3, -hz * 3 + (Math.random() - 0.5) * 3, Math.random() < 0.5 ? 0xf6e2ee : 0xe3cdf0, 1.25 + drift * 0.9);
        }
        skidTimer += dt;
        if (skidTimer > 0.045) {
          skidTimer = 0;
          for (const s of [-1, 1]) fx.skid(rx - hz * 1.12 * s, rz + hx * 1.12 * s, -angle - Math.PI / 2, Math.max(0.6, speed * 0.06));
        }
      } else if (!game && Math.random() < dt * 6) {
        fx.puff(rx - hz * 1.1, 0.35, rz + hx * 1.1, -hx, -hz, 0xf6e2ee, 0.8);
      }
      if (lastDrift > 0.6 && drift < 0.35) for (let k = 0; k < 4; k++) fx.spark(px - hx * 2.9, 0.4, pz - hz * 2.9, 3, 0xff8a3d, 3);
    }
    lastDrift = drift;
    if (ended) {
      if (!endTime) endTime = t;
      if (game.win && !reducedMotion && t - endTime < 6000) for (let k = 0; k < 2; k++) if (Math.random() < dt * 30) fx.confetti(px, 0, pz);
    }
    fx.update(dt);
    // ---------- pedestrians (visual only) ----------
    threats.length = 0;
    threats.push({ x: px, z: pz, vx: Math.cos(angle) * speed, vz: Math.sin(angle) * speed });
    for (const s of policeStates) threats.push({ x: s.x / 10, z: s.y / 10, vx: Math.cos(s.angle) * (s.speed ?? 0) / 10, vz: Math.sin(s.angle) * (s.speed ?? 0) / 10 });
    for (const s of trafficStates) threats.push({ x: s.x / 10, z: s.y / 10, vx: Math.cos(s.angle) * s.speed / 10, vz: Math.sin(s.angle) * s.speed / 10 });
    if (game !== pedGame) { peds.clear(); pedGame = game; comic?.clear(); comicQueue.length = 0; trails.clear(); driftHeld = 0; }
    peds.update(Math.min(dt, 0.05), t / 1000, px, pz, Math.cos(game ? heading : angle), Math.sin(game ? heading : angle), threats, reducedMotion, tier === 0 ? 28 : tier === 1 ? 50 : 80, cityMap(game?.seed ?? seed));
    dyn.flush();

    // ---------- camera director ----------
    let fov = 58;
    if (playing || (game && !ended)) {
      heading = lerpAngle(heading, angle, 1 - Math.exp(-dt * 4.2));
      const dx = Math.cos(heading), dz = Math.sin(heading);
      const fast = Math.max(0, Math.min(1, (speed * 10 - 240) / 39));
      const back = 14.2 + fast * 1.2, height = 9.4;
      eye.set(px - dx * back - dz * steerVis * 0.9, height, pz - dz * back + dx * steerVis * 0.9);
      look.set(px + dx * 11, 1.2, pz + dz * 11);
      fov = 58 + fast * 6;
      if (countdown > 0) {
        // Swoop from a low front three-quarter view into the chase position.
        const k2 = Math.min(1, countdown / 1.8);
        const e2 = k2 * k2 * (3 - 2 * k2);
        tmp.set(px + dx * 9 - dz * 5, 2.4, pz + dz * 9 + dx * 5);
        eye.lerp(tmp, e2);
        look.lerp(tmp.set(px, 1.1, pz), e2);
      }
      post.uniforms.uSpeed.value = reducedMotion ? 0 : fast * 0.6 + drift * 0.15;
    } else if (ended) {
      const et = (t - endTime) / 1000;
      const a = angle + 0.55 + (reducedMotion ? 0 : et * 0.1);
      const r = 19 - Math.min(2, et * 0.5);
      eye.set(px + Math.cos(a) * r, 4.4, pz + Math.sin(a) * r);
      look.set(px, -2.4, pz);
      fov = 50;
      post.uniforms.uSpeed.value = 0;
    } else {
      const sway = reducedMotion ? 0 : Math.sin(t * 0.00025) * 0.8;
      eye.set(px + 2.4 + sway, 2.3, pz + 11.2);
      look.set(px - 0.7, 1.35, pz - 4);
      fov = 54;
      post.uniforms.uSpeed.value = 0;
    }
    if (!camInit || !game) { camera.position.copy(eye); camLook.copy(look); camInit = true; }
    else {
      const kpos = 1 - Math.exp(-dt * (playing ? 9 : 3));
      camera.position.lerp(eye, kpos);
      camLook.lerp(look, 1 - Math.exp(-dt * (playing ? 12 : 3)));
    }
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake * 0.7;
      camera.position.y += (Math.random() - 0.5) * shake * 0.5;
      shake = Math.max(0, shake - dt * 3.2);
    }
    if (!reducedMotion) fov += comboPulse * 5;
    comboPulse = Math.max(0, comboPulse - dt * 3);
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();
    camera.up.set(playing && !reducedMotion ? steerVis * 0.035 : 0, 1, 0).normalize();
    camera.lookAt(camLook);
    camera.updateMatrixWorld();

    // hero cut-out for buildings in front of the car
    tmp.set(px, 1.0, pz).project(camera);
    SHARED.uCut.value.set(((tmp.x + 1) * w) / 2, ((tmp.y + 1) * h) / 2, tmp.z * 0.5 + 0.5 - 0.0004, game ? h * 0.11 : 0);

    // lights follow the action
    const sunDir = SHARED.uSunDir.value;
    sunLight.position.set(px + sunDir.x * 80, 70, pz + sunDir.z * 80);
    sunLight.target.position.set(px + dirx * 12, 0, pz + dirz * 12);
    fill.position.set(px - sunDir.x * 50, 60, pz - sunDir.z * 50);
    fill.target.position.set(px, 0, pz);
    sky.update(camera);
    key.visible = tier > 0;
    key.position.copy(camera.position).lerp(heroPos, 0.35).add(tmp.set(0, 3, 0));
    key.intensity = game && playing ? 14 : ended ? 26 : 34;

    // post
    flash = Math.max(0, flash - dt * 1.8);
    post.uniforms.uFlash.value = reducedMotion ? flash * 0.4 : flash;
    post.uniforms.uFlashCol.value.copy(flashCol);
    post.uniforms.uDesat.value = ended && !game.win ? Math.min(0.35, (t - endTime) / 1500) : 0;
    post.uniforms.uTime.value = t / 1000;
    post.render(scene, camera, tier > 0);

    // ---------- comic ink layer ----------
    if (comic) {
      comic.resize(cw, ch);
      const fxOn = !reducedMotion && !low;
      if (fxOn && speed > 0 && drift > 0.35) {
        for (const s of [-1, 1]) {
          const [nx, ny, vis] = toScreen(px - hx * 2.2 - hz * 1.15 * s, 0.25, pz - hz * 2.2 + hx * 1.15 * s);
          if (!vis) continue;
          const [ex, ey] = toScreen(px - hx * 4 - hz * 2.6 * s, 0.3, pz - hz * 4 + hx * 2.6 * s);
          comic.drift(nx, ny, ex - nx, ey - ny, Math.min(1, dt * 30) * drift);
        }
      }
      for (const e of comicQueue) {
        if (!fxOn && e.type !== "hit") continue;
        const [nx, ny, vis] = toScreen(px + hx * 1.5, 1.2, pz + hz * 1.5);
        if (vis) comic.burst(nx, ny - 0.02, e.type, e.mult || 1);
      }
      comicQueue.length = 0;
      if (fxOn && playing) comic.speedLines(post.uniforms.uSpeed.value);
      // Street-art state feedback: graffiti streaks off the back at top speed, a tag for a long drift.
      if (fxOn && playing && topSpeedT > 0.6) {
        for (const sd of [-1, 1]) {
          const [nx, ny, vis] = toScreen(px - hx * 2.9 - hz * 1.05 * sd, 0.9, pz - hz * 2.9 + hx * 1.05 * sd);
          const [ex, ey] = toScreen(px - hx * 7 - hz * 1.6 * sd, 0.9, pz - hz * 7 + hx * 1.6 * sd);
          if (vis) comic.tail(nx, ny, ex - nx, ey - ny);
        }
      }
      driftHeld = drift > 0.75 && speed > 0 ? driftHeld + dt : 0;
      if (fxOn && driftHeld > 1.1 && !perfectShown) {
        perfectShown = true;
        const [nx, ny, vis] = toScreen(px, 2.4, pz);
        if (vis) comic.tag(nx, ny - 0.05, "PERFECT");
      }
      if (driftHeld === 0) perfectShown = false;
      comic.frame(dt);
    }

    // ---------- off-screen threat indicator ----------
    if (arrow) {
      arrow.hidden = true;
      if (playing) for (const o of policeList) {
        if (o.position.distanceTo(heroPos) > 46) break;
        const v = tmp.copy(o.position).setY(1).project(camera);
        const behind = v.z > 1;
        if (!behind && Math.abs(v.x) <= 0.92 && Math.abs(v.y) <= 0.92) continue;
        let ax = behind ? -v.x : v.x, ay = behind ? -v.y : v.y;
        if (behind && Math.abs(ay) < 0.5) ay = -1;
        const a = Math.atan2(-ay, ax);
        arrow.style.left = 50 + 42 * Math.cos(a) + "%";
        arrow.style.top = 52 + 36 * Math.sin(a) + "%";
        arrow.style.transform = "translate(-50%,-50%) rotate(" + (a + Math.PI / 2) + "rad)";
        arrow.hidden = false;
        break;
      }
    }
  }
  draw.setPaint = (body, stripe) => {
    const key = body + "/" + stripe;
    if (key === paintKey) return;
    paintKey = key;
    const old = hero.userData.body.geometry;
    hero.userData.body.geometry = heroBody(body, stripe);
    old.dispose();
  };
  /** Render the current view at a share-card resolution and return a 2D canvas copy. */
  draw.snapshot = (w, h) => {
    const pw = canvas.width, ph = canvas.height, aspect = camera.aspect;
    renderer.setSize(w, h, false);
    post.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    post.uniforms.uFlash.value = 0;
    post.render(scene, camera, true);
    const out = document.createElement("canvas");
    out.width = w; out.height = h;
    out.getContext("2d").drawImage(canvas, 0, 0);
    renderer.setSize(pw, ph, false);
    post.setSize(pw, ph);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    return out;
  };
  return draw;
}
