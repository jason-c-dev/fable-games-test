// Chiptune-plus audio: Web Audio synthesis only, no samples.
// SFX are envelope-shaped oscillators/noise. Music is a lookahead
// step-sequencer with pulse-wave instruments, vibrato, pluck envelopes,
// synthesized drums (kick/snare/hats) and a tempo-synced echo bus.
// All melodies composed originally for Sprout Kingdom.

const AudioSys = {
  ctx: null, master: null, sfxBus: null, musBus: null,
  muted: false, unlocked: false,
  _noiseBuf: null,
  _pendingSong: null,
  waves: null, musDelay: null, echoBus: null,

  unlock() {
    if (this.unlocked) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.55;
    this.sfxBus.connect(this.master);
    this.musBus = this.ctx.createGain(); this.musBus.gain.value = 0.42;
    this.musBus.connect(this.master);
    const len = this.ctx.sampleRate;
    this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this._noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // NES-style pulse waves (25% / 12.5% duty)
    this.waves = { pulse25: this._makePulse(0.25), pulse125: this._makePulse(0.125) };
    // feedback echo bus for music (delay time synced to song tempo on play)
    this.musDelay = this.ctx.createDelay(1.0);
    this.musDelay.delayTime.value = 0.26;
    const fbFilter = this.ctx.createBiquadFilter();
    fbFilter.type = 'lowpass'; fbFilter.frequency.value = 2400;
    const fb = this.ctx.createGain(); fb.gain.value = 0.34;
    this.musDelay.connect(fbFilter); fbFilter.connect(fb); fb.connect(this.musDelay);
    const wet = this.ctx.createGain(); wet.gain.value = 0.5;
    this.musDelay.connect(wet); wet.connect(this.musBus);
    this.echoBus = this.musDelay;
    this.unlocked = true;
    if (this._pendingSong) { Music.play(this._pendingSong); this._pendingSong = null; }
  },

  _makePulse(duty) {
    const n = 64;
    const real = new Float32Array(n), imag = new Float32Array(n);
    for (let i = 1; i < n; i++) imag[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
    return this.ctx.createPeriodicWave(real, imag);
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  },

  // ---- primitives ----
  tone(freq, dur, { wave = 'square', vol = 0.25, slide = 0, delay = 0, attack = 0.005 } = {}) {
    if (!this.unlocked) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.02);
  },

  noise(dur, { vol = 0.3, delay = 0, low = false } = {}) {
    if (!this.unlocked) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    let node = src;
    if (low) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 700;
      src.connect(f); node = f;
    }
    node.connect(g); g.connect(this.sfxBus);
    src.start(t0); src.stop(t0 + dur + 0.02);
  },

  // ---- named SFX ----
  jump() { this.tone(220, 0.14, { slide: 340, vol: 0.2 }); },
  spin() { this.tone(300, 0.16, { slide: 260, vol: 0.15, wave: 'triangle' }); this.noise(0.08, { vol: 0.06 }); },
  stomp() { this.noise(0.09, { vol: 0.25 }); this.tone(180, 0.12, { slide: -110, vol: 0.22 }); },
  coin() { this.tone(988, 0.06, { vol: 0.18 }); this.tone(1319, 0.2, { vol: 0.18, delay: 0.06 }); },
  powerup() {
    const seq = [262, 330, 392, 523, 659, 784];
    seq.forEach((f, i) => this.tone(f, 0.09, { vol: 0.16, delay: i * 0.055 }));
  },
  hurt() { this.tone(420, 0.28, { slide: -320, vol: 0.24 }); },
  die() { this.tone(520, 0.15, { vol: 0.2 }); this.tone(392, 0.4, { slide: -300, vol: 0.2, delay: 0.12 }); },
  brick() { this.noise(0.16, { vol: 0.3 }); this.tone(120, 0.1, { slide: -60, vol: 0.2, wave: 'triangle' }); },
  bump() { this.tone(110, 0.09, { slide: -40, vol: 0.25, wave: 'triangle' }); },
  kick() { this.tone(340, 0.08, { slide: 120, vol: 0.2 }); this.noise(0.05, { vol: 0.12 }); },
  throwIt() { this.noise(0.1, { vol: 0.15 }); this.tone(500, 0.08, { slide: 200, vol: 0.1 }); },
  seed() { this.tone(700, 0.07, { slide: 150, vol: 0.13 }); },
  oneUp() { [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.1, { vol: 0.17, delay: i * 0.08 })); },
  star() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.12, { vol: 0.15, delay: i * 0.05, wave: 'triangle' })); },
  checkpoint() { this.tone(523, 0.1, { vol: 0.16 }); this.tone(784, 0.22, { vol: 0.16, delay: 0.1 }); },
  reserveDrop() { this.tone(880, 0.1, { slide: -200, vol: 0.12, wave: 'triangle' }); },
  pause() { this.tone(660, 0.06, { vol: 0.15 }); this.tone(880, 0.1, { vol: 0.15, delay: 0.06 }); },
  select() { this.tone(740, 0.06, { vol: 0.13 }); },
  moveCursor() { this.tone(520, 0.05, { vol: 0.1 }); },
  mount() { this.tone(330, 0.1, { slide: 200, vol: 0.16, wave: 'triangle' }); },
  tongue() { this.tone(600, 0.1, { slide: -250, vol: 0.14, wave: 'triangle' }); },
  gulp() { this.tone(200, 0.12, { slide: -80, vol: 0.16, wave: 'triangle' }); },
  roar() { this.tone(90, 0.55, { slide: -50, vol: 0.32, wave: 'sawtooth' }); this.noise(0.5, { vol: 0.2, low: true }); },
  bossHit() { this.tone(300, 0.2, { slide: -180, vol: 0.26 }); this.noise(0.15, { vol: 0.2 }); },
  shockwave() { this.tone(70, 0.35, { slide: -30, vol: 0.3, wave: 'sawtooth' }); this.noise(0.3, { vol: 0.18, low: true }); },
  burrow() { this.noise(0.25, { vol: 0.2, low: true }); },
  door() { this.tone(300, 0.18, { slide: -160, vol: 0.16, wave: 'triangle' }); this.noise(0.12, { vol: 0.08 }); },
  crumbleSfx() { this.noise(0.2, { vol: 0.14, low: true }); },
  wind() { this.noise(0.6, { vol: 0.08, low: true }); },
  dialStop() { this.tone(880, 0.08, { vol: 0.16 }); },
  pmeter() { this.tone(1175, 0.08, { slide: 200, vol: 0.1, wave: 'triangle' }); },
  swoop() { this.tone(700, 0.3, { slide: -450, vol: 0.18, wave: 'sawtooth' }); this.noise(0.25, { vol: 0.1 }); },
  screech() { this.tone(1200, 0.25, { slide: 500, vol: 0.14, wave: 'square' }); },
};

// ---------------- music ----------------
const NOTE_SEMIS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteFreq(tok) {
  // e.g. "C4", "F#3", "Bb5"
  let i = 1, semi = NOTE_SEMIS[tok[0]];
  if (tok[1] === '#') { semi++; i++; } else if (tok[1] === 'b') { semi--; i++; }
  const oct = parseInt(tok.slice(i), 10);
  return 440 * Math.pow(2, (semi + (oct - 4) * 12 - 9) / 12);
}

// Track note string: space-separated tokens "C4:2" (note:steps) or "-:2" (rest).
// Drum tracks (wave:'noise') use k=kick, s=snare, h=closed hat, o=open hat.
function parseTrack(str) {
  const out = [];
  let t = 0;
  for (const tok of str.trim().split(/\s+/)) {
    if (tok === '|') continue;
    const [n, dRaw] = tok.split(':');
    const d = dRaw ? parseInt(dRaw, 10) : 1;
    if (n !== '-' && n !== '.') out.push({ t, d, n });
    t += d;
  }
  return { events: out, len: t };
}

// ---- composition helpers (bars are 8 eighth-note steps) ----
const rep = (s, n) => Array(n).fill(s.trim()).join(' ');
// off-beat chord stabs: two alternating chord tones
const stab = (a, b) => `-:1 ${a}:1 -:1 ${b}:1 -:1 ${a}:1 -:1 ${b}:1`;
// driving eighth-note bass: root with octave pops
const rbass = (r, o) => `${r}:1 ${r}:1 ${o}:1 ${r}:1 ${r}:1 ${o}:1 ${r}:1 ${o}:1`;
const rbass2 = (r, o) => `${r}:1 ${o}:1 ${r}:1 ${o}:1 ${r}:1 ${o}:1 ${r}:1 ${o}:1`;

// Songs: steps are 8th notes; stepDur = 30/bpm.
// Track options: wave (square/triangle/sawtooth/sine/pulse25/pulse125/noise),
// vol, vib (delayed vibrato), fat (detuned unison pair), pluck (fast decay),
// echo (0..1 send to the tempo-synced delay bus).
const SONGS = {
  // ---- title: bright C-major fanfare, AABA-ish, 16 bars ----
  title: {
    bpm: 126, loop: true, tracks: [
      { wave: 'pulse25', vol: 0.13, fat: true, vib: true, echo: 0.22, notes:
        'C5:1 E5:1 G5:2 E5:1 G5:1 C6:2   D6:2 C6:1 B5:1 G5:2 E5:2 ' +
        'A5:2 G5:1 F5:1 A5:2 C6:2        B5:1 A5:1 G5:2 D5:2 G5:2 ' +
        'C5:1 E5:1 G5:2 E5:1 G5:1 C6:2   E6:2 C6:1 A5:1 E5:2 A5:2 ' +
        'F5:1 G5:1 A5:2 C6:1 A5:1 F5:2   G5:2 A5:1 B5:1 D6:4 ' +
        'A5:1 B5:1 C6:2 B5:1 A5:1 E5:2   G5:2 F5:1 E5:1 B4:2 E5:2 ' +
        'F5:1 A5:1 C6:2 D6:2 C6:2        E6:2 D6:1 C6:1 G5:2 E5:2 ' +
        'A5:1 C6:1 F6:2 E6:1 D6:1 C6:2   D6:1 C6:1 B5:2 A5:1 B5:1 D6:2 ' +
        'C6:4 G5:2 E5:2                  C5:1 E5:1 G5:1 C6:1 -:4' },
      { wave: 'pulse125', vol: 0.07, echo: 0.2, notes:
        [stab('E4', 'G4'), stab('E4', 'G4'), stab('F4', 'A4'), stab('D4', 'G4'),
         stab('E4', 'G4'), stab('E4', 'A4'), stab('F4', 'A4'), stab('D4', 'G4'),
         stab('E4', 'A4'), stab('G4', 'B4'), stab('F4', 'A4'), stab('E4', 'G4'),
         stab('F4', 'A4'), stab('D4', 'G4'), stab('E4', 'G4'), 'C4:8'].join(' ') },
      { wave: 'triangle', vol: 0.22, pluck: true, notes:
        'C3:2 G2:2 C3:2 G3:2  C3:2 G2:2 C3:2 G3:2  F2:2 C3:2 F3:2 C3:2  G2:2 D3:2 G3:2 D3:2 ' +
        'C3:2 G2:2 C3:2 G3:2  A2:2 E3:2 A3:2 E3:2  F2:2 C3:2 F3:2 C3:2  G2:2 D3:2 G3:2 B2:2 ' +
        'A2:2 E3:2 A3:2 E3:2  E2:2 B2:2 E3:2 B2:2  F2:2 C3:2 F3:2 C3:2  C3:2 G2:2 C3:2 E3:2 ' +
        'F2:2 C3:2 F3:2 C3:2  G2:2 D3:2 G3:2 D3:2  C3:2 G2:2 C3:2 E3:2  F3:2 G3:2 C3:4' },
      { wave: 'noise', vol: 0.1, notes:
        [rep('k:1 h:1 s:1 h:1 k:1 h:1 s:1 h:1', 3), 'k:1 h:1 s:1 h:1 k:1 s:1 s:1 s:1',
         rep('k:1 h:1 s:1 h:1 k:1 h:1 s:1 h:1', 3), 'k:1 h:1 s:1 h:1 k:1 s:1 s:1 s:1',
         rep('k:1 h:1 s:1 h:1 k:1 h:1 s:1 h:1', 3), 'k:1 h:1 s:1 h:1 k:1 s:1 s:1 s:1',
         rep('k:1 h:1 s:1 h:1 k:1 h:1 s:1 h:1', 2), 'k:1 h:1 s:1 h:1 k:1 s:1 s:1 s:1',
         'k:1 -:1 s:1 -:1 k:2 s:2'].join(' ') },
    ],
  },

  // ---- overworld map: gentle stroll, 8 bars ----
  map: {
    bpm: 116, loop: true, tracks: [
      { wave: 'triangle', vol: 0.15, vib: true, echo: 0.3, notes:
        'E5:2 G5:1 E5:1 C5:2 D5:2    E5:2 A5:1 G5:1 E5:2 C5:2 ' +
        'F5:2 A5:1 G5:1 F5:2 D5:2    D5:1 E5:1 D5:2 B4:2 G4:2 ' +
        'E5:2 G5:1 E5:1 C5:2 D5:2    E5:2 A5:1 G5:1 A5:2 C6:2 ' +
        'D5:1 E5:1 F5:2 A5:1 G5:1 B4:2   C5:6 -:2' },
      { wave: 'triangle', vol: 0.18, pluck: true, notes:
        'C3:2 G3:2 E3:2 G3:2   A2:2 E3:2 C3:2 E3:2 ' +
        'F2:2 C3:2 A2:2 C3:2   G2:2 D3:2 B2:2 D3:2 ' +
        'C3:2 G3:2 E3:2 G3:2   A2:2 E3:2 C3:2 E3:2 ' +
        'D3:2 A2:2 G2:2 G3:2   C3:4 G2:2 C3:2' },
      { wave: 'noise', vol: 0.05, notes: rep('-:1 h:1 -:1 h:1 -:1 h:1 -:1 h:1', 8) },
    ],
  },

  // ---- meadow: bouncy F-major tune, 16 bars ----
  meadow: {
    bpm: 144, loop: true, tracks: [
      { wave: 'pulse25', vol: 0.12, fat: true, vib: true, echo: 0.18, notes:
        'A4:1 C5:1 F5:2 C5:1 F5:1 A5:2     G5:1 F5:1 E5:1 F5:1 G5:2 C5:2 ' +
        'Bb5:2 A5:1 G5:1 F5:2 D5:2         E5:1 F5:1 G5:2 E5:2 C5:2 ' +
        'A4:1 C5:1 F5:2 C5:1 F5:1 A5:2     A5:2 G5:1 F5:1 D5:2 F5:2 ' +
        'G5:1 A5:1 Bb5:2 A5:1 G5:1 F5:2    E5:2 D5:1 E5:1 G5:1 E5:1 C5:2 ' +
        'D6:2 C6:1 Bb5:1 A5:2 F5:2         C6:2 A5:1 F5:1 C5:2 F5:2 ' +
        'D6:2 C6:1 Bb5:1 A5:1 Bb5:1 C6:2   A5:1 G5:1 F5:2 C5:2 A4:2 ' +
        'D5:1 E5:1 F5:2 A5:2 F5:2          G5:1 A5:1 Bb5:2 D6:2 C6:2 ' +
        'Bb5:1 A5:1 G5:2 E5:2 C5:1 D5:1    F5:4 -:4' },
      { wave: 'pulse125', vol: 0.06, notes:
        [stab('A4', 'C5'), stab('A4', 'C5'), stab('Bb4', 'D5'), stab('G4', 'C5'),
         stab('A4', 'C5'), stab('A4', 'D5'), stab('G4', 'D5'), stab('G4', 'Bb4'),
         stab('Bb4', 'D5'), stab('A4', 'C5'), stab('Bb4', 'D5'), stab('A4', 'C5'),
         stab('A4', 'D5'), stab('Bb4', 'D5'),
         '-:1 G4:1 -:1 D5:1 -:1 G4:1 -:1 C5:1', 'F4:6 -:2'].join(' ') },
      { wave: 'triangle', vol: 0.22, pluck: true, notes:
        'F2:2 C3:2 F3:2 C3:2   F2:2 C3:2 F3:2 C3:2   Bb2:2 F3:2 Bb3:2 F3:2   C3:2 G3:2 C3:2 G2:2 ' +
        'F2:2 C3:2 F3:2 C3:2   D3:2 A2:2 D3:2 A3:2   G2:2 D3:2 G3:2 D3:2    C3:2 G2:2 C3:2 Bb2:2 ' +
        'Bb2:2 F3:2 Bb3:2 F3:2 F2:2 C3:2 F3:2 C3:2   Bb2:2 F3:2 Bb3:2 F3:2  F2:2 C3:2 F3:2 C3:2 ' +
        'D3:2 A2:2 D3:2 A3:2   Bb2:2 F3:2 Bb3:2 F3:2 G2:2 Bb2:2 C3:2 E3:2   F2:4 C3:2 F2:2' },
      { wave: 'noise', vol: 0.09, notes:
        [rep('k:1 h:1 s:1 h:1 k:1 k:1 s:1 h:1', 3), 'k:1 h:1 s:1 h:1 k:1 s:1 s:2',
         rep('k:1 h:1 s:1 h:1 k:1 k:1 s:1 h:1', 3), 'k:1 h:1 s:1 h:1 k:1 s:1 s:2',
         rep('k:1 h:1 s:1 h:1 k:1 k:1 s:1 h:1', 3), 'k:1 h:1 s:1 h:1 k:1 s:1 s:2',
         rep('k:1 h:1 s:1 h:1 k:1 k:1 s:1 h:1', 2), 'k:1 h:1 s:1 h:1 k:1 s:1 s:2',
         'k:1 h:1 s:1 h:1 k:2 s:2'].join(' ') },
    ],
  },

  // ---- cavern: slow A-minor mystery, heavy echo, 16 bars ----
  cavern: {
    bpm: 92, loop: true, tracks: [
      { wave: 'triangle', vol: 0.16, vib: true, echo: 0.55, notes:
        'A4:3 B4:1 C5:4       E5:3 D5:1 C5:2 B4:2 ' +
        'A4:3 C5:1 F5:4       E5:2 D5:2 B4:4 ' +
        'A4:3 B4:1 C5:4       D5:3 E5:1 D5:2 B4:2 ' +
        'C5:3 D5:1 E5:4       E5:1 F5:1 E5:2 B4:4 ' +
        'E5:3 -:1 E5:2 G5:2   G5:3 E5:1 C5:4 ' +
        'D5:2 E5:2 D5:2 B4:2  A4:2 C5:2 E5:2 A5:2 ' +
        'F5:3 E5:1 D5:4       D5:2 C5:2 B4:2 G#4:2 ' +
        'A4:4 E5:2 C5:2       A4:6 -:2' },
      { wave: 'pulse125', vol: 0.05, pluck: true, echo: 0.6, notes:
        '-:5 E6:1 -:2  -:8   -:5 A5:1 -:2  -:8 ' +
        '-:5 E6:1 -:2  -:8   -:3 G5:1 -:4  -:8 ' +
        '-:5 B5:1 -:2  -:8   -:5 D6:1 -:2  -:8 ' +
        '-:5 A5:1 -:2  -:8   -:1 E6:1 -:6  -:8' },
      { wave: 'triangle', vol: 0.15, notes:
        'A2:8 A2:8 F2:8 E2:8  A2:8 G2:8 F2:8 E2:8 ' +
        'A2:8 C2:8 G2:8 A2:4 E2:4  D2:8 E2:8 A2:4 E2:4 A2:8' },
      { wave: 'noise', vol: 0.06, notes:
        rep('k:1 -:5 h:1 -:1 -:4 h:1 -:3 k:1 -:7 -:2 h:1 -:5', 4) },
    ],
  },

  // ---- cloudline: airy arpeggio sky theme, 16 bars ----
  cloudline: {
    bpm: 136, loop: true, tracks: [
      { wave: 'triangle', vol: 0.14, vib: true, echo: 0.32, notes:
        'E5:4 G5:2 A5:2    A5:6 G5:2      E5:4 G5:2 C6:2   C6:6 A5:2 ' +
        'B5:4 A5:2 G5:2    A5:4 F5:2 E5:2 D5:4 E5:2 F5:2   E5:8 ' +
        'B4:4 D5:2 E5:2    E5:4 C5:2 A4:2 A4:4 C5:2 F5:2   G5:4 F5:2 D5:2 ' +
        'E5:4 G5:2 C6:2    E6:6 C6:2      A5:2 C6:2 B5:2 D6:2  C6:6 -:2' },
      { wave: 'pulse125', vol: 0.09, pluck: true, echo: 0.3, notes:
        ['C4:1 E4:1 G4:1 B4:1 C5:1 B4:1 G4:1 E4:1', 'F4:1 A4:1 C5:1 E5:1 F5:1 E5:1 C5:1 A4:1',
         'C4:1 E4:1 G4:1 B4:1 C5:1 B4:1 G4:1 E4:1', 'F4:1 A4:1 C5:1 E5:1 F5:1 E5:1 C5:1 A4:1',
         'A3:1 C4:1 E4:1 G4:1 A4:1 G4:1 E4:1 C4:1', 'F4:1 A4:1 C5:1 E5:1 F5:1 E5:1 C5:1 A4:1',
         'G3:1 B3:1 D4:1 F4:1 G4:1 F4:1 D4:1 B3:1', 'C4:1 E4:1 G4:1 B4:1 C5:1 B4:1 G4:1 E4:1',
         'E4:1 G4:1 B4:1 D5:1 E5:1 D5:1 B4:1 G4:1', 'A3:1 C4:1 E4:1 G4:1 A4:1 G4:1 E4:1 C4:1',
         'F4:1 A4:1 C5:1 E5:1 F5:1 E5:1 C5:1 A4:1', 'G3:1 B3:1 D4:1 F4:1 G4:1 F4:1 D4:1 B3:1',
         'C4:1 E4:1 G4:1 B4:1 C5:1 B4:1 G4:1 E4:1', 'A3:1 C4:1 E4:1 G4:1 A4:1 G4:1 E4:1 C4:1',
         'F4:1 A4:1 C5:1 E5:1 G4:1 B4:1 D5:1 F5:1', 'C4:1 E4:1 G4:1 B4:1 C5:1 B4:1 G4:1 E4:1'].join(' ') },
      { wave: 'triangle', vol: 0.18, notes:
        'C3:4 G2:4  F2:4 C3:4  C3:4 G2:4  F2:4 C3:4 ' +
        'A2:4 E3:4  F2:4 C3:4  G2:4 D3:4  C3:4 G2:4 ' +
        'E2:4 B2:4  A2:4 E3:4  F2:4 C3:4  G2:4 D3:4 ' +
        'C3:4 G2:4  A2:4 E3:4  F2:4 G2:4  C3:8' },
      { wave: 'noise', vol: 0.07, notes:
        [rep('k:1 h:1 -:1 h:1 s:1 h:1 -:1 h:1', 7), 'k:1 h:1 -:1 h:1 s:1 h:1 o:1 -:1',
         rep('k:1 h:1 -:1 h:1 s:1 h:1 -:1 h:1', 6), 'k:1 h:1 -:1 h:1 s:1 h:1 o:1 -:1',
         'k:1 h:1 s:1 h:1 o:2 -:2'].join(' ') },
    ],
  },

  // ---- bramble keep: driving D-minor march, 16 bars ----
  keep: {
    bpm: 150, loop: true, tracks: [
      { wave: 'pulse25', vol: 0.12, fat: true, echo: 0.16, notes:
        'D5:1 -:1 D5:1 E5:1 F5:2 E5:1 D5:1   A5:2 G5:1 F5:1 E5:2 C#5:2 ' +
        'D5:1 F5:1 Bb5:2 A5:1 G5:1 F5:2      E5:2 C#5:1 D5:1 E5:2 A4:2 ' +
        'D5:1 -:1 D5:1 E5:1 F5:2 E5:1 D5:1   G5:2 E5:1 C5:1 E5:2 G5:2 ' +
        'F5:1 G5:1 Bb5:2 A5:2 F5:2           E5:1 F5:1 E5:2 C#5:2 A4:2 ' +
        'D5:2 F5:1 A5:1 D6:2 C6:2            C6:2 A5:1 F5:1 A5:2 C6:2 ' +
        'Bb5:2 A5:1 G5:1 D5:2 G5:2           A5:1 G5:1 F5:1 E5:1 C#5:2 E5:2 ' +
        'Bb5:2 A5:1 Bb5:1 D6:2 C6:2          C6:1 Bb5:1 A5:1 G5:1 A5:2 E5:2 ' +
        'D5:1 E5:1 F5:1 G5:1 A5:4            D6:2 A5:2 F5:2 E5:1 C#5:1' },
      { wave: 'square', vol: 0.06, notes:
        [stab('D4', 'A4'), stab('D4', 'A4'), stab('F4', 'Bb4'), stab('E4', 'A4'),
         stab('D4', 'A4'), stab('E4', 'G4'), stab('F4', 'Bb4'), stab('E4', 'A4'),
         stab('D4', 'A4'), stab('F4', 'A4'), stab('D4', 'G4'), stab('E4', 'A4'),
         stab('F4', 'Bb4'), stab('E4', 'G4'), stab('D4', 'A4'), stab('E4', 'A4')].join(' ') },
      { wave: 'sawtooth', vol: 0.11, pluck: true, notes:
        [rbass('D2', 'D3'), rbass('D2', 'D3'), rbass('Bb1', 'Bb2'), rbass('A1', 'A2'),
         rbass('D2', 'D3'), rbass('C2', 'C3'), rbass('Bb1', 'Bb2'), rbass('A1', 'A2'),
         rbass('D2', 'D3'), rbass('F2', 'F3'), rbass('G2', 'G3'), rbass('A1', 'A2'),
         rbass('Bb1', 'Bb2'), rbass('C2', 'C3'),
         'D2:1 D3:1 D2:1 D3:1 F2:1 G2:1 G#2:1 A2:1', rbass('A1', 'A2')].join(' ') },
      { wave: 'noise', vol: 0.11, notes:
        [rep('k:1 h:1 s:1 h:1 k:1 k:1 s:1 h:1', 3), 'k:1 h:1 s:1 k:1 s:1 s:1 k:1 s:1',
         rep('k:1 h:1 s:1 h:1 k:1 k:1 s:1 h:1', 3), 'k:1 h:1 s:1 k:1 s:1 s:1 k:1 s:1',
         rep('k:1 h:1 s:1 h:1 k:1 k:1 s:1 h:1', 3), 'k:1 h:1 s:1 k:1 s:1 s:1 k:1 s:1',
         rep('k:1 h:1 s:1 h:1 k:1 k:1 s:1 h:1', 3), 'k:1 s:1 k:1 s:1 k:1 k:1 s:2'].join(' ') },
    ],
  },

  // ---- world boss: tense E-minor riff, 12 bars ----
  boss: {
    bpm: 158, loop: true, tracks: [
      { wave: 'pulse25', vol: 0.13, echo: 0.15, notes:
        'E5:1 E5:1 -:1 E5:1 G5:1 F#5:1 E5:1 D5:1   E5:2 -:1 B4:1 E5:2 G5:1 F#5:1 ' +
        'E5:1 C5:1 -:1 C5:1 E5:1 G5:1 A5:1 G5:1    F#5:1 D#5:1 B4:1 D#5:1 F#5:2 -:2 ' +
        'E5:1 E5:1 -:1 E5:1 G5:1 F#5:1 E5:1 D5:1   E5:2 G5:2 B5:2 A5:1 G5:1 ' +
        'A5:1 E5:1 C5:1 E5:1 A5:2 B5:1 C6:1        B5:2 A5:1 F#5:1 D#5:2 B4:2 ' +
        'E5:1 G5:1 B5:2 E6:2 D6:1 B5:1             C6:2 B5:1 A5:1 G5:2 E5:2 ' +
        'A5:1 B5:1 C6:2 B5:2 F#5:2                 G5:1 F#5:1 E5:4 -:2' },
      { wave: 'square', vol: 0.05, notes:
        [stab('G4', 'B4'), stab('G4', 'B4'), stab('E4', 'G4'), stab('F#4', 'A4'),
         stab('G4', 'B4'), stab('G4', 'B4'), stab('E4', 'A4'), stab('F#4', 'A4'),
         stab('G4', 'B4'), stab('E4', 'G4'), stab('E4', 'A4'), stab('G4', 'B4')].join(' ') },
      { wave: 'sawtooth', vol: 0.12, pluck: true, notes:
        [rbass2('E2', 'E3'), rbass2('E2', 'E3'), rbass2('C2', 'C3'), rbass2('B1', 'B2'),
         rbass2('E2', 'E3'), rbass2('E2', 'E3'), rbass2('A1', 'A2'), rbass2('B1', 'B2'),
         rbass2('E2', 'E3'), rbass2('C2', 'C3'),
         'A1:1 A2:1 A1:1 A2:1 B1:1 B2:1 B1:1 B2:1',
         'E2:1 E3:1 E2:1 E3:1 G2:1 A2:1 B2:1 B1:1'].join(' ') },
      { wave: 'noise', vol: 0.12, notes:
        [rep('k:1 k:1 s:1 h:1 k:1 k:1 s:1 s:1', 3), 'k:1 k:1 s:1 s:1 k:1 s:1 s:1 s:1',
         rep('k:1 k:1 s:1 h:1 k:1 k:1 s:1 s:1', 3), 'k:1 k:1 s:1 s:1 k:1 s:1 s:1 s:1',
         rep('k:1 k:1 s:1 h:1 k:1 k:1 s:1 s:1', 3), 'k:1 k:1 s:1 s:1 k:1 s:1 s:1 s:1'].join(' ') },
    ],
  },

  // ---- final boss: relentless D-minor assault, 16 bars ----
  finalboss: {
    bpm: 172, loop: true, tracks: [
      { wave: 'pulse25', vol: 0.13, fat: true, notes:
        'D5:1 D5:1 C#5:1 D5:1 Bb4:2 A4:2       D5:1 D5:1 E5:1 F5:1 E5:2 C#5:2 ' +
        'G5:1 G5:1 F5:1 G5:1 Bb5:2 A5:1 G5:1   A5:1 E5:1 C#5:1 E5:1 A4:2 -:2 ' +
        'D5:1 D5:1 C#5:1 D5:1 Bb4:2 A4:2       Bb5:1 Bb5:1 A5:1 Bb5:1 D6:2 C6:2 ' +
        'Bb5:1 A5:1 G5:2 D5:2 G5:2             E5:1 F5:1 E5:1 D5:1 C#5:2 E5:2 ' +
        'F5:1 E5:1 F5:1 G5:1 A5:2 D6:2         C6:1 Bb5:1 A5:1 G5:1 F5:2 A5:2 ' +
        'Bb5:1 C6:1 D6:2 C6:1 Bb5:1 A5:2       A5:2 G5:1 F5:1 E5:2 C#5:2 ' +
        'D6:1 D6:1 C6:1 D6:1 Bb5:2 F5:2        C#6:1 C#6:1 B5:1 C#6:1 A5:2 E5:2 ' +
        'D5:1 E5:1 F5:1 G5:1 A5:1 Bb5:1 A5:1 G5:1   F5:1 E5:1 D5:4 -:2' },
      { wave: 'square', vol: 0.05, notes:
        [stab('F4', 'A4'), stab('F4', 'A4'), stab('D4', 'G4'), stab('E4', 'C#5'),
         stab('F4', 'A4'), stab('F4', 'Bb4'), stab('D4', 'G4'), stab('E4', 'C#5'),
         stab('F4', 'A4'), stab('F4', 'A4'), stab('F4', 'Bb4'), stab('E4', 'C#5'),
         stab('F4', 'Bb4'), stab('E4', 'C#5'), stab('F4', 'A4'), stab('F4', 'A4')].join(' ') },
      { wave: 'sawtooth', vol: 0.12, pluck: true, notes:
        [rbass('D2', 'D3'), rbass('D2', 'D3'), rbass('G2', 'G3'), rbass('A1', 'A2'),
         rbass('D2', 'D3'), rbass('Bb1', 'Bb2'), rbass('G2', 'G3'), rbass('A1', 'A2'),
         rbass('D2', 'D3'), rbass('F2', 'F3'), rbass('Bb1', 'Bb2'), rbass('A1', 'A2'),
         rbass('Bb1', 'Bb2'), rbass('A1', 'A2'),
         'D2:1 D3:1 D2:1 D3:1 D2:1 D3:1 C2:1 C#2:1',
         'D2:1 D3:1 D2:1 D3:1 D2:2 A1:2'].join(' ') },
      { wave: 'noise', vol: 0.13, notes:
        [rep('k:1 s:1 k:1 s:1 k:1 s:1 k:1 s:1 k:1 k:1 s:1 k:1 k:1 k:1 s:1 s:1', 1),
         'k:1 s:1 k:1 s:1 k:1 s:1 k:1 s:1', 'k:1 s:1 k:1 s:1 s:1 s:1 s:1 s:1',
         rep('k:1 s:1 k:1 s:1 k:1 s:1 k:1 s:1 k:1 k:1 s:1 k:1 k:1 k:1 s:1 s:1', 1),
         'k:1 s:1 k:1 s:1 k:1 s:1 k:1 s:1', 'k:1 s:1 k:1 s:1 s:1 s:1 s:1 s:1',
         rep('k:1 s:1 k:1 s:1 k:1 s:1 k:1 s:1 k:1 k:1 s:1 k:1 k:1 k:1 s:1 s:1', 1),
         'k:1 s:1 k:1 s:1 k:1 s:1 k:1 s:1', 'k:1 s:1 k:1 s:1 s:1 s:1 s:1 s:1',
         rep('k:1 s:1 k:1 s:1 k:1 s:1 k:1 s:1 k:1 k:1 s:1 k:1 k:1 k:1 s:1 s:1', 1),
         'k:1 s:1 k:1 s:1 k:1 s:1 k:1 s:1', 'k:1 k:1 s:1 k:1 s:1 s:1 s:2'].join(' ') },
    ],
  },

  // ---- credits: warm slow waltz-of-sorts, 16 bars ----
  credits: {
    bpm: 96, loop: true, tracks: [
      { wave: 'triangle', vol: 0.15, vib: true, echo: 0.35, notes:
        'E5:2 G5:2 C6:2 B5:1 A5:1    B5:2 G5:2 D5:2 G5:2 ' +
        'A5:2 C6:2 E6:2 D6:1 C6:1    B5:2 G5:2 E5:2 G5:2 ' +
        'A5:2 F5:2 C5:2 F5:2         G5:2 E5:2 C5:2 E5:2 ' +
        'F5:2 A5:2 C6:2 A5:2         G5:2 A5:2 B5:2 D6:2 ' +
        'E6:2 D6:1 C6:1 G5:2 E5:2    B5:1 A5:1 G5:2 D5:2 B4:2 ' +
        'A4:2 C5:2 E5:2 A5:2         G5:2 B5:2 E5:2 G5:2 ' +
        'F5:2 A5:2 C6:2 E6:2         D6:2 C6:2 G5:2 E5:2 ' +
        'G5:2 F5:2 D5:2 B4:2         C5:8' },
      { wave: 'triangle', vol: 0.1, echo: 0.2, notes:
        'E4:4 G4:4   D4:4 B3:4   C4:4 E4:4   B3:4 G4:4 ' +
        'A3:4 C4:4   E4:4 G4:4   A3:4 C4:4   D4:4 B3:4 ' +
        'E4:4 G4:4   D4:4 B3:4   C4:4 E4:4   B3:4 G4:4 ' +
        'A3:4 C4:4   E4:4 G4:4   D4:4 F4:4   E4:8' },
      { wave: 'triangle', vol: 0.16, pluck: true, notes:
        'C3:4 G2:4   G2:4 D3:4   A2:4 E3:4   E2:4 B2:4 ' +
        'F2:4 C3:4   C3:4 G2:4   F2:4 C3:4   G2:4 D3:4 ' +
        'C3:4 G2:4   G2:4 D3:4   A2:4 E3:4   E2:4 B2:4 ' +
        'F2:4 C3:4   C3:4 G2:4   G2:4 G2:4   C3:8' },
    ],
  },

  // ---- jingles (non-looping) ----
  clear: {
    bpm: 140, loop: false, tracks: [
      { wave: 'pulse25', vol: 0.15, echo: 0.2, notes:
        'G4:1 C5:1 E5:1 G5:1 E5:1 G5:2 -:1 A4:1 D5:1 F5:1 A5:1 F5:1 A5:2 -:1 B4:1 E5:1 G5:1 B5:1 C6:6' },
      { wave: 'pulse125', vol: 0.09, notes:
        'E4:1 G4:1 C5:1 E5:1 C5:1 E5:2 -:1 F4:1 A4:1 D5:1 F5:1 D5:1 F5:2 -:1 G4:1 B4:1 E5:1 G5:1 E5:6' },
      { wave: 'triangle', vol: 0.2, pluck: true, notes:
        'C3:2 E3:2 G3:3 -:1 D3:2 F3:2 A3:3 -:1 E3:2 G3:2 C3:6' },
      { wave: 'noise', vol: 0.09, notes:
        'k:1 -:3 s:2 -:2 k:1 -:3 s:2 -:2 k:1 -:1 k:1 -:1 s:6' },
    ],
  },
  death: {
    bpm: 110, loop: false, tracks: [
      { wave: 'pulse25', vol: 0.14, echo: 0.2, notes: 'E5:1 -:1 E5:1 -:1 C5:2 A4:2 F4:2 G4:1 F4:1 E4:4' },
      { wave: 'triangle', vol: 0.16, pluck: true, notes: 'C3:2 -:2 A2:2 F2:2 C2:2 -:1 C2:1 C2:4' },
    ],
  },
  gameover: {
    bpm: 84, loop: false, tracks: [
      { wave: 'triangle', vol: 0.18, vib: true, echo: 0.3, notes: 'C5:3 G4:3 E4:3 C4:3 D4:2 Eb4:2 D4:2 C4:6' },
      { wave: 'triangle', vol: 0.14, notes: 'C3:6 G2:6 F2:4 G2:2 C2:6' },
    ],
  },
  bosswin: {
    bpm: 132, loop: false, tracks: [
      { wave: 'pulse25', vol: 0.15, echo: 0.2, notes:
        'C5:1 D5:1 E5:1 G5:1 -:1 G5:1 A5:1 B5:1 C6:4 G5:2 E5:2 C6:6' },
      { wave: 'pulse125', vol: 0.09, notes:
        'E4:1 F4:1 G4:1 C5:1 -:1 C5:1 D5:1 F5:1 E5:4 C5:2 G4:2 E5:6' },
      { wave: 'triangle', vol: 0.18, pluck: true, notes:
        'C3:2 E3:2 -:2 F3:2 C3:4 E3:2 G3:2 C3:6' },
    ],
  },
  seedget: {
    bpm: 120, loop: false, tracks: [
      { wave: 'triangle', vol: 0.18, vib: true, echo: 0.4, notes:
        'C5:1 E5:1 G5:1 C6:1 E6:1 G6:3 E6:1 C6:1 G5:1 C6:6' },
      { wave: 'triangle', vol: 0.13, pluck: true, notes:
        'C3:3 G3:3 C4:3 G3:2 C3:6' },
    ],
  },
};

const Music = {
  current: null, name: null,
  _timer: null, _step: 0, _nextTime: 0, _parsed: null, _stepDur: 0,

  play(name) {
    if (!AudioSys.unlocked) { AudioSys._pendingSong = name; return; }
    if (this.name === name && this._timer) return;
    this.stop();
    const song = SONGS[name];
    if (!song) return;
    this.name = name;
    this.current = song;
    this._stepDur = 30 / song.bpm; // 8th note duration
    this._parsed = song.tracks.map(tr => ({ ...tr, ...parseTrack(tr.notes) }));
    this._len = Math.max(...this._parsed.map(t => t.len));
    this._step = 0;
    // echo repeats land a dotted-eighth behind the beat
    if (AudioSys.musDelay) {
      AudioSys.musDelay.delayTime.setValueAtTime(
        Math.min(0.9, this._stepDur * 3), AudioSys.ctx.currentTime);
    }
    this._nextTime = AudioSys.ctx.currentTime + 0.06;
    this._timer = setInterval(() => this._tick(), 27);
  },

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this.name = null; this.current = null;
  },

  _tick() {
    if (!AudioSys.unlocked || !this.current) return;
    const ahead = AudioSys.ctx.currentTime + 0.14;
    while (this._nextTime < ahead) {
      const stepInLoop = this._step % this._len;
      for (const tr of this._parsed) {
        for (const ev of tr.events) {
          if (ev.t !== stepInLoop) continue;
          this._playEvent(tr, ev, this._nextTime);
        }
      }
      this._step++;
      this._nextTime += this._stepDur;
      if (!this.current.loop && this._step >= this._len) {
        this.stop();
        return;
      }
    }
  },

  // ---- synthesized drum kit ----
  _drum(n, vol, t) {
    const ctx = AudioSys.ctx;
    if (n === 'k') {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(44, t + 0.09);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol * 2.4, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.connect(g); g.connect(AudioSys.musBus);
      o.start(t); o.stop(t + 0.14);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = AudioSys._noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    let dur;
    if (n === 's') {
      f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
      g.gain.setValueAtTime(vol * 1.5, t); dur = 0.1;
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(210, t);
      o.frequency.exponentialRampToValueAtTime(120, t + 0.05);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(vol * 1.1, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      o.connect(g2); g2.connect(AudioSys.musBus);
      o.start(t); o.stop(t + 0.08);
    } else if (n === 'o') {
      f.type = 'highpass'; f.frequency.value = 6200;
      g.gain.setValueAtTime(vol * 0.8, t); dur = 0.16;
    } else { // 'h' closed hat
      f.type = 'highpass'; f.frequency.value = 7400;
      g.gain.setValueAtTime(vol * 0.7, t); dur = 0.035;
    }
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(AudioSys.musBus);
    src.start(t); src.stop(t + dur + 0.02);
  },

  _playEvent(tr, ev, t) {
    const ctx = AudioSys.ctx;
    if (tr.wave === 'noise') { this._drum(ev.n, tr.vol, t); return; }
    const dur = ev.d * this._stepDur * 0.92;
    const freq = noteFreq(ev.n);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(tr.vol, t + 0.012);
    if (tr.pluck) {
      g.gain.exponentialRampToValueAtTime(0.001, t + Math.max(0.09, dur));
    } else {
      g.gain.setValueAtTime(tr.vol, t + Math.max(0.012, dur - 0.035));
      g.gain.linearRampToValueAtTime(0, t + dur);
    }
    g.connect(AudioSys.musBus);
    if (tr.echo && AudioSys.echoBus) {
      const send = ctx.createGain(); send.gain.value = tr.echo;
      g.connect(send); send.connect(AudioSys.echoBus);
    }
    const detunes = tr.fat ? [-5, 6] : [0];
    for (const det of detunes) {
      const o = ctx.createOscillator();
      if (tr.wave === 'pulse25' || tr.wave === 'pulse125') o.setPeriodicWave(AudioSys.waves[tr.wave]);
      else o.type = tr.wave;
      o.frequency.value = freq;
      o.detune.value = det;
      if (tr.vib) {
        // delayed vibrato, classic chiptune lead
        const lfo = ctx.createOscillator(); lfo.frequency.value = 5.6;
        const lg = ctx.createGain();
        lg.gain.setValueAtTime(0, t);
        lg.gain.linearRampToValueAtTime(freq * 0.011, t + Math.min(0.3, dur * 0.6));
        lfo.connect(lg); lg.connect(o.frequency);
        lfo.start(t); lfo.stop(t + dur + 0.02);
      }
      const og = ctx.createGain(); og.gain.value = tr.fat ? 0.62 : 1;
      o.connect(og); og.connect(g);
      o.start(t); o.stop(t + dur + 0.03);
    }
  },
};
