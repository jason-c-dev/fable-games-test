// Audio core: Tone.js buses (music/sfx), reverb+delay sends, sidechain-style
// ducking, the full synthesized SFX bank, and the per-frame update that
// feeds music intensity. Everything is synthesized — no audio files.
// Uses the global Tone (vendor/tone.js UMD build).

/* global Tone */
import { Music } from './music.js';

export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ready = false;
    this.starting = false;
    this.throttle = new Map();
    this.music = null;
    this._beamHum = null;
    this._windNoise = null;
    this._pending = [];
  }

  // must be called from a user-gesture handler
  async unlock() {
    if (this.ready || this.starting || typeof Tone === 'undefined') return;
    this.starting = true;
    try {
      await Tone.start();
      this.build();
      this.ready = true;
      for (const fn of this._pending) fn();
      this._pending = [];
    } catch (err) {
      console.warn('audio unlock failed', err);
    }
    this.starting = false;
  }

  build() {
    const dest = Tone.getDestination();
    dest.volume.value = -3;

    this.masterMute = new Tone.Gain(this.settings.mute ? 0 : 1).connect(dest);
    this.musicBus = new Tone.Gain(this.settings.musicVol).connect(this.masterMute);
    this.duck = new Tone.Gain(1).connect(this.musicBus);
    this.sfxBus = new Tone.Gain(this.settings.sfxVol).connect(this.masterMute);

    // sends
    this.reverb = new Tone.Reverb({ decay: 2.4, preDelay: 0.02, wet: 1 }).connect(this.masterMute);
    this.reverbSend = new Tone.Gain(0.14).connect(this.reverb);
    this.delay = new Tone.FeedbackDelay('3n', 0.35);
    this.delay.wet.value = 1;
    this.delaySend = new Tone.Gain(0.0).connect(this.delay);
    this.delay.connect(this.masterMute);

    this.sfxBus.connect(this.reverbSend);
    this.buildSynths();
    this.music = new Music(this.duck, this.reverbSend, this.delaySend);
  }

  applySettings() {
    if (!this.ready) return;
    this.masterMute.gain.rampTo(this.settings.mute ? 0 : 1, 0.1);
    this.musicBus.gain.rampTo(this.settings.musicVol, 0.1);
    this.sfxBus.gain.rampTo(this.settings.sfxVol, 0.1);
  }

  duckMusic(amount = 0.4, time = 0.5) {
    if (!this.ready) return;
    const now = Tone.now();
    this.duck.gain.cancelScheduledValues(now);
    this.duck.gain.setValueAtTime(this.duck.gain.value, now);
    this.duck.gain.linearRampToValueAtTime(1 - amount, now + 0.03);
    this.duck.gain.linearRampToValueAtTime(1, now + time);
  }

  // ------------------------------------------------------------- synths --
  buildSynths() {
    const out = this.sfxBus;
    this.syn = {
      blip: new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.002, decay: 0.08, sustain: 0, release: 0.05 }, volume: -14 }).connect(out),
      pluck: new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.08 }, volume: -10 }).connect(out),
      soft: new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.004, decay: 0.15, sustain: 0, release: 0.1 }, volume: -8 }).connect(out),
      saw: new Tone.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.06 }, volume: -13 }).connect(out),
      bell: new Tone.FMSynth({ harmonicity: 3.5, modulationIndex: 14, envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.2 }, modulationEnvelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 }, volume: -12 }).connect(out),
      metal: new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.16, release: 0.05 }, harmonicity: 4.1, resonance: 3000, volume: -18 }).connect(out),
      thud: new Tone.MembraneSynth({ pitchDecay: 0.03, octaves: 4, envelope: { attack: 0.001, decay: 0.22, sustain: 0 }, volume: -8 }).connect(out),
      chord: new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.005, decay: 0.25, sustain: 0.1, release: 0.3 }, volume: -14 }).connect(out),
    };
    // noise through a sweepable filter
    this.noiseFilter = new Tone.Filter(1200, 'bandpass').connect(out);
    this.syn.noise = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.002, decay: 0.12, sustain: 0 }, volume: -12 }).connect(this.noiseFilter);
    this.lowFilter = new Tone.Filter(400, 'lowpass').connect(out);
    this.syn.noiseLow = new Tone.NoiseSynth({ noise: { type: 'brown' }, envelope: { attack: 0.004, decay: 0.25, sustain: 0 }, volume: -8 }).connect(this.lowFilter);

    this.syn.pluck.connect(this.delaySend);
    this.syn.bell.connect(this.reverbSend);
    this.syn.chord.connect(this.reverbSend);
  }

  // fire-and-forget SFX by name; safe before unlock (dropped)
  sfx(name, data = {}) {
    if (!this.ready) return;
    const now = performance.now();
    const lastT = this.throttle.get(name) || 0;
    if (now - lastT < 45) return;
    this.throttle.set(name, now);
    const t = Tone.now();
    const S = this.syn;
    const nf = (freq, q = 1) => { this.noiseFilter.frequency.setValueAtTime(freq, t); this.noiseFilter.Q.value = q; };
    try {
      switch (name) {
        case 'jump': S.blip.triggerAttackRelease('C5', 0.06, t); S.blip.frequency.rampTo('G5', 0.06, t); break;
        case 'walljump': S.blip.triggerAttackRelease('E5', 0.05, t); S.blip.frequency.rampTo('B5', 0.05, t); break;
        case 'land': S.thud.triggerAttackRelease('A1', 0.08, t); break;
        case 'dash': nf(900); S.noise.envelope.decay = 0.14; S.noise.triggerAttackRelease(0.13, t); this.noiseFilter.frequency.rampTo(300, 0.13, t); break;
        case 'swing': nf(1600, 2); S.noise.envelope.decay = 0.07; S.noise.triggerAttackRelease(0.07, t); this.noiseFilter.frequency.rampTo(2600, 0.07, t); break;
        case 'spin': nf(1200, 2); S.noise.envelope.decay = 0.2; S.noise.triggerAttackRelease(0.2, t); this.noiseFilter.frequency.rampTo(2400, 0.2, t); break;
        case 'slashhit': S.metal.triggerAttackRelease('C4', 0.06, t); S.thud.triggerAttackRelease('C2', 0.06, t + 0.005); this.duckMusic(0.2, 0.18); break;
        case 'slashhitheavy': S.metal.triggerAttackRelease('G3', 0.09, t); S.thud.triggerAttackRelease('G1', 0.1, t); this.duckMusic(0.3, 0.3); break;
        case 'clang': S.metal.triggerAttackRelease('E5', 0.12, t); break;
        case 'parrystart': S.blip.triggerAttackRelease('B5', 0.03, t); break;
        case 'parry':
          S.bell.triggerAttackRelease('E6', 0.25, t);
          S.chord.triggerAttackRelease(['C6', 'E6', 'G6'], 0.2, t + 0.03);
          this.duckMusic(0.55, 0.7);
          break;
        case 'parrywhiff': S.thud.triggerAttackRelease('E2', 0.04, t); break;
        case 'deflect': S.metal.triggerAttackRelease('A5', 0.05, t); break;
        case 'hurt': S.saw.triggerAttackRelease('G3', 0.15, t); S.saw.frequency.rampTo('C3', 0.15, t); this.duckMusic(0.4, 0.4); break;
        case 'die': S.saw.triggerAttackRelease('C4', 0.5, t); S.saw.frequency.rampTo('C2', 0.5, t); this.duckMusic(0.7, 1.4); break;
        case 'coin': S.pluck.triggerAttackRelease('E6', 0.05, t); S.pluck.triggerAttackRelease('B6', 0.08, t + 0.05); break;
        case 'fruit': case 'heal': S.chord.triggerAttackRelease(['C5', 'E5', 'G5'], 0.25, t); break;
        case 'healtick': S.soft.triggerAttackRelease(data.n || 'C5', 0.05, t); break;
        case 'oneup': S.chord.triggerAttackRelease(['C5', 'E5', 'G5', 'C6'], 0.3, t); break;
        case 'blockbump': S.thud.triggerAttackRelease('E3', 0.05, t); break;
        case 'brickbreak': nf(700, 0.6); S.noise.envelope.decay = 0.16; S.noise.triggerAttackRelease(0.16, t); S.thud.triggerAttackRelease('C2', 0.05, t); break;
        case 'stomp': S.blip.triggerAttackRelease('G4', 0.07, t); S.blip.frequency.rampTo('C5', 0.07, t); break;
        case 'pogo': S.pluck.triggerAttackRelease('C5', 0.06, t); S.pluck.frequency.rampTo('A5', 0.06, t); break;
        case 'spring': S.pluck.triggerAttackRelease('G4', 0.12, t); S.pluck.frequency.rampTo('G5', 0.12, t); break;
        case 'plungestart': nf(500); S.noise.envelope.decay = 0.08; S.noise.triggerAttackRelease(0.08, t); break;
        case 'plungeland': S.thud.triggerAttackRelease('F1', 0.12, t); nf(400, 0.6); S.noise.triggerAttackRelease(0.14, t); break;
        case 'shellstun': S.thud.triggerAttackRelease('D3', 0.06, t); break;
        case 'shellkick': case 'shellbounce': S.metal.triggerAttackRelease('D4', 0.05, t); break;
        case 'ricochet': S.metal.triggerAttackRelease('A5', 0.1, t); S.blip.triggerAttackRelease('E6', 0.05, t + 0.04); break;
        case 'shieldbreak': S.metal.triggerAttackRelease('C3', 0.2, t); nf(1800, 3); S.noise.triggerAttackRelease(0.12, t); break;
        case 'enemyparry': S.metal.triggerAttackRelease('F5', 0.08, t); break;
        case 'enemyhit': S.thud.triggerAttackRelease('D2', 0.05, t); break;
        case 'enemydie': nf(900, 0.8); S.noise.envelope.decay = 0.12; S.noise.triggerAttackRelease(0.12, t); S.pluck.triggerAttackRelease('C4', 0.08, t); break;
        case 'glint': case 'duelwindup': case 'bossglint': S.bell.triggerAttackRelease('B6', 0.12, t); break;
        case 'splash': nf(600, 0.7); S.noise.envelope.decay = 0.25; S.noise.triggerAttackRelease(0.25, t); this.noiseFilter.frequency.rampTo(200, 0.25, t); break;
        case 'stroke': S.soft.triggerAttackRelease('D4', 0.06, t); S.soft.frequency.rampTo('G4', 0.06, t); break;
        case 'waterleap': nf(900, 0.8); S.noise.envelope.decay = 0.14; S.noise.triggerAttackRelease(0.14, t); break;
        case 'wallgrab': nf(500, 0.7); S.noise.envelope.decay = 0.05; S.noise.triggerAttackRelease(0.05, t); break;
        case 'ledgegrab': S.thud.triggerAttackRelease('G2', 0.04, t); break;
        case 'dropthrough': break;
        case 'beamready': S.bell.triggerAttackRelease('G6', 0.1, t); break;
        case 'beamfizzle': S.saw.triggerAttackRelease('E3', 0.08, t); break;
        case 'overheat': nf(2400, 0.5); S.noise.envelope.decay = 0.5; S.noise.triggerAttackRelease(0.5, t); this.noiseFilter.frequency.rampTo(500, 0.5, t); break;
        case 'crystal': S.bell.triggerAttackRelease('C7', 0.3, t); S.bell.triggerAttackRelease('G6', 0.2, t + 0.07); break;
        case 'gateopen': S.thud.triggerAttackRelease('C2', 0.3, t); S.chord.triggerAttackRelease(['D5', 'A5'], 0.3, t + 0.1); break;
        case 'crumble': nf(300, 0.5); S.noise.envelope.decay = 0.1; S.noise.triggerAttackRelease(0.1, t); break;
        case 'crumblego': nf(400, 0.5); S.noise.envelope.decay = 0.2; S.noise.triggerAttackRelease(0.2, t); break;
        case 'lob': S.soft.triggerAttackRelease('A3', 0.06, t); break;
        case 'burr': S.blip.triggerAttackRelease('D5', 0.04, t); break;
        case 'podarm': S.saw.triggerAttackRelease('D3', 0.1, t); break;
        case 'swoop': nf(1000, 1.5); S.noise.envelope.decay = 0.18; S.noise.triggerAttackRelease(0.18, t); this.noiseFilter.frequency.rampTo(400, 0.18, t); break;
        case 'wisplit': S.bell.triggerAttackRelease('E6', 0.2, t); break;
        case 'mount': S.pluck.triggerAttackRelease('G4', 0.08, t); break;
        case 'chomp': S.thud.triggerAttackRelease('B2', 0.06, t); S.blip.triggerAttackRelease('D4', 0.03, t + 0.04); break;
        case 'mossflee': S.saw.triggerAttackRelease('A4', 0.1, t); S.saw.frequency.rampTo('E4', 0.1, t); break;
        case 'burst': S.chord.triggerAttackRelease(['C4', 'G4', 'C5', 'E5'], 0.5, t); nf(800, 0.7); S.noise.envelope.decay = 0.3; S.noise.triggerAttackRelease(0.3, t); this.duckMusic(0.5, 0.8); break;
        case 'bloomfang': S.chord.triggerAttackRelease(['E5', 'B5'], 0.15, t); break;
        case 'dronelaser': S.saw.triggerAttackRelease('C6', 0.15, t); S.saw.frequency.rampTo('C5', 0.15, t); break;
        case 'bossroar': S.noiseLow?.triggerAttackRelease?.(0.5, t); S.saw.triggerAttackRelease('F2', 0.5, t); S.saw.frequency.rampTo('C2', 0.5, t); this.duckMusic(0.6, 1); break;
        case 'bosshit': S.metal.triggerAttackRelease('F3', 0.1, t); S.thud.triggerAttackRelease('F1', 0.12, t); break;
        case 'bossstun': S.thud.triggerAttackRelease('C2', 0.2, t); S.metal.triggerAttackRelease('C4', 0.15, t + 0.03); break;
        case 'bossslam': S.thud.triggerAttackRelease('G1', 0.25, t); this.syn.noiseLow.triggerAttackRelease(0.3, t); break;
        case 'bosscharge': this.syn.noiseLow.triggerAttackRelease(0.4, t); break;
        case 'bossburst': nf(1000, 0.8); S.noise.envelope.decay = 0.25; S.noise.triggerAttackRelease(0.25, t); S.thud.triggerAttackRelease('D2', 0.1, t); break;
        case 'hazard': S.saw.triggerAttackRelease('E3', 0.12, t); S.saw.frequency.rampTo('A2', 0.12, t); break;
        case 'emergewind': this.syn.noiseLow.triggerAttackRelease(0.25, t); break;
        case 'grubemerge': S.thud.triggerAttackRelease('E1', 0.2, t); this.syn.noiseLow.triggerAttackRelease(0.3, t); break;
        case 'grubspit': S.soft.triggerAttackRelease('G3', 0.06, t); break;
        case 'grubdive': this.syn.noiseLow.triggerAttackRelease(0.2, t); break;
        case 'featherfan': nf(2200, 1.2); S.noise.envelope.decay = 0.18; S.noise.triggerAttackRelease(0.18, t); break;
        case 'gust': nf(700, 0.4); S.noise.envelope.decay = 0.6; S.noise.triggerAttackRelease(0.6, t); this.noiseFilter.frequency.rampTo(1400, 0.6, t); break;
        case 'bossleap': S.thud.triggerAttackRelease('D2', 0.1, t); break;
        case 'safereturn': S.soft.triggerAttackRelease('C5', 0.08, t); break;
        case 'respawn': S.chord.triggerAttackRelease(['G4', 'C5'], 0.2, t); break;
        case 'pickup': S.blip.triggerAttackRelease('A4', 0.04, t); break;
        case 'throw': nf(1100, 1.5); S.noise.envelope.decay = 0.08; S.noise.triggerAttackRelease(0.08, t); break;
        case 'dashrefresh': S.soft.triggerAttackRelease('A5', 0.03, t); break;
        case 'charged': S.bell.triggerAttackRelease('D6', 0.15, t); break;
        case 'uimove': S.blip.triggerAttackRelease('C6', 0.025, t); break;
        case 'uiok': S.pluck.triggerAttackRelease('G5', 0.06, t); S.pluck.triggerAttackRelease('C6', 0.08, t + 0.05); break;
        case 'uibad': S.saw.triggerAttackRelease('C3', 0.1, t); break;
        case 'pause': S.soft.triggerAttackRelease('G4', 0.08, t); break;
        case 'unpause': S.soft.triggerAttackRelease('C5', 0.08, t); break;
        case 'shrinebuy': S.chord.triggerAttackRelease(['D5', 'F#5', 'A5', 'D6'], 0.35, t); break;
        case 'gameover': this.music?.stinger('gameover'); break;
        default: break;
      }
    } catch (err) { /* a dropped sound never breaks the game */ }
  }

  // sim events -> sounds (the renderer forwards its event stream here)
  handleEvent(ev, world) {
    if (!this.ready) return;
    switch (ev.t) {
      case 'slashhit': this.sfx(ev.heavy ? 'slashhitheavy' : 'slashhit'); break;
      case 'star': this.music?.stinger('star'); break;
      case 'checkpoint': this.music?.stinger('checkpoint'); break;
      case 'goal': this.music?.stinger(ev.secret ? 'secret' : 'goal'); this.duckMusic(0.8, 2.5); break;
      case 'bossdead': this.music?.stinger('bossdead'); break;
      case 'bossphase': this.music?.bossPhase(ev.phase); this.sfx('bossroar'); break;
      case 'bossduel': this.music?.duelMode(true); this.sfx('bossroar'); break;
      case 'brambledown': this.music?.duelMode(false); this.music?.stinger('bossdead'); this.duckMusic(0.8, 3); break;
      case 'bosswhip': this.sfx('swing'); break;
      case 'bosslunge': this.sfx('bosscharge'); break;
      case 'bosssummon': this.sfx('podarm'); break;
      case 'relic': case 'relicbeam': this.music?.stinger('secret'); break;
      case 'shake': break;
      default: this.sfx(ev.t, ev); break;
    }
  }

  // per-frame: beam hum, wind bed, adaptive intensity
  update(world, mode, dt) {
    if (!this.ready) return;
    const p = world?.player;

    // beam hum
    const humOn = p && p.beamFire > 0;
    if (humOn && !this._beamHum) {
      const osc = new Tone.Oscillator('C3', 'sawtooth');
      const vib = new Tone.Vibrato(9, 0.4);
      const g = new Tone.Gain(0.09);
      osc.connect(vib); vib.connect(g); g.connect(this.sfxBus);
      osc.start();
      this._beamHum = { osc, g, vib };
    } else if (!humOn && this._beamHum) {
      const b = this._beamHum; this._beamHum = null;
      b.g.gain.rampTo(0, 0.1);
      setTimeout(() => { b.osc.stop(); b.osc.dispose(); b.vib.dispose(); b.g.dispose(); }, 200);
    }

    // adaptive music intensity
    if (this.music && mode === 'level' && world) {
      let intensity = 0.25;
      if (world.boss && world.boss.engaged && !world.boss.removed) {
        intensity = 0.85 + world.boss.phase * 0.075;
      } else {
        let danger = 0;
        for (const e of world.entities) {
          if (e.isEnemy && !e.dying && e.active && Math.abs(e.x - p.x) < 130 && Math.abs(e.y - p.y) < 90) danger++;
        }
        if (danger >= 1) intensity = 0.55;
        if (danger >= 3) intensity = 0.8;
        if (world.run.hearts <= 1) intensity = Math.min(1, intensity + 0.15);
        if (world.lava) intensity = Math.max(intensity, 0.7);
      }
      this.music.setIntensity(intensity);
    }
  }
}
