// World bosses. Each is a multi-phase arena fight with telegraphed attacks,
// a health bar (drawn by the HUD) and a victory sequence.

class Boss {
  constructor(level, x, y, w, h, hp) {
    this.level = level;
    this.w = w; this.h = h;
    this.x = x - w / 2; this.y = y - h;
    this.vx = 0; this.vy = 0;
    this.hp = hp; this.maxHp = hp;
    this.invulnT = 0;
    this.dir = -1;
    this.animT = 0;
    this.removed = false;
    this.introT = 90; // roar intro
    this.dying = 0;
  }
  get cx() { return this.x + this.w / 2; }
  get bottom() { return this.y + this.h; }
  get phase() { return this.hp > this.maxHp * 2 / 3 ? 0 : this.hp > this.maxHp / 3 ? 1 : 2; }

  hit(n = 1) {
    if (this.invulnT > 0 || this.dying) return false;
    this.hp -= n;
    this.invulnT = 70;
    AudioSys.bossHit();
    this.level.cam.shake(14, 4);
    Particles.burst(this.cx, this.y + this.h / 2, 12, { color: '#ffd23e', life: 22, speed: 2 });
    Run.score += SCORE.bossHit;
    Particles.score(this.cx, this.y, SCORE.bossHit);
    if (this.hp <= 0) {
      this.dying = 160;
      AudioSys.roar();
      Music.stop();
    } else {
      AudioSys.roar();
      this.onHit && this.onHit();
    }
    return true;
  }

  updateDying() {
    this.dying--;
    if (this.dying % 12 === 0) {
      Particles.burst(this.x + Math.random() * this.w, this.y + Math.random() * this.h, 8,
        { color: ['#ffd23e', '#ff8a3a', '#ffffff'][Math.floor(Math.random() * 3)], life: 24, speed: 2 });
      AudioSys.stomp();
      this.level.cam.shake(8, 3);
    }
    if (this.dying <= 0) {
      this.removed = true;
      this.level.bossDefeated();
    }
  }

  baseUpdate() {
    this.animT++;
    if (this.invulnT > 0) this.invulnT--;
    if (this.dying) { this.updateDying(); return true; }
    if (this.introT > 0) {
      this.introT--;
      if (this.introT === 60) AudioSys.roar();
      return true;
    }
    return false;
  }

  // default: spiky contact
  touchPlayer(p) { p.damage(); }
  flashing() { return this.invulnT > 0 && (this.invulnT % 6) >= 3; }
}

// ================= King Snapjaw (World 1) =================
// Paces toward you (stomp him!), retreats into a spinning shell dash,
// re-emerges with a slam. Faster each phase; slam shockwaves from phase 2.
class SnapjawBoss extends Boss {
  constructor(level, x, y) {
    super(level, x, y, 44, 38, 3);
    this.state = 'walk';
    this.stateT = 0;
  }
  update() {
    if (this.baseUpdate()) return;
    this.stateT++;
    const p = this.level.player;
    const speed = [0.6, 1.0, 1.45][this.phase];

    if (this.state === 'walk') {
      this.dir = p.cx > this.cx ? 1 : -1;
      this.vx = this.dir * speed;
      this.vy = Math.min(this.vy + 0.3, 4.4);
      tileMove(this.level, this, { oneWay: false });
      if (this.stateT > 260) this.setState('shell');
    } else if (this.state === 'shell') {
      this.h = 26;
      this.vy = Math.min(this.vy + 0.3, 4.4);
      const res = tileMove(this.level, this, { oneWay: false });
      if (res.hitWall) { this.shellDir = -this.shellDir; AudioSys.bump(); this.level.cam.shake(6, 2); }
      this.vx = this.shellDir * (2.4 + this.phase * 0.5);
      if (this.stateT > 300) this.setState('leap');
    } else if (this.state === 'leap') {
      this.h = 38;
      if (this.stateT === 1) { this.vy = -7; this.vx = Math.sign(p.cx - this.cx) * 1.4; }
      this.vy = Math.min(this.vy + 0.3, 5.5);
      const res = tileMove(this.level, this, { oneWay: false });
      if (this.stateT > 5 && res.onGround) {
        AudioSys.shockwave();
        this.level.cam.shake(16, 4);
        Particles.burst(this.cx, this.bottom, 10, { color: '#c8b088', life: 18, speed: 2 });
        if (this.phase >= 1) {
          this.level.addEntity(new Shockwave(this.level, this.cx - 20, this.bottom, -2));
          this.level.addEntity(new Shockwave(this.level, this.cx + 20, this.bottom, 2));
        }
        this.setState('walk');
      }
    }
  }
  setState(s) {
    this.state = s; this.stateT = 0;
    if (s === 'shell') { this.shellDir = this.dir; }
  }
  touchPlayer(p) {
    const stomp = p.vy > 0 && (p.y + p.h) - this.y < 12 + p.vy;
    if (stomp && this.state === 'walk') {
      p.bounce();
      if (this.hit()) this.setState('shell');
      return;
    }
    if (stomp && this.state === 'shell') { p.bounce(); return; }
    p.damage();
  }
  draw(ctx, cam) {
    if (this.flashing()) return;
    let img;
    if (this.state === 'shell') img = Sprites.boss.snapjaw.shell;
    else if (this.dying) img = Sprites.boss.snapjaw.stun;
    else img = Sprites.boss.snapjaw.walk[(this.animT >> 4) % 2];
    drawSprite(ctx, img, this.cx, this.bottom, this.dir < 0, cam);
  }
}

class Shockwave extends Enemy {
  constructor(level, x, y, vx) {
    super(level, x, y + 8, 12, 10);
    this.vx = vx;
    this.stompable = false; this.eatable = false; this.ghost = true;
    this.life = 200;
  }
  update() {
    if (super.update()) return;
    this.x += this.vx;
    if (Game.frame % 3 === 0) Particles.spawn(this.cx, this.y + 8, { vx: 0, vy: -1.2, color: '#f2d8a8', life: 12 });
    const tx = Math.floor((this.vx > 0 ? this.x + this.w + 1 : this.x - 1) / TILE);
    const ty = Math.floor((this.y + 4) / TILE);
    if (TILE_SOLID.has(this.level.tileAt(tx, ty)) || --this.life <= 0) this.removed = true;
  }
  touchPlayer(p) { if (p.invuln <= 0) p.damage(); }
  draw(ctx, cam) {
    ctx.fillStyle = '#f2d8a8';
    const h = 6 + Math.sin(this.animT / 2) * 3;
    ctx.fillRect(Math.round(this.x - cam.x), Math.round(this.y + 10 - h - cam.y), this.w, h);
  }
}

// ================= Grubmaw (World 2) =================
// Burrows under the arena, erupts beneath you — stomp its head while it's out.
// Later phases: faster, drops cave-rocks while surfaced.
class GrubmawBoss extends Boss {
  constructor(level, x, y) {
    super(level, x, y, 40, 48, 3);
    this.state = 'burrow';
    this.stateT = 0;
    this.floorY = this.bottom;
    this.targetX = this.x;
  }
  update() {
    if (this.baseUpdate()) return;
    this.stateT++;
    const p = this.level.player;
    const waitT = [110, 85, 60][this.phase];

    if (this.state === 'burrow') {
      // invisible; track player
      this.targetX = clamp(p.cx - this.w / 2, 3 * TILE, (this.level.room.w - 3) * TILE - this.w);
      if (this.stateT > waitT - 40) {
        // rumble telegraph at eruption point
        if (Game.frame % 3 === 0) {
          Particles.spawn(this.targetX + this.w / 2 + (Math.random() * 40 - 20), this.floorY,
            { vx: 0, vy: -1.5 - Math.random(), color: '#8a6428', life: 16 });
        }
        if (this.stateT === waitT - 30) AudioSys.burrow();
      }
      if (this.stateT >= waitT) {
        this.x = this.targetX;
        this.y = this.floorY; // fully below
        this.setState('rise');
        AudioSys.roar();
        this.level.cam.shake(10, 3);
      }
    } else if (this.state === 'rise') {
      this.y = Math.max(this.floorY - this.h, this.y - 3.2);
      if (this.y <= this.floorY - this.h) this.setState('out');
    } else if (this.state === 'out') {
      const outT = [130, 120, 110][this.phase];
      // phase 2+: shake loose falling rocks
      if (this.phase >= 1 && this.stateT % 55 === 20) {
        const rx = clamp(p.cx, 3 * TILE, (this.level.room.w - 3) * TILE);
        this.level.addEntity(new CaveRock(this.level, rx, 8));
      }
      if (this.stateT > outT) this.setState('sink');
    } else if (this.state === 'sink') {
      this.y += 2.6;
      if (this.y >= this.floorY) { this.y = this.floorY; this.setState('burrow'); }
    }
  }
  setState(s) { this.state = s; this.stateT = 0; }
  touchPlayer(p) {
    if (this.state === 'burrow') return;
    const stomp = p.vy > 0 && (p.y + p.h) - this.y < 14 + p.vy;
    if (stomp && (this.state === 'out' || this.state === 'rise')) {
      p.bounce();
      if (this.hit()) this.setState('sink');
      return;
    }
    p.damage();
  }
  draw(ctx, cam) {
    if (this.state === 'burrow' || this.flashing()) return;
    ctx.save();
    // clip below arena floor so it visually erupts from the ground
    ctx.beginPath();
    ctx.rect(0, 0, VIEW_W, Math.round(this.floorY - cam.y));
    ctx.clip();
    const img = this.state === 'out' && (this.stateT >> 4) % 2 ?
      Sprites.boss.grubmaw.up[1] : Sprites.boss.grubmaw.up[0];
    drawSprite(ctx, this.dying ? Sprites.boss.grubmaw.stun : img, this.cx, this.bottom, false, cam);
    ctx.restore();
  }
}

class CaveRock extends Enemy {
  constructor(level, x, y) {
    super(level, x, y, 12, 12);
    this.stompable = false; this.eatable = false; this.ghost = true;
    this.warnT = 34;
  }
  update() {
    if (super.update()) return;
    if (this.warnT > 0) {
      this.warnT--;
      return;
    }
    this.vy = Math.min(this.vy + 0.25, 4.5);
    this.y += this.vy;
    const ty = Math.floor((this.y + this.h) / TILE), tx = Math.floor(this.cx / TILE);
    if (TILE_SOLID.has(this.level.tileAt(tx, ty))) {
      this.removed = true;
      Particles.burst(this.cx, this.y + 8, 6, { color: '#7c88a0', life: 14 });
      AudioSys.crumbleSfx();
    }
  }
  touchPlayer(p) { if (this.warnT <= 0 && p.invuln <= 0) p.damage(); }
  draw(ctx, cam) {
    if (this.warnT > 0) {
      if ((this.warnT >> 2) % 2) {
        drawText(ctx, '!', this.cx - 2 - cam.x, this.y - cam.y, '#ff5f45', 1);
      }
      return;
    }
    ctx.fillStyle = '#7c88a0';
    ctx.fillRect(Math.round(this.x - cam.x), Math.round(this.y - cam.y), 12, 12);
    ctx.fillStyle = '#a8b4c8';
    ctx.fillRect(Math.round(this.x - cam.x) + 2, Math.round(this.y - cam.y) + 2, 4, 3);
  }
}

// ================= Gale Talon (World 3) =================
// Storm hawk over a gappy arena. Hovering under it isn't safe: it flicks
// aimed feathers while cruising. Telegraphed dives end in a stompable stall;
// from phase 2 it alternates in a low talon sweep across the arena (jump it —
// it ends up winded at the wall, another stomp window). A spin-hop on its
// back knocks it clean out of the sky.
class GaleBoss extends Boss {
  constructor(level, x, y) {
    super(level, x, y, 52, 28, 3);
    this.state = 'fly';
    this.stateT = 0;
    this.flyY = 60;
    this.y = this.flyY;
    this.windDir = 1;
    this.nextAttack = 'dive';
    this.floorY = 15 * TILE;
  }
  update() {
    if (this.baseUpdate()) return;
    this.stateT++;
    const p = this.level.player;

    // wind gusts phase 2+
    this.level.windAx = 0;
    if (this.phase >= 1 && this.state === 'fly' && (this.stateT % 200) > 120) {
      this.level.windAx = 0.03 * this.windDir;
      if (Game.frame % 5 === 0) {
        Particles.spawn(this.level.cam.x + (this.windDir > 0 ? 0 : VIEW_W), this.level.cam.y + 40 + Math.random() * 200,
          { vx: this.windDir * 3, vy: 0, g: 0, color: '#e8eef8', life: 30 });
      }
    }

    if (this.state === 'fly') {
      const tx = p.cx - this.w / 2 + Math.sin(this.animT / 30) * 60;
      this.x += clamp(tx - this.x, -1.6, 1.6);
      this.y = this.flyY + Math.sin(this.animT / 22) * 8;
      this.dir = p.cx > this.cx ? 1 : -1;
      // aimed feather flicks — waiting it out below is punished
      const volleyT = [110, 85, 65][this.phase];
      if (this.stateT % volleyT === volleyT - 1) {
        const n = this.phase >= 2 ? 3 : this.phase >= 1 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const spread = (i - (n - 1) / 2) * 0.4;
          const dx = p.cx - this.cx, dy = Math.max(20, p.y - this.y);
          const m = Math.hypot(dx, dy) || 1;
          this.level.addEntity(new Feather(this.level, this.cx, this.y + 16,
            (dx / m) * 2.1 + spread, (dy / m) * 2.1));
        }
        AudioSys.throwIt();
      }
      const waitT = [170, 150, 120][this.phase];
      if (this.stateT > waitT) {
        this.windDir = -this.windDir;
        if (this.phase >= 1 && this.nextAttack === 'sweep') {
          this.nextAttack = 'dive';
          this.setState('sweepTele');
        } else {
          this.nextAttack = 'sweep';
          this.setState('telegraph');
        }
      }
    } else if (this.state === 'telegraph') {
      // flash + roar before dive
      if (this.stateT === 1) AudioSys.roar();
      if (this.stateT > 40) {
        this.setState('dive');
        this.diveVx = clamp((p.cx - this.cx) / 40, -3, 3);
      }
    } else if (this.state === 'dive') {
      this.x += this.diveVx;
      this.y += 3.4;
      // land on floor (or stall at floor level over a pit)
      const ty = Math.floor((this.y + this.h + 2) / TILE);
      const tx = Math.floor(this.cx / TILE);
      if (this.y + this.h >= this.floorY || TILE_SOLID.has(this.level.tileAt(tx, ty))) {
        this.y = this.floorY - this.h;
        this.setState('stall');
        this.level.cam.shake(8, 3);
        AudioSys.stomp();
      }
    } else if (this.state === 'sweepTele') {
      // swoop to the nearest wall at talon height, screech, then rake across
      if (this.stateT === 1) {
        AudioSys.screech();
        this.sweepDir = this.cx < this.level.room.w * TILE / 2 ? 1 : -1;
      }
      const edgeX = this.sweepDir > 0 ? 2 * TILE : this.level.room.w * TILE - 2 * TILE - this.w;
      this.x += clamp(edgeX - this.x, -3.5, 3.5);
      const swY = this.floorY - this.h - 6;
      this.y += clamp(swY - this.y, -3.5, 3.5);
      this.dir = this.sweepDir;
      if (this.stateT > 46) this.setState('sweep');
    } else if (this.state === 'sweep') {
      this.dir = this.sweepDir;
      this.x += this.sweepDir * (3.1 + this.phase * 0.35);
      if (Game.frame % 3 === 0) {
        Particles.spawn(this.cx - this.sweepDir * 20, this.bottom - 4,
          { vx: -this.sweepDir, vy: -0.3, g: 0, color: '#e8eef8', life: 12 });
      }
      const stopX = this.sweepDir > 0 ? this.level.room.w * TILE - 2 * TILE - this.w : 2 * TILE;
      if ((this.sweepDir > 0 && this.x >= stopX) || (this.sweepDir < 0 && this.x <= stopX)) {
        this.x = stopX;
        this.setState('winded');
        this.level.cam.shake(6, 2);
        AudioSys.stomp();
      }
    } else if (this.state === 'stall') {
      const stallT = [90, 75, 60][this.phase];
      if (this.stateT > stallT) {
        this.setState('rise');
        // feather fan on rise (phase 2+)
        if (this.phase >= 1) {
          for (const a of [-0.5, 0, 0.5]) {
            this.level.addEntity(new Feather(this.level, this.cx, this.y + 10,
              Math.sin(a) * 2 - (this.dir * -1.2), -2 - Math.cos(a)));
          }
          AudioSys.throwIt();
        }
      }
    } else if (this.state === 'winded') {
      if (this.stateT > 55) this.setState('rise');
    } else if (this.state === 'knocked') {
      this.vy = Math.min((this.vy || 0) + 0.4, 6);
      this.y += this.vy;
      if (this.y + this.h >= this.floorY) {
        this.y = this.floorY - this.h;
        this.vy = 0;
        this.level.cam.shake(10, 3);
        AudioSys.stomp();
        this.setState('stall');
      }
    } else if (this.state === 'rise') {
      this.y -= 2.4;
      if (this.y <= this.flyY) { this.y = this.flyY; this.setState('fly'); }
    }
  }
  setState(s) { this.state = s; this.stateT = 0; }
  touchPlayer(p) {
    const stomp = p.vy > 0 && (p.y + p.h) - this.y < 12 + p.vy;
    if (stomp && (this.state === 'stall' || this.state === 'winded')) {
      p.bounce();
      if (this.hit()) this.setState('rise');
      return;
    }
    if (stomp && p.spinning &&
        ['fly', 'telegraph', 'rise', 'sweepTele', 'sweep'].includes(this.state)) {
      // spin-hop on its back knocks it out of the sky
      p.bounce();
      this.vy = 0;
      this.setState('knocked');
      AudioSys.screech();
      Particles.burst(this.cx, this.y + this.h / 2, 8, { color: '#e8eef8', life: 18, speed: 1.5 });
      return;
    }
    if (stomp) { p.bounce(); return; } // bounce off its back safely mid-air
    p.damage();
  }
  draw(ctx, cam) {
    if (this.flashing()) return;
    let img;
    if (this.state === 'stall' || this.state === 'winded' || this.state === 'knocked') {
      img = Sprites.boss.gale.stall;
    } else {
      img = Sprites.boss.gale.fly[(this.animT >> (this.state === 'dive' || this.state === 'sweep' ? 2 : 4)) % 2];
    }
    if ((this.state === 'telegraph' || this.state === 'sweepTele') && (this.stateT >> 2) % 2) {
      ctx.globalAlpha = 0.6;
    }
    drawSprite(ctx, img, this.cx, this.bottom, this.dir < 0, cam);
    ctx.globalAlpha = 1;
    // dive shadow marker
    if (this.state === 'telegraph') {
      const gx = Math.round(this.cx - cam.x);
      ctx.fillStyle = '#00000040';
      ctx.fillRect(gx - 14, this.floorY - 4 - Math.round(cam.y), 28, 4);
    }
    // sweep rake marker
    if (this.state === 'sweepTele') {
      ctx.fillStyle = '#00000040';
      ctx.fillRect(Math.round(2 * TILE - cam.x), Math.round(this.floorY - 10 - cam.y),
        this.level.room.w * TILE - 4 * TILE, 3);
    }
  }
}

class Feather extends Enemy {
  constructor(level, x, y, vx, vy) {
    super(level, x, y, 10, 8);
    this.vx = vx; this.vy = vy;
    this.stompable = false; this.eatable = false; this.ghost = true;
    this.life = 180;
  }
  update() {
    if (super.update()) return;
    this.vy += 0.03;
    this.x += this.vx; this.y += this.vy;
    if (--this.life <= 0) this.removed = true;
  }
  touchPlayer(p) { if (p.invuln <= 0) p.damage(); }
  draw(ctx, cam) {
    ctx.save();
    ctx.translate(Math.round(this.cx - cam.x), Math.round(this.y - cam.y));
    ctx.rotate(Math.sin(this.animT / 6) * 0.6);
    ctx.fillStyle = '#3d5a7e';
    ctx.fillRect(-5, -2, 10, 4);
    ctx.fillStyle = '#e8eef8';
    ctx.fillRect(-5, -2, 4, 4);
    ctx.restore();
  }
}

// ================= General Bramble (World 4, final) =================
// Phase 1: pod tennis — he lobs seed-pods; pick them up and throw them back.
// Phase 2: ceiling crawl, raining thorns (and pods for ammo); slams down dazed.
// Phase 3: floor crumbles from the edges over thorn-lava; wild shell charges.
class BrambleBoss extends Boss {
  constructor(level, x, y) {
    super(level, x, y, 52, 46, 9);
    this.state = 'pace';
    this.stateT = 0;
    this.floorY = this.bottom;
    this.crumbleT = 0;
    this.crumbled = 0;
  }
  update() {
    if (this.baseUpdate()) return;
    this.stateT++;
    const p = this.level.player;
    const ph = this.phase;

    // phase 3: shrink the floor from the edges
    if (ph >= 2) {
      this.crumbleT++;
      if (this.crumbleT % 210 === 0 && this.crumbled < 7) {
        this.crumbled++;
        this.level.crumbleArenaEdge(this.crumbled);
      }
    }

    if (ph === 0) this.updateTennis(p);
    else if (ph === 1) this.updateCeiling(p);
    else this.updateRampage(p);
  }

  updateTennis(p) {
    if (this.state === 'pace') {
      this.dir = p.cx > this.cx ? 1 : -1;
      this.vx = this.dir * 0.5;
      this.vy = Math.min(this.vy + 0.3, 4.4);
      tileMove(this.level, this, { oneWay: false });
      if (this.stateT > 150) this.setState('throw');
    } else if (this.state === 'throw') {
      if (this.stateT === 24) {
        const dx = p.cx - this.cx;
        this.level.addEntity(new BombPod(this.level, this.cx, this.y + 10, clamp(dx / 60, -2.4, 2.4), -4.5));
        AudioSys.throwIt();
      }
      if (this.stateT > 48) this.setState('pace');
    }
  }

  updateCeiling(p) {
    if (this.state === 'pace' || this.state === 'throw') this.setState('climb');
    if (this.state === 'climb') {
      // rise to ceiling
      this.y = Math.max(this.y - 2, 3 * TILE);
      if (this.y <= 3 * TILE) this.setState('crawl');
    } else if (this.state === 'crawl') {
      const tx = clamp(p.cx - this.w / 2, 3 * TILE, this.level.room.w * TILE - 3 * TILE - this.w);
      this.x += clamp(tx - this.x, -1.3, 1.3);
      if (this.stateT % 70 === 30) {
        // rain: thorn or ammo pod
        if (Math.random() < 0.3) {
          this.level.addEntity(new BombPod(this.level, this.cx, this.bottom, 0, 0.5));
        } else {
          this.level.addEntity(new ThornDrop(this.level, this.cx, this.bottom));
        }
        AudioSys.throwIt();
      }
      if (this.stateT > 240) this.setState('slamTele');
    } else if (this.state === 'slamTele') {
      // hover over player, flash
      const tx = clamp(p.cx - this.w / 2, 2 * TILE, this.level.room.w * TILE - 2 * TILE - this.w);
      this.x += clamp(tx - this.x, -2.2, 2.2);
      if (this.stateT > 36) this.setState('slam');
    } else if (this.state === 'slam') {
      this.vy = Math.min(this.vy + 0.5, 7);
      this.y += this.vy;
      if (this.y + this.h >= this.floorY) {
        this.y = this.floorY - this.h;
        this.vy = 0;
        this.level.cam.shake(16, 5);
        AudioSys.shockwave();
        this.level.addEntity(new Shockwave(this.level, this.cx - 24, this.bottom, -1.6));
        this.level.addEntity(new Shockwave(this.level, this.cx + 24, this.bottom, 1.6));
        this.setState('dazed');
      }
    } else if (this.state === 'dazed') {
      if (this.stateT > 130) this.setState('climb');
    }
  }

  updateRampage(p) {
    if (['climb', 'crawl', 'slamTele', 'slam', 'dazed'].includes(this.state) && this.state !== 'dazed') {
      // drop out of ceiling states into the rampage
      this.vy = Math.min(this.vy + 0.4, 6);
      this.y += this.vy;
      if (this.y + this.h >= this.floorY) { this.y = this.floorY - this.h; this.setState('charge'); this.chargeDir = this.dir; }
      return;
    }
    if (this.state === 'pace' || this.state === 'throw') { this.setState('charge'); this.chargeDir = this.dir; }
    if (this.state === 'charge') {
      this.vx = this.chargeDir * 2.6;
      this.vy = Math.min(this.vy + 0.3, 4.4);
      const res = tileMove(this.level, this, { oneWay: false });
      if (res.hitWall) {
        this.chargeDir = -this.chargeDir;
        AudioSys.bump();
        this.level.cam.shake(8, 3);
      }
      this.dir = this.chargeDir;
      if (this.stateT > 320) this.setState('exhausted');
    } else if (this.state === 'exhausted') {
      if (this.stateT === 1) {
        // pod volley for ammo
        for (const vx of [-1.8, 1.8]) {
          this.level.addEntity(new BombPod(this.level, this.cx, this.y + 10, vx, -4));
        }
        AudioSys.throwIt();
      }
      if (this.stateT > 120) this.setState('charge');
    } else if (this.state === 'dazed') {
      if (this.stateT > 100) { this.setState('charge'); this.chargeDir = p.cx > this.cx ? 1 : -1; }
    }
  }

  setState(s) { this.state = s; this.stateT = 0; }

  hitByPod(pod) {
    if (this.hit()) {
      Particles.burst(pod.cx, pod.y, 10, { color: '#5a3a6a', life: 20, speed: 2 });
    }
  }
  hitByShell() { /* immune — spiky shell */ }
  hitBySeed() { /* immune — seeds bounce off his armor */ }

  touchPlayer(p) {
    // always spiky — no stomping the General
    p.damage();
  }

  draw(ctx, cam) {
    if (this.flashing()) return;
    let img;
    if (this.state === 'dazed') img = Sprites.boss.bramble.stun;
    else if (this.state === 'charge' || this.state === 'slam') img = Sprites.boss.bramble.shell;
    else if (this.state === 'throw' && this.stateT < 26) img = Sprites.boss.bramble.throw;
    else img = Sprites.boss.bramble.walk[(this.animT >> 4) % 2];
    const flip = ['crawl', 'climb', 'slamTele'].includes(this.state);
    if (flip) {
      // ceiling crawl: draw upside down
      const dx = Math.round(this.cx - cam.x), dy = Math.round(this.y - cam.y);
      ctx.save();
      ctx.translate(dx, dy + img.height / 2);
      ctx.scale(this.dir < 0 ? -1 : 1, -1);
      ctx.drawImage(img, -img.width >> 1, -img.height >> 1);
      ctx.restore();
    } else {
      drawSprite(ctx, img, this.cx, this.bottom, this.dir < 0, cam);
    }
    if (this.state === 'slamTele' && (this.stateT >> 2) % 2) {
      ctx.fillStyle = '#00000040';
      ctx.fillRect(Math.round(this.cx - 16 - cam.x), Math.round(this.floorY - 4 - cam.y), 32, 4);
    }
  }
}

// Thrown-object tennis ammo: lands, sits, can be picked up (hold run) and
// thrown at the General.
class BombPod extends Entity {
  constructor(level, x, y, vx, vy) {
    super(level, x, y, 14, 14);
    this.vx = vx; this.vy = vy;
    this.state = 'arc'; // arc | idle | sliding (thrown by player)
    this.carried = false;
    this.life = 900;
    this.isShellType = true;
  }
  update() {
    this.animT++;
    if (this.carried) return;
    if (--this.life <= 0) {
      this.removed = true;
      Particles.burst(this.cx, this.y + 6, 6, { color: '#5a3a6a', life: 16 });
      return;
    }
    if (this.state === 'arc') {
      this.vy = Math.min(this.vy + 0.22, 4.4);
      const res = tileMove(this.level, this, { oneWay: true });
      if (res.onGround) { this.state = 'idle'; this.vx = 0; }
      if (res.hitWall) this.vx = 0;
    } else if (this.state === 'idle') {
      this.vy = Math.min(this.vy + 0.3, 4.4);
      tileMove(this.level, this, { oneWay: true });
    } else if (this.state === 'sliding') {
      this.vy += 0.12; // gentle arc
      this.x += this.vx; this.y += this.vy;
      const boss = this.level.boss;
      if (boss && !boss.removed && !boss.dying && aabb(this, boss)) {
        boss.hitByPod ? boss.hitByPod(this) : boss.hit();
        this.removed = true;
        return;
      }
      // walls/floor pop it
      const tx = Math.floor(this.cx / TILE), ty = Math.floor((this.y + this.h) / TILE);
      if (TILE_SOLID.has(this.level.tileAt(tx, ty)) ||
          TILE_SOLID.has(this.level.tileAt(Math.floor((this.vx > 0 ? this.x + this.w : this.x) / TILE), Math.floor(this.cy0() / TILE)))) {
        this.removed = true;
        Particles.burst(this.cx, this.y + 6, 8, { color: '#5a3a6a', life: 16, speed: 1.5 });
        AudioSys.brick();
      }
    }
    if (this.y > this.level.room.h * TILE + 40) this.removed = true;
  }
  cy0() { return this.y + this.h / 2; }
  touchPlayer(p) {
    if (this.state === 'arc' && this.vy > 0.5) {
      // falling pods bonk you
      if (p.invuln <= 0) p.damage();
      return;
    }
    if (this.state === 'idle' && Input.held.run && !p.carrying && !p.riding) {
      this.carried = true;
      p.carrying = this;
    }
  }
  draw(ctx, cam) {
    const bob = this.state === 'idle' && (this.animT >> 4) % 2 ? -1 : 0;
    const dx = Math.round(this.cx - cam.x), dy = Math.round(this.y + this.h / 2 + bob - cam.y);
    ctx.save();
    ctx.translate(dx, dy);
    if (this.state === 'sliding') ctx.rotate((this.animT / 5) % (Math.PI * 2));
    ctx.drawImage(Sprites.thornBall, -6, -6);
    ctx.restore();
    if (this.state === 'idle' && (this.animT % 50) < 25) {
      drawText(ctx, '!', dx - 2, dy - 18, '#ffd23e', 1, '#00000060');
    }
  }
}

class ThornDrop extends Enemy {
  constructor(level, x, y) {
    super(level, x, y, 10, 10);
    this.stompable = false; this.eatable = false; this.ghost = true;
    this.spiky = true;
  }
  update() {
    if (super.update()) return;
    this.vy = Math.min(this.vy + 0.2, 4.2);
    this.y += this.vy;
    const ty = Math.floor((this.y + this.h) / TILE), tx = Math.floor(this.cx / TILE);
    if (TILE_SOLID.has(this.level.tileAt(tx, ty))) {
      this.removed = true;
      Particles.burst(this.cx, this.y + 6, 4, { color: '#5a3a6a', life: 12 });
    }
    if (this.y > this.level.room.h * TILE + 40) this.removed = true;
  }
  touchPlayer(p) { if (p.invuln <= 0) p.damage(); }
  draw(ctx, cam) {
    ctx.save();
    ctx.translate(Math.round(this.cx - cam.x), Math.round(this.y + 5 - cam.y));
    ctx.rotate((this.animT / 7) % (Math.PI * 2));
    ctx.drawImage(Sprites.thornBall, -6, -6);
    ctx.restore();
  }
}

const BOSS_CLASSES = {
  snapjaw: SnapjawBoss, grubmaw: GrubmawBoss, gale: GaleBoss, bramble: BrambleBoss,
};
