/* Hand-drawn comic VFX layer (2D canvas over the 3D view): graffiti sparks, ink-outlined smoke
   puffs, starbursts and speed streaks in the spirit of street-art racing games. Visual only. */
const INK = "#1b0b2b", GOLD = "#f6d36b", CREAM = "#fff4e6", PINK = "#ff5d95", CYAN = "#3dd8e7";

export function createComic(canvas) {
  const ctx = canvas.getContext("2d");
  const items = [];
  let W = 1, H = 1, S = 1, dirty = false;
  const rand = (a, b) => a + Math.random() * (b - a);
  function add(it) { if (items.length > 70) items.shift(); items.push(it); }
  function jagged(x, y, ang, len, kinks) {
    const pts = [[x, y]];
    let cx = x, cy = y;
    for (let k = 1; k <= kinks; k++) {
      const seg = len / kinks, side = (k % 2 ? 1 : -1) * rand(0.35, 0.8);
      cx += Math.cos(ang + side) * seg; cy += Math.sin(ang + side) * seg;
      pts.push([cx, cy]);
    }
    return pts;
  }
  const api = {
    resize(cssW, cssH) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
      if (w !== canvas.width || h !== canvas.height) { canvas.width = w; canvas.height = h; }
      W = w; H = h; S = dpr * Math.max(0.8, Math.min(1.4, cssW / 400));
    },
    clear() { items.length = 0; ctx.clearRect(0, 0, W, H); },
    /** Drift sparks + smoke from a rear wheel at normalised screen coords (0..1, y down). */
    drift(nx, ny, dirx, diry, k) {
      const x = nx * W, y = ny * H, ang = Math.atan2(diry, dirx);
      if (Math.random() < 0.7 * k) add({ type: "bolt", pts: jagged(x, y, ang + rand(-0.7, 0.7), rand(40, 84) * S, 3 + (Math.random() * 3) | 0), age: 0, life: rand(0.2, 0.34), color: Math.random() < 0.8 ? GOLD : CREAM });
      if (Math.random() < 0.4 * k) add({ type: "cloud", x: x + rand(-10, 10) * S, y: y + rand(-8, 4) * S, vx: dirx * 60 * S, vy: diry * 60 * S - 24 * S, r: rand(16, 26) * S, age: 0, life: rand(0.5, 0.8), seed: Math.random() * 9 });
    },
    burst(nx, ny, kind = "near", mult = 1) {
      const x = nx * W, y = ny * H;
      const color = kind === "hit" ? CREAM : mult >= 3 ? PINK : kind === "dodge" ? CYAN : GOLD;
      add({ type: "star", x, y, r: (kind === "hit" ? 34 : 26 + mult * 6) * S, spikes: kind === "hit" ? 9 : 12, age: 0, life: 0.38, color, rot: Math.random() * 6 });
      const n = kind === "hit" ? 7 : 4 + mult;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
        add({ type: "bolt", pts: jagged(x + Math.cos(a) * 18 * S, y + Math.sin(a) * 18 * S, a, rand(30, 60) * S, 3), age: 0, life: rand(0.22, 0.35), color: kind === "hit" ? GOLD : color });
      }
    },
    /** Graffiti swoosh trailing off a tail light at top speed. */
    tail(nx, ny, dx, dy) {
      if (Math.random() > 0.5) return;
      const x = nx * W, y = ny * H, len = Math.hypot(dx * W, dy * H) || 1, ux = (dx * W) / len, uy = (dy * H) / len;
      const pts = [];
      for (let k = 0; k <= 5; k++) { const t = k / 5, wob = Math.sin(k * 1.9 + Math.random()) * 7 * S * t; pts.push([x + ux * t * 110 * S - uy * wob, y + uy * t * 110 * S + ux * wob]); }
      add({ type: "bolt", pts, age: 0, life: 0.22, color: Math.random() < 0.5 ? CYAN : PINK });
    },
    /** Big sprayed word for a state change (e.g. a perfect drift). */
    tag(nx, ny, text) {
      add({ type: "word", x: nx * W, y: ny * H, text, age: 0, life: 0.9, rot: (Math.random() - 0.5) * 0.3 });
      add({ type: "star", x: nx * W, y: ny * H, r: 46 * S, spikes: 14, age: 0, life: 0.45, color: PINK, rot: Math.random() * 6 });
    },
    speedLines(k) {
      if (Math.random() > k * 0.6) return;
      const a = rand(0, Math.PI * 2), r0 = Math.max(W, H) * rand(0.42, 0.52);
      const cx = W * 0.5, cy = H * 0.6;
      add({ type: "line", x0: cx + Math.cos(a) * r0, y0: cy + Math.sin(a) * r0, x1: cx + Math.cos(a) * (r0 + rand(60, 140) * S), y1: cy + Math.sin(a) * (r0 + rand(60, 140) * S), age: 0, life: 0.16 });
    },
    frame(dt) {
      // Skip all canvas work while nothing is on screen (saves fill-rate on weak phones).
      if (!items.length) { if (dirty) { ctx.clearRect(0, 0, W, H); dirty = false; } return; }
      dirty = true;
      ctx.clearRect(0, 0, W, H);
      ctx.lineJoin = "miter"; ctx.lineCap = "square";
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.age += dt;
        if (it.age >= it.life) { items.splice(i, 1); continue; }
        const t = it.age / it.life;
        if (it.type === "bolt") {
          const grow = Math.min(1, t * 4), n = Math.max(2, Math.ceil(it.pts.length * grow));
          ctx.beginPath();
          ctx.moveTo(it.pts[0][0], it.pts[0][1]);
          for (let k = 1; k < n; k++) ctx.lineTo(it.pts[k][0], it.pts[k][1]);
          ctx.globalAlpha = 1 - Math.max(0, t - 0.6) / 0.4;
          ctx.strokeStyle = INK; ctx.lineWidth = 8 * S; ctx.stroke();
          ctx.strokeStyle = it.color; ctx.lineWidth = 4 * S; ctx.stroke();
        } else if (it.type === "cloud") {
          it.x += it.vx * dt; it.y += it.vy * dt; it.vx *= 0.94; it.vy *= 0.94;
          const r = it.r * (0.6 + t * 0.9);
          ctx.globalAlpha = 0.92 * (1 - t);
          ctx.beginPath();
          for (let k = 0; k < 4; k++) {
            const a = it.seed + k * 1.7, d = r * 0.55;
            ctx.moveTo(it.x + Math.cos(a) * d + r * (0.55 + 0.1 * k), it.y + Math.sin(a) * d * 0.6);
            ctx.arc(it.x + Math.cos(a) * d, it.y + Math.sin(a) * d * 0.6, r * (0.55 + 0.1 * k), 0, Math.PI * 2);
          }
          ctx.fillStyle = "#efe2f2"; ctx.fill();
          ctx.strokeStyle = INK; ctx.lineWidth = 3 * S; ctx.stroke();
          // halftone dots on the shaded underside
          ctx.fillStyle = "rgba(141,84,233,.55)";
          const step = 4.5 * S;
          for (let yy = it.y; yy < it.y + r * 0.7; yy += step) for (let xx = it.x - r; xx < it.x + r; xx += step) {
            const dd = Math.hypot(xx - it.x, (yy - it.y) * 1.4);
            if (dd < r * 0.85) { ctx.beginPath(); ctx.arc(xx, yy, step * 0.22 * (yy - it.y) / (r * 0.7) + 0.4, 0, 6.3); ctx.fill(); }
          }
        } else if (it.type === "star") {
          const r = it.r * (t < 0.25 ? t / 0.25 : 1) * (1 + t * 0.2);
          ctx.globalAlpha = 1 - Math.max(0, t - 0.55) / 0.45;
          ctx.beginPath();
          for (let k = 0; k <= it.spikes * 2; k++) {
            const a = it.rot + (k / (it.spikes * 2)) * Math.PI * 2, rr = k % 2 ? r * 0.45 : r;
            ctx.lineTo(it.x + Math.cos(a) * rr, it.y + Math.sin(a) * rr);
          }
          ctx.closePath();
          ctx.lineWidth = 6 * S; ctx.strokeStyle = INK; ctx.stroke();
          ctx.fillStyle = it.color; ctx.fill();
        } else if (it.type === "word") {
          const sc = t < 0.15 ? 0.6 + t / 0.15 * 0.6 : 1.2 - Math.min(0.2, (t - 0.15));
          ctx.save(); ctx.translate(it.x, it.y - t * 30 * S); ctx.rotate(it.rot); ctx.scale(sc, sc);
          ctx.globalAlpha = 1 - Math.max(0, t - 0.7) / 0.3;
          ctx.font = `400 ${38 * S}px "Jersey 10", monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.lineWidth = 9 * S; ctx.strokeStyle = INK; ctx.strokeText(it.text, 0, 0);
          ctx.fillStyle = GOLD; ctx.fillText(it.text, 0, 0);
          ctx.restore();
        } else if (it.type === "line") {
          ctx.globalAlpha = 0.55 * (1 - t);
          ctx.beginPath(); ctx.moveTo(it.x0, it.y0); ctx.lineTo(it.x1, it.y1);
          ctx.strokeStyle = CREAM; ctx.lineWidth = 2.5 * S; ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    },
  };
  return api;
}
