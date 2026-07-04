// The Rot Tide: a wall of crawling dark growth behind Pip. Its distance IS
// the health bar. It runs at the track's nominal speed plus a creep, so any
// slowdown (stumble) costs gap naturally; perfect play pushes it back.

import { SPEED } from '../config.js';
import { clamp } from '../core/math.js';

export const tierOf = (speed) => {
  for (let i = 0; i < SPEED.tiers.length; i++) if (speed <= SPEED.tiers[i] + 1e-9) return i;
  return SPEED.tiers.length - 1;
};

export class Tide {
  constructor(world) {
    this.world = world;
    this.d = world.player.d - world.tideCfg.startGap;
  }

  get gap() { return this.world.player.d - this.d; }

  step(dt) {
    const w = this.world;
    this.prevD = this.d;
    if (w.finished || w.dead) return;
    const cfg = w.tideCfg;
    const nominal = w.speedAt(w.player.d);
    const creep = cfg.creepBase + cfg.creepPerTier * tierOf(nominal);
    this.d += (nominal + creep) * dt;
    if (this.gap > cfg.maxGap) this.d = w.player.d - cfg.maxGap;
    if (this.gap <= cfg.catchGap) w.kill('tide');
  }

  surge(m) {          // tide lunges closer (mistakes)
    this.d += m;
    if (this.gap <= this.world.tideCfg.catchGap + 0.01) {
      this.d = this.world.player.d - (this.world.tideCfg.catchGap + 0.01);
      // a surge alone never outright kills mid-i-frames; the creep finishes it
    }
    this.world.emit('tidesurge', { gap: this.gap });
  }

  push(m) {           // pushed back (parry, near-miss, chains, seeds)
    this.d = this.world.player.d - clamp(this.gap + m, 0, this.world.tideCfg.maxGap);
    this.world.emit('tidepush', { gap: this.gap });
  }
}
