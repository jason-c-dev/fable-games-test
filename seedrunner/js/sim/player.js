// Pip: the auto-runner state machine. Node-safe, no DOM/Three.
// Verbs: lane switch, jump (hold for height, coyote, buffered), slide
// (cancel into jump), dash (i-frames, refresh on perfect play), bloom parry.
// Collisions are lateral-position based: forgiveness comes free — commit to
// a lane switch and you are safe as soon as you are nearer the free lane.

import { PLAYER, LANES, OBSTACLES, SCORE, STEP } from '../config.js';
import { laneX } from './chunks.js';
import { clamp } from '../core/math.js';

const LANE_SPEED = LANES.width / (LANES.switchFrames * STEP);   // m/s lateral
const HIT_DX = LANES.width * 0.48;   // same-lane threshold for obstacles

export class Player {
  constructor() {
    this.d = 0; this.prevD = 0;
    this.lane = 0;                    // steering target index (-1|0|1)
    this.x = 0; this.y = 0; this.vy = 0;
    this.driftV = 0;                  // wind-induced lateral velocity
    this.state = 'run';               // run | air | slide | win | dead
    this.jumpHeld = false;

    // frame timers
    this.coyoteT = 0;
    this.jumpBuf = 0; this.slideBuf = 0; this.laneBuf = 0;
    this.slideT = 0;
    this.dashT = 0; this.dashCd = 0;
    this.parryT = 0; this.parryLockT = 0;
    this.stumbleT = 0; this.iframesT = 0; this.fragileT = 0;
    this.airFrames = 0;
    this.laneSwitchT = 0;             // frames since last switch started (for lean anim)
  }

  get sliding() { return this.state === 'slide'; }
  get grounded() { return this.state === 'run' || this.state === 'slide'; }
  get bodyTop() { return this.y + (this.sliding ? PLAYER.slideHeight : PLAYER.height); }
  get hasIframes() { return this.iframesT > 0 || (this.dashT > 0 && PLAYER.dashFrames - this.dashT < PLAYER.dashIframes); }

  speedMult() {
    let m = 1;
    if (this.dashT > 0) m *= PLAYER.dashSpeedMult;
    if (this.stumbleT > 0) {
      // recover linearly from stumbleSpeedMult back to 1
      const t = 1 - this.stumbleT / PLAYER.stumbleFrames;
      m *= PLAYER.stumbleSpeedMult + (1 - PLAYER.stumbleSpeedMult) * t;
    }
    return m;
  }

  step(inp, world) {
    if (this.state === 'dead') return;
    const dt = STEP;
    const track = world.track;

    // ---- timers ----
    for (const k of ['coyoteT', 'jumpBuf', 'slideBuf', 'dashCd', 'parryT', 'parryLockT', 'stumbleT', 'iframesT', 'fragileT']) {
      if (this[k] > 0) this[k]--;
    }
    if (this.dashT > 0) this.dashT--;
    this.laneSwitchT++;

    // ---- inputs -> buffers ----
    if (this.state !== 'win') {
      if (inp.pressed.jump) this.jumpBuf = PLAYER.bufferFrames;
      if (inp.pressed.slide) this.slideBuf = PLAYER.bufferFrames;
      if (inp.pressed.left) this.laneBuf = -1;
      if (inp.pressed.right) this.laneBuf = 1;
      this.jumpHeld = !!inp.held.jump;

      if (inp.pressed.dash && this.dashCd <= 0 && this.dashT <= 0) {
        this.dashT = PLAYER.dashFrames;
        this.dashCd = PLAYER.dashFrames + PLAYER.dashCooldownFrames;
        world.emit('dash');
      }
      if (inp.pressed.parry && this.parryLockT <= 0 && this.parryT <= 0) {
        this.parryT = PLAYER.parryWindowFrames;
        this._parryUsed = false;
        world.emit('parrystart');
      }
    }

    // ---- lane steering ----
    if (this.laneBuf !== 0 && this.state !== 'win') {
      const next = clamp(this.lane + this.laneBuf, -1, 1);
      if (next !== this.lane) { this.lane = next; this.laneDir = this.laneBuf; this.laneSwitchT = 0; world.emit('lane', { dir: this.laneBuf }); }
      this.laneBuf = 0;
    }
    // wind drift (airborne only) mostly overpowers air steering: jumps bend
    // in the Cloudline; the landing snap + fast ground steering recover you
    const wind = track.windAt(this.d);
    const steer = (this.grounded || !wind) ? LANE_SPEED : LANE_SPEED * 0.12;
    const targetX = laneX(this.lane);
    const dx = clamp(targetX - this.x, -steer * dt, steer * dt);
    this.x += dx;
    if (wind && !this.grounded) this.driftV += wind.dir * OBSTACLES.windAccel * dt;
    this.driftV *= this.grounded ? 0.75 : 0.995;
    this.x = clamp(this.x + this.driftV * dt, -LANES.width - 0.7, LANES.width + 0.7);

    // ---- forward motion ----
    const speed = world.speedAt(this.d) * this.speedMult();
    this.prevD = this.d;
    this.d += speed * dt;
    this.speed = speed;

    // ---- vertical ----
    const nearestLane = Math.round(clamp(this.x / LANES.width, -1, 1));
    const overGap = track.gapAt(this.d, nearestLane) && Math.abs(this.x - laneX(nearestLane)) < LANES.width * 0.5;
    if (this.grounded) {
      if (overGap) {                          // walked off a gap edge
        this.state = 'air';
        this.coyoteT = PLAYER.coyoteFrames;
        this.vy = 0;
        this.airFrames = 0;
      }
    }
    if (this.state === 'air') {
      this.airFrames++;
      const g = (this.vy > 0 && (this.jumpHeld || this.rampAir)) ? PLAYER.gravityHeld : PLAYER.gravity;
      this.vy = Math.max(this.vy - g * dt, -PLAYER.maxFall);
      this.y += this.vy * dt;
      if (this.y <= 0 && this.vy <= 0) {
        const gap = track.gapAt(this.d, nearestLane);
        if (gap && Math.abs(this.x - laneX(nearestLane)) < LANES.width * 0.5) {
          // keep falling into the gap; the coyote window stays live near 0
          if (this.y <= -1.2) this._fall(world, gap);
        } else {
          this.y = 0; this.vy = 0;
          this.state = 'run';
          this.rampAir = false;
          this.lane = nearestLane;            // landing snap assist
          world.emit('land', { hard: this.airFrames > 30 });
          const gapBehind = track.itemsInRange(this.d - 2.5, this.d).find((it) => it.type === 'gap' && it.lane === nearestLane && this.d - it.dEnd < 1.2 && this.d > it.dEnd);
          if (gapBehind && !gapBehind._nm) { gapBehind._nm = true; world.nearMiss('gap'); }
        }
      }
    }

    // ---- verbs ----
    if (this.jumpBuf > 0 && this.state !== 'win') {
      const canJump = this.grounded || (this.state === 'air' && this.coyoteT > 0);
      if (canJump) {
        const coyote = this.state === 'air';
        this.jumpBuf = 0; this.coyoteT = 0;
        this.state = 'air';
        this.vy = PLAYER.jumpVel;
        this.y = Math.max(this.y, 0);
        this.airFrames = 0;
        world.emit('jump', { coyote });
      }
    }
    if (this.slideBuf > 0 && this.state === 'run') {
      this.slideBuf = 0;
      this.state = 'slide';
      this.slideT = 0;
      this.slideHeld = true;
      world.emit('slidestart');
    }
    if (this.state === 'slide') {
      this.slideT++;
      const wantUp = !inp.held.slide;
      if (this.slideT >= PLAYER.slideMaxFrames || (wantUp && this.slideT >= PLAYER.slideMinFrames)) {
        this.state = 'run';
        world.emit('slideend');
      }
    }

    // ---- item interactions ----
    this._collide(world);

    // parry whiff: window expired without touching a barrier
    if (this.parryT === 0 && this._parryPending) {
      this._parryPending = false;
      if (!this._parryUsed) { this.parryLockT = 18; world.emit('parrywhiff'); }
    }
    if (this.parryT > 0) this._parryPending = true;
  }

  _collide(world) {
    const track = world.track;
    const r = PLAYER.radius;
    for (const it of track.itemsInRange(this.d - 3, this.d + 3, 40)) {
      const front = it.d, back = it.dEnd ?? it.d + (DEPTHS[it.type] ?? 0);
      const sameLane = Math.abs(this.x - laneX(it.lane)) < HIT_DX;
      const inside = this.d >= front - r && this.d <= back + r;
      switch (it.type) {
        case 'block':
          if (it._hit) break;
          if (inside && sameLane) {
            if (this.y < OBSTACLES.blockH) {
              if (!this.hasIframes) { it._hit = true; this._stumble(world, 'block'); }
            } else {
              it._minClear = Math.min(it._minClear ?? 9, this.y - OBSTACLES.blockH);
            }
          } else if (this.d > back + r && it._minClear != null && !it._nm) {
            it._nm = true;
            if (it._minClear < 0.45) world.nearMiss('block');
          }
          break;
        case 'arch':
          if (it._hit) break;
          if (inside && sameLane && this.bodyTop > OBSTACLES.archY && !this.hasIframes) {
            it._hit = true; this._stumble(world, 'arch');
          }
          break;
        case 'barrier': {
          if (it._done) break;
          const crossed = this.prevD < front - r && this.d >= front - r;
          if (crossed && sameLane) {
            if (this.parryT > 0) {
              it._done = true; this._parryUsed = true; this.parryT = 0;
              this.refreshDash();
              world.parrySuccess(it);
            } else if (this.hasIframes) {
              it._done = true;
              world.emit('barrierdash');
            } else {
              it._done = true; it._hit = true;
              this._stumble(world, 'barrier');
            }
          }
          break;
        }
        case 'ramp': {
          const crossed = this.prevD < front && this.d >= front;
          if (crossed && sameLane && this.grounded && !it._used) {
            it._used = true;
            this.state = 'air';
            this.vy = it.boost ?? OBSTACLES.rampBoost;
            this.airFrames = 0;
            this.rampAir = true;              // ramp flight floats like a held jump
            world.emit('ramp');
          }
          break;
        }
        case 'dew': {
          if (it._done) break;
          const cy = this.y + 0.8;
          if (Math.abs(this.d - it.d) < OBSTACLES.dewR && Math.abs(this.x - laneX(it.lane)) < LANES.width * 0.6 &&
              Math.abs(cy - (it.y ?? 0) - 0.8) < OBSTACLES.dewR + 0.4) {
            it._done = true;
            world.collectDew(it);
          }
          break;
        }
        case 'seed':
          if (!it._done && this.prevD < it.d && this.d >= it.d) { it._done = true; world.collectSeed(it); }
          break;
        case 'checkpoint':
          if (!it._done && this.prevD < it.d && this.d >= it.d) { it._done = true; world.hitCheckpoint(it); }
          break;
        case 'shrine':
          if (!it._done && this.prevD < it.d && this.d >= it.d) { it._done = true; world.finish(it); }
          break;
        case 'sign': {
          const at = Math.max(it.d - 14, 0.5);   // text pops before the marker
          if (!it._done && this.prevD < at && this.d >= at) { it._done = true; world.emit('sign', { text: it.text, at: it.d }); }
          break;
        }
        default: break;
      }
    }
  }

  _stumble(world, cause) {
    if (this.hasIframes || this.state === 'win') return;
    if (this.fragileT > 0) { world.kill(cause); return; }
    this.stumbleT = PLAYER.stumbleFrames;
    this.iframesT = PLAYER.stumbleIframes;
    this.fragileT = PLAYER.fragileFrames;
    if (this.state === 'slide') this.state = 'run';
    world.emit('stumble', { cause });
    world.tide.surge(world.tideCfg.stumbleSurge);
    world.breakChain();
  }

  _fall(world, gap) {
    if (this.state === 'win') return;
    if (this.fragileT > 0) { world.kill('gap'); return; }
    // vine rescue: hauled out at the far edge, Tide gains
    this.d = gap.dEnd + 0.6;
    this.y = 0; this.vy = 0;
    this.state = 'run';
    this.stumbleT = PLAYER.stumbleFrames;
    this.iframesT = PLAYER.stumbleIframes + 20;
    this.fragileT = PLAYER.fragileFrames;
    world.emit('fall');
    world.tide.surge(world.tideCfg.gapFallSurge);
    world.breakChain();
  }

  refreshDash() {
    if (this.dashCd > 0) { this.dashCd = 0; }
  }
}

const DEPTHS = {
  block: OBSTACLES.blockDepth,
  arch: OBSTACLES.archDepth,
  barrier: OBSTACLES.barrierDepth,
  ramp: OBSTACLES.rampDepth,
};
