/* Escape 60 audio: licensed recordings (see web/assets/audio/CREDITS.md) mixed with Web Audio.
   Music streams through <audio> elements (no huge decoded buffers on phones); SFX and loops are
   small decoded buffers. Nothing plays until the first user gesture (browser autoplay rules). */
const BASE = new URL('./assets/audio/', document.baseURI).href;
const ONESHOTS = ['crash', 'horn', 'whoosh', 'combo', 'levelup', 'coin', 'beep', 'go', 'busted', 'win', 'click', 'scrape', 'near'];
const LOOPS = { engine: 'engine.wav', squeal: 'squeal.wav', wail: 'siren-wail.wav', yelp: 'siren-yelp.wav', heli: 'heli.wav' };
const TRACKS = { menu: ['music-menu.mp3'], chase: ['music-chase-1.mp3', 'music-chase-2.mp3', 'music-chase-3.mp3'], results: ['music-results.mp3'] };
const PREF_KEY = 'escape60-audio-v1';
/* Gear model for the engine note (visual gear shown in the HUD too): km/h boundaries per gear. */
export const GEARS = [0, 48, 88, 128, 172, 222, 999];
export function gearOf(kmh) { let g = 1; while (g < GEARS.length - 1 && kmh >= GEARS[g]) g++; const lo = GEARS[g - 1], hi = GEARS[g] === 999 ? 330 : GEARS[g]; return { gear: g, rpm: Math.max(0, Math.min(1, (kmh - lo) / (hi - lo))) }; }

export class AudioEngine {
  constructor() {
    let prefs = {};
    try { prefs = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch {}
    this.musicOn = prefs.music !== false;
    this.sfxOn = prefs.sfx !== false;
    this.ctx = null; this.buffers = new Map(); this.loops = {}; this.tracks = new Map();
    this.mode = 'menu'; this.current = null; this.paused = false; this.chaseIndex = Number(prefs.chase || 0);
    this.duck = 1;
  }
  savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify({ music: this.musicOn, sfx: this.sfxOn, chase: this.chaseIndex })); } catch {} }
  /** Call from a user gesture. Safe to call repeatedly. */
  unlock() {
    if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return;
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = 0.9;
      this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 3;
      this.master.connect(this.comp); this.comp.connect(c.destination);
      this.musicBus = c.createGain(); this.musicBus.gain.value = this.musicOn ? 0.55 : 0;
      this.musicFilter = c.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 20000;
      this.musicBus.connect(this.musicFilter); this.musicFilter.connect(this.master);
      this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.sfxOn ? 1 : 0;
      this.sfxBus.connect(this.master);
      this.setupNoise();
      this.loadAll();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    this.setMode(this.mode, true);
  }
  async loadAll() {
    const load = async (name, file) => {
      try {
        const res = await fetch(BASE + file);
        if (!res.ok) return;
        const data = await res.arrayBuffer();
        const buf = await new Promise((ok, bad) => this.ctx.decodeAudioData(data, ok, bad));
        this.buffers.set(name, buf);
        if (LOOPS[name]) this.startLoop(name);
      } catch {}
    };
    await Promise.all([...ONESHOTS.map((n) => load(n, n + '.mp3')), ...Object.entries(LOOPS).map(([n, f]) => load(n, f))]);
  }
  startLoop(name) {
    const buf = this.buffers.get(name);
    if (!buf || this.loops[name]) return;
    const c = this.ctx, src = c.createBufferSource(), g = c.createGain(), pan = c.createStereoPanner ? c.createStereoPanner() : null;
    src.buffer = buf; src.loop = true; g.gain.value = 0;
    src.connect(g);
    if (pan) { g.connect(pan); pan.connect(this.sfxBus); } else g.connect(this.sfxBus);
    src.start();
    this.loops[name] = { src, g, pan };
  }
  /* ---------- music ---------- */
  track(file) {
    let t = this.tracks.get(file);
    if (!t) {
      const el = new Audio(BASE + file);
      el.loop = true; el.preload = 'auto'; el.crossOrigin = 'anonymous';
      const node = this.ctx.createMediaElementSource(el), g = this.ctx.createGain();
      g.gain.value = 0; node.connect(g); g.connect(this.musicBus);
      t = { el, g };
      this.tracks.set(file, t);
    }
    return t;
  }
  setMode(mode, force = false) {
    if (mode === this.mode && !force && this.current) return;
    this.mode = mode;
    if (!this.ctx) return;
    let file = null;
    if (mode === 'chase') { file = TRACKS.chase[this.chaseIndex % TRACKS.chase.length]; }
    else if (TRACKS[mode]) file = TRACKS[mode][0];
    const t0 = this.ctx.currentTime;
    for (const [f, t] of this.tracks) if (f !== file) {
      t.g.gain.setTargetAtTime(0, t0, 0.25);
      setTimeout(() => { if (this.current !== t) t.el.pause(); }, 1500);
    }
    if (!file || !this.musicOn) { this.current = null; return; }
    const t = this.track(file);
    if (mode === 'chase' && this.current !== t) t.el.currentTime = 0;
    t.el.play().catch(() => {});
    t.g.gain.cancelScheduledValues(t0);
    t.g.gain.setTargetAtTime(1, t0, mode === 'chase' ? 0.05 : 0.4);
    this.current = t;
  }
  nextChaseTrack() { this.chaseIndex = (this.chaseIndex + 1) % TRACKS.chase.length; this.savePrefs(); }
  setMusicEnabled(on) {
    this.musicOn = on; this.savePrefs();
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.1);
    if (on) this.setMode(this.mode, true);
    else for (const [, t] of this.tracks) t.el.pause();
  }
  setSfxEnabled(on) {
    this.sfxOn = on; this.savePrefs();
    if (this.ctx) this.sfxBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
  }
  pause(p) {
    this.paused = p;
    if (!this.ctx) return;
    this.musicFilter.frequency.setTargetAtTime(p ? 650 : 20000, this.ctx.currentTime, 0.12);
  }
  /* ---------- sfx ---------- */
  play(name, { gain = 1, rate = 1, pan = 0, delay = 0 } = {}) {
    if (!this.ctx || !this.sfxOn) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    try {
      const c = this.ctx, src = c.createBufferSource(), g = c.createGain();
      src.buffer = buf; src.playbackRate.value = rate; g.gain.value = gain;
      src.connect(g);
      if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.sfxBus); }
      else g.connect(this.sfxBus);
      src.start(c.currentTime + delay);
    } catch {}
  }
  /* ---------- synthesised layers (original, generated in Web Audio) ---------- */
  noiseBuffer(sec, shape = (i, n) => 1) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * shape(i, n);
    return b;
  }
  setupNoise() {
    // continuous wind (speed) and nitro hiss from one looping noise source
    const c = this.ctx, src = c.createBufferSource();
    src.buffer = this.noiseBuffer(2); src.loop = true;
    const wind = c.createBiquadFilter(); wind.type = 'lowpass'; wind.frequency.value = 600;
    const windG = c.createGain(); windG.gain.value = 0;
    const hiss = c.createBiquadFilter(); hiss.type = 'bandpass'; hiss.frequency.value = 1800; hiss.Q.value = 0.8;
    const hissG = c.createGain(); hissG.gain.value = 0;
    src.connect(wind); wind.connect(windG); windG.connect(this.sfxBus);
    src.connect(hiss); hiss.connect(hissG); hissG.connect(this.sfxBus);
    src.start();
    this.wind = { f: wind, g: windG }; this.hiss = { f: hiss, g: hissG };
  }
  explosion(gain = 1) {
    if (!this.ctx || !this.sfxOn) return;
    try {
      const c = this.ctx, t = c.currentTime;
      const src = c.createBufferSource(); src.buffer = this.noiseBuffer(2.8, (i, n) => Math.pow(1 - i / n, 1.6));
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(5200, t); lp.frequency.exponentialRampToValueAtTime(160, t + 2.2);
      const g = c.createGain(); g.gain.setValueAtTime(1.5 * gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 2.8);
      const ws = c.createWaveShaper(); const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 3); } ws.curve = curve;
      src.connect(lp); lp.connect(ws); ws.connect(g); g.connect(this.sfxBus); src.start(t);
      const o = c.createOscillator(), og = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(26, t + 0.9);
      og.gain.setValueAtTime(1.4 * gain, t); og.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
      o.connect(og); og.connect(this.sfxBus); o.start(t); o.stop(t + 1.2);
      for (let k = 0; k < 7; k++) {
        const tk = t + 0.35 + Math.random() * 1.6, cs = c.createBufferSource(); cs.buffer = this.noiseBuffer(0.05, (i, n) => 1 - i / n);
        const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500 + Math.random() * 2500;
        const cg = c.createGain(); cg.gain.value = 0.25 * gain * Math.random();
        cs.connect(hp); hp.connect(cg); cg.connect(this.sfxBus); cs.start(tk);
      }
    } catch {}
  }
  nitroBurst(gain = 0.5) {
    if (!this.ctx || !this.sfxOn) return;
    try {
      const c = this.ctx, t = c.currentTime, src = c.createBufferSource(); src.buffer = this.noiseBuffer(0.7, (i, n) => Math.sin(Math.PI * i / n));
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2; bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(3200, t + 0.5);
      const g = c.createGain(); g.gain.value = gain;
      src.connect(bp); bp.connect(g); g.connect(this.sfxBus); src.start(t);
    } catch {}
  }
  backfire(gain = 0.45) {
    if (!this.ctx || !this.sfxOn) return;
    try {
      const c = this.ctx, t = c.currentTime;
      for (let k = 0; k < 2 + Math.floor(Math.random() * 2); k++) {
        const tk = t + k * (0.06 + Math.random() * 0.05), src = c.createBufferSource(); src.buffer = this.noiseBuffer(0.09, (i, n) => Math.pow(1 - i / n, 3));
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900 + Math.random() * 700;
        const g = c.createGain(); g.gain.value = gain * (1 - k * 0.2);
        src.connect(lp); lp.connect(g); g.connect(this.sfxBus); src.start(tk);
      }
    } catch {}
  }
  repairSound(gain = 0.35) {
    if (!this.ctx || !this.sfxOn) return;
    try {
      const c = this.ctx, t = c.currentTime;
      for (let k = 0; k < 7; k++) { const o = c.createOscillator(), g = c.createGain(), tk = t + k * 0.055; o.type = 'square'; o.frequency.value = 180 + (k % 2) * 40; g.gain.setValueAtTime(gain * 0.25, tk); g.gain.exponentialRampToValueAtTime(0.001, tk + 0.04); o.connect(g); g.connect(this.sfxBus); o.start(tk); o.stop(tk + 0.05); }
      [880, 1175, 1568].forEach((f, k) => { const o = c.createOscillator(), g = c.createGain(), tk = t + 0.42 + k * 0.09; o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(gain, tk); g.gain.exponentialRampToValueAtTime(0.001, tk + 0.45); o.connect(g); g.connect(this.sfxBus); o.start(tk); o.stop(tk + 0.5); });
    } catch {}
  }
  duckMusic(amount = 0.35, ms = 600) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, g = this.musicBus.gain, base = this.musicOn ? 0.55 : 0;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(base * amount, t, 0.02);
    g.setTargetAtTime(base, t + ms / 1000, 0.25);
  }
  /** Per-frame mix of the continuous layers. */
  update({ active = false, speed = 0, rpm = 0, gear = 1, drift = 0, brake = 0, nitro = false, siren = 0, sirenPan = 0, close = false, heli = false }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, L = this.loops, on = active && !this.paused;
    const set = (name, gain, k = 0.08) => { if (L[name]) L[name].g.gain.setTargetAtTime(gain, t, k); };
    if (L.engine) { L.engine.src.playbackRate.setTargetAtTime(0.68 + rpm * 0.72 + gear * 0.035 + (nitro ? 0.12 : 0) + drift * 0.08, t, 0.05); }
    set('engine', on ? 0.17 + rpm * 0.08 + (nitro ? 0.06 : 0) : 0);
    set('squeal', on ? Math.min(0.34, Math.max(drift > 0.3 ? (drift - 0.3) * 0.55 : 0, brake * 0.22)) : 0, 0.05);
    if (this.wind) { this.wind.g.gain.setTargetAtTime(on ? Math.min(0.22, speed * speed * 0.16) : 0, t, 0.2); this.wind.f.frequency.setTargetAtTime(350 + speed * 900, t, 0.2); }
    if (this.hiss) this.hiss.g.gain.setTargetAtTime(on && nitro ? 0.14 : 0, t, nitro ? 0.04 : 0.25);
    const s = on ? siren : 0;
    set('wail', close ? s * 0.12 : s * 0.42, 0.15);
    set('yelp', close ? s * 0.42 : 0, 0.1);
    for (const n of ['wail', 'yelp']) if (L[n]?.pan) L[n].pan.pan.setTargetAtTime(sirenPan, t, 0.1);
    set('heli', on && heli ? 0.15 : 0, 0.5);
  }
}
