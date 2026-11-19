import * as T from "../vendor/three.js";
import { U, carMaterial, kitMaterial, glowMaterial } from "./gfx/materials.js";
import { buildCar, buildWheel } from "./gfx/carmodel.js";
import { createSky, TOD } from "./gfx/sky.js";
import { createPost } from "./gfx/post.js";
import { createWorld } from "./gfx/world.js";
import { createParticles } from "./gfx/particles.js";
import { createEffects } from "./gfx/effects.js";
import { createTrails } from "./gfx/trails.js";
import { createComic } from "./gfx/comic.js";
import { Kit } from "./gfx/kit.js";
import { CARS, carById, POLICE, TRAFFIC, TRAFFIC_COLORS } from "./cars.js";
import { pads } from "./map.js";

/* Renderer: consumes simulation state and never changes gameplay. Owns the camera director (speed,
   nitro, brake, handbrake, drift and impact feel), actor sync, lights, effects and post. */
const TICK = 1 / 60;
const RED = new T.Color(2.2, 0.12, 0.2), BLUE = new T.Color(0.2, 0.55, 2.4), WARM = new T.Color(1.0, 0.78, 0.5), TAILC = new T.Color(1.6, 0.05, 0.08);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
const GOLD = new T.Color(1.6, 1.15, 0.35);
const CITY = { x: 0, z: -40 }; // centre of Sunset Bay (the aerial intro flies over it)

export function createRenderer(canvas) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", stencil: false });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = T.LinearSRGBColorSpace;
  renderer.toneMapping = T.NoToneMapping;
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  const post = createPost(renderer);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(60, 0.5, 0.25, 2200);
  const hemi = new T.HemisphereLight(0x9aa6ff, 0x5e4048, 1);
  const sun = new T.DirectionalLight(0xffb27a, 2.5);
  scene.add(hemi, sun, sun.target);
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 400 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  const sky = createSky(renderer);
  scene.add(sky.group);
  const world = createWorld(scene);
  const P = createParticles(scene);
  const fx = createEffects(P);
  const trails = createTrails(scene);
  const ink = document.getElementById("ink");
  const comic = ink ? createComic(ink) : null;
  const headSpot = new T.SpotLight(0xfff0d8, 0, 60, 0.5, 0.55, 1.4);
  scene.add(headSpot, headSpot.target);
  const beacons = [new T.PointLight(0xff2a4a, 0, 22, 1.8), new T.PointLight(0x2f86ff, 0, 22, 1.8)];
  for (const l of beacons) scene.add(l);
  const flashLight = new T.PointLight(0xffa040, 0, 60, 1.5);
  scene.add(flashLight);
  let todName = "sunset", tod = sky.apply("sunset", scene, { hemi, sun });

  /* ---------- glows (dynamic light sprites) ---------- */
  const glowMat = glowMaterial();
  function glowMesh(cap, flat) {
    const g = flat ? new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2) : new T.PlaneGeometry(1, 1);
    const m = new T.InstancedMesh(g, glowMat, cap);
    m.geometry.setAttribute("aCol", new T.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(T.DynamicDrawUsage));
    m.count = 0; m.frustumCulled = false; m.renderOrder = 4;
    scene.add(m);
    return m;
  }
  const gFlat = glowMesh(260, true), gBill = glowMesh(260, false);
  // soft contact shadows under every car (grounds them even when real shadows are off)
  const shadowMat = new T.MeshBasicMaterial({ color: 0x000000, alphaMap: null, transparent: true, opacity: 0.62, depthWrite: false });
  shadowMat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <alphamap_fragment>", "{ vec2 q = vUv * 2. - 1.; diffuseColor.a *= smoothstep(1., 0.25, length(q * vec2(1., 1.))); }"); };
  shadowMat.customProgramCacheKey = () => "esc60-contact-shadow";
  shadowMat.defines = { USE_UV: "" };
  const contactMesh = new T.InstancedMesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), shadowMat, 64);
  contactMesh.count = 0; contactMesh.frustumCulled = false; contactMesh.renderOrder = 1;
  scene.add(contactMesh);
  function contact(x, z, yaw, w, l) {
    if (contactMesh.count >= 64) return;
    gm.compose(gv.set(x, 0.04, z), gq.setFromEuler(ge.set(0, yaw, 0)), gs.set(w, 1, l));
    contactMesh.setMatrixAt(contactMesh.count++, gm);
  }
  const gm = new T.Matrix4(), gq = new T.Quaternion(), gv = new T.Vector3(), gs = new T.Vector3(), ge = new T.Euler();
  function glow(flat, x, y, z, sx, sz, yaw, col, k) {
    const m = flat ? gFlat : gBill;
    if (m.count >= 260 || k <= 0.003) return;
    if (flat) gq.setFromEuler(ge.set(0, yaw, 0)); else gq.copy(camera.quaternion);
    gm.compose(gv.set(x, y, z), gq, gs.set(sx, flat ? 1 : sz, flat ? sz : 1));
    m.setMatrixAt(m.count, gm);
    m.geometry.getAttribute("aCol").setXYZW(m.count, col.r, col.g, col.b, k);
    m.count++;
  }

  /* ---------- vehicles ---------- */
  const heroMat = carMaterial(true), copMat = carMaterial(false), wreckMat = carMaterial(false), trafficMat = carMaterial(false);
  copMat.userData.u.uSiren.value.set(1, 0);
  wreckMat.userData.u.uCharred.value = 0.92; wreckMat.userData.u.uDamage.value = 1;
  trafficMat.userData.u.uBrake.value = 0.15;
  const kitMat = kitMaterial();
  function carGroup(model, mat, wheelColor, spin = true) {
    const g = new T.Group();
    const body = new T.Mesh(model.geometry, mat);
    body.castShadow = true;
    const tilt = new T.Group(); // pitch / roll / bounce live here
    tilt.add(body);
    g.add(tilt);
    const wgeo = buildWheel(model.wr, model.ww, wheelColor);
    const wheels = [];
    for (const w of model.wheels) {
      const pivot = new T.Group();
      pivot.position.set(w.x, w.y, w.z);
      const m = new T.Mesh(wgeo, mat);
      m.castShadow = true;
      if (w.side < 0) m.rotation.y = Math.PI;
      pivot.add(m);
      g.add(pivot);
      wheels.push({ pivot, mesh: m, front: w.front });
    }
    g.userData = { body, tilt, wheels, model, spin: 0, wr: model.wr };
    return g;
  }
  let hero = null, heroSpec = null, heroKey = "";
  function setCar(id, paint = null, livery = "clean", stripe = null, rim = 0xb8bec8) {
    const c = carById(id);
    const key = [id, paint, livery, stripe, rim].join("|");
    if (key === heroKey) return;
    heroKey = key;
    if (hero) { scene.remove(hero); hero.userData.body.geometry.dispose(); }
    const model = buildCar(c.body, { paint: paint ?? c.paint, stripe: stripe ?? c.stripe, livery: livery === "clean" ? null : livery });
    heroSpec = c;
    hero = carGroup(model, heroMat, rim);
    scene.add(hero);
  }
  setCar(CARS[0].id);
  const model0 = () => hero.userData.model;
  const copModels = {};
  const copLivery = { cruiser: [0x0e1014, 0xf4f5f7, "twotone"], interceptor: [0x0d1b3a, 0xf4f5f7, "side"], suv: [0x101216, 0xf4f5f7, "twotone"] };
  function copModel(type) {
    if (!copModels[type]) { const [p, s, l] = copLivery[type]; copModels[type] = buildCar(POLICE[type].body, { paint: p, stripe: s, livery: l, police: true }); }
    return copModels[type];
  }
  const trafficGeo = new Map();
  function trafficMesh(type, color) {
    const key = type + "/" + color;
    let geo = trafficGeo.get(key);
    if (!geo) {
      const model = buildCar(TRAFFIC[type], { paint: TRAFFIC_COLORS[color] });
      const parts = [model.geometry];
      const wg = buildWheel(model.wr, 0.22, 0x9aa0a8);
      for (const w of model.wheels) { const g = wg.clone(); if (w.side < 0) g.rotateY(Math.PI); g.translate(w.x, w.y, w.z); parts.push(g); }
      geo = merge(parts);
      trafficGeo.set(key, geo);
    }
    const m = new T.Mesh(geo, trafficMat);
    m.castShadow = true;
    const g = new T.Group(); g.add(m); g.userData = { body: m };
    return g;
  }
  function merge(list) {
    const names = ["position", "normal", "color", "aMat"];
    let n = 0; for (const g of list) n += g.attributes.position.count;
    const out = new T.BufferGeometry();
    for (const nm of names) {
      const sz = list[0].attributes[nm].itemSize, arr = new Float32Array(n * sz);
      let o = 0; for (const g of list) { arr.set(g.attributes[nm].array, o); o += g.attributes[nm].array.length; }
      out.setAttribute(nm, new T.BufferAttribute(arr, sz));
    }
    out.computeBoundingSphere();
    return out;
  }
  const actors = new WeakMap();
  const live = { police: new Set(), traffic: new Set(), blocks: new Set() };
  const seen = new Set();
  function sync(kind, states, factory) {
    const set = live[kind];
    seen.clear();
    for (const s of states) {
      let o = actors.get(s);
      if (!o) { o = factory(s); actors.set(s, o); scene.add(o); }
      seen.add(o);
    }
    for (const o of set) if (!seen.has(o)) scene.remove(o);
    set.clear();
    for (const o of seen) set.add(o);
  }
  function makeBlock(b) {
    const g = new T.Group();
    const model = copModel("cruiser");
    b.units.forEach((u, i) => {
      if (i % 2 === 0) {
        const c = new T.Mesh(model.geometry, copMat);
        c.position.set(u.x, 0, u.y);
        c.rotation.y = Math.atan2(b.tx, b.ty) + Math.PI / 2 + (i % 4 ? 0.35 : -0.35);
        c.castShadow = true;
        g.add(c);
      } else {
        const k = new Kit();
        for (let s = 0; s < 4; s++) k.set(s % 2 ? 0xf2f2ee : 0xd62839, 0.6).cbox(-0.75 + s * 0.5, 0.8, 0, 0.5, 0.26, 0.1);
        k.set(0x2b2f36, 0.6, 0.4).cbox(-0.85, 0.42, 0, 0.07, 0.84, 0.5).cbox(0.85, 0.42, 0, 0.07, 0.84, 0.5);
        const m = new T.Mesh(k.geometry(), kitMat);
        m.position.set(u.x, 0, u.y);
        m.rotation.y = Math.atan2(-b.ty, b.tx);
        g.add(m);
      }
    });
    if (b.spike) {
      const k = new Kit();
      k.set(0x1a1a1c, 0.6, 0.5).cbox(0, 0.05, 0, b.sw * 2, 0.08, 0.5);
      for (let s = -b.sw; s < b.sw; s += 0.3) k.set(0xd0d4da, 0.3, 0.9).cbox(s, 0.14, 0, 0.05, 0.12, 0.05);
      const m = new T.Mesh(k.geometry(), kitMat);
      m.position.set(b.sx, 0, b.sy);
      m.rotation.y = Math.atan2(-b.ty, b.tx);
      g.add(m);
    }
    g.userData = { born: performance.now() };
    return g;
  }
  // helicopter
  const heli = (() => {
    const k = new Kit();
    k.set(0x13151a, 0.4, 0.4).blob(0, 0, 0, 1.5, 1.3, 2.6, 1).set(0xf4f5f7, 0.5).cbox(0, -0.2, 0, 3.0, 0.6, 2.4);
    k.set(0x13151a, 0.4, 0.4).cbox(0, 0.3, 4.2, 0.4, 0.4, 5).cbox(0, 1.0, 6.6, 0.15, 1.4, 0.8);
    k.set(0x6f9fd8, 0.08, 0.5).blob(0, 0.2, -1.6, 1.1, 0.8, 1.2, 0);
    k.set(0x2b2f36, 0.5, 0.5).cbox(-1.1, -1.4, 0, 0.12, 0.12, 3.4).cbox(1.1, -1.4, 0, 0.12, 0.12, 3.4);
    k.set(0xff2030, 0.3, 0, 3, 2).cbox(0, 1.2, 0.8, 0.2, 0.2, 0.2);
    const g = new T.Group();
    g.add(new T.Mesh(k.geometry(), kitMat));
    const rk = new Kit(); rk.set(0x222428, 0.5, 0.5).cbox(0, 0, 0, 11, 0.06, 0.4).cbox(0, 0, 0, 0.4, 0.06, 11);
    const rotor = new T.Mesh(rk.geometry(), kitMat); rotor.position.y = 1.5; g.add(rotor);
    g.userData.rotor = rotor; g.visible = false;
    scene.add(g);
    return g;
  })();

  /* ---------- debris from knocked-over props ---------- */
  const debris = [];
  function spawnDebris(h, vx, vz) {
    if (debris.length > 18) { const d = debris.shift(); scene.remove(d.m); }
    const m = new T.Mesh(h.geo, kitMat);
    m.position.set(h.x, 0, h.z); m.rotation.y = h.ry; m.scale.setScalar(h.s);
    m.castShadow = true;
    scene.add(m);
    const sp = Math.hypot(vx, vz);
    debris.push({ m, vx: vx * 0.75 + (Math.random() - 0.5) * 3, vy: 2 + sp * 0.12 + Math.random() * 3, vz: vz * 0.75 + (Math.random() - 0.5) * 3, ax: (Math.random() - 0.5) * 8, az: (Math.random() - 0.5) * 8, t: 0 });
    if (h.type === "hydrant") fx.hydrant(h.x, h.z);
    fx.impact(h.x, 0.8, h.z, 6, [0.6, 0.6, 0.6]);
  }
  function updateDebris(dt) {
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.t += dt; d.vy -= 16 * dt;
      d.m.position.x += d.vx * dt; d.m.position.y += d.vy * dt; d.m.position.z += d.vz * dt;
      if (d.m.position.y < 0) { d.m.position.y = 0; d.vy = -d.vy * 0.3; d.vx *= 0.6; d.vz *= 0.6; d.ax *= 0.6; d.az *= 0.6; }
      d.m.rotation.x += d.ax * dt; d.m.rotation.z += d.az * dt;
      if (d.t > 5) { d.m.scale.multiplyScalar(1 - dt * 3); if (d.t > 6) { scene.remove(d.m); debris.splice(i, 1); } }
    }
  }

  /* ---------- quality ---------- */
  const LADDER = [{ dpr: 2, scale: 1, shadow: true }, { dpr: 1.5, scale: 1, shadow: true }, { dpr: 1.3, scale: 0.9, shadow: false }, { dpr: 1.1, scale: 0.8, shadow: false }, { dpr: 1, scale: 0.68, shadow: false }, { dpr: 1, scale: 0.55, shadow: false }];
  const gpu = (() => { try { const gl = renderer.getContext(), e = gl.getExtension("WEBGL_debug_renderer_info"); return String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase(); } catch { return ""; } })();
  const mobile = matchMedia("(pointer: coarse)").matches || /android|iphone|ipad|mobile/i.test(navigator.userAgent);
  const weak = /mali-[t4]|mali-g(31|51|52|57|68)|adreno \(tm\) [3-5]\d\d|adreno [3-5]\d\d|powervr|sgx|swiftshader|llvmpipe|intel\(r\) hd graphics [2-5]/.test(gpu);
  let rung = weak ? 4 : mobile ? 3 : 1, cost = 16, slow = 0, fast = 0, qualityMode = "auto";

  /* ---------- camera / director state ---------- */
  const cam = { yaw: 0, lag: 0, fovKick: 0, trauma: 0, roll: 0, nitro: 0, brake: 0, hand: 0, blurPulse: 0, ca: 0, flash: 0, flashCol: new T.Color(), init: false, intro: 0, pursuit: 0, tailW: 0, tailD: 10 };
  // pursuit director: a cinematic reveal the first time a cop locks onto your tail (with cooldown)
  let reveal = null, revealReadyAt = 0;
  const revealSeen = new Set();
  /** What the HUD overlay needs from this frame (hero position, intro progress, pursuit state). */
  const view = { px: 0, pz: 0, a: 0, h: 0, intro: 0, pursuit: 0, reveal: 0 };
  const eye = new T.Vector3(), look = new T.Vector3(), camLook = new T.Vector3(), tmp = new T.Vector3();
  let prevGame = null, eventIndex = 0, lastT = 0, prevV = 0, accel = 0, endT = 0, slowUntil = 0, slowScale = 1, menuT0 = 0, garageYaw = 0.6, lastBrake = false, skidT = 0;
  const prevWheel = [null, null];
  const draw = {};
  draw.timeScale = 1;
  const MENU_SPOT = (() => { const lot = pads.find((p) => p.kind === "lot"); return { x: lot.x, z: lot.y + 6, h: Math.PI / 2 }; })();

  draw.init = (onProgress) => world.init(onProgress);
  draw.setCar = setCar;
  draw.setEffects = (s) => { fx.setStyle(s); trails.setColor(s.trail === "neon" ? new T.Color(...fx.accent(2)) : TAILC); };
  draw.setTOD = (name) => { if (name === todName || !TOD[name]) return; todName = name; tod = sky.apply(name, scene, { hemi, sun }); world.refresh(); };
  draw.setQuality = (q) => { qualityMode = q; if (q === "high") rung = 0; if (q === "low") rung = 4; };
  draw.garageRotate = (dx) => { garageYaw += dx; };
  draw.project = (x, y, z) => { tmp.set(x, y, z).project(camera); return [(tmp.x + 1) / 2, (1 - tmp.y) / 2, tmp.z < 1]; };
  draw.camera = camera;
  draw.world = world;
  draw.view = view;
  draw.onReveal = null;

  draw.frame = (game, t, opts = {}) => {
    const { mode = "menu", alpha = 0, countdown = 0, introTotal = 0, reduced = false, shakeOn = true } = opts;
    const realDt = Math.max(0.0001, Math.min(0.1, (t - lastT) / 1000));
    lastT = t;
    const vdt = realDt * (t < slowUntil ? slowScale : 1);
    draw.timeScale = t < slowUntil ? slowScale : 1;
    U.uTime.value = t / 1000;
    renderer.info.reset();

    // adaptive quality
    cost += 0.06 * (realDt * 1000 - cost);
    if (cost > 24) { slow++; fast = 0; } else if (cost < 14) { fast++; slow = 0; } else { slow = 0; fast = Math.max(0, fast - 1); }
    if (qualityMode === "auto") {
      if (slow > (cost > 40 ? 25 : 70) && rung < LADDER.length - 1) { rung++; slow = 0; }
      else if (fast > 480 && rung > 0) { rung--; fast = 0; }
    }
    const L = LADDER[qualityMode === "low" ? Math.max(4, rung) : rung];
    const low = rung >= 4;
    const dpr = Math.min(window.devicePixelRatio || 1, L.dpr);
    const cw = canvas.clientWidth || 390, ch = canvas.clientHeight || 780;
    const k = L.scale * dpr * Math.min(1, 1400 / Math.max(cw, ch));
    const w = Math.max(1, Math.round(cw * k)), h = Math.max(1, Math.round(ch * k));
    if (canvas.width !== w || canvas.height !== h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    post.setSize(w, h);
    const shadows = L.shadow && !mobile;
    if (renderer.shadowMap.enabled !== shadows) { renderer.shadowMap.enabled = shadows; scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); }
    sun.castShadow = shadows;

    const playing = game?.state === "playing", ended = game?.state === "ended";
    if (game !== prevGame) {
      prevGame = game; eventIndex = 0; cam.init = false; endT = 0; P.clear(); fx.clear(); trails.clear();
      world.resetBreakables(); prevWheel[0] = prevWheel[1] = null; slowUntil = 0; menuT0 = t;
      reveal = null; revealSeen.clear(); revealReadyAt = t + 6000; cam.pursuit = 0; cam.tailW = 0;
      heroMat.userData.u.uCharred.value = 0; heroMat.userData.u.uDamage.value = 0;
      for (const d of debris) scene.remove(d.m); debris.length = 0;
    }

    // ---------- hero pose ----------
    let px, pz, h0, a0, v = 0, slip = 0, steer = 0, boost = false, brake = false, hand = false, hp = 100;
    if (game) {
      const p = game.player, ex = playing ? alpha * TICK : 0;
      px = p.x + Math.cos(p.a) * p.v * ex; pz = p.y + Math.sin(p.a) * p.v * ex;
      h0 = p.h; a0 = p.a; v = playing ? p.v : 0; slip = p.slip; steer = p.steer; boost = playing && p.boost; brake = playing && p.brake; hand = playing && p.hand; hp = game.health;
    } else {
      px = MENU_SPOT.x; pz = MENU_SPOT.z; h0 = a0 = MENU_SPOT.h;
    }
    accel += (((v - prevV) / Math.max(realDt, 1e-3)) - accel) * damp(6, realDt);
    prevV = v;
    const ud = hero.userData;
    hero.position.set(px, 0, pz);
    hero.rotation.y = -h0 - Math.PI / 2;
    // body dynamics: squat/dive from acceleration, roll from cornering, bounce
    const lat = v * (game ? game.player.yaw : 0);
    ud.tilt.rotation.x += (clamp(-accel * 0.0028, -0.06, 0.04) - ud.tilt.rotation.x) * damp(8, realDt);
    ud.tilt.rotation.z += (clamp(lat * 0.0016, -0.07, 0.07) - ud.tilt.rotation.z) * damp(6, realDt);
    ud.tilt.position.y = playing ? Math.sin(t / 55) * 0.006 * Math.min(1, v / 30) : 0;
    ud.spin -= (v * vdt) / ud.wr;
    const frontSteer = clamp(steer * 0.42 - slip * 0.9, -0.6, 0.6);
    for (const wh of ud.wheels) { wh.mesh.rotation.x = ud.spin; if (wh.front) wh.pivot.rotation.y = -frontSteer; }
    hero.visible = true;
    heroMat.userData.u.uBrake.value = brake ? 1 : hand ? 0.7 : 0.15;
    heroMat.userData.u.uDamage.value += ((game ? Math.pow(1 - hp / 100, 1.2) * 0.9 : 0) - heroMat.userData.u.uDamage.value) * damp(3, realDt);

    // ---------- world ----------
    world.update(px, pz, t, vdt, fx);
    // ---------- actors ----------
    const policeStates = game ? game.police : [];
    sync("police", policeStates, (s) => { const g = carGroup(copModel(s.type), copMat, 0x3a3e46); g.userData.type = s.type; return g; });
    gFlat.count = 0; gBill.count = 0; contactMesh.count = 0;
    contact(px, pz, hero.rotation.y, model0().size[0] * 1.45, model0().size[2] * 1.25);
    const cops = [];
    for (const s of policeStates) {
      const o = actors.get(s), u2 = o.userData;
      const moving = playing && !(s.wreck > 0) && !(s.stun > 0), ex = moving ? alpha * TICK : 0;
      o.position.set(s.x + Math.cos(s.a) * s.v * ex, 0, s.y + Math.sin(s.a) * s.v * ex);
      o.rotation.y = -s.h - Math.PI / 2;
      contact(o.position.x, o.position.z, o.rotation.y, 2.7, 6);
      u2.spin -= (s.v * vdt) / u2.wr;
      for (const wh of u2.wheels) { wh.mesh.rotation.x = u2.spin; if (wh.front) wh.pivot.rotation.y = -clamp(Math.atan2(Math.sin(s.h - s.a), Math.cos(s.h - s.a)) * -1, -0.5, 0.5); }
      if (s.wreck > 0) {
        if (!u2.wrecked) { u2.wrecked = true; u2.body.material = wreckMat; for (const wh of u2.wheels) wh.mesh.material = wreckMat; fx.explosion(o.position.x, 0, o.position.z, 0.75); cam.trauma = Math.min(1, cam.trauma + 0.5); flashLight.position.set(o.position.x, 3, o.position.z); flashLight.intensity = 400; }
        fx.burning(o.position.x, 0.4, o.position.z, vdt, 0.8);
        u2.tilt.rotation.z = 0.08;
      } else cops.push(o);
    }
    cops.sort((a, b) => a.position.distanceToSquared(hero.position) - b.position.distanceToSquared(hero.position));
    const phase = Math.floor((t / 1000) * 5.2) % 2;
    let bu = 0;
    cops.forEach((o, i) => {
      const yaw = o.rotation.y, side = (phase + i) % 2;
      if (i < 6) {
        glow(true, o.position.x, 0.08, o.position.z, 9, 9, 0, side ? RED : BLUE, 0.5 + 0.35 * tod.night);
        const bx = o.position.x, by = o.userData.model.barY + 0.2, bz = o.position.z;
        // light bars stay readable far away: the flare grows with distance from the camera
        const far = Math.max(1, o.position.distanceTo(camera.position) / 34);
        glow(false, bx + Math.cos(yaw) * 0.5, by, bz - Math.sin(yaw) * 0.5, 1.7 * far, 1.7 * far, 0, side ? RED : BLUE, 1.0);
        glow(false, bx - Math.cos(yaw) * 0.5, by, bz + Math.sin(yaw) * 0.5, 1.2 * far, 1.2 * far, 0, side ? BLUE : RED, 0.7);
        carLights(o.position.x, o.position.z, yaw, 0.9);
      }
      if (i < 2 && rung < 4) { const l = beacons[bu++]; l.position.set(o.position.x, 5.2, o.position.z); l.color.copy(side ? RED : BLUE); l.intensity = (14 + 30 * tod.night) * clamp(o.position.distanceTo(camera.position) / 18, 0.35, 1); }
      if (i < 4 && playing && rung < 5) world.smash(o.position.x, o.position.z, 1.3).forEach((hh) => spawnDebris(hh, 0, 0));
    });
    for (let i = bu; i < 2; i++) beacons[i].intensity = 0;
    const trafficStates = game ? game.traffic : [];
    sync("traffic", trafficStates, (s) => trafficMesh(s.type, s.color));
    for (const s of trafficStates) {
      const o = actors.get(s), u2 = o.userData;
      const sx = s.x, sz = s.y;
      if (u2.vx === undefined || Math.hypot(u2.vx - sx, u2.vz - sz) > 12) { u2.vx = sx; u2.vz = sz; u2.va = s.h; }
      else { const kk = damp(14, realDt); u2.vx += (sx - u2.vx) * kk; u2.vz += (sz - u2.vz) * kk; u2.va = lerpAngle(u2.va, s.h, damp(s.loose ? 30 : 9, realDt)); }
      o.position.set(u2.vx, 0, u2.vz);
      o.rotation.y = -u2.va - Math.PI / 2;
      contact(u2.vx, u2.vz, o.rotation.y, 2.6, 5.8);
      if (o.position.distanceToSquared(hero.position) < 140 * 140) carLights(u2.vx, u2.vz, o.rotation.y, 0.7);
    }
    const blockStates = game ? game.blocks : [];
    sync("blocks", blockStates, makeBlock);
    for (const s of blockStates) { const o = actors.get(s); const age = Math.min(1, (performance.now() - o.userData.born) / 600); o.position.y = reduced ? 0 : (1 - age) * (1 - age) * 6; glow(true, s.x, 0.08, s.y, 14, 6, Math.atan2(s.tx, s.ty), phase ? RED : BLUE, 0.45); }

    // ---------- hero lights + effects ----------
    const hx = Math.cos(h0), hz = Math.sin(h0), rx = -hz, rz = hx;
    const model = ud.model;
    const rear = model.size[2] / 2;
    const vx = Math.cos(a0) * v, vz = Math.sin(a0) * v;
    headSpot.intensity = tod.night > 0.3 ? 140 * tod.night : 0;
    headSpot.position.set(px + hx * 1.6, 1.2, pz + hz * 1.6);
    headSpot.target.position.set(px + hx * 18, 0, pz + hz * 18);
    glow(true, px + hx * 9, 0.07, pz + hz * 9, 5.5, 15, Math.atan2(hx, hz), WARM, 0.12 + 0.45 * tod.night);
    for (const sd of [-1, 1]) glow(false, px - hx * (rear + 0.05) + rx * 0.62 * sd, 0.75, pz - hz * (rear + 0.05) + rz * 0.62 * sd, brake ? 1.5 : 0.9, brake ? 1.5 : 0.9, 0, TAILC, brake ? 0.9 : 0.35);
    if (game) {
      const absS = Math.abs(slip);
      const driftK = playing ? clamp((absS - 0.12) * 3.2, 0, 1) * (v > 10 ? 1 : 0) : 0;
      const burn = playing && countdown <= 0 && game.ticks > 0 && game.ticks < 45 ? 0.5 : 0;
      const wheelsPos = [-1, 1].map((sd) => [px - hx * (rear - 0.85) + rx * (model.size[0] / 2 - 0.15) * sd, pz - hz * (rear - 0.85) + rz * (model.size[0] / 2 - 0.15) * sd]);
      if (!reduced && (driftK > 0.01 || burn > 0 || (hand && v > 6))) {
        const kk = Math.max(driftK, burn, hand ? 0.5 : 0);
        for (const [wx, wz] of wheelsPos) fx.drift(wx, 0.1, wz, vx, vz, kk, low);
      }
      // skid marks
      skidT += vdt;
      const skidding = playing && (driftK > 0.2 || (brake && v > 18) || (hand && v > 8));
      wheelsPos.forEach(([wx, wz], i) => {
        const pw = prevWheel[i];
        if (pw && skidding && skidT > 0.03) { const dx = wx - pw[0], dz = wz - pw[1], len = Math.hypot(dx, dz); if (len > 0.05 && len < 6) fx.skid((wx + pw[0]) / 2, (wz + pw[1]) / 2, dx / len, dz / len, len + 0.1, 0.45); }
        if (pw && fx.style.trail === "neon" && v > 22 && playing) { const dx = wx - pw[0], dz = wz - pw[1], len = Math.hypot(dx, dz); if (len > 0.05 && len < 6) fx.tireStreak((wx + pw[0]) / 2, (wz + pw[1]) / 2, dx / len, dz / len, len + 0.05, fx.accent(2.2)); }
        if (skidT > 0.03 || !pw) prevWheel[i] = [wx, wz];
      });
      if (skidT > 0.03) skidT = 0;
      // nitro flames + backfire
      const exPos = model.exhausts.map((e) => [px + rx * e[0] - hx * e[2], e[1], pz + rz * e[0] - hz * e[2]]);
      if (boost) for (const [ex, ey, ez] of exPos) fx.nitro(ex, ey, ez, -hx, -hz, vx, vz, 1, low);
      if (playing && brake && !lastBrake && v > 32) for (const [ex, ey, ez] of exPos) fx.backfire(ex, ey, ez, -hx, -hz, vx, vz);
      lastBrake = brake;
      // damage smoke / fire from the bonnet
      if (playing || (ended && game.end !== "wrecked")) fx.damage(px + hx * (rear - 0.9), 0.95, pz + hz * (rear - 0.9), hp, vx * 0.9, vz * 0.9, vdt);
      // tail light trails
      const tl = model.tail.map((q) => [px + rx * q[0] - hx * q[2], q[1], pz + rz * q[0] - hz * q[2]]);
      const trailK = fx.style.trail === "tail" && playing && !reduced ? clamp((v - 48) / 16, 0, 1) * 0.7 + (boost ? 0.5 : 0) : 0;
      trails.update(vdt, tl, low ? 0 : trailK, camera.position);
      // knock props over
      if (playing) world.smash(px, pz, 1.4).forEach((hh) => spawnDebris(hh, vx, vz));
      // heli from heat 4
      heli.visible = (game.heat >= 4 || (ended && game.heat >= 4)) && rung < 5;
      if (heli.visible) {
        const ht = t / 1000, r0 = 26;
        const hx2 = px - hx * 12 + Math.sin(ht * 0.4) * r0 * 0.4, hz2 = pz - hz * 12 + Math.cos(ht * 0.33) * r0 * 0.4;
        heli.position.lerp(tmp.set(hx2, 24 + Math.sin(ht) * 1.2, hz2), damp(1.2, realDt));
        heli.lookAt(px, 0, pz); heli.rotateY(Math.PI);
        heli.userData.rotor.rotation.y += realDt * 30;
        glow(true, px + Math.sin(ht * 1.3) * 2.5, 0.09, pz + Math.cos(ht * 1.1) * 2.5, 9, 9, 0, new T.Color(1.2, 1.25, 1.4), 0.35 + 0.4 * tod.night);
      }
    } else { trails.update(vdt, [[px, 0, pz], [px, 0, pz]], 0, camera.position); heli.visible = false; }

    // ---------- events ----------
    if (game) for (; eventIndex < game.events.length; eventIndex++) onEvent(game.events[eventIndex], game, t, px, pz, reduced);
    // wreck: burning hero
    if (ended && game.end === "wrecked") fx.burning(px, 0.5, pz, vdt, 1);
    fx.update(vdt);
    P.update(vdt);
    updateDebris(vdt);
    flashLight.intensity *= Math.exp(-realDt * 6);
    // dynamic glow buffers
    for (const m of [gFlat, gBill]) { m.instanceMatrix.needsUpdate = true; m.geometry.getAttribute("aCol").needsUpdate = true; }
    contactMesh.instanceMatrix.needsUpdate = true;

    // ---------- pursuit awareness (visual only) ----------
    let pk = 0, revealCand = null, tailW = 0, tailD = 0;
    if (game && playing && countdown <= 0) {
      const fx0 = Math.cos(a0), fz0 = Math.sin(a0);
      for (const s of policeStates) {
        if (s.wreck) continue;
        const dx = s.x - px, dz = s.y - pz, d = Math.hypot(dx, dz) || 1, f = (dx * fx0 + dz * fz0) / d;
        const behind = clamp(-f * 1.3 + 0.15, 0, 1);
        const k = behind * smooth(55, 18, d);
        if (k > pk) pk = k;
        // the closest cop on your tail gets framed together with you
        const w = smooth(0.55, 0.8, -f) * smooth(27, 15, d);
        if (w > tailW) { tailW = w; tailD = Math.min(16, -f * d); }
        if (!revealCand && !revealSeen.has(s.id) && behind > 0.75 && d > 8 && d < 46 && s.mode === 1) revealCand = s;
      }
      if (revealCand && !reveal && t > revealReadyAt && v > 12) {
        revealSeen.add(revealCand.id); revealReadyAt = t + 15000;
        if (!reduced) { reveal = { s: revealCand, t0: t, dur: 2300 }; slowMo(t, 0.42, 1.25); cam.flash = Math.max(cam.flash, 0.22); cam.flashCol.setRGB(0.5, 0.25, 1); }
        draw.onReveal?.(revealCand);
      }
    }
    if (!playing) reveal = null;
    cam.pursuit += (pk - cam.pursuit) * damp(pk > cam.pursuit ? 2.6 : 0.8, realDt);
    cam.tailW += (tailW - cam.tailW) * damp(tailW > cam.tailW ? 2.2 : 0.75, realDt);
    if (tailW > 0.05) cam.tailD += (tailD - cam.tailD) * damp(2, realDt);

    // ---------- camera director ----------
    const portrait = camera.aspect < 0.9;
    view.intro = 0;
    const base = portrait ? { dist: 6.3, height: 2.7, look: 9, fov: 58 } : { dist: 5.9, height: 2.05, look: 8, fov: 50 };
    const sp = clamp(v / 70, 0, 1.3);
    cam.nitro += ((boost ? 1 : 0) - cam.nitro) * damp(boost ? 5 : 2.5, realDt);
    cam.brake += ((brake ? 1 : 0) - cam.brake) * damp(5, realDt);
    cam.hand += ((hand ? 1 : 0) - cam.hand) * damp(5, realDt);
    let fov = base.fov, roll = 0;
    if (game && !ended) {
      // follow the direction of travel (showing the flank in a drift); at low speed follow the nose
      const moveK = clamp((v - 4) / 14, 0, 1);
      const yawTarget = lerpAngle(h0, a0 + slip * 0.5, moveK);
      cam.yaw = cam.init ? lerpAngle(cam.yaw, yawTarget, damp(3.6 + sp * 1.8, realDt)) : yawTarget;
      cam.lag += (clamp(accel * 0.045, -0.8, 0.6) * moveK - cam.lag) * damp(3, realDt);
      // pursuit cam: police closing in from behind lift the camera; a cop right on your tail makes it
      // crane back and up until the chaser is framed with you, above the touch controls
      const pq = cam.pursuit;
      const dist = Math.max(5, base.dist + sp * 0.9 + cam.lag + cam.nitro * 1.0 - cam.brake * 0.3 + pq * 2.6);
      const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
      const side = -slip * 1.4 * (portrait ? 0.7 : 1) * moveK;
      eye.set(px - cy * dist - sy * side, base.height + sp * 0.3 - cam.nitro * 0.25 + pq * 1.8, pz - sy * dist + cy * side);
      const la = base.look * (1 - 0.3 * pq);
      look.set(px + cy * la, portrait ? 0.2 : 0.75, pz + sy * la);
      fov = base.fov + sp * 7 + cam.nitro * 12 - cam.brake * 3 + pq * 3;
      const tw = cam.tailW;
      if (tw > 0.002) {
        const dc = cam.tailD, D = dc * (portrait ? 1.35 : 1.2) + 6.5, Hc = 2.5 + D * (portrait ? 0.38 : 0.3);
        tmp.set(px - cy * D, Hc, pz - sy * D); eye.lerp(tmp, tw);
        tmp.set(px - cy * dc * (portrait ? 0.45 : 0.3), 0, pz - sy * dc * (portrait ? 0.45 : 0.3)); look.lerp(tmp, tw);
        fov += (base.fov + 8 - fov) * tw;
      }
      roll = clamp(-steer * sp * 0.03 - slip * 0.05 - cam.hand * steer * 0.025, -0.09, 0.09);
      let introK = 0;
      if (countdown > 0) {
        // intro: an aerial establishing shot of Sunset Bay that dives down onto the car from behind
        const total = Math.max(introTotal, countdown, 0.001), u = clamp(1 - countdown / total, 0, 1);
        const e = smooth(0.1, 0.97, u);
        introK = 1 - e;
        const hx2 = eye.x - px, hz2 = eye.z - pz, hd = Math.hypot(hx2, hz2) || 1;
        const r1 = Math.hypot(hd, eye.y), el1 = Math.atan2(eye.y, hd), yaw1 = Math.atan2(hz2, hx2);
        // start high above the far side of the city, looking across it at your car, then fly in
        // over the rooftops and swing around behind the car
        const cdx = CITY.x - px, cdz = CITY.z - pz, dc = Math.hypot(cdx, cdz);
        const yaw0 = dc > 160 ? Math.atan2(cdz, cdx) : yaw1 + 1.3;
        const r0 = clamp(dc + (portrait ? 520 : 440), 620, 1150), el0 = 0.36;
        const r = r1 * Math.pow(r0 / r1, Math.pow(1 - e, 1.1));
        const el = el0 + (el1 - el0) * smooth(0.3, 1, e);
        const yc = lerpAngle(yaw0, yaw1, smooth(0.08, 0.92, e)) + (1 - e) * u * 0.22;
        eye.set(px + Math.cos(yc) * r * Math.cos(el), r * Math.sin(el), pz + Math.sin(yc) * r * Math.cos(el));
        tmp.set(px, 0, pz);
        look.lerp(tmp, introK);
        fov = fov + ((portrait ? 62 : 50) - fov) * introK;
        roll *= e;
        // a beacon on the ground marks your car in the wide shot
        const ring = 6 + r * 0.05;
        glow(true, px, 0.12, pz, ring, ring, 0, GOLD, 0.9 * introK);
        glow(true, px, 0.13, pz, ring * 0.45, ring * 0.45, 0, GOLD, 1.2 * introK);
      }
      view.intro = introK;
      if (reveal) {
        // cinematic reveal: crane up behind the chasing cop, framing it with you ahead, then return
        const u = (t - reveal.t0) / reveal.dur, s = reveal.s;
        if (u >= 1 || s.wreck || !game.police.includes(s)) reveal = null;
        else {
          const e = smooth(0, 0.2, u) * (1 - smooth(0.66, 1, u));
          let dx = px - s.x, dz = pz - s.y; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
          const sideAmt = (u - 0.45) * 9, back = 7 + L * 0.2;
          tmp.set(s.x - dx * back - dz * sideAmt, 4.8 + L * 0.16, s.y - dz * back + dx * sideAmt);
          eye.lerp(tmp, e);
          look.lerp(tmp.set(s.x + (px - s.x) * 0.58, 0.9, s.y + (pz - s.y) * 0.58), e);
          fov += (portrait ? 60 : 52) * e - fov * e;
          roll *= 1 - e;
          view.reveal = e;
        }
      }
      if (!reveal) view.reveal = 0;
      if (playing && boost && shakeOn && !reduced) cam.trauma = Math.max(cam.trauma, 0.16);
      // keep the camera out of buildings: pull it in toward the car along the boom
      if (introK < 0.15) for (let k = 1; k <= 6; k++) {
        const u = k / 6, qx = px + (eye.x - px) * u, qz = pz + (eye.z - pz) * u;
        if (world.blocked(qx, qz)) { const f = Math.max(0.35, u - 0.12); eye.x = px + (eye.x - px) * f; eye.z = pz + (eye.z - pz) * f; eye.y += (1 - f) * 2.2; break; }
      }
    } else if (ended) {
      if (!endT) endT = t;
      const et = (t - endT) / 1000;
      const ang = h0 + 0.9 + et * 0.18;
      const r0 = game.end === "wrecked" ? 13 : 10;
      eye.set(px + Math.cos(ang) * r0, 3.2 + Math.min(2, et * 0.4), pz + Math.sin(ang) * r0);
      look.set(px, 0.8, pz);
      fov = 50;
    } else {
      // menu / garage showroom
      const garage = mode === "garage";
      const et = (t - menuT0) / 1000;
      if (garage) { garageYaw += realDt * 0.25; const ang = h0 + garageYaw; eye.set(px + Math.cos(ang) * (portrait ? 8.8 : 7.2), portrait ? 2.6 : 1.7, pz + Math.sin(ang) * (portrait ? 8.8 : 7.2)); look.set(px, portrait ? -1.6 : 0.55, pz); fov = portrait ? 52 : 40; if (!portrait) { look.x += Math.sin(ang) * 1.7; look.z -= Math.cos(ang) * 1.7; } }
      else { const ang = h0 + 0.75 + Math.sin(et * 0.12) * 0.35; const r0 = portrait ? 8.6 : 7.4; eye.set(px + Math.cos(ang) * r0, portrait ? 2.2 : 1.35 + Math.sin(et * 0.2) * 0.2, pz + Math.sin(ang) * r0); look.set(px, portrait ? -0.15 : 0.8, pz); fov = portrait ? 56 : 44; if (!portrait) { look.x -= Math.sin(ang) * -1.8; look.z += Math.cos(ang) * -1.8; } }
    }
    if (!cam.init || (!game && mode !== "garage" && t - menuT0 < 50)) { camera.position.copy(eye); camLook.copy(look); cam.init = true; }
    else {
      const kp = game && !ended ? (view.intro > 0.02 ? 16 : 10) : 3.5;
      camera.position.x += (eye.x - camera.position.x) * damp(kp, realDt);
      camera.position.z += (eye.z - camera.position.z) * damp(kp, realDt);
      camera.position.y += (eye.y - camera.position.y) * damp(kp * 0.7, realDt);
      camLook.lerp(look, damp(game && !ended ? 14 : 4, realDt));
    }
    // shake (trauma²), FOV kicks, roll
    cam.trauma = Math.max(0, cam.trauma - realDt * 1.5);
    const sh = shakeOn && !reduced ? cam.trauma * cam.trauma : 0;
    const tt = t / 1000;
    camera.position.x += Math.sin(tt * 37.1) * Math.cos(tt * 23.3) * sh * 0.5;
    camera.position.y += Math.sin(tt * 41.7 + 1) * sh * 0.32;
    camera.position.z += Math.cos(tt * 29.9) * Math.sin(tt * 31.7) * sh * 0.5;
    cam.fovKick *= Math.exp(-realDt * 4);
    fov += reduced ? 0 : cam.fovKick;
    camera.fov += (fov - camera.fov) * damp(6, realDt);
    camera.updateProjectionMatrix();
    cam.roll += (roll - cam.roll) * damp(5, realDt);
    camera.up.set(reduced ? 0 : Math.sin(cam.roll + Math.sin(tt * 47) * sh * 0.04), 1, 0).normalize();
    camera.lookAt(camLook);
    if (draw.debugCam) { const d = draw.debugCam; camera.position.set(...d.eye); camera.up.set(0, 1, 0); camera.fov = d.fov || 55; camera.updateProjectionMatrix(); camera.lookAt(...d.look); }
    camera.updateMatrixWorld();
    view.px = px; view.pz = pz; view.a = a0; view.h = h0; view.pursuit = cam.pursuit;
    if (!game || ended) view.reveal = 0;
    if (scene.fog && tod.fogD) scene.fog.density = tod.fogD * (1 - 0.6 * view.intro);

    // sun + shadows follow the action
    const sd = U.uSunDir.value;
    sun.position.set(px + sd.x * 150, sd.y * 150, pz + sd.z * 150);
    sun.target.position.set(px, 0, pz);
    sky.update(camera);

    // ---------- post ----------
    const blur = reduced ? 0 : clamp((v - 38) / 45, 0, 1) * 0.35 + cam.nitro * 0.75 + cam.blurPulse;
    cam.blurPulse *= Math.exp(-realDt * 5);
    cam.ca *= Math.exp(-realDt * 4);
    cam.flash = Math.max(0, cam.flash - realDt * 2.2);
    const pu = post.uniforms;
    tmp.set(px, 0.8, pz).project(camera);
    pu.uCenter.value.set((tmp.x + 1) / 2, (tmp.y + 1) / 2);
    pu.uBlur.value = game && !ended ? blur : 0;
    pu.uCA.value = reduced ? 0 : cam.nitro * 0.9 + cam.ca;
    pu.uFlash.value = reduced ? cam.flash * 0.3 : cam.flash;
    pu.uFlashCol.value.copy(cam.flashCol);
    pu.uExposure.value = tod.exposure;
    pu.uShadowTint.value.setRGB(...tod.shadowTint); pu.uHighTint.value.setRGB(...tod.highTint);
    pu.uSat.value = tod.sat;
    pu.uDesat.value = ended && game.end !== "legend" ? Math.min(0.45, (t - endT) / 2500) : 0;
    pu.uTime.value = t / 1000;
    pu.uVignette.value = 0.5 + cam.nitro * 0.25;
    post.render(scene, camera, rung < 5);

    // ---------- comic overlay ----------
    if (comic) {
      comic.resize(cw, ch);
      if (game && playing && !reduced) {
        comic.speedLines(clamp((v - 45) / 30, 0, 1) * 0.5 + cam.nitro, cam.nitro > 0.3 ? fx.style.nitro : "");
        if (cam.nitro > 0.5 && fx.style.burst === "graffiti") {
          const [lx, ly, lv] = draw.project(px - hx * (rear - 0.4) + rx * 0.95, 0.9, pz - hz * (rear - 0.4) + rz * 0.95);
          const [qx, qy, qv] = draw.project(px - hx * (rear - 0.4) - rx * 0.95, 0.9, pz - hz * (rear - 0.4) - rz * 0.95);
          if (lv && qv) comic.wings((lx + qx) / 2, (ly + qy) / 2, Math.abs(lx - qx), (cam.nitro - 0.5) * 2, fx.accent());
        }
      }
      comic.frame(realDt);
    }
  };

  function carLights(x, z, yaw, k) {
    // yaw is the Three.js rotation.y of a car (forward = -z local)
    const fx2 = -Math.sin(yaw), fz2 = -Math.cos(yaw);
    if (tod.night > 0.3) glow(true, x + fx2 * 8, 0.07, z + fz2 * 8, 4.5, 12, Math.atan2(fx2, fz2), WARM, 0.35 * k * tod.night);
    const toCam = (camera.position.x - x) * fx2 + (camera.position.z - z) * fz2;
    if (toCam < 0) for (const sd of [-1, 1]) glow(false, x - fx2 * 2.4 + fz2 * 0.65 * sd, 0.8, z - fz2 * 2.4 - fx2 * 0.65 * sd, 0.8, 0.8, 0, TAILC, 0.3 * k);
    else if (tod.night > 0.2) for (const sd of [-1, 1]) glow(false, x + fx2 * 2.4 + fz2 * 0.7 * sd, 0.7, z + fz2 * 2.4 - fx2 * 0.7 * sd, 1.6, 1.6, 0, WARM, 0.6 * k * tod.night);
  }

  function onEvent(e, game, t, px, pz, reduced) {
    const shake = (a) => { cam.trauma = Math.min(1, cam.trauma + a); };
    switch (e.type) {
      case "hit": {
        shake(Math.min(0.9, 0.25 + e.dmg / 30));
        cam.fovKick -= Math.min(7, 2 + e.dmg * 0.2);
        cam.ca = Math.min(1.5, cam.ca + 0.6 + e.dmg / 30);
        cam.flash = Math.max(cam.flash, 0.25 + e.dmg / 80); cam.flashCol.setRGB(1, 0.1, 0.15);
        if (e.dmg >= 22 && !reduced) slowMo(t, 0.12, 0.12);
        break;
      }
      case "bump": fx.impact(e.x, 0.8, e.y, e.imp); break;
      case "scrape": fx.sparks(px + e.nx * 1.1, 0.4, pz + e.ny * 1.1, -e.ny, e.nx, 6 + e.vn, 6); shake(0.12); break;
      case "near": fx.burst(px, 0.5, pz, "near", e.mult); cam.fovKick += 3.5; cam.blurPulse = 0.35; break;
      case "dodge": fx.burst(px, 0.5, pz, "near", e.mult + 2); cam.fovKick += 4; cam.blurPulse = 0.4; break;
      case "takedown": {
        const c = game.police.find((q) => q.id === e.id);
        if (c) fx.burst(c.x, 1, c.y, "takedown", e.mult);
        shake(0.6); cam.flash = 0.35; cam.flashCol.setRGB(1, 0.7, 0.3);
        if (!reduced) slowMo(t, 0.38, 0.7);
        break;
      }
      case "repair": fx.repair(px, 0.3, pz); cam.flash = 0.35; cam.flashCol.setRGB(0.3, 1, 0.6); cam.fovKick += 2; break;
      case "milestone": fx.confetti(px, 0, pz, 60); fx.burst(px, 1, pz, "takedown", 5); cam.flash = 0.45; cam.flashCol.setRGB(1, 0.85, 0.35); if (!reduced) slowMo(t, 0.3, 1.4); break;
      case "wrecked": fx.explosion(px, 0.4, pz, 1.2); heroMat.userData.u.uCharred.value = 0.85; shake(1); cam.flash = 0.9; cam.flashCol.setRGB(1, 0.6, 0.25); flashLight.position.set(px, 3, pz); flashLight.intensity = 500; if (!reduced) slowMo(t, 0.35, 1.8); break;
      case "busted": cam.flash = 0.4; cam.flashCol.setRGB(0.3, 0.5, 1); break;
      case "spikes": fx.sparks(px, 0.3, pz, 0, 0, 20, 7); shake(0.4); break;
      case "drift": if (e.pts > 1500) cam.fovKick += 2; break;
      default: break;
    }
  }
  function slowMo(t, scale, seconds) { slowScale = scale; slowUntil = t + seconds * 1000; }

  /** Render the current view at a share-card resolution and return a 2D canvas copy. */
  draw.snapshot = (w, h) => {
    const pw = canvas.width, ph = canvas.height, aspect = camera.aspect;
    renderer.setSize(w, h, false); post.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    post.uniforms.uFlash.value = 0; post.uniforms.uBlur.value = 0;
    post.render(scene, camera, true);
    const out = document.createElement("canvas");
    out.width = w; out.height = h;
    out.getContext("2d").drawImage(canvas, 0, 0);
    renderer.setSize(pw, ph, false); post.setSize(pw, ph);
    camera.aspect = aspect; camera.updateProjectionMatrix();
    return out;
  };
  draw.info = () => ({ rung, cost, calls: renderer.info.render.calls, tris: renderer.info.render.triangles });
  return draw;
}
