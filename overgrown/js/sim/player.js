// Pip. Movement + combat state machine. Node-safe: pure simulation,
// communicates with render/audio through world.events.
//
// States: normal | dash | wallslide | ledge | clamber | plunge | hurt |
//         heal | dead | goal
// Attack overlay (this.atk) runs inside `normal`: slash1..3 / up / air / spin.

import { PHYS as P, COMBAT as C, TILE, T } from '../config.js';
import { clamp, sign, approach } from '../core/math.js';
import { moveEntity, wallAt, groundBelow, inWater, waterSurfaceY, tx } from './physics.js';

export class Player {
  constructor(x, y, run) {
    this.run = run;                  // campaign state: hearts, sap, upgrades...
    this.x = x; this.y = y;
    this.px = x; this.py = y;        // previous position (render interpolation)
    this.vx = 0; this.vy = 0;
    this.w = 10; this.h = 18;
    this.facing = 1;
    this.state = 'normal';
    this.stateT = 0;

    this.onGround = false;
    this.swim = false;
    this.coyote = 0; this.jbuf = 0;
    this.jumpHeld = false;
    this.dropT = 0;                  // ignoring one-way platforms
    this.stompChain = 0;

    // dash
    this.dashT = 0; this.dashCd = 0; this.dashDir = 1; this.airDashUsed = false;

    // wall
    this.wallDir = 0; this.wallCoyote = 0; this.wallLock = 0; this.regrab = 0;

    // ledge
    this.ledge = null; this.ledgeBan = 0; this.clamberT = 0;

    // plunge
    this.plungePhase = 0; this.plungeLag = 0;

    // combat
    this.atk = null;                 // { kind, t, def, queued }
    this.atkCd = 0;
    this.chargeT = 0; this.charged = false;
    this.parryT = 0; this.parryLag = 0; this.parryPose = 0;
    this.beamCharge = 0; this.beamFire = 0; this.beamAim = 0;
    this.heat = 0; this.overheat = 0;
    this.healT = 0;
    this.specialHold = 0;

    // health
    this.invuln = 0; this.hurtT = 0;

    // glider
    this.glide = false; this.soarT = 0;

    // interactions
    this.carry = null;               // stunned shell being carried
    this.riding = null;              // Moss
    this.lastSafe = { x, y };
    this.safeT = 0;
    this.springLock = 0;
    this.moverRef = null;
  }

  get hitbox() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }
  get dead() { return this.state === 'dead'; }
  get busyAttack() { return !!this.atk; }
  get parryActive() { return this.parryT > 0; }
  get parryWindow() { return this.run.upgrades.wideparry ? C.parryWindow + 4 : C.parryWindow; }
  get dashFrames() { return this.run.upgrades.longdash ? Math.round(P.dashFrames * 1.3) : P.dashFrames; }
  get chargeNeed() { return this.run.upgrades.fastcharge ? Math.round(C.charge.holdFrames * 0.65) : C.charge.holdFrames; }
  get vulnerable() { return this.invuln <= 0 && this.state !== 'dead' && this.state !== 'goal'; }

  ev(world, t, data) { world.events.push({ t, x: this.x, y: this.y - this.h / 2, ...data }); }

  refreshAirDash(world, why) {
    if (this.airDashUsed) { this.airDashUsed = false; this.ev(world, 'dashrefresh', { why }); }
  }

  // ------------------------------------------------------------ main step --
  step(world, inp) {
    this.px = this.x; this.py = this.y;
    const { held, pressed, released } = inp;

    // global timers
    for (const k of ['coyote', 'jbuf', 'dropT', 'dashCd', 'wallCoyote', 'wallLock', 'regrab',
      'ledgeBan', 'atkCd', 'parryLag', 'parryPose', 'invuln', 'plungeLag', 'springLock', 'soarT'])
      if (this[k] > 0) this[k]--;
    if (this.parryT > 0) this.parryT--;
    this.stateT++;

    if (this.state === 'dead' || this.state === 'goal') {
      this.applyGravity(held);
      this.integrate(world, held);
      return;
    }

    // water transition
    const wasSwim = this.swim;
    this.swim = inWater(world, this);
    if (this.swim !== wasSwim && Math.abs(this.vy) > 0.8) {
      this.ev(world, 'splash', { dir: this.swim ? 1 : -1, power: Math.abs(this.vy) });
    }
    if (this.swim && wasSwim === false) {
      this.vy *= P.waterEntryDamp;
      if (this.state === 'plunge') this.exitPlunge();
      if (this.state === 'dash') this.dashT = Math.min(this.dashT, 4);
      this.glide = false;
    }

    // input intents
    if (pressed.jump) this.jbuf = P.bufferFrames;
    this.jumpHeld = held.jump;

    switch (this.state) {
      case 'hurt': this.stepHurt(world, held); break;
      case 'dash': this.stepDash(world, held, pressed); break;
      case 'wallslide': this.stepWallslide(world, held, pressed); break;
      case 'ledge': this.stepLedge(world, held, pressed); break;
      case 'clamber': this.stepClamber(world); break;
      case 'plunge': this.stepPlunge(world, held, pressed); break;
      case 'heal': this.stepHeal(world, held, pressed); break;
      default: this.stepNormal(world, held, pressed, released); break;
    }

    // combat overlay (attacks tick even during some movement states)
    this.stepCombat(world, held, pressed, released);

    // sample last-safe ground for hazard respawns
    if (this.onGround && this.state === 'normal' && !this.swim) {
      if (++this.safeT >= 12 && groundBelow(world, this, 3)) {
        const cx = tx(this.x), cy = tx(this.y + 1);
        let ok = true;
        for (let dx = -1; dx <= 1; dx++) {
          const id = world.tiles.id(cx + dx, cy);
          if (id === T.SPIKES || id === T.THORN || id === T.CRUMBLE) ok = false;
        }
        if (ok) { this.lastSafe = { x: this.x, y: this.y }; this.safeT = 0; }
      }
    } else this.safeT = 0;
  }

  // ------------------------------------------------------------- movement --
  stepNormal(world, held, pressed, released) {
    const locked = this.wallLock > 0;
    const inAtkGround = this.atk && this.onGround;
    let ax = 0;
    if (!locked) {
      if (held.left) ax = -1;
      if (held.right) ax = 1;
    }

    // facing (locked mid-attack / beam-fire)
    if (ax !== 0 && !this.atk && this.beamFire <= 0) this.facing = ax;

    // horizontal accel
    const run = true; // Overgrown auto-runs: momentum builds to run speed
    const max = this.swim ? P.swimMaxX : (run ? P.maxRun : P.maxWalk);
    const accel = this.swim ? P.swimAccel : (this.onGround ? P.runAccel : P.airAccel);
    const speedMul = inAtkGround ? 0.55 : this.beamFire > 0 ? 0.35 : this.beamCharge > 0 ? 0.6 : this.healT > 0 ? 0 : 1;

    if (ax !== 0) {
      const target = ax * max * speedMul;
      if (this.onGround && sign(this.vx) !== 0 && sign(this.vx) !== ax && Math.abs(this.vx) > 1.2) {
        this.vx = approach(this.vx, 0, P.skidDecel);   // skid
        if (Math.abs(this.vx) > 1.6 && this.stateT % 4 === 0) this.ev(world, 'skid', {});
      } else if (Math.abs(this.vx) > Math.abs(target) && sign(this.vx) === ax) {
        // over-speed (dash-jump momentum): bleed off gently in air
        this.vx = approach(this.vx, target, this.onGround ? P.friction : 0.035);
      } else {
        this.vx = approach(this.vx, target, accel);
      }
    } else {
      this.vx = approach(this.vx, 0, this.onGround ? P.friction : (this.swim ? 0.05 : 0.02));
    }

    // jumping
    if (this.jbuf > 0) {
      if (this.swim) {
        this.jbuf = 0;
        const surf = waterSurfaceY(world, this);
        if (surf !== null && this.y - this.h < surf + 10) {
          this.vy = -4.4; this.ev(world, 'waterleap', {});
        } else {
          this.vy = -P.swimStroke; this.ev(world, 'stroke', {});
        }
        this.refreshAirDash(world, 'stroke');
      } else if (this.onGround || this.coyote > 0) {
        this.jbuf = 0; this.coyote = 0;
        const boost = P.jumpRunBonus * Math.min(1, Math.abs(this.vx) / P.maxRun);
        this.vy = -(P.jumpBase + boost);
        this.onGround = false;
        if (boost > 0.7 && this.run.relic === 'glider') this.soarT = P.soarFrames;
        this.ev(world, 'jump', {});
      } else if (this.wallCoyote > 0) {
        this.doWallJump(world);
      }
    }
    // variable jump height
    if (!this.jumpHeld && this.vy < -1.6 && !this.swim) this.vy = -1.6;

    // platform drop-through
    if (held.down && pressed.jump === false && this.onGround && this.jbuf === 0) {
      // handled via down+jump: see above; explicit drop = down + jump pressed together
    }
    if (held.down && this.jbuf > 0 && this.onGround && this.standingOnPlatform(world)) {
      this.jbuf = 0; this.dropT = 10; this.onGround = false; this.y += 2;
      this.ev(world, 'dropthrough', {});
    }

    // dash
    if (pressed.dash && this.tryDash(world, held)) return;

    // wall interactions (air only)
    if (!this.onGround && !this.swim && this.vy > -1.2 && this.state === 'normal') {
      const dir = held.left ? -1 : held.right ? 1 : 0;
      if (dir !== 0) {
        // ledge grab first
        if (this.ledgeBan <= 0 && this.tryLedgeGrab(world, dir)) return;
        const wall = wallAt(world, this, dir);
        if (wall && this.vy > 0.4) {
          this.state = 'wallslide'; this.stateT = 0; this.wallDir = dir;
          this.facing = dir;
          this.refreshAirDash(world, 'wall');
          this.vy = Math.min(this.vy, P.wallSlideFall);
          this.ev(world, 'wallgrab', { dir });
          return;
        }
      } else if (this.regrab > 0 && this.wallDir !== 0) {
        // forgiving regrab: neutral drift back onto the wall
        const wall = wallAt(world, this, this.wallDir);
        if (wall && this.vy > 0.4) {
          this.state = 'wallslide'; this.stateT = 0;
          this.vy = Math.min(this.vy, P.wallSlideFall);
          return;
        }
      }
    }

    // plunge start: attack while holding down in the air
    if (this.state === 'normal' && !this.onGround && !this.swim && held.down && pressed.attack && !this.atk && this.plungeLag <= 0) {
      this.state = 'plunge'; this.stateT = 0; this.plungePhase = 0;
      this.vy = Math.min(this.vy, 0.4); this.vx *= 0.4;
      this.ev(world, 'plungestart', {});
      return;
    }

    // glide
    this.glide = false;
    if (this.run.relic === 'glider' && !this.onGround && !this.swim && this.vy > 0 && this.jumpHeld && this.jbuf <= 0) {
      this.glide = true;
    }

    this.applyGravity(held);
    this.integrate(world, held);
  }

  standingOnPlatform(world) {
    const y = tx(this.y + 1);
    const x0 = tx(this.x - this.w / 2 + 1), x1 = tx(this.x + this.w / 2 - 1);
    let plat = false;
    for (let xx = x0; xx <= x1; xx++) {
      const id = world.tiles.id(xx, y);
      if (world.tiles.solid(xx, y)) return false;
      if (id === T.PLATFORM) plat = true;
    }
    return plat;
  }

  tryDash(world, held) {
    if (this.dashCd > 0 || this.state === 'dash') return false;
    if (!this.onGround && this.airDashUsed && !this.swim) return false;
    const dir = held.left ? -1 : held.right ? 1 : this.facing;
    this.state = 'dash'; this.stateT = 0;
    this.dashT = this.dashFrames;
    this.dashDir = dir; this.facing = dir;
    if (!this.onGround && !this.swim) this.airDashUsed = true;
    this.cancelBeam();
    this.atk = null; this.chargeT = 0;
    this.ev(world, 'dash', { dir });
    return true;
  }

  stepDash(world, held) {
    const spd = this.swim ? 3.4 : P.dashSpeed;
    this.vx = this.dashDir * spd;
    this.vy = 0;
    this.dashT--;
    if (this.jbuf > 0 && (this.onGround || this.coyote > 0)) {
      // dash-jump: keep the speed
      this.jbuf = 0;
      this.vy = -(P.jumpBase + P.jumpRunBonus * 0.9);
      this.state = 'normal'; this.stateT = 0;
      this.onGround = false;
      this.ev(world, 'jump', { dashy: true });
      this.integrate(world, held);
      return;
    }
    const res = this.integrate(world, held);
    if (res && (res.wallL || res.wallR)) { this.dashT = 0; }
    if (this.dashT <= 0) {
      this.state = 'normal'; this.stateT = 0;
      this.dashCd = P.dashCooldown;
      this.vx = this.dashDir * (held.left || held.right ? P.maxRun : P.maxRun * 0.6);
    }
  }

  doWallJump(world) {
    this.jbuf = 0;
    this.state = 'normal'; this.stateT = 0;
    this.vy = -P.wallJumpVy;
    this.vx = -this.wallDir * P.wallJumpVx;
    this.facing = -this.wallDir;
    this.wallLock = P.wallJumpLockFrames;
    this.wallCoyote = 0;
    this.regrab = P.wallRegrabFrames;
    this.ev(world, 'walljump', { dir: -this.wallDir });
  }

  stepWallslide(world, held, pressed) {
    const dir = this.wallDir;
    const wall = wallAt(world, this, dir);
    const away = (dir === 1 && held.left) || (dir === -1 && held.right);
    if (this.jbuf > 0) { this.doWallJump(world); this.integrate(world, held); return; }
    if (pressed.dash) { this.airDashUsed = false; this.tryDash(world, held); return; }
    if (!wall || away || this.onGround || this.swim) {
      this.state = 'normal'; this.stateT = 0;
      this.wallCoyote = P.wallCoyoteFrames;
      this.regrab = P.wallRegrabFrames;
      this.integrate(world, held);
      return;
    }
    // slide
    this.vy = Math.min(this.vy + P.gravity * 0.5, P.wallSlideFall);
    this.vx = dir * 0.5; // press into wall
    if (this.stateT % 6 === 0) this.ev(world, 'wallslidefx', { dir });
    const res = this.integrate(world, held);
    if (res && res.ground) { this.state = 'normal'; this.stateT = 0; }
    // ledge catch while sliding
    if (this.ledgeBan <= 0 && this.tryLedgeGrab(world, dir)) return;
  }

  tryLedgeGrab(world, dir) {
    // never grab with solid ground right underfoot — that's a step, not a
    // cliff (hanging off a shallow pit rim reads as a bug)
    if (groundBelow(world, this, 6)) return false;
    const tv = world.tiles;
    const xEdge = tx(this.x + dir * (this.w / 2 + 2));
    const headY = this.y - this.h;
    // find a corner: solid with empty above, top edge within reach of hands
    for (let dy = -1; dy <= 1; dy++) {
      const ty = tx(headY + P.ledgeReachPx) + dy;
      if (tv.solid(xEdge, ty) && !tv.solid(xEdge, ty - 1) && !tv.solid(tx(this.x), ty - 1)) {
        const cornerTop = ty * TILE;
        if (Math.abs(cornerTop - headY) <= P.ledgeReachPx + 2 && this.vy >= -0.5) {
          this.state = 'ledge'; this.stateT = 0;
          this.ledge = { tx: xEdge, ty, dir };
          this.x = xEdge * TILE + (dir === 1 ? -this.w / 2 - 0.5 : TILE + this.w / 2 + 0.5);
          this.y = cornerTop + this.h - 2;
          this.vx = 0; this.vy = 0;
          this.facing = dir;
          this.refreshAirDash(world, 'ledge');
          this.ev(world, 'ledgegrab', { dir });
          return true;
        }
      }
    }
    return false;
  }

  stepLedge(world, held, pressed) {
    this.vx = 0; this.vy = 0;
    const dir = this.ledge.dir;
    const away = (dir === 1 && held.left) || (dir === -1 && held.right);
    if (held.down) {
      this.state = 'normal'; this.stateT = 0; this.ledgeBan = 12;
      return;
    }
    if (this.jbuf > 0) {
      this.jbuf = 0;
      if (away) { this.wallDir = dir; this.doWallJump(world); return; }
      // clamber
      this.state = 'clamber'; this.stateT = 0; this.clamberT = P.clamberFrames;
      this.ev(world, 'clamber', {});
      return;
    }
    if (held.up) {
      this.state = 'clamber'; this.stateT = 0; this.clamberT = P.clamberFrames;
      this.ev(world, 'clamber', {});
    }
  }

  stepClamber(world) {
    this.clamberT--;
    if (this.clamberT <= 0) {
      const { tx: lx, ty, dir } = this.ledge;
      this.x = lx * TILE + TILE / 2;
      this.y = ty * TILE;
      this.state = 'normal'; this.stateT = 0;
      this.onGround = true;
      this.vx = dir * 0.5;
    }
  }

  exitPlunge() {
    this.state = 'normal'; this.stateT = 0; this.plungePhase = 0;
  }

  stepPlunge(world, held, pressed) {
    if (this.plungePhase === 0) {
      // anticipation hang
      this.vy = 0.3; this.vx = approach(this.vx, 0, 0.3);
      if (this.stateT >= 6) { this.plungePhase = 1; this.vy = P.plungeStartVy; this.ev(world, 'plungefall', {}); }
      this.integrate(world, held);
      return;
    }
    // steer slightly
    if (held.left) this.vx = approach(this.vx, -0.6, 0.08);
    else if (held.right) this.vx = approach(this.vx, 0.6, 0.08);
    else this.vx = approach(this.vx, 0, 0.06);
    this.vy = Math.min(this.vy + 0.9, P.plungeSpeed);

    const res = this.integrate(world, held, { plunging: true });
    if (res && res.ground) {
      // landed on tiles: shockwave + brief lag; break bricks underfoot
      world.plungeLand(this);
      this.exitPlunge();
      this.plungeLag = 8;
      this.ev(world, 'plungeland', {});
    }
  }

  pogo(world, why) {
    this.vy = -(this.jumpHeld ? P.pogoBounceHeld : P.pogoBounce);
    this.exitPlunge();
    this.refreshAirDash(world, 'pogo');
    this.stompChain++;
    this.ev(world, 'pogo', { why });
  }

  stepHurt(world, held) {
    if (this.stateT > 20) { this.state = 'normal'; this.stateT = 0; }
    this.applyGravity(held);
    this.integrate(world, held);
  }

  stepHeal(world, held, pressed) {
    this.vx = approach(this.vx, 0, 0.2);
    this.healT++;
    if (!held.special) {
      // released early: refund
      this.run.sap = Math.min(C.sapMax, this.run.sap + C.healCost);
      this.state = 'normal'; this.stateT = 0; this.healT = 0;
      this.ev(world, 'healcancel', {});
    } else if (this.healT >= C.healChannelFrames) {
      this.run.hearts = Math.min(this.run.maxHearts, this.run.hearts + 1);
      this.state = 'normal'; this.stateT = 0; this.healT = 0;
      this.ev(world, 'heal', {});
    } else if (this.healT % 10 === 0) {
      this.ev(world, 'healtick', { p: this.healT / C.healChannelFrames });
    }
    this.applyGravity(held);
    this.integrate(world, held);
  }

  // --------------------------------------------------------------- combat --
  stepCombat(world, held, pressed, released) {
    if (this.state === 'dead' || this.state === 'goal' || this.state === 'hurt') return;
    const canAct = this.state === 'normal';

    // ---- active attack ticking ----
    if (this.atk) {
      const a = this.atk;
      a.t++;
      const d = a.def;
      if (pressed.attack && a.kind.startsWith('slash') && a.t >= d.startup) a.queued = true;
      if (a.t >= d.startup + d.active + d.recovery) {
        // combo link
        if (a.queued && a.kind !== 'slash3' && this.onGround) {
          const n = a.kind === 'slash1' ? 2 : 3;
          this.startSlash(world, n, held);
        } else {
          this.atkCd = a.kind === 'air' ? 8 : 2;
          this.atk = null;
        }
      } else if (a.t === d.startup) {
        this.ev(world, 'swing', { kind: a.kind, facing: this.facing });
      }
    }

    // ---- charge accumulation ----
    if (held.attack && !this.atk && canAct && this.carry === null) {
      this.chargeT++;
      if (this.chargeT === this.chargeNeed) { this.charged = true; this.ev(world, 'charged', {}); }
    }
    if (released.attack) {
      if (this.charged && canAct && !this.atk) {
        this.atk = { kind: 'spin', t: 0, def: { startup: 2, active: C.charge.active, recovery: C.charge.recovery }, queued: false };
        this.ev(world, 'spin', {});
      }
      this.chargeT = 0; this.charged = false;
    }

    // ---- start attacks ----
    if (pressed.attack && canAct && !this.atk && this.atkCd <= 0 && this.plungeLag <= 0) {
      if (this.carry) {
        world.throwCarry(this, held.down);
      } else if (held.up) {
        this.atk = { kind: 'up', t: 0, def: C.upSlash, queued: false };
      } else if (!this.onGround && !held.down) {
        this.atk = { kind: 'air', t: 0, def: C.airSlash, queued: false };
      } else if (this.onGround && !held.down) {
        // ground grab takes priority if a stunned shell is underfoot
        if (!world.tryPickup(this)) this.startSlash(world, 1, held);
      }
      // (down+attack in air handled by plunge in stepNormal)
    }

    // ---- parry ----
    if (pressed.parry && canAct && !this.atk && this.parryLag <= 0 && this.parryT <= 0) {
      this.parryT = this.parryWindow;
      this.parryPose = this.parryWindow + 6;
      if (this.onGround) this.vx *= 0.3;
      this.ev(world, 'parrystart', {});
    }
    if (this.parryT === 1) {
      // window expired unused
      this.parryLag = C.parryRecovery;
      this.ev(world, 'parrywhiff', {});
    }

    // ---- Sunbeam Lance ----
    if (this.run.hasBeam && this.overheat <= 0) {
      if (held.beam && canAct && !this.atk && this.beamFire <= 0) {
        this.beamCharge++;
        this.heat = Math.min(C.beamHeatMax, this.heat + C.beamHeatPerFrame * 0.5);
        if (this.beamCharge === C.beamChargeFrames) this.ev(world, 'beamready', {});
      }
      if (released.beam && this.beamCharge > 0) {
        if (this.beamCharge >= C.beamChargeFrames) {
          this.beamFire = C.beamFireFrames;
          this.beamAim = 0;
          this.ev(world, 'beamfire', {});
        } else {
          this.ev(world, 'beamfizzle', {});
        }
        this.beamCharge = 0;
      }
      if (this.beamFire > 0) {
        this.beamFire--;
        // sweep aim
        if (held.up) this.beamAim = clamp(this.beamAim - 0.02, -0.5, 0.5);
        else if (held.down) this.beamAim = clamp(this.beamAim + 0.02, -0.5, 0.5);
        else this.beamAim = approach(this.beamAim, 0, 0.015);
        this.heat += C.beamHeatPerFrame;
        if (this.jbuf > 0 || this.state !== 'normal') this.cancelBeam();
        if (this.heat >= C.beamHeatMax) {
          this.cancelBeam();
          this.overheat = C.beamOverheatLock;
          this.ev(world, 'overheat', {});
        }
      }
    }
    if (this.overheat > 0) this.overheat--;
    if (this.beamFire <= 0 && this.beamCharge <= 0) this.heat = Math.max(0, this.heat - C.beamCoolPerFrame);

    // ---- specials (Sap Gauge) ----
    if (held.special && canAct && !this.atk) this.specialHold++;
    else this.specialHold = 0;
    if (pressed.special && canAct && this.run.sap >= C.burstCost && held.up) {
      this.run.sap -= C.burstCost;
      world.bloomBurst(this);
    } else if (this.specialHold === 10 && this.run.sap >= C.healCost && this.run.hearts < this.run.maxHearts) {
      this.run.sap -= C.healCost;
      this.state = 'heal'; this.stateT = 0; this.healT = 0;
      this.ev(world, 'healstart', {});
    }
  }

  startSlash(world, n, held) {
    const def = C.slash[n - 1];
    this.atk = { kind: 'slash' + n, t: 0, def, queued: false };
    // step into the swing
    if (this.onGround) this.vx += this.facing * (0.5 + n * 0.15);
  }

  // current active melee hitbox, or null
  attackHitbox() {
    if (this.state === 'plunge' && this.plungePhase === 1) {
      return { kind: 'plunge', dmg: C.plungeDmg, kb: 1.2,
        x: this.x - 7, y: this.y - 4, w: 14, h: 12, pogo: true };
    }
    if (!this.atk) return null;
    const a = this.atk, d = a.def;
    if (a.t < d.startup || a.t >= d.startup + d.active) return null;
    const f = this.facing;
    if (a.kind === 'spin') {
      const r = C.charge.radius;
      return { kind: 'spin', dmg: C.charge.dmg, kb: C.charge.kb,
        x: this.x - r, y: this.y - this.h / 2 - r, w: r * 2, h: r * 2, breaks: true };
    }
    if (a.kind === 'up') {
      return { kind: 'up', dmg: C.upSlash.dmg, kb: C.upSlash.kb, launch: true,
        x: this.x - 12, y: this.y - this.h - 20, w: 24, h: 22 };
    }
    const n = a.kind === 'slash3' ? 3 : a.kind === 'slash2' ? 2 : 1;
    const dmg = a.kind === 'air' ? C.airSlash.dmg : C.slash[n - 1].dmg;
    const kb = a.kind === 'air' ? C.airSlash.kb : C.slash[n - 1].kb;
    const big = a.kind === 'slash3';
    const reach = C.slashReach + (big ? 5 : 0);
    return { kind: a.kind, dmg, kb, ender: big,
      x: f === 1 ? this.x + 2 : this.x - 2 - reach,
      y: this.y - this.h / 2 - C.slashArcH / 2 - (big ? 3 : 0),
      w: reach, h: C.slashArcH + (big ? 6 : 0) };
  }

  cancelBeam() {
    if (this.beamFire > 0) this.beamFire = 0;
    this.beamCharge = 0;
  }

  // -------------------------------------------------------------- physics --
  applyGravity(held) {
    if (this.swim) {
      this.vy = Math.min(this.vy + P.swimGravity, P.swimMaxSink);
      if (this.vy < -P.swimMaxUp) this.vy = -P.swimMaxUp;
      return;
    }
    let g = this.vy < 0 && this.jumpHeld ? P.gravityHeld : P.gravity;
    if (this.soarT > 0 && this.vy > -1 && this.jumpHeld) g *= 0.45;
    if (this.parryT > 0 && !this.onGround) g *= 0.5;
    this.vy += g;
    let cap = P.maxFall;
    if (this.glide) cap = P.glideFall;
    if (this.vy > cap) this.vy = cap;
  }

  integrate(world, held, opts = {}) {
    // wind
    if (!this.onGround && !this.swim && world.wind) {
      this.vx += world.wind.current * 0.028;
    }
    // updraft columns: lift must beat gravity or the column only slows falls
    if (world.hasUpdrafts && !this.swim) {
      const tv = world.tiles;
      if (tv.id(tx(this.x), tx(this.y - this.h / 2)) === T.UPDRAFT) {
        this.vy -= this.glide ? 1.0 : 0.85;
        if (this.vy < -2.6) this.vy = -2.6;
        if (!this.onGround) this.vx *= 0.88;   // the column catches you
        this.refreshAirDash(world, 'updraft');
        if (world.frame % 6 === 0) this.ev(world, 'updraftfx', {});
      }
    }

    const wasGround = this.onGround;
    const res = moveEntity(world, this, this.vx, this.vy, { dropThrough: this.dropT > 0 });
    this.moverRef = res.mover || null;

    if (res.mover) {
      // ride: carried by mover delta
      this.x += res.mover.lastDx;
      this.y += res.mover.lastDy;
    }

    if (res.ground) {
      if (!wasGround && this.vy > 1.5) this.ev(world, 'land', { power: this.vy });
      this.onGround = true;
      this.vy = 0;
      this.coyote = P.coyoteFrames;
      this.stompChain = 0;
      this.refreshAirDash(world, 'land');
      this.soarT = 0;
      if (res.crumble) world.touchCrumble(res.crumble.x, res.crumble.y);
      // spring
      if (this.springLock <= 0) {
        const sx = tx(this.x), sy = tx(this.y + 1);
        if (world.tiles.id(sx, sy) === T.SPRING) {
          this.vy = this.jumpHeld ? -8.6 : -7.2;
          this.onGround = false;
          this.springLock = 10;
          this.airDashUsed = false;
          this.ev(world, 'spring', {});
        }
      }
    } else {
      if (this.onGround) this.coyote = P.coyoteFrames;
      this.onGround = false;
    }

    if (res.wallL || res.wallR) {
      // walking into a single-tile ledge steps up onto it automatically —
      // without this, flush jumps at 1-high blocks feel sticky
      const dir = res.wallR ? 1 : -1;
      const pushing = dir === 1 ? held.right : held.left;
      if (this.onGround && pushing && this.state === 'normal') {
        const tv = world.tiles;
        const xEdge = tx(this.x + dir * (this.w / 2 + 1));
        const feetRow = tx(this.y - 1);
        const clear = (x2, y2) => !tv.solid(x2, y2) && !tv.deadly(x2, y2);
        if (tv.solid(xEdge, feetRow) && clear(xEdge, feetRow - 1) && clear(xEdge, feetRow - 2)
          && clear(tx(this.x), feetRow - 1) && clear(tx(this.x), feetRow - 2)) {
          this.y = feetRow * TILE;
          this.x += dir * 1.5;
          this.vx = dir * Math.max(Math.abs(this.vx), 1.0);
          this.ev(world, 'stepup', {});
          return res;
        }
      }
      if (this.state !== 'dash') this.vx = 0;
    }
    if (res.ceil) {
      if (this.vy < 0) this.vy = 0.3;
      for (const b of res.bumpTiles) world.bumpBlock(b, this);
    }
    if (res.hazard) {
      if ((this.state === 'plunge' && this.plungePhase === 1) && res.hazard.id === T.SPIKES) {
        // pogo off spike tops when plunging
        const spikeTop = res.hazard.y * TILE;
        if (this.y - 4 <= spikeTop + 6) {
          this.y = spikeTop;
          this.pogo(world, 'spikes');
          return res;
        }
      }
      world.hazardHurt(this, res.hazard);
      return res;
    }

    // fell out of the world
    if (this.y - this.h > world.room.h * TILE + 40) {
      world.pitFall(this);
    }
    return res;
  }
}
