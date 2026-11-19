import * as T from "../../vendor/three.js";
import { SUN_DIR } from "./palette.js";

// Pattern ids interpreted by the voxel shader (see PATTERN_GLSL).
export const P = {
  PLAIN: 0, WIN: 1, CURTAIN: 2, SHOP: 3, SIGN: 4, NEON: 5, GLASS: 6, PAINT: 7,
  STRIPE: 9, ROAD: 10, JUNCTION: 11, TILE: 12, WATER: 13, SAND: 14, GRASS: 15,
  WOOD: 16, ROOF: 17, LEAF: 18, BRICK: 19, CHROME: 20, TIRE: 21, LIGHT: 22,
};

const sunVec = new T.Vector3(...SUN_DIR).normalize();
const lin = (hex) => new T.Color(hex);

// Uniforms shared by every material so one update recolours the whole world.
export const SHARED = {
  uTime: { value: 0 },
  uSunDir: { value: sunVec },
  uZenith: { value: lin(0x0f0a30) },
  uUpper: { value: lin(0x2e1660) },
  uMidA: { value: lin(0x9a3a86) },
  uMidB: { value: lin(0xff5d7a) },
  uHorA: { value: lin(0xd45a92) },
  uHorB: { value: lin(0xffa25e) },
  uSunCol: { value: lin(0xffc27a) },
  uFogDensity: { value: 0.0078 },
  uFogStart: { value: 40 },
  uAtlas: { value: null },
  uCut: { value: new T.Vector4(0, 0, 0, 0) },
  uWet: { value: 1 },
};

export const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir, uZenith, uUpper, uMidA, uMidB, uHorA, uHorB, uSunCol;
uniform float uTime;
float sunSide(vec3 d){
  vec2 a=normalize(d.xz+1e-5), b=normalize(uSunDir.xz);
  return pow(max(dot(a,b)*.5+.5,0.),4.);
}
vec3 skyCol(vec3 d){
  float s=sunSide(d), y=d.y;
  vec3 hor=mix(uHorA,uHorB,s), mid=mix(uMidA,uMidB,s*.8);
  vec3 c=mix(hor,mid,smoothstep(.0,.13,y));
  c=mix(c,uUpper,smoothstep(.1,.36,y));
  c=mix(c,uZenith,smoothstep(.3,.85,y));
  c=mix(c,hor*.55,smoothstep(0.,-.25,y));
  float g=max(dot(d,uSunDir),0.);
  c+=uSunCol*(pow(g,24.)*.9+pow(g,5.)*.18)*(1.-smoothstep(.25,.6,y));
  return c;
}
float h12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h12(i),h12(i+vec2(1,0)),f.x),mix(h12(i+vec2(0,1)),h12(i+vec2(1,1)),f.x),f.y);}
float bayer4(vec2 p){ivec2 q=ivec2(mod(p,4.));int i=q.x+q.y*4;
  float m[16]=float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);return (m[i]+.5)/16.;}
`;

export const FOG_GLSL = /* glsl */ `
uniform float uFogDensity, uFogStart;
float fogAmt(vec3 wp){
  float d=length(wp-cameraPosition);
  float f=1.-exp(-max(d-uFogStart,0.)*uFogDensity);
  f*=mix(1.,.38,smoothstep(2.,70.,wp.y));
  return clamp(f,0.,1.);
}
vec3 fogCol(vec3 wp){vec3 d=normalize(wp-cameraPosition);float s=sunSide(d);
  vec3 h=mix(mix(uHorA,uUpper,.35),mix(uMidB,uHorB,.3),s);
  return h*mix(.55,.7,s)*mix(1.,.8,smoothstep(.0,.3,d.y));}
`;

/* Fragment pattern library. Inputs: base albedo (linear), uv in world units, fw face width,
   q param byte, nrm world normal, V view dir (surface->eye), wp world position. */
const PATTERN_GLSL = /* glsl */ `
uniform sampler2D uAtlas; uniform float uWet;
vec3 lit3(vec3 c){return c;}
void pattern(int pid, inout vec3 base, inout vec3 emit, inout float refl, inout float spec,
  vec2 uv, float fw, float q, vec3 nrm, vec3 V, vec3 wp, float grain){
  if(pid==${P.WIN}){
    float style=mod(q,4.), seed=floor(q/4.);
    float cw=style<1.?1.6:style<2.?2.2:style<3.?1.25:1.9, ch=style==3.?3.:2.5;
    float margin=mod(fw,cw)*.5; vec2 g=vec2(uv.x-margin,uv.y-.35);
    vec2 cell=floor(g/vec2(cw,ch)), f=fract(g/vec2(cw,ch));
    vec2 lo=style<1.?vec2(.2,.28):style<2.?vec2(.12,.3):style<3.?vec2(.26,.22):vec2(.16,.2);
    vec2 hi=style<1.?vec2(.8,.84):style<2.?vec2(.88,.8):style<3.?vec2(.74,.86):vec2(.84,.86);
    bool inside=g.x>=0.&&g.x<fw-2.*margin&&g.y>=0.;
    vec2 cf=(f-vec2(.5,.56))*vec2(cw,ch);
    bool port=style==3.;
    bool shape=port?length(cf)<.52:(f.x>lo.x&&f.x<hi.x&&f.y>lo.y&&f.y<hi.y);
    if(port&&inside&&!shape&&length(cf)<.68){base*=1.4;}
    else if(inside&&shape){
      float r=h12(cell+seed*7.13+floor(wp.xz*.031)*3.1);
      float r2=h12(cell.yx*1.7+seed);
      if(r<.47){
        vec3 col=r2<.72?vec3(1.,.52,.2):r2<.86?vec3(1.,.22,.52):vec3(.25,.75,1.);
        float blind=f.y>mix(lo.y,hi.y,.62)?.55:1.;
        float flick=r2>.97?step(.3,h12(vec2(floor(uTime*3.),r))):1.;
        emit+=col*(1.1+r2*1.4)*blind*flick; base=col*.15;
      }else{base=vec3(.03,.03,.07);refl=.55;spec=.6;}
    }else if(inside&&f.x>lo.x-.04&&f.x<hi.x+.04&&f.y>lo.y-.07&&f.y<=lo.y){base*=1.35;}
    else if(inside&&(f.x<=lo.x||f.x>=hi.x)&&f.y>lo.y&&f.y<hi.y){base*=.82;}
  }else if(pid==${P.CURTAIN}){
    float ch=2.5; vec2 g=vec2(uv.x,uv.y); float fy=fract(g.y/ch);
    float mull=step(fract(g.x/1.05),.07);
    if(fy<.2){base*=.9;}
    else if(mull>.5){base*=.55;}
    else{
      vec2 cell=vec2(floor(g.x/2.1),floor(g.y/ch));
      float r=h12(cell+q*3.7+floor(wp.xz*.05));
      float stripe=step(.82,h12(vec2(cell.y,q)));
      if(r<.22||stripe>.5&&r<.7){emit+=(r<.12?vec3(1.,.6,.3):vec3(.55,.75,1.))*(1.2+r*2.);base=vec3(.05);}
      else{base=mix(vec3(.02,.04,.09),base*.25,.4);refl=.75;spec=.8;}
    }
  }else if(pid==${P.SHOP}){
    float mod2=mod(uv.x,2.2);
    vec3 tint=q<1.?vec3(1.,.62,.3):q<2.?vec3(1.,.35,.62):q<3.?vec3(.4,.9,1.):vec3(1.,.9,.7);
    if(mod2<.12||uv.y<.18){base=vec3(.05,.04,.07);}
    else{
      float shelf=step(.82,fract(uv.y*1.6))*step(uv.y,1.9);
      float glow=1.4+.9*smoothstep(0.,2.4,uv.y);
      float people=step(.62,h12(floor(vec2(uv.x*2.5,0.)+q)))*step(uv.y,1.5)*step(.25,fract(uv.x*2.5));
      emit+=tint*glow*(1.-shelf*.5)*(1.-people*.75);base=tint*.1;refl=.25;
    }
  }else if(pid==${P.SIGN}){
    vec4 t=texture2D(uAtlas,uv);
    float flick=q>0.?(.65+.35*step(.08,h12(vec2(floor(uTime*9.),q)))):1.;
    vec3 c=pow(t.rgb,vec3(2.2));
    base=c*.25; emit+=c*grain*flick;
  }else if(pid==${P.NEON}){
    float on=1.;
    if(q>0.&&q<20.)on=.4+.6*step(.5,fract(uv.x*.9-uTime*q*.25));
    if(q>=20.)on=.75+.25*step(.12,h12(vec2(floor(uTime*7.),q)));
    emit+=base*grain*on; base*=.35;
  }else if(pid==${P.GLASS}){
    float hl=step(fract((uv.x*.8+uv.y*1.1)+q*.13),.09);
    base=vec3(.012,.015,.035); refl=.85; spec=1.; emit+=vec3(.5,.45,.7)*hl*.35;
  }else if(pid==${P.PAINT}){
    refl=.32; spec=.9;
  }else if(pid==${P.CHROME}){
    refl=.9; spec=1.2; base*=.6;
  }else if(pid==${P.TIRE}){
    base*=.8+.2*step(.5,fract(uv.y*6.));
  }else if(pid==${P.LIGHT}){
    emit+=base*grain; base*=.4;
  }else if(pid==${P.STRIPE}){
    float w=q>0.?q*.05:.5; float s=step(.5,fract(uv.x/(2.*w)));
    base=mix(base,vec3(.95,.88,.8),s);
    if(uv.y<.18&&fract(uv.x/(w))<.5)base*=.75;
  }else if(pid==${P.ROAD}||pid==${P.JUNCTION}){
    vec2 pix=floor(wp.xz*5.);
    base*=.86+.28*h12(pix)+.08*vn(wp.xz*.7);
    float pud=smoothstep(.62,.66,vn(floor(wp.xz*3.)/3.*.32+vec2(3.7,1.3)))*smoothstep(.35,.6,vn(wp.xz*.05+9.1));
    float wet=uWet*(.26+.64*pud);
    if(pid==${P.ROAD}){
      float u=uv.x, v=uv.y, len=fw;
      float au=abs(u); vec3 paint=vec3(.86,.8,.74);
      bool mark=false;
      if(v>.4&&v<3.2&&au<8.3&&fract(u/1.25)<.55)mark=true;
      if(v>len-3.2&&v<len-.4&&au<8.3&&fract(u/1.25)<.55)mark=true;
      if(v>3.8&&v<len-3.8){
        if(au<.13&&fract((v-3.8)/5.)<.5)mark=true;
        if(au>8.35&&au<8.62)mark=true;
      }
      float lu=u>0.?u-4.3:-u-4.3, lv=u>0.?v:len-v;
      if(abs(lu)<.17&&lv>5.7&&lv<7.9)mark=true;
      if(lv>4.3&&lv<5.7&&abs(lu)<(lv-4.3)*.6)mark=true;
      if(v>3.4&&v<3.75&&u>0.&&u<8.3){mark=true;}
      if(v>len-3.75&&v<len-3.4&&u<0.&&u>-8.3){mark=true;}
      if(mark){base=paint*(.85+.15*h12(pix));emit+=paint*.05;wet*=.5;}
      float crack=step(.985,h12(floor(wp.xz*3.)))*step(au,7.);
      base*=1.-crack*.35;
    }
    base*=1.-wet*.55; refl=wet*.72; spec=wet*1.3;
  }else if(pid==${P.TILE}){
    float s=q<1.?1.:q<2.?.8:.6;
    vec2 g=uv/s; vec2 f=fract(g);
    float grout=step(f.x,.07)+step(f.y,.07);
    base*=(.9+.2*h12(floor(g)+q))*(1.-min(grout,1.)*.28);
    if(q>=2.&&mod(floor(g.x)+floor(g.y),2.)<1.)base*=.86;
    refl=uWet*.18; spec=.35;
  }else if(pid==${P.WATER}){
    vec2 p=wp.xz;
    float w=sin(p.x*.9+uTime*1.4+sin(p.y*.5+uTime*.7)*1.6)+sin(p.y*1.3-uTime*1.1);
    float band=step(.75,fract(floor(p.y*3.)*.37+w*.18+uTime*.05));
    base=mix(base,base*1.6,band*.6);
    refl=1.9+band*.5; spec=2.6;
    emit+=mix(vec3(.02,.12,.16),vec3(.25,.08,.2),.5+.5*sin(p.x*.05+p.y*.03))*.35;
    float sp=step(.985,h12(floor(p*3.)+floor(uTime*4.)));
    emit+=vec3(1.,.8,.6)*sp*.6;
  }else if(pid==${P.SAND}){
    base*=.85+.3*h12(floor(wp.xz*6.));
  }else if(pid==${P.GRASS}){
    base*=.7+.5*h12(floor(wp.xz*7.)+floor(wp.y*7.));
  }else if(pid==${P.WOOD}){
    float pl=floor(uv.y*2.); base*=.8+.25*h12(vec2(pl,floor(uv.x*.5+pl*.37)));
    if(fract(uv.y*2.)<.1)base*=.6;
  }else if(pid==${P.ROOF}){
    base*=.88+.18*h12(floor(wp.xz*4.));
    if(fract(uv.x*.5)<.04||fract(uv.y*.5)<.04)base*=.8;
  }else if(pid==${P.LEAF}){
    base*=.68+.55*h12(floor(uv*5.)+q);
  }else if(pid==${P.BRICK}){
    vec2 g=vec2(uv.x*2.,uv.y*4.); g.x+=mod(floor(g.y),2.)*.5; vec2 f=fract(g);
    base*=(.85+.25*h12(floor(g)))*(f.y<.12||f.x<.06?.62:1.);
  }
}
`;

/** Lambert material extended with procedural voxel patterns, fake wet reflections, custom
 * sunset fog and an optional hero cut-out so buildings never hide the player. */
export function voxelMaterial({ cutout = false, fogScale = 1, extra = {} } = {}) {
  const m = new T.MeshLambertMaterial({ color: 0xffffff });
  const own = { uFogScale: { value: fogScale } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SHARED, own, extra);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute vec4 aCol; attribute vec4 aMat; attribute vec2 aUv;
varying vec4 vCol; varying vec4 vMat; varying vec2 vUv2; varying vec3 vWPos; varying vec3 vWNrm;`,
      )
      .replace(
        "#include <fog_vertex>",
        `#include <fog_vertex>
vCol=aCol; vMat=aMat; vUv2=aUv;
vec4 wp4=modelMatrix*vec4(transformed,1.); vWPos=wp4.xyz;
vWNrm=normalize(mat3(modelMatrix)*objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec4 vCol; varying vec4 vMat; varying vec2 vUv2; varying vec3 vWPos; varying vec3 vWNrm;
uniform vec4 uCut; uniform float uFogScale;
${SKY_GLSL}
${FOG_GLSL}
${PATTERN_GLSL}`,
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
${
  cutout
    ? `{
  float th=bayer4(gl_FragCoord.xy);
  if(uCut.w>0.&&gl_FragCoord.z<uCut.z){
    float r=distance(gl_FragCoord.xy,uCut.xy)/uCut.w;
    if(r<.72+.28*th)discard;
  }
  if(distance(vWPos,cameraPosition)<3.2+th*2.6)discard;
}`
    : ""
}`,
      )
      .replace(
        "#include <color_fragment>",
        `vec3 xEmit=vec3(0.); float xRefl=0., xSpec=0.;
vec3 xV=normalize(cameraPosition-vWPos); vec3 xN=normalize(vWNrm);
{
  vec3 base=pow(vCol.rgb,vec3(2.2));
  float packed=vCol.a*255.; float ao=packed>=128.?1.:0.; float grainAmt=mod(packed,128.)/127.;
  int pid=int(vMat.y*255.+.5); float q=floor(vMat.z*255.+.5); float fw=vMat.w*255.*.25;
  float em=vMat.x*255./32.;
  if(grainAmt>0.){
    vec3 cell=floor(vWPos*4.+xN*.5);
    if(pid==${P.PAINT}||pid==${P.LEAF}||pid==${P.CHROME})cell=vec3(floor(vUv2*4.),q);
    base*=1.+(h12(cell.xz+cell.y*17.31)-.5)*grainAmt*.5;
  }
  pattern(pid,base,xEmit,xRefl,xSpec,vUv2,fw,q,xN,xV,vWPos,em>0.?em:1.);
  if(em>0.&&pid!=${P.SIGN}&&pid!=${P.NEON}&&pid!=${P.LIGHT})xEmit+=base*em;
  if(ao>.5){
    float h=vWPos.y;
    base*=mix(.5,1.,smoothstep(0.,1.8,h))*(xN.y>.5?1.:mix(.9,1.06,smoothstep(2.,30.,h)));
  }
  diffuseColor.rgb=base;
}`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
{
  float fres=pow(1.-max(dot(xN,xV),0.),3.)*.82+.18;
  vec3 R=reflect(-xV,xN);
  if(xRefl>0.){
    vec3 rd=R; rd.y=abs(rd.y);
    totalEmissiveRadiance+=skyCol(normalize(rd))*xRefl*fres*.5;
  }
  if(xSpec>0.){
    float s=pow(max(dot(R,uSunDir),0.),60.);
    totalEmissiveRadiance+=uSunCol*s*xSpec*1.6;
  }
  totalEmissiveRadiance+=xEmit;
}`,
      )
      .replace(
        "#include <fog_fragment>",
        `{
  float f=fogAmt(vWPos)*uFogScale;
  vec3 lit=gl_FragColor.rgb-xEmit;
  gl_FragColor.rgb=mix(lit,fogCol(vWPos),f)+xEmit*(1.-f*.75);
}`,
      );
  };
  m.customProgramCacheKey = () => "voxel" + (cutout ? "-cut" : "");
  m.userData.own = own;
  return m;
}

/* ---------------- Geometry builder ---------------- */
// Corner index bits: 1=x+, 2=y+, 4=z+. Faces listed BL,BR,TR,TL as seen from outside.
const FACES = [
  { n: [1, 0, 0], c: [5, 1, 3, 7], bit: 1 },
  { n: [-1, 0, 0], c: [0, 4, 6, 2], bit: 2 },
  { n: [0, 1, 0], c: [6, 7, 3, 2], bit: 4 },
  { n: [0, -1, 0], c: [0, 1, 5, 4], bit: 8 },
  { n: [0, 0, 1], c: [4, 5, 7, 6], bit: 16 },
  { n: [0, 0, -1], c: [1, 0, 2, 3], bit: 32 },
];
export const SKIP = { PX: 1, NX: 2, PY: 4, NY: 8, PZ: 16, NZ: 32 };
const rgbCache = new Map();
function rgb(hex) {
  let v = rgbCache.get(hex);
  if (!v) {
    v = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
    rgbCache.set(hex, v);
  }
  return v;
}
export function mixHex(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return (
    (Math.round(A[0] + (B[0] - A[0]) * t) << 16) |
    (Math.round(A[1] + (B[1] - A[1]) * t) << 8) |
    Math.round(A[2] + (B[2] - A[2]) * t)
  );
}
export function shade(hex, k) {
  const A = rgb(hex);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return (f(A[0]) << 16) | (f(A[1]) << 8) | f(A[2]);
}

export class VoxelBuilder {
  constructor(cap = 8192) {
    this.n = 0;
    this.ni = 0;
    this.alloc(cap);
    this.corners = new Float32Array(24);
    // Optional transform applied to everything (used for grouped props).
    this.ox = 0; this.oy = 0; this.oz = 0; this.oyaw = 0;
  }
  alloc(cap) {
    const grow = (Old, size) => {
      const a = new Old.constructor(size);
      a.set(Old.subarray(0, Math.min(Old.length, size)));
      return a;
    };
    if (!this.pos) {
      this.pos = new Float32Array(cap * 3);
      this.nrm = new Int8Array(cap * 3);
      this.col = new Uint8Array(cap * 4);
      this.mat = new Uint8Array(cap * 4);
      this.uv = new Float32Array(cap * 2);
      this.idx = new Uint32Array(cap * 1.5);
    } else {
      this.pos = grow(this.pos, cap * 3);
      this.nrm = grow(this.nrm, cap * 3);
      this.col = grow(this.col, cap * 4);
      this.mat = grow(this.mat, cap * 4);
      this.uv = grow(this.uv, cap * 2);
      this.idx = grow(this.idx, cap * 1.5);
    }
    this.cap = cap;
  }
  /** Set a local frame (offset + yaw) for subsequent primitives. */
  frame(x = 0, y = 0, z = 0, yaw = 0) {
    this.ox = x; this.oy = y; this.oz = z; this.oyaw = yaw;
    return this;
  }
  quad(c, i0, i1, i2, i3, nx, ny, nz, color, o, uvr) {
    if (this.n + 4 > this.cap) this.alloc(this.cap * 2);
    const base = this.n;
    const [r, g, b] = rgb(color);
    const grain = Math.round((o.n ?? 0.35) * 127) | (o.ao ? 128 : 0);
    const em = Math.min(255, Math.round((o.e ?? 0) * 32));
    const pid = o.p ?? 0, q = o.q ?? 0;
    const ax = c[i1 * 3] - c[i0 * 3], ay = c[i1 * 3 + 1] - c[i0 * 3 + 1], az = c[i1 * 3 + 2] - c[i0 * 3 + 2];
    const bx = c[i3 * 3] - c[i0 * 3], by = c[i3 * 3 + 1] - c[i0 * 3 + 1], bz = c[i3 * 3 + 2] - c[i0 * 3 + 2];
    const fw = Math.hypot(ax, ay, az), fh = Math.hypot(bx, by, bz);
    const fwb = Math.min(255, Math.round((o.fw ?? fw) * 4));
    const ids = [i0, i1, i2, i3];
    const U = uvr
      ? [uvr[0], uvr[2], uvr[2], uvr[0]]
      : [o.u0 ?? 0, (o.u0 ?? 0) + fw, (o.u0 ?? 0) + fw, o.u0 ?? 0];
    const V = uvr ? [uvr[1], uvr[1], uvr[3], uvr[3]] : [o.v0 ?? 0, o.v0 ?? 0, (o.v0 ?? 0) + fh, (o.v0 ?? 0) + fh];
    for (let k = 0; k < 4; k++) {
      const v = base + k, ci = ids[k] * 3;
      this.pos[v * 3] = c[ci];
      this.pos[v * 3 + 1] = c[ci + 1];
      this.pos[v * 3 + 2] = c[ci + 2];
      this.nrm[v * 3] = nx * 127;
      this.nrm[v * 3 + 1] = ny * 127;
      this.nrm[v * 3 + 2] = nz * 127;
      this.col[v * 4] = r;
      this.col[v * 4 + 1] = g;
      this.col[v * 4 + 2] = b;
      this.col[v * 4 + 3] = grain;
      this.mat[v * 4] = em;
      this.mat[v * 4 + 1] = pid;
      this.mat[v * 4 + 2] = q;
      this.mat[v * 4 + 3] = fwb;
      this.uv[v * 2] = U[k];
      this.uv[v * 2 + 1] = V[k];
    }
    const t = this.ni;
    this.idx[t] = base; this.idx[t + 1] = base + 1; this.idx[t + 2] = base + 2;
    this.idx[t + 3] = base; this.idx[t + 4] = base + 2; this.idx[t + 5] = base + 3;
    this.ni += 6;
    this.n += 4;
  }
  /**
   * Axis-aligned (optionally rotated) box centred at x,y,z with size w,h,d.
   * o: { e emissive, p pattern, q param, n grain, ao, skip mask, ry/rx/rz radians, top/side colours,
   *      faces: {bit: {color,p,q,e,uvr}} per-face overrides }
   */
  box(x, y, z, w, h, d, color, o = {}) {
    const c = this.corners, hw = w / 2, hh = h / 2, hd = d / 2;
    const ry = (o.ry ?? 0) + this.oyaw, rx = o.rx ?? 0, rz = o.rz ?? 0;
    const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx), cz = Math.cos(rz), sz = Math.sin(rz);
    // Frame transform for the centre.
    const fc = Math.cos(this.oyaw), fs = Math.sin(this.oyaw);
    const X = this.ox + x * fc + z * fs, Y = this.oy + y, Z = this.oz - x * fs + z * fc;
    const rot = (vx, vy, vz, out, i) => {
      // R = Ry * Rx * Rz
      let ax = vx * cz - vy * sz, ay = vx * sz + vy * cz, az = vz;
      let bx = ax, by = ay * cx - az * sx, bz = ay * sx + az * cx;
      out[i] = X + bx * cy + bz * sy;
      out[i + 1] = Y + by;
      out[i + 2] = Z - bx * sy + bz * cy;
    };
    for (let k = 0; k < 8; k++)
      rot(k & 1 ? hw : -hw, k & 2 ? hh : -hh, k & 4 ? hd : -hd, c, k * 3);
    this.faces(c, color, o);
  }
  /** Generic hexahedron from 8 corners (index bits x=1,y=2,z=4) in local frame coords. */
  hexa(pts, color, o = {}) {
    const c = this.corners;
    const fc = Math.cos(this.oyaw), fs = Math.sin(this.oyaw);
    for (let k = 0; k < 8; k++) {
      const [px, py, pz] = pts[k];
      c[k * 3] = this.ox + px * fc + pz * fs;
      c[k * 3 + 1] = this.oy + py;
      c[k * 3 + 2] = this.oz - px * fs + pz * fc;
    }
    this.faces(c, color, o);
  }
  faces(c, color, o) {
    const skip = o.skip ?? SKIP.NY;
    for (const f of FACES) {
      if (skip & f.bit) continue;
      const [i0, i1, i2, i3] = f.c;
      // Compute the true normal (handles rotation/deformation).
      const ax = c[i1 * 3] - c[i0 * 3], ay = c[i1 * 3 + 1] - c[i0 * 3 + 1], az = c[i1 * 3 + 2] - c[i0 * 3 + 2];
      const bx = c[i3 * 3] - c[i0 * 3], by = c[i3 * 3 + 1] - c[i0 * 3 + 1], bz = c[i3 * 3 + 2] - c[i0 * 3 + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      const fo = o.faces?.[f.bit];
      let col = color, oo = o;
      if (fo) {
        oo = { ...o, ...fo };
        col = fo.color ?? color;
      } else if (f.bit === 4 && o.top !== undefined) col = o.top;
      else if (f.bit !== 4 && f.bit !== 8 && o.side !== undefined) col = o.side;
      if (f.bit === 4 && o.topP !== undefined && !fo) oo = { ...o, p: o.topP, q: o.topQ ?? 0, e: 0 };
      this.quad(c, i0, i1, i2, i3, nx, ny, nz, col, oo, fo?.uvr);
    }
  }
  /** Flat horizontal quad (top face only). */
  flat(x, y, z, w, d, color, o = {}) {
    this.box(x, y - 0.005, z, w, 0.01, d, color, { ...o, skip: 0b111011 });
  }
  geometry() {
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(this.pos.slice(0, this.n * 3), 3));
    g.setAttribute("normal", new T.BufferAttribute(this.nrm.slice(0, this.n * 3), 3, true));
    g.setAttribute("aCol", new T.BufferAttribute(this.col.slice(0, this.n * 4), 4, true));
    g.setAttribute("aMat", new T.BufferAttribute(this.mat.slice(0, this.n * 4), 4, true));
    g.setAttribute("aUv", new T.BufferAttribute(this.uv.slice(0, this.n * 2), 2));
    g.setIndex(new T.BufferAttribute(this.idx.slice(0, this.ni), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/* ---------------- Additive glow decals (light pools, wet reflections, cones, halos) ---------------- */
export const GLOW = { POOL: 0, STREAK: 1, CONE: 2, HALO: 3, BEAM: 4 };
const GLOW_VERT = /* glsl */ `
attribute vec3 aCenter; attribute vec4 aSize; attribute vec2 aCorner; attribute vec3 aColor;
varying vec2 vC; varying vec3 vColor; varying float vKind; varying float vLen; varying vec3 vW;
void main(){
  vec3 c=(modelMatrix*vec4(aCenter,1.)).xyz;
  float kind=aSize.z; vec2 dir=vec2(cos(aSize.w),sin(aSize.w));
  vec3 p=c;
  if(kind<.5){ // pool
    vec2 o=aCorner.x*aSize.x*vec2(-dir.y,dir.x)+aCorner.y*aSize.y*dir; p+=vec3(o.x,0.,o.y);
  }else if(kind<1.5){ // streak toward camera on the ground
    vec2 tc=cameraPosition.xz-c.xz; float l=max(length(tc),.001); vec2 d=tc/l; vec2 pr=vec2(-d.y,d.x);
    float t=aCorner.y*.5+.5; vec2 o=pr*aCorner.x*aSize.x*(1.-t*.35)+d*(t*min(aSize.y,l*.9)-.2); p+=vec3(o.x,0.,o.y);
  }else if(kind<2.5){ // cone along dir
    float t=aCorner.y*.5+.5; vec2 pr=vec2(-dir.y,dir.x);
    vec2 o=pr*aCorner.x*aSize.x*(.25+.75*t)+dir*t*aSize.y; p+=vec3(o.x,0.,o.y);
  }else if(kind<3.5){ // camera-facing halo
    vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);
    vec3 up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
    p+=right*aCorner.x*aSize.x+up*aCorner.y*aSize.x;
  }else{ // vertical beam from c (top) down to ground along dir length
    vec3 tc=normalize(vec3(cameraPosition.x-c.x,0.,cameraPosition.z-c.z));
    vec3 side=normalize(cross(vec3(0.,1.,0.),tc));
    float t=aCorner.y*.5+.5;
    vec3 tip=vec3(c.x+dir.x*aSize.y,.05,c.z+dir.y*aSize.y);
    p=mix(c,tip,t)+side*aCorner.x*aSize.x*(.12+.88*t);
  }
  vC=aCorner; vColor=aColor; vKind=kind; vLen=aSize.y; vW=p;
  gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
}`;
const GLOW_FRAG = /* glsl */ `
varying vec2 vC; varying vec3 vColor; varying float vKind; varying float vLen; varying vec3 vW;
uniform float uTime, uFogDensity, uFogStart, uGlowScale;
float hh(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
void main(){
  float a=0.;
  if(vKind<.5){float r=length(vC);a=pow(max(1.-r*r,0.),2.2);a=floor(a*7.+.5)/7.;}
  else if(vKind<1.5){float t=vC.y*.5+.5;float x=abs(vC.x);
    a=pow(max(1.-x,0.),1.6)*pow(1.-t,1.3);
    float band=step(.35,fract(t*vLen*.9+hh(vec2(floor(t*vLen*.9),floor(vW.x)))*.5));
    a*=.35+.65*band;}
  else if(vKind<2.5){float t=vC.y*.5+.5;a=pow(max(1.-abs(vC.x),0.),2.)*pow(1.-t,1.6)*smoothstep(0.,.18,t);}
  else if(vKind<3.5){float r=length(vC);a=pow(max(1.-r,0.),2.2);}
  else{float t=vC.y*.5+.5;a=pow(max(1.-abs(vC.x),0.),1.5)*(1.-t*.6);}
  float d=length(vW-cameraPosition);
  float f=1.-exp(-max(d-uFogStart,0.)*uFogDensity);
  gl_FragColor=vec4(vColor*a*uGlowScale*(1.-f*.85),1.);
}`;
export function glowMaterial() {
  return new T.ShaderMaterial({
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    uniforms: { ...SHARED, uGlowScale: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
}
const glowColors = new Map();
export class GlowBuilder {
  constructor(cap = 256, dynamic = false) {
    this.cap = cap;
    this.count = 0;
    this.dynamic = dynamic;
    this.center = new Float32Array(cap * 12);
    this.size = new Float32Array(cap * 16);
    this.color = new Float32Array(cap * 12);
    this.corner = new Float32Array(cap * 8);
    const idx = new Uint32Array(cap * 6);
    for (let i = 0; i < cap; i++) {
      this.corner.set([-1, -1, 1, -1, 1, 1, -1, 1], i * 8);
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    this.idx = idx;
  }
  /** kind GLOW.*, x,y,z centre, w half-width, l length, angle (rad), hex colour, intensity */
  add(kind, x, y, z, w, l, angle, color, k = 1) {
    if (this.count >= this.cap) return;
    const i = this.count++;
    let col = color;
    if (typeof color === "number") {
      col = glowColors.get(color);
      if (!col) glowColors.set(color, (col = new T.Color(color)));
    }
    const cr = col.r * k, cg = col.g * k, cb = col.b * k;
    for (let v = 0; v < 4; v++) {
      const a = (i * 4 + v) * 3, s = (i * 4 + v) * 4;
      this.center[a] = x; this.center[a + 1] = y; this.center[a + 2] = z;
      this.size[s] = w; this.size[s + 1] = l; this.size[s + 2] = kind; this.size[s + 3] = angle;
      this.color[a] = cr; this.color[a + 1] = cg; this.color[a + 2] = cb;
    }
  }
  mesh(material) {
    const g = new T.BufferGeometry();
    const usage = this.dynamic ? T.DynamicDrawUsage : T.StaticDrawUsage;
    const n = this.dynamic ? this.cap : this.count;
    const attr = (arr, size) => new T.BufferAttribute(this.dynamic ? arr : arr.slice(0, n * 4 * size), size).setUsage(usage);
    g.setAttribute("aCenter", attr(this.center, 3));
    g.setAttribute("position", g.getAttribute("aCenter"));
    g.setAttribute("aSize", attr(this.size, 4));
    g.setAttribute("aColor", attr(this.color, 3));
    g.setAttribute("aCorner", new T.BufferAttribute(this.dynamic ? this.corner : this.corner.slice(0, n * 8), 2));
    g.setIndex(new T.BufferAttribute(this.dynamic ? this.idx : this.idx.slice(0, n * 6), 1));
    g.setDrawRange(0, this.count * 6);
    const m = new T.Mesh(g, material);
    m.frustumCulled = false;
    m.renderOrder = 2;
    this.geometry = g;
    return m;
  }
  /** For dynamic builders: upload current contents and reset. */
  flush() {
    const g = this.geometry;
    for (const name of ["aCenter", "aSize", "aColor"]) {
      const a = g.getAttribute(name);
      a.clearUpdateRanges?.();
      a.needsUpdate = true;
    }
    g.setDrawRange(0, this.count * 6);
    this.count = 0;
  }
}
