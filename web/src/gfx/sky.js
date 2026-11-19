import * as T from "../../vendor/three.js";
import { SHARED, SKY_GLSL, FOG_GLSL, VoxelBuilder, P, shade } from "./voxel.js";
import { rng } from "../simulation.js";
import { C } from "./palette.js";

const SKY_VERT = `varying vec3 vDir; void main(){ vDir=position; vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position=p.xyww; }`;
const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
${SKY_GLSL}
void main(){
  vec3 d=normalize(vDir);
  // pixel-snap the direction so clouds and the sun have crisp blocky edges
  float az=atan(d.x,-d.z), el=asin(clamp(d.y,-1.,1.));
  vec2 px=floor(vec2(az,el)*vec2(150.,150.));
  vec3 c=skyCol(d);
  // retro striped sun
  vec3 s=normalize(uSunDir);
  float saz=atan(s.x,-s.z), sel=asin(s.y);
  vec2 sp=(floor(vec2(az,el)*150.)+.5)/150.-vec2(saz,sel);
  sp.x*=cos(el);
  float r=length(sp), R=.105;
  if(r<R){
    float t=clamp((sp.y+R)/(2.*R),0.,1.);
    vec3 sc=mix(vec3(1.,.22,.32),vec3(1.,.86,.36),smoothstep(.0,.85,t))*3.2;
    float gap=0.;
    if(t<.55){float k=(.55-t)/.55;float band=fract(t*11.);gap=step(band,k*.55);}
    c=mix(sc,c,gap);
  }
  // soft halo
  c+=vec3(1.,.4,.35)*.35*exp(-r*9.)*step(R,r);
  // pixel clouds: two layers, lit pink/orange underneath
  float cl=0.;
  if(el>.03&&el<.42){
    vec2 q=px*vec2(.035,.11)+vec2(uTime*.12,0.);
    float n=vn(q)*.6+vn(q*2.03+7.)*.3+vn(q*4.1+3.)*.1;
    float band=smoothstep(.03,.1,el)*(1.-smoothstep(.25,.42,el));
    cl=step(.62,n*band+.18*band);
    float under=step(.62,vn((px+vec2(0.,-2.))*vec2(.035,.11)+vec2(uTime*.12,0.))*.6+vn(((px+vec2(0.,-2.))*vec2(.035,.11)+vec2(uTime*.12,0.))*2.03+7.)*.3+.18*band);
    vec3 top=mix(vec3(.22,.08,.32),vec3(.55,.18,.42),sunSide(d));
    vec3 lit=mix(vec3(.85,.3,.55),vec3(1.,.55,.38),sunSide(d))*1.15;
    vec3 cc=mix(lit,top,under*.75);
    c=mix(c,cc,cl*.92);
  }
  // stars
  if(el>.3){float h=h12(px);if(h>.992)c+=vec3(.9,.85,1.)*(.5+.5*sin(uTime*3.+h*90.))*smoothstep(.3,.6,el);}
  float dith=(bayer4(gl_FragCoord.xy)-.5)/90.;
  gl_FragColor=vec4(c+dith,1.);
}`;

const SEA_FRAG = /* glsl */ `
varying vec3 vW;
${SKY_GLSL}
${FOG_GLSL}
void main(){
  vec3 V=normalize(cameraPosition-vW);
  vec2 p=vW.xz;
  float row=floor(p.y*.9);
  float w=sin(p.x*.35+uTime*1.2+row*1.7)*.5+.5;
  vec3 N=normalize(vec3((w-.5)*.12,1.,sin(row*2.3+uTime)*.06));
  vec3 R=reflect(-V,N); R.y=abs(R.y);
  float fres=pow(1.-max(dot(N,V),0.),4.)*.7+.25;
  vec3 col=mix(vec3(.01,.03,.07),vec3(.02,.1,.14),w);
  col+=skyCol(normalize(R))*fres;
  // sun glitter path
  float g=max(dot(R,uSunDir),0.);
  float sparkle=step(.55,fract(p.x*.13+row*.37+uTime*.4));
  col+=uSunCol*pow(g,90.)*6.*sparkle+uSunCol*pow(g,14.)*.5;
  float f=fogAmt(vW);
  gl_FragColor=vec4(mix(col,fogCol(vW),f*.85),1.);
}`;
const SEA_VERT = `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;

export function createSky(voxelMat) {
  const group = new T.Group();
  const sky = new T.Mesh(
    new T.SphereGeometry(900, 32, 16),
    new T.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: SHARED, side: T.BackSide, depthWrite: false }),
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  group.add(sky);
  const sea = new T.Mesh(
    new T.PlaneGeometry(1800, 1800, 1, 1).rotateX(-Math.PI / 2),
    new T.ShaderMaterial({ vertexShader: SEA_VERT, fragmentShader: SEA_FRAG, uniforms: SHARED }),
  );
  sea.position.y = -0.9;
  sea.frustumCulled = false;
  sea.renderOrder = -5;
  group.add(sea);
  // Far skyline ring, kept around the camera like a backdrop.
  const far = new T.Group();
  const b = new VoxelBuilder(16384);
  const rand = rng("skyline");
  const sun = SHARED.uSunDir.value;
  const sunAz = Math.atan2(sun.x, -sun.z);
  for (let k = 0; k < 120; k++) {
    const az = sunAz + 0.5 + rand() * (Math.PI * 2 - 1.0);
    const rad = 330 + rand() * 160;
    const x = Math.sin(az) * rad, z = -Math.cos(az) * rad;
    const tall = rand();
    const h = tall < 0.15 ? 70 + rand() * 50 : 18 + rand() * 45;
    const w = 10 + rand() * 14, d = 10 + rand() * 14;
    const col = [0x3b2a63, 0x4a3172, 0x2f2a5e, 0x5a3a78, 0x6b3f7a][Math.floor(rand() * 5)];
    const pat = rand() < 0.5 ? P.CURTAIN : P.WIN;
    b.box(x, h / 2, z, w, h, d, col, { p: pat, q: Math.floor(rand() * 200), n: 0.1, ry: az });
    if (rand() < 0.4) b.box(x, h + 0.4, z, w + 0.4, 0.6, d + 0.4, [C.flamingo, C.cyan, 0xc77dff][k % 3], { p: P.NEON, e: 2.4, ry: az });
    if (tall < 0.15) {
      b.box(x, h + 6, z, 0.8, 12, 0.8, 0x8a86a0, { ry: az });
      b.box(x, h + 12.4, z, 1.6, 1.6, 1.6, 0xff2d4a, { p: P.NEON, e: 6, q: 25 });
    }
  }
  // Observation tower landmark
  const ta = sunAz - 1.0, tr = 380;
  const tx = Math.sin(ta) * tr, tz = -Math.cos(ta) * tr;
  b.box(tx, 55, tz, 5, 110, 5, 0xb9b4d0, { n: 0.1 });
  b.box(tx, 92, tz, 22, 6, 22, 0x3a2f63, { p: P.CURTAIN, q: 40 });
  b.box(tx, 95.2, tz, 22.6, 0.6, 22.6, C.cyan, { p: P.NEON, e: 4 });
  b.box(tx, 88.8, tz, 22.6, 0.6, 22.6, C.flamingo, { p: P.NEON, e: 4 });
  b.box(tx, 102, tz, 12, 6, 12, 0x3a2f63, { p: P.CURTAIN, q: 41 });
  b.box(tx, 120, tz, 1.4, 30, 1.4, 0xd6d2e6);
  b.box(tx, 136, tz, 2.4, 2.4, 2.4, 0xff2d4a, { p: P.NEON, e: 6, q: 23 });
  // Bridge across the bay in front of the sun
  const bAz0 = sunAz - 0.38, bAz1 = sunAz + 0.22, br = 300;
  const p0 = [Math.sin(bAz0) * br, -Math.cos(bAz0) * br], p1 = [Math.sin(bAz1) * (br + 60), -Math.cos(bAz1) * (br + 60)];
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), yaw = -Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
  const mx = (p0[0] + p1[0]) / 2, mz = (p0[1] + p1[1]) / 2;
  b.box(mx, 9, mz, len, 1.6, 6, 0x4b3f78, { ry: yaw });
  b.box(mx, 8.1, mz, len, 0.3, 6.2, C.cyan, { p: P.NEON, e: 2.2, ry: yaw });
  const n = 14;
  for (let k = 0; k <= n; k++) {
    const t = k / n, x = p0[0] + (p1[0] - p0[0]) * t, z = p0[1] + (p1[1] - p0[1]) * t;
    b.box(x, 4, z, 2, 9, 2, 0x3b2f63, { ry: yaw });
    b.box(x, 10.3, z, 0.6, 0.6, 0.6, 0xffd9a0, { p: P.LIGHT, e: 5 });
  }
  for (const t of [0.3, 0.7]) {
    const x = p0[0] + (p1[0] - p0[0]) * t, z = p0[1] + (p1[1] - p0[1]) * t;
    b.box(x, 22, z, 2.6, 44, 2.6, 0x4b3f78, { ry: yaw });
    b.box(x, 44.5, z, 1.2, 1.2, 1.2, 0xff2d4a, { p: P.NEON, e: 6, q: 22 });
    for (let c = 1; c <= 6; c++) {
      for (const s of [-1, 1]) {
        const cx = x + Math.cos(yaw) * s * c * 3.4, cz = z - Math.sin(yaw) * s * c * 3.4;
        b.box(cx, 44 - c * 5.5, cz, 0.4, 0.4, 0.4, 0xfff1d0, { p: P.LIGHT, e: 4 });
      }
    }
  }
  // Yachts on the bay
  for (let k = 0; k < 7; k++) {
    const az = sunAz + (rand() - 0.5) * 0.9, rad = 180 + rand() * 140;
    const x = Math.sin(az) * rad, z = -Math.cos(az) * rad;
    b.box(x, -0.2, z, 3.2, 1.6, 10, 0xf4f1ec, { ry: rand() * 3 });
    b.box(x, 1.2, z, 2.4, 1.4, 5, 0xe9e6f2, { ry: rand() * 3 });
    for (let l = -2; l <= 2; l++) b.box(x + l * 0.9, 1.0, z, 0.4, 0.3, 0.4, 0xffe0a0, { p: P.LIGHT, e: 5 });
  }
  const farMesh = new T.Mesh(b.geometry(), voxelMat);
  farMesh.frustumCulled = false;
  far.add(farMesh);
  group.add(far);
  return {
    group,
    update(camera) {
      sky.position.copy(camera.position);
      sea.position.x = camera.position.x;
      sea.position.z = camera.position.z;
      far.position.set(camera.position.x, 0, camera.position.z);
    },
  };
}
