// Adaptive layered music, composed in code. Each theme = base layer plus
// percussion + counter-melody layers that crossfade in on the bar as danger
// rises. Pip's motif (rising major pentatonic) and Bramble's motif (minor
// with a tritone lean) thread through the soundtrack. Boss themes shift per
// phase. Stingers land on the next eighth.

/* global Tone */

const PIP_MOTIF = ['C5', 'E5', 'G5', 'A5'];

export class Music {
  constructor(out, reverbSend, delaySend) {
    this.out = out;
    this.reverbSend = reverbSend;
    this.delaySend = delaySend;
    this.scene = 'none';
    this._live = [];
    this.layers = null;
    this.intensity = 0;
    this._intApplied = { perc: null, counter: null };
    this._nextBarHook = null;

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
    if (scene === this.scene && scene !== 'level' && scene !== 'boss') return;
    const key = scene === 'level' ? `level${data.world ?? 0}` : scene;
    if (key === this._sceneKey) return;
    this._sceneKey = key;
    this.scene = scene;
    this.stopScene();
    if (scene === 'none') return;

    // layer buses
    this.layers = {
      base: this.own(new Tone.Gain(1).connect(this.out)),
      perc: this.own(new Tone.Gain(0).connect(this.out)),
      counter: this.own(new Tone.Gain(0).connect(this.out)),
    };

    const world = data.world ?? 0;
    if (scene === 'title') this.themeTitle();
    else if (scene === 'overworld') this.themeOverworld();
    else if (scene === 'boss') this.themeBoss(data.final);
    else if (scene === 'level') [this.themeMeadow, this.themeCavern, this.themeCloudline, this.themeKeep][world].call(this);
    Tone.Transport.start('+0.05');
  }

  // intensity 0..1 -> layer targets, crossfaded at the next bar
  setIntensity(v) {
    this.intensity = v;
    if (!this.layers) return;
    const percOn = v > 0.45 ? 1 : 0;
    const counterOn = v > 0.7 ? 1 : 0;
    if (percOn !== this._intApplied.perc || counterOn !== this._intApplied.counter) {
      this._intApplied = { perc: percOn, counter: counterOn };
      const apply = () => {
        if (!this.layers) return;
        this.layers.perc.gain.rampTo(percOn, 1.2);
        this.layers.counter.gain.rampTo(counterOn * 0.9, 1.4);
      };
      try {
        Tone.Transport.scheduleOnce(apply, Tone.Transport.nextSubdivision('1m'));
      } catch { apply(); }
    }
  }

  bossPhase(n) {
    try {
      Tone.Transport.bpm.rampTo(this._bossBpm + n * 7, 2);
      if (n >= 2 && this.layers) this.layers.counter.gain.rampTo(1, 1);
    } catch {}
  }

  // duel finale: strip to a tense pulse
  duelMode(on) {
    if (!this.layers) return;
    if (on) {
      this.layers.base.gain.rampTo(0.25, 1.5);
      this.layers.perc.gain.rampTo(0.15, 1.5);
      this.layers.counter.gain.rampTo(0, 1);
    } else {
      this.layers.base.gain.rampTo(1, 1);
    }
  }

  stinger(name) {
    const play = (time) => {
      const s = this.stingSynth;
      const T = (dt) => time + dt;
      try {
        if (name === 'star') {
          PIP_MOTIF.forEach((n, i) => s.triggerAttackRelease(n, 0.12, T(i * 0.09)));
          s.triggerAttackRelease('C6', 0.3, T(0.36));
        } else if (name === 'checkpoint') {
          s.triggerAttackRelease(['G4', 'D5'], 0.18, T(0));
          s.triggerAttackRelease(['C5', 'G5'], 0.3, T(0.16));
        } else if (name === 'goal') {
          [['C5', 'E5'], ['F5', 'A5'], ['G5', 'B5'], ['C6', 'E6', 'G6']].forEach((ch, i) =>
            s.triggerAttackRelease(ch, i === 3 ? 0.6 : 0.16, T(i * 0.15)));
        } else if (name === 'secret') {
          ['B4', 'D5', 'F5', 'A5', 'C6'].forEach((n, i) => s.triggerAttackRelease(n, 0.1, T(i * 0.07)));
        } else if (name === 'bossdead') {
          [['D4', 'F4'], ['D4', 'A4'], ['D5', 'F5', 'A5', 'D6']].forEach((ch, i) =>
            s.triggerAttackRelease(ch, i === 2 ? 0.9 : 0.2, T(i * 0.2)));
        } else if (name === 'gameover') {
          [['C4', 'Eb4'], ['B3', 'D4'], ['Bb3', 'Db4'], ['A3', 'C4', 'E4']].forEach((ch, i) =>
            s.triggerAttackRelease(ch, 0.4, T(i * 0.35)));
        } else if (name === 'victory') {
          PIP_MOTIF.forEach((n, i) => s.triggerAttackRelease(n, 0.14, T(i * 0.11)));
          s.triggerAttackRelease(['C5', 'E5', 'G5', 'C6'], 1.2, T(0.5));
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
    return this.own(new Tone.NoiseSynth({
      envelope: { attack: 0.001, decay: 0.04, sustain: 0 },
      volume: vol,
    }).connect(f));
  }
  snare(layer, vol = -17) {
    const f = this.own(new Tone.Filter(1800, 'bandpass').connect(layer));
    return this.own(new Tone.NoiseSynth({
      envelope: { attack: 0.001, decay: 0.13, sustain: 0 },
      volume: vol,
    }).connect(f));
  }
  seq(cb, events, sub = '8n') {
    const s = this.own(new Tone.Sequence(cb, events, sub));
    s.start(0);
    return s;
  }
  loop(cb, interval) {
    const l = this.own(new Tone.Loop(cb, interval));
    l.start(0);
    return l;
  }

  // -------------------------------------------------------------- themes --
  themeMeadow() {
    Tone.Transport.bpm.value = 104;
    const L = this.layers;
    const bass = this.bass(L.base);
    // C - Am - F - G, roots and fifths
    this.seq((t, n) => n && bass.triggerAttackRelease(n, '8n', t),
      ['C2', null, 'G2', 'C3', 'A1', null, 'E2', 'A2', 'F2', null, 'C3', 'F2', 'G2', null, 'D3', 'B2'], '8n');
    const pad = this.pad(L.base);
    this.seq((t, ch) => ch && pad.triggerAttackRelease(ch, '1m', t),
      [['C4', 'E4', 'G4'], ['A3', 'C4', 'E4'], ['F3', 'A3', 'C4'], ['G3', 'B3', 'D4']], '1m');
    // birds (ambient, part of base)
    const bird = this.pluckSyn(L.base, -20);
    this.loop((t) => {
      if (Math.random() < 0.3) {
        const n = ['E6', 'G6', 'A6', 'C7'][(Math.random() * 4) | 0];
        bird.triggerAttackRelease(n, 0.05, t);
        bird.triggerAttackRelease(n, 0.04, t + 0.09);
      }
    }, '2m');
    // perc
    const k = this.kick(L.perc), h = this.hat(L.perc);
    this.seq((t, v) => { if (v === 'k') k.triggerAttackRelease('C1', '8n', t); if (v === 'h') h.triggerAttackRelease('16n', t); },
      ['k', 'h', 'h', 'h', 'k', 'h', 'k', 'h'], '8n');
    // counter: Pip motif lead
    const lead = this.lead(L.counter, -16, 'amtriangle');
    this.seq((t, n) => n && lead.triggerAttackRelease(n, '8n', t),
      ['C5', 'E5', 'G5', 'A5', 'G5', null, 'E5', null,
        'A5', 'G5', 'E5', 'C5', 'D5', null, null, null,
        'C5', 'E5', 'G5', 'A5', 'C6', null, 'A5', null,
        'G5', null, 'E5', 'G5', 'D5', null, null, null], '8n');
  }

  themeCavern() {
    Tone.Transport.bpm.value = 84;
    const L = this.layers;
    // drone
    const droneA = this.own(new Tone.Oscillator('D2', 'sine').connect(L.base));
    const droneB = this.own(new Tone.Oscillator('A2', 'sine'));
    const dg = this.own(new Tone.Gain(0.05).connect(L.base));
    droneB.connect(dg); droneA.volume.value = -24;
    droneA.start(); droneB.start();
    // kalimba echoes
    const kal = this.pluckSyn(L.base, -12);
    this.seq((t, n) => n && kal.triggerAttackRelease(n, '8n', t),
      ['D4', null, null, 'F4', null, 'A4', null, null, 'E4', null, null, null, 'C4', null, 'D4', null], '8n');
    // perc: drips
    const drip = this.own(new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.09, release: 0.05 },
      harmonicity: 8, resonance: 5000, volume: -24,
    }).connect(L.perc));
    drip.connect(this.delaySend);
    this.seq((t, v) => v && drip.triggerAttackRelease(v, '16n', t),
      ['E6', null, null, null, null, 'B6', null, null, null, null, 'G6', null, null, null, null, null], '8n');
    // counter: eerie inverted motif
    const lead = this.lead(L.counter, -19, 'sine');
    this.seq((t, n) => n && lead.triggerAttackRelease(n, '2n', t),
      ['D5', null, 'F5', null, 'E5', null, 'C5', null], '2n');
  }

  themeCloudline() {
    Tone.Transport.bpm.value = 112;
    const L = this.layers;
    const arp = this.pluckSyn(L.base, -16);
    this.seq((t, n) => n && arp.triggerAttackRelease(n, '16n', t),
      ['F4', 'A4', 'C5', 'E5', 'G5', 'E5', 'C5', 'A4', 'F4', 'B4', 'D5', 'F5', 'A5', 'F5', 'D5', 'B4'], '16n');
    const pad = this.pad(L.base, -22);
    this.seq((t, ch) => ch && pad.triggerAttackRelease(ch, '1m', t),
      [['F3', 'C4', 'E4', 'G4'], ['G3', 'B3', 'D4', 'F4']], '1m');
    // wind bed
    const windF = this.own(new Tone.Filter(600, 'lowpass').connect(L.base));
    const wind = this.own(new Tone.Noise('pink'));
    const wg = this.own(new Tone.Gain(0.012).connect(windF));
    wind.connect(wg); wind.start();
    // perc: shaker + soft kick
    const h = this.hat(L.perc, -24), k = this.kick(L.perc, -14);
    this.seq((t, v) => { if (v) h.triggerAttackRelease('32n', t); },
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], '16n');
    this.seq((t, v) => v && k.triggerAttackRelease('C1', '8n', t), ['C1', null, null, null, 'C1', null, null, null], '8n');
    // counter: soaring lead
    const lead = this.lead(L.counter, -15, 'amtriangle');
    this.seq((t, n) => n && lead.triggerAttackRelease(n, '4n', t),
      ['F5', 'A5', 'C6', 'D6', null, 'C6', 'A5', null, 'G5', 'A5', 'C6', null, 'A5', null, 'F5', null], '4n');
  }

  themeKeep() {
    Tone.Transport.bpm.value = 96;
    const L = this.layers;
    const bass = this.bass(L.base, -9, 'fatsawtooth');
    this.seq((t, n) => n && bass.triggerAttackRelease(n, '8n', t),
      ['G1', 'G1', null, 'G1', 'Ab1', null, 'G1', null, 'G1', 'G1', null, 'Bb1', 'Ab1', null, 'F1', null], '8n');
    // Bramble motif, low horn
    const horn = this.lead(L.base, -16, 'fatsawtooth');
    this.seq((t, n) => n && horn.triggerAttackRelease(n, '2n', t),
      ['D3', null, 'F3', null, 'Ab3', null, 'G3', null, null, null, null, null, null, null, null, null], '4n');
    // perc: taiko
    const k = this.kick(L.perc, -7), sn = this.snare(L.perc);
    this.seq((t, v) => {
      if (v === 'k') k.triggerAttackRelease('A0', '8n', t);
      if (v === 'K') { k.triggerAttackRelease('A0', '8n', t); k.triggerAttackRelease('E1', '8n', t + 0.02); }
      if (v === 's') sn.triggerAttackRelease('16n', t);
    }, ['K', null, 'k', 'k', 's', null, 'k', null, 'K', null, 'k', 'k', 's', null, 'k', 's'], '8n');
    // counter: agitated ostinato
    const ost = this.lead(L.counter, -18, 'square');
    this.seq((t, n) => n && ost.triggerAttackRelease(n, '16n', t),
      ['G4', 'Ab4', 'G4', 'F4', 'G4', 'Bb4', 'Ab4', 'G4'], '16n');
  }

  themeBoss(final = false) {
    this._bossBpm = final ? 140 : 132;
    Tone.Transport.bpm.value = this._bossBpm;
    const L = this.layers;
    // driving bass riff (Bramble motif skeleton in the final)
    const bass = this.bass(L.base, -8, 'fatsawtooth');
    const riff = final
      ? ['D2', 'D2', 'F2', 'D2', 'Ab2', 'G2', 'F2', 'D2']
      : ['D2', 'D2', 'F2', 'D2', 'A1', 'A1', 'C2', 'D2'];
    this.seq((t, n) => n && bass.triggerAttackRelease(n, '8n', t), riff, '8n');
    const stab = this.pad(L.base, -16);
    this.seq((t, ch) => ch && stab.triggerAttackRelease(ch, '8n', t),
      [['D3', 'F3', 'A3'], null, null, null, final ? ['Ab3', 'C4', 'Eb4'] : ['C3', 'E3', 'G3'], null, null, null], '8n');
    // perc: full kit (part of base for bosses — always driving)
    const k = this.kick(L.base, -8), sn = this.snare(L.base), h = this.hat(L.perc, -22);
    this.seq((t, v) => {
      if (v === 'k') k.triggerAttackRelease('B0', '8n', t);
      if (v === 's') sn.triggerAttackRelease('16n', t);
    }, ['k', null, 's', null, 'k', 'k', 's', null], '8n');
    this.seq((t) => h.triggerAttackRelease('32n', t), [1, 1, 1, 1, 1, 1, 1, 1], '8n');
    // counter: frantic arp
    const lead = this.lead(L.counter, -16, 'sawtooth');
    this.seq((t, n) => n && lead.triggerAttackRelease(n, '16n', t),
      ['D5', 'F5', 'A5', 'D6', 'C6', 'A5', 'F5', 'E5', 'D5', 'F5', 'Ab5', 'G5', 'F5', 'E5', 'F5', 'D5'], '16n');
    // bosses start hot
    this.layers.perc.gain.value = 1;
    this._intApplied.perc = 1;
  }

  themeTitle() {
    Tone.Transport.bpm.value = 76;
    const L = this.layers;
    const pad = this.pad(L.base, -18);
    this.seq((t, ch) => ch && pad.triggerAttackRelease(ch, '1m', t),
      [['C4', 'E4', 'G4', 'B4'], ['F3', 'A3', 'C4', 'E4'], ['A3', 'C4', 'E4', 'G4'], ['G3', 'B3', 'D4', 'F4']], '1m');
    const pluck = this.pluckSyn(L.base, -15);
    this.seq((t, n) => n && pluck.triggerAttackRelease(n, '8n', t),
      ['C5', null, 'E5', null, 'G5', null, 'A5', null, 'G5', null, 'E5', null, null, null, 'D5', null], '8n');
  }

  themeOverworld() {
    Tone.Transport.bpm.value = 100;
    const L = this.layers;
    const bass = this.bass(L.base, -12);
    this.seq((t, n) => n && bass.triggerAttackRelease(n, '8n', t),
      ['C2', null, 'C3', null, 'F2', null, 'F2', 'G2'], '8n');
    const pluck = this.pluckSyn(L.base, -14);
    this.seq((t, n) => n && pluck.triggerAttackRelease(n, '8n', t),
      ['E5', 'G5', null, 'C6', null, 'A5', 'G5', null, 'F5', 'A5', null, 'G5', 'E5', null, 'D5', null], '8n');
  }
}
