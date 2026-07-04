// Tile collision. Entities are AABBs (x = center, y = feet). Movement is
// resolved per-axis against the room grid plus dynamic movers. Node-safe.

import { TILE, T, TILE_SOLID, TILE_BUMPABLE, TILE_DEADLY } from '../config.js';

export const tx = (px) => Math.floor(px / TILE);

export function makeTileView(world) {
  return {
    get w() { return world.room.w; },
    get h() { return world.room.h; },
    id(x, y) {
      const room = world.room;
      if (x < 0 || x >= room.w) return T.STONE;         // side walls
      if (y < 0) return T.EMPTY;                        // open sky
      if (y >= room.h) return T.EMPTY;                  // pit
      const id = room.grid[y][x];
      if (id === T.CRUMBLE && world.crumbled.has(world.tkey(x, y))) return T.EMPTY;
      if (id === T.GATE && world.gatesOpen) return T.EMPTY;
      return id;
    },
    solid(x, y) { return TILE_SOLID.has(this.id(x, y)); },
    deadly(x, y) { return TILE_DEADLY.has(this.id(x, y)); },
    water(x, y) { return this.id(x, y) === T.WATER; },
  };
}

export function aabb(e) {
  return { x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h };
}

// Move an entity by (dx, dy) against tiles + movers.
// Returns flags { ground, ceil, wallL, wallR, bumpTiles, hazard, platform }.
// opts: { dropThrough (ignore one-way), ghost (ignore all solids) }
export function moveEntity(world, e, dx, dy, opts = {}) {
  const tv = world.tiles;
  const res = { ground: false, ceil: false, wallL: false, wallR: false, bumpTiles: [], hazard: null, mover: null };
  const half = e.w / 2;

  const solidAt = (x, y) => tv.solid(x, y);

  // ---- horizontal ----
  if (dx !== 0 && !opts.ghost) {
    e.x += dx;
    const dir = dx > 0 ? 1 : -1;
    const edge = e.x + dir * half;
    const xEdge = tx(edge - (dir > 0 ? 0.001 : -0.001));
    const y0 = tx(e.y - e.h + 0.001), y1 = tx(e.y - 0.001);
    for (let yy = y0; yy <= y1; yy++) {
      if (solidAt(xEdge, yy)) {
        e.x = dir > 0 ? xEdge * TILE - half : (xEdge + 1) * TILE + half;
        if (dir > 0) res.wallR = true; else res.wallL = true;
        break;
      }
    }
  } else if (dx !== 0) {
    e.x += dx;
  }

  // ---- vertical ----
  const prevFeet = e.y;
  if (dy !== 0 && !opts.ghost) {
    e.y += dy;
    const x0 = tx(e.x - half + 0.001), x1 = tx(e.x + half - 0.001);
    if (dy > 0) {
      const yEdge = tx(e.y - 0.001);
      let landed = false;
      for (let xx = x0; xx <= x1 && !landed; xx++) {
        const id = tv.id(xx, yEdge);
        const top = yEdge * TILE;
        if (TILE_SOLID.has(id)) {
          e.y = top; res.ground = true; landed = true;
        } else if ((id === T.PLATFORM || id === T.CRUMBLE) && !opts.dropThrough) {
          // one-way: only if feet were at/above the surface before the move
          if (prevFeet <= top + 0.01) { e.y = top; res.ground = true; res.platform = id === T.PLATFORM; landed = true;
            if (id === T.CRUMBLE) res.crumble = { x: xx, y: yEdge }; }
        } else if (id === T.CRUMBLE && opts.dropThrough) {
          // crumble is solid enough to land on even when dropping
        }
      }
    } else {
      const yEdge = tx(e.y - e.h + 0.001);
      for (let xx = x0; xx <= x1; xx++) {
        const id = tv.id(xx, yEdge);
        if (TILE_SOLID.has(id)) {
          e.y = (yEdge + 1) * TILE + e.h;
          res.ceil = true;
          if (TILE_BUMPABLE.has(id)) res.bumpTiles.push({ x: xx, y: yEdge, id });
          break;
        }
      }
    }
  }

  // ---- movers (ride on top, push horizontally) ----
  for (const m of world.movers) {
    const mx = m.cx ?? m.x, my = m.cy ?? m.y;
    const mL = mx, mR = mx + m.w, mT = my, mB = my + 8;
    const eL = e.x - half, eR = e.x + half;
    if (eR > mL && eL < mR) {
      // landing: feet crossed the mover top this step while falling
      if (dy >= 0 && prevFeet <= mT + Math.max(2, m.lastDy + 2) && e.y >= mT && e.y <= mB + Math.max(4, dy + m.lastDy + 4)) {
        e.y = mT; res.ground = true; res.mover = m;
      }
    }
  }

  // ---- hazards (spikes / thorns) touching the box ----
  if (!opts.ghost) {
    const x0 = tx(e.x - half + 1), x1 = tx(e.x + half - 1);
    const y0 = tx(e.y - e.h + 1), y1 = tx(e.y - 1);
    outer: for (let yy = y0; yy <= y1; yy++)
      for (let xxx = x0; xxx <= x1; xxx++) {
        const id = tv.id(xxx, yy);
        if (TILE_DEADLY.has(id)) { res.hazard = { x: xxx, y: yy, id }; break outer; }
      }
  }
  return res;
}

// probe: any solid within the column just beyond the left/right face
export function wallAt(world, e, dir, fromY = null, toY = null) {
  const tv = world.tiles;
  const half = e.w / 2;
  const xEdge = tx(e.x + dir * (half + 1));
  const y0 = tx(fromY !== null ? fromY : e.y - e.h + 1);
  const y1 = tx(toY !== null ? toY : e.y - 1);
  for (let yy = y0; yy <= y1; yy++) if (tv.solid(xEdge, yy)) return { x: xEdge, y: yy };
  return null;
}

export function groundBelow(world, e, reach = 2) {
  const tv = world.tiles;
  const half = e.w / 2;
  const x0 = tx(e.x - half + 1), x1 = tx(e.x + half - 1);
  const yFeet = tx(e.y + reach - 0.001);
  for (let xx = x0; xx <= x1; xx++) {
    const id = tv.id(xx, yFeet);
    if (TILE_SOLID.has(id) || id === T.PLATFORM || id === T.CRUMBLE) return true;
  }
  for (const m of world.movers) {
    const mx = m.cx ?? m.x, my = m.cy ?? m.y;
    if (e.x + half > mx && e.x - half < mx + m.w && e.y >= my - 1 && e.y <= my + reach + 2) return true;
  }
  return false;
}

export function inWater(world, e, atHeadToo = false) {
  const tv = world.tiles;
  const midY = tx(e.y - e.h * 0.45);
  const feet = tv.water(tx(e.x), midY);
  if (!atHeadToo) return feet;
  return feet && tv.water(tx(e.x), tx(e.y - e.h + 1));
}

export function waterSurfaceY(world, e) {
  // scan up from mid-body to the first non-water cell boundary
  const tv = world.tiles;
  const cx = tx(e.x);
  let cy = tx(e.y - e.h * 0.45);
  if (!tv.water(cx, cy)) return null;
  while (cy > 0 && tv.water(cx, cy - 1)) cy--;
  return cy * TILE;
}
