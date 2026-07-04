// Entity base + items + projectiles. Enemies live in enemies.js. Node-safe.

import { TILE, T, COMBAT as C, PHYS as P, SCORE } from '../config.js';
import { moveEntity, groundBelow, tx } from './physics.js';
import { rectsOverlap, approach, sign } from '../core/math.js';

let _nextId = 1;

export class Entity {
  constructor(x, y) {
    this.id = _nextId++;
    this.x = x; this.y = y;
    this.px = x; this.py = y;
    this.vx = 0; this.vy = 0;
    this.w = 12; this.h = 12;
    this.dir = -1;
    this.hp = 1;
    this.removed = false;
    this.active = false;          // woken when near the camera
    this.harmful = false;         // contact damage
    this.stompable = false;
    this.pogoable = true;         // down-plunge can bounce off it
    this.swordable = true;        // melee damages it
    this.isEnemy = false;
    this.isItem = false;
    this.isProjectile = false;
    this.gravity = P.gravity;
    this.maxFall = P.maxFall;
    this.hitT = 0;                // hit-flash timer
    this.dying = 0;               // death animation countdown
    this.spawnIndex = -1;
  }

  get hitbox() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }
  snapshot() { this.px = this.x; this.py = this.y; }
  ev(world, t, data) { world.events.push({ t, x: this.x, y: this.y - this.h / 2, ...data }); }

  step(world) {}

  walk(world, speed, opts = {}) {
    this.vy = Math.min(this.vy + this.gravity, this.maxFall);
    const res = moveEntity(world, this, this.dir * speed, this.vy);
    if (res.ground) this.vy = 0;
    if (res.wallL) this.dir = 1;
    if (res.wallR) this.dir = -1;
    if (opts.ledgeTurn && res.ground && !groundBelow(world, { x: this.x + this.dir * (this.w / 2 + 3), y: this.y, w: 4, h: this.h }, 4)) {
      this.dir = -this.dir;
    }
    return res;
  }

  hurt(world, dmg, info = {}) {
    if (this.dying) return false;
    this.hp -= dmg;
    this.hitT = 8;
    if (info.kb) {
      this.vx = sign(info.dx ?? 1) * info.kb;
      this.vy = Math.min(this.vy, -info.kb * 0.4);
    }
    this.ev(world, 'enemyhit', { dmg, kind: info.kind });
    if (this.hp <= 0) { this.die(world, info); return true; }
    return false;
  }

  die(world, info = {}) {
    this.dying = 24;
    this.harmful = false;
    this.ev(world, 'enemydie', { kind: info.kind });
    world.run.addScore(SCORE.enemySword);
    world.run.addSap(C.sapPerHit);
    if (world.rng() < 0.12) world.spawnItem('fruit', this.x, this.y - 6);
  }

  stepDying(world) {
    this.dying--;
    this.vy = Math.min(this.vy + 0.3, 3);
    this.y += this.vy;
    if (this.dying <= 0) this.removed = true;
  }
}

// ------------------------------------------------------------------ items --
export class Coin extends Entity {
  constructor(x, y) { super(x, y); this.w = 8; this.h = 12; this.isItem = true; this.bobT = (x * 7 + y * 3) % 60; }
  step(world) {
    this.bobT++;
    const p = world.player;
    if (!p.dead && rectsOverlap(this.hitbox, p.hitbox)) {
      this.removed = true;
      world.run.addCoin();
      world.run.addScore(SCORE.coin);
      this.ev(world, 'coin', {});
    }
  }
}

export class DewStar extends Entity {
  constructor(x, y, starIndex) {
    super(x, y); this.w = 12; this.h = 14; this.isItem = true;
    this.starIndex = starIndex; this.bobT = 0;
  }
  step(world) {
    this.bobT++;
    const p = world.player;
    if (!p.dead && rectsOverlap(this.hitbox, p.hitbox)) {
      this.removed = true;
      world.run.collectStar(world.levelId, this.starIndex);
      world.run.addScore(SCORE.star);
      this.ev(world, 'star', { idx: this.starIndex });
    }
  }
}

// popped from item blocks / drops: sun fruit (heart), glider cap, clover (1-up)
export class Pickup extends Entity {
  constructor(x, y, kind) {
    super(x, y);
    this.kind = kind;              // 'fruit' | 'glider' | 'clover' | 'sapdrop'
    this.w = 12; this.h = 12; this.isItem = true;
    this.vy = -2.4;
    this.emergeT = kind === 'sapdrop' ? 0 : 16;
    this.vx = 0;
    this.lifeT = kind === 'sapdrop' ? 400 : Infinity;
  }
  step(world) {
    if (this.emergeT > 0) { this.emergeT--; this.y -= 0.5; return; }
    if (this.lifeT !== Infinity && --this.lifeT <= 0) { this.removed = true; return; }
    if (this.kind === 'beam') {
      // sacred pedestal float
      this.y += Math.sin(world.frame * 0.05) * 0.06;
      const p2 = world.player;
      if (!p2.dead && rectsOverlap(this.hitbox, p2.hitbox)) {
        this.removed = true;
        world.run.hasBeam = true;
        this.ev(world, 'relicbeam', {});
      }
      return;
    }
    if (this.kind === 'fruit' || this.kind === 'sapdrop') {
      this.vy = Math.min(this.vy + 0.25, 2.5);
      const res = moveEntity(world, this, this.vx, this.vy);
      if (res.ground) { this.vy = 0; this.vx = approach(this.vx, 0, 0.05); }
    } else {
      // glider cap / clover drift down like a leaf
      this.vy = Math.min(this.vy + 0.12, 0.8);
      this.x += Math.sin(this.lifeT === Infinity ? world.frame * 0.05 + this.id : 0) * 0.4;
      moveEntity(world, this, 0, this.vy);
    }
    const p = world.player;
    if (!p.dead && rectsOverlap(this.hitbox, p.hitbox)) {
      this.removed = true;
      if (this.kind === 'fruit') {
        world.run.hearts = Math.min(world.run.maxHearts, world.run.hearts + 1);
        this.ev(world, 'fruit', {});
      } else if (this.kind === 'glider') {
        world.run.relic = 'glider';
        this.ev(world, 'relic', { kind: 'glider' });
      } else if (this.kind === 'clover') {
        world.run.lives++;
        this.ev(world, 'oneup', {});
      } else if (this.kind === 'sapdrop') {
        world.run.addSap(14);
        this.ev(world, 'sappickup', {});
      }
    }
  }
}

// coin that flies out of a bumped block
export class BlockCoin extends Entity {
  constructor(x, y) { super(x, y); this.isItem = true; this.vy = -4.5; this.t = 0; }
  step(world) {
    this.t++;
    this.vy += 0.4;
    this.y += this.vy;
    if (this.t > 22) this.removed = true;
  }
}

// ------------------------------------------------------------ projectiles --
export class Projectile extends Entity {
  constructor(x, y, vx, vy, opts = {}) {
    super(x, y);
    this.vx = vx; this.vy = vy;
    this.w = opts.w || 8; this.h = opts.h || 8;
    this.isProjectile = true;
    this.harmful = true;
    this.friendly = false;         // true after deflect/parry
    this.kind = opts.kind || 'burr';
    this.grav = opts.grav ?? 0.14;
    this.dmg = opts.dmg || 1;
    this.parryable = opts.parryable ?? true;
    this.deflectable = opts.deflectable ?? true;
    this.bounces = opts.bounces || 0;
    this.life = opts.life || 400;
    this.owner = opts.owner || null;
    this.pogoable = false;
    this.stompable = false;
    this.swordable = false;
  }
  step(world) {
    this.life--;
    if (this.life <= 0) { this.removed = true; return; }
    this.vy += this.grav;
    const res = moveEntity(world, this, this.vx, this.vy);
    if (res.ground || res.ceil || res.wallL || res.wallR) {
      if (this.bounces > 0) {
        this.bounces--;
        if (res.ground || res.ceil) this.vy = -this.vy * 0.6;
        if (res.wallL || res.wallR) this.vx = -this.vx * 0.7;
      } else {
        this.removed = true;
        this.ev(world, 'projbreak', { kind: this.kind });
        return;
      }
    }
    if (this.friendly) {
      // hits enemies
      for (const e of world.entities) {
        if (e.isEnemy && !e.dying && !e.removed && rectsOverlap(this.hitbox, e.hitbox)) {
          e.hurt(world, this.dmg * 2, { kind: 'reflected', dx: this.vx });
          this.removed = true;
          return;
        }
      }
    }
  }
  deflect(world, facing) {
    this.friendly = true;
    this.vx = Math.abs(this.vx || 1.5) * facing * 1.4;
    this.vy = -Math.abs(this.vy) * 0.3 - 0.5;
    this.ev(world, 'deflect', {});
  }
  parryReflect(world, targetEntity) {
    this.friendly = true;
    if (targetEntity) {
      const d = Math.hypot(targetEntity.x - this.x, targetEntity.y - this.y) || 1;
      const s = 4.2;
      this.vx = (targetEntity.x - this.x) / d * s;
      this.vy = (targetEntity.y - 8 - this.y) / d * s;
    } else {
      this.vx = -this.vx * 1.6; this.vy = -Math.abs(this.vy) * 0.5;
    }
    this.grav = 0;
    this.ev(world, 'parryreflect', {});
  }
}

// training dummy for the combat gym
export class Dummy extends Entity {
  constructor(x, y) {
    super(x, y);
    this.w = 14; this.h = 22;
    this.hp = 9999; this.maxHp = 9999;
    this.isEnemy = true;
    this.harmful = false;
    this.stompable = false;
    this.pogoable = true;
    this.taken = 0;
  }
  hurt(world, dmg, info = {}) {
    this.taken += dmg;
    this.hitT = 8;
    this.ev(world, 'enemyhit', { dmg, kind: info.kind, dummy: true });
    world.run.addSap(C.sapPerHit);
    return false;
  }
  step(world) {
    // wobble back upright
    if (this.hitT > 0) this.hitT--;
  }
}
