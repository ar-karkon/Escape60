/* Road-following autopilot used by the /edge Live Lab (and handy for tests). It only produces
   inputs, exactly like a player, so its runs verify on the edge like any other run. */
import { encodeInput } from './simulation.js';
import { sample, pointAt, edges } from './map.js';

export function pilot(g, { crash = false } = {}) {
  const p = g.player;
  if (crash) return encodeInput(3, false, false, g.nitro > 0.05); // full lock + nitro: into the wall
  const r = sample(p.x, p.y, {});
  if (r.e < 0) return encodeInput(0);
  const pt = pointAt(r.e, r.s, {}), fwd = pt.tx * Math.cos(p.h) + pt.ty * Math.sin(p.h) >= 0 ? 1 : -1;
  const E = edges[r.e], q = pointAt(r.e, Math.max(0, Math.min(E.len, r.s + fwd * (12 + p.v * 0.45))), {});
  let d = Math.atan2(q.y + q.tx * fwd * 2.5 - p.y, q.x - q.ty * fwd * 2.5 - p.x) - p.h;
  while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  return encodeInput(Math.max(-3, Math.min(3, Math.round(d * 5))), Math.abs(d) > 0.4 && p.v > 28, false, false);
}
