// Room tile rendering: one sprite per visible tile (they batch), autotiled
// ground lips, animated water overlay, dynamic tiles (blocks, bricks,
// crumble, gates, crystals) tracked by key so sim mutations show instantly.

import { Container, Sprite, Graphics, TilingSprite } from 'pixi.js';
import { TILE, T } from '../config.js';
import { TEX, PAL } from './gfx.js';
import { makeRng } from '../core/math.js';

export class TileMapView {
  constructor(worldIdx) {
    this.c = new Container();
    this.waterC = new Container();     // drawn above entities, translucent
    this.worldIdx = worldIdx;
    this.sprites = new Map();          // key -> sprite
    this.waterCells = [];
    this.crystals = [];                // {x,y,sprite}
    this.gates = [];
    this.movers = [];
    this.room = null;
    this.bumpAnim = new Map();         // key -> frames
  }

  key(x, y) { return y * 10000 + x; }

  build(world) {
    const room = world.room;
    this.room = room;
    this.c.removeChildren();
    this.waterC.removeChildren();
    this.sprites.clear();
    this.waterCells = [];
    this.crystals = [];
    this.gates = [];
    this.movers = [];
    const tx = TEX.world[this.worldIdx];
    const g = room.grid;

    for (let y = 0; y < room.h; y++) {
      for (let x = 0; x < room.w; x++) {
        const id = g[y][x];
        if (id === T.EMPTY) continue;
        if (id === T.WATER) {
          // top surface cell?
          const above = y > 0 ? g[y - 1][x] : T.EMPTY;
          this.waterCells.push({ x, y, surface: above !== T.WATER });
          continue;
        }
        const spr = this.tileSprite(id, x, y, g);
        if (!spr) continue;
        spr.position.set(x * TILE, y * TILE);
        this.c.addChild(spr);
        this.sprites.set(this.key(x, y), spr);
        if (id === T.CRYSTAL) this.crystals.push({ x, y, spr });
        if (id === T.GATE) this.gates.push({ x, y, spr });
      }
    }

    // water: one Graphics per contiguous body would be ideal; simple: one
    // translucent overlay per cell + brighter surface band on top cells.
    const p = PAL[this.worldIdx];
    this.waterG = new Graphics();
    this.waterC.addChild(this.waterG);

    // movers
    for (const m of world.movers) {
      const mv = new Container();
      const body = new Sprite(TEX.world[this.worldIdx].platform);
      body.width = m.w; body.height = 8;
      mv.addChild(body);
      const under = new Sprite(TEX.world[this.worldIdx].groundInner);
      under.width = m.w - 4; under.height = 3; under.x = 2; under.y = 5;
      under.alpha = 0.6;
      mv.addChild(under);
      this.c.addChild(mv);
      this.movers.push({ m, view: mv });
    }
  }

  tileSprite(id, x, y, g) {
    const tx = TEX.world[this.worldIdx];
    const above = y > 0 ? g[y - 1][x] : T.EMPTY;
    let t = null, w = TILE, h = TILE;
    switch (id) {
      case T.GROUND: t = (above === T.GROUND || above === T.STONE) ? tx.groundInner : tx.groundTop; break;
      case T.STONE: t = tx.stone; break;
      case T.BRICK: t = tx.brick; break;
      case T.PLATFORM: t = tx.platform; h = 8; break;
      case T.QCOIN: t = tx.qcoin; break;
      case T.QFRUIT: t = tx.qfruit; break;
      case T.QGLIDER: t = tx.qglider; break;
      case T.QMOSS: t = tx.qmoss; break;
      case T.QCLOVER: t = tx.qclover; break;
      case T.USED: t = tx.used; break;
      case T.SPIKES: t = tx.spikes; break;
      case T.CRUMBLE: t = tx.crumble; break;
      case T.LANTERN: t = tx.lantern; break;
      case T.DOOR: t = tx.door; break;
      case T.GOAL: { const s = new Sprite(tx.goal); s.width = TILE; s.height = 32; s.pivot.y = 16 * 6; return s; }
      case T.GOAL2: { const s = new Sprite(tx.goal2); s.width = TILE; s.height = 32; s.pivot.y = 16 * 6; return s; }
      case T.THORN: t = tx.thorn; break;
      case T.MIRROR_A: t = tx.mirrorA; break;
      case T.MIRROR_B: t = tx.mirrorB; break;
      case T.CRYSTAL: t = tx.crystal; break;
      case T.GATE: t = tx.gate; break;
      case T.UPDRAFT: t = tx.updraft; break;
      case T.SPRING: t = tx.spring; break;
      default: return null;
    }
    if (!t) return null;
    const s = new Sprite(t);
    s.width = w; s.height = h;
    return s;
  }

  bump(x, y) { this.bumpAnim.set(this.key(x, y), 8); }

  // called each render frame; syncs dynamic tile state from the sim
  update(world, frame) {
    const room = world.room;
    if (room !== this.room) this.build(world);
    const g = room.grid;
    const tx = TEX.world[this.worldIdx];

    // dynamic sprite sync (bumped blocks, broken bricks)
    for (const [key, spr] of this.sprites) {
      const x = key % 10000, y = (key / 10000) | 0;
      const id = g[y][x];
      if (id === T.EMPTY) { spr.visible = false; continue; }
      if (id === T.USED && spr.texture !== tx.used) spr.texture = tx.used;
      if (id === T.CRUMBLE) {
        const ck = world.tkey(x, y);
        const gone = world.crumbled.has(ck);
        const shaking = world.crumbleTimers.has(ck);
        spr.visible = !gone;
        spr.x = x * TILE + (shaking ? Math.sin(frame * 1.4) * 0.8 : 0);
        const t = world.crumbled.get(ck);
        if (t && t.t < 40) { spr.visible = true; spr.alpha = ((40 - t.t) / 40) * 0.6; }
        else spr.alpha = 1;
      }
      const b = this.bumpAnim.get(key);
      if (b !== undefined) {
        spr.y = y * TILE - Math.sin((8 - b) / 8 * Math.PI) * 5;
        if (b <= 0) { this.bumpAnim.delete(key); spr.y = y * TILE; }
        else this.bumpAnim.set(key, b - 1);
      }
    }
    // crystals lit state
    for (const cr of this.crystals) {
      const lit = world.crystalLit.has(world.tkey(cr.x, cr.y));
      const want = lit ? tx.crystalLit : tx.crystal;
      if (cr.spr.texture !== want) cr.spr.texture = want;
      cr.spr.alpha = lit ? 0.92 + Math.sin(frame * 0.3) * 0.08 : 1;
    }
    // gates
    for (const gt of this.gates) {
      const open = world.gatesOpen;
      gt.spr.alpha = open ? Math.max(0.12, gt.spr.alpha - 0.06) : Math.min(1, gt.spr.alpha + 0.06);
      gt.spr.x = gt.x * TILE + (open ? 0 : 0);
    }
    // movers
    for (const { m, view } of this.movers) {
      view.position.set(m.cx, m.cy);
    }

    // water redraw (cheap: only visible band)
    const p = PAL[this.worldIdx];
    const wg = this.waterG;
    wg.clear();
    if (this.waterCells.length) {
      const camX = world.camX, camY = world.camY;
      for (const wc of this.waterCells) {
        const wx = wc.x * TILE, wy = wc.y * TILE;
        if (Math.abs(wx - camX) > 300 || Math.abs(wy - camY) > 200) continue;
        if (wc.surface) {
          const off = Math.sin(frame * 0.06 + wc.x * 0.9) * 1.4;
          wg.rect(wx, wy + 3 + off * 0.4, TILE, TILE - 3 - off * 0.4).fill({ color: p.water, alpha: 0.42 });
          wg.rect(wx, wy + 2 + off * 0.4, TILE, 1.4).fill({ color: 0xffffff, alpha: 0.5 });
        } else {
          wg.rect(wx, wy, TILE, TILE).fill({ color: p.water, alpha: 0.42 });
        }
      }
    }
  }
}
