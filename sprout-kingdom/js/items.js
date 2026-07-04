// Entity base + collectibles, power-up items, Moss, projectiles, checkpoints.

class Entity {
  // (x, y) = bottom-center spawn point
  constructor(level, x, y, w, h) {
    this.level = level;
    this.w = w; this.h = h;
    this.x = x - w / 2; this.y = y - h;
    this.vx = 0; this.vy = 0;
    this.dir = -1;
    this.removed = false;
    this.active = false;
    this.animT = Math.floor(Math.random() * 60);
  }
  get cx() { return this.x + this.w / 2; }
  get bottom() { return this.y + this.h; }
  update() { this.animT++; }
  draw(ctx, cam) {}
  touchPlayer(p) {}
  // enemy-likeness flags
  get isEnemy() { return false; }
}

// ---------------- coin ----------------
class Coin extends Entity {
  constructor(level, x, y) { super(level, x, y, 10, 14); }
  update() { this.animT++; }
  draw(ctx, cam) {
    const f = Sprites.coin[(this.animT >> 3) % 4];
    drawSprite(ctx, f, this.cx, this.bottom, false, cam);
  }
  touchPlayer(p) {
    this.removed = true;
    this.level.collectCoin(this.cx, this.y);
  }
}

// coin popping out of a bumped block (auto-collected)
class CoinPop extends Entity {
  constructor(level, x, y) {
    super(level, x, y, 10, 14);
    this.vy = -4.2;
    this.life = 24;
    level.collectCoin(x, y, true);
  }
  update() {
    this.animT++;
    this.y += this.vy; this.vy += 0.3;
    if (--this.life <= 0) {
      this.removed = true;
      Particles.burst(this.cx, this.y + 4, 4, { color: '#ffd23e', life: 14, speed: 0.8 });
    }
  }
  draw(ctx, cam) {
    drawSprite(ctx, Sprites.coin[(this.animT >> 2) % 4], this.cx, this.bottom, false, cam);
  }
}

// ---------------- dew star ----------------
class DewStar extends Entity {
  constructor(level, x, y, starIndex) {
    super(level, x, y, 12, 12);
    this.starIndex = starIndex;
    this.baseY = this.y;
    this.already = Save.levelRec(level.def.id).stars[starIndex];
  }
  update() {
    this.animT++;
    this.y = this.baseY + Math.sin(this.animT / 20) * 2;
    if (this.animT % 20 === 0 && !this.already) {
      Particles.spawn(this.cx + (Math.random() * 12 - 6), this.y + Math.random() * 10,
        { vx: 0, vy: -0.3, g: 0, color: '#aef7ff', life: 20 });
    }
  }
  draw(ctx, cam) {
    ctx.globalAlpha = this.already ? 0.45 : 1;
    drawSprite(ctx, Sprites.dewStar[(this.animT >> 4) % 2], this.cx, this.bottom, false, cam);
    ctx.globalAlpha = 1;
  }
  touchPlayer(p) {
    this.removed = true;
    this.level.collectStar(this.starIndex, this.cx, this.y);
  }
}

// ---------------- power-up items ----------------
class PowerItem extends Entity {
  // kind: fruit | blossom | glider | clover; rise: emerging from a block
  constructor(level, x, y, kind, rise = false) {
    super(level, x, y, 14, 14);
    this.kind = kind;
    this.riseT = rise ? 16 : 0;
    this.riseFrom = this.y;
    if (rise) this.y += 14;
  }
  get sprite() {
    return { fruit: Sprites.sunFruit, blossom: Sprites.fireBlossom,
             glider: Sprites.gliderCap, clover: Sprites.clover }[this.kind];
  }
  update() {
    this.animT++;
    if (this.riseT > 0) {
      this.riseT--;
      this.y -= 14 / 16;
      if (this.riseT === 0) {
        if (this.kind === 'fruit') this.vx = 0.7;
        if (this.kind === 'clover') this.vx = 1.1;
      }
      return;
    }
    if (this.kind === 'fruit' || this.kind === 'clover') {
      this.vy = Math.min(this.vy + 0.3, 4);
      const res = tileMove(this.level, this, { oneWay: true });
      if (res.hitWall) { this.vx = -this.vx; this.dir = -this.dir; }
      if (res.onMover) this.x += res.onMover.dx;
      if (Math.abs(this.vx) < 0.2) this.vx = (this.kind === 'clover' ? 1.1 : 0.7) * (this.dir || 1);
      this.vx = Math.sign(this.vx) * (this.kind === 'clover' ? 1.1 : 0.7);
    } else if (this.kind === 'glider') {
      // drifts down like a maple seed
      this.vy = 0.5;
      this.vx = Math.sin(this.animT / 24) * 0.8;
      tileMove(this.level, this, { oneWay: true });
    }
    if (this.y > this.level.room.h * TILE + 40) this.removed = true;
  }
  draw(ctx, cam) {
    if (this.riseT > 0) {
      // clip to reveal from block
      ctx.save();
      const bx = Math.round(this.riseFrom - cam.y);
      ctx.beginPath();
      ctx.rect(0, 0, VIEW_W, Math.round(this.riseFrom + 14 - cam.y));
      ctx.clip();
      drawSprite(ctx, this.sprite, this.cx, this.bottom, false, cam);
      ctx.restore();
    } else {
      drawSprite(ctx, this.sprite, this.cx, this.bottom, false, cam);
    }
  }
  touchPlayer(p) {
    if (this.riseT > 8) return;
    this.removed = true;
    AudioSys.powerup();
    p.collectPowerItem(this.kind);
  }
}

// reserve item falling from the HUD
class ReserveItem extends PowerItem {
  constructor(level, camX, camY, kind) {
    super(level, camX + VIEW_W / 2, camY + 40, kind, false);
    this.falling = true;
  }
  update() {
    this.animT++;
    this.vy = 0.55;
    this.vx = Math.sin(this.animT / 20) * 0.4;
    this.x += this.vx; this.y += this.vy;
    if (this.y > this.level.room.h * TILE + 40) this.removed = true;
  }
}

// ---------------- Moss the beetle ----------------
class MossEnt extends Entity {
  constructor(level, x, y, flee = false) {
    super(level, x, y, 20, 16);
    this.flee = flee;
    this.fleeT = flee ? 320 : 0;
    this.hopT = 0;
    this.onGround = false;
    if (flee) { this.vx = 2.2 * (Math.random() < 0.5 ? -1 : 1); this.vy = -3; }
  }
  update() {
    this.animT++;
    if (this.flee) {
      this.fleeT--;
      if (this.fleeT <= 0) { this.flee = false; this.vx = 0; }
    }
    // idle hop
    this.hopT++;
    if (this.onGround && this.hopT > (this.flee ? 20 : 70)) {
      this.vy = this.flee ? -3.4 : -2.2;
      this.hopT = 0;
    }
    this.vy = Math.min(this.vy + 0.3, 4.2);
    const res = tileMove(this.level, this, { oneWay: true });
    this.onGround = res.onGround;
    if (res.hitWall) this.vx = -this.vx;
    if (res.onMover) this.x += res.onMover.dx;
    if (!this.flee && this.onGround) this.vx *= 0.8;
    if (this.vx !== 0) this.dir = Math.sign(this.vx);
    if (this.y > this.level.room.h * TILE + 40) this.removed = true;
  }
  draw(ctx, cam) {
    const img = Sprites.moss.walk[(this.animT >> 3) % 2];
    drawSprite(ctx, img, this.cx, this.bottom, this.dir < 0, cam);
    if (!this.flee && this.animT % 40 < 20) {
      drawText(ctx, '!', this.cx - 2 - cam.x, this.y - 12 - cam.y, '#ffffff', 1, '#00000060');
    }
  }
  touchPlayer(p) {
    if (this.flee) return;
    if (p.riding) return;
    this.removed = true;
    p.mountMoss();
  }
}

// ---------------- seed projectile (Blossom Pip) ----------------
class SeedProj extends Entity {
  constructor(level, x, y, dir) {
    super(level, x, y, 7, 7);
    this.vx = dir * PHYS.seedSpeed;
    this.vy = -1;
    this.life = 210;
    this.isSeed = true;
  }
  update() {
    this.animT++;
    this.vy = Math.min(this.vy + 0.32, 4.5);
    const res = tileMove(this.level, this, { oneWay: false });
    if (res.onGround) this.vy = -PHYS.seedBounce;
    if (res.hitWall) { this.pop(); return; }
    if (--this.life <= 0 || this.y > this.level.room.h * TILE + 20) this.removed = true;
    // hit enemies
    for (const e of this.level.entities) {
      if (e.isEnemy && !e.dying && e.active && aabb(this, e)) {
        if (e.hitByProjectile) {
          e.hitByProjectile(this);
          this.pop();
          return;
        }
      }
    }
    if (this.level.boss && !this.level.boss.removed && aabb(this, this.level.boss) &&
        this.level.boss.hitBySeed) {
      this.level.boss.hitBySeed(this);
      this.pop();
    }
  }
  pop() {
    this.removed = true;
    Particles.burst(this.cx, this.y + 3, 5, { color: '#ffd23e', life: 12, speed: 1 });
  }
  draw(ctx, cam) {
    drawSprite(ctx, Sprites.seed, this.cx, this.bottom, false, cam);
  }
}

// ---------------- checkpoint flag ----------------
class CheckpointFlag extends Entity {
  constructor(level, x, y) {
    super(level, x, y, 14, 32);
    this.on = false;
  }
  update() { this.animT++; }
  draw(ctx, cam) {
    const set = this.on ? Sprites.checkpoint.on : Sprites.checkpoint.off;
    drawSprite(ctx, set[(this.animT >> 4) % 2], this.cx, this.bottom, false, cam);
  }
  touchPlayer(p) {
    if (this.on) return;
    this.on = true;
    this.level.checkpointHit(this);
  }
}
