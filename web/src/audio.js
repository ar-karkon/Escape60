/* Original synthesized audio: no samples, no external files. Off by default; enabled from settings. */
const BASS = [55, 55, 65.41, 49, 55, 55, 73.42, 65.41];
const ARP = [440, 523.25, 659.25, 783.99, 659.25, 523.25, 587.33, 698.46];
export class SoundEngine {
  constructor() { this.enabled = false; this.ctx = null; this.loops = null; this.paused = false; }
  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled && typeof AudioContext !== 'undefined') {
      this.ctx ??= new AudioContext();
      this.master ??= (() => { const g = this.ctx.createGain(); g.gain.value = 0.8; g.connect(this.ctx.destination); return g; })();
      this.ctx.resume?.();
    }
    if (!this.enabled) this.stopLoops();
    return this.enabled;
  }
  get on() { return this.enabled && this.ctx && !this.paused; }
  tone(freq = 400, length = 0.09, type = 'triangle', gain = 0.05, slide = 0.7, when = 0) {
    if (!this.on) return;
    try {
      const t = this.ctx.currentTime + when, osc = this.ctx.createOscillator(), g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + length);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + length);
      osc.connect(g); g.connect(this.master);
      osc.start(t); osc.stop(t + length + 0.02);
    } catch {}
  }
  beep(freq, length, type, gain) { this.tone(freq, length, type, gain); }
  noise(length = 0.2, gain = 0.05, freq = 1200) {
    if (!this.on) return;
    try {
      const n = Math.floor(this.ctx.sampleRate * length), buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
      src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = gain;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
    } catch {}
  }
  ensureLoops() {
    if (!this.on || this.loops) return;
    try {
      const c = this.ctx;
      const engine = c.createOscillator(), eg = c.createGain(), lp = c.createBiquadFilter();
      engine.type = 'sawtooth'; engine.frequency.value = 50; lp.type = 'lowpass'; lp.frequency.value = 420; eg.gain.value = 0;
      engine.connect(lp); lp.connect(eg); eg.connect(this.master); engine.start();
      const siren = c.createOscillator(), sg = c.createGain();
      siren.type = 'square'; siren.frequency.value = 700; sg.gain.value = 0;
      siren.connect(sg); sg.connect(this.master); siren.start();
      const n = c.sampleRate, buf = c.createBuffer(1, n, n), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const squeal = c.createBufferSource(), bf = c.createBiquadFilter(), qg = c.createGain();
      squeal.buffer = buf; squeal.loop = true; bf.type = 'bandpass'; bf.frequency.value = 2400; bf.Q.value = 6; qg.gain.value = 0;
      squeal.connect(bf); bf.connect(qg); qg.connect(this.master); squeal.start();
      this.loops = { engine, eg, siren, sg, qg };
    } catch {}
  }
  stopLoops() {
    if (!this.loops) return;
    try { this.loops.engine.stop(); this.loops.siren.stop(); } catch {}
    this.loops = null;
  }
  engine(active, speed, drift, police) {
    if (!this.on) { if (this.loops && !this.enabled) this.stopLoops(); return; }
    this.ensureLoops();
    const L = this.loops;
    if (!L) return;
    const t = this.ctx.currentTime;
    L.engine.frequency.setTargetAtTime(active ? 46 + speed * 38 + drift * 10 : 40, t, 0.08);
    L.eg.gain.setTargetAtTime(active ? 0.045 : 0, t, 0.1);
    L.qg.gain.setTargetAtTime(active && drift > 0.5 ? 0.018 * drift : 0, t, 0.05);
    const wail = 650 + 250 * Math.sin(t * 5.5);
    L.siren.frequency.setTargetAtTime(wail, t, 0.03);
    L.sg.gain.setTargetAtTime(active ? Math.min(0.012, police * 0.0025) : 0, t, 0.2);
  }
  music(ticks, police) {
    if (!this.on || ticks % 9) return;
    const step = Math.floor(ticks / 9);
    if (step % 2 === 0) this.tone(BASS[(step >> 1) % 8], 0.16, 'sawtooth', 0.03, 0.98);
    if (police >= 2 || step % 2) this.tone(ARP[step % 8] * (police >= 4 ? 1 : 0.5), 0.09, 'square', 0.012, 0.99);
    if (step % 4 === 2) this.noise(0.05, 0.03, 6000);
    if (step % 8 === 0) this.tone(120, 0.12, 'sine', 0.06, 0.4);
  }
  start() { this.tone(520, 0.1, 'square', 0.03); }
  near() { this.tone(880, 0.06, 'square', 0.03, 1.4); this.tone(1320, 0.08, 'square', 0.02, 1.2, 0.05); }
  hit() { this.noise(0.28, 0.12, 500); this.tone(110, 0.25, 'sawtooth', 0.06, 0.5); }
  scrape() { this.noise(0.08, 0.04, 3000); }
  alarm() { for (let i = 0; i < 3; i++) this.tone(980, 0.08, 'square', 0.025, 1, i * 0.14); }
  siren() { this.tone(700, 0.25, 'square', 0.02, 1.4); }
  ui() { this.tone(660, 0.04, 'square', 0.02, 1.2); }
  end(win) {
    if (win) [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.22, 'square', 0.03, 1, i * 0.11));
    else { this.tone(196, 0.35, 'sawtooth', 0.05, 0.5); this.tone(147, 0.5, 'sawtooth', 0.04, 0.5, 0.2); }
    if (this.loops) { const t = this.ctx.currentTime; this.loops.eg.gain.setTargetAtTime(0, t, 0.1); this.loops.qg.gain.setTargetAtTime(0, t, 0.05); this.loops.sg.gain.setTargetAtTime(0, t, 0.3); }
  }
  pause(p) { this.paused = p; if (p && this.loops) { const t = this.ctx.currentTime; for (const g of [this.loops.eg, this.loops.qg, this.loops.sg]) g.gain.setTargetAtTime(0, t, 0.05); } }
}
