import * as T from "../../vendor/three.js";

/* HDR pipeline: scene -> half-float target (MSAA on the higher quality steps, with a depth texture when
   outlines are on) -> 2-level bloom -> composite: FXAA (only when there is no MSAA), depth-edge outlines,
   speed zoom-blur (masked around the car), chromatic aberration, bloom, filmic tone map, colour grade
   (contrast, saturation, split toning), vignette, impact flash, a 4x4 ordered-dither palette snap and
   fine grain. */
const VERT = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`;
// Karis average on the first bloom step: each tap is weighted by 1/(1+luma), so a single bright
// window pixel cannot make the whole bloom pulse as it crosses pixel boundaries.
const BRIGHT = `uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; varying vec2 vUv;
float kw(vec3 c){ return 1. / (1. + max(c.r, max(c.g, c.b))); }
void main(){
  vec3 a=texture2D(tSrc,vUv+uTexel*vec2(-1.,-1.)).rgb, b=texture2D(tSrc,vUv+uTexel*vec2(1.,-1.)).rgb,
       d=texture2D(tSrc,vUv+uTexel*vec2(-1.,1.)).rgb, e=texture2D(tSrc,vUv+uTexel*vec2(1.,1.)).rgb;
  float wa=kw(a), wb=kw(b), wd=kw(d), we=kw(e);
  vec3 c=(a*wa+b*wb+d*wd+e*we)/(wa+wb+wd+we);
  float l=max(c.r,max(c.g,c.b));
  gl_FragColor=vec4(c*smoothstep(uThreshold,uThreshold*2.,l),1.);
}`;
const DOWN = `uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
void main(){vec3 c=texture2D(tSrc,vUv+uTexel*vec2(-1.,-1.)).rgb+texture2D(tSrc,vUv+uTexel*vec2(1.,-1.)).rgb+texture2D(tSrc,vUv+uTexel*vec2(-1.,1.)).rgb+texture2D(tSrc,vUv+uTexel*vec2(1.,1.)).rgb;gl_FragColor=vec4(c*.25,1.);}`;
const BLUR = `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
void main(){
  vec3 c=texture2D(tSrc,vUv).rgb*.2270270270;
  c+=texture2D(tSrc,vUv+uDir*1.3846153846).rgb*.3162162162; c+=texture2D(tSrc,vUv-uDir*1.3846153846).rgb*.3162162162;
  c+=texture2D(tSrc,vUv+uDir*3.2307692308).rgb*.0702702703; c+=texture2D(tSrc,vUv-uDir*3.2307692308).rgb*.0702702703;
  gl_FragColor=vec4(c,1.);
}`;
const COMPOSITE = `uniform sampler2D tScene, tB1, tB2, tDepth; uniform float uBloom, uExposure, uFlash, uDesat, uSat, uContrast, uTime, uBlur, uCA, uVignette, uGrain, uAspect;
uniform float uFxaa, uOutline, uDither, uNear, uFar;
uniform vec3 uFlashCol, uShadowTint, uHighTint; uniform vec2 uRes, uCenter; varying vec2 vUv;
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
// FXAA edge tests on tone-mapped brightness, so bright HDR areas and dark asphalt get the same treatment
float fl(vec3 c){ float l=lum(c)*uExposure; return l/(1.+l); }
vec3 fxaa(vec2 uv){
  vec2 px=1./uRes;
  vec3 cM=texture2D(tScene,uv).rgb;
  float lM=fl(cM), lNW=fl(texture2D(tScene,uv+vec2(-1.,-1.)*px).rgb), lNE=fl(texture2D(tScene,uv+vec2(1.,-1.)*px).rgb),
        lSW=fl(texture2D(tScene,uv+vec2(-1.,1.)*px).rgb), lSE=fl(texture2D(tScene,uv+vec2(1.,1.)*px).rgb);
  float lMin=min(lM,min(min(lNW,lNE),min(lSW,lSE))), lMax=max(lM,max(max(lNW,lNE),max(lSW,lSE)));
  if(lMax-lMin<max(.03,lMax*.1))return cM;
  vec2 dir=vec2(-((lNW+lNE)-(lSW+lSE)),((lNW+lSW)-(lNE+lSE)));
  float red=max((lNW+lNE+lSW+lSE)*.03125,.0078);
  dir=clamp(dir/(min(abs(dir.x),abs(dir.y))+red),-6.,6.)*px;
  vec3 a=.5*(texture2D(tScene,uv-dir*.1667).rgb+texture2D(tScene,uv+dir*.1667).rgb);
  vec3 b=a*.5+.25*(texture2D(tScene,uv-dir*.5).rgb+texture2D(tScene,uv+dir*.5).rgb);
  float lb=fl(b);
  return (lb<lMin||lb>lMax)?a:b;
}
vec3 filmic(vec3 x){ x=max(vec3(0.),x); return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
// value proportional to 1/viewZ; it is affine across any plane in screen space, so its Laplacian is ~0 on
// flat ground and walls and only fires on real depth steps (silhouettes)
float invZ(vec2 uv){ return uFar - texture2D(tDepth, uv).r * (uFar - uNear); }
float bayer2(vec2 a){ a=floor(a); return fract(a.x*.5+a.y*a.y*.75); }
float bayer4(vec2 a){ return bayer2(.5*a)*.25+bayer2(a); }
void main(){
  vec2 uv=vUv;
  vec2 d=uv-uCenter; vec2 da=d*vec2(uAspect,1.);
  float r=length(da);
  vec3 c=uFxaa>.5?fxaa(uv):texture2D(tScene,uv).rgb;
  if(uOutline>0.001){
    // thin dark outline on the near side of depth discontinuities; fades out with distance so far
    // geometry never gets crawling 1px lines
    vec2 px=1./uRes;
    float wC=invZ(uv), wN=invZ(uv+vec2(0.,px.y)), wS=invZ(uv-vec2(0.,px.y)), wE=invZ(uv+vec2(px.x,0.)), wW=invZ(uv-vec2(px.x,0.));
    float lap=(4.*wC-wN-wS-wE-wW)/max(wC,1e-6);
    float z=uNear*uFar/max(wC,1e-6);
    float e=smoothstep(.06,.22,lap)*(1.-smoothstep(28.,95.,z))*uOutline;
    c*=1.-.62*e;
  }
  if(uBlur>0.001){
    float k=smoothstep(.1,.75,r)*uBlur;
    if(k>.002){ vec3 acc=c; float w=1.;
      for(int i=1;i<9;i++){ float fi=float(i); acc+=texture2D(tScene,uv-d*fi*.0105*k).rgb; w+=1.; }
      c=acc/w; }
  }
  if(uCA>0.001){
    vec2 o=d*uCA*.012*smoothstep(.05,.8,r);
    c.r=mix(c.r,texture2D(tScene,uv+o).r,.85); c.b=mix(c.b,texture2D(tScene,uv-o).b,.85);
  }
  vec3 bl=texture2D(tB1,uv).rgb*.75+texture2D(tB2,uv).rgb*1.1;
  c+=bl*uBloom;
  c*=uExposure;
  c=filmic(c*0.92);
  c=pow(c,vec3(1./2.2));
  // grade
  c=(c-.5)*uContrast+.5;
  float l=lum(c);
  c=mix(vec3(l),c,uSat*(1.-uDesat));
  c+=uShadowTint*(1.-smoothstep(0.,.5,l))*.09+uHighTint*smoothstep(.55,1.,l)*.06;
  // vignette
  vec2 q=(uv-.5)*vec2(1.,1.1);
  c*=mix(1.,smoothstep(1.05,.32,length(q)),uVignette);
  float edge=smoothstep(.2,.85,length(q));
  c=mix(c,uFlashCol,clamp(uFlash,0.,1.)*(.25+.75*edge));
  if(uDither>.5){ // ordered-dither snap to uDither levels per channel: crisp, screen-locked (never animated)
    c=floor(clamp(c,0.,1.)*uDither+bayer4(gl_FragCoord.xy))/uDither;
  }
  c+=(hash(uv*uRes+fract(uTime)*91.)-.5)*uGrain;
  gl_FragColor=vec4(clamp(c,0.,1.),1.);
}`;

export function createPost(renderer) {
  const floatOK = renderer.extensions.has("EXT_color_buffer_float") || renderer.extensions.has("EXT_color_buffer_half_float");
  const type = floatOK ? T.HalfFloatType : T.UnsignedByteType;
  let maxSamples = renderer.capabilities.maxSamples || 0;
  if (type === T.HalfFloatType) { // a half-float colour buffer may allow fewer samples than the GPU-wide limit
    try { const gl = renderer.getContext(); maxSamples = Math.min(maxSamples, Math.max(0, ...(gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES) || [0]))); } catch { maxSamples = 0; }
  }
  const rt = (depth, samples = 0) => new T.WebGLRenderTarget(1, 1, { type, depthBuffer: depth, stencilBuffer: false, minFilter: T.LinearFilter, magFilter: T.LinearFilter, generateMipmaps: false, samples });
  let samples = Math.min(4, maxSamples), useDepth = false;
  const main = rt(true, samples), a1 = rt(false), b1 = rt(false), a2 = rt(false), b2 = rt(false);
  main.resolveDepthBuffer = false; // depth is only copied out of the MSAA buffer while the outline reads it
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  geo.setAttribute("uv", new T.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const quad = new T.Mesh(geo);
  quad.frustumCulled = false;
  const scene = new T.Scene();
  scene.add(quad);
  const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mat = (frag, uniforms) => new T.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const bright = mat(BRIGHT, { tSrc: { value: null }, uTexel: { value: new T.Vector2() }, uThreshold: { value: floatOK ? 1.1 : 0.8 } });
  const down = mat(DOWN, { tSrc: { value: null }, uTexel: { value: new T.Vector2() } });
  const blur = mat(BLUR, { tSrc: { value: null }, uDir: { value: new T.Vector2() } });
  const comp = mat(COMPOSITE, {
    tScene: { value: main.texture }, tB1: { value: b1.texture }, tB2: { value: b2.texture }, tDepth: { value: null },
    uBloom: { value: 1 }, uExposure: { value: 1 }, uFlash: { value: 0 }, uFlashCol: { value: new T.Color(1, 1, 1) },
    uDesat: { value: 0 }, uSat: { value: 1.1 }, uContrast: { value: 1.06 }, uTime: { value: 0 }, uRes: { value: new T.Vector2() },
    uBlur: { value: 0 }, uCA: { value: 0 }, uCenter: { value: new T.Vector2(0.5, 0.5) }, uVignette: { value: 0.55 }, uGrain: { value: 0.01 }, uAspect: { value: 1 },
    uShadowTint: { value: new T.Color(0.1, 0.2, 0.55) }, uHighTint: { value: new T.Color(1, 0.6, 0.3) },
    uFxaa: { value: samples > 0 ? 0 : 1 }, uOutline: { value: 0 }, uDither: { value: 0 }, uNear: { value: 0.6 }, uFar: { value: 2200 },
  });
  let W = 1, H = 1;
  /** Re-create the scene target's GPU storage (three only reads `samples`/`depthTexture` at setup). */
  function rebuild() {
    if (main.depthTexture) main.depthTexture.dispose();
    main.depthTexture = useDepth ? new T.DepthTexture(W, H) : null;
    comp.uniforms.tDepth.value = main.depthTexture;
    main.samples = samples;
    main.resolveDepthBuffer = useDepth;
    main.dispose();
  }
  const pass = (m, target) => { quad.material = m; renderer.setRenderTarget(target); renderer.render(scene, cam); };
  return {
    uniforms: comp.uniforms,
    hdr: floatOK,
    maxSamples,
    /** MSAA sample count for the scene target (clamped to the GPU); FXAA runs only when it is 0. */
    setSamples(n) {
      n = Math.max(0, Math.min(n | 0, maxSamples));
      comp.uniforms.uFxaa.value = n > 0 ? 0 : 1;
      if (n === samples) return;
      samples = n; rebuild();
    },
    /** Stylised look per quality step: outline strength 0..1, dither levels (0 = off), grain amount. */
    setLook({ outline = 0, dither = 0, grain = 0.01 } = {}) {
      comp.uniforms.uOutline.value = outline;
      comp.uniforms.uDither.value = dither;
      comp.uniforms.uGrain.value = grain;
      const want = outline > 0;
      if (want !== useDepth) { useDepth = want; rebuild(); }
    },
    setSize(w, h) {
      if (w === W && h === H) return;
      W = w; H = h;
      main.setSize(w, h);
      if (useDepth) rebuild();
      const w1 = Math.max(1, Math.round(w / 4)), h1 = Math.max(1, Math.round(h / 4));
      a1.setSize(w1, h1); b1.setSize(w1, h1);
      const w2 = Math.max(1, Math.round(w / 8)), h2 = Math.max(1, Math.round(h / 8));
      a2.setSize(w2, h2); b2.setSize(w2, h2);
      comp.uniforms.uRes.value.set(w, h);
      comp.uniforms.uAspect.value = w / h;
    },
    render(scene3, camera, bloom = true) {
      comp.uniforms.uNear.value = camera.near; comp.uniforms.uFar.value = camera.far;
      renderer.setRenderTarget(main);
      renderer.render(scene3, camera);
      if (bloom) {
        bright.uniforms.tSrc.value = main.texture; bright.uniforms.uTexel.value.set(1 / W, 1 / H); pass(bright, a1);
        blur.uniforms.tSrc.value = a1.texture; blur.uniforms.uDir.value.set(1 / a1.width, 0); pass(blur, b1);
        blur.uniforms.tSrc.value = b1.texture; blur.uniforms.uDir.value.set(0, 1 / a1.height); pass(blur, a1);
        down.uniforms.tSrc.value = a1.texture; down.uniforms.uTexel.value.set(0.5 / a1.width, 0.5 / a1.height); pass(down, a2);
        blur.uniforms.tSrc.value = a2.texture; blur.uniforms.uDir.value.set(1 / a2.width, 0); pass(blur, b2);
        blur.uniforms.tSrc.value = b2.texture; blur.uniforms.uDir.value.set(0, 1 / a2.height); pass(blur, a2);
        comp.uniforms.tB1.value = a1.texture; comp.uniforms.tB2.value = a2.texture; comp.uniforms.uBloom.value = 1;
      } else comp.uniforms.uBloom.value = 0;
      pass(comp, null);
    },
  };
}
