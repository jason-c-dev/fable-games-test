// World: one level session. Owns rooms, entities, combat resolution, camera,
// hit-stop/freeze timing, hazards, respawns and the sim->render event queue.
// Node-safe: no DOM, no PIXI; deterministic given a seed + scripted input.

import { TILE, T, VIEW_W, VIEW_H, COMBAT as C, PHYS as P, SCORE, TILE_ITEMBLOCK } from '../config.js';
import { clamp, lerp, sign, rectsOverlap, makeRng } from '../core/math.js';
import { makeTileView, tx } from './physics.js';
import { Player } from './player.js';
import { Coin, DewStar, Pickup, BlockCoin, Projectile, Dummy } from './entities.js';
import { makeEnemy } from './enemies.js';
import { makeBoss, _bindEnemyFactory } from './bosses.js';
_bindEnemyFactory(makeEnemy);

export class World {
  constructor(parsed, run, opts = {}) {
    this.def = parsed;
    this.levelId = parsed.id;
    this.run = run;
    this.rng = makeRng(opts.seed ?? 20260704);
    this.events = [];
    this.frame = 0;
    this.timeF = 0;

    // deep-copy room grids: the world mutates them (blocks, bricks)
    this.rooms = {};
    for (const [key, room] of Object.entries(parsed.rooms)) {
      this.rooms[key] = { ...room, grid: room.grid.map(r => Uint8Array.from(r)) };
    }
    this.roomKey = 'main';

    // timing effects
    this.hitstop = 0;
    this.parryFreeze = 0;
    this.slowmoT = 0;

    // tile dynamics
    this.crumbleTimers = new Map();   // key -> frames until gone
    this.crumbled = new Map();        // key -> frames until respawn
    this.crystalLit = new Map();      // key -> frames remaining lit
    this.gatesOpen = false;

    // hazards / gimmicks
    this.darkness = parsed.dark ?? 0;
    this.wind = parsed.wind ? { ...parsed.wind, current: parsed.wind.base } : null;
    this.lava = parsed.lava ? { y: parsed.lava.startRow * TILE, speed: parsed.lava.speed, minY: parsed.lava.minRow * TILE, active: true, delay: parsed.lava.delay || 0 } : null;

    // entities per room
    this.entitiesByRoom = {};
    this.checkpointsByRoom = {};
    for (const key of Object.keys(this.rooms)) this.buildRoom(key);

    // player
    const room = this.rooms.main;
    let sx = room.start ? room.start.x : 24;
    let sy = room.start ? room.start.y : 24;
    if (opts.checkpoint && opts.checkpoint.levelId === this.levelId) {
      sx = opts.checkpoint.x; sy = opts.checkpoint.y;
      this.roomKey = opts.checkpoint.room || 'main';
    }
    this.player = new Player(sx, sy, run);
    this.tiles = makeTileView(this);

    // boss
    this.boss = null;
    if (parsed.boss) {
      this.boss = makeBoss(parsed.boss, this);
      if (this.boss) this.entitiesByRoom.main.push(this.boss);
    }

    // camera
    this.camX = sx; this.camY = sy - 40;
    this.pCamX = this.camX; this.pCamY = this.camY;
    this.camLock = null;

    // flow
    this.finishT = 0;
    this.finished = null;         // { secret } once the goal sequence ends
    this.deathT = 0;
    this.gameOver = false;
    this.doorCd = 0;
    this.returnPos = null;
    this.beamSegs = null;

    this.wake();
  }

  get room() { return this.rooms[this.roomKey]; }
  get entities() { return this.entitiesByRoom[this.roomKey]; }
  get movers() { return this.room.moverState; }
  tkey(x, y) { return this.roomKey + ':' + (y * this.room.w + x); }
  get hasUpdrafts() { return this._updrafts ?? (this._updrafts = this.roomHasTile(T.UPDRAFT)); }

  roomHasTile(id) {
    for (const room of Object.values(this.rooms))
      for (const row of room.grid) for (const v of row) if (v === id) return true;
    return false;
  }

  buildRoom(key) {
    const room = this.rooms[key];
    const list = [];
    for (const sp of room.spawns) {
      const e = this.spawnFromDef(sp);
      if (e) { e.room = key; list.push(e); }
    }
    this.entitiesByRoom[key] = list;
    this.checkpointsByRoom[key] = room.checkpoints.map(cp => ({ ...cp, taken: false }));
    // movers: live state
    room.moverState = room.movers.map(m => ({
      ...m, t: this.rng() * Math.PI * 2, cx: m.x, cy: m.y, lastDx: 0, lastDy: 0,
    }));
  }

  spawnFromDef(sp) {
    if (sp.type === 'coin') { const c = new Coin(sp.x, sp.y); c.spawnIndex = this.spawnKey(sp); return this.alreadyTaken(sp) ? null : c; }
    if (sp.type === 'star') {
      if (this.run.hasStar(this.levelId, sp.starIndex)) return null;
      const s = new DewStar(sp.x, sp.y, sp.starIndex); return s;
    }
    if (sp.type === 'dummy') return new Dummy(sp.x, sp.y);
    if (sp.type === 'beampickup') {
      if (this.run.hasBeam) return null;
      const b = new Pickup(sp.x, sp.y - 6, 'beam');
      b.emergeT = 0;
      return b;
    }
    const e = makeEnemy(sp.type, sp.x, sp.y, this);
    return e;
  }

  spawnKey(sp) { return `${sp.type}:${Math.round(sp.x)}:${Math.round(sp.y)}`; }
  alreadyTaken(sp) { return this.takenCoins?.has(this.spawnKey(sp)) || false; }

  // ---------------------------------------------------------------- step --
  // presses that land during hit-stop / parry-freeze are latched and
  // delivered on the first live frame, so freeze frames never eat inputs
  _latchPressed(inp) {
    this._latch ||= {};
    for (const k in inp.pressed) if (inp.pressed[k]) this._latch[k] = true;
  }

  step(inp) {
    this.events.length = Math.min(this.events.length, 400);
    this.frame++;

    if (this.hitstop > 0) { this.hitstop--; this._latchPressed(inp); return; }
    if (this.parryFreeze > 0) {
      this.parryFreeze--;
      this._latchPressed(inp);
      if (this.parryFreeze === 0) this.slowmoT = C.parrySlowmo;
      return;
    }
    if (this.slowmoT > 0) {
      this.slowmoT--;
      if (this.frame % 2 === 0) { this._latchPressed(inp); return; }   // half-rate slow-mo
    }
    if (this._latch) {
      for (const k in this._latch) inp.pressed[k] = true;
      this._latch = null;
    }

    if (this.finished) return;
    if (this.doorCd > 0) this.doorCd--;

    // movers first so riders get fresh deltas
    for (const m of this.movers) {
      m.t += (Math.PI * 2) / m.period;
      const s = (Math.sin(m.t) + 1) / 2;
      const nx = lerp(m.x, m.x2, s), ny = lerp(m.y, m.y2, s);
      m.lastDx = nx - m.cx; m.lastDy = ny - m.cy;
      m.cx = nx; m.cy = ny;
    }
    // physics reads mover position via cx/cy
    for (const m of this.movers) { m.xDraw = m.cx; }

    // gimmick timers
    this.stepTileTimers();
    if (this.wind) {
      const w = this.wind;
      if (this.windOverride && this.windOverride.t > 0) {
        this.windOverride.t--;
        w.current = this.windOverride.vx;
      } else {
        w.current = w.base + (w.gustAmp || 0) * Math.sin(this.frame * Math.PI * 2 / (w.gustPeriod || 400))
          + Math.sin(this.frame * 0.013) * (w.gustAmp || 0) * 0.3;
      }
    }
    if (this.lava && this.lava.active && !this.player.dead) {
      if (this.lava.delay > 0) this.lava.delay--;
      else if (this.lava.y > this.lava.minY) this.lava.y -= this.lava.speed;
    }

    // player
    if (this.deathT > 0) {
      this.deathT--;
      this.player.snapshotCam = true;
      this.player.step(this, { held: {}, pressed: {}, released: {} });
      if (this.deathT === 0) this.respawn();
      this.updateCamera();
      return;
    }
    if (!this.player.dead) this.timeF++;
    this.player.step(this, inp);

    // wake + step entities
    this.wake();
    const list = this.entities;
    this.pending = [];
    for (const e of list) {
      e.snapshot();
      if (e.removed) continue;
      if (e.dying > 0) { e.stepDying(this); continue; }
      if (!e.active) continue;
      e.step(this);
      if (e.hitT > 0) e.hitT--;
    }
    // sweep removed, append spawned
    this.entitiesByRoom[this.roomKey] = list.filter(e => !e.removed).concat(this.pending);
    this.pending = null;

    this.resolveCombat(inp);
    this.stepBeam();
    this.checkInteractions(inp);
    this.updateCamera();

    if (this.player.dead && this.deathT === 0) {
      this.deathT = 50;
    }
  }

  wake() {
    for (const e of this.entities) {
      if (!e.active && Math.abs(e.x - this.camX) < VIEW_W / 2 + 96 && Math.abs(e.y - this.camY) < VIEW_H / 2 + 128) {
        e.active = true;
      }
    }
  }

  spawn(e) {
    e.active = true;
    e.room = this.roomKey;
    (this.pending || this.entities).push(e);
    return e;
  }
  spawnItem(kind, x, y) { return this.spawn(new Pickup(x, y, kind)); }
  spawnProjectile(x, y, vx, vy, opts) { return this.spawn(new Projectile(x, y, vx, vy, opts)); }

  // ---------------------------------------------------------- tile timers --
  stepTileTimers() {
    for (const [key, v] of this.crumbleTimers) {
      if (v.t <= 1) {
        this.crumbleTimers.delete(key);
        this.crumbled.set(key, { t: 240, x: v.x, y: v.y });
        this.events.push({ t: 'crumblego', x: v.x * TILE + 8, y: v.y * TILE + 8 });
      } else v.t--;
    }
    for (const [key, v] of this.crumbled) {
      if (v.t <= 1) this.crumbled.delete(key);
      else v.t--;
    }
    // crystals
    for (const [key, v] of this.crystalLit) {
      if (v.t <= 1) this.crystalLit.delete(key);
      else v.t--;
    }
    const crystals = this.room.crystals || [];
    const wasOpen = this.gatesOpen;
    this.gatesOpen = crystals.length > 0 && crystals.every(c => this.crystalLit.has(this.tkey(c.x, c.y)));
    if (this.gatesOpen !== wasOpen) {
      this.events.push({ t: this.gatesOpen ? 'gateopen' : 'gateclose', x: this.player.x, y: this.player.y });
    }
  }

  touchCrumble(cx, cy) {
    const key = this.tkey(cx, cy);
    if (!this.crumbleTimers.has(key) && !this.crumbled.has(key)) {
      this.crumbleTimers.set(key, { t: 20, x: cx, y: cy });
      this.events.push({ t: 'crumble', x: cx * TILE + 8, y: cy * TILE + 8 });
    }
  }

  lightCrystal(cx, cy) {
    const key = this.tkey(cx, cy);
    if (!this.crystalLit.has(key)) {
      this.events.push({ t: 'crystal', x: cx * TILE + 8, y: cy * TILE + 8 });
    }
    this.crystalLit.set(key, { t: 240, x: cx, y: cy });
  }

  // -------------------------------------------------------------- blocks --
  bumpBlock(b, byPlayer) {
    const room = this.room;
    const id = room.grid[b.y][b.x];
    if (id === T.BRICK) {
      room.grid[b.y][b.x] = T.EMPTY;
      this.run.addScore(SCORE.brick);
      this.events.push({ t: 'brickbreak', x: b.x * TILE + 8, y: b.y * TILE + 8 });
    } else if (TILE_ITEMBLOCK.has(id)) {
      room.grid[b.y][b.x] = T.USED;
      const px = b.x * TILE + 8, py = b.y * TILE;
      this.events.push({ t: 'blockbump', x: px, y: py + 8 });
      if (id === T.QCOIN) { this.spawn(new BlockCoin(px, py)); this.run.addCoin(); this.run.addScore(SCORE.coin); }
      if (id === T.QFRUIT) this.spawnItem('fruit', px, py - 2);
      if (id === T.QGLIDER) this.spawnItem('glider', px, py - 2);
      if (id === T.QCLOVER) this.spawnItem('clover', px, py - 2);
      if (id === T.QMOSS) { const m = makeEnemy('moss', px, py - 4, this); if (m) this.spawn(m); }
    } else return;
    // pop enemies standing on the bumped tile
    for (const e of this.entities) {
      if (!e.isEnemy || e.dying) continue;
      if (Math.abs(e.y - b.y * TILE) < 4 && e.x > b.x * TILE - 6 && e.x < b.x * TILE + TILE + 6) {
        e.hurt(this, 1, { kind: 'bump', dx: sign(e.x - (b.x * TILE + 8)), kb: 2 });
      }
    }
  }

  plungeLand(player) {
    const y = tx(player.y + 1);
    for (const dx of [-1, 1]) {
      const x = tx(player.x + dx * 4);
      if (this.room.grid[y]?.[x] === T.BRICK) {
        this.room.grid[y][x] = T.EMPTY;
        this.run.addScore(SCORE.brick);
        this.events.push({ t: 'brickbreak', x: x * TILE + 8, y: y * TILE + 8 });
      }
    }
    // shock nearby grounded enemies
    for (const e of this.entities) {
      if (e.isEnemy && !e.dying && Math.abs(e.x - player.x) < 26 && Math.abs(e.y - player.y) < 14) {
        e.hurt(this, C.plungeDmg, { kind: 'shock', dx: sign(e.x - player.x), kb: 2.2 });
      }
    }
    this.shake(2);
  }

  // -------------------------------------------------------------- combat --
  resolveCombat(inp) {
    const p = this.player;
    if (p.dead) return;
    const hb = p.attackHitbox();

    if (hb) {
      if (p.atk && !p.atk.hitSet) p.atk.hitSet = new Set();
      const hitSet = p.atk ? p.atk.hitSet : null;
      for (const e of this.entities) {
        if (!e.isEnemy || e.dying || e.removed || !e.active) continue;
        if (hitSet && hitSet.has(e.id)) continue;
        if (!rectsOverlap(hb, e.hitbox)) continue;
        if (hb.pogo) {
          if (e.pogoable) {
            e.hurt(this, hb.dmg, { kind: 'pogo', dx: 0 });
            this.run.addSap(C.sapPerHit);
            p.pogo(this, 'enemy');
            this.hitstop = C.hitstopLight;
            break;
          }
          continue;
        }
        const result = e.onSword ? e.onSword(this, hb, p) : 'hit';
        if (result === 'blocked') {
          if (hitSet) hitSet.add(e.id);
          this.hitstop = C.hitstopLight;
          this.events.push({ t: 'clang', x: e.x, y: e.y - e.h / 2 });
          continue;
        }
        if (result === 'parried') {
          if (hitSet) hitSet.add(e.id);
          continue;
        }
        if (!e.swordable) continue;
        if (hitSet) hitSet.add(e.id);
        e.hurt(this, hb.dmg, { kind: hb.kind, dx: sign(e.x - p.x) || p.facing, kb: hb.kb, launch: hb.launch });
        this.run.addSap(C.sapPerHit);
        this.run.addScore(SCORE.enemySword);
        this.hitstop = (hb.kind === 'spin' || hb.ender) ? C.hitstopHeavy : C.hitstopLight;
        this.events.push({ t: 'slashhit', x: (p.x + e.x) / 2, y: e.y - e.h / 2, heavy: hb.ender || hb.kind === 'spin' });
        // Bloomfang shockwave on the combo ender
        if (hb.ender && this.run.upgrades.bladeart && !p.atk.bloomed) {
          p.atk.bloomed = true;
          this.events.push({ t: 'bloomfang', x: p.x + p.facing * 18, y: p.y - 10 });
          for (const e2 of this.entities) {
            if (e2.isEnemy && !e2.dying && e2 !== e && Math.abs(e2.x - p.x) < 52 && Math.abs(e2.y - p.y) < 30) {
              e2.hurt(this, 1, { kind: 'bloomfang', dx: sign(e2.x - p.x), kb: 3 });
            }
          }
        }
      }
      // deflect projectiles with any active swing
      if (!hb.pogo) {
        const dhb = { x: hb.x - 4, y: hb.y - 4, w: hb.w + 8, h: hb.h + 8 };
        for (const e of this.entities) {
          if (e.isProjectile && !e.friendly && e.deflectable && rectsOverlap(dhb, e.hitbox)) {
            e.deflect(this, p.facing);
          }
        }
      }
    }

    // enemy / projectile contact with the player
    for (const e of this.entities) {
      if (e.removed || e.dying || !e.active) continue;

      if (e.isProjectile && !e.friendly) {
        if (rectsOverlap(e.hitbox, p.hitbox)) {
          if (p.parryActive && e.parryable) {
            this.parrySuccess(e, e.owner);
            e.parryReflect(this, e.owner && !e.owner.removed ? e.owner : null);
          } else if (p.vulnerable && p.state !== 'hurt') {
            e.removed = true;
            this.damagePlayer(e.dmg, e.x);
          }
        }
        continue;
      }

      // dedicated melee attack hitboxes (duelist lunge, boss swings): always parryable
      if (e.isEnemy && e.attackHitbox) {
        const ahb = e.attackHitbox();
        if (ahb && rectsOverlap(ahb, p.hitbox)) {
          if (p.parryActive) {
            this.parrySuccess(e, e);
            continue;
          } else if (p.vulnerable) {
            this.damagePlayer(ahb.dmg || 1, e.x);
            continue;
          }
        }
      }

      if (!e.isEnemy || !e.harmful) continue;
      if (!rectsOverlap(e.hitbox, p.hitbox)) continue;

      // stomp?
      const feet = p.y, eTop = e.y - e.h;
      if (p.vy > 0.5 && feet - eTop < 9 && e.stompable) {
        e.stomped ? e.stomped(this, p) : e.hurt(this, 2, { kind: 'stomp' });
        p.vy = -(p.jumpHeld ? P.stompBounceHeld : P.stompBounce);
        p.refreshAirDash(this, 'stomp');
        const chain = Math.min(p.stompChain, SCORE.stompChain.length - 1);
        this.run.addScore(SCORE.stompChain[chain]);
        if (p.stompChain >= SCORE.stompChain.length) { this.run.lives++; this.events.push({ t: 'oneup', x: p.x, y: p.y - 20 }); }
        p.stompChain++;
        this.events.push({ t: 'stomp', x: e.x, y: eTop, chain: p.stompChain });
        continue;
      }
      if (p.parryActive && e.parryable) {
        this.parrySuccess(e, e);
        continue;
      }
      if (e.dashThrough && p.state === 'dash') continue;   // dash-through pattern
      if (p.vulnerable) this.damagePlayer(e.contactDmg || 1, e.x);
    }
  }

  parrySuccess(hitSource, attacker) {
    const p = this.player;
    p.parryT = 0;
    p.parryLag = 0;
    p.parryPose = 24;
    p.refreshAirDash(this, 'parry');
    this.parryFreeze = C.parryFreezeFrames;
    this.hitstop = C.hitstopParry;
    this.run.addSap(C.sapPerParry);
    this.run.addScore(SCORE.parry);
    if (attacker && attacker.staggered) attacker.staggered(this, C.parryStagger);
    this.events.push({ t: 'parry', x: p.x + p.facing * 10, y: p.y - p.h / 2 });
    this.shake(3);
  }

  damagePlayer(dmg, srcX) {
    const p = this.player;
    if (!p.vulnerable) return;
    if (p.riding) {
      // Moss absorbs one hit and bolts
      p.riding.absorbHit(this);
      p.riding = null;
      p.invuln = C.invulnFrames;
      return;
    }
    if (p.state === 'heal') {  // interrupted mid-channel: refund half
      this.run.sap = Math.min(C.sapMax, this.run.sap + C.healCost / 2);
      p.healT = 0;
    }
    this.run.hearts -= dmg;
    p.invuln = C.invulnFrames;
    p.state = 'hurt'; p.stateT = 0;
    p.atk = null; p.cancelBeam(); p.chargeT = 0; p.charged = false;
    p.vx = sign(p.x - srcX) * 2.2 || -p.facing * 2.2;
    p.vy = -2.4;
    p.carry = null;
    this.events.push({ t: 'hurt', x: p.x, y: p.y - p.h / 2, hearts: this.run.hearts });
    this.shake(3);
    if (this.run.hearts <= 0) this.killPlayer();
  }

  hazardHurt(player, hazard) {
    if (!player.vulnerable) return;
    this.run.hearts -= 1;
    this.events.push({ t: 'hazard', x: player.x, y: player.y, kind: hazard?.id });
    if (this.run.hearts <= 0) { this.killPlayer(); return; }
    // reposition to last safe ground (kept above the thorn tide if present)
    let { x, y } = player.lastSafe;
    if (this.lava && y > this.lava.y - 12) {
      const cp = this.activeCheckpoint();
      x = cp.x; y = cp.y;
    }
    player.x = x; player.y = y; player.px = x; player.py = y;
    player.vx = 0; player.vy = 0;
    player.state = 'normal'; player.stateT = 0;
    player.exitPlunge?.();
    player.invuln = C.invulnFrames;
    this.shake(4);
    this.events.push({ t: 'safereturn', x, y });
  }

  pitFall(player) {
    if (player.dead) return;
    this.hazardHurt(player, { id: 'pit' });
  }

  killPlayer() {
    const p = this.player;
    if (p.dead) return;
    p.state = 'dead'; p.stateT = 0;
    p.vx = 0; p.vy = -4.6;
    p.carry = null; p.riding = null;
    this.events.push({ t: 'die', x: p.x, y: p.y });
    this.deathT = 50;
  }

  activeCheckpoint() {
    const cps = this.checkpointsByRoom.main;
    const taken = cps.filter(c => c.taken);
    if (this.run.checkpoint && this.run.checkpoint.levelId === this.levelId) return this.run.checkpoint;
    if (taken.length) return taken[taken.length - 1];
    return this.rooms.main.start || { x: 24, y: 24 };
  }

  respawn() {
    this.run.lives--;
    if (this.run.lives <= 0) { this.gameOver = true; return; }
    const cp = this.activeCheckpoint();
    this.roomKey = 'main';
    const p = this.player;
    p.x = cp.x; p.y = cp.y; p.px = cp.x; p.py = cp.y;
    p.vx = 0; p.vy = 0;
    p.state = 'normal'; p.stateT = 0;
    p.invuln = 60;
    p.airDashUsed = false;
    this.run.refill();
    this.run.sap = Math.max(0, this.run.sap - 20);
    // enemies respawn; collected items stay collected
    for (const key of Object.keys(this.rooms)) this.buildRoom(key);
    if (this.def.boss) {
      this.boss = makeBoss(this.def.boss, this);
      if (this.boss) this.entitiesByRoom.main.push(this.boss);
    }
    if (this.lava) this.lava.y = this.def.lava.startRow * TILE;
    this.camX = cp.x; this.camY = cp.y - 40;
    this.events.push({ t: 'respawn', x: cp.x, y: cp.y });
    this.wake();
  }

  bloomBurst(player) {
    this.events.push({ t: 'burst', x: player.x, y: player.y - player.h / 2 });
    this.hitstop = C.hitstopHeavy;
    this.shake(5);
    for (const e of this.entities) {
      if (e.isProjectile && !e.friendly) { e.removed = true; continue; }
      if (e.isEnemy && !e.dying) {
        const d = Math.hypot(e.x - player.x, e.y - player.y);
        if (d < C.burstRadius) {
          e.hurt(this, C.burstDmg, { kind: 'burst', dx: sign(e.x - player.x), kb: 3.5 });
        }
      }
    }
  }

  // ------------------------------------------------------- carry / throw --
  tryPickup(player) {
    for (const e of this.entities) {
      if (e.carryable && e.stunned && !e.carried && !e.removed) {
        const box = { x: player.x - player.w / 2 - 8, y: player.y - player.h - 4, w: player.w + 16, h: player.h + 8 };
        if (rectsOverlap(box, e.hitbox)) {
          player.carry = e;
          e.carried = true;
          this.events.push({ t: 'pickup', x: e.x, y: e.y });
          return true;
        }
      }
    }
    return false;
  }

  throwCarry(player, gentle) {
    const e = player.carry;
    if (!e) return;
    player.carry = null;
    e.carried = false;
    e.x = player.x + player.facing * 10;
    e.y = player.y - 6;
    if (gentle) {
      e.vx = player.facing * 0.5; e.vy = 0;
    } else {
      e.vx = player.facing * P.throwVx + player.vx * 0.5;
      e.vy = -P.throwVy;
      e.thrownBy = 'player';
      e.sliding = true;
      e.stunned = false;
    }
    this.events.push({ t: 'throw', x: player.x, y: player.y - 10, gentle });
  }

  // ---------------------------------------------------------------- beam --
  stepBeam() {
    const p = this.player;
    this.beamSegs = null;
    if (p.beamFire <= 0) return;
    const segs = [];
    let x = p.x + p.facing * 6, y = p.y - p.h * 0.55;
    const aimed = Math.abs(p.beamAim) > 0.12;
    let dx, dy;
    if (aimed) { dx = Math.cos(p.beamAim) * p.facing; dy = Math.sin(p.beamAim); }
    else { dx = p.facing; dy = 0; }
    let sx = x, sy = y;
    let travel = 0, bounces = 0;
    const stepLen = 3;
    const hitEnemies = new Set();
    while (travel < C.beamRange && bounces <= C.beamMaxBounces) {
      x += dx * stepLen; y += dy * stepLen;
      travel += stepLen;
      const cx = tx(x), cy = tx(y);
      const id = this.tiles.id(cx, cy);
      if (id === T.MIRROR_A || id === T.MIRROR_B) {
        if (aimed) { break; }
        // reflect 90°: '/' or '\'
        segs.push({ x1: sx, y1: sy, x2: cx * TILE + 8, y2: cy * TILE + 8 });
        const nd = id === T.MIRROR_A ? [-dy, -dx] : [dy, dx];
        dx = nd[0]; dy = nd[1];
        sx = cx * TILE + 8; sy = cy * TILE + 8;
        x = sx + dx * 9; y = sy + dy * 9;   // step clear of the mirror cell
        bounces++;
        continue;
      }
      if (id === T.CRYSTAL) { this.lightCrystal(cx, cy); break; }
      if (this.tiles.solid(cx, cy)) break;
      // enemies along the beam
      for (const e of this.entities) {
        if (!e.isEnemy || e.dying || e.removed || hitEnemies.has(e.id)) continue;
        const hb = e.hitbox;
        if (x >= hb.x - 2 && x <= hb.x + hb.w + 2 && y >= hb.y - 2 && y <= hb.y + hb.h + 2) {
          hitEnemies.add(e.id);
          if (e.onBeam) e.onBeam(this);
          e.beamAcc = (e.beamAcc || 0) + C.beamDps;
          if (e.beamAcc >= 1) {
            e.beamAcc -= 1;
            e.hurt(this, 1, { kind: 'beam', dx: dx * 0.5, kb: 0.6 });
          }
        }
      }
    }
    segs.push({ x1: sx, y1: sy, x2: x, y2: y });
    this.beamSegs = segs;
  }

  // -------------------------------------------------------- interactions --
  checkInteractions(inp) {
    const p = this.player;
    if (p.dead || this.finished || this.finishT > 0) { this.stepFinish(); return; }
    const room = this.room;
    const pcx = tx(p.x), pcy = tx(p.y - p.h / 2);

    // goal gates
    for (const g of room.goals || []) {
      if (Math.abs(pcx - g.x) <= 0 && Math.abs(pcy - g.y) <= 1) {
        this.finishT = 100;
        this.finishSecret = g.secret;
        p.state = 'goal'; p.stateT = 0; p.vx = 0.5; p.vy = Math.min(p.vy, 0);
        p.cancelBeam();
        this.events.push({ t: 'goal', x: g.x * TILE + 8, y: g.y * TILE + 8, secret: g.secret });
        return;
      }
    }

    // checkpoints
    for (const cp of this.checkpointsByRoom[this.roomKey]) {
      if (!cp.taken && Math.abs(p.x - cp.x) < 14 && Math.abs(p.y - cp.y) < 24) {
        cp.taken = true;
        this.run.checkpoint = { levelId: this.levelId, x: cp.x, y: cp.y - 2, room: this.roomKey };
        this.run.refill();
        this.events.push({ t: 'checkpoint', x: cp.x, y: cp.y - 12 });
      }
    }

    // doors
    if ((inp.pressed.down || inp.pressed.up) && this.doorCd <= 0 && p.onGround) {
      for (const d of room.doors || []) {
        if (Math.abs(pcx - d.x) <= 0 && Math.abs(pcy - d.y) <= 1) {
          this.useDoor(d);
          return;
        }
      }
    }

    // thorn tide contact
    if (this.lava && p.y > this.lava.y + 2 && p.vulnerable) {
      this.hazardHurt(p, { id: T.THORN });
    }
  }

  useDoor(d) {
    const other = this.roomKey === 'main' ? 'bonus' : 'main';
    if (!this.rooms[other]) return;
    this.doorCd = 30;
    const p = this.player;
    this.events.push({ t: 'door', x: p.x, y: p.y });
    if (this.roomKey === 'main') {
      this.returnPos = { x: p.x, y: p.y };
      const dd = this.rooms.bonus.doors[0];
      this.roomKey = 'bonus';
      p.x = dd ? dd.x * TILE + 8 : 24; p.y = dd ? dd.y * TILE + TILE : 24;
    } else {
      this.roomKey = 'main';
      if (this.returnPos) { p.x = this.returnPos.x; p.y = this.returnPos.y; }
    }
    p.px = p.x; p.py = p.y; p.vx = 0; p.vy = 0;
    this._updrafts = undefined;
    this.camX = p.x; this.camY = p.y - 40;
    this.pCamX = this.camX; this.pCamY = this.camY;
    this.wake();
  }

  stepFinish() {
    const p = this.player;
    if (this.finishT > 0) {
      this.finishT--;
      p.vx = 0.5;
      if (this.finishT === 0) {
        this.finished = { secret: this.finishSecret || false };
        const prev = this.run.bestTimes[this.levelId];
        if (!prev || this.timeF < prev) this.run.bestTimes[this.levelId] = this.timeF;
      }
    }
  }

  bossDefeated() {
    this.run.addScore(SCORE.bossClear);
    this.events.push({ t: 'bossdead', x: this.boss ? this.boss.x : this.player.x, y: this.boss ? this.boss.y : this.player.y });
    this.finishT = 160;
    this.finishSecret = false;
  }

  // -------------------------------------------------------------- camera --
  shake(n) { this.events.push({ t: 'shake', power: n, x: this.camX, y: this.camY }); }

  updateCamera() {
    this.pCamX = this.camX; this.pCamY = this.camY;
    const p = this.player;
    const room = this.room;
    let txx = p.x + p.facing * 22 + p.vx * 5;
    let tyy = p.y - 30 + (p.vy > 2 ? p.vy * 6 : 0);
    this.camX = lerp(this.camX, txx, 0.10);
    this.camY = lerp(this.camY, tyy, 0.12);
    const roomW = room.w * TILE, roomH = room.h * TILE;
    let minX = VIEW_W / 2, maxX = roomW - VIEW_W / 2;
    if (this.camLock) { minX = Math.max(minX, this.camLock.x0); maxX = Math.min(maxX, this.camLock.x1); }
    this.camX = roomW < VIEW_W ? roomW / 2 : clamp(this.camX, minX, maxX);
    this.camY = roomH < VIEW_H ? roomH / 2 : clamp(this.camY, VIEW_H / 2, roomH - VIEW_H / 2);
  }
}
