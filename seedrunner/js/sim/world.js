// World: one run of Seedrunner. Owns the track, Pip, the Rot Tide, score,
// hit-stop/slow-mo (with input latching through both — presses are never
// eaten), checkpoints, and the sim->render/audio event stream. Node-safe.

import { PLAYER, TIDE, SCORE, SPEED, STEP } from '../config.js';
import { Track } from './track.js';
import { Player } from './player.js';
import { Tide } from './tide.js';
import { makeRng, hashString, lerp, clamp } from '../core/math.js';

export class World {
  // runDef: { id, name, kind: 'campaign'|'endless'|'gym', chunks: [ids],
  //           speedStart, speedEnd, endless?: {base, perM, cap},
  //           tide?: {...TIDE overrides}, composer?: (world) => chunkId }
  constructor(runDef, opts = {}) {
    this.def = runDef;
    this.seed = opts.seed ?? hashString(runDef.id);
    this.rng = makeRng(this.seed);
    this.tideCfg = { ...TIDE, ...(runDef.tide || {}) };

    this.player = new Player();
    this.track = new Track();
    for (const c of runDef.chunks || []) this.track.append(c);
    if (runDef.kind === 'endless') this._extend();

    this.tide = new Tide(this);
    this.frame = 0;
    this.time = 0;
    this.dew = 0;
    this.chain = 0;
    this.bestChain = 0;
    this.carrying = false;      // holding the Sun Seed
    this.parries = 0;
    this.stumbles = 0;
    this.events = [];
    this.hitstop = 0;
    this.slowmo = 0;
    this.finished = false;
    this.finishT = 0;
    this.dead = false;
    this.deadT = 0;
    this.deathCause = null;
    this.checkpoint = null;

    if (opts.checkpoint) this._restore(opts.checkpoint);
  }

  emit(t, data) { this.events.push(data ? { t, ...data } : { t }); }

  speedAt(d) {
    const def = this.def;
    if (def.kind === 'endless') {
      const e = def.endless;
      return Math.min(e.cap, e.base + d * e.perM);
    }
    const t = clamp(d / Math.max(this.track.length, 1), 0, 1);
    return lerp(def.speedStart, def.speedEnd ?? def.speedStart, t);
  }

  // presses that land during hit-stop / slow-mo skipped frames are latched
  _latchPressed(inp) {
    this._latch ||= {};
    for (const k in inp.pressed) if (inp.pressed[k]) this._latch[k] = true;
  }

  step(inp) {
    this.events = [];
    if (this.hitstop > 0) { this.hitstop--; this._latchPressed(inp); return; }
    if (this.slowmo > 0) {
      this.slowmo--;
      if (this.frame % 2 === 0) { this._latchPressed(inp); this.frame++; return; }
    }
    if (this._latch) {
      for (const k in this._latch) inp.pressed[k] = true;
      this._latch = null;
    }

    this.frame++;
    this.time += STEP;

    if (this.dead) { this.deadT++; return; }
    if (this.finished) {
      this.finishT++;
      // victory lap: ease to a trot so the celebration reads
      this.player.prevD = this.player.d;
      this.player.d += Math.max(3, this.speedAt(this.player.d) * Math.max(0, 1 - this.finishT / 90)) * STEP;
      return;
    }

    this.player.step(inp, this);
    this.tide.step(STEP);

    if (this.def.kind === 'endless') {
      if (this.player.d > this.track.length - 260) this._extend();
      if (this.frame % 300 === 0) this.track.trimBefore(this.tide.d);
    }

    // speed-tier chime for endless pacing
    const tierNow = SPEED.tiers.findIndex((s) => this.speedAt(this.player.d) <= s + 1e-9);
    if (this._tier != null && tierNow > this._tier) this.emit('speedtier', { tier: tierNow });
    this._tier = tierNow;
  }

  // ---- item outcomes (called by the player) ----
  collectDew(it) {
    this.dew += SCORE.dew;
    this.chain++;
    this.bestChain = Math.max(this.bestChain, this.chain);
    this.emit('dew', { chain: this.chain, y: it.y ?? 0 });
    if (this.chain % SCORE.chainStep === 0) {
      this.tide.push(this.tideCfg.dewChainPush);
      this.emit('chain', { chain: this.chain });
    }
  }

  breakChain() {
    this.stumbles++;
    this.chain = 0;
  }

  nearMiss(kind) {
    this.tide.push(this.tideCfg.nearMissPush);
    this.player.dashCd = Math.max(0, this.player.dashCd - 60);
    this.emit('nearmiss', { kind });
  }

  parrySuccess(it) {
    this.parries++;
    this.dew += SCORE.parryDew;
    this.hitstop = PLAYER.parryFreezeFrames;
    this.slowmo = PLAYER.parrySlowmoFrames;
    this.tide.push(this.tideCfg.parryPush);
    this.emit('parry', { at: it.d, lane: it.lane });
  }

  collectSeed(it) {
    this.carrying = true;
    this.emit('seed', { at: it.d });
  }

  hitCheckpoint(it) {
    this.checkpoint = { d: it.d, dew: this.dew, carrying: this.carrying };
    this.emit('checkpoint', { at: it.d });
  }

  finish(it) {
    this.finished = true;
    this.player.state = 'win';
    this.tide.push(this.tideCfg.seedPush);
    this.emit('win', { planted: this.carrying, at: it.d });
  }

  kill(cause) {
    if (this.dead || this.finished) return;
    this.dead = true;
    this.deathCause = cause;
    this.player.state = 'dead';
    this.emit('dead', { cause });
  }

  _restore(cp) {
    this.player.d = cp.d;
    this.player.prevD = cp.d;
    this.dew = cp.dew;
    this.carrying = cp.carrying;
    this.checkpoint = { ...cp };
    this.tide.d = cp.d - this.tideCfg.startGap;
    for (const it of this.track.items) {
      if (it.d < cp.d - 1) it._done = true;
      if (it.type === 'checkpoint' && Math.abs(it.d - cp.d) < 0.5) it._done = true;
    }
  }

  _extend() {
    while (this.track.length < this.player.d + 420) {
      const id = this.def.composer(this);
      this.track.append(id);
    }
  }
}
