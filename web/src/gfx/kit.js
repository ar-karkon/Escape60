import * as T from "../../vendor/three.js";

const TV = new T.Vector3(), TN = new T.Vector3(), TQ = new T.Quaternion(), TE = new T.Euler(), TS = new T.Vector3();
/* Geometry builder for props, buildings details and landmarks: position, normal, color, aMat
   (roughness, metalness, emissive, kind) — consumed by kitMaterial(). Transform stack via `at()`. */
export class Kit {
  constructor() { this.p = []; this.n = []; this.c = []; this.m = []; this.mat = [0.8, 0, 0, 0]; this.col = new T.Color(1, 1, 1); this.M = new T.Matrix4(); this.N = new T.Matrix3(); this.extra = null; }
  set(color, rough = 0.8, metal = 0, emissive = 0, kind = 0) { this.col.set(color); this.mat = [rough, metal, emissive, kind]; return this; }
  /** Set the current transform (translation x,y,z, yaw ry, uniform/axis scale). */
  at(x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) {
    this.M.compose(TV.set(x, y, z), TQ.setFromEuler(TE.set(rx, ry, rz, "YXZ")), TS.set(sx, sy, sz));
    this.N.getNormalMatrix(this.M);
    return this;
  }
  reset() { this.M.identity(); this.N.identity(); return this; }
  _v(x, y, z, nx, ny, nz) {
    const v = TV.set(x, y, z).applyMatrix4(this.M), n = TN.set(nx, ny, nz).applyMatrix3(this.N).normalize();
    this.p.push(v.x, v.y, v.z); this.n.push(n.x, n.y, n.z); this.c.push(this.col.r, this.col.g, this.col.b); this.m.push(...this.mat);
    if (this.extra) this.extra.onVertex(x, y, z, nx, ny, nz);
  }
  tri(a, b, c, n) {
    if (!n) { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(...n) || 1; n = n.map((k) => k / l); }
    this._v(...a, ...n); this._v(...b, ...n); this._v(...c, ...n);
    return this;
  }
  quad(a, b, c, d, n) { this.tri(a, b, c, n); this.tri(a, c, d, n); return this; }
  /** Box from (x0,y0,z0) to (x1,y1,z1) in the current frame; skip = set of faces to omit ('b','t',...). */
  box(x0, y0, z0, x1, y1, z1, skip = "") {
    const v = (x, y, z) => [x, y, z];
    if (!skip.includes("t")) this.quad(v(x0, y1, z0), v(x0, y1, z1), v(x1, y1, z1), v(x1, y1, z0), [0, 1, 0]);
    if (!skip.includes("b")) this.quad(v(x0, y0, z0), v(x1, y0, z0), v(x1, y0, z1), v(x0, y0, z1), [0, -1, 0]);
    if (!skip.includes("n")) this.quad(v(x0, y0, z0), v(x0, y1, z0), v(x1, y1, z0), v(x1, y0, z0), [0, 0, -1]);
    if (!skip.includes("s")) this.quad(v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1), [0, 0, 1]);
    if (!skip.includes("w")) this.quad(v(x0, y0, z0), v(x0, y0, z1), v(x0, y1, z1), v(x0, y1, z0), [-1, 0, 0]);
    if (!skip.includes("e")) this.quad(v(x1, y0, z0), v(x1, y1, z0), v(x1, y1, z1), v(x1, y0, z1), [1, 0, 0]);
    return this;
  }
  cbox(cx, cy, cz, sx, sy, sz, skip) { return this.box(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, skip); }
  /** Vertical cylinder / frustum from y0 to y1, radii r0 -> r1, n sides. */
  cyl(x, y0, z, r0, r1, y1, n = 8, caps = true, flat = false) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const slope = (r0 - r1) / Math.max(1e-3, y1 - y0);
      const n0 = flat ? null : [c0, slope, s0], n1 = flat ? null : [c1, slope, s1];
      const A = [x + c0 * r0, y0, z + s0 * r0], B = [x + c1 * r0, y0, z + s1 * r0], C = [x + c1 * r1, y1, z + s1 * r1], D = [x + c0 * r1, y1, z + s0 * r1];
      if (flat) this.quad(A, D, C, B); else { this._v(...A, ...n0); this._v(...D, ...n0); this._v(...C, ...n1); this._v(...A, ...n0); this._v(...C, ...n1); this._v(...B, ...n1); }
      if (caps && r1 > 0) this.tri([x, y1, z], C, D, [0, 1, 0]);
      if (caps && r0 > 0) this.tri([x, y0, z], A, B, [0, -1, 0]);
    }
    return this;
  }
  /** Low-poly blob (octahedron-ish sphere) */
  blob(x, y, z, rx, ry = rx, rz = rx, detail = 1) {
    const g = new T.IcosahedronGeometry(1, detail);
    const pos = g.getAttribute("position");
    for (let i = 0; i < pos.count; i += 3) {
      const a = [pos.getX(i) * rx + x, pos.getY(i) * ry + y, pos.getZ(i) * rz + z];
      const b = [pos.getX(i + 1) * rx + x, pos.getY(i + 1) * ry + y, pos.getZ(i + 1) * rz + z];
      const c = [pos.getX(i + 2) * rx + x, pos.getY(i + 2) * ry + y, pos.getZ(i + 2) * rz + z];
      this.tri(a, b, c);
    }
    g.dispose();
    return this;
  }
  /** Gable roof prism over (x0..x1, z0..z1) at height y with ridge along x, rising h. */
  gable(x0, z0, x1, z1, y, h, overhang = 0.4) {
    x0 -= overhang; x1 += overhang; z0 -= overhang; z1 += overhang;
    const zm = (z0 + z1) / 2;
    this.quad([x0, y, z0], [x0, y + h, zm], [x1, y + h, zm], [x1, y, z0]);
    this.quad([x0, y, z1], [x1, y, z1], [x1, y + h, zm], [x0, y + h, zm]);
    this.tri([x0, y, z0], [x0, y, z1], [x0, y + h, zm]);
    this.tri([x1, y, z0], [x1, y + h, zm], [x1, y, z1]);
    return this;
  }
  /** Hip roof over (x0..x1, z0..z1) at height y rising h (ridge along the longer side). */
  hip(x0, z0, x1, z1, y, h, overhang = 0.4) {
    x0 -= overhang; x1 += overhang; z0 -= overhang; z1 += overhang;
    const w = x1 - x0, d = z1 - z0;
    if (w >= d) {
      const zm = (z0 + z1) / 2, i = d / 2, ra = [x0 + i, y + h, zm], rb = [x1 - i, y + h, zm];
      this.quad([x0, y, z0], ra, rb, [x1, y, z0]);
      this.quad([x1, y, z1], rb, ra, [x0, y, z1]);
      this.tri([x0, y, z1], ra, [x0, y, z0]);
      this.tri([x1, y, z0], rb, [x1, y, z1]);
    } else {
      const xm = (x0 + x1) / 2, i = w / 2, ra = [xm, y + h, z0 + i], rb = [xm, y + h, z1 - i];
      this.quad([x1, y, z0], ra, rb, [x1, y, z1]);
      this.quad([x0, y, z1], rb, ra, [x0, y, z0]);
      this.tri([x0, y, z0], ra, [x1, y, z0]);
      this.tri([x1, y, z1], rb, [x0, y, z1]);
    }
    return this;
  }
  get count() { return this.p.length / 3; }
  geometry() {
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new T.Float32BufferAttribute(this.n, 3));
    g.setAttribute("color", new T.Float32BufferAttribute(this.c, 3));
    g.setAttribute("aMat", new T.Float32BufferAttribute(this.m, 4));
    g.computeBoundingSphere();
    return g;
  }
}
