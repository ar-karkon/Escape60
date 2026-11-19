/* Heading-up round minimap. The whole road network is drawn once into an offscreen canvas from the
   shared map (so it shows exactly what you can drive), then cropped and rotated around the player
   each frame, with police, roadblocks and the green pit stops on top. */
import { BOUNDS, edges, stations, water, pads } from "../map.js";

const PX = 1.6; // offscreen pixels per metre
export function createMinimap(canvas) {
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1, base = null;
  const RANGE = 230; // metres from the centre to the edge
  function build() {
    const w = Math.ceil((BOUNDS.maxX - BOUNDS.minX) * PX), h = Math.ceil((BOUNDS.maxY - BOUNDS.minY) * PX);
    base = document.createElement("canvas"); base.width = w; base.height = h;
    const g = base.getContext("2d");
    g.fillStyle = "#1a2030"; g.fillRect(0, 0, w, h);
    // water
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
      if (water(BOUNDS.minX + x / PX, BOUNDS.minY + y / PX) > 0) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const o = ((y + dy) * w + x + dx) * 4; d[o] = 16; d[o + 1] = 52; d[o + 2] = 84; d[o + 3] = 255; }
    }
    g.putImageData(img, 0, 0);
    g.setTransform(PX, 0, 0, PX, -BOUNDS.minX * PX, -BOUNDS.minY * PX);
    g.lineCap = "round"; g.lineJoin = "round";
    for (const pass of [0, 1]) {
      for (const e of edges) {
        g.beginPath();
        const p = e.pts;
        g.moveTo(p[0], p[1]);
        for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
        g.strokeStyle = pass ? (e.k.id === 0 ? "#f2c14e" : e.k.lanes >= 2 ? "#e8ecf4" : "#aeb6c6") : "#0b0e16";
        g.lineWidth = pass ? e.k.hw * 1.5 : e.k.hw * 1.5 + 7;
        g.stroke();
      }
    }
    for (const p of pads) {
      g.save(); g.translate(p.x, p.y); g.rotate(Math.atan2(p.sa, p.ca));
      g.fillStyle = p.kind === "station" ? "#2ee6a0" : "#aeb6c6";
      g.beginPath(); g.roundRect(-p.hx, -p.hy, p.hx * 2, p.hy * 2, p.r); g.fill();
      g.restore();
    }
  }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (w && h && (w !== W || h !== H)) { canvas.width = W = w; canvas.height = H = h; }
  }
  return {
    draw(game, t) {
      resize();
      if (!W || !game) return;
      if (!base) build();
      const p = game.player, k = (Math.min(W, H) / 2) / RANGE;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = "#1a2030"; ctx.fillRect(0, 0, W, H);
      ctx.translate(W / 2, H * 0.6);
      ctx.rotate(-Math.PI / 2 - p.a);
      ctx.scale(k, k);
      ctx.translate(-p.x, -p.y);
      ctx.drawImage(base, BOUNDS.minX, BOUNDS.minY, base.width / PX, base.height / PX);
      // roadblocks
      for (const b of game.blocks) { ctx.fillStyle = "#ffb000"; for (const u of b.units) { ctx.beginPath(); ctx.arc(u.x, u.y, 3.2, 0, Math.PI * 2); ctx.fill(); } }
      // traffic
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      for (const c of game.traffic) { ctx.beginPath(); ctx.arc(c.x, c.y, 3.2, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      // stations + police (clamped to the rim when far away)
      const cx = W / 2, cy = H * 0.6, rot = -Math.PI / 2 - p.a, cs = Math.cos(rot), sn = Math.sin(rot);
      const toScreen = (x, y) => { const dx = x - p.x, dy = y - p.y; let sx = (dx * cs - dy * sn) * k, sy = (dx * sn + dy * cs) * k; const lim = W / 2 - 8 * dpr, ox = sx + cx - W / 2, oy = sy + cy - H / 2, m = Math.max(1, Math.hypot(ox, oy) / lim); return [W / 2 + ox / m, H / 2 + oy / m, m > 1]; };
      for (const s of stations) {
        const [x, y, edge] = toScreen(s.x, s.y);
        ctx.fillStyle = "#052216"; ctx.beginPath(); ctx.arc(x, y, 7 * dpr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = game.repairs > 0 ? "#2ee6a0" : "#5a6070"; ctx.beginPath(); ctx.arc(x, y, (edge ? 4 : 5.5) * dpr, 0, Math.PI * 2); ctx.fill();
        if (!edge) { ctx.fillStyle = "#052216"; ctx.font = `900 ${8 * dpr}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("+", x, y + 0.5); }
      }
      const blink = Math.floor(t / 160) % 2;
      for (const c of game.police) {
        if (c.wreck) continue;
        const [x, y, edge] = toScreen(c.x, c.y);
        ctx.fillStyle = "#0b0e16"; ctx.beginPath(); ctx.arc(x, y, 6 * dpr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = (blink + c.id) % 2 ? "#ff3b4e" : "#3d8bff"; ctx.beginPath(); ctx.arc(x, y, (edge ? 3.5 : 4.5) * dpr, 0, Math.PI * 2); ctx.fill();
      }
      // player arrow
      ctx.save(); ctx.translate(cx, cy);
      ctx.fillStyle = "#0b0e16"; ctx.beginPath(); ctx.moveTo(0, -10 * dpr); ctx.lineTo(7.5 * dpr, 7.5 * dpr); ctx.lineTo(0, 4 * dpr); ctx.lineTo(-7.5 * dpr, 7.5 * dpr); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ff2d6f"; ctx.beginPath(); ctx.moveTo(0, -7 * dpr); ctx.lineTo(5 * dpr, 5 * dpr); ctx.lineTo(0, 2.5 * dpr); ctx.lineTo(-5 * dpr, 5 * dpr); ctx.closePath(); ctx.fill();
      ctx.restore();
    },
  };
}
