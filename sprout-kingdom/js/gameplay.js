// LevelState: runs one level (or boss arena) — world simulation, HUD,
// hazards, goal sequence, death/respawn.

class LevelState {
  constructor(levelId, opts = {}) {
    this.def = getLevel(levelId);
    this.opts = opts;
    this.demo = !!opts.demo;

    // build runtime rooms (clone grids so bumps/breaks don't pollute the cache)
    this.roomsRT = {};
    for (const key of Object.keys(this.def.rooms)) {
      const src = this.def.rooms[key];
      this.roomsRT[key] = {
        key,
        w: src.w, h: src.h,
        grid: src.grid.map(r => Uint8Array.from(r)),
        entities: [],
        movers: src.movers.map(m => ({ ...m, px: m.x, py: m.y, dx: 0, t: Math.random() * 0 })),
        doors: src.doors,
        goals: src.goals,
      };
      for (const sp of src.spawns) {
        this.roomsRT[key].entities.push(this.makeEntity(sp, key));
      }
      for (const cp of src.checkpoints) {
        const f = new CheckpointFlag(this, cp.x, cp.y);
        f.roomKey = key;
        this.roomsRT[key].entities.push(f);
      }
    }
    this.roomKey = opts.checkpoint ? (opts.checkpoint.room || 'main') : 'main';

    // player spawn
    const start = opts.checkpoint || this.def.rooms.main.start || { x: 40, y: 200 };
    this.player = new Player(this, start.x, start.y);
    if (opts.checkpoint) {
      // re-light the flag we respawned at
      for (const e of this.room.entities) {
        if (e instanceof CheckpointFlag && Math.abs(e.cx - start.x) < 20) e.on = true;
      }
    }

    this.cam = new Camera(this.room.w * TILE, this.room.h * TILE);
    this.cam.follow(this.player, true);

    // level features
    this.time = this.def.time * 60; // frames; 0 = untimed
    this.dark = this.def.dark || 0;
    this.windDef = this.def.wind || null;
    this.windT = 0; this.windAx = 0;
    this.lavaDef = this.def.lava || null;
    this.lavaY = this.lavaDef ? this.room.h * TILE + 24 : 0;
    this.lavaDelay = this.lavaDef ? this.lavaDef.delay : 0;
    if (opts.checkpoint && this.lavaDef) this.lavaY = opts.checkpoint.y + 100;

    this.starsGot = opts.starsGot || [false, false, false];
    this.coinsAtStart = Run.coins;

    this.bumpAnims = [];   // {tx,ty,t,room}
    this.crumbles = new Map(); // "x,y" -> {t, room}
    this.respawns = [];    // {tx,ty,t,room,id}

    this.finished = false;
    this.clearSeq = null;
    this.deathSeq = null;
    this.introT = this.demo ? 0 : 70;
    this.frameT = 0;
    this.checkpoint = opts.checkpoint || null;

    // boss
    this.boss = null;
    if (this.def.boss) {
      const cls = BOSS_CLASSES[this.def.boss];
      this.boss = new cls(this, this.room.w * TILE - 90, (this.room.h - 3) * TILE);
      this.cam.lockX = Math.max(0, (this.room.w * TILE - VIEW_W) / 2);
      this.bossBanner = 120;
    }

    Particles.clear();
    if (!this.demo) Music.play(this.def.music);
    this.demoT = 0;
    this.demoJump = 0;
  }

  get room() { return this.roomsRT[this.roomKey]; }
  get entities() { return this.room.entities; }
  get movers() { return this.room.movers; }

  makeEntity(sp, roomKey) {
    let e;
    if (sp.type === 'coin') e = new Coin(this, sp.x, sp.y);
    else if (sp.type === 'star') e = new DewStar(this, sp.x, sp.y, sp.starIndex);
    else if (ENEMY_CLASSES[sp.type]) e = new ENEMY_CLASSES[sp.type](this, sp.x, sp.y);
    else e = new Coin(this, sp.x, sp.y);
    e.roomKey = roomKey;
    return e;
  }

  // ---------------- tiles ----------------
  tileAt(tx, ty) {
    const r = this.room;
    if (tx < 0 || tx >= r.w) return T.STONE;
    if (ty < 0) return T.EMPTY;
    if (ty >= r.h) return T.EMPTY;
    return r.grid[ty][tx];
  }
  setTile(tx, ty, id) {
    const r = this.room;
    if (tx < 0 || tx >= r.w || ty < 0 || ty >= r.h) return;
    r.grid[ty][tx] = id;
  }

  bumpBlock(tx, ty, player) {
    const id = this.tileAt(tx, ty);
    if (!TILE_BUMPABLE.has(id)) return;
    const bx = tx * TILE + 8, by = ty * TILE;
    // knock enemies standing on the block
    for (const e of this.entities) {
      if (e.isEnemy && !e.dying && e.active &&
          Math.abs((e.y + e.h) - ty * TILE) < 6 &&
          e.x + e.w > tx * TILE && e.x < tx * TILE + TILE) {
        e.dieFlying(e.cx < bx ? -1 : 1);
        AudioSys.kick();
      }
    }
    if (id === T.BRICK) {
      if (player.big) { this.breakBrick(tx, ty); return; }
      this.bumpAnims.push({ tx, ty, t: 10, room: this.roomKey });
      AudioSys.bump();
      return;
    }
    this.bumpAnims.push({ tx, ty, t: 10, room: this.roomKey });
    this.setTile(tx, ty, T.USED);
    if (id === T.QCOIN) {
      this.addEntity(new CoinPop(this, bx, by));
    } else if (id === T.QPOWER) {
      const kind = player.power === POWER.SMALL ? 'fruit' : 'blossom';
      this.addEntity(new PowerItem(this, bx, by, kind, true));
      AudioSys.powerup();
    } else if (id === T.QGLIDER) {
      this.addEntity(new PowerItem(this, bx, by, 'glider', true));
      AudioSys.powerup();
    } else if (id === T.QONEUP) {
      this.addEntity(new PowerItem(this, bx, by, 'clover', true));
      AudioSys.powerup();
    } else if (id === T.QMOSS) {
      const m = new MossEnt(this, bx, by - 2);
      m.vy = -3.5;
      this.addEntity(m);
      AudioSys.mount();
    }
  }

  breakBrick(tx, ty) {
    this.setTile(tx, ty, T.EMPTY);
    AudioSys.brick();
    Run.score += SCORE.brick;
    const px = tx * TILE + 8, py = ty * TILE + 8;
    for (const [vx, vy] of [[-1.2, -3], [1.2, -3], [-0.7, -1.8], [0.7, -1.8]]) {
      Particles.spawn(px, py, { vx, vy, g: 0.22, color: Sprites.worldPal[this.def.world].brick, life: 40, size: 4 });
    }
  }

  touchCrumble(tx, ty) {
    const key = tx + ',' + ty + ',' + this.roomKey;
    if (!this.crumbles.has(key)) {
      this.crumbles.set(key, { tx, ty, t: 26, room: this.roomKey });
      AudioSys.crumbleSfx();
    }
  }

  crumbleArenaEdge(n) {
    // final boss phase 3: drop floor columns from the edges inward
    const r = this.room;
    for (const tx of [1 + n, r.w - 2 - n]) {
      for (let ty = r.h - 3; ty < r.h; ty++) {
        if (TILE_SOLID.has(r.grid[ty][tx])) {
          r.grid[ty][tx] = T.EMPTY;
        }
      }
      Particles.burst(tx * TILE + 8, (r.h - 3) * TILE + 8, 8, { color: '#8a8090', life: 22, speed: 1.6 });
    }
    AudioSys.shockwave();
    this.cam.shake(10, 3);
    this.arenaCrumbled = true;
  }

  // ---------------- pickups / events ----------------
  addEntity(e) {
    e.roomKey = this.roomKey;
    e.active = true;
    this.room.entities.push(e);
  }

  collectCoin(x, y, silentPos = false) {
    Run.coins++;
    Run.score += SCORE.coin;
    AudioSys.coin();
    if (!silentPos) Particles.burst(x, y, 5, { color: '#ffd23e', life: 14, speed: 1 });
    if (Run.coins >= COINS_PER_LIFE) {
      Run.coins -= COINS_PER_LIFE;
      Run.lives = Math.min(99, Run.lives + 1);
      AudioSys.oneUp();
      Particles.score(x, y - 10, '1UP');
    }
  }

  collectStar(idx, x, y) {
    this.starsGot[idx] = true;
    Run.score += SCORE.star;
    AudioSys.star();
    Particles.burst(x, y, 14, { color: '#aef7ff', life: 30, speed: 2 });
    Particles.score(x, y - 10, SCORE.star);
  }

  checkpointHit(flag) {
    this.checkpoint = { x: flag.cx, y: flag.bottom, room: flag.roomKey || this.roomKey };
    AudioSys.checkpoint();
    Particles.burst(flag.cx, flag.y + 8, 8, { color: '#9ee55c', life: 20, speed: 1.4 });
  }

  enterDoor(doorTile) {
    const otherKey = this.roomKey === 'main' ? 'bonus' : 'main';
    const other = this.roomsRT[otherKey];
    if (!other || !other.doors.length) return;
    // pair doors by index
    const myDoors = this.room.doors;
    const idx = myDoors.findIndex(d => d.x === doorTile.tx && d.y === doorTile.ty);
    const target = other.doors[Math.max(0, idx) % other.doors.length];
    AudioSys.door();
    Game.wipe(() => {
      this.roomKey = otherKey;
      this.player.x = target.x * TILE + 8 - this.player.w / 2;
      this.player.y = (target.y + 1) * TILE - this.player.h;
      this.player.vx = 0; this.player.vy = 0;
      this.cam = new Camera(this.room.w * TILE, this.room.h * TILE);
      this.cam.follow(this.player, true);
    });
  }

  throwSeed(player) {
    let n = 0;
    for (const e of this.entities) if (e.isSeed && !e.removed) n++;
    if (n >= 2) return;
    const s = new SeedProj(this, player.cx + player.dir * 8, player.y + 10, player.dir);
    this.addEntity(s);
    AudioSys.seed();
  }

  spawnMoss(x, y, flee) {
    this.addEntity(new MossEnt(this, x, y, flee));
  }

  dropReserve() {
    if (!Run.reserve) return;
    const kind = Run.reserve;
    Run.reserve = null;
    this.addEntity(new ReserveItem(this, this.cam.x, this.cam.y, kind));
    AudioSys.reserveDrop();
  }

  // ---------------- flow ----------------
  playerDied(pit) {
    if (this.deathSeq) return;
    Music.stop();
    Music.play('death');
    this.deathSeq = { t: 0, y: this.player.y, vy: pit ? -1 : -4.5, x: this.player.cx };
  }

  bossDefeated() {
    Run.score += SCORE.bossClear;
    this.clearSeq = { t: 0, boss: true, bonus: 0 };
    this.finished = true;
    Music.play('bosswin');
  }

  reachGoal(goal, dialVal) {
    if (this.finished) return;
    if (this.demo) {
      // the attract bot made it to the gate — bow out without touching the save
      this.finished = true;
      Main.toTitle();
      return;
    }
    this.finished = true;
    // dial bonus: closer to top = better
    const v = Math.abs(dialVal); // 0 = top
    let bonus = v < 0.12 ? 5000 : v < 0.3 ? 2000 : v < 0.6 ? 1000 : 500;
    Run.score += bonus;
    this.clearSeq = { t: 0, secret: goal.secret, bonus, timeLeft: Math.floor(this.time / 60) };
    Music.stop();
    Music.play('clear');
    AudioSys.dialStop();
  }

  // ---------------- update ----------------
  update() {
    this.frameT++;
    if (this.introT > 0) { this.introT--; return; }

    if (this.deathSeq) {
      const d = this.deathSeq;
      d.t++;
      d.vy += 0.25; d.y += d.vy;
      if (d.t > 70) Main.afterDeath(this);
      Particles.update();
      return;
    }

    if (this.clearSeq) {
      this.updateClear();
      Particles.update();
      this.cam.follow(this.player);
      return;
    }

    if (!this.demo && (Input.pressed.pause || Input.pressed.start)) {
      AudioSys.pause();
      Game.setState(new PauseState(this));
      return;
    }

    if (this.demo) this.demoTick();

    // wind
    if (this.windDef) {
      this.windT = (this.windT + 1) % this.windDef.every;
      const gust = this.windT > this.windDef.every - this.windDef.len;
      this.windAx = gust ? this.windDef.ax : 0;
      if (gust && this.windT % 6 === 0) {
        Particles.spawn(this.cam.x, this.cam.y + Math.random() * VIEW_H * 0.9,
          { vx: 2.5 + Math.random(), vy: 0, g: 0, color: '#ffffff90', life: 40 });
      }
      if (this.windT === this.windDef.every - this.windDef.len + 1) AudioSys.wind();
    }
    if (this.windAx && !this.player.dead) this.player.vx += this.windAx;

    // movers
    for (const m of this.movers) {
      m.t = (m.t || 0) + 1;
      const ph = (Math.sin((m.t / m.period) * Math.PI * 2) + 1) / 2;
      const nx = m.x + (m.x2 - m.x) * ph;
      const ny = m.y + (m.y2 - m.y) * ph;
      m.dx = nx - m.px;
      m.px = nx; m.py = ny;
    }

    // player
    this.player.update();

    // entity activation + update
    const actX0 = this.cam.x - VIEW_W, actX1 = this.cam.x + VIEW_W * 2;
    for (const e of this.entities) {
      if (!e.active) {
        if (e.x > actX0 && e.x < actX1) e.active = true;
        else continue;
      }
      if (e.carried) continue;
      e.update();
    }

    // boss
    if (this.boss && !this.boss.removed) {
      this.boss.update();
      if (this.bossBanner > 0) this.bossBanner--;
      if (!this.player.dead && this.player.invuln <= 0 && !this.boss.dying &&
          this.boss.introT <= 0 && aabb(this.player, this.boss)) {
        this.boss.touchPlayer(this.player);
      }
    }

    // interactions
    const p = this.player;
    if (!p.dead) {
      for (const e of this.entities) {
        if (!e.active || e.removed || e.carried) continue;
        if (aabb(p, e)) e.touchPlayer(p);
        if (e.removed || p.dead) continue;
        // carried shell smashes enemies
        if (p.carrying && e.isEnemy && !e.dying && !e.ghost && e !== p.carrying && aabb(p.carrying, e)) {
          e.hitByShell(p.carrying);
        }
      }
      // tongue
      const tb = p.tongueBox();
      if (tb) {
        for (const e of this.entities) {
          if (e.isEnemy && e.eatable && !e.dying && e.active && aabb(tb, e)) e.eaten();
        }
      }
    }

    // sweep removed
    this.room.entities = this.entities.filter(e => !e.removed);

    // crumbles
    for (const [key, c] of [...this.crumbles]) {
      c.t--;
      if (c.t <= 0) {
        this.crumbles.delete(key);
        const r = this.roomsRT[c.room];
        if (r.grid[c.ty][c.tx] === T.CRUMBLE) {
          r.grid[c.ty][c.tx] = T.EMPTY;
          Particles.burst(c.tx * TILE + 8, c.ty * TILE + 8, 5,
            { color: Sprites.worldPal[this.def.world].plat, life: 20, size: 3 });
          this.respawns.push({ tx: c.tx, ty: c.ty, t: 340, room: c.room, id: T.CRUMBLE });
        }
      }
    }
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i];
      if (--r.t <= 0) {
        const room = this.roomsRT[r.room];
        if (room.grid[r.ty][r.tx] === T.EMPTY) {
          room.grid[r.ty][r.tx] = r.id;
          this.respawns.splice(i, 1);
        } else r.t = 30;
      }
    }

    // bump anims
    for (let i = this.bumpAnims.length - 1; i >= 0; i--) {
      if (--this.bumpAnims[i].t <= 0) this.bumpAnims.splice(i, 1);
    }

    // lava
    if (this.lavaDef) {
      if (this.lavaDelay > 0) this.lavaDelay--;
      else this.lavaY -= this.lavaDef.speed;
      if (Game.frame % 8 === 0) {
        Particles.spawn(this.cam.x + Math.random() * VIEW_W, this.lavaY,
          { vx: 0, vy: -1 - Math.random(), g: 0.04, color: '#ff8a3a', life: 26 });
      }
      if (!p.dead && p.y + p.h > this.lavaY + 4) p.die(true);
    }

    // goal check
    if (!this.finished && !p.dead) {
      for (const g of this.room.goals) {
        const gx = g.x * TILE + 8;
        if (Math.abs(p.cx - gx) < 10 && p.y + p.h > (g.y - 4) * TILE && p.y < (g.y + 1) * TILE) {
          const dial = Math.sin(this.frameT / 14);
          this.reachGoal(g, dial);
        }
      }
    }

    // timer
    if (this.time > 0 && !this.demo && !this.finished) {
      this.time--;
      if (this.time === 60 * 50) AudioSys.pause(); // hurry chirp
      if (this.time <= 0 && !p.dead) p.die(false);
    }

    // camera + particles
    this.cam.follow(p);
    Particles.update();

    // demo timeout
    if (this.demo) {
      this.demoT++;
      if (this.demoT > 1500 || p.dead) Main.toTitle();
    }
  }

  updateClear() {
    const c = this.clearSeq;
    c.t++;
    const p = this.player;
    if (!c.boss) {
      // walk off to the right
      if (c.t < 100) {
        p.vx = Math.min(p.vx + 0.05, 1.2);
        p.dir = 1;
        p.vy = Math.min(p.vy + PHYS.gravity, PHYS.maxFall);
        const res = tileMove(this, p, { oneWay: true });
        p.onGround = res.onGround;
        p.animT++;
      }
      // tally time bonus
      if (c.t > 90 && c.timeLeft > 0) {
        const take = Math.min(4, c.timeLeft);
        c.timeLeft -= take;
        this.time -= take * 60;
        Run.score += take * SCORE.timeBonusPerSec;
        if (c.t % 4 === 0) AudioSys.coin();
      }
      if (c.t > 150 && c.timeLeft <= 0 && (Input.pressed.start || Input.pressed.jump || c.t > 380)) {
        Main.levelCleared(this, c.secret);
      }
    } else {
      // boss victory: sun seed descends
      if (c.t === 30) AudioSys.star();
      if (c.t > 240 && (Input.pressed.start || Input.pressed.jump || c.t > 460)) {
        Main.levelCleared(this, false);
      }
    }
  }

  demoTick() {
    // attract-mode bot: run right; look ahead for walls, gaps, spikes and
    // enemies and jump with a hold length scaled to the obstacle
    const p = this.player;
    Input.held = { right: true, run: true };
    Input.pressed = {};
    if (this.demoJump > 0) {
      this.demoJump--;
      Input.held.jump = true;
      if (this.demoJump === this.demoJumpPress) Input.pressed.jump = true;
      return;
    }
    if (!p.onGround) return;
    const feetTy = Math.floor((p.y + p.h - 1) / TILE);
    const aheadTx = (d) => Math.floor((p.x + p.w) / TILE) + d;
    const support = (id) => TILE_SOLID.has(id) || id === T.PLATFORM || id === T.CRUMBLE;
    // wall at body height within 2 tiles
    let wall = false;
    for (let d = 1; d <= 2 && !wall; d++) {
      wall = TILE_SOLID.has(this.tileAt(aheadTx(d), feetTy)) ||
             TILE_SOLID.has(this.tileAt(aheadTx(d), feetTy - 1));
    }
    // spikes at or just below foot level within 4 tiles
    let spikes = false;
    for (let d = 1; d <= 4 && !spikes; d++) {
      spikes = this.tileAt(aheadTx(d), feetTy) === T.SPIKES ||
               this.tileAt(aheadTx(d), feetTy + 1) === T.SPIKES;
    }
    // gap: a column ahead with no support within 5 rows below the feet
    const gapAt = (d) => {
      for (let dy = 0; dy <= 5; dy++) if (support(this.tileAt(aheadTx(d), feetTy + dy))) return false;
      return true;
    };
    const gap = gapAt(1) || gapAt(2);
    let enemy = false;
    for (const e of this.entities) {
      if (e.isEnemy && !e.dying && e.active && e.x > p.x && e.x - p.x < 60 &&
          Math.abs((e.y + e.h) - (p.y + p.h)) < 30) { enemy = true; break; }
    }
    if (wall || gap || spikes || enemy) {
      this.demoJump = (gap || spikes) ? 20 : 14;
      this.demoJumpPress = this.demoJump - 1;
    }
  }

  // ---------------- draw ----------------
  draw(ctx) {
    const cam = this.cam.offset();
    const wp = Sprites.worldPal[this.def.world];
    const bg = Sprites.bg[this.def.world];

    // sky
    ctx.drawImage(bg.far, 0, 0);
    // far parallax offset
    const farX = -(cam.x * 0.15) % VIEW_W;
    ctx.drawImage(bg.far, farX, 0);
    if (farX !== 0) ctx.drawImage(bg.far, farX + (farX < 0 ? VIEW_W : -VIEW_W), 0);
    // near layer
    const nearX = -(cam.x * 0.4) % VIEW_W;
    const nearY = VIEW_H - 120 + (cam.y * 0.1);
    ctx.drawImage(bg.near, nearX, nearY);
    ctx.drawImage(bg.near, nearX + (nearX <= 0 ? VIEW_W : -VIEW_W), nearY);

    // tiles
    this.drawTiles(ctx, cam, wp);

    // movers
    for (const m of this.movers) {
      const mx = Math.round(m.px - cam.x), my = Math.round(m.py - cam.y);
      if (mx < -m.w || mx > VIEW_W || my < -16 || my > VIEW_H) continue;
      for (let i = 0; i < m.w; i += TILE) {
        ctx.drawImage(Sprites.tiles[this.def.world].platform, mx + i, my);
      }
    }

    // goal gates
    for (const g of this.room.goals) this.drawGoal(ctx, cam, g);

    // entities
    for (const e of this.entities) {
      if (!e.active || e.carried) continue;
      if (e.x + e.w < cam.x - 24 || e.x > cam.x + VIEW_W + 24) continue;
      e.draw(ctx, cam);
    }

    // boss
    if (this.boss && !this.boss.removed && (this.boss.state !== 'burrow' || this.boss.dying)) {
      this.boss.draw(ctx, cam);
    }

    // player (or death animation)
    if (this.deathSeq) {
      const d = this.deathSeq;
      const img = Sprites.pip[POWER.SMALL].fall;
      drawSprite(ctx, img, d.x, d.y + 20, false, cam, 1, 1);
    } else if (!this.clearSeq || !this.clearSeq.boss || this.clearSeq.t < 999) {
      this.player.draw(ctx, cam);
      if (this.player.carrying) this.player.carrying.draw(ctx, cam);
    }

    // lava
    if (this.lavaDef) this.drawLava(ctx, cam);

    Particles.draw(ctx, cam);

    // darkness
    if (this.dark) this.drawDark(ctx, cam);

    // HUD & overlays
    if (!this.demo) this.drawHUD(ctx);
    if (this.introT > 0) this.drawIntro(ctx);
    if (this.bossBanner > 0) this.drawBossBanner(ctx);
    if (this.clearSeq) this.drawClear(ctx);
    if (this.demo && (Game.frame >> 5) % 2) {
      drawTextC(ctx, 'DEMO - PRESS ENTER', VIEW_W / 2, VIEW_H - 40, '#ffffff', 1, '#00000080');
    }
  }

  drawTiles(ctx, cam, wp) {
    const tiles = Sprites.tiles[this.def.world];
    const x0 = Math.max(0, Math.floor(cam.x / TILE)), x1 = Math.min(this.room.w - 1, Math.ceil((cam.x + VIEW_W) / TILE));
    const y0 = Math.max(0, Math.floor(cam.y / TILE)), y1 = Math.min(this.room.h - 1, Math.ceil((cam.y + VIEW_H) / TILE));
    for (let ty = y0; ty <= y1; ty++) {
      const row = this.room.grid[ty];
      for (let tx = x0; tx <= x1; tx++) {
        const id = row[tx];
        if (id === T.EMPTY) continue;
        let img = null;
        switch (id) {
          case T.GROUND: {
            const above = ty > 0 ? this.room.grid[ty - 1][tx] : T.EMPTY;
            img = (above === T.GROUND || above === T.STONE) ? tiles.groundFill : tiles.groundTop;
            break;
          }
          case T.STONE: img = tiles.stone; break;
          case T.PLATFORM: img = tiles.platform; break;
          case T.BRICK: img = tiles.brick; break;
          case T.QCOIN: img = tiles.qcoin[(Game.frame >> 4) % 2]; break;
          case T.QPOWER: img = tiles.qpower[(Game.frame >> 4) % 2]; break;
          case T.QGLIDER: img = tiles.qglider[(Game.frame >> 4) % 2]; break;
          case T.QMOSS: img = tiles.qmoss[(Game.frame >> 4) % 2]; break;
          case T.QONEUP: img = tiles.qoneup[(Game.frame >> 4) % 2]; break;
          case T.USED: img = tiles.used; break;
          case T.SPIKES: img = tiles.spikes; break;
          case T.CRUMBLE: img = tiles.crumble; break;
          case T.LANTERN: img = tiles.lantern; break;
          case T.BURROW: img = tiles.burrow; break;
          case T.THORN: img = tiles.thorn; break;
          case T.GOAL: case T.GOAL2: continue; // drawn as gates
        }
        if (!img) continue;
        let oy = 0, ox = 0;
        for (const b of this.bumpAnims) {
          if (b.tx === tx && b.ty === ty && b.room === this.roomKey) oy = -Math.sin((10 - b.t) / 10 * Math.PI) * 5;
        }
        const ck = tx + ',' + ty + ',' + this.roomKey;
        if (this.crumbles.has(ck)) ox = Math.sin(Game.frame * 1.4) * 1.5;
        ctx.drawImage(img, tx * TILE - cam.x + ox, ty * TILE - cam.y + oy);
      }
    }
  }

  drawGoal(ctx, cam, g) {
    const gx = g.x * TILE + 8 - cam.x;
    const gy = (g.y + 1) * TILE - cam.y; // base
    const h = 64;
    ctx.fillStyle = g.secret ? '#c8a838' : '#8a5c2e';
    ctx.fillRect(gx - 20, gy - h, 5, h);
    ctx.fillRect(gx + 15, gy - h, 5, h);
    ctx.fillStyle = g.secret ? '#ffd23e' : '#b8865a';
    ctx.fillRect(gx - 20, gy - h, 40, 5);
    // spinning dial
    if (!this.finished) {
      const dial = Math.sin(this.frameT / 14); // -1..1, 0 = top scoring window
      const frame = Math.floor(((dial + 1) / 2) * 7.99);
      ctx.drawImage(Sprites.goalDial[frame], gx - 9, gy - h + 8);
    } else {
      ctx.drawImage(Sprites.goalDial[0], gx - 9, gy - h + 8);
    }
    if (g.secret) {
      drawTextC(ctx, 'SECRET', gx, gy - h - 10, '#ffd23e', 1, '#00000080');
    }
  }

  drawLava(ctx, cam) {
    const ly = Math.round(this.lavaY - cam.y);
    if (ly > VIEW_H) return;
    const grad = ctx.createLinearGradient(0, ly, 0, VIEW_H);
    grad.addColorStop(0, '#ff8a3a');
    grad.addColorStop(0.15, '#e04a1e');
    grad.addColorStop(1, '#8a1a0a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, ly, VIEW_W, VIEW_H - ly);
    ctx.fillStyle = '#ffd275';
    for (let x = 0; x < VIEW_W; x += 12) {
      const bump = Math.sin((x + Game.frame * 2) / 30) * 3;
      ctx.fillRect(x, ly + bump, 8, 3);
    }
  }

  drawDark(ctx, cam) {
    if (!this._darkC) {
      this._darkC = document.createElement('canvas');
      this._darkC.width = VIEW_W; this._darkC.height = VIEW_H;
    }
    const dc = this._darkC.getContext('2d');
    dc.globalCompositeOperation = 'source-over';
    dc.fillStyle = 'rgba(4,6,16,0.94)';
    dc.clearRect(0, 0, VIEW_W, VIEW_H);
    dc.fillRect(0, 0, VIEW_W, VIEW_H);
    dc.globalCompositeOperation = 'destination-out';
    const holes = [];
    const p = this.player;
    const flick = Math.sin(Game.frame / 7) * 3;
    holes.push({ x: p.cx - cam.x, y: p.y + p.h / 2 - cam.y, r: this.dark + flick });
    // lanterns
    const x0 = Math.floor(cam.x / TILE) - 6, x1 = Math.ceil((cam.x + VIEW_W) / TILE) + 6;
    for (let ty = 0; ty < this.room.h; ty++) {
      for (let tx = Math.max(0, x0); tx <= Math.min(this.room.w - 1, x1); tx++) {
        if (this.room.grid[ty][tx] === T.LANTERN) {
          holes.push({ x: tx * TILE + 8 - cam.x, y: ty * TILE + 8 - cam.y, r: 55 + flick });
        }
      }
    }
    for (const h of holes) {
      const g = dc.createRadialGradient(h.x, h.y, h.r * 0.35, h.x, h.y, h.r);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      dc.fillStyle = g;
      dc.beginPath();
      dc.arc(h.x, h.y, h.r, 0, Math.PI * 2);
      dc.fill();
    }
    ctx.drawImage(this._darkC, 0, 0);
  }

  drawHUD(ctx) {
    ctx.fillStyle = '#00000055';
    ctx.fillRect(0, 0, VIEW_W, 22);
    // lives
    ctx.drawImage(Sprites.hud.pipHead, 8, 5);
    drawText(ctx, 'x' + Run.lives, 24, 8, '#ffffff', 1, '#00000080');
    // coins
    ctx.drawImage(Sprites.coin[0], 58, 4);
    drawText(ctx, 'x' + String(Run.coins).padStart(2, '0'), 70, 8, '#ffd23e', 1, '#00000080');
    // score
    drawText(ctx, String(Run.score).padStart(7, '0'), 110, 8, '#ffffff', 1, '#00000080');
    // P-meter chevrons
    const lit = Math.floor((this.player.pspeed / PHYS.pspeedCharge) * 6 + 1e-4);
    for (let i = 0; i < 6; i++) {
      const x = 168 + i * 8, y = 7;
      const flash = this.player.pFull && (Game.frame >> 2) % 2;
      ctx.fillStyle = flash ? '#ffffff' : i < lit ? '#ffd23e' : '#00000060';
      ctx.fillRect(x, y, 2, 8);
      ctx.fillRect(x + 2, y + 1, 2, 6);
      ctx.fillRect(x + 4, y + 2, 2, 4);
      ctx.fillRect(x + 6, y + 3, 1, 2);
    }
    // reserve box
    ctx.drawImage(Sprites.hud.reserveBox, VIEW_W / 2 - 14, 2, 22, 22);
    if (Run.reserve) {
      const spr = { fruit: Sprites.sunFruit, blossom: Sprites.fireBlossom, glider: Sprites.gliderCap }[Run.reserve];
      if (spr) ctx.drawImage(spr, VIEW_W / 2 - spr.width / 2 + 3 - 6, 13 - spr.height / 2);
    }
    // dew stars
    const rec = Save.levelRec(this.def.id);
    for (let i = 0; i < 3; i++) {
      const got = this.starsGot[i] || rec.stars[i];
      ctx.globalAlpha = got ? 1 : 0.3;
      ctx.drawImage(Sprites.dewStar[0], VIEW_W / 2 + 24 + i * 14, 5);
      ctx.globalAlpha = 1;
    }
    // timer
    if (this.time > 0) {
      const secs = Math.ceil(this.time / 60);
      const col = secs <= 50 ? (Game.frame % 30 < 15 ? '#ff5f45' : '#ffffff') : '#ffffff';
      drawTextR(ctx, 'TIME ' + secs, VIEW_W - 8, 8, col, 1, '#00000080');
    }
    // boss health
    if (this.boss && !this.boss.removed) {
      const b = this.boss;
      const bw = 90;
      ctx.fillStyle = '#00000080';
      ctx.fillRect(VIEW_W / 2 - bw / 2 - 2, VIEW_H - 20, bw + 4, 12);
      drawTextC(ctx, this.def.bossName, VIEW_W / 2, VIEW_H - 32, '#ff8a7a', 1, '#00000080');
      for (let i = 0; i < b.maxHp; i++) {
        ctx.fillStyle = i < b.hp ? '#ff5f45' : '#4a3040';
        ctx.fillRect(VIEW_W / 2 - bw / 2 + i * (bw / b.maxHp) + 1, VIEW_H - 18, bw / b.maxHp - 2, 8);
      }
    }
  }

  drawIntro(ctx) {
    const a = Math.min(1, this.introT / 20);
    ctx.fillStyle = `rgba(10,6,4,${a * 0.85})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawTextC(ctx, WORLD_NAMES[this.def.world], VIEW_W / 2, VIEW_H / 2 - 24, '#ffd23e', 1, '#00000080');
    drawTextC(ctx, this.def.id + '  ' + this.def.name, VIEW_W / 2, VIEW_H / 2 - 6, '#ffffff', 2, '#00000080');
    drawTextC(ctx, 'x' + Run.lives, VIEW_W / 2 + 14, VIEW_H / 2 + 22, '#ffffff', 1);
    ctx.drawImage(Sprites.hud.pipHead, VIEW_W / 2 - 12, VIEW_H / 2 + 19);
  }

  drawBossBanner(ctx) {
    if ((this.bossBanner >> 3) % 2) return;
    drawTextC(ctx, this.def.bossName, VIEW_W / 2, 60, '#ff5f45', 2, '#00000080');
  }

  drawClear(ctx) {
    const c = this.clearSeq;
    if (c.t < 30) return;
    ctx.fillStyle = 'rgba(10,6,4,0.55)';
    ctx.fillRect(0, VIEW_H / 2 - 58, VIEW_W, c.boss ? 130 : 100);
    if (!c.boss) {
      drawTextC(ctx, c.secret ? 'SECRET EXIT!' : 'COURSE CLEAR!', VIEW_W / 2, VIEW_H / 2 - 44, c.secret ? '#ffd23e' : '#9ee55c', 2, '#00000080');
      drawTextC(ctx, 'GATE BONUS ' + c.bonus, VIEW_W / 2, VIEW_H / 2 - 14, '#ffffff', 1, '#00000080');
      drawTextC(ctx, 'TIME BONUS ' + (c.timeLeft * SCORE.timeBonusPerSec), VIEW_W / 2, VIEW_H / 2 + 2, '#ffffff', 1, '#00000080');
      let stars = this.starsGot.filter(Boolean).length;
      drawTextC(ctx, 'DEW STARS ' + stars + '/3', VIEW_W / 2, VIEW_H / 2 + 18, '#aef7ff', 1, '#00000080');
      if (c.secret) drawTextC(ctx, 'A SUN SEED! A NEW PATH OPENS...', VIEW_W / 2, VIEW_H / 2 + 34, '#ffd23e', 1, '#00000080');
    } else {
      drawTextC(ctx, 'SUN SEED RECOVERED!', VIEW_W / 2, VIEW_H / 2 - 44, '#ffd23e', 2, '#00000080');
      // seed descends
      const seedY = Math.min(VIEW_H / 2 - 10, -20 + c.t * 1.2);
      ctx.drawImage(Sprites.sunSeed, VIEW_W / 2 - 8, seedY);
      const glow = 8 + Math.sin(c.t / 10) * 3;
      ctx.strokeStyle = '#ffd23e60';
      ctx.beginPath();
      ctx.arc(VIEW_W / 2, seedY + 11, glow + 8, 0, Math.PI * 2);
      ctx.stroke();
      drawTextC(ctx, WORLD_NAMES[this.def.world] + ' IS AT PEACE', VIEW_W / 2, VIEW_H / 2 + 26, '#ffffff', 1, '#00000080');
      if (c.t > 240) drawTextC(ctx, 'PRESS ENTER', VIEW_W / 2, VIEW_H / 2 + 46, (Game.frame >> 4) % 2 ? '#ffffff' : '#ffd23e', 1);
    }
  }
}
