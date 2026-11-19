import * as T from "../../vendor/three.js";

/* Lightweight HDR pipeline: scene -> half-float target -> 2-level bloom -> tone map + grade.
   Everything runs at the low internal resolution; the canvas is upscaled with nearest filtering. */
const VERT = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`;
const BRIGHT = `uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; varying vec2 vUv;
void main(){
  vec3 c=vec3(0.);
  c+=texture2D(tSrc,vUv+uTexel*vec2(-1.,-1.)).rgb;
  c+=texture2D(tSrc,vUv+uTexel*vec2( 1.,-1.)).rgb;
  c+=texture2D(tSrc,vUv+uTexel*vec2(-1., 1.)).rgb;
  c+=texture2D(tSrc,vUv+uTexel*vec2( 1., 1.)).rgb;
  c*=.25;
  float l=max(c.r,max(c.g,c.b));
  gl_FragColor=vec4(c*smoothstep(uThreshold,uThreshold*2.2,l),1.);
}`;
const DOWN = `uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
void main(){vec3 c=texture2D(tSrc,vUv+uTexel*vec2(-1.,-1.)).rgb+texture2D(tSrc,vUv+uTexel*vec2(1.,-1.)).rgb+texture2D(tSrc,vUv+uTexel*vec2(-1.,1.)).rgb+texture2D(tSrc,vUv+uTexel*vec2(1.,1.)).rgb;gl_FragColor=vec4(c*.25,1.);}`;
const BLUR = `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
void main(){
  vec3 c=texture2D(tSrc,vUv).rgb*.2270270270;
  c+=texture2D(tSrc,vUv+uDir*1.3846153846).rgb*.3162162162;
  c+=texture2D(tSrc,vUv-uDir*1.3846153846).rgb*.3162162162;
  c+=texture2D(tSrc,vUv+uDir*3.2307692308).rgb*.0702702703;
  c+=texture2D(tSrc,vUv-uDir*3.2307692308).rgb*.0702702703;
  gl_FragColor=vec4(c,1.);
}`;
const COMPOSITE = `uniform sampler2D tScene, tB1, tB2; uniform float uBloom, uExposure, uFlash, uDesat, uSat, uTime, uSpeed, uVignette;
uniform vec3 uFlashCol; uniform vec2 uRes; varying vec2 vUv;
float bayer4(vec2 p){ivec2 q=ivec2(mod(p,4.));int i=q.x+q.y*4;
  float m[16]=float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);return (m[i]+.5)/16.;}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){
  vec2 uv=vUv;
  vec3 c=texture2D(tScene,uv).rgb;
  if(uSpeed>0.){
    // subtle radial streaking at the screen edges when going fast
    vec2 d=uv-vec2(.5,.62); float r=length(d);
    float k=smoothstep(.32,.75,r)*uSpeed;
    if(k>.001){vec3 acc=c; for(int i=1;i<4;i++){acc+=texture2D(tScene,uv-d*float(i)*.012*k).rgb;} c=acc*.25;}
  }
  vec3 bl=texture2D(tB1,uv).rgb*.7+texture2D(tB2,uv).rgb*.9;
  c+=bl*uBloom;
  c*=uExposure;
  c=aces(c);
  c=pow(c,vec3(1./2.2));
  float l=dot(c,vec3(.299,.587,.114));
  c=mix(vec3(l),c,uSat*(1.-uDesat));
  c+=vec3(.035,.0,.07)*(1.-c)*(1.-l);
  vec2 q=(uv-.5)*vec2(1.,1.15);
  float v=smoothstep(.95,.3,length(q));
  c=mix(c*vec3(.55,.42,.75),c,mix(1.,v,uVignette));
  float edge=smoothstep(.25,.85,length(q));
  c=mix(c,uFlashCol,uFlash*(.35+.65*edge));
  c+=(bayer4(gl_FragCoord.xy)-.5)/200.;
  gl_FragColor=vec4(c,1.);
}`;

export function createPost(renderer) {
  const floatOK = renderer.extensions.has("EXT_color_buffer_float") || renderer.extensions.has("EXT_color_buffer_half_float");
  const type = floatOK ? T.HalfFloatType : T.UnsignedByteType;
  const rt = (depth) =>
    new T.WebGLRenderTarget(1, 1, { type, depthBuffer: depth, stencilBuffer: false, minFilter: T.LinearFilter, magFilter: T.LinearFilter, generateMipmaps: false });
  const main = rt(true), a1 = rt(false), b1 = rt(false), a2 = rt(false), b2 = rt(false);
  main.texture.minFilter = main.texture.magFilter = T.NearestFilter;
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  geo.setAttribute("uv", new T.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const quad = new T.Mesh(geo);
  quad.frustumCulled = false;
  const scene = new T.Scene();
  scene.add(quad);
  const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mat = (frag, uniforms) => new T.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const bright = mat(BRIGHT, { tSrc: { value: null }, uTexel: { value: new T.Vector2() }, uThreshold: { value: floatOK ? 1.25 : 0.86 } });
  const down = mat(DOWN, { tSrc: { value: null }, uTexel: { value: new T.Vector2() } });
  const blur = mat(BLUR, { tSrc: { value: null }, uDir: { value: new T.Vector2() } });
  const comp = mat(COMPOSITE, {
    tScene: { value: main.texture }, tB1: { value: b1.texture }, tB2: { value: b2.texture },
    uBloom: { value: 1 }, uExposure: { value: 0.94 }, uFlash: { value: 0 }, uFlashCol: { value: new T.Color(1, 0.1, 0.3) },
    uDesat: { value: 0 }, uSat: { value: 1.22 }, uTime: { value: 0 }, uRes: { value: new T.Vector2() }, uSpeed: { value: 0 }, uVignette: { value: 1 },
  });
  let W = 1, H = 1;
  const pass = (m, target) => {
    quad.material = m;
    renderer.setRenderTarget(target);
    renderer.render(scene, cam);
  };
  return {
    uniforms: comp.uniforms,
    hdr: floatOK,
    setSize(w, h) {
      if (w === W && h === H) return;
      W = w; H = h;
      main.setSize(w, h);
      const w1 = Math.max(1, Math.round(w / 4)), h1 = Math.max(1, Math.round(h / 4));
      a1.setSize(w1, h1); b1.setSize(w1, h1);
      const w2 = Math.max(1, Math.round(w / 8)), h2 = Math.max(1, Math.round(h / 8));
      a2.setSize(w2, h2); b2.setSize(w2, h2);
      comp.uniforms.uRes.value.set(w, h);
    },
    render(scene3, camera, bloom = true) {
      renderer.setRenderTarget(main);
      renderer.render(scene3, camera);
      if (bloom) {
        bright.uniforms.tSrc.value = main.texture;
        bright.uniforms.uTexel.value.set(1 / W, 1 / H);
        pass(bright, a1);
        blur.uniforms.tSrc.value = a1.texture;
        blur.uniforms.uDir.value.set(1 / a1.width, 0);
        pass(blur, b1);
        blur.uniforms.tSrc.value = b1.texture;
        blur.uniforms.uDir.value.set(0, 1 / a1.height);
        pass(blur, a1);
        down.uniforms.tSrc.value = a1.texture;
        down.uniforms.uTexel.value.set(0.5 / a1.width, 0.5 / a1.height);
        pass(down, a2);
        blur.uniforms.tSrc.value = a2.texture;
        blur.uniforms.uDir.value.set(1 / a2.width, 0);
        pass(blur, b2);
        blur.uniforms.tSrc.value = b2.texture;
        blur.uniforms.uDir.value.set(0, 1 / a2.height);
        pass(blur, a2);
        // final blurred results live in a1 / a2
        comp.uniforms.tB1.value = a1.texture;
        comp.uniforms.tB2.value = a2.texture;
        comp.uniforms.uBloom.value = 1;
      } else comp.uniforms.uBloom.value = 0;
      pass(comp, null);
    },
  };
}
