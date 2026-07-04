// Pip: movement physics, power-ups, damage, spin-hop, carrying, Moss riding.

// Shared tile collision used by the player and all entities.
// level must provide tileAt(tx,ty) and touchCrumble/bumpable handling.
function tileMove(level, ent, opts = {}) {
  const oneWay = opts.oneWay !== false;
  const res = { hitWall: false, onGround: false, onOneWay: false, headTiles: [], onMover: null };
  const solid = (id) => TILE_SOLID.has(id);

  // ---- horizontal ----
  ent.x += ent.vx;
  if (ent.vx > 0) {
    const tx = Math.floor((ent.x + ent.w) / TILE);
    for (let ty = Math.floor(ent.y / TILE); ty <= Math.floor((ent.y + ent.h - 1) / TILE); ty++) {
      if (solid(level.tileAt(tx, ty))) {
        ent.x = tx * TILE - ent.w - 0.01;
        ent.vx = 0; res.hitWall = true;
        break;
      }
    }
  } else if (ent.vx < 0) {
    const tx = Math.floor(ent.x / TILE);
    for (let ty = Math.floor(ent.y / TILE); ty <= Math.floor((ent.y + ent.h - 1) / TILE); ty++) {
      if (solid(level.tileAt(tx, ty))) {
        ent.x = (tx + 1) * TILE + 0.01;
        ent.vx = 0; res.hitWall = true;
        break;
      }
    }
  }

  // ---- vertical ----
  const prevBottom = ent.y + ent.h;
  ent.y += ent.vy;
  if (ent.vy >= 0) {
    const by = Math.floor((ent.y + ent.h) / TILE);
    for (let tx = Math.floor((ent.x + 1) / TILE); tx <= Math.floor((ent.x + ent.w - 1) / TILE); tx++) {
      const id = level.tileAt(tx, by);
      const top = by * TILE;
      if (solid(id)) {
        ent.y = top - ent.h; ent.vy = 0; res.onGround = true;
      } else if ((id === T.PLATFORM || id === T.CRUMBLE) && oneWay && !(ent.dropT > 0) &&
                 prevBottom <= top + 4 && ent.y + ent.h >= top) {
        ent.y = top - ent.h; ent.vy = 0; res.onGround = true; res.onOneWay = true;
        if (id === T.CRUMBLE && level.touchCrumble) level.touchCrumble(tx, by);
      }
    }
    // moving platforms (solid from top)
    if (level.movers) {
      for (const m of level.movers) {
        if (ent.x + ent.w > m.px + 1 && ent.x < m.px + m.w - 1 &&
            prevBottom <= m.py + 5 && ent.y + ent.h >= m.py && ent.vy >= 0) {
          ent.y = m.py - ent.h; ent.vy = 0; res.onGround = true; res.onMover = m;
        }
      }
    }
  } else {
    const ty = Math.floor(ent.y / TILE);
    for (let tx = Math.floor((ent.x + 1) / TILE); tx <= Math.floor((ent.x + ent.w - 1) / TILE); tx++) {
      const id = level.tileAt(tx, ty);
      if (solid(id)) {
        ent.y = (ty + 1) * TILE + 0.01; ent.vy = 0;
        res.headTiles.push({ tx, ty, id });
      }
    }
  }
  return res;
}

function overlapsTileType(level, ent, type) {
  const x0 = Math.floor(ent.x / TILE), x1 = Math.floor((ent.x + ent.w - 1) / TILE);
  const y0 = Math.floor(ent.y / TILE), y1 = Math.floor((ent.y + ent.h - 1) / TILE);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++)
      if (level.tileAt(tx, ty) === type) return { tx, ty };
  return null;
}

class Player {
  constructor(level, x, y) {
    this.level = level;
    this.w = 12; this.h = 14;
    this.x = x - this.w / 2; this.y = y - this.h;
    this.vx = 0; this.vy = 0;
    this.dir = 1;
    this.onGround = false;
    this.power = Run.power;
    this.applyPowerSize(true);
    this.coyote = 0; this.jumpBuf = 0;
    this.jumpHeld = false;
    this.spinning = false;
    this.crouching = false;
    this.skidding = false;
    this.invuln = 0;
    this.soar = 0;
    this.pspeed = 0;        // P-meter: charges at full run speed
    this.pFull = false;
    this.dropT = 0;         // frames of one-way pass-through after Down+jump
    this.onOneWay = false;
    this.gliding = false;
    this.carrying = null;   // shell entity
    this.riding = false;    // riding Moss (moss merged into player)
    this.tongueT = 0;
    this.doubleTap = 0;
    this.landTimer = 0; this.jumpAnimT = 0;
    this.animT = 0;
    this.dead = false;
    this.growT = 0;
    this.stompChain = 0;
  }

  get big() { return this.power >= POWER.SPROUT; }
  get cx() { return this.x + this.w / 2; }
  get bottom() { return this.y + this.h; }

  applyPowerSize(initial = false) {
    const wantH = this.riding ? 26 : (this.big && !this.crouching ? 24 : 14);
    if (this.h !== wantH) {
      this.y += this.h - wantH;
      this.h = wantH;
    }
    if (initial) this.growT = 0;
  }

  setPower(p, silent = false) {
    const was = this.power;
    this.power = p;
    Run.power = p;
    this.applyPowerSize();
    if (!silent && p > was) { AudioSys.powerup(); this.growT = 40; }
    if (!silent && p < was) { AudioSys.hurt(); this.growT = 40; }
  }

  collectPowerItem(kind) {
    Run.score += 1000;
    Particles.score(this.x + this.w / 2, this.y - 8, 1000);
    if (kind === 'fruit') {
      if (this.power === POWER.SMALL) this.setPower(POWER.SPROUT);
      else this.stashReserve('fruit');
    } else if (kind === 'blossom') {
      if (this.power < POWER.BLOSSOM || this.power === POWER.GLIDER) {
        if (this.power === POWER.GLIDER) this.stashReserve('glider');
        this.setPower(POWER.BLOSSOM);
      } else this.stashReserve('blossom');
    } else if (kind === 'glider') {
      if (this.power !== POWER.GLIDER) {
        if (this.power === POWER.BLOSSOM) this.stashReserve('blossom');
        this.setPower(POWER.GLIDER);
      } else this.stashReserve('glider');
    } else if (kind === 'clover') {
      Run.lives = Math.min(99, Run.lives + 1);
      AudioSys.oneUp();
      Particles.score(this.x + this.w / 2, this.y - 8, '1UP');
    }
  }

  stashReserve(kind) {
    if (!Run.reserve) { Run.reserve = kind; AudioSys.coin(); }
  }

  mountMoss() {
    if (this.riding) return;
    this.riding = true;
    AudioSys.mount();
    this.applyPowerSize();
    Particles.burst(this.x + this.w / 2, this.y + this.h, 6, { color: '#8ae06a', life: 20 });
  }

  dismountMoss(flee) {
    if (!this.riding) return;
    this.riding = false;
    this.applyPowerSize();
    this.level.spawnMoss(this.x + this.w / 2, this.y + this.h, flee);
    if (!flee) this.vy = -3.5;
  }

  update() {
    const inp = Input;
    const level = this.level;

    if (this.invuln > 0) this.invuln--;
    if (this.growT > 0) this.growT--;
    if (this.landTimer > 0) this.landTimer--;
    if (this.jumpAnimT > 0) this.jumpAnimT--;
    if (this.tongueT > 0) this.tongueT--;
    if (this.doubleTap > 0) this.doubleTap--;

    // ---- horizontal input ----
    const left = inp.held.left, right = inp.held.right;
    const running = inp.held.run || this.tongueT > 0;
    const max = this.riding ? (running ? 2.3 : 1.7) : (running ? PHYS.maxRun : PHYS.maxWalk);
    const accel = this.onGround ? (running ? PHYS.runAccel : PHYS.walkAccel) : PHYS.airAccel;

    this.crouching = this.onGround && inp.held.down && !this.riding;
    if (this.big) this.applyPowerSize();

    let move = 0;
    if (left && !right) move = -1;
    if (right && !left) move = 1;
    if (this.crouching) move = 0;

    this.skidding = false;
    if (move !== 0) {
      if (this.onGround && Math.sign(this.vx) === -move && Math.abs(this.vx) > 0.8) {
        this.vx += move * PHYS.skidDecel * 0.5;
        this.skidding = true;
        if (Game.frame % 4 === 0) Particles.spawn(this.x + this.w / 2, this.y + this.h, { vx: -move * 0.5, vy: -0.5, color: '#e8dcc8', life: 14 });
      } else {
        this.vx += move * accel;
        if (Math.abs(this.vx) > max) this.vx = move * Math.max(Math.abs(this.vx) - 0.06, max);
        this.dir = move;
      }
    } else if (this.onGround) {
      const f = this.crouching ? PHYS.friction * 1.6 : PHYS.friction;
      if (Math.abs(this.vx) <= f) this.vx = 0;
      else this.vx -= Math.sign(this.vx) * f;
    }

    // ---- P-meter: charge at full run speed, keep it while airborne fast ----
    const atSpeed = !this.riding && Math.abs(this.vx) >= PHYS.maxRun * 0.98;
    if (this.onGround) {
      this.pspeed = atSpeed ? Math.min(PHYS.pspeedCharge, this.pspeed + 1)
                            : Math.max(0, this.pspeed - 2);
    } else if (Math.abs(this.vx) < PHYS.maxRun * 0.9) {
      this.pspeed = Math.max(0, this.pspeed - 1);
    }
    const nowFull = this.pspeed >= PHYS.pspeedCharge;
    if (nowFull && !this.pFull) AudioSys.pmeter();
    this.pFull = nowFull;
    if (this.pFull && Game.frame % 3 === 0 && !this.dead) {
      Particles.spawn(this.x + Math.random() * this.w, this.y + this.h - Math.random() * 6,
        { vx: -this.dir * 0.4, vy: -0.3, g: 0, color: (Game.frame >> 2) & 1 ? '#ffe98a' : '#ffffff', life: 14, size: 1 });
    }

    // ---- jumping ----
    if (this.onGround) this.coyote = PHYS.coyoteFrames;
    else if (this.coyote > 0) this.coyote--;

    if (inp.pressed.jump) {
      this.jumpBuf = PHYS.bufferFrames;
      // double-tap jump = spin hop
      if (this.doubleTap > 0 && this.coyote > 0) this.trySpin();
      this.doubleTap = PHYS.doubleTapWindow;
    } else if (this.jumpBuf > 0) this.jumpBuf--;

    if (inp.pressed.spin) this.trySpin();

    this.jumpHeld = !!inp.held.jump;

    // drop through one-way platforms: hold Down + press jump
    if (this.dropT > 0) this.dropT--;
    if (!this.riding && this.onGround && this.onOneWay && inp.held.down && this.jumpBuf > 0) {
      this.dropT = 10;
      this.jumpBuf = 0; this.coyote = 0;
      this.onGround = false; this.onOneWay = false;
      this.vy = Math.max(this.vy, 1);
    }

    if (this.jumpBuf > 0 && this.coyote > 0 && !this.spinning) {
      this.doJump(false);
    }

    // dismount: down + jump while riding
    if (this.riding && inp.held.down && inp.pressed.jump) {
      this.dismountMoss(false);
    }

    // ---- tongue (riding) ----
    if (this.riding && inp.pressed.run && this.tongueT <= 0) {
      this.tongueT = 14;
      AudioSys.tongue();
    }

    // ---- projectiles / carrying ----
    if (!this.riding) {
      if (this.carrying) {
        if (!inp.held.run) this.throwCarried(inp);
      } else if (inp.pressed.run && this.power === POWER.BLOSSOM) {
        level.throwSeed(this);
      }
    }

    // ---- gravity ----
    let g = (this.vy < 0 && this.jumpHeld) ? PHYS.gravityHeld : PHYS.gravity;
    if (this.soar > 0 && this.jumpHeld) { g *= 0.42; this.soar--; }
    else this.soar = 0;
    this.vy += g;

    this.gliding = false;
    if (this.power === POWER.GLIDER && !this.onGround && this.vy > PHYS.glideFall && this.jumpHeld && this.soar <= 0) {
      this.vy = PHYS.glideFall;
      this.gliding = true;
      if (Game.frame % 6 === 0) Particles.spawn(this.x + this.w / 2 - this.dir * 8, this.y + 4, { vx: -this.dir * 0.3, vy: 0.1, g: 0, color: '#f2e6c8', life: 16 });
    }
    if (this.vy > PHYS.maxFall) this.vy = PHYS.maxFall;

    // ---- move & collide ----
    const wasAir = !this.onGround;
    const res = tileMove(level, this, { oneWay: true });
    this.onGround = res.onGround;
    this.onOneWay = res.onOneWay;
    if (res.onMover) this.x += res.onMover.dx;
    if (this.onGround) {
      if (wasAir) {
        this.landTimer = 6;
        if (this.spinning) this.spinLand();
        this.spinning = false;
        this.stompChain = 0;
        if (this.vyPrev > 3) Particles.burst(this.x + this.w / 2, this.y + this.h, 4, { color: '#e8dcc8', life: 12, speed: 0.8 });
      }
    }
    this.vyPrev = this.vy;

    // head bumps
    for (const hb of res.headTiles) level.bumpBlock(hb.tx, hb.ty, this);

    // ---- hazards ----
    if (overlapsTileType(level, this, T.SPIKES) || overlapsTileType(level, this, T.THORN)) {
      this.damage();
    }

    // burrow doors
    if (inp.pressed.down && this.onGround) {
      const d = overlapsTileType(level, this, T.BURROW);
      if (d) level.enterDoor(d);
    }

    // carried shell follows
    if (this.carrying) {
      const sh = this.carrying;
      sh.x = this.x + this.w / 2 + this.dir * 9 - sh.w / 2;
      sh.y = this.y + this.h - sh.h - (this.big ? 6 : 2);
    }

    // fell out of the level
    if (this.y > level.room.h * TILE + 40) this.die(true);

    // level bounds
    if (this.x < 0) { this.x = 0; this.vx = Math.max(0, this.vx); }
    if (this.x + this.w > level.room.w * TILE) { this.x = level.room.w * TILE - this.w; this.vx = Math.min(0, this.vx); }

    this.animT++;
  }

  doJump(spin) {
    const runBonus = PHYS.jumpRunBonus * Math.min(1, Math.abs(this.vx) / PHYS.maxRun) *
      (this.pFull ? 1.22 : 1);
    this.vy = -(PHYS.jumpBase + runBonus);
    this.onGround = false;
    this.coyote = 0; this.jumpBuf = 0;
    this.jumpAnimT = 6;
    this.spinning = spin;
    if (this.power === POWER.GLIDER && Math.abs(this.vx) >= PHYS.maxRun * 0.92) {
      this.soar = this.pFull ? PHYS.soarFramesFull : PHYS.soarFrames;
    }
    spin ? AudioSys.spin() : AudioSys.jump();
  }

  trySpin() {
    if (this.coyote > 0 && !this.spinning) {
      this.doJump(true);
    }
  }

  spinLand() {
    // spin-hop breaks bricks under the feet
    const by = Math.floor((this.y + this.h + 2) / TILE);
    const tx0 = Math.floor((this.x + 1) / TILE), tx1 = Math.floor((this.x + this.w - 1) / TILE);
    let broke = false;
    for (let tx = tx0; tx <= tx1; tx++) {
      if (this.level.tileAt(tx, by) === T.BRICK) { this.level.breakBrick(tx, by); broke = true; }
    }
    if (broke) { this.vy = -2.6; this.onGround = false; this.spinning = true; }
  }

  throwCarried(inp) {
    const sh = this.carrying;
    this.carrying = null;
    sh.carried = false;
    sh.y = this.y + this.h - sh.h;
    if (inp.held.down && this.onGround) {
      sh.x = this.x + this.w / 2 + this.dir * 10 - sh.w / 2;
      sh.vx = this.dir * 0.3;
      sh.state = 'idle';
    } else if (inp.held.up) {
      sh.x = this.x;
      sh.vx = this.dir * 1.2; sh.vy = -5.5;
      sh.state = 'sliding';
      AudioSys.throwIt();
    } else {
      sh.x = this.x + this.w / 2 + this.dir * 10 - sh.w / 2;
      sh.vx = this.dir * PHYS.shellSpeed;
      sh.vy = -0.5;
      sh.state = 'sliding';
      sh.thrownBy = 'player';
      AudioSys.throwIt();
    }
    sh.noHurtT = 12;
  }

  bounce(spiky = false) {
    const held = this.jumpHeld;
    this.vy = this.spinning ? -PHYS.spinBounce : (held ? -PHYS.stompBounceHeld : -PHYS.stompBounce);
    this.onGround = false;
  }

  chainScore(x, y) {
    const chain = SCORE.stompChain;
    const idx = Math.min(this.stompChain, chain.length);
    if (idx >= chain.length) {
      Run.lives = Math.min(99, Run.lives + 1);
      AudioSys.oneUp();
      Particles.score(x, y, '1UP');
    } else {
      Run.score += chain[idx];
      Particles.score(x, y, chain[idx]);
    }
    this.stompChain++;
  }

  damage() {
    if (this.invuln > 0 || this.dead || this.level.finished) return;
    if (this.riding) {
      this.dismountMoss(true);
      this.invuln = 80;
      AudioSys.hurt();
      return;
    }
    // release reserve item
    if (Run.reserve && this.power !== POWER.SMALL) this.level.dropReserve();
    if (this.power >= POWER.BLOSSOM) {
      this.setPower(POWER.SPROUT);
      this.invuln = 90;
    } else if (this.power === POWER.SPROUT) {
      this.setPower(POWER.SMALL);
      this.invuln = 90;
    } else {
      this.die(false);
    }
  }

  die(pit) {
    if (this.dead) return;
    this.dead = true;
    if (this.carrying) { this.carrying.carried = false; this.carrying = null; }
    this.level.playerDied(pit);
  }

  // ---------- drawing ----------
  draw(ctx, cam) {
    if (this.invuln > 0 && (this.invuln % 6) >= 3 && !this.dead) return;
    const sheet = Sprites.pip[this.power];
    let img;
    if (this.crouching) img = sheet.crouch;
    else if (this.spinning) img = sheet.spin[(this.animT >> 2) % 4];
    else if (this.gliding) img = sheet.glide;
    else if (!this.onGround) img = this.vy < 0 ? sheet.jump : sheet.fall;
    else if (this.skidding) img = sheet.skid;
    else if (this.carrying) img = sheet.carry[(this.animT >> 3) % 2];
    else if (Math.abs(this.vx) > 0.2) {
      const rate = Math.abs(this.vx) > 2 ? 2 : 3;
      img = sheet.walk[(this.animT >> rate) % 2];
    } else img = sheet.idle;

    // squash & stretch
    let sx = 1, sy = 1;
    if (this.jumpAnimT > 0) { sy = 1.12; sx = 0.9; }
    else if (this.landTimer > 0) { sy = 0.85; sx = 1.12; }
    if (this.growT > 0 && (this.growT % 8) >= 4) { sy *= 1.1; sx *= 1.1; }

    const cx = this.x + this.w / 2, by = this.y + this.h + 1;

    if (this.riding) {
      // moss under pip
      const mossImg = this.tongueT > 0 ? Sprites.moss.eat :
        Sprites.moss.walk[(this.animT >> 3) % 2];
      drawSprite(ctx, mossImg, cx, by, this.dir < 0, cam);
      // tongue
      if (this.tongueT > 8) {
        const len = (14 - this.tongueT) * 6 + 8;
        ctx.fillStyle = '#ff8fa8';
        const tx = this.dir > 0 ? cx + 8 : cx - 8 - len;
        ctx.fillRect(Math.round(tx - cam.x), Math.round(by - 12 - cam.y), len, 3);
        ctx.fillRect(Math.round((this.dir > 0 ? tx + len - 3 : tx) - cam.x), Math.round(by - 14 - cam.y), 4, 6);
      }
      drawSprite(ctx, img, cx, by - 12, this.dir < 0, cam, sy, sx);
    } else {
      drawSprite(ctx, img, cx, by, this.dir < 0, cam, sy, sx);
    }
  }

  // tongue hitbox while riding (or null)
  tongueBox() {
    if (!this.riding || this.tongueT <= 0 || this.tongueT > 8) return null;
    const len = 44;
    return {
      x: this.dir > 0 ? this.x + this.w : this.x - len,
      y: this.y + this.h - 18, w: len, h: 12,
    };
  }
}
