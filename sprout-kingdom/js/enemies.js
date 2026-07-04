// Enemy roster. All enemies extend Enemy which handles stomping, projectiles,
// shells, tongue-eating and death animation.

class Enemy extends Entity {
  constructor(level, x, y, w, h) {
    super(level, x, y, w, h);
    this.dying = false;
    this.spiky = false;
    this.stompable = true;
    this.eatable = true;
    this.ghost = false;
    this.score = 100;
    this.onGround = false;
  }
  get isEnemy() { return true; }

  update() {
    this.animT++;
    if (this.dying) {
      this.y += this.vy; this.vy += 0.35;
      this.x += this.vx;
      if (this.y > this.level.room.h * TILE + 60) this.removed = true;
      return true; // handled
    }
    return false;
  }

  // default walker physics; turnAtEdge for shelled types
  walk(speed, turnAtEdge = false) {
    this.vx = this.dir * speed;
    this.vy = Math.min(this.vy + 0.3, 4.2);
    const res = tileMove(this.level, this, { oneWay: true });
    this.onGround = res.onGround;
    if (res.hitWall) this.dir = -this.dir;
    if (res.onMover) this.x += res.onMover.dx;
    if (turnAtEdge && this.onGround) {
      const aheadX = this.dir > 0 ? this.x + this.w + 2 : this.x - 2;
      const tx = Math.floor(aheadX / TILE), ty = Math.floor((this.y + this.h + 2) / TILE);
      const id = this.level.tileAt(tx, ty);
      if (!TILE_SOLID.has(id) && id !== T.PLATFORM && id !== T.CRUMBLE) this.dir = -this.dir;
    }
    if (this.y > this.level.room.h * TILE + 40) this.removed = true;
  }

  stomped(p) {
    this.dieSquash();
    p.chainScore(this.cx, this.y);
  }
  dieSquash() {
    this.dying = true; this.vx = 0; this.vy = 0;
    this.removed = false;
    this.squashT = 20;
    AudioSys.stomp();
    Particles.burst(this.cx, this.y + this.h / 2, 6, { color: '#e8dcc8', life: 14, speed: 1 });
    setTimeout(() => {}, 0);
  }
  dieFlying(dir, scorer = true) {
    this.dying = true;
    this.flying = true;
    this.vx = dir * 1.6; this.vy = -3.4;
    if (scorer) {
      Run.score += this.score;
      Particles.score(this.cx, this.y, this.score);
    }
  }
  hitByProjectile(src) {
    if (this.ghost) return;
    this.dieFlying(Math.sign(src.vx) || 1);
    AudioSys.kick();
  }
  hitByShell(shell) {
    if (this.ghost) return;
    shell.chain = (shell.chain || 0) + 1;
    const chain = SCORE.stompChain;
    const idx = Math.min(shell.chain - 1 + 1, chain.length - 1);
    Run.score += chain[idx];
    Particles.score(this.cx, this.y, chain[idx]);
    this.dieFlying(Math.sign(shell.vx) || 1, false);
    AudioSys.kick();
  }
  eaten() {
    this.removed = true;
    Run.score += 200;
    Particles.score(this.cx, this.y, 200);
    AudioSys.gulp();
  }

  touchPlayer(p) {
    if (this.dying || p.dead || p.invuln > 0) return;
    // carried shell smashes enemies on contact — handled by shell itself
    const stomp = p.vy > 0 && (p.y + p.h) - this.y < 10 + p.vy;
    if (stomp && this.stompable) {
      if (this.spiky && !p.spinning) { p.damage(); return; }
      if (this.spiky && p.spinning) {
        p.bounce(true);
        AudioSys.spin();
        Particles.burst(this.cx, this.y, 4, { color: '#f2e6c8', life: 10 });
        return; // safe bounce, spikelet survives
      }
      this.stomped(p);
      p.bounce();
      return;
    }
    if (p.spinning && stomp && !this.stompable) { p.damage(); return; }
    p.damage();
  }

  drawDying(ctx, cam, img) {
    if (this.flying) {
      // upside down
      const dx = Math.round(this.cx - cam.x), dy = Math.round(this.bottom - cam.y);
      ctx.save();
      ctx.translate(dx, dy - img.height / 2);
      ctx.scale(1, -1);
      ctx.drawImage(img, -img.width >> 1, -img.height >> 1);
      ctx.restore();
      return true;
    }
    if (this.squashT !== undefined) {
      this.squashT--;
      if (this.squashT <= 0) { this.removed = true; return true; }
      drawSprite(ctx, img, this.cx, this.bottom, this.dir < 0, cam, 0.4, 1.3);
      return true;
    }
    return false;
  }
}

// ---------------- Bumble: waddling grub ----------------
class Bumble extends Enemy {
  constructor(level, x, y) { super(level, x, y, 14, 12); this.score = 100; }
  update() {
    if (super.update()) return;
    this.walk(0.4, false);
  }
  draw(ctx, cam) {
    const img = Sprites.bumble.walk[(this.animT >> 4) % 2];
    if (this.dying && this.drawDying(ctx, cam, img)) return;
    drawSprite(ctx, img, this.cx, this.bottom, this.dir > 0, cam);
  }
}

// ---------------- Snapcap: shelled beetle -> throwable shell ----------------
class Snapcap extends Enemy {
  constructor(level, x, y) {
    super(level, x, y, 14, 14);
    this.state = 'walk'; // walk | idle (shell) | sliding
    this.score = 200;
    this.wakeT = 0;
    this.noHurtT = 0;
    this.carried = false;
    this.isShellType = true;
  }
  update() {
    if (super.update()) return;
    if (this.noHurtT > 0) this.noHurtT--;
    if (this.carried) return; // player positions us

    if (this.state === 'walk') {
      this.walk(0.55, true);
    } else if (this.state === 'idle') {
      this.vx *= 0.85;
      this.vy = Math.min(this.vy + 0.3, 4.2);
      const res = tileMove(this.level, this, { oneWay: true });
      if (res.onMover) this.x += res.onMover.dx;
      this.wakeT++;
      if (this.wakeT > 600) { this.state = 'walk'; this.h = 14; this.wakeT = 0; }
      if (this.y > this.level.room.h * TILE + 40) this.removed = true;
    } else if (this.state === 'sliding') {
      this.vy = Math.min(this.vy + 0.3, 4.4);
      const res = tileMove(this.level, this, { oneWay: true });
      if (res.hitWall) {
        // break bricks on impact
        const tx = this.vx >= 0 ? Math.floor((this.x + this.w + 2) / TILE) : Math.floor((this.x - 2) / TILE);
        const ty = Math.floor((this.y + this.h / 2) / TILE);
        // vx got zeroed by tileMove; recover direction from slideDir
        if (this.level.tileAt(tx, ty) === T.BRICK) this.level.breakBrick(tx, ty);
        this.slideDir = -this.slideDir;
        AudioSys.bump();
      }
      this.vx = this.slideDir * PHYS.shellSpeed;
      if (res.onMover) this.x += res.onMover.dx;
      if (this.y > this.level.room.h * TILE + 40) this.removed = true;
      // smash other enemies
      for (const e of this.level.entities) {
        if (e !== this && e.isEnemy && !e.dying && !e.ghost && e.active && aabb(this, e)) {
          e.hitByShell(this);
        }
      }
      // hit boss
      const b = this.level.boss;
      if (b && !b.removed && b.hitByShell && aabb(this, b)) b.hitByShell(this);
      if (Game.frame % 5 === 0) Particles.spawn(this.cx, this.bottom, { vx: 0, vy: -0.3, color: '#e8dcc8', life: 10 });
    }
  }
  stomped(p) {
    if (this.state === 'walk') {
      this.state = 'idle'; this.wakeT = 0;
      AudioSys.stomp();
      p.chainScore(this.cx, this.y);
    } else if (this.state === 'sliding') {
      this.state = 'idle'; this.wakeT = 0; this.vx = 0;
      AudioSys.stomp();
    } else {
      // idle: stomp kicks it forward under us — treat as kick away from player
      this.kick(p.cx < this.cx ? 1 : -1);
    }
  }
  kick(dir) {
    this.state = 'sliding';
    this.slideDir = dir;
    this.vx = dir * PHYS.shellSpeed;
    this.chain = 0;
    this.noHurtT = 22;
    AudioSys.kick();
  }
  touchPlayer(p) {
    if (this.dying || p.dead || this.carried) return;
    if (this.state === 'idle') {
      if (this.noHurtT > 0) return;
      if (Input.held.run && !p.carrying && !p.riding) {
        this.carried = true;
        p.carrying = this;
        return;
      }
      const stomp = p.vy > 0 && (p.y + p.h) - this.y < 10 + p.vy;
      this.kick(p.cx < this.cx ? 1 : -1);
      if (stomp) p.bounce(); // landing on a shell kicks it and bounces you clear
      p.stompChain = 0;
      return;
    }
    if (this.state === 'sliding' && this.noHurtT > 0) return;
    if (p.invuln > 0) return;
    super.touchPlayer(p);
  }
  hitByShell(shell) {
    if (this.carried) return;
    super.hitByShell(shell);
  }
  draw(ctx, cam) {
    let img;
    if (this.state === 'walk') img = Sprites.snapcap.walk[(this.animT >> 4) % 2];
    else if (this.state === 'sliding') img = Sprites.snapcap.shellSpin;
    else img = Sprites.snapcap.shell;
    if (this.dying && this.drawDying(ctx, cam, img)) return;
    const shake = this.state === 'idle' && this.wakeT > 500 ? Math.sin(this.animT) * 1 : 0;
    drawSprite(ctx, img, this.cx + shake, this.bottom, this.dir > 0, cam);
  }
}

// ---------------- Spikelet: spiky, spin-hop only ----------------
class Spikelet extends Enemy {
  constructor(level, x, y) {
    super(level, x, y, 14, 14);
    this.spiky = true;
    this.score = 200;
  }
  update() {
    if (super.update()) return;
    this.walk(0.5, true);
  }
  draw(ctx, cam) {
    const img = Sprites.spikelet.walk[(this.animT >> 3) % 2];
    if (this.dying && this.drawDying(ctx, cam, img)) return;
    drawSprite(ctx, img, this.cx, this.bottom, this.dir > 0, cam);
  }
}

// ---------------- Puffhawk: diving bird ----------------
class Puffhawk extends Enemy {
  constructor(level, x, y) {
    super(level, x, y, 18, 14);
    this.anchorX = this.x; this.anchorY = this.y;
    this.state = 'hover'; // hover | dive | rise
    this.score = 200;
  }
  update() {
    if (super.update()) return;
    const p = this.level.player;
    if (this.state === 'hover') {
      this.x = this.anchorX + Math.sin(this.animT / 40) * 18;
      this.y = this.anchorY + Math.sin(this.animT / 25) * 4;
      this.dir = p && p.cx > this.cx ? 1 : -1;
      if (p && !p.dead && Math.abs(p.cx - this.cx) < 90 && p.y > this.y + 20 && this.animT % 90 > 60) {
        this.state = 'dive';
        this.vx = Math.sign(p.cx - this.cx) * 1.4;
        this.vy = 2.6;
        this.diveTargetY = p.y;
      }
    } else if (this.state === 'dive') {
      this.x += this.vx; this.y += this.vy;
      if (this.y >= this.diveTargetY + 10 || this.y > this.anchorY + 150) this.state = 'rise';
    } else {
      this.y -= 1.2;
      this.x += this.vx * 0.6;
      if (this.y <= this.anchorY) { this.y = this.anchorY; this.anchorX = this.x; this.state = 'hover'; }
    }
    if (this.y > this.level.room.h * TILE + 40) this.removed = true;
  }
  draw(ctx, cam) {
    const img = this.state === 'dive' ? Sprites.puffhawk.dive :
      Sprites.puffhawk.fly[(this.animT >> 3) % 2];
    if (this.dying && this.drawDying(ctx, cam, img)) return;
    drawSprite(ctx, img, this.cx, this.bottom, this.dir < 0, cam);
  }
}

// ---------------- Thorn Lobber: arcing projectiles ----------------
class Lobber extends Enemy {
  constructor(level, x, y) {
    super(level, x, y, 16, 22);
    this.score = 500;
    this.cool = 80 + Math.floor(Math.random() * 60);
  }
  update() {
    if (super.update()) return;
    this.vy = Math.min(this.vy + 0.3, 4.2);
    tileMove(this.level, this, { oneWay: true });
    const p = this.level.player;
    this.dir = p && p.cx > this.cx ? 1 : -1;
    if (--this.cool <= 0 && p && !p.dead && Math.abs(p.cx - this.cx) < 240) {
      this.cool = 130 + Math.floor(Math.random() * 50);
      this.windup = 20;
    }
    if (this.windup !== undefined && --this.windup === 0) {
      const dx = p ? p.cx - this.cx : this.dir * 80;
      const t = 55;
      const vx = clamp(dx / t, -2.2, 2.2);
      this.level.addEntity(new ThornBall(this.level, this.cx, this.y, vx, -4.4));
      AudioSys.throwIt();
      this.windup = undefined;
    }
  }
  draw(ctx, cam) {
    const img = Sprites.lobber.idle[this.windup !== undefined ? 1 : (this.animT >> 5) % 2];
    if (this.dying && this.drawDying(ctx, cam, img)) return;
    drawSprite(ctx, img, this.cx, this.bottom, this.dir < 0, cam);
  }
}

class ThornBall extends Enemy {
  constructor(level, x, y, vx, vy) {
    super(level, x, y, 10, 10);
    this.vx = vx; this.vy = vy;
    this.stompable = false;
    this.spiky = true;
    this.eatable = true;
    this.score = 100;
    this.bounces = 0;
  }
  update() {
    if (super.update()) return;
    this.vy = Math.min(this.vy + 0.16, 4);
    this.x += this.vx; this.y += this.vy;
    // pop on landing
    const ty = Math.floor((this.y + this.h) / TILE), tx = Math.floor(this.cx / TILE);
    if (this.vy > 0 && TILE_SOLID.has(this.level.tileAt(tx, ty))) {
      this.removed = true;
      Particles.burst(this.cx, this.y + 5, 5, { color: '#7a4a86', life: 14 });
    }
    if (this.y > this.level.room.h * TILE + 40) this.removed = true;
  }
  touchPlayer(p) {
    if (p.invuln > 0) return;
    p.damage();
  }
  draw(ctx, cam) {
    const img = Sprites.thornBall;
    if (this.dying && this.drawDying(ctx, cam, img)) return;
    const dx = Math.round(this.cx - cam.x), dy = Math.round(this.y + 5 - cam.y);
    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate((this.animT / 8) % (Math.PI * 2));
    ctx.drawImage(img, -6, -6);
    ctx.restore();
  }
}

// ---------------- Wisp: advances only when you face away ----------------
class Wisp extends Enemy {
  constructor(level, x, y) {
    super(level, x, y, 14, 16);
    this.stompable = false;
    this.eatable = false;
    this.ghost = true;
    this.shy = false;
  }
  update() {
    if (super.update()) return;
    const p = this.level.player;
    if (!p || p.dead) return;
    const facingMe = (p.dir > 0) === (this.cx > p.cx);
    this.shy = facingMe;
    if (!facingMe) {
      const dx = p.cx - this.cx, dy = (p.y + p.h / 2) - (this.y + this.h / 2);
      const d = Math.hypot(dx, dy) || 1;
      this.x += (dx / d) * 0.55;
      this.y += (dy / d) * 0.5;
    }
    this.dir = this.cx > p.cx ? -1 : 1;
  }
  touchPlayer(p) {
    if (p.invuln > 0) return;
    p.damage();
  }
  draw(ctx, cam) {
    const img = this.shy ? Sprites.wisp.shy : Sprites.wisp.chase;
    const bob = Math.sin(this.animT / 18) * 2;
    ctx.globalAlpha = this.shy ? 0.55 : 0.95;
    drawSprite(ctx, img, this.cx, this.bottom + bob, this.dir < 0, cam);
    ctx.globalAlpha = 1;
  }
}

// ---------------- Pod: fires seeking burrs ----------------
class Pod extends Enemy {
  constructor(level, x, y) {
    super(level, x, y, 16, 18);
    this.stompable = false;
    this.eatable = false;
    this.ghost = true; // shells/seeds pass through; it is scenery-like
    this.cool = 100;
  }
  update() {
    if (super.update()) return;
    const p = this.level.player;
    if (--this.cool <= 0 && p && !p.dead) {
      const d = Math.abs(p.cx - this.cx);
      if (d > 50 && d < 360) {
        this.cool = 200;
        this.level.addEntity(new Burr(this.level, this.cx, this.y - 8));
        AudioSys.throwIt();
        Particles.burst(this.cx, this.y - 14, 4, { color: '#8a8090', life: 10 });
      } else this.cool = 40;
    }
  }
  touchPlayer(p) { /* harmless to touch */ }
  draw(ctx, cam) {
    drawSprite(ctx, Sprites.pod.idle, this.cx, this.bottom, false, cam);
  }
}

class Burr extends Enemy {
  constructor(level, x, y) {
    super(level, x, y, 10, 10);
    this.vy = -2;
    this.life = 420;
    this.score = 100;
  }
  update() {
    if (super.update()) return;
    const p = this.level.player;
    if (p && !p.dead) {
      const dx = p.cx - this.cx, dy = (p.y + p.h / 2) - (this.y + this.h / 2);
      const d = Math.hypot(dx, dy) || 1;
      this.vx += (dx / d) * 0.05;
      this.vy += (dy / d) * 0.05;
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > 1.25) { this.vx *= 1.25 / sp; this.vy *= 1.25 / sp; }
    }
    this.x += this.vx; this.y += this.vy;
    if (--this.life <= 0) {
      this.removed = true;
      Particles.burst(this.cx, this.y + 5, 4, { color: '#8a6a3a', life: 12 });
    }
  }
  draw(ctx, cam) {
    const img = (this.animT >> 3) % 2 ? Sprites.pod.burr : Sprites.pod.burr2;
    if (this.dying && this.drawDying(ctx, cam, img)) return;
    drawSprite(ctx, img, this.cx, this.bottom, false, cam);
  }
}

const ENEMY_CLASSES = {
  bumble: Bumble, snapcap: Snapcap, spikelet: Spikelet,
  puffhawk: Puffhawk, lobber: Lobber, wisp: Wisp, pod: Pod,
};
