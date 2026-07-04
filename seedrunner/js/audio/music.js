// Adaptive layered music, composed in code. Every run theme = base + perc +
// counter + PANIC layers; perc/counter crossfade with pace, panic rides the
// Rot Tide's proximity directly (it IS the health bar, so it must be heard).
// Pip's motif (rising major pentatonic) and Bramble's motif (minor, tritone
// lean) return from Overgrown; the finale quotes both at once.

/* global Tone */

const PIP_MOTIF = ['C5', 'E5', 'G5', 'A5'];

export class Music {
  constructor(out, reverbSend, delaySend) {
    this.out = out;
    this.reverbSend = reverbSend;
    this.delaySend = delaySend;
    this._live = [];
    this.layers = null;
    this._sceneKey = null;
    this._intApplied = { perc: null, counter: null };

    this.stingSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.004, decay: 0.3, sustain: 0.12, release: 0.4 },
      volume: -10,
    });
    this.stingSynth.connect(out);
    this.stingSynth.connect(reverbSend);
  }

  own(node) { this._live.push(node); return node; }

  stopScene() {
    try {
      Tone.Transport.stop();
      Tone.Transport.cancel(0);
      Tone.Transport.bpm.cancelScheduledValues(Tone.now());
    } catch {}
    for (const n of this._live) { try { n.dispose ? n.dispose() : n.stop?.(); } catch {} }
    this._live = [];
    this.layers = null;
    this._intApplied = { perc: null, counter: null };
  }

  setScene(scene, data = {}) {
    const key = scene === 'run' ? `run-${data.biome}` : scene;
    if (key === this._sceneKey) return;
    this._sceneKey = key;
    this.stopScene();
    if (scene === 'none') return;

    this.layers = {
      base: this.own(new Tone.Gain(1).connect(this.out)),
      perc: this.own(new Tone.Gain(0).connect(this.out)),
      counter: this.own(new Tone.Gain(0).connect(this.out)),
      panic: this.own(new Tone.Gain(0).connect(this.out)),
    };

    if (scene === 'title') this.themeTitle();
    else if (scene === 'credits') this.themeCredits();
    else if (scene === 'finale') this.themeFinale();
    else this[{
      meadow: 'themeMeadow', cavern: 'themeCavern',
      cloudline: 'themeCloudline', wastes: 'themeWastes',
    }[data.biome] || 'themeMeadow']();
    try { Tone.Transport.start('+0.05'); } catch {}
  }

  get sceneKey() { return this._sceneKey; }

  // pace (0..1) gates perc/counter on the bar; danger drives panic directly
  setIntensity(v, danger = 0) {
    if (!this.layers) return;
    const percOn = v > 0.45 ? 1 : 0;
    const counterOn = v > 0.68 ? 1 : 0;
    if (percOn !== this._intApplied.perc || counterOn !== this._intApplied.counter) {
      this._intApplied = { perc: percOn, counter: counterOn };
      const apply = () => {
        if (!this.layers) return;
        this.layers.perc.gain.rampTo(percOn, 1.2);
        this.layers.counter.gain.rampTo(counterOn * 0.9, 1.4);
      };
      try { Tone.Transport.scheduleOnce(apply, Tone.Transport.nextSubdivision('1m')); }
      catch { apply(); }
    }
    try { this.layers.panic.gain.rampTo(Math.max(0, danger - 0.1) * 1.1, 0.35); } catch {}
  }

  stinger(name) {
    const play = (time) => {
      const s = this.stingSynth;
      const T = (dt) => time + dt;
      try {
        if (name === 'seed') {
          PIP_MOTIF.forEach((n, i) => s.triggerAttackRelease(n, 0.12, T(i * 0.09)));
          s.triggerAttackRelease(['C6', 'E6'], 0.4, T(0.38));
        } else if (name === 'checkpoint') {
          s.triggerAttackRelease(['G4', 'D5'], 0.18, T(0));
          s.triggerAttackRelease(['C5', 'G5'], 0.3, T(0.16));
        } else if (name === 'victory') {
          [['C5', 'E5'], ['F5', 'A5'], ['G5', 'B5'], ['C6', 'E6', 'G6']].forEach((ch, i) =>
            s.triggerAttackRelease(ch, i === 3 ? 0.8 : 0.16, T(i * 0.15)));
        }
      } catch {}
    };
    try {
      if (Tone.Transport.state === 'started') {
        Tone.Transport.scheduleOnce((t) => play(t), Tone.Transport.nextSubdivision('8n'));
      } else play(Tone.now());
    } catch { play(Tone.now()); }
  }

  // ------------------------------------------------------------ builders --
  bass(layer, vol = -11, type = 'triangle') {
    return this.own(new Tone.Synth({
      oscillator: { type },
      envelope: { attack: 0.008, decay: 0.2, sustain: 0.35, release: 0.15 },
      volume: vol,
    }).connect(layer));
  }
  pad(layer, vol = -20) {
    const p = this.own(new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fatsawtooth', count: 3, spread: 18 },
      envelope: { attack: 0.6, decay: 0.4, sustain: 0.5, release: 1.2 },
      volume: vol,
    }).connect(layer));
    p.connect(this.reverbSend);
    return p;
  }
  pluckSyn(layer, vol = -13) {
    const p = this.own(new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.003, decay: 0.18, sustain: 0, release: 0.12 },
      volume: vol,
    }).connect(layer));
    p.connect(this.delaySend);
    return p;
  }
  lead(layer, vol = -14, type = 'square') {
    const l = this.own(new Tone.Synth({
      oscillator: { type },
      envelope: { attack: 0.01, decay: 0.15, sustain: 0.4, release: 0.2 },
      volume: vol,
    }).connect(layer));
    l.connect(this.reverbSend);
    return l;
  }
  kick(layer, vol = -10) {
    return this.own(new Tone.MembraneSynth({
      pitchDecay: 0.04, octaves: 5,
      envelope: { attack: 0.001, decay: 0.3, sustain: 0 },
      volume: vol,
    }).connect(layer));
  }
  hat(layer, vol = -26) {
    const f = this.own(new Tone.Filter(8000, 'highpass').connect(layer));
    return this.own(new Tone.NoiseSynth({ envelope: { attack: 0.001, decay: 0.04, sustain: 0 }, volume: vol }).connect(f));
  }
  snare(layer, vol = -17) {
    const f = this.own(new Tone.Filter(1800, 'bandpass').connect(layer));
    return this.own(new Tone.NoiseSynth({ envelope: { attack: 0.001, decay: 0.13, sustain: 0 }, volume: vol }).connect(f));
  }
  seq(cb, events, sub = '8n') {
    const s = this.own(new Tone.Sequence(cb, events, sub));
    s.start(0);
    return s;
  }
  // the panic layer is the same everywhere: a racing pulse + urgent kick
  panicPulse(bpmNote = 'G4') {
    const L = this.layers;
    const pulse = this.lead(L.panic, -15, 'square');
    this.seq((t, n) => n && pulse.triggerAttackRelease(n, '16n', t),
      [bpmNote, bpmNote, null, bpmNote, null, bpmNote, bpmNote, null], '16n');
    const k = this.kick(L.panic, -10);
    this.seq((t, v) => v && k.triggerAttackRelease('B0', '8n', t), ['k', null, 'k', 'k', null, 'k', null, 'k'], '8n');
  }

  // -------------------------------------------------------------- themes --
  themeMeadow() {
    Tone.Transport.bpm.value = 118;
    const L = this.layers;
    const bass = this.bass(L.base);
    this.seq((t, n) => n && bass.triggerAttackRelease(n, '8n', t),
      ['C2', null, 'G2', 'C3', 'F2', null, 'C3', 'F2', 'A1', null, 'E2', 'A2', 'G2', null, 'B2', 'D3'], '8n');
    const pad = this.pad(L.base);
    this.seq((t, ch) => ch && pad.triggerAttackRelease(ch, '1m', t),
      [['C4', 'E4', 'G4'], ['F3', 'A3', 'C4'], ['A3', 'C4', 'E4'], ['G3', 'B3', 'D4']], '1m');
    const k = this.kick(L.perc), h = this.hat(L.perc);
    this.seq((t, v) => { if (v === 'k') k.triggerAttackRelease('C1', '8n', t); if (v === 'h') h.triggerAttackRelease('16n', t); },
      ['k', 'h', 'h', 'k', 'h', 'h', 'k', 'h'], '8n');
    const lead = this.lead(L.counter, -16, 'amtriangle');
    this.seq((t, n) => n && lead.triggerAttackRelease(n, '8n', t),
      ['C5', 'E5', 'G5', 'A5', null, 'G5', 'E5', null, 'D5', 'E5', 'G5', null, 'E5', null, 'C5', null,
        'C5', 'E5', 'G5', 'A5', 'C6', null, 'A5', 'G5', 'A5', null, 'G5', 'E5', 'D5', null, null, null], '8n');
    this.panicPulse('G4');
  }

  themeCavern() {
    Tone.Transport.bpm.value = 92;
    const L = this.layers;
    const droneA = this.own(new Tone.Oscillator('D2', 'sine').connect(L.base));
    droneA.volume.value = -22;
    droneA.start();
    const kal = this.pluckSyn(L.base, -12);
    this.seq((t, n) => n && kal.triggerAttackRelease(n, '8n', t),
      ['D4', null, 'F4', null, 'A4', null, null, 'E4', null, 'C4', null, 'D4', null, null, 'F4', null], '8n');
    const drip = this.own(new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.09, release: 0.05 }, harmonicity: 8, resonance: 5000, volume: -24,
    }).connect(L.perc));
    drip.connect(this.delaySend);
    this.seq((t, v) => v && drip.triggerAttackRelease(v, '16n', t),
      ['E6', null, null, null, 'B6', null, null, null, null, 'G6', null, null, null, null, null, null], '8n');
    const lead = this.lead(L.counter, -19, 'sine');
    this.seq((t, n) => n && lead.triggerAttackRelease(n, '2n', t),
      ['D5', null, 'F5', null, 'E5', null, 'C5', null], '2n');
    this.panicPulse('F4');
  }

  themeCloudline() {
    Tone.Transport.bpm.value = 126;
    const L = this.layers;
    const arp = this.pluckSyn(L.base, -16);
    this.seq((t, n) => n && arp.triggerAttackRelease(n, '16n', t),
      ['F4', 'A4', 'C5', 'E5', 'G5', 'E5', 'C5', 'A4', 'G4', 'B4', 'D5', 'F5', 'A5', 'F5', 'D5', 'B4'], '16n');
    const pad = this.pad(L.base, -22);
    this.seq((t, ch) => ch && pad.triggerAttackRelease(ch, '1m', t),
      [['F3', 'C4', 'E4', 'G4'], ['G3', 'B3', 'D4', 'F4']], '1m');
    const h = this.hat(L.perc, -24), k = this.kick(L.perc, -14);
    this.seq((t) => h.triggerAttackRelease('32n', t), [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], '16n');
    this.seq((t, v) => v && k.triggerAttackRelease('C1', '8n', t), ['C1', null, null, null, 'C1', null, 'C1', null], '8n');
    const lead = this.lead(L.counter, -15, 'amtriangle');
    this.seq((t, n) => n && lead.triggerAttackRelease(n, '4n', t),
      ['F5', 'A5', 'C6', 'D6', null, 'C6', 'A5', null, 'G5', 'A5', 'C6', null, 'A5', null, 'F5', null], '4n');
    this.panicPulse('A4');
  }

  themeWastes() {
    Tone.Transport.bpm.value = 132;
    const L = this.layers;
    const bass = this.bass(L.base, -9, 'fatsawtooth');
    // Bramble motif skeleton: D, F, Ab lean
    this.seq((t, n) => n && bass.triggerAttackRelease(n, '8n', t),
      ['D2', 'D2', null, 'F2', 'D2', null, 'Ab2', 'G2', 'D2', 'D2', null, 'F2', 'Ab1', null, 'A1', null], '8n');
    const horn = this.lead(L.base, -17, 'fatsawtooth');
    this.seq((t, n) => n && horn.triggerAttackRelease(n, '2n', t),
      ['D3', null, 'F3', null, 'Ab3', null, 'G3', null], '4n');
    const k = this.kick(L.perc, -8), sn = this.snare(L.perc);
    this.seq((t, v) => {
      if (v === 'k') k.triggerAttackRelease('A0', '8n', t);
      if (v === 's') sn.triggerAttackRelease('16n', t);
    }, ['k', null, 's', null, 'k', 'k', 's', null], '8n');
    const ost = this.lead(L.counter, -18, 'square');
    this.seq((t, n) => n && ost.triggerAttackRelease(n, '16n', t),
      ['D5', 'Eb5', 'D5', 'C5', 'D5', 'F5', 'Eb5', 'D5'], '16n');
    this.panicPulse('D5');
  }

  // finale: Bramble's engine below, Pip's motif singing above it
  themeFinale() {
    Tone.Transport.bpm.value = 142;
    const L = this.layers;
    const bass = this.bass(L.base, -8, 'fatsawtooth');
    this.seq((t, n) => n && bass.triggerAttackRelease(n, '8n', t),
      ['D2', 'D2', 'F2', 'D2', 'Ab2', 'G2', 'F2', 'D2'], '8n');
    const k = this.kick(L.base, -8), sn = this.snare(L.base);
    this.seq((t, v) => {
      if (v === 'k') k.triggerAttackRelease('B0', '8n', t);
      if (v === 's') sn.triggerAttackRelease('16n', t);
    }, ['k', null, 's', null, 'k', 'k', 's', null], '8n');
    const lead = this.lead(L.counter, -13, 'square');
    this.seq((t, n) => n && lead.triggerAttackRelease(n, '8n', t),
      ['C5', 'E5', 'G5', 'A5', null, 'A5', 'G5', 'E5', 'C5', 'E5', 'G5', 'C6', null, 'A5', 'G5', null], '8n');
    const h = this.hat(L.perc, -20);
    this.seq((t) => h.triggerAttackRelease('32n', t), [1, 1, 1, 1, 1, 1, 1, 1], '8n');
    this.layers.perc.gain.value = 1;   // the finale starts hot
    this._intApplied.perc = 1;
    this.panicPulse('D5');
  }

  themeTitle() {
    Tone.Transport.bpm.value = 78;
    const L = this.layers;
    const pad = this.pad(L.base, -18);
    this.seq((t, ch) => ch && pad.triggerAttackRelease(ch, '1m', t),
      [['C4', 'E4', 'G4', 'B4'], ['F3', 'A3', 'C4', 'E4'], ['A3', 'C4', 'E4', 'G4'], ['G3', 'B3', 'D4', 'F4']], '1m');
    const pluck = this.pluckSyn(L.base, -15);
    this.seq((t, n) => n && pluck.triggerAttackRelease(n, '8n', t),
      ['C5', null, 'E5', null, 'G5', null, 'A5', null, 'G5', null, 'E5', null, null, null, 'D5', null], '8n');
  }

  themeCredits() {
    Tone.Transport.bpm.value = 84;
    const L = this.layers;
    const pad = this.pad(L.base, -17);
    this.seq((t, ch) => ch && pad.triggerAttackRelease(ch, '1m', t),
      [['C4', 'E4', 'G4'], ['A3', 'C4', 'E4'], ['F3', 'A3', 'C4'], ['G3', 'B3', 'D4', 'F4']], '1m');
    const lead = this.lead(L.base, -14, 'amtriangle');
    this.seq((t, n) => n && lead.triggerAttackRelease(n, '4n', t),
      ['C5', 'E5', 'G5', 'A5', 'G5', null, 'E5', 'G5', 'D5', 'F5', 'A5', null, 'G5', 'E5', 'C5', null], '4n');
    const bass = this.bass(L.base, -13);
    this.seq((t, n) => n && bass.triggerAttackRelease(n, '2n', t), ['C2', 'A1', 'F2', 'G2'], '2n');
  }
}
