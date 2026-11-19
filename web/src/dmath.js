/* Deterministic transcendental functions for the simulation.
   Math.sin / cos / pow / atan2 are NOT bit-identical across JS engines: Arvan Edge's runtime,
   Safari and Firefox return different last bits than Chrome/Node, and a 60 Hz chase amplifies one
   ulp into a different run. These versions use only + - * / and Math.sqrt / Math.round, which IEEE 754
   defines exactly, so the browser and the edge replay produce the same numbers everywhere.
   Accuracy is ~1e-15 (fdlibm kernel coefficients); rendering may keep using Math.*. */
const PIO2_HI = 1.57079632673412561417e+00; // first 33 bits of pi/2 (n * PIO2_HI is exact for |n| < 2^20)
const PIO2_LO = 6.07710050650619224932e-11; // pi/2 - PIO2_HI
const INV_PIO2 = 6.36619772367581382433e-01;
const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04,
  S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05,
  C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;
function ksin(x) { const z = x * x; return x + x * z * (S1 + z * (S2 + z * (S3 + z * (S4 + z * (S5 + z * S6))))); }
function kcos(x) { const z = x * x; return 1 - 0.5 * z + z * z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6))))); }
export function dsin(x) {
  if (!Number.isFinite(x)) return NaN;
  const n = Math.round(x * INV_PIO2), y = (x - n * PIO2_HI) - n * PIO2_LO, q = n & 3;
  return q === 0 ? ksin(y) : q === 1 ? kcos(y) : q === 2 ? -ksin(y) : -kcos(y);
}
export function dcos(x) {
  if (!Number.isFinite(x)) return NaN;
  const n = Math.round(x * INV_PIO2), y = (x - n * PIO2_HI) - n * PIO2_LO, q = n & 3;
  return q === 0 ? kcos(y) : q === 1 ? -ksin(y) : q === 2 ? -kcos(y) : ksin(y);
}
const PI = 3.141592653589793, PI_2 = 1.5707963267948966, PI_6 = 0.5235987755982988;
const SQRT3 = 1.7320508075688772, TAN_PI_12 = 0.2679491924311227;
function atanSmall(x) { // |x| <= tan(pi/12): alternating series, 13 terms reach 1e-17
  const z = x * x; let term = x, sum = x;
  for (let k = 1; k <= 13; k++) { term *= -z; sum += term / (2 * k + 1); }
  return sum;
}
export function datan(x) {
  if (x !== x) return NaN;
  const neg = x < 0; let a = neg ? -x : x, r;
  if (a === Infinity) r = PI_2;
  else {
    const inv = a > 1; if (inv) a = 1 / a;
    r = a > TAN_PI_12 ? PI_6 + atanSmall((a * SQRT3 - 1) / (a + SQRT3)) : atanSmall(a);
    if (inv) r = PI_2 - r;
  }
  return neg ? -r : r;
}
export function datan2(y, x) {
  if (x !== x || y !== y) return NaN;
  if (x > 0) return datan(y / x);
  if (x < 0) return y >= 0 ? datan(y / x) + PI : datan(y / x) - PI;
  return y > 0 ? PI_2 : y < 0 ? -PI_2 : 0;
}
export function dhypot(x, y) { return Math.sqrt(x * x + y * y); }
