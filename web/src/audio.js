/* Escape 60 audio: licensed recordings (see web/assets/audio/CREDITS.md) mixed with Web Audio.
   Music streams through <audio> elements (no huge decoded buffers on phones); SFX and loops are
   small decoded buffers. Nothing plays until the first user gesture (browser autoplay rules). */
const BASE = new URL('../assets/audio/', import.meta.url).href;
const ONESHOTS = ['crash', 'horn', 'whoosh', 'combo', 'levelup', 'coin', 'beep', 'go', 'busted', 'win', 'click', 'scrape', 'near'];
const LOOPS = { engine: 'engine.wav', squeal: 'squeal.wav', wail: 'siren-wail.wav', yelp: 'siren-yelp.wav', heli: 'heli.wav' };
const TRACKS = { menu: ['music-menu.mp3'], chase: ['music-chase-1.mp3', 'music-chase-2.mp3', 'music-chase-3.mp3'], results: ['music-results.mp3'] };
const PREF_KEY = 'escape60-audio-v1';

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
  /** Short synthesized radio squelch (original, generated in Web Audio — no recorded asset). */
  radio(gain = 0.22) {
    if (!this.ctx || !this.sfxOn) return;
    try {
      const c = this.ctx, len = Math.floor(c.sampleRate * 0.16), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (i < len * 0.12 ? 1 : 0.35);
      const src = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime;
      src.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 1.4;
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      src.connect(bp); bp.connect(g); g.connect(this.sfxBus); src.start(t);
      const o = c.createOscillator(), og = c.createGain();
      o.type = 'square'; o.frequency.value = 1250; og.gain.setValueAtTime(gain * 0.25, t + 0.17); og.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      o.connect(og); og.connect(this.sfxBus); o.start(t + 0.17); o.stop(t + 0.25);
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
  update({ active = false, speed = 0, drift = 0, siren = 0, sirenPan = 0, close = false, heli = false }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, L = this.loops, on = active && !this.paused;
    const set = (name, gain, k = 0.08) => { if (L[name]) L[name].g.gain.setTargetAtTime(gain, t, k); };
    if (L.engine) { L.engine.src.playbackRate.setTargetAtTime(0.72 + speed * 0.62 + drift * 0.12, t, 0.08); }
    set('engine', on ? 0.16 + speed * 0.08 : 0);
    set('squeal', on && drift > 0.45 ? Math.min(0.32, (drift - 0.45) * 0.6) : 0, 0.05);
    const s = on ? siren : 0;
    set('wail', close ? s * 0.12 : s * 0.42, 0.15);
    set('yelp', close ? s * 0.42 : 0, 0.1);
    for (const n of ['wail', 'yelp']) if (L[n]?.pan) L[n].pan.pan.setTargetAtTime(sirenPan, t, 0.1);
    set('heli', on && heli ? 0.15 : 0, 0.5);
  }
}
