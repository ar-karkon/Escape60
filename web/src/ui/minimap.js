/* Heading-up minimap: open streets, dead ends, police, roadblocks and traffic around the player.
   Reads the same street network as the simulation, so what it shows is exactly what you can drive. */
import { BLOCK, SEG, STUB } from "../map.js";

export function createMinimap(canvas) {
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1;
  const RANGE = 1250; // simulation units from the centre to the edge
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (w && h && (w !== W || h !== H)) { canvas.width = W = w; canvas.height = H = h; }
  }
  return {
    draw(game, net, t) {
      resize();
      if (!W || !game || !net) return;
      const p = game.player, k = (Math.min(W, H) / 2 - 4 * dpr) / RANGE;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.beginPath();
      ctx.rect(2 * dpr, 2 * dpr, W - 4 * dpr, H - 4 * dpr);
      ctx.clip();
      ctx.fillStyle = "rgba(20,10,38,0.86)";
      ctx.fillRect(0, 0, W, H);
      // world -> minimap: translate to the player, rotate so the heading points up
      ctx.translate(W / 2, H * 0.6);
      ctx.rotate(-Math.PI / 2 - p.angle);
      ctx.scale(k, k);
      ctx.translate(-p.x, -p.y);
      const ci = Math.round(p.x / BLOCK), cj = Math.round(p.y / BLOCK), R = 4;
      ctx.lineCap = "square";
      // city blocks (dark) are the background; draw streets on top
      for (let pass = 0; pass < 2; pass++) {
        for (let i = ci - R; i <= ci + R; i++) for (let j = cj - R; j <= cj + R; j++) {
          for (const axis of [0, 1]) {
            const st = net.seg(axis, i, j);
            if (st === SEG.NONE) continue;
            const x0 = i * BLOCK, y0 = j * BLOCK;
            const x1 = axis === 0 ? x0 : x0 + BLOCK, y1 = axis === 0 ? y0 + BLOCK : y0;
            let a = 0, b = 1;
            if (st === SEG.STUB_START) b = STUB;
            if (st === SEG.STUB_END) a = 1 - STUB;
            const avenue = axis === 0 ? ((i % 3) + 3) % 3 === 0 : ((j % 3) + 3) % 3 === 0;
            ctx.beginPath();
            ctx.moveTo(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a);
            ctx.lineTo(x0 + (x1 - x0) * b, y0 + (y1 - y0) * b);
            if (pass === 0) { ctx.strokeStyle = "#0e0618"; ctx.lineWidth = (avenue ? 210 : 170) + 70; }
            else { ctx.strokeStyle = avenue ? "#e8d6f6" : st === SEG.FULL ? "#a98fc8" : "#7d6a99"; ctx.lineWidth = avenue ? 150 : 115; }
            ctx.stroke();
            if (pass === 1 && st !== SEG.FULL) {
              // dead-end cap
              const e = st === SEG.STUB_START ? b : a;
              const ex = x0 + (x1 - x0) * e, ey = y0 + (y1 - y0) * e;
              ctx.fillStyle = "#ff416a";
              if (axis === 0) ctx.fillRect(ex - 120, ey - 30, 240, 60); else ctx.fillRect(ex - 30, ey - 120, 60, 240);
            }
          }
        }
      }
      // dead-end junctions (only one street reaches them)
      ctx.fillStyle = "#ff416a";
      for (let i = ci - R; i <= ci + R; i++) for (let j = cj - R; j <= cj + R; j++) {
        if (net.degree(i, j) === 1) { ctx.beginPath(); ctx.arc(i * BLOCK, j * BLOCK, 95, 0, Math.PI * 2); ctx.fill(); }
      }
      // roadblocks
      for (const m of game.marks) {
        ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.angle || 0);
        ctx.fillStyle = "#ffb000"; ctx.fillRect(-30, -95, 60, 190);
        ctx.restore();
      }
      // traffic
      ctx.fillStyle = "rgba(255,244,230,0.75)";
      for (const c of game.traffic) { ctx.beginPath(); ctx.arc(c.x, c.y, 34, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      // police (clamped to the edge when outside the map)
      const cx = W / 2, cy = H * 0.6, rot = -Math.PI / 2 - p.angle, cs = Math.cos(rot), sn = Math.sin(rot);
      const blink = Math.floor(t / 180) % 2;
      for (const c of game.police) {
        const dx = c.x - p.x, dy = c.y - p.y;
        let sx = (dx * cs - dy * sn) * k, sy = (dx * sn + dy * cs) * k;
        const lim = Math.min(W, H) / 2 - 9 * dpr, m = Math.max(Math.abs(sx) / lim, Math.abs(sy) / (lim * 0.95), 1);
        sx /= m; sy /= m;
        ctx.fillStyle = "#1b0b2b";
        ctx.beginPath(); ctx.arc(cx + sx, cy + sy, 6.5 * dpr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = (blink + c.id) % 2 ? "#ff416a" : "#3f98ff";
        ctx.beginPath(); ctx.arc(cx + sx, cy + sy, (m > 1 ? 3.5 : 5) * dpr, 0, Math.PI * 2); ctx.fill();
      }
      // the player
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = "#1b0b2b";
      ctx.beginPath(); ctx.moveTo(0, -11 * dpr); ctx.lineTo(8 * dpr, 8 * dpr); ctx.lineTo(0, 4 * dpr); ctx.lineTo(-8 * dpr, 8 * dpr); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffe37c";
      ctx.beginPath(); ctx.moveTo(0, -8 * dpr); ctx.lineTo(5.5 * dpr, 5.5 * dpr); ctx.lineTo(0, 2.5 * dpr); ctx.lineTo(-5.5 * dpr, 5.5 * dpr); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.restore();
    },
  };
}
