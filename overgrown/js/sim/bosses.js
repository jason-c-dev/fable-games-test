// World bosses. Every boss has at least one parryable signature attack
// (telegraphed with a glint event), one pogo opportunity, and one
// dash-through pattern. Damage lands only in earned vulnerability windows.
// Node-safe.

import { TILE, VIEW_W, COMBAT as C, SCORE } from '../config.js';
import { Entity, Projectile } from './entities.js';
import { moveEntity } from './physics.js';
import { sign, approach, clamp } from '../core/math.js';

export class Boss extends Entity {
  constructor(x, y, world) {
    super(x, y);
    this.isEnemy = true;
    this.harmful = true;
    this.stompable = false;
    this.pogoable = true;
    this.engaged = false;
    this.vulnT = 0;               // sword/pogo damage only while > 0
    this.mode = 'wait';
    this.modeT = 0;
    this.introT = 0;
    this.displayName = 'BOSS';
    this.active = true;
    this.dashThrough = false;     // player dashing ignores contact
    this.phaseFired = -1;
  }

  get phase() { return this.hp > this.maxHp * 2 / 3 ? 0 : this.hp > this.maxHp / 3 ? 1 : 2; }
  get vulnerableNow() { return this.vulnT > 0; }

  setMode(m, t = 0) { this.mode = m; this.modeT = t; }

  onSword(world, hb, p) {
    if (this.vulnT > 0) return 'hit';
    return 'blocked';
  }

  hurt(world, dmg, info = {}) {
    if (this.dying) return false;
    if (this.vulnT <= 0 && info.kind !== 'burst') return false;
    this.hp -= dmg;
    this.hitT = 8;
    this.ev(world, 'bosshit', { dmg });
    world.run.addScore(SCORE.bossHit);
    if (this.phase !== this.phaseFired && this.hp > 0) {
      this.phaseFired = this.phase;
      this.ev(world, 'bossphase', { phase: this.phase });
    }
    if (this.hp <= 0) { this.die(world, info); return true; }
    return false;
  }

  die(world, info = {}) {
    this.dying = 90;
    this.harmful = false;
    this.ev(world, 'enemydie', { boss: true });
    world.bossDefeated();
  }

  stepDying(world) {
    this.dying--;
    if (this.dying % 9 === 0) this.ev(world, 'bossburst', {});
    if (this.dying <= 0) this.removed = true;
  }

  engage(world) {
    if (this.engaged) return;
    this.engaged = true;
    this.introT = 70;
    this.ev(world, 'bossroar', { name: this.displayName });
    world.shake(4);
  }

  faceTo(world) { this.dir = sign(world.player.x - this.x) || this.dir; }
}

// ============================================================ KING SNAPJAW ==
// Armored snapcap king. Rhythm: parry the tongue-lash bite -> punish;
// dash through (or leap) the shell charge -> pogo him while he's wall-dazed;
// phase 2 adds a jump slam with ground shockwaves; phase 3 double charges.
export class KingSnapjaw extends Boss {
  constructor(x, y, world) {
    super(x, y, world);
    this.w = 26; this.h = 24;
    this.maxHp = this.hp = 12;
    this.displayName = 'KING SNAPJAW';
    this.dir = -1;
    this.chargesLeft = 0;
  }

  get parryable() { return this.mode === 'bite'; }

  attackHitbox() {
    if (this.mode !== 'bite') return null;
    return {
      x: this.dir === 1 ? this.x + this.w / 2 - 4 : this.x - this.w / 2 - 18,
      y: this.y - 20, w: 22, h: 16, dmg: 1,
    };
  }

  staggered(world, frames) {
    this.setMode('stagger', 130);
    this.vulnT = 130;
    this.vx = -this.dir * 1.2;
    this.ev(world, 'stagger', {});
  }

  step(world) {
    const p = world.player;
    if (!this.engaged) {
      if (Math.abs(p.x - this.x) < VIEW_W * 0.45) this.engage(world);
      return;
    }
    if (this.introT > 0) { this.introT--; return; }
    if (this.vulnT > 0) this.vulnT--;
    this.modeT--;
    const ph = this.phase;
    const speed = [0.55, 0.75, 1.0][ph];
    this.dashThrough = this.mode === 'charge';
    this.harmful = this.mode !== 'stagger' && this.mode !== 'wallstun';

    switch (this.mode) {
      case 'wait':
        this.setMode('pace', 70);
        break;
      case 'pace': {
        this.faceTo(world);
        this.vy = Math.min(this.vy + 0.5, 4.4);
        const res = moveEntity(world, this, this.dir * speed, this.vy);
        if (res.ground) this.vy = 0;
        if (this.modeT <= 0) {
          const dist = Math.abs(p.x - this.x);
          const roll = world.rng();
          if (dist < 70 && roll < 0.55) {
            this.setMode('bitewind', ph === 2 ? 26 : 20);
            this.ev(world, 'bossglint', { x: this.x + this.dir * 14, y: this.y - 16 });
          } else if (ph >= 1 && roll < 0.4) {
            this.setMode('slamwind', 24);
            this.ev(world, 'bosscrouch', {});
          } else {
            this.setMode('chargewind', 30);
            this.chargesLeft = ph === 2 ? 2 : 1;
            this.ev(world, 'bosscrouch', {});
          }
        }
        break;
      }
      case 'bitewind':
        this.faceTo(world);
        if (this.modeT <= 0) {
          this.setMode('bite', 16);
          this.vx = this.dir * 2.6;
          this.ev(world, 'bossbite', {});
        }
        break;
      case 'bite': {
        this.vy = Math.min(this.vy + 0.5, 4.4);
        const res = moveEntity(world, this, this.vx, this.vy);
        if (res.ground) this.vy = 0;
        this.vx = approach(this.vx, 0, 0.16);
        if (this.modeT <= 0) this.setMode('recover', 34 - ph * 8);
        break;
      }
      case 'chargewind':
        this.faceTo(world);
        if (this.modeT % 6 === 0) world.shake(1);
        if (this.modeT <= 0) {
          this.setMode('charge', 400);
          this.ev(world, 'bosscharge', {});
        }
        break;
      case 'charge': {
        const cs = 3.0 + ph * 0.35;
        this.vy = Math.min(this.vy + 0.5, 4.4);
        const res = moveEntity(world, this, this.dir * cs, this.vy);
        if (res.ground) this.vy = 0;
        if (world.frame % 5 === 0) this.ev(world, 'shelltrail', {});
        if (res.wallL || res.wallR) {
          this.chargesLeft--;
          if (this.chargesLeft > 0) {
            this.dir = -this.dir;
            world.shake(3);
            this.ev(world, 'shellbounce', {});
          } else {
            this.setMode('wallstun', 110 - ph * 15);
            this.vulnT = 110 - ph * 15;
            world.shake(4);
            this.ev(world, 'bossstun', {});
          }
        }
        break;
      }
      case 'slamwind':
        this.faceTo(world);
        if (this.modeT <= 0) {
          this.setMode('slam', 400);
          this.vy = -7.2;
          this.vx = clamp((p.x - this.x) / 34, -3, 3);
          this.ev(world, 'bossleap', {});
        }
        break;
      case 'slam': {
        this.vy = Math.min(this.vy + 0.42, 6);
        const res = moveEntity(world, this, this.vx, this.vy);
        if (res.ground && this.vy >= 0) {
          this.vx = 0;
          world.shake(5);
          this.ev(world, 'bossslam', {});
          for (const d of [-1, 1]) {
            const wave = new Projectile(this.x + d * 18, this.y, d * 2.2, 0, {
              kind: 'shockwave', grav: 0.55, dmg: 1, parryable: false, deflectable: false,
              w: 10, h: 8, life: 90,
            });
            wave.bounces = 99;
            world.spawn(wave);
          }
          this.setMode('slamrecover', 46);
          this.vulnT = 46;
        }
        break;
      }
      case 'wallstun':
      case 'slamrecover':
      case 'stagger': {
        this.vy = Math.min(this.vy + 0.5, 4.4);
        const res = moveEntity(world, this, this.vx, this.vy);
        if (res.ground) this.vy = 0;
        this.vx = approach(this.vx, 0, 0.1);
        if (this.modeT <= 0) { this.setMode('recover', 20); this.vulnT = Math.min(this.vulnT, 8); }
        break;
      }
      case 'recover':
        this.faceTo(world);
        if (this.modeT <= 0) this.setMode('pace', 60 - ph * 12);
        break;
    }
  }
}

// ================================================================ GRUBMAW ==
// The cave grub. Burrows under the arena (a moving mound of dirt), erupts
// beneath you with a parryable bite; dash through the eruption. While
// surfaced it spits rock arcs (deflect or parry them) and can be pogo'd
// once parried or spent.
export class Grubmaw extends Boss {
  constructor(x, y, world) {
    super(x, y, world);
    this.w = 30; this.h = 20;
    this.maxHp = this.hp = 14;
    this.displayName = 'GRUBMAW';
    this.burrowX = x;
    this.mode = 'burrowed';
    this.modeT = 60;
    this.harmful = false;
    this.emergesLeft = 0;
  }

  get parryable() { return this.mode === 'emerge'; }

  attackHitbox() {
    if (this.mode !== 'emerge') return null;
    return { x: this.x - 14, y: this.y - this.h - 6, w: 28, h: this.h + 6, dmg: 1 };
  }

  staggered(world, frames) {
    this.setMode('surfaced', 150);
    this.vulnT = 150;
    this.vy = 0;
    this.ev(world, 'stagger', {});
  }

  step(world) {
    const p = world.player;
    if (!this.engaged) {
      if (Math.abs(p.x - this.x) < 200) this.engage(world);
      return;
    }
    if (this.introT > 0) { this.introT--; return; }
    if (this.vulnT > 0) this.vulnT--;
    this.modeT--;
    const ph = this.phase;
    const floorY = (world.room.h - 3) * 16;
    this.dashThrough = this.mode === 'emerge';

    switch (this.mode) {
      case 'burrowed': {
        this.harmful = false;
        this.y = floorY + 18;                     // hidden below the dirt
        const chase = [0.9, 1.15, 1.45][ph];
        this.x = approach(this.x, clamp(p.x, 60, world.room.w * 16 - 60), chase);
        if (world.frame % 6 === 0) this.ev(world, 'dirttrail', { x: this.x, y: floorY });
        if (this.modeT <= 0 && Math.abs(this.x - p.x) < 26) {
          if (!this.chained) this.emergesLeft = ph === 2 ? 1 : 0;   // fake-outs don't restart the chain
          this.chained = false;
          this.setMode('emergewind', ph === 2 ? 18 : 24);
          this.ev(world, 'emergewind', { x: this.x, y: floorY });
          world.shake(2);
        }
        break;
      }
      case 'emergewind':
        if (this.modeT % 4 === 0) this.ev(world, 'dirttrail', { x: this.x, y: floorY });
        if (this.modeT <= 0) {
          this.setMode('emerge', 26);
          this.harmful = true;
          this.y = floorY;
          this.vy = -5.6;
          this.ev(world, 'grubemerge', {});
          world.shake(3);
        }
        break;
      case 'emerge':
        this.vy += 0.34;
        this.y += this.vy;
        if (this.vy > 0 && this.y >= floorY) {
          this.y = floorY;
          if (this.emergesLeft > 0) {
            this.emergesLeft--;
            this.chained = true;
            this.setMode('burrowed', 20);         // fake-out re-dive
            this.harmful = false;
          } else {
            this.setMode('surfaced', [130, 120, 100][ph]);
            this.vulnT = [70, 60, 50][ph];        // brief punish before spitting
          }
        }
        break;
      case 'surfaced': {
        this.harmful = true;
        this.faceTo(world);
        // spit rock arcs while surfaced (after the punish window)
        if (this.vulnT <= 0 && this.modeT % (ph === 2 ? 26 : 38) === 0 && this.modeT > 20) {
          const dx = sign(p.x - this.x) || 1;
          world.spawnProjectile(this.x + dx * 10, this.y - this.h + 4,
            dx * (1.1 + world.rng() * 0.8), -3.4, {
              kind: 'rock', grav: 0.16, parryable: true, deflectable: true, owner: this, w: 9, h: 9,
            });
          this.ev(world, 'grubspit', {});
        }
        if (this.modeT <= 0) {
          this.setMode('burrowed', [90, 70, 55][ph]);
          this.harmful = false;
          this.ev(world, 'grubdive', {});
          world.shake(2);
        }
        break;
      }
    }
  }
}

// ================================================== ZEPHYRA, GALE MATRON ==
// Queen of the puffhawks. Feather fans from on high (deflectable), a
// glint-telegraphed dive you can parry or dash through, and a ground skid
// that leaves her wide open to pogo. Gusts shove the arena from phase 2.
export class Zephyra extends Boss {
  constructor(x, y, world) {
    super(x, y, world);
    this.w = 30; this.h = 22;
    this.maxHp = this.hp = 14;
    this.displayName = 'ZEPHYRA THE GALE MATRON';
    this.homeY = y - 130;
    this.y = this.homeY;
    this.mode = 'hover';
    this.modeT = 80;
    this.diveVec = null;
    this.divesLeft = 0;
    this.t = 0;
  }

  get parryable() { return this.mode === 'dive'; }

  attackHitbox() {
    if (this.mode !== 'dive') return null;
    return { x: this.x - 16, y: this.y - this.h - 2, w: 32, h: this.h + 4, dmg: 1 };
  }

  staggered(world, frames) {
    this.setMode('skid', 150);
    this.vulnT = 150;
    this.vy = 2;
    this.ev(world, 'stagger', {});
  }

  step(world) {
    const p = world.player;
    this.t++;
    if (!this.engaged) {
      if (Math.abs(p.x - this.x) < 200) this.engage(world);
      return;
    }
    if (this.introT > 0) { this.introT--; return; }
    if (this.vulnT > 0) this.vulnT--;
    this.modeT--;
    const ph = this.phase;
    const floorY = (world.room.h - 3) * 16;
    this.dashThrough = this.mode === 'dive';

    // phase 2+: gust cycles shove the arena
    if (ph >= 1 && this.t % 260 === 0 && this.mode === 'hover') {
      world.windOverride = { vx: (world.rng() < 0.5 ? -1 : 1) * (0.9 + ph * 0.3), t: 120 };
      this.ev(world, 'gust', {});
    }

    switch (this.mode) {
      case 'hover': {
        this.harmful = true;
        this.x += Math.sin(this.t * 0.02) * 1.1;
        this.x = clamp(this.x, 70, world.room.w * 16 - 70);
        this.y = this.homeY + Math.sin(this.t * 0.045) * 8;
        if (this.modeT <= 0) {
          if (world.rng() < 0.45) {
            this.setMode('fan', 40);
          } else {
            this.divesLeft = ph === 2 ? 1 : 0;
            this.setMode('divewind', 30);
            this.ev(world, 'bossglint', { x: this.x, y: this.y - 10 });
          }
        }
        break;
      }
      case 'fan': {
        // feather volley: spread of 5, deflectable
        if (this.modeT === 20) {
          const n = ph === 2 ? 7 : 5;
          for (let i = 0; i < n; i++) {
            const a = Math.PI * (0.25 + 0.5 * i / (n - 1));
            world.spawnProjectile(this.x, this.y - 8,
              Math.cos(a) * 2 * (p.x < this.x ? -1 : 1), Math.sin(a) * 1.6, {
                kind: 'feather', grav: 0.04, parryable: true, deflectable: true, owner: this, w: 8, h: 6, life: 200,
              });
          }
          this.ev(world, 'featherfan', {});
        }
        if (this.modeT <= 0) this.setMode('hover', [90, 70, 55][ph]);
        break;
      }
      case 'divewind':
        this.faceTo(world);
        if (this.modeT <= 0) {
          const d = Math.max(40, Math.hypot(p.x - this.x, (p.y - 8) - this.y));
          this.diveVec = { x: (p.x - this.x) / d * (4.2 + ph * 0.5), y: ((p.y - 8) - this.y) / d * (4.2 + ph * 0.5) };
          this.setMode('dive', 200);
          this.ev(world, 'swoop', {});
        }
        break;
      case 'dive': {
        this.x += this.diveVec.x;
        this.y += this.diveVec.y;
        this.diveVec.y += 0.05;
        if (this.y >= floorY) {
          this.y = floorY;
          if (this.divesLeft > 0) {
            this.divesLeft--;
            this.vy = -4;
            this.setMode('redive', 26);
          } else {
            this.setMode('skid', [110, 95, 80][ph]);
            this.vulnT = [110, 95, 80][ph];
            this.ev(world, 'bossstun', {});
            world.shake(4);
          }
        }
        if (this.x < 50 || this.x > world.room.w * 16 - 50) {
          this.diveVec.x = -this.diveVec.x * 0.6;
        }
        break;
      }
      case 'redive':
        this.y += this.vy;
        this.vy -= 0.1;
        if (this.modeT <= 0) {
          this.setMode('divewind', 16);
          this.ev(world, 'bossglint', { x: this.x, y: this.y - 10 });
        }
        break;
      case 'skid': {
        this.harmful = false;
        this.x = approach(this.x, this.x + (this.diveVec ? sign(this.diveVec.x) * 0.4 : 0), 0.4);
        if (this.modeT <= 0) {
          this.setMode('rise', 60);
          this.harmful = true;
        }
        break;
      }
      case 'rise':
        this.y = approach(this.y, this.homeY, 2.4);
        if (Math.abs(this.y - this.homeY) < 3 || this.modeT <= 0) this.setMode('hover', 70);
        break;
    }
  }
}

// ========================================================= GENERAL BRAMBLE ==
// Armored in living thorn, wielding stolen light. Four phases:
//  1. thorn whip (parryable) + lunge (dash through; wall impact = pogo stun)
//  2. + stolen-light lasers (parry to reflect) and thornling summons
//  3. + double lunges and floor-running thorn eruptions
//  4. THE DUEL: swords only — his guard turns everything; only a parried
//     slash staggers him. Parry timing is the win condition.
export class GeneralBramble extends Boss {
  constructor(x, y, world) {
    super(x, y, world);
    this.w = 22; this.h = 32;
    this.maxHp = this.hp = 24;
    this.displayName = 'GENERAL BRAMBLE';
    this.dir = -1;
    this.mode = 'wait';
    this.lungesLeft = 0;
    this.duelHits = 0;
    this.laserTarget = null;
    this.beamSeg = null;
    this.duelAnnounced = false;
  }

  get phase() {
    return this.hp > this.maxHp * 0.75 ? 0 : this.hp > this.maxHp * 0.5 ? 1 : this.hp > 6 ? 2 : 3;
  }

  get parryable() { return this.mode === 'whip' || this.mode === 'duelslash'; }

  attackHitbox() {
    if (this.mode === 'whip') {
      return { x: this.dir === 1 ? this.x + 6 : this.x - 6 - 34, y: this.y - 30, w: 34, h: 22, dmg: 1 };
    }
    if (this.mode === 'duelslash') {
      return { x: this.dir === 1 ? this.x + 4 : this.x - 4 - 24, y: this.y - 28, w: 24, h: 24, dmg: 1 };
    }
    return null;
  }

  staggered(world, frames) {
    const duel = this.phase === 3;
    this.setMode('stagger', duel ? 110 : 140);
    this.vulnT = duel ? 110 : 140;
    this.vx = -this.dir * 1.5;
    this.ev(world, 'stagger', {});
  }

  step(world) {
    const p = world.player;
    if (!this.engaged) {
      if (Math.abs(p.x - this.x) < VIEW_W * 0.45) this.engage(world);
      return;
    }
    if (this.introT > 0) { this.introT--; return; }
    if (this.vulnT > 0) this.vulnT--;
    this.modeT--;
    const ph = this.phase;
    this.beamSeg = this.mode === 'laser' ? this.beamSeg : null;
    this.dashThrough = this.mode === 'lunge';
    this.harmful = !['stagger', 'wallstun'].includes(this.mode);

    if (ph === 3 && !this.duelAnnounced) {
      this.duelAnnounced = true;
      this.setMode('duelstance', 60);
      this.ev(world, 'bossduel', {});
      world.shake(4);
    }

    const grounded = () => {
      this.vy = Math.min((this.vy || 0) + 0.5, 4.4);
      const res = moveEntity(world, this, this.vx || 0, this.vy);
      if (res.ground) this.vy = 0;
      return res;
    };

    switch (this.mode) {
      case 'wait': this.setMode('pace', 60); break;

      case 'pace': {
        this.faceTo(world);
        this.vx = this.dir * (0.5 + ph * 0.15);
        grounded();
        if (this.modeT <= 0) {
          const dist = Math.abs(p.x - this.x);
          const roll = world.rng();
          if (ph >= 1 && roll < 0.3) {
            this.laserTarget = null;
            this.setMode('laserwind', 34);
            this.ev(world, 'bossglint', { x: this.x, y: this.y - 26 });
          } else if (ph >= 1 && roll < 0.45 && world.entities.filter(e => e.constructor.name === 'Spikelet').length < 2) {
            this.setMode('summon', 40);
            this.ev(world, 'bosssummon', {});
          } else if (dist < 80 && roll < 0.75) {
            this.setMode('whipwind', 22 - ph * 3);
            this.ev(world, 'bossglint', { x: this.x + this.dir * 16, y: this.y - 24 });
          } else {
            this.lungesLeft = ph >= 2 ? 1 : 0;
            this.setMode('lungewind', 26);
            this.ev(world, 'bosscrouch', {});
          }
        }
        break;
      }

      case 'whipwind':
        this.faceTo(world); this.vx = 0; grounded();
        if (this.modeT <= 0) { this.setMode('whip', 14); this.ev(world, 'bosswhip', {}); }
        break;
      case 'whip':
        grounded();
        if (this.modeT <= 0) this.setMode('recover', 30 - ph * 5);
        break;

      case 'lungewind':
        this.faceTo(world); this.vx = 0; grounded();
        if (this.modeT % 6 === 0) world.shake(1);
        if (this.modeT <= 0) { this.setMode('lunge', 300); this.ev(world, 'bosslunge', {}); }
        break;
      case 'lunge': {
        this.vx = this.dir * (3.2 + ph * 0.3);
        const res = grounded();
        if (world.frame % 5 === 0) this.ev(world, 'shelltrail', {});
        if (res.wallL || res.wallR) {
          if (this.lungesLeft > 0) {
            this.lungesLeft--;
            this.dir = -this.dir;
            world.shake(3);
          } else {
            this.setMode('wallstun', 100 - ph * 10);
            this.vulnT = 100 - ph * 10;
            this.vx = 0;
            world.shake(4);
            this.ev(world, 'bossstun', {});
          }
        }
        break;
      }

      case 'laserwind':
        this.faceTo(world); this.vx = 0; grounded();
        if (this.modeT <= 0) {
          this.laserTarget = { x: p.x, y: p.y - p.h / 2 };
          this.setMode('laser', 10);
          this.ev(world, 'dronelaser', {});
        }
        break;
      case 'laser': {
        grounded();
        const t = this.laserTarget;
        const sx = this.x + this.dir * 6, sy = this.y - 24;
        const d = Math.hypot(t.x - sx, t.y - sy) || 1;
        const ex = sx + (t.x - sx) / d * 340, ey = sy + (t.y - sy) / d * 340;
        this.beamSeg = { x1: sx, y1: sy, x2: ex, y2: ey };
        if (!p.dead) {
          const hbp = p.hitbox;
          for (let s = 0; s <= 1; s += 0.02) {
            const lx = sx + (ex - sx) * s, ly = sy + (ey - sy) * s;
            if (lx >= hbp.x && lx <= hbp.x + hbp.w && ly >= hbp.y && ly <= hbp.y + hbp.h) {
              if (p.parryActive) {
                world.parrySuccess(this, null);
                this.hp -= 1;                       // reflected light burns him
                this.hitT = 8;
                this.vulnT = Math.max(this.vulnT, 40);
                this.ev(world, 'bosshit', { dmg: 1 });
                this.setMode('recover', 40);
              } else if (p.vulnerable) {
                world.damagePlayer(1, this.x);
              }
              break;
            }
          }
        }
        if (this.modeT <= 0 && this.mode === 'laser') {
          if (ph >= 2 && world.rng() < 0.5) { this.setMode('laserwind', 20); }
          else this.setMode('recover', 26);
          this.beamSeg = null;
        }
        break;
      }

      case 'summon': {
        grounded();
        if (this.modeT === 20) {
          for (const dx of [-40, 40]) {
            const s = makeEnemySafe('spikelet', this.x + dx, this.y, world);
            if (s) { s.active = true; world.spawn(s); }
          }
          this.ev(world, 'grubemerge', {});
        }
        if (this.modeT <= 0) this.setMode('recover', 20);
        break;
      }

      case 'duelstance': {
        // walk to guard range, then begin strings
        this.faceTo(world);
        const dist = Math.abs(p.x - this.x);
        this.vx = dist > 46 ? this.dir * 0.9 : 0;
        grounded();
        if (this.modeT <= 0 && dist < 70) {
          this.duelHits = 1 + (world.rng() < 0.5 ? 1 : 0) + (world.rng() < 0.3 ? 1 : 0);
          this.setMode('duelwind', 22);
          this.ev(world, 'bossglint', { x: this.x + this.dir * 12, y: this.y - 22 });
          this.ev(world, 'duelwindup', {});
        } else if (this.modeT <= 0) this.modeT = 20;
        break;
      }
      case 'duelwind':
        this.faceTo(world); this.vx = 0; grounded();
        if (this.modeT <= 0) {
          this.setMode('duelslash', 12);
          this.vx = this.dir * 1.8;
          this.ev(world, 'bosswhip', {});
        }
        break;
      case 'duelslash':
        grounded();
        this.vx = approach(this.vx, 0, 0.2);
        if (this.modeT <= 0) {
          this.duelHits--;
          if (this.duelHits > 0) this.setMode('duelwind', 14);
          else this.setMode('duelstance', 40);
        }
        break;

      case 'wallstun':
      case 'stagger': {
        grounded();
        this.vx = approach(this.vx || 0, 0, 0.1);
        if (this.modeT <= 0) {
          this.setMode(this.phase === 3 ? 'duelstance' : 'recover', 24);
          this.vulnT = Math.min(this.vulnT, 6);
        }
        break;
      }
      case 'recover':
        this.faceTo(world); this.vx = 0; grounded();
        if (this.modeT <= 0) this.setMode(this.phase === 3 ? 'duelstance' : 'pace', 50 - ph * 8);
        break;
    }

    // phase 3: floor-running thorn eruptions
    if (ph === 2 && world.frame % 210 === 0 && this.mode !== 'wallstun' && this.mode !== 'stagger') {
      for (const d of [-1, 1]) {
        const wave = new Projectile(this.x + d * 16, (world.room.h - 3) * TILE, d * 1.9, 0, {
          kind: 'shockwave', grav: 0.55, dmg: 1, parryable: false, deflectable: false, w: 10, h: 8, life: 110,
        });
        wave.bounces = 99;
        world.spawn(wave);
      }
      this.ev(world, 'grubemerge', { x: this.x, y: this.y });
      world.shake(2);
    }
  }

  die(world, info = {}) {
    this.dying = 150;
    this.harmful = false;
    this.beamSeg = null;
    this.ev(world, 'brambledown', {});
    world.bossDefeated();
  }
}

// avoid a circular import: resolved lazily through the world's registry
let _makeEnemyRef = null;
export function _bindEnemyFactory(fn) { _makeEnemyRef = fn; }
function makeEnemySafe(type, x, y, world) {
  return _makeEnemyRef ? _makeEnemyRef(type, x, y, world) : null;
}

export const BOSS_CLASSES = { snapjaw: KingSnapjaw, grubmaw: Grubmaw, zephyra: Zephyra, bramble: GeneralBramble };
export function registerBoss(kind, cls) { BOSS_CLASSES[kind] = cls; }

export function makeBoss(kind, world) {
  const Cls = BOSS_CLASSES[kind];
  if (!Cls) return null;
  const room = world.rooms.main;
  const b = new Cls(room.w * TILE * 0.72, (room.h - 3) * TILE, world);
  if (world.def.bossName) b.displayName = world.def.bossName;
  return b;
}
