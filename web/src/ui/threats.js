/* Pursuit awareness overlay (visual only, reads the simulation, never writes it):
   - siren light bleeding in from the screen edge on the side a nearby cop is coming from,
   - pixel chevrons on a ring around your car pointing at police you cannot see, with distance,
     pulsing faster as they close in,
   - small markers above the police you can see (brackets when they have locked onto you),
   - a tail warning when a cop is right behind you,
   - a "YOU" pin over your car during the aerial intro. */
import * as T from "../../vendor/three.js";

const RED = [255, 51, 85], BLUE = [63, 152, 255], GOLD = [255, 227, 124], INK = "#1b0b2b";
const FONT = '"Jersey 10", "Rooyin", "Vazirmatn", monospace';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export function createThreats(canvas, render) {
  const ctx = canvas.getContext("2d");
  const V = new T.Vector3(), F = new T.Vector3();
  let W = 0, H = 0, dpr = 1, clear = true;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (w && h && (w !== W || h !== H)) { canvas.width = W = w; canvas.height = H = h; }
  }
  const out = { x: 0, y: 0, ok: false };
  function project(x, y, z) {
    V.set(x, y, z).project(render.camera);
    out.x = ((V.x + 1) / 2) * W; out.y = ((1 - V.y) / 2) * H; out.ok = V.z < 1 && V.z > -1;
    return out;
  }
  /** Pixel chevron pointing along angle b (0 = up, clockwise), centred at (x, y). */
  function chevron(x, y, b, size, col, alpha) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(b);
    const s = size;
    ctx.beginPath();
    ctx.moveTo(0, -s); ctx.lineTo(s * 0.95, s * 0.55); ctx.lineTo(0, s * 0.05); ctx.lineTo(-s * 0.95, s * 0.55); ctx.closePath();
    ctx.lineJoin = "miter"; ctx.lineWidth = 3 * dpr; ctx.strokeStyle = INK; ctx.globalAlpha = Math.min(1, alpha + 0.2); ctx.stroke();
    ctx.fillStyle = rgba(col, 1); ctx.globalAlpha = alpha; ctx.fill();
    // highlight bevel
    ctx.beginPath(); ctx.moveTo(0, -s * 0.62); ctx.lineTo(s * 0.5, s * 0.22); ctx.lineTo(0, -s * 0.12); ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.fill();
    ctx.restore();
  }
  function label(text, x, y, px, col, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `400 ${Math.round(px * dpr)}px ${FONT}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = 3 * dpr; ctx.strokeStyle = INK; ctx.lineJoin = "round";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = col; ctx.fillText(text, x, y);
    ctx.restore();
  }
  function edgeGlow(b, k, col) {
    // where the bearing leaves the screen, seen from the screen centre
    const sx = Math.sin(b), sy = -Math.cos(b);
    const tx = Math.abs(sx) > 1e-4 ? (W / 2) / Math.abs(sx) : 1e9, ty = Math.abs(sy) > 1e-4 ? (H / 2) / Math.abs(sy) : 1e9;
    const tt = Math.min(tx, ty), ex = W / 2 + sx * tt, ey = H / 2 + sy * tt;
    const R = Math.min(W, H) * (0.42 + 0.35 * k);
    const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, R);
    g.addColorStop(0, rgba(col, 0.62 * k)); g.addColorStop(0.45, rgba(col, 0.22 * k)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.fillRect(ex - R, ey - R, R * 2, R * 2);
  }

  return {
    draw(game, now, { active = true, reduced = false, tail = "COP ON YOUR TAIL", you = "YOU" } = {}) {
      resize();
      if (!W) return;
      if (!clear) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); clear = true; }
      if (!game || !active) return;
      const view = render.view, cam = render.camera;
      clear = false;
      // ---- intro pin over your car ----
      if (view.intro > 0.04) {
        const p = project(view.px, 2.2, view.pz);
        if (p.ok) {
          const a = clamp(view.intro * 1.6, 0, 1), bob = Math.sin(now / 160) * 4 * dpr;
          const y = p.y - 26 * dpr + bob;
          ctx.globalAlpha = a; ctx.fillStyle = rgba(GOLD, 0.9);
          ctx.fillRect(p.x - 1.5 * dpr, y + 10 * dpr, 3 * dpr, 16 * dpr);
          ctx.globalAlpha = 1;
          chevron(p.x, y + 4 * dpr, Math.PI, 10 * dpr, GOLD, a);
          label(you, p.x, y - 14 * dpr, 22, rgba(GOLD, 1), a);
        }
        return;
      }
      if (game.state !== "playing") return;
      const blinkOn = !reduced;
      // camera forward on the ground plane -> screen bearing of each cop around your car
      cam.getWorldDirection(F);
      let fl = Math.hypot(F.x, F.z) || 1; const fx = F.x / fl, fz = F.z / fl;
      const hero = project(view.px, 0.9, view.pz);
      const hx = hero.ok ? hero.x : W / 2, hy = hero.ok ? hero.y : H * 0.62;
      const cops = [];
      for (const c of game.police) {
        if (c.wreck) continue;
        const dx = c.x - view.px, dz = c.y - view.pz, d = Math.hypot(dx, dz);
        if (d > 340) continue;
        cops.push({ c, dx, dz, d });
      }
      cops.sort((a, b) => a.d - b.d);
      const ax = Math.cos(view.a), az = Math.sin(view.a);
      let glows = 0, tailCop = null;
      const top = 150 * dpr, bottom = H - 178 * dpr, side = 62 * dpr;
      const rx = Math.min(W * 0.34, 190 * dpr), ry = Math.min(H * 0.21, 170 * dpr);
      ctx.save();
      for (let i = 0; i < cops.length && i < 6; i++) {
        const { c, dx, dz, d } = cops[i];
        const b = Math.atan2(-fz * dx + fx * dz, fx * dx + fz * dz);
        const k = clamp(1 - (d - 10) / 150, 0, 1);
        const phase = blinkOn ? (Math.floor(now / 170) + c.id) % 2 : 0;
        const col = phase ? RED : BLUE;
        const p = project(c.x, 1.7, c.y);
        const onScreen = p.ok && p.x > W * 0.03 && p.x < W * 0.97 && p.y > H * 0.06 && p.y < H * 0.95;
        const behindCar = (dx * ax + dz * az) / (d || 1);
        if (!tailCop && behindCar < -0.55 && d < 24) tailCop = cops[i];
        // siren light from the edge it is coming from
        if (glows < 2 && d < 90 && (!onScreen || d < 26)) {
          ctx.globalCompositeOperation = "lighter";
          edgeGlow(b, Math.pow(1 - d / 90, 1.25) * (onScreen ? 0.55 : 1), reduced ? [190, 90, 255] : col);
          ctx.globalCompositeOperation = "source-over";
          glows++;
        }
        if (onScreen) {
          // marker over a visible cop
          const s = (6 + 5 * k) * dpr, y = p.y - 16 * dpr;
          chevron(p.x, y, Math.PI, s, col, 0.95);
          if (c.mode === 1 && d < 120) {
            // lock-on brackets
            const r = s * 2.1, L = s * 0.9;
            ctx.strokeStyle = rgba(col, 0.95); ctx.lineWidth = 2 * dpr;
            ctx.beginPath();
            for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(p.x + sx * r, y + sy * r - sy * L); ctx.lineTo(p.x + sx * r, y + sy * r); ctx.lineTo(p.x + sx * r - sx * L, y + sy * r); }
            ctx.stroke();
          }
          if (d > 32) label(`${Math.round(d)}m`, p.x, y - s - 10 * dpr, 15, "#fff4e6", 0.9);
          continue;
        }
        // chevron on the ring around your car, pointing at the cop
        let x = hx + Math.sin(b) * rx, y = hy - Math.cos(b) * ry;
        x = clamp(x, side, W - side); y = clamp(y, top, bottom);
        const pulse = blinkOn ? 0.7 + 0.3 * Math.sin(now * (0.006 + 0.022 * k)) : 0.9;
        const size = (11 + 9 * k) * dpr;
        chevron(x, y, b, size, col, pulse);
        label(`${Math.round(d)}m`, x - Math.sin(b) * (size + 10 * dpr), y + Math.cos(b) * (size + 10 * dpr), 15 + 3 * k, "#fff4e6", 0.95);
      }
      ctx.restore();
      // ---- tail warning ----
      if (tailCop) {
        const on = !blinkOn || Math.floor(now / 230) % 2 === 0;
        const y = H - 138 * dpr;
        const text = `!! ${tail} !!`;
        ctx.save();
        ctx.font = `400 ${Math.round(22 * dpr)}px ${FONT}`;
        const w = ctx.measureText(text).width + 28 * dpr, h = 30 * dpr;
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = INK; ctx.fillRect(W / 2 - w / 2 - 2 * dpr, y - h / 2 - 2 * dpr, w + 4 * dpr, h + 4 * dpr);
        ctx.fillStyle = on ? "rgba(200,20,60,0.95)" : "rgba(30,60,160,0.95)"; ctx.fillRect(W / 2 - w / 2, y - h / 2, w, h);
        ctx.restore();
        label(text, W / 2, y + 1 * dpr, 22, "#fff4e6", 1);
      }
    },
  };
}
