import * as T from "../../vendor/three.js";

/* Shared materials. Everything is a patched MeshStandard/MeshPhysical material so the city gets the same
   physically based light, sky reflections, fog and shadows, with per-vertex material data:
   aMat = (roughness, metalness, emissive, kind). Night-only emissive (windows, lamps) is scaled by
   U.uNight; neon is always on. */
export const U = {
  uTime: { value: 0 }, uNight: { value: 0.3 }, uHead: { value: 1 }, uWet: { value: 0.3 },
  uField: { value: null }, uZone: { value: null }, uZone2: { value: null }, uFieldMin: { value: new T.Vector2() }, uFieldSize: { value: new T.Vector2(1, 1) },
  uSkyTop: { value: new T.Color() }, uSkyHorizon: { value: new T.Color() }, uSunDir: { value: new T.Vector3(0, 1, 0) }, uSunColor: { value: new T.Color() },
  uFogColor: { value: new T.Color() }, uFogDensity: { value: 0.0024 },
};
export const GLSL_NOISE = `
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=.5; } return s; }
// analytic AA helpers: sstep = step(e, x) softened over the pixel footprint w; fade01 = 0 while a pattern
// period is several pixels wide, 1 once it is about one pixel (time to show its average instead)
float sstep(float e, float x, float w){ w = max(w, 1e-4); return smoothstep(e - w, e + w, x); }
float fade01(float fw){ return clamp(fw * 2. - 0.5, 0., 1.); }
`;
const WORLD_VARY = `
varying vec3 vWorld;
`;
const WORLD_POS = `
  vec4 wpE = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  wpE = instanceMatrix * wpE;
  #endif
  vWorld = (modelMatrix * wpE).xyz;
`;

let patchId = 0;
function patch(mat, { vertexHead = "", vertexBody = "", fragHead = "", fragColor = "", fragRough = "", fragMetal = "", fragEmissive = "", fragLights = "", uniforms = {} }) {
  // Three.js caches programs by the onBeforeCompile source text, which is identical for every patched
  // material; give each patch its own key so the facade, ground, car and kit shaders stay distinct.
  const key = "esc60-patch-" + (patchId++) + "-" + (vertexHead + fragHead + fragColor + fragEmissive + fragLights).length;
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\n${WORLD_VARY}\n${vertexHead}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${vertexBody}`)
      .replace("#include <project_vertex>", `#include <project_vertex>\n${WORLD_POS}`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\n${WORLD_VARY}\nuniform float uTime, uNight, uHead, uWet;\n${GLSL_NOISE}\n${fragHead}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${fragColor}`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\n${fragRough}`)
      .replace("#include <metalnessmap_fragment>", `#include <metalnessmap_fragment>\n${fragMetal}`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${fragEmissive}`);
    if (fragLights) sh.fragmentShader = sh.fragmentShader.replace("#include <lights_physical_fragment>", `#include <lights_physical_fragment>\n${fragLights}`);
  };
  return mat;
}

/** Car paint / glass / lights. Physical (clear coat) for the hero, standard for everyone else. */
export function carMaterial(physical = false) {
  const uniforms = { uBrake: { value: 0.2 }, uDamage: { value: 0 }, uSiren: { value: new T.Vector2(0, 0) }, uCharred: { value: 0 } };
  const base = { vertexColors: true, roughness: 0.4, metalness: 0.2, envMapIntensity: 1.1 };
  const mat = physical ? new T.MeshPhysicalMaterial({ ...base, clearcoat: 1, clearcoatRoughness: 0.06 }) : new T.MeshStandardMaterial(base);
  patch(mat, {
    uniforms,
    vertexHead: `attribute vec4 aMat; varying vec4 vMat; varying vec3 vObj; varying float vPhase; uniform float uDamage;
      float hv(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }`,
    vertexBody: `vMat = aMat; vObj = position;
      #ifdef USE_INSTANCING
      vPhase = fract((instanceMatrix[3].x + instanceMatrix[3].z) * 0.071);
      #else
      vPhase = fract((modelMatrix[3].x + modelMatrix[3].z) * 0.071);
      #endif
      if (aMat.w < 2.5 && uDamage > 0.01) { float k = hv(floor(position * 3.1)) * 2. - 1.; transformed += normal * k * uDamage * 0.07 + vec3(0., -uDamage * 0.03 * step(position.y, 0.6), 0.); }`,
    fragHead: `varying vec4 vMat; varying vec3 vObj; varying float vPhase; uniform float uBrake, uDamage, uCharred; uniform vec2 uSiren;`,
    fragColor: `float kind = vMat.w;
      if (kind < 0.5 && uDamage > 0.02) {
        float soot = fbm(vObj.xz * 3.1 + vObj.y * 2.3);
        float scratch = step(0.86, vnoise(vec2(vObj.z * 22., vObj.y * 3.)));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05), smoothstep(0.55, 0.9, soot + uDamage * 0.5) * uDamage);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55), scratch * uDamage * 0.5);
      }
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.028, 0.026), uCharred);`,
    fragRough: `roughnessFactor = mix(vMat.x, 0.9, uCharred) + uDamage * 0.25 * step(vMat.w, 0.5);`,
    fragMetal: `metalnessFactor = vMat.y * (1. - uCharred);`,
    fragEmissive: `{
      float k = vMat.w; vec3 em = vec3(0.);
      if (k > 2.5 && k < 3.5) em = vColor * vMat.z * uHead * (1. - uCharred);
      else if (k > 3.5 && k < 4.5) em = vColor * (0.5 + uBrake * 2.4) * (1. - uCharred);
      else if (k > 5.5 && k < 6.5) em = vColor * 7. * step(0.5, fract(uTime * 2.6 + vPhase)) * uSiren.x;
      else if (k > 6.5 && k < 7.5) em = vColor * 7. * step(0.5, fract(uTime * 2.6 + vPhase + 0.5)) * uSiren.x;
      else if (k > 7.5 && k < 8.5) em = vColor * vMat.z;
      else if (k > 8.5 && k < 9.5) em = vColor * vMat.z * uHead;
      totalEmissiveRadiance += em;
    }`,
    fragLights: physical ? `material.clearcoat *= step(vMat.w, 0.5) * (1. - uDamage * 0.7) * (1. - uCharred);` : "",
  });
  mat.userData.u = uniforms;
  return mat;
}

/** Props, landmarks, markings, fences: vertex colour + aMat. kind 1 = lamp/window (night), 2 = neon (always). */
export function kitMaterial(opts = {}) {
  const { mark = false, ...rest } = opts;
  const mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, envMapIntensity: 0.8, ...(mark ? { transparent: true, depthWrite: false } : {}), ...rest });
  patch(mat, {
    // markings carry aLine = (across offset m, half width m): the edge is anti-aliased from its pixel footprint,
    // lines thinner than a pixel lose contrast instead of strobing, and paint fades toward the asphalt far away
    vertexHead: `attribute vec4 aMat; varying vec4 vMat;` + (mark ? ` attribute vec2 aLine; varying vec2 vLine;` : ""),
    vertexBody: `vMat = aMat;` + (mark ? ` vLine = aLine;` : ""),
    fragHead: `varying vec4 vMat;` + (mark ? ` varying vec2 vLine;` : ""),
    fragColor: mark ? `{
      float fw = max(fwidth(vLine.x), 1e-4);
      float cov = clamp((vLine.y - abs(vLine.x)) / fw + 0.5, 0., 1.);
      float thin = clamp(vLine.y * 2. / fw, 0., 1.);
      float far = 1. - 0.7 * smoothstep(55., 110., length(vWorld - cameraPosition));
      diffuseColor.a *= cov * thin * far;
    }` : "",
    fragRough: `roughnessFactor = vMat.x;`,
    fragMetal: `metalnessFactor = vMat.y;`,
    fragEmissive: `{ float k = vMat.w; float on = k < 0.5 ? 1. : k < 1.5 ? uNight : 1.; totalEmissiveRadiance += vColor * vMat.z * on; }`,
  });
  return mat;
}

/** Building facades: procedural windows / storefronts. aFac = (u, v metres, floor height, window width),
 *  aBld = (style, seed, lit probability, glass). style: 0 glass tower, 1 office, 2 apartment, 3 shop,
 *  4 warehouse (corrugated), 5 house, 6 deco hotel, 7 roof/plain, 8 brick (arched windows, Brick Row),
 *  9 stucco with shutters (Old Town), 10 villa (big glass), 11 neon block (Neon Mile, always glowing),
 *  12 tech ribbon windows (Tech Park). */
export function facadeMaterial() {
  const mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, envMapIntensity: 1 });
  patch(mat, {
    vertexHead: `attribute vec4 aFac; attribute vec4 aBld; varying vec4 vFac; varying vec4 vBld;`,
    vertexBody: `vFac = aFac; vBld = aBld;`,
    fragHead: `varying vec4 vFac; varying vec4 vBld; float winMask; float glassF; vec3 winEm; vec3 neonEm;
      vec3 pal(float i){ i = mod(i, 4.); return i < 1. ? vec3(1., .18, .55) : i < 2. ? vec3(.15, .9, 1.) : i < 3. ? vec3(.75, .35, 1.) : vec3(1., .78, .25); }`,
    fragColor: `{
      float style = floor(vBld.x + 0.5), seed = floor(vBld.y + 0.5); // integers: interpolation noise must not reach the hash
      vec2 cell = vec2(max(vFac.w, 0.5), max(vFac.z, 0.5));
      vec2 id = floor(vFac.xy / cell), q = fract(vFac.xy / cell);
      vec2 fq = fwidth(vFac.xy / cell); // pixel footprint in window cells
      float far = fade01(max(fq.x, fq.y)); // 1 once a window cell is ~a pixel: show the average, not the grid
      winMask = 0.; glassF = 0.; winEm = vec3(0.); neonEm = vec3(0.);
      float rnd = h21(id + seed * 13.1);
      bool wall = vFac.y > -0.5 && (style < 6.5 || style > 7.5);
      if (wall) {
        vec2 fr = style < 0.5 ? vec2(0.06, 0.08) : style < 1.5 ? vec2(0.12, 0.28) : style < 2.5 ? vec2(0.22, 0.26) : style < 3.5 ? vec2(0.16, 0.24)
          : style < 4.5 ? vec2(0.3, 0.35) : style < 5.5 ? vec2(0.3, 0.3) : style < 6.5 ? vec2(0.2, 0.22) : style < 8.5 ? vec2(0.3, 0.2)
          : style < 9.5 ? vec2(0.33, 0.22) : style < 10.5 ? vec2(0.05, 0.1) : style < 11.5 ? vec2(0.1, 0.2) : vec2(0.015, 0.3);
        winMask = sstep(fr.x, q.x, fq.x) * sstep(q.x, 1. - fr.x, fq.x) * sstep(fr.y, q.y, fq.y) * sstep(q.y, 1. - fr.y, fq.y);
        float avgWin = (1. - 2. * fr.x) * (1. - 2. * fr.y);
        if (style > 3.5 && style < 4.5) { winMask *= sstep(0.55, q.y, fq.y) * step(0.6, rnd); avgWin *= 0.18; }
        if (style > 7.5 && style < 8.5) { // arched window heads
          float a = 0.16, cy = 1. - fr.y - a; vec2 e = vec2((q.x - 0.5) / (0.5 - fr.x), max(0., q.y - cy) / a);
          float ee = dot(e, e); winMask *= 1. - sstep(1., ee, max(fwidth(ee), 1e-3)); avgWin *= 0.93;
        }
        if (style > 9.5 && style < 10.5) { winMask *= step(0.3, h21(vec2(id.x, seed + 2.))); avgWin *= 0.7; }
        if (style > 11.5) { winMask = sstep(0.3, q.y, fq.y) * sstep(q.y, 0.84, fq.y) * (1. - sstep(0.985, q.x, fq.x)); avgWin = 0.53; } // ribbon glazing
        // shop fronts on the ground floor
        bool shopFloor = vFac.y < cell.y && ((style > 2.5 && style < 3.5) || (style > 5.5 && style < 6.5) || style > 7.5);
        if (shopFloor) {
          winMask = sstep(0.05, q.x, fq.x) * sstep(q.x, 0.95, fq.x) * sstep(0.06, q.y, fq.y) * sstep(q.y, 0.85, fq.y); avgWin = 0.71;
          if (style > 8.5 && style < 9.5) { vec2 e = vec2((q.x - 0.5) / 0.4, max(0., q.y - 0.55) / 0.3); float ee = dot(e, e); winMask = sstep(0.1, q.x, fq.x) * sstep(q.x, 0.9, fq.x) * (1. - sstep(1., ee, max(fwidth(ee), 1e-3))) * sstep(0.02, q.y, fq.y); avgWin = 0.62; }
        }
        winMask = mix(winMask, avgWin, far);
        // per-cell randomness converges to its mean far away, so distant towers glow evenly instead of crawling
        float lit = mix(step(1. - vBld.z, rnd), vBld.z, far);
        vec3 warm = mix(mix(vec3(1., .72, .42), vec3(.65, .82, 1.), step(0.7, h21(id * 1.7 + seed))), vec3(.9, .75, .6), far);
        winEm = winMask * warm * lit * (0.5 + 0.6 * mix(h21(id + 3.1), 0.5, far));
        if (shopFloor) winEm = winMask * mix(vec3(1.,.62,.38), vec3(.5,.85,1.), mix(h21(id+seed), 0.5, far)) * 0.55;
        glassF = winMask * (style < 0.5 || style > 11.5 ? 1. : vBld.w);
        vec3 glassCol = style < 0.5 ? mix(vec3(0.05, 0.12, 0.18), vec3(0.1, 0.2, 0.26), rnd) : style > 11.5 ? vec3(0.08, 0.16, 0.2) : vec3(0.05, 0.06, 0.08);
        vec2 fw2 = fwidth(vFac.xy * 0.5);
        vec3 wallCol = diffuseColor.rgb * (0.92 + 0.12 * mix(h21(floor(vFac.xy * 0.5) + seed), 0.5, fade01(max(fw2.x, fw2.y))));
        if (style > 7.5 && style < 8.5) { // brick bond, fading out where it would shimmer
          vec2 bp = vFac.xy / vec2(0.62, 0.27); bp.x += 0.5 * mod(floor(bp.y), 2.);
          vec2 bf = fract(bp), fb = fwidth(vFac.xy / vec2(0.62, 0.27)); float aa = clamp(1. - max(fb.x, fb.y) * 2.5, 0., 1.);
          float mortar = max(1. - smoothstep(0., 0.09 + fb.y, bf.y), 1. - smoothstep(0., 0.05 + fb.x, bf.x)) * aa;
          wallCol = diffuseColor.rgb * (0.84 + 0.3 * mix(0.5, h21(floor(bp) + seed), aa));
          wallCol = mix(wallCol, vec3(0.72, 0.68, 0.62), mortar * 0.55);
          wallCol *= 1. - 0.18 * step(mod(id.y, 4.), 0.) * mix(sstep(0.9, q.y, fq.y), 0.1, far); // string course
        }
        if (style > 8.5 && style < 9.5) { // stucco + louvred shutters beside each window
          wallCol = diffuseColor.rgb * (0.93 + 0.1 * vnoise(vFac.xy * 0.9 + seed));
          float sh = (sstep(0.12, q.x, fq.x) * sstep(q.x, 0.31, fq.x) + sstep(0.69, q.x, fq.x) * sstep(q.x, 0.88, fq.x)) * sstep(fr.y, q.y, fq.y) * sstep(q.y, 1. - fr.y, fq.y) * step(cell.y, vFac.y);
          sh = mix(sh, 0.38 * (1. - 2. * fr.y) * step(cell.y, vFac.y), far);
          vec3 shc = h21(vec2(seed, 7.)) < 0.33 ? vec3(0.16, 0.4, 0.3) : h21(vec2(seed, 7.)) < 0.66 ? vec3(0.18, 0.32, 0.55) : vec3(0.5, 0.26, 0.16);
          float lv = q.y * cell.y * 4.;
          shc *= 0.85 + 0.25 * mix(step(0.5, fract(lv)), 0.5, fade01(fq.y * cell.y * 4.));
          wallCol = mix(wallCol, shc, sh);
        }
        if (style > 3.5 && style < 4.5) { // corrugated metal
          float fc = fwidth(vFac.x * 2.6), aa = clamp(1. - fc * 1.2, 0., 1.);
          wallCol *= 1. - 0.12 * mix(0.5, sstep(0.5, fract(vFac.x * 2.6), fc), aa);
        }
        if (style > 10.5 && style < 11.5) { // neon block: dark skin, coloured light, LED slab lines
          float ci = floor(h21(vec2(seed, 3.)) * 4.);
          vec3 nc = pal(ci + step(0.75, rnd)), nc2 = pal(ci + 1.);
          winEm = winMask * mix(nc, vec3(1., .8, .9), 0.35) * step(0.35, rnd) * (0.35 + 0.5 * h21(id + 5.));
          float slab = mix(1. - smoothstep(0.0, 0.07 + fq.y, q.y), 0.035, far) * step(cell.y, vFac.y);
          float ff = fwidth(vFac.x / 6.);
          float fin = mix(sstep(0.97, fract(vFac.x / 6.), ff), 0.03, fade01(ff)) * step(cell.y, vFac.y);
          neonEm = max(slab, fin) * nc2 * 1.6;
          wallCol = mix(wallCol, vec3(0.02), max(slab, fin) * 0.8);
          if (shopFloor) { neonEm += winMask * nc * 0.9; }
        }
        if (style > 11.5) wallCol = mix(wallCol, wallCol * 1.08, mix(sstep(0.84, q.y, fq.y), 0.16, far));
        if (style > 5.5 && style < 6.5) wallCol *= 1. + 0.12 * mix(sstep(0.9, q.y, fq.y), 0.1, far) * step(cell.y, vFac.y); // deco eyebrow bands
        glassCol = mix(glassCol, vec3(0.07, 0.1, 0.13), far * step(style, 0.5));
        diffuseColor.rgb = mix(wallCol, glassCol, winMask);
        // floor slab lines
        if (style < 0.5) diffuseColor.rgb *= 1. - 0.25 * mix(1. - sstep(0.06, q.y, fq.y), 0.06, far);
      }
      // grime toward the ground, light at the top
      diffuseColor.rgb *= 0.82 + 0.18 * smoothstep(0., 6., vFac.y);
    }`,
    fragRough: `roughnessFactor = mix(roughnessFactor, 0.08, glassF);`,
    fragMetal: `metalnessFactor = mix(0., 0.75, glassF * (step(vBld.x, 0.5) + step(11.5, vBld.x))) + glassF * 0.2;`,
    fragEmissive: `totalEmissiveRadiance += winEm * pow(uNight, 1.7) * 1.6 + neonEm * (0.55 + 0.9 * uNight);`,
  });
  return mat;
}

/** Ground: asphalt, curbs, sidewalks, shoulders, lots, grass, sand and rock from the road field. */
export function groundMaterial() {
  const mat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, envMapIntensity: 0.32 });
  patch(mat, {
    fragHead: `uniform sampler2D uField, uZone, uZone2; uniform vec2 uFieldMin, uFieldSize; float gRough; float gWet;
      // grout lines of a tile grid g with width w; fg = fwidth(g) measured outside (derivatives in uniform flow).
      // Edges soften over the footprint and the lines fade to their average once a tile nears one pixel.
      float grout(vec2 g, float w, vec2 fg){ vec2 b = abs(fract(g) - 0.5); float f = max(fg.x, fg.y);
        float l = max(smoothstep(0.5 - w - fg.x, 0.5, b.x), smoothstep(0.5 - w - fg.y, 0.5, b.y));
        return mix(l, 2. * w, fade01(f * 1.5)); }
      float hcell(vec2 c, vec2 fg){ return mix(h21(c), 0.5, fade01(max(fg.x, fg.y) * 1.5)); }`,
    fragColor: `{
      vec2 fuv = (vWorld.xz - uFieldMin) / uFieldSize;
      vec4 F = texture2D(uField, fuv);
      vec4 Z = texture2D(uZone, fuv);
      vec4 D = texture2D(uZone2, fuv); // district paving: r Old Town / Brick Row, g Neon Mile, b docks, a Ocean Drive
      float f = F.r, g = F.g, town = F.b, wat = F.a;
      vec2 p = vWorld.xz;
      vec2 fp = fwidth(p); float fpm = max(fp.x, fp.y); // metres per pixel, both directions (depth shrinks fastest)
      float aa = max(fwidth(f), 0.02);
      if (wat > 0.5 && f > 1.6) discard;
      float n1 = vnoise(p * 0.21), n2 = mix(vnoise(p * 1.7), 0.5, fade01(fpm * 1.7)), n3 = fbm(p * 0.035);
      // terrain
      vec3 lot = mix(vec3(0.40, 0.39, 0.37), vec3(0.47, 0.45, 0.42), n1);
      vec3 grass = mix(vec3(0.19, 0.30, 0.11), vec3(0.33, 0.40, 0.15), n3) * (0.85 + 0.25 * n2);
      vec3 sand = mix(vec3(0.84, 0.72, 0.53), vec3(0.93, 0.83, 0.64), n1 * 0.6 + n2 * 0.4);
      vec3 rock = mix(vec3(0.45, 0.35, 0.28), vec3(0.62, 0.50, 0.38), n3) * (0.85 + 0.2 * n2);
      vec3 paving = mix(vec3(0.58, 0.55, 0.52), vec3(0.66, 0.6, 0.55), hcell(floor(p / 1.2), fp / 1.2)) * (1. - 0.25 * grout(p / 1.2, 0.04, fp / 1.2));
      vec3 base = lot;
      base = mix(base, grass, Z.r);
      base = mix(base, rock, Z.b);
      base = mix(base, sand, Z.g);
      base = mix(base, paving, Z.a);
      base = mix(base, base * vec3(0.62, 0.6, 0.58), smoothstep(-8., 0., wat) * Z.g);
      gRough = mix(0.95, 0.75, Z.a);
      // sidewalks + curbs in town, gravel shoulders outside
      vec3 walk = mix(vec3(0.62, 0.6, 0.57), vec3(0.7, 0.68, 0.64), hcell(floor(p / 1.5), fp / 1.5)) * (1. - 0.18 * grout(p / 1.5, 0.06, fp / 1.5));
      { // each district paves its sidewalks differently
        vec2 bt = p / vec2(0.6, 0.3); bt.x += 0.5 * mod(floor(bt.y), 2.);
        vec2 fbt = fp / vec2(0.6, 0.3);
        vec3 warmW = mix(vec3(0.6, 0.34, 0.26), vec3(0.72, 0.47, 0.35), hcell(floor(bt), fbt)) * (1. - 0.28 * grout(bt, 0.07, fbt));
        vec3 neonW = mix(vec3(0.15, 0.13, 0.19), vec3(0.23, 0.2, 0.28), hcell(floor(p / 0.9), fp / 0.9)) * (1. - 0.35 * grout(p / 0.9, 0.05, fp / 0.9));
        vec3 portW = mix(vec3(0.5, 0.5, 0.47), vec3(0.6, 0.59, 0.55), n1) * (1. - 0.22 * grout(p / 3., 0.02, fp / 3.));
        vec3 beachW = mix(vec3(0.9, 0.72, 0.68), vec3(0.95, 0.84, 0.74), hcell(floor(p / 0.8), fp / 0.8)) * (1. - 0.16 * grout(p / 0.8, 0.05, fp / 0.8));
        walk = mix(walk, warmW, D.r); walk = mix(walk, neonW, D.g); walk = mix(walk, portW, D.b); walk = mix(walk, beachW, D.a);
      }
      float sideM = town * (1. - smoothstep(0.7, 1.3, g)) * smoothstep(-aa, aa, f);
      base = mix(base, walk, sideM);
      float curbTop = town * smoothstep(-aa, aa, f) * (1. - smoothstep(0.32 - aa, 0.32 + aa, f));
      base = mix(base, vec3(0.78, 0.77, 0.74), curbTop);
      base *= 1. - town * 0.45 * (smoothstep(-aa, aa, f) - smoothstep(0.05, 0.1, f)); // curb face
      float shoulder = (1. - town) * smoothstep(-aa, aa, f) * (1. - smoothstep(0.9, 1.6, g));
      base = mix(base, mix(vec3(0.36, 0.35, 0.34), vec3(0.45, 0.43, 0.4), n2), shoulder * 0.85);
      // contact darkening at the foot of walls and buildings
      base *= 1. - 0.28 * smoothstep(0.2, 1., g) * (1. - smoothstep(1., 2.6, g));
      // asphalt
      float asph = 1. - smoothstep(-aa, aa, f);
      float patchy = smoothstep(0.55, 0.75, n3) * 0.5;
      vec3 asphalt = mix(vec3(0.105, 0.105, 0.115), vec3(0.15, 0.148, 0.155), n2 * 0.7 + n1 * 0.3);
      asphalt = mix(asphalt, asphalt * 1.35, patchy);
      asphalt *= 0.92 + 0.16 * mix(vnoise(p * 9.), 0.5, clamp(fpm * 9. - 0.5, 0., 1.)); // grain -> its mean when sub-pixel
      float nightWet = clamp((uWet - 0.45) * 2.2, 0., 1.);
      float puddle = smoothstep(0.66, 0.8, fbm(p * 0.07 + 3.)) * nightWet;
      gWet = asph * (0.3 * nightWet + 0.5 * puddle);
      asphalt = mix(asphalt, asphalt * 0.7, puddle);
      { // Old Town streets are cobbled; the Neon Mile is dark and glossy; the docks are worn concrete
        float cob = smoothstep(0.72, 0.95, D.r);
        if (cob > 0.01) {
          vec2 cp = p / 0.42; cp.x += 0.5 * mod(floor(cp.y), 2.);
          vec2 cf = fract(cp) - 0.5; float stone = 1. - smoothstep(0.28, 0.5, length(cf * vec2(1., 1.2)));
          float caa = clamp(1. - fpm / 0.42 * 1.8, 0., 1.);
          vec3 cc = mix(vec3(0.3, 0.27, 0.26), vec3(0.46, 0.4, 0.35), mix(0.5, h21(floor(cp)), caa));
          asphalt = mix(asphalt, mix(cc * 0.5, cc, mix(0.72, stone, caa)), cob);
        }
        asphalt = mix(asphalt, asphalt * 0.72, D.g);
        gWet = max(gWet, asph * D.g * 0.45);
        asphalt = mix(asphalt, asphalt * 1.45 + vec3(0.03), D.b * 0.55);
      }
      gRough = mix(gRough, 0.42, sideM * D.g);
      diffuseColor.rgb = mix(base, asphalt, asph);
      gRough = mix(gRough, mix(0.86, 0.38, gWet), asph);
    }`,
    fragRough: `roughnessFactor = gRough;`,
    fragMetal: `metalnessFactor = 0.;`,
  });
  return mat;
}

/** Sea and lake: sky-gradient reflection, sun glitter, swell and shore foam (unlit). */
export function waterMaterial() {
  return new T.ShaderMaterial({
    uniforms: U,
    fog: false,
    vertexShader: `varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `varying vec3 vWorld; uniform float uTime, uNight; uniform sampler2D uField; uniform vec2 uFieldMin, uFieldSize;
      uniform vec3 uSkyTop, uSkyHorizon, uSunDir, uSunColor, uFogColor; uniform float uFogDensity;
      ${GLSL_NOISE}
      void main(){
        vec2 p = vWorld.xz;
        float t = uTime;
        vec2 w1 = vec2(vnoise(p * 0.08 + t * 0.12), vnoise(p * 0.08 - t * 0.1 + 7.));
        vec2 w2 = vec2(vnoise(p * 0.5 + t * 0.6), vnoise(p * 0.5 - t * 0.5 + 3.));
        vec3 n = normalize(vec3((w1.x - .5) * 0.5 + (w2.x - .5) * 0.22, 1., (w1.y - .5) * 0.5 + (w2.y - .5) * 0.22));
        vec3 v = normalize(cameraPosition - vWorld);
        vec3 r = reflect(-v, n);
        float fres = 0.04 + 0.96 * pow(1. - max(dot(n, v), 0.), 5.);
        vec3 sky = mix(uSkyHorizon, uSkyTop, pow(max(r.y, 0.), 0.55));
        vec3 deep = mix(vec3(0.02, 0.12, 0.17), vec3(0.01, 0.03, 0.06), uNight);
        vec3 c = mix(deep, sky, fres);
        float sp = pow(max(dot(r, uSunDir), 0.), 220.) * 6. + pow(max(dot(r, uSunDir), 0.), 18.) * 0.25;
        c += uSunColor * sp * (1. - uNight * 0.7);
        vec4 F = texture2D(uField, (p - uFieldMin) / uFieldSize);
        float shore = 1. - smoothstep(0., 7., F.a);
        float foam = shore * smoothstep(0.45, 0.75, vnoise(p * 0.7 + vec2(t * 0.4, 0.)) * (0.6 + 0.4 * sin(F.a * 2.2 - t * 2.)));
        c = mix(c, vec3(0.9, 0.92, 0.95) * (1. - uNight * 0.6), foam * 0.8);
        float d = length(cameraPosition - vWorld);
        c = mix(c, uFogColor, 1. - exp(-d * d * uFogDensity * uFogDensity)); // same FogExp2 as the scene
        gl_FragColor = vec4(c, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/** Additive camera-facing or ground glow sprites (light pools, flares, halos) drawn as instanced quads. */
export function glowMaterial() {
  return new T.ShaderMaterial({
    uniforms: { uTex: { value: glowTexture() } },
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    vertexShader: `attribute vec4 aCol; varying vec4 vCol; varying vec2 vUv; void main(){ vCol = aCol; vUv = uv; gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform sampler2D uTex; varying vec4 vCol; varying vec2 vUv; void main(){ float a = texture2D(uTex, vUv).a; gl_FragColor = vec4(vCol.rgb * a * vCol.a, 1.); }`,
  });
}
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "#fff"); g.addColorStop(0.25, "rgba(255,255,255,0.55)"); g.addColorStop(0.6, "rgba(255,255,255,0.12)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  glowTex = new T.CanvasTexture(c);
  return glowTex;
}
