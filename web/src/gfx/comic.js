/* 2D overlay for street-art speed feel: speed lines that streak in from the screen edges at high speed
   and under nitro, and graffiti "wings" behind the car while boosting. Visual only, cheap when idle. */
export function createComic(canvas) {
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1, lines = [], wingK = 0, wingX = 0.5, wingY = 0.7, wingS = 0.2, wingCol = [1, 0.2, 0.4], idle = true;
  function resize(w, h) {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const cw = Math.round(w * dpr), ch = Math.round(h * dpr);
    if (cw !== W || ch !== H) { canvas.width = W = cw; canvas.height = H = ch; }
  }
  return {
    resize,
    clear() { lines = []; wingK = 0; ctx.clearRect(0, 0, W, H); },
    speedLines(k, style) {
      if (k <= 0.02) return;
      const n = Math.random() < k * 0.9 ? 1 + Math.floor(k * 3) : 0;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        lines.push({ a, r: 0.55 + Math.random() * 0.2, len: 0.1 + Math.random() * 0.22 * k, life: 0.2 + Math.random() * 0.15, age: 0, w: 1 + Math.random() * 2.5 * k, tint: style === "toxic" ? "#b6ff2e" : style === "purple" ? "#e07dff" : style === "inferno" ? "#ffb04a" : "#ffffff" });
      }
    },
    wings(x, y, s, k, col) { wingK = Math.max(wingK, k); wingX = x; wingY = y; wingS = s; wingCol = col; },
    frame(dt) {
      if (!lines.length && wingK < 0.01) { if (!idle) { ctx.clearRect(0, 0, W, H); idle = true; } return; }
      idle = false;
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H * 0.56, R = Math.hypot(W, H) / 2;
      ctx.lineCap = "round";
      lines = lines.filter((l) => (l.age += dt) < l.life);
      for (const l of lines) {
        const t = l.age / l.life, r0 = R * (l.r + (1 - l.r) * 0.0) * (1 - t * 0.25), r1 = r0 - R * l.len;
        ctx.strokeStyle = l.tint; ctx.globalAlpha = 0.55 * (1 - t);
        ctx.lineWidth = l.w * dpr;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(l.a) * r0, cy + Math.sin(l.a) * r0 * 0.9);
        ctx.lineTo(cx + Math.cos(l.a) * r1, cy + Math.sin(l.a) * r1 * 0.9);
        ctx.stroke();
      }
      if (wingK > 0.01) {
        // graffiti wings sweeping out from both sides of the car while boosting
        const c = `rgb(${Math.round(Math.min(1, wingCol[0]) * 255)},${Math.round(Math.min(1, wingCol[1]) * 255)},${Math.round(Math.min(1, wingCol[2]) * 255)})`;
        const y = wingY * H, span = wingS * W;
        for (const [sx, sd] of [[wingX - wingS * 0.5, -1], [wingX + wingS * 0.5, 1]]) {
          const x = sx * W, L = span * (0.85 + Math.random() * 0.06) * wingK;
          ctx.globalAlpha = 0.7 * wingK;
          for (const pass of [0, 1]) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.bezierCurveTo(x + sd * L * 0.35, y - L * 0.55, x + sd * L * 0.85, y - L * 0.5, x + sd * L, y - L * 0.95);
            ctx.bezierCurveTo(x + sd * L * 0.8, y - L * 0.35, x + sd * L * 0.55, y - L * 0.1, x + sd * L * 0.62, y + L * 0.08);
            ctx.bezierCurveTo(x + sd * L * 0.35, y - L * 0.05, x + sd * L * 0.15, y + L * 0.05, x, y);
            if (pass === 0) { ctx.lineWidth = 7 * dpr; ctx.strokeStyle = "#14121c"; ctx.lineJoin = "round"; ctx.stroke(); }
            else { ctx.fillStyle = c; ctx.fill(); }
          }
          ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 2.5 * dpr;
          for (let k = 0; k < 3; k++) { const f = 0.35 + k * 0.2; ctx.beginPath(); ctx.moveTo(x + sd * L * f * 0.5, y - L * f * 0.3); ctx.lineTo(x + sd * L * f, y - L * f * 0.62); ctx.stroke(); }
        }
        wingK *= Math.exp(-dt * 7);
      }
      ctx.globalAlpha = 1;
    },
  };
}
