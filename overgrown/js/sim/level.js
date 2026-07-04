// Level DSL parser. Levels are hand-authored ASCII grids; '|' is a cosmetic
// column separator (every 16 cols) stripped by the parser. Node-safe.
//
// Tile legend: # ground  X stone  = one-way  B brick  ? coin block
//   M fruit block  G glider block  E moss block  U clover block  ^ spikes
//   ~ crumble  L lantern  ! goal  2 secret goal  n door  v thorn-lava
//   , water  / \ mirrors  C crystal  D gate  T updraft  J spring
// Entities (lowercase): b bumble  s snapcap  k spikelet  p puffhawk
//   l lobber  w wisp  o pod  a warden  d duelist  z glintwing  m moss
// Markers: S start  c checkpoint  - coin  * dew star
//
// Authoring rules (enforced by tools/verify-levels.js):
//   bumpable blocks sit 3 rows above the standing surface
//   plain jumps: <=3 rows up (4 with run); wall-jump shafts may climb higher
//   mandatory gaps <=6 tiles (<=9 with an air dash)
//   spike strips: <=5 wide unless a pogo target or dash route is provided

import { TILE, T, CHAR_TILES, ENTITY_CHARS, TILE_SOLID } from '../config.js';

export function parseRoom(rows, movers) {
  const clean = rows.map(r => r.replace(/\|/g, ''));
  const w = Math.max(...clean.map(r => r.length));
  const h = clean.length;
  const grid = [];
  const spawns = [];
  let start = null;
  const goals = [], checkpoints = [], doors = [];
  const crystals = [], gates = [], lanterns = [];
  for (let y = 0; y < h; y++) {
    const line = clean[y].padEnd(w, '.');
    const row = new Uint8Array(w);
    for (let x = 0; x < w; x++) {
      const ch = line[x];
      if (ch === '.' || ch === ' ') continue;
      if (CHAR_TILES[ch] !== undefined) {
        row[x] = CHAR_TILES[ch];
        if (ch === '!') goals.push({ x, y, secret: false });
        if (ch === '2') goals.push({ x, y, secret: true });
        if (ch === 'n') doors.push({ x, y });
        if (ch === 'C') crystals.push({ x, y });
        if (ch === 'D') gates.push({ x, y });
        if (ch === 'L') lanterns.push({ x, y });
      } else if (ENTITY_CHARS[ch]) {
        spawns.push({ type: ENTITY_CHARS[ch], x: x * TILE + 8, y: y * TILE + TILE });
      } else if (ch === 'S') {
        start = { x: x * TILE + 8, y: y * TILE + TILE };
      } else if (ch === 'c') {
        checkpoints.push({ x: x * TILE + 8, y: y * TILE + TILE });
      } else if (ch === '-') {
        spawns.push({ type: 'coin', x: x * TILE + 8, y: y * TILE + TILE });
      } else if (ch === '*') {
        spawns.push({ type: 'star', x: x * TILE + 8, y: y * TILE + TILE });
      }
    }
    grid.push(row);
  }
  return {
    w, h, grid, spawns, start, goals, checkpoints, doors,
    crystals, gates, lanterns,
    movers: (movers || []).map(m => ({
      x: m.tx * TILE, y: m.ty * TILE, x2: m.tx2 * TILE, y2: m.ty2 * TILE,
      w: m.w * TILE, period: m.period || 240,
    })),
  };
}

const _cache = {};
let _levels = null;
let _order = null;

export function registerLevels(levels, order) {
  _levels = levels;
  _order = order;
}

export function levelOrder() { return _order; }
export function levelDef(id) { return _levels[id]; }

export function getLevel(id) {
  if (_cache[id]) return _cache[id];
  const def = _levels && _levels[id];
  if (!def) throw new Error('unknown level ' + id);
  const rooms = { main: parseRoom(def.rows, def.movers) };
  if (def.bonus) rooms.bonus = parseRoom(def.bonus.rows, def.bonus.movers);
  let starIdx = 0;
  for (const key of ['main', 'bonus']) {
    if (!rooms[key]) continue;
    for (const s of rooms[key].spawns) if (s.type === 'star') s.starIndex = starIdx++;
  }
  const parsed = { ...def, rooms };
  _cache[id] = parsed;
  return parsed;
}

export function clearLevelCache() { for (const k of Object.keys(_cache)) delete _cache[k]; }
