// Enemy roster. Seven returning families redesigned for combat, three new
// sword-era enemies, and Moss the rideable companion. Node-safe.

import { TILE, T, COMBAT as C, PHYS as P, SCORE } from '../config.js';
import { Entity, Projectile } from './entities.js';
import { moveEntity, groundBelow, tx } from './physics.js';
import { rectsOverlap, sign, approach, clamp } from '../core/math.js';

class Walker extends Entity {
  constructor(x, y) {
    super(x, y);
    this.isEnemy = true;
    this.harmful = true;
    this.stompable = true;
    this.stunT = 0;
  }
  staggered(world, frames) {
    this.stunT = frames;
    this.vx = 0;
    this.ev(world, 'stagger', {});
  }
  get contactDmg() { return 1; }
}

// ------------------------------------------------------------------ bumble --
export class Bumble extends Walker {
  constructor(x, y) { super(x, y); this.w = 13; this.h = 12; this.hp = 2; this.speed = 0.38; }
  step(world) {
    if (this.stunT > 0) { this.stunT--; this.walk(world, 0); return; }
    this.walk(world, this.speed);
  }
}

// ----------------------------------------------------------------- snapcap --
// Shell enemy: stomp -> stunned shell (carry/throw). Thrown shells slide and
// chain-kill. A parried sliding shell ricochets back as a friendly wrecking ball.
export class Snapcap extends Walker {
  constructor(x, y) {
    super(x, y);
    this.w = 13; this.h = 13; this.hp = 2;
    this.speed = 0.45;
    this.mode = 'walk';         // walk | stunned | slide
    this.stunnedT = 0;
    this.friendlyT = 0;
    this.carryable = true;
    this.carried = false;
  }
  get stunned() { return this.mode === 'stunned'; }
  set stunned(v) { if (!v && this.mode === 'stunned') this.mode = 'slide'; }
  get sliding() { return this.mode === 'slide'; }
  set sliding(v) { if (v) this.mode = 'slide'; }
  get parryable() { return this.mode === 'slide' && this.friendlyT <= 0; }
  get contactDmg() { return 1; }

  stomped(world, p) {
    if (this.mode === 'walk') {
      this.mode = 'stunned'; this.stunnedT = 420;
      this.vx = 0;
      this.harmful = false;
      this.ev(world, 'shellstun', {});
    } else if (this.mode === 'slide') {
      this.mode = 'stunned'; this.stunnedT = 420;
      this.vx = 0; this.harmful = false;
      this.ev(world, 'shellstun', {});
    }
  }
  staggered(world, frames) {
    if (this.mode === 'slide') {
      // parried: ricochet back, friendly
      this.vx = -this.vx * 1.15;
      this.friendlyT = 150;
      this.harmful = false;
      this.ev(world, 'ricochet', {});
    } else super.staggered(world, frames);
  }
  hurt(world, dmg, info = {}) {
    if (this.mode === 'stunned') {
      // whacked while stunned: send it sliding
      this.mode = 'slide';
      this.vx = (info.dx || 1) * P.shellSpeed;
      this.harmful = true;
      this.ev(world, 'shellkick', {});
      return false;
    }
    return super.hurt(world, dmg, info);
  }
  step(world) {
    if (this.carried) {
      const p = world.player;
      this.x = p.x; this.y = p.y - p.h - 2;
      this.px = this.x; this.py = this.y;
      this.vx = 0; this.vy = 0;
      return;
    }
    if (this.mode === 'walk') {
      if (this.stunT > 0) { this.stunT--; this.walk(world, 0); return; }
      this.walk(world, this.speed);
    } else if (this.mode === 'stunned') {
      this.vy = Math.min(this.vy + this.gravity, this.maxFall);
      const res = moveEntity(world, this, this.vx, this.vy);
      if (res.ground) { this.vy = 0; this.vx = approach(this.vx, 0, 0.2); }
      if (--this.stunnedT <= 0) {
        this.mode = 'walk'; this.harmful = true;
        this.dir = sign(world.player.x - this.x) || -1;
        this.ev(world, 'shellwake', {});
      }
    } else {
      // sliding
      if (this.friendlyT > 0) this.friendlyT--;
      else this.harmful = true;
      this.vy = Math.min(this.vy + this.gravity, this.maxFall);
      const res = moveEntity(world, this, this.vx, this.vy);
      if (res.ground) this.vy = 0;
      if (res.wallL || res.wallR) {
        this.vx = -this.vx;
        this.ev(world, 'shellbounce', {});
      }
      if (world.frame % 4 === 0) this.ev(world, 'shelltrail', {});
      // chain kills
      for (const e of world.entities) {
        if (e !== this && e.isEnemy && !e.dying && !e.removed && !(e instanceof Snapcap && e.carried) && rectsOverlap(this.hitbox, e.hitbox)) {
          e.hurt(world, 3, { kind: 'shell', dx: sign(this.vx), kb: 2.5 });
          world.run.addScore(SCORE.enemySword * 2);
          this.ev(world, 'shellchain', {});
        }
      }
      if (Math.abs(this.vx) < 0.4) { this.mode = 'stunned'; this.stunnedT = 300; this.harmful = false; }
    }
  }
}

// ---------------------------------------------------------------- spikelet --
export class Spikelet extends Walker {
  constructor(x, y) {
    super(x, y);
    this.w = 12; this.h = 11; this.hp = 2;
    this.stompable = false;      // spikes! pogo or sword
    this.speed = 0.3;
  }
  step(world) {
    if (this.stunT > 0) { this.stunT--; this.walk(world, 0); return; }
    this.walk(world, this.speed, { ledgeTurn: true });
  }
}

// ---------------------------------------------------------------- puffhawk --
export class Puffhawk extends Entity {
  constructor(x, y) {
    super(x, y);
    this.isEnemy = true; this.harmful = true; this.stompable = true;
    this.w = 14; this.h = 12; this.hp = 2;
    this.homeY = y; this.t = 0;
    this.mode = 'hover';         // hover | swoop | return | floorstun
    this.stunT = 0;
    this.swoopVec = null;
  }
  get parryable() { return this.mode === 'swoop'; }
  staggered(world, frames) {
    this.mode = 'floorstun'; this.stunT = frames;
    this.vy = 1;
    this.ev(world, 'stagger', {});
  }
  step(world) {
    this.t++;
    const p = world.player;
    if (this.mode === 'hover') {
      this.y = this.homeY + Math.sin(this.t * 0.05) * 6;
      this.x += Math.sin(this.t * 0.02) * 0.2;
      if (Math.abs(p.x - this.x) < 80 && p.y > this.y - 8 && p.y - this.y < 140 && this.t % 90 > 60) {
        this.mode = 'swoop';
        const d = Math.max(24, Math.hypot(p.x - this.x, p.y - this.y));
        this.swoopVec = { x: (p.x - this.x) / d * 2.4, y: (p.y - 6 - this.y) / d * 2.4 };
        this.ev(world, 'swoop', {});
      }
    } else if (this.mode === 'swoop') {
      const res = moveEntity(world, this, this.swoopVec.x, this.swoopVec.y);
      this.swoopVec.y += 0.02;
      if (res.ground || res.wallL || res.wallR || this.y > p.y + 40) { this.mode = 'return'; }
    } else if (this.mode === 'return') {
      this.y = approach(this.y, this.homeY, 1.1);
      this.x += Math.sin(this.t * 0.05) * 0.3;
      if (Math.abs(this.y - this.homeY) < 2) this.mode = 'hover';
    } else if (this.mode === 'floorstun') {
      this.vy = Math.min(this.vy + 0.4, 3);
      const res = moveEntity(world, this, 0, this.vy);
      if (res.ground) this.vy = 0;
      if (--this.stunT <= 0) this.mode = 'return';
    }
  }
}

// ------------------------------------------------------------------ lobber --
export class Lobber extends Entity {
  constructor(x, y) {
    super(x, y);
    this.isEnemy = true; this.harmful = true; this.stompable = true;
    this.w = 14; this.h = 16; this.hp = 2;
    this.t = Math.floor(x) % 60;
  }
  step(world) {
    this.t++;
    const p = world.player;
    const dx = p.x - this.x;
    if (Math.abs(dx) < 210 && Math.abs(p.y - this.y) < 120 && this.t % 150 === 0 && !p.dead) {
      const dir = sign(dx) || 1;
      this.dir = dir;
      const dist = clamp(Math.abs(dx), 40, 210);
      world.spawnProjectile(this.x, this.y - this.h + 2, dir * dist / 95, -3.2, {
        kind: 'seed', grav: 0.13, owner: this, parryable: true, deflectable: true,
      });
      this.ev(world, 'lob', {});
    }
  }
}

// -------------------------------------------------------------------- wisp --
// Invulnerable shade. Advances only while unobserved; the Sunbeam makes it
// real (and killable) for a while.
export class Wisp extends Entity {
  constructor(x, y) {
    super(x, y);
    this.isEnemy = true; this.harmful = true;
    this.w = 12; this.h = 14; this.hp = 1;
    this.litT = 0;
    this.stompable = false;
    this.t = 0;
  }
  get swordable() { return this.litT > 0; }
  set swordable(v) {}
  get pogoable() { return this.litT > 0; }
  set pogoable(v) {}
  onBeam(world) {
    if (this.litT <= 0) this.ev(world, 'wisplit', {});
    this.litT = 300;
  }
  onSword(world, hb, p) { return this.litT > 0 ? 'hit' : 'blocked'; }
  step(world) {
    this.t++;
    if (this.litT > 0) this.litT--;
    const p = world.player;
    const facingMe = sign(this.x - p.x) === p.facing;
    const speed = this.litT > 0 ? 0.15 : (facingMe ? 0 : 0.55);
    if (!p.dead && speed > 0) {
      const d = Math.hypot(p.x - this.x, p.y - 8 - this.y) || 1;
      this.x += (p.x - this.x) / d * speed;
      this.y += (p.y - 8 - this.y) / d * speed;
    }
    this.y += Math.sin(this.t * 0.08) * 0.15;
  }
}

// --------------------------------------------------------------------- pod --
export class Pod extends Entity {
  constructor(x, y) {
    super(x, y);
    this.isEnemy = true; this.harmful = true;
    this.w = 13; this.h = 13; this.hp = 3;
    this.stompable = false;      // burr-crowned
    this.t = Math.floor(x * 1.7) % 100;
    this.burst = 0;
  }
  step(world) {
    this.t++;
    const p = world.player;
    const dx = p.x - this.x, dy = (p.y - 8) - (this.y - 6);
    const dist = Math.hypot(dx, dy);
    if (dist < 240 && !p.dead) {
      if (this.burst > 0) {
        if (this.t % 14 === 0) {
          this.burst--;
          const d = dist || 1;
          world.spawnProjectile(this.x, this.y - 8, dx / d * 1.7, dy / d * 1.7 - 0.3, {
            kind: 'burr', grav: 0.03, owner: this, parryable: true, deflectable: true, w: 6, h: 6,
          });
          this.ev(world, 'burr', {});
        }
      } else if (this.t % 210 === 0) {
        this.burst = 3;
        this.ev(world, 'podarm', {});
      }
    }
  }
}

// ------------------------------------------------------------------ warden --
// NEW: shield in front. Break it with a charge spin-slash or a pogo hit.
export class Warden extends Walker {
  constructor(x, y) {
    super(x, y);
    this.w = 15; this.h = 18; this.hp = 3;
    this.speed = 0.28;
    this.shield = true;
    this.stompable = false;
    this.pogoable = true;
  }
  onSword(world, hb, p) {
    if (!this.shield) return 'hit';
    if (hb.kind === 'spin') {
      this.breakShield(world);
      return 'hit';
    }
    // shield faces the walker's direction; hits from behind land
    const fromBehind = sign(p.x - this.x) !== this.dir;
    return fromBehind ? 'hit' : 'blocked';
  }
  hurt(world, dmg, info = {}) {
    if (this.shield && info.kind === 'pogo') this.breakShield(world);
    return super.hurt(world, dmg, info);
  }
  breakShield(world) {
    if (!this.shield) return;
    this.shield = false;
    this.ev(world, 'shieldbreak', {});
  }
  step(world) {
    if (this.stunT > 0) { this.stunT--; this.walk(world, 0); return; }
    // face the player, advance slowly
    const p = world.player;
    if (!p.dead && Math.abs(p.x - this.x) < 140) this.dir = sign(p.x - this.x) || this.dir;
    this.walk(world, this.speed, { ledgeTurn: true });
  }
}

// ----------------------------------------------------------------- duelist --
// NEW: a fencer with its own parry. Telegraphed lunges are parryable; it may
// turn your slash aside and riposte.
export class Duelist extends Walker {
  constructor(x, y) {
    super(x, y);
    this.w = 12; this.h = 19; this.hp = 3;
    this.speed = 0.42;
    this.mode = 'patrol';        // patrol | approach | windup | lunge | recover | guardbreak
    this.modeT = 0;
    this.guardCd = 0;
    this.stompable = false;
    this.pogoable = true;
  }
  get parryable() { return this.mode === 'lunge'; }
  setMode(m, t = 0) { this.mode = m; this.modeT = t; }
  staggered(world, frames) {
    this.setMode('guardbreak', frames);
    this.vx = -this.dir * 1.4;
    this.ev(world, 'stagger', {});
  }
  onSword(world, hb, p) {
    if (this.mode === 'guardbreak' || this.mode === 'recover') return 'hit';
    if (this.guardCd <= 0 && (this.mode === 'patrol' || this.mode === 'approach') && world.rng() < 0.45) {
      this.guardCd = 90;
      // turn the blow aside and riposte
      this.dir = sign(p.x - this.x) || this.dir;
      this.setMode('windup', 8);
      this.ev(world, 'enemyparry', {});
      p.vx = sign(p.x - this.x) * -1.6;  // push Pip back
      return 'parried';
    }
    return 'hit';
  }
  attackHitbox() {
    if (this.mode !== 'lunge') return null;
    return { x: this.dir === 1 ? this.x + 2 : this.x - 20, y: this.y - 16, w: 18, h: 14, dmg: 1 };
  }
  step(world) {
    if (this.guardCd > 0) this.guardCd--;
    const p = world.player;
    const dx = p.x - this.x;
    this.modeT--;
    switch (this.mode) {
      case 'patrol':
        this.walk(world, this.speed * 0.6, { ledgeTurn: true });
        if (Math.abs(dx) < 90 && Math.abs(p.y - this.y) < 40 && !p.dead) this.setMode('approach');
        break;
      case 'approach': {
        this.dir = sign(dx) || this.dir;
        this.walk(world, Math.abs(dx) > 34 ? this.speed : 0, { ledgeTurn: true });
        if (Math.abs(dx) < 42 && Math.abs(p.y - this.y) < 30) {
          this.setMode('windup', 16);
          this.ev(world, 'duelwindup', {});
        }
        if (Math.abs(dx) > 130) this.setMode('patrol');
        break;
      }
      case 'windup':
        this.walk(world, 0);
        if (this.modeT <= 0) {
          this.setMode('lunge', 10);
          this.vx = this.dir * 2.6;
          this.ev(world, 'duellunge', {});
        }
        break;
      case 'lunge': {
        this.vy = Math.min(this.vy + this.gravity, this.maxFall);
        const res = moveEntity(world, this, this.vx, this.vy);
        if (res.ground) this.vy = 0;
        this.vx = approach(this.vx, 0, 0.18);
        if (this.modeT <= 0) this.setMode('recover', 26);
        break;
      }
      case 'recover':
        this.walk(world, 0);
        if (this.modeT <= 0) this.setMode('approach');
        break;
      case 'guardbreak':
        this.vy = Math.min(this.vy + this.gravity, this.maxFall);
        moveEntity(world, this, this.vx, this.vy);
        this.vx = approach(this.vx, 0, 0.1);
        if (this.modeT <= 0) this.setMode('approach');
        break;
    }
  }
}

// --------------------------------------------------------------- glintwing --
// NEW: hovering lightcaster. Glint telegraph, then a thin laser at your last
// position. Parry the beam to send it back.
export class Glintwing extends Entity {
  constructor(x, y) {
    super(x, y);
    this.isEnemy = true; this.harmful = true; this.stompable = true;
    this.w = 14; this.h = 12; this.hp = 2;
    this.homeX = x; this.homeY = y;
    this.t = Math.floor(x) % 120;
    this.mode = 'hover';         // hover | aim | fire
    this.modeT = 0;
    this.target = null;
    this.beamSeg = null;
  }
  step(world) {
    this.t++;
    const p = world.player;
    this.beamSeg = null;
    if (this.mode === 'hover') {
      this.x = this.homeX + Math.sin(this.t * 0.03) * 14;
      this.y = this.homeY + Math.sin(this.t * 0.06) * 5;
      const d = Math.hypot(p.x - this.x, p.y - this.y);
      if (d < 180 && this.t % 160 === 0 && !p.dead) {
        this.mode = 'aim'; this.modeT = 34;
        this.ev(world, 'glint', {});
      }
    } else if (this.mode === 'aim') {
      if (--this.modeT <= 0) {
        this.target = { x: p.x, y: p.y - p.h / 2 };
        this.mode = 'fire'; this.modeT = 8;
        this.ev(world, 'dronelaser', {});
      }
    } else if (this.mode === 'fire') {
      this.modeT--;
      const t = this.target;
      const d = Math.hypot(t.x - this.x, t.y - this.y) || 1;
      const ex = this.x + (t.x - this.x) / d * 300, ey = this.y + (t.y - this.y) / d * 300;
      this.beamSeg = { x1: this.x, y1: this.y - 4, x2: ex, y2: ey };
      // segment vs player box, sampled
      if (!p.dead) {
        const hbp = p.hitbox;
        for (let s = 0; s <= 1; s += 0.02) {
          const sx = this.x + (ex - this.x) * s, sy = this.y - 4 + (ey - this.y + 4) * s;
          if (sx >= hbp.x && sx <= hbp.x + hbp.w && sy >= hbp.y && sy <= hbp.y + hbp.h) {
            if (p.parryActive) {
              world.parrySuccess(this, this);
              this.hurt(world, 2, { kind: 'reflected' });
              this.mode = 'hover'; this.modeT = 0;
            } else if (p.vulnerable) {
              world.damagePlayer(1, this.x);
            }
            break;
          }
        }
      }
      if (this.modeT <= 0) this.mode = 'hover';
    }
  }
  staggered(world, frames) {
    this.mode = 'hover';
    this.homeY += 6;
    this.ev(world, 'stagger', {});
  }
}

// -------------------------------------------------------------------- moss --
// Rideable companion. Trundles toward Pip; touch to mount. Eats small enemies
// while ridden and absorbs one hit.
export class Moss extends Entity {
  constructor(x, y) {
    super(x, y);
    this.isEnemy = false;
    this.harmful = false;
    this.w = 16; this.h = 12;
    this.mounted = false;
    this.fleeing = 0;
    this.t = 0;
  }
  absorbHit(world) {
    this.mounted = false;
    this.fleeing = 160;
    this.dir = -world.player.facing;
    this.ev(world, 'mossflee', {});
  }
  step(world) {
    this.t++;
    const p = world.player;
    if (this.mounted) {
      this.x = p.x; this.y = p.y + 1;
      this.px = this.x; this.py = this.y;
      // chomp small enemies
      for (const e of world.entities) {
        if (e.isEnemy && !e.dying && !e.removed && (e instanceof Bumble || e instanceof Spikelet || (e instanceof Snapcap && e.mode === 'walk'))) {
          if (rectsOverlap({ x: this.x - 12, y: this.y - 10, w: 24, h: 12 }, e.hitbox)) {
            e.dying = 20; e.harmful = false;
            this.ev(world, 'chomp', {});
            world.run.addScore(SCORE.enemySword);
            world.run.addSap(6);
          }
        }
      }
      if (p.riding !== this) this.mounted = false;
      return;
    }
    if (this.fleeing > 0) {
      this.fleeing--;
      this.walk(world, 1.3);
      if (this.fleeing === 0) this.removed = true;
      return;
    }
    // trundle toward Pip
    if (!p.dead) this.dir = sign(p.x - this.x) || this.dir;
    this.walk(world, Math.abs(p.x - this.x) > 12 ? 0.5 : 0, { ledgeTurn: true });
    if (!p.dead && !p.riding && rectsOverlap(this.hitbox, p.hitbox) && p.onGround) {
      p.riding = this;
      this.mounted = true;
      this.ev(world, 'mount', {});
    }
  }
}

const CLASSES = {
  bumble: Bumble, snapcap: Snapcap, spikelet: Spikelet, puffhawk: Puffhawk,
  lobber: Lobber, wisp: Wisp, pod: Pod, warden: Warden, duelist: Duelist,
  glintwing: Glintwing, moss: Moss,
};

export function makeEnemy(type, x, y, world) {
  const Cls = CLASSES[type];
  if (!Cls) return null;
  return new Cls(x, y);
}
