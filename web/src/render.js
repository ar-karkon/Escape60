import * as T from "../vendor/three.js";
import { chunk, vehicle, batch, cube, paint } from "./city.js";
const skyVertex =
  "varying vec3 ray; void main(){ray=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}";
const skyFragment = `varying vec3 ray;
void main(){
 vec3 d=normalize(ray);
 vec3 col=mix(vec3(1.,.53,.40),vec3(.96,.34,.59),smoothstep(-.04,.17,d.y));
 col=mix(col,vec3(.11,.09,.33),smoothstep(.08,.52,d.y));
 vec2 pixel=floor(vec2(atan(d.x,-d.z),d.y)*160.);
 float bands=sin(pixel.x*.031+pixel.y*.117)+.48*sin(pixel.x*.083-pixel.y*.37);
 if(d.y>.16 && d.y<.43 && bands>1.04+abs(sin(pixel.y*.23))*.25)
   col=mix(col,vec3(.94,.51,.67),.48);
 float sun=distance(d,normalize(vec3(.38,.17,-1.)));
 if(sun<.091 && (d.y>.14 || mod(d.y,.026)>.004)) col=vec3(1.,.88,.52);
 gl_FragColor=vec4(col,1.);
}`;
export function createRenderer(canvas) {
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
  });
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(51, 1, 0.16, 245);
  scene.fog = new T.FogExp2(0xf9a0a2, 0.009);
  const sky = new T.Mesh(
    new T.SphereGeometry(205, 32, 18),
    new T.ShaderMaterial({
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: T.BackSide,
      depthWrite: false,
    }),
  );
  scene.add(sky, new T.HemisphereLight(0xffecdf, 0x847ba6, 2.15));
  const sun = new T.DirectionalLight(0xffcf8f, 2);
  sun.position.set(-32, 46, -25);
  scene.add(sun, sun.target);
  renderer.shadowMap.type = T.BasicShadowMap;
  sun.castShadow = true;
  sun.shadow.mapSize.set(512, 512);
  Object.assign(sun.shadow.camera, {
    left: -38,
    right: 38,
    top: 38,
    bottom: -38,
    near: 1,
    far: 135,
  });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = 0.09;
  const glow = new T.PointLight(0xff5d95, 22, 14);
  scene.add(glow);
  const beacon = [0xff416a, 0x3f98ff].map((color) => {
    const light = new T.PointLight(color, 52, 13);
    scene.add(light);
    return light;
  });
  // Remove only city fragments that project in front of the hero. This also
  // covers signs and bridge decks whose bases lie outside the camera ray.
  const cityPaint = paint.clone(),
    cutout = new T.Vector4();
  cityPaint.onBeforeCompile = (shader) => {
    shader.uniforms.heroCutout = { value: cutout };
    shader.fragmentShader =
      "uniform vec4 heroCutout;\n" +
      shader.fragmentShader.replace(
        "#include <clipping_planes_fragment>",
        "#include <clipping_planes_fragment>\nif(gl_FragCoord.z < heroCutout.z && distance(gl_FragCoord.xy,heroCutout.xy)<heroCutout.w) discard;",
      );
  };
  const hero = vehicle(),
    police = [],
    traffic = [],
    blocks = [],
    tiles = new Map();
  scene.add(hero);
  const trail = new T.InstancedMesh(cube, paint, 96),
    ring = [],
    dummy = new T.Object3D();
  scene.add(trail);
  trail.count = 0;
  trail.frustumCulled = false;
  let seed = "",
    tileKey = "",
    previous = null,
    lastTick = -1,
    heading = 0,
    prevAngle = 0,
    lastTime = 0,
    cost = 16,
    economy = false;
  const center = new T.Vector3(),
    eye = new T.Vector3(),
    target = new T.Vector3();
  function actors(list, states, make, t) {
    while (list.length < states.length) {
      const object = make(list.length);
      list.push(object);
      scene.add(object);
    }
    list.forEach((o, i) => {
      const s = states[i];
      o.visible = !!s;
      if (!s) return;
      o.position.set(s.x / 10, 0, s.y / 10);
      o.rotation.y = -s.angle - Math.PI / 2;
      if (o.userData.bar)
        o.userData.bar.rotation.y = (Math.floor(t / 280 + i) % 2) * Math.PI;
    });
  }
  return function draw(game, t, { reducedMotion, low, seed: menuSeed }) {
    const dt = Math.max(0, Math.min(0.1, (t - lastTime) / 1000));
    lastTime = t;
    cost += 0.03 * (dt * 1000 - cost);
    if (cost > 35) economy = true;
    if (cost < 23) economy = false;
    renderer.shadowMap.enabled = !low && !economy;
    const h = Math.min(canvas.clientHeight, low ? 320 : economy ? 408 : 568),
      w = Math.max(
        1,
        Math.round((canvas.clientWidth * h) / canvas.clientHeight),
      );
    if (canvas.width !== w || canvas.height !== h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const demo = !game,
      playing = game?.state === "playing",
      p = game?.player ?? { x: 0, y: 228, angle: Math.PI * 0.31, drift: 0 };
    const x = p.x / 10,
      z = p.y / 10,
      ix = Math.floor(x / 52),
      iz = Math.floor(z / 52),
      currentSeed = game?.seed ?? menuSeed,
      key = [currentSeed, ix, iz].join("/");
    if (key !== tileKey) {
      const keep = new Set();
      for (let i = ix - 2; i <= ix + 2; i++)
        for (let j = iz - 3; j <= iz + 2; j++) {
          const id = [currentSeed, i, j].join("/");
          keep.add(id);
          if (!tiles.has(id)) {
            const tile = chunk(currentSeed, i, j);
            tile.material = cityPaint;
            scene.add(tile);
            tiles.set(id, tile);
          }
        }
      for (const [id, obj] of tiles)
        if (!keep.has(id)) {
          scene.remove(obj);
          obj.dispose();
          tiles.delete(id);
        }
      tileKey = key;
    }
    const snap = game !== previous || seed !== currentSeed;
    if (snap) {
      heading = p.angle;
      prevAngle = p.angle;
      ring.length = 0;
      lastTick = -1;
    }
    sun.target.position.set(x, 0, z);
    sun.position.set(x - 32, 46, z - 25);
    previous = game;
    seed = currentSeed;
    hero.position.set(x, 0, z);
    hero.rotation.y = -p.angle - Math.PI / 2;
    const steer = Math.sin(p.angle - prevAngle);
    prevAngle = p.angle;
    hero.rotation.z +=
      (Math.sign(steer) * p.drift * 0.075 - hero.rotation.z) * 0.24;
    hero.userData.wheels.forEach((w) => (w.rotation.y = hero.rotation.z * 3));
    hero.visible =
      reducedMotion ||
      !game?.invuln ||
      game.state === "ended" ||
      game.ticks % 12 < 9;
    actors(
      police,
      game?.police ?? [
        { x: -28, y: 112, angle: 1.45 },
        { x: 30, y: 48, angle: 1.52 },
      ],
      () => vehicle(true),
      reducedMotion ? 0 : t,
    );
    const nearest = police
      .filter((o) => o.visible)
      .sort(
        (a, b) =>
          a.position.distanceToSquared(hero.position) -
          b.position.distanceToSquared(hero.position),
      )[0];
    beacon.forEach((lamp, i) => {
      lamp.visible = !!nearest && !low;
      if (!nearest) return;
      lamp.position.copy(nearest.position);
      lamp.position.x += i ? 1 : -1;
      lamp.position.y = 3;
      lamp.intensity = reducedMotion
        ? 16
        : Math.floor(t / 260) % 2 === i
          ? 65
          : 8;
    });
    actors(
      traffic,
      game?.traffic ?? [],
      (i) =>
        vehicle(false, [0x19b8bc, 0xffe37c, 0xae86db, 0xc85976][i % 4], i % 4),
      t,
    );
    actors(
      blocks,
      game?.marks ?? [],
      () =>
        batch((b) => {
          b(0, 0.7, 0, 5, 1.4, 1.7, 0xff8872);
          for (let i = -2; i <= 2; i += 2)
            b(i, 0.75, 0.01, 0.72, 1.46, 1.73, 0xffead0);
        }),
      t,
    );
    heading +=
      Math.atan2(Math.sin(p.angle - heading), Math.cos(p.angle - heading)) *
      (1 - Math.exp(-dt * 3.6));
    if (playing) {
      const dx = Math.cos(heading),
        dz = Math.sin(heading);
      eye.set(x - dx * 39 - dz * 9, 39, z - dz * 39 + dx * 9);
      target.set(x + dx * 7, 0, z + dz * 7);
    } else {
      const a = reducedMotion ? 0 : Math.sin(t * 0.00015) * 0.6;
      if (demo) {
        eye.set(x - 3.2 + a, 4.1, z + 12.5);
        target.set(x, 2.2, z - 1);
      } else {
        const dx = Math.cos(p.angle),
          dz = Math.sin(p.angle);
        eye.set(x + dx * 12 - dz * 4, 6, z + dz * 12 + dx * 4);
        target.set(x + dx * 2, -0.25, z + dz * 2);
      }
    }
    if (snap) camera.position.copy(eye);
    else camera.position.lerp(eye, 1 - Math.exp(-dt * 8));
    if (game?.invuln > 0.83 && !reducedMotion && playing)
      camera.position.x += Math.sin(t) * 0.09;
    camera.lookAt(target);
    camera.updateMatrixWorld();
    center.set(x, 1.2, z).project(camera);
    cutout.set(
      ((center.x + 1) * w) / 2,
      ((center.y + 1) * h) / 2,
      (center.z + 1) / 2 - 0.00005,
      playing ? h * 0.055 : 0,
    );
    glow.position.set(x - 2, 3, z + 1);
    glow.color.setHex(
      !reducedMotion && Math.floor(t / 420) % 2 ? 0x3dd8e7 : 0xff5d95,
    );
    if (!reducedMotion && !low && playing && game.ticks !== lastTick) {
      if (p.drift > 0.25 || game.invuln > 0.82) {
        for (const side of [-1, 1]) {
          const spark = game.invuln > 0.82;
          ring.push({
            x: x - Math.cos(p.angle) * 2 + Math.sin(p.angle) * side,
            y: spark ? 0.95 : 0.08,
            z: z - Math.sin(p.angle) * 2 - Math.cos(p.angle) * side,
            t,
            color: spark ? 0xffe37c : 0x252036,
          });
          if (p.drift > 0.6) ring.push({ x, y: 0.8, z, t, color: 0xb49bae });
        }
      }
      lastTick = game.ticks;
    }
    while (
      ring.length > (economy ? 40 : 96) ||
      (ring.length && t - ring[0].t > 700)
    )
      ring.shift();
    trail.count = low || reducedMotion ? 0 : ring.length;
    for (let i = 0; i < trail.count; i++) {
      const e = ring[i],
        age = (t - e.t) / 700;
      dummy.position.set(e.x, e.y + (e.y > 0.2 ? age * 1.8 : 0), e.z);
      dummy.scale.set(0.34, e.y > 0.2 ? 0.35 : 0.04, 0.57);
      dummy.updateMatrix();
      trail.setMatrixAt(i, dummy.matrix);
      trail.setColorAt(i, new T.Color(e.color));
    }
    trail.instanceMatrix.needsUpdate = true;
    if (trail.instanceColor) trail.instanceColor.needsUpdate = true;
    sky.position.copy(camera.position);
    renderer.render(scene, camera);
    const arrow = document.getElementById("threat");
    arrow.hidden = true;
    if (playing)
      for (const car of police) {
        if (!car.visible || car.position.distanceTo(hero.position) > 48)
          continue;
        const v = center.copy(car.position).project(camera);
        if (Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z < 1) continue;
        const a = Math.atan2(-v.y, v.x) + (v.z > 1 ? Math.PI : 0);
        arrow.style.left = 50 + 44 * Math.cos(a) + "%";
        arrow.style.top = 50 + 32 * Math.sin(a) + "%";
        arrow.style.transform = "rotate(" + (a + Math.PI / 2) + "rad)";
        arrow.hidden = false;
        break;
      }
  };
}
