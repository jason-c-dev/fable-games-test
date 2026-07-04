// Audio core: Tone.js buses (music/sfx), reverb+delay sends, ducking, the
// synthesized SFX bank, the Tide rumble bed, and the per-frame update that
// feeds music intensity from speed + Tide proximity. All code, no files.
// Uses the global Tone (vendor/tone.js UMD build).

/* global Tone */
import { Music } from './music.js';
import { TIDE } from '../config.js';

// dew chimes climb this scale with the chain
const DEW_SCALE = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6', 'G6', 'A6', 'C7'];

export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ready = false;
    this.starting = false;
    this.throttle = new Map();
    this.music = null;
    this._rumble = null;
  }

  // must be called from a user-gesture handler
  async unlock() {
    if (this.ready || this.starting || typeof Tone === 'undefined') return;
    this.starting = true;
    try {
      await Tone.start();
      this.build();
      this.ready = true;
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

    this.reverb = new Tone.Reverb({ decay: 2.6, preDelay: 0.02, wet: 1 }).connect(this.masterMute);
    this.reverbSend = new Tone.Gain(0.15).connect(this.reverb);
    this.delay = new Tone.FeedbackDelay('3n', 0.32);
    this.delay.wet.value = 1;
    this.delaySend = new Tone.Gain(0).connect(this.delay);
    this.delay.connect(this.masterMute);
    this.sfxBus.connect(this.reverbSend);

    this.buildSynths();
    this.music = new Music(this.duck, this.reverbSend, this.delaySend);

    // the Tide's rumble bed: brown noise through a low filter, gain = danger
    const f = new Tone.Filter(140, 'lowpass').connect(this.sfxBus);
    const noise = new Tone.Noise('brown');
    this._rumbleGain = new Tone.Gain(0).connect(f);
    noise.connect(this._rumbleGain);
    noise.start();
  }

  applySettings() {
    if (!this.ready) return;
    this.masterMute.gain.rampTo(this.settings.mute ? 0 : 1, 0.1);
    this.musicBus.gain.rampTo(this.settings.musicVol, 0.1);
    this.sfxBus.gain.rampTo(this.settings.sfxVol, 0.1);
  }

  duckMusic(amount = 0.4, time = 0.5) {
    if (!this.ready) return;
    try {
      const now = Tone.now();
      this.duck.gain.cancelScheduledValues(now);
      this.duck.gain.setValueAtTime(this.duck.gain.value, now);
      this.duck.gain.linearRampToValueAtTime(1 - amount, now + 0.03);
      this.duck.gain.linearRampToValueAtTime(1, now + time);
    } catch { /* never let audio break the run */ }
  }

  buildSynths() {
    const out = this.sfxBus;
    this.syn = {
      blip: new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.002, decay: 0.08, sustain: 0, release: 0.05 }, volume: -14 }).connect(out),
      pluck: new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.08 }, volume: -10 }).connect(out),
      soft: new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.004, decay: 0.15, sustain: 0, release: 0.1 }, volume: -9 }).connect(out),
      saw: new Tone.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.06 }, volume: -13 }).connect(out),
      bell: new Tone.FMSynth({ harmonicity: 3.5, modulationIndex: 14, envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.2 }, modulationEnvelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 }, volume: -12 }).connect(out),
      metal: new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.16, release: 0.05 }, harmonicity: 4.1, resonance: 3000, volume: -18 }).connect(out),
      thud: new Tone.MembraneSynth({ pitchDecay: 0.03, octaves: 4, envelope: { attack: 0.001, decay: 0.22, sustain: 0 }, volume: -8 }).connect(out),
      chord: new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.005, decay: 0.25, sustain: 0.1, release: 0.3 }, volume: -14 }).connect(out),
    };
    this.noiseFilter = new Tone.Filter(1200, 'bandpass').connect(out);
    this.syn.noise = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.002, decay: 0.12, sustain: 0 }, volume: -12 }).connect(this.noiseFilter);
    this.lowFilter = new Tone.Filter(400, 'lowpass').connect(out);
    this.syn.noiseLow = new Tone.NoiseSynth({ noise: { type: 'brown' }, envelope: { attack: 0.004, decay: 0.25, sustain: 0 }, volume: -8 }).connect(this.lowFilter);

    this.syn.pluck.connect(this.delaySend);
    this.syn.bell.connect(this.reverbSend);
    this.syn.chord.connect(this.reverbSend);
  }

  // fire-and-forget SFX by name; throttled per name; safe before unlock
  sfx(name, data = {}) {
    if (!this.ready) return;
    const now = performance.now();
    if (now - (this.throttle.get(name) || 0) < 45) return;
    this.throttle.set(name, now);
    const t = Tone.now();
    const S = this.syn;
    const nf = (freq, q = 1) => { this.noiseFilter.frequency.setValueAtTime(freq, t); this.noiseFilter.Q.value = q; };
    try {
      switch (name) {
        case 'jump': S.blip.triggerAttackRelease('C5', 0.06, t); S.blip.frequency.rampTo('G5', 0.06, t); break;
        case 'ramp': S.blip.triggerAttackRelease('E5', 0.08, t); S.blip.frequency.rampTo('C6', 0.08, t); break;
        case 'land': S.thud.triggerAttackRelease('A1', 0.07, t); break;
        case 'lane': nf(1500, 1.6); S.noise.envelope.decay = 0.07; S.noise.triggerAttackRelease(0.07, t); this.noiseFilter.frequency.rampTo(2400, 0.07, t); break;
        case 'slidestart': nf(700, 0.8); S.noise.envelope.decay = 0.14; S.noise.triggerAttackRelease(0.14, t); this.noiseFilter.frequency.rampTo(300, 0.14, t); break;
        case 'dash': nf(900); S.noise.envelope.decay = 0.16; S.noise.triggerAttackRelease(0.16, t); this.noiseFilter.frequency.rampTo(2000, 0.16, t); break;
        case 'dashrefresh': S.soft.triggerAttackRelease('A5', 0.04, t); break;
        case 'parrystart': S.blip.triggerAttackRelease('B5', 0.03, t); break;
        case 'parry':
          S.bell.triggerAttackRelease('E6', 0.3, t);
          S.chord.triggerAttackRelease(['C6', 'E6', 'G6'], 0.25, t + 0.03);
          nf(2200, 2); S.noise.envelope.decay = 0.2; S.noise.triggerAttackRelease(0.2, t);
          this.duckMusic(0.55, 0.8);
          break;
        case 'parrywhiff': S.thud.triggerAttackRelease('E2', 0.05, t); break;
        case 'glint': S.bell.triggerAttackRelease('B6', 0.14, t); break;
        case 'barrierdash': S.metal.triggerAttackRelease('C4', 0.08, t); nf(1600, 2); S.noise.triggerAttackRelease(0.1, t); break;
        case 'stumble': S.saw.triggerAttackRelease('G3', 0.16, t); S.saw.frequency.rampTo('C3', 0.16, t); S.thud.triggerAttackRelease('C2', 0.08, t); this.duckMusic(0.4, 0.45); break;
        case 'fall': nf(500, 0.7); S.noiseLow.triggerAttackRelease(0.3, t); S.saw.triggerAttackRelease('E3', 0.2, t); S.saw.frequency.rampTo('A2', 0.2, t); this.duckMusic(0.4, 0.5); break;
        case 'dead': S.saw.triggerAttackRelease('C4', 0.6, t); S.saw.frequency.rampTo('C2', 0.6, t); S.noiseLow.triggerAttackRelease(0.5, t); this.duckMusic(0.8, 1.6); break;
        case 'dew': {
          const n = DEW_SCALE[Math.min(Math.floor((data.chain ?? 0) / 4), DEW_SCALE.length - 1)];
          S.pluck.triggerAttackRelease(n, 0.05, t);
          break;
        }
        case 'chain': S.chord.triggerAttackRelease(['C6', 'E6', 'G6', 'C7'], 0.25, t); break;
        case 'nearmiss': S.soft.triggerAttackRelease('D5', 0.05, t); S.soft.frequency.rampTo('A5', 0.05, t); break;
        case 'seed': S.chord.triggerAttackRelease(['C5', 'E5', 'G5', 'C6'], 0.4, t); this.music?.stinger('seed'); this.duckMusic(0.5, 1); break;
        case 'checkpoint': this.music?.stinger('checkpoint'); break;
        case 'tidesurge': S.noiseLow.triggerAttackRelease(0.5, t); S.thud.triggerAttackRelease('F1', 0.3, t); this.duckMusic(0.35, 0.6); break;
        case 'tidepush': nf(400, 0.6); S.noise.envelope.decay = 0.12; S.noise.triggerAttackRelease(0.12, t); break;
        case 'speedtier': S.bell.triggerAttackRelease('G6', 0.1, t); S.bell.triggerAttackRelease('C7', 0.12, t + 0.08); break;
        case 'win': this.music?.stinger('victory'); this.duckMusic(0.8, 2.5); break;
        case 'victory': this.music?.stinger('victory'); break;
        case 'sign': S.soft.triggerAttackRelease('G4', 0.06, t); break;
        case 'uimove': S.blip.triggerAttackRelease('C6', 0.025, t); break;
        case 'uiok': S.pluck.triggerAttackRelease('G5', 0.06, t); S.pluck.triggerAttackRelease('C6', 0.08, t + 0.05); break;
        case 'uibad': S.saw.triggerAttackRelease('C3', 0.1, t); break;
        case 'pause': S.soft.triggerAttackRelease('G4', 0.08, t); break;
        case 'unpause': S.soft.triggerAttackRelease('C5', 0.08, t); break;
        default: break;
      }
    } catch { /* a dropped sound never breaks the game */ }
  }

  // sim events -> sounds
  handleEvent(ev) {
    if (!this.ready) return;
    if (ev.t === 'land' && !ev.hard) return;      // soft landings stay quiet
    this.sfx(ev.t, ev);
  }

  // per-frame: music scene + intensity from speed and Tide proximity
  update(world, mode, biome) {
    if (!this.ready || !this.music) return;
    try {
      if (mode === 'title' || mode === 'select' || mode === 'settings' || mode === 'attract') {
        this.music.setScene('title');
      } else if (mode === 'credits' || mode === 'cutscene') {
        this.music.setScene('credits');
      } else if (mode === 'results') {
        // keep the last scene under the results card
      } else if ((mode === 'run') && world) {
        this.music.setScene(world.def.finale ? 'finale' : 'run', { biome });
      }

      let danger = 0;
      if (world && (mode === 'run' || mode === 'attract')) {
        const speed = world.speedAt(world.player.d);
        const speedNorm = Math.min(1, Math.max(0, (speed - 9) / 13.5));
        danger = Math.min(1, Math.max(0, 1 - (world.tide.gap - TIDE.catchGap) / TIDE.dangerGap));
        this.music.setIntensity(0.3 + speedNorm * 0.4 + danger * 0.3, danger);
      }
      this._rumbleGain?.gain?.rampTo(danger * 0.5, 0.2);
    } catch { /* keep running silently */ }
  }
}
