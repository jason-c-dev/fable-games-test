// The runner bot: plays the REAL sim. Three hats, one brain:
//   - verifier bot (reaction-limited): proves every chunk is humanly fair
//   - probe bot (frame-perfect): reality-checks capabilities.js
//   - attract demo / credits: what the player watches on the title screen
// It has a handler for every player state and always HOLDS jump through a
// maneuver (Lessons Ledger #3/#4). It never needs dash to survive — dash is
// bonus by design — but uses it for flair in demo mode.

import { PLAYER, LANES, OBSTACLES, SPEED, STEP } from '../config.js';
import { laneX } from './chunks.js';
import * as cap from './capabilities.js';

const THREATS = new Set(['block', 'arch', 'barrier', 'gap']);
const KEYS = ['left', 'right', 'jump', 'slide', 'dash', 'parry'];

export class Bot {
  constructor(world, { reaction = 0, demo = false } = {}) {
    this.world = world;
    this.reaction = reaction;           // seconds from "seen" to earliest action
    this.demo = demo;
    this.prevHeld = {};
    this.commit = null;                 // active maneuver
    this.seen = new Map();              // item -> world.time first visible
    this._switchPlan = null;
  }

  // effective visibility of an item (cavern darkness; barriers/glints glow)
  _visibility(it) {
    if (this.world.track.biomeAt(it.d) === 'cavern' && it.type !== 'barrier' && !this.world.track.litAt(it.d)) {
      return SPEED.darkVisibility;
    }
    return SPEED.visibility;
  }

  _actionable(it) {
    const dist = it.d - this.world.player.d;
    if (!this.seen.has(it)) {
      if (dist <= this._visibility(it)) this.seen.set(it, this.world.time);
      else return false;
    }
    return this.world.time >= this.seen.get(it) + this.reaction;
  }

  _laneItems(lane, d0, d1) {
    return this.world.track.itemsInRange(d0, d1, 40)
      .filter((it) => THREATS.has(it.type) && it.lane === lane && !it._done && !it._hit);
  }

  // is [d0,d1] in this lane free of anything that would need a verb?
  _laneClear(lane, d0, d1) {
    return this._laneItems(lane, d0, d1).length === 0;
  }

  _nextThreat(lane, fromD, horizon) {
    const items = this._laneItems(lane, fromD, fromD + horizon);
    for (const it of items) {
      const back = it.dEnd ?? it.d;
      if (back + 1 < fromD) continue;
      return it;
    }
    return null;
  }

  // can this threat be handled without leaving the lane at this speed?
  _solvableInLane(it, speed) {
    if (it.type === 'gap') return cap.maxGapCross(speed) >= (it.dEnd - it.d) + 0.9;
    if (it.type === 'arch') {
      // contiguous arch span must fit inside one max slide
      const span = this._archSpanEnd(it) - it.d + OBSTACLES.archDepth;
      return cap.slideLenMax(speed) > span + 1.4;
    }
    return true;      // block: jump; barrier: parry
  }

  _archSpanEnd(first) {
    let end = first.d;
    let cur = first;
    for (;;) {
      const next = this._laneItems(cur.lane, cur.d + 0.1, cur.d + OBSTACLES.archDepth + 3.2)
        .find((it) => it.type === 'arch' && it !== cur);
      if (!next) return end;
      end = next.d;
      cur = next;
    }
  }

  step() {
    const w = this.world;
    const p = w.player;
    const held = {};
    const speed = w.speedAt(p.d);

    if (p.state === 'dead' || p.state === 'win' || w.finished || w.dead) {
      return this._makeInput(held);
    }

    // ---- active commitment: see it through ----
    if (this.commit) {
      const c = this.commit;
      if (c.type === 'jump') {
        held.jump = true;                                 // ALWAYS hold through
        if (p.grounded && p.d > c.until) this.commit = null;
        else if (p.grounded && c.started && p.airFrames === 0 && w.frame - c.frame > 5 && p.d > c.until - 0.01) this.commit = null;
      } else if (c.type === 'slide') {
        held.slide = true;
        if (p.d > c.until) this.commit = null;
      } else if (c.type === 'parry') {
        if (c.item._done || p.d > c.item.d + 1) this.commit = null;
      }
      if (this.commit && c.type === 'jump' && !c.started && p.state === 'air') c.started = true;
    }

    // ---- plan against the nearest threat in the current lane ----
    const horizon = speed * 3 + 12;
    const threat = this._nextThreat(p.lane, p.d - 1.5, horizon);

    if (threat && this._actionable(threat) && !this.commit) {
      const dist = threat.d - p.d;
      const back = (threat.dEnd ?? threat.d + (threat.type === 'block' ? OBSTACLES.blockDepth
        : threat.type === 'arch' ? OBSTACLES.archDepth : OBSTACLES.barrierDepth));

      if (!this._solvableInLane(threat, speed) || this._preferSwitch(threat, speed)) {
        this._planSwitch(threat, speed);
      } else if (threat.type === 'block') {
        const [latest] = cap.blockJumpWindow(speed);
        if (dist <= latest + speed * 2 * STEP && p.grounded) {
          held.jump = true;
          this.commit = { type: 'jump', until: back + PLAYER.radius + 0.2, frame: w.frame };
        }
      } else if (threat.type === 'gap') {
        const len = threat.dEnd - threat.d;
        const lead = Math.max(0.6, cap.jumpDistance(speed) - len - 1.6);
        if (dist <= lead && p.grounded) {
          held.jump = true;
          this.commit = { type: 'jump', until: threat.dEnd + 0.6, frame: w.frame };
        }
      } else if (threat.type === 'arch') {
        if (dist <= speed * 6 * STEP + 1.2 && p.grounded) {
          held.slide = true;
          this.commit = { type: 'slide', until: this._archSpanEnd(threat) + OBSTACLES.archDepth + PLAYER.radius + 0.25 };
        }
      } else if (threat.type === 'barrier') {
        const tti = dist / speed;
        if (tti <= (PLAYER.parryWindowFrames - 3) * STEP && p.parryT <= 0 && p.parryLockT <= 0) {
          held.parry = true;
          this.commit = { type: 'parry', item: threat };
        }
      }
    }

    // ---- execute a planned lane switch when close enough ----
    if (this._switchPlan && !this.commit) {
      const { dir, byD } = this._switchPlan;
      const need = speed * (LANES.switchFrames + 5) * STEP;
      if (p.d >= byD - need) {
        if (dir < 0) held.left = true; else held.right = true;
        this._switchPlan = null;
      }
    }

    // ---- demo flair ----
    if (this.demo && !this.commit && !this._switchPlan) {
      if (w.tide.gap < 10 && p.dashCd <= 0 && p.dashT <= 0 &&
          this._laneClear(p.lane, p.d, p.d + cap.dashLen(speed) + 6)) {
        held.dash = true;
      }
      this._dewGreed(held, speed);
    }

    return this._makeInput(held);
  }

  // switch when the neighbouring lane is clean through the threat and ours
  // is busy — used for forced walls and (in demo) greener pastures
  _preferSwitch() { return false; }

  _planSwitch(threat, speed) {
    if (this._switchPlan) return;
    const p = this.world.player;
    const span = [threat.d - Math.max(8, speed * 0.8), (threat.dEnd ?? threat.d) + 6];
    for (const dir of [-1, 1]) {
      const target = p.lane + dir;
      if (target < -1 || target > 1) continue;
      if (this._laneClear(target, span[0], span[1])) {
        this._switchPlan = { dir, byD: threat.d };
        return;
      }
    }
    // no clear neighbour: head for a clear FAR lane, leaving lead time for
    // two switches — after the first lands, replanning chains the second
    const far = -p.lane || null;             // from an edge lane, far = other edge... from C there is none
    for (const dir of [-1, 1]) {
      const target = p.lane + dir * 2;
      if (target < -1 || target > 1) continue;
      if (this._laneClear(target, span[0], span[1])) {
        this._switchPlan = { dir, byD: threat.d - speed * (LANES.switchFrames + 6) * STEP };
        return;
      }
    }
    if (far !== null && this._laneClear(0, span[0], span[1])) {
      this._switchPlan = { dir: -Math.sign(p.lane), byD: threat.d };
    }
  }

  _dewGreed(held, speed) {
    const p = this.world.player;
    const ahead = this.world.track.itemsInRange(p.d + 2, p.d + 16, 40);
    const count = (lane) => ahead.filter((it) => it.type === 'dew' && !it._done && it.lane === lane && (it.y ?? 0) < 0.6).length;
    const mine = count(p.lane);
    for (const dir of [-1, 1]) {
      const target = p.lane + dir;
      if (target < -1 || target > 1) continue;
      if (count(target) >= mine + 3 && this._laneClear(target, p.d, p.d + speed * 1.6 + 10)) {
        if (dir < 0) held.left = true; else held.right = true;
        break;
      }
    }
  }

  _makeInput(held) {
    const pressed = {};
    for (const k of KEYS) {
      held[k] = !!held[k];
      pressed[k] = held[k] && !this.prevHeld[k];
    }
    this.prevHeld = held;
    return { held, pressed };
  }
}
