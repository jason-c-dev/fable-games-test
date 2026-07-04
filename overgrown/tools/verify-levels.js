#!/usr/bin/env node
// Headless level completability checker for Sprout Kingdom: Overgrown.
// Parses every level with the real DSL parser, then runs a reachability BFS
// with the NEW movement model encoded as edges:
//   plain jump: <=3 up (4 with run), <=6 across
//   air dash:   flat/down gaps up to 9 across
//   wall-jump:  climbs shafts (two facing walls <=7 apart)
//   springs:    +8 rows;  updrafts: free rise in column;  water: free swim
//   movers:     bridges between endpoints
// Conservative by design: if this passes, a competent player can too.
// Usage: node tools/verify-levels.js [--render <id>]

import '../js/sim/levels/index.js';
import { getLevel, levelOrder } from '../js/sim/level.js';
import { T, TILE_SOLID, TILE } from '../js/config.js';

const JUMP_UP = 4;         // run jump height in tiles
const JUMP_DX = 6;         // flat jump distance
const DASH_DX = 8;         // jump + air dash, flat or downward (sim-measured)
const SHAFT_W = 7;         // max wall-jump shaft width

let failures = 0, warnings = 0;

// BRICK is passable (plunge/charge breaks it) but still supports standing
const isSolid = (id) => TILE_SOLID.has(id) && id !== T.BRICK;
const isSupport = (id) => isSolid(id) || id === T.PLATFORM || id === T.CRUMBLE || id === T.BRICK;
const isHazard = (id) => id === T.SPIKES || id === T.THORN;

function analyzeRoom(room) {
  const { w, h, grid } = room;
  const tile = (x, y) => (x < 0 || x >= w) ? T.STONE : (y < 0 || y >= h) ? T.EMPTY : grid[y][x];
  // treat closed gates as open for reachability (crystal check is separate)
  const t = (x, y) => { const id = tile(x, y); return id === T.GATE ? T.EMPTY : id; };

  const isFree = (x, y) => !isSolid(t(x, y)) && !isHazard(t(x, y));
  const stand = (x, y) => isFree(x, y) && isFree(x, y - 1) && (isSupport(t(x, y + 1)) || t(x, y + 1) === T.SPRING) && !isHazard(t(x, y + 1));
  const water = (x, y) => t(x, y) === T.WATER;
  const updraft = (x, y) => t(x, y) === T.UPDRAFT;
  const spring = (x, y) => t(x, y + 1) === T.SPRING;

  const standable = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (stand(x, y) || water(x, y) || (updraft(x, y) && isFree(x, y))) standable.push([x, y]);
  }
  const key = (x, y) => y * w + x;
  const standSet = new Set(standable.map(([x, y]) => key(x, y)));

  const bridges = [];
  for (const m of room.movers) {
    const ax = Math.round(m.x / TILE), ay = Math.round(m.y / TILE) - 1;
    const bx = Math.round(m.x2 / TILE), by = Math.round(m.y2 / TILE) - 1;
    const wT = Math.round(m.w / TILE);
    bridges.push({ a: [ax, ay, wT], b: [bx, by, wT] });
  }
  return { w, h, t, tile, stand, water, updraft, spring, standSet, key, bridges };
}

// clear horizontal corridor for a dash at row y from x0 to x1 (head + body free)
function dashClear(an, x0, x1, y) {
  const [lo, hi] = x0 < x1 ? [x0, x1] : [x1, x0];
  for (let x = lo; x <= hi; x++) {
    if (isSolid(an.t(x, y)) || isSolid(an.t(x, y - 1))) return false;
    if (isHazard(an.t(x, y)) || isHazard(an.t(x, y - 1))) return false;
  }
  return true;
}

// jump/fall occlusion: an intermediate column whose cells are solid across
// the whole flight window is a wall you cannot arc over — without this,
// jump edges tunnel straight through full-height walls
function flightClear(an, x, y, dx, dy) {
  if (Math.abs(dx) < 2) return true;
  const step = dx > 0 ? 1 : -1;
  const winTop = Math.min(y, y + dy) - 4;
  const winBot = Math.max(y, y + dy);
  for (let xi = x + step; xi !== x + dx; xi += step) {
    let blocked = true;
    for (let yy = winTop; yy <= winBot; yy++) {
      if (!isSolid(an.t(xi, yy))) { blocked = false; break; }
    }
    if (blocked) return false;
  }
  return true;
}

function bfs(an, startCells) {
  const { w, h, standSet, key, bridges } = an;
  const seen = new Set();
  const q = [];
  const push = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const k = key(x, y);
    if (standSet.has(k) && !seen.has(k)) { seen.add(k); q.push([x, y]); }
  };
  for (const [x, y] of startCells) push(x, y);

  while (q.length) {
    const [x, y] = q.shift();

    if (an.water(x, y)) {
      // swim: free movement inside the body + leap out ~3 above the surface
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) push(x + dx, y + dy);
      if (!an.water(x, y - 1)) for (let dy = -3; dy <= 0; dy++) for (let dx = -2; dx <= 2; dx++) push(x + dx, y + dy);
      continue;
    }
    if (an.updraft(x, y)) {
      push(x, y - 1); push(x - 1, y); push(x + 1, y); push(x, y + 1);
      for (let dx = -4; dx <= 4; dx++) for (let dy = -2; dy <= 1; dy++) push(x + dx, y + dy);
      continue;
    }

    // jumps: up to JUMP_UP rows up with shrinking reach; falls spread wide
    for (let dy = -JUMP_UP; dy <= 3; dy++) {
      const up = Math.max(0, -dy);
      const maxDx = up >= 4 ? 3 : up >= 3 ? 4 : JUMP_DX;
      for (let dx = -maxDx; dx <= maxDx; dx++) {
        if (flightClear(an, x, y, dx, dy)) push(x + dx, y + dy);
      }
    }
    // ledge mount: a run-jump + corner grab + clamber tops a 5-row wall
    for (let dx = -2; dx <= 2; dx++) {
      if (dx !== 0 && flightClear(an, x, y, dx, -5)) push(x + dx, y - 5);
    }
    // air-dash gaps: flat or downward, needs a clear corridor near takeoff row
    for (const dir of [-1, 1]) {
      for (let dx = JUMP_DX + 1; dx <= DASH_DX; dx++) {
        for (let dy = 0; dy <= 3; dy++) {
          if (dashClear(an, x + dir, x + dir * dx, y - 1)) push(x + dir * dx, y + dy);
        }
      }
    }
    // deep falls
    for (let drop = 4; drop <= h; drop++) {
      const spread = Math.min(JUMP_DX + 2, 2 + drop);
      for (let dx = -spread; dx <= spread; dx++) {
        if (flightClear(an, x, y, dx, drop)) push(x + dx, y + drop);
      }
    }
    // springs: big vertical boost
    if (an.spring(x, y)) {
      for (let dy = -8; dy <= -2; dy++) for (let dx = -3; dx <= 3; dx++) push(x + dx, y + dy);
    }
    // wall-jump shafts: from a cell beside a wall, zigzag up while two
    // roughly-facing wall lines continue (walls may be vertically staggered)
    const wallNear = (wx, wy, up = 4, down = 2) => {
      for (let dy = -up; dy <= down; dy++) if (isSolid(an.t(wx, wy + dy))) return true;
      return false;
    };
    for (const dir of [-1, 1]) {
      // a wall starting up to 3 rows above is enterable: jump in and grab it
      if (!wallNear(x + dir, y, 3, 0)) continue;
      let opp = -1;
      for (let d = 2; d <= SHAFT_W; d++) {
        if (wallNear(x - dir * d, y, 6, 0)) { opp = d; break; }
      }
      if (opp < 0) continue;
      let cy = y;
      let guard = 0;
      while (guard++ < h) {
        cy -= 2;
        if (cy < 1) break;
        const wallA = wallNear(x + dir, cy);
        let wallB = false;
        for (let d = 2; d <= SHAFT_W; d++) if (wallNear(x - dir * d, cy)) { wallB = true; break; }
        if (!wallA || !wallB) break;
        if (isSolid(an.t(x, cy)) || isHazard(an.t(x, cy))) break;
        for (let dx = -4; dx <= 4; dx++) for (let dy = -2; dy <= 1; dy++) push(x + dx, cy + dy);
      }
    }
    // mover bridges
    for (const br of bridges) {
      for (const [from, to] of [[br.a, br.b], [br.b, br.a]]) {
        const [fx, fy, fw] = from;
        if (y >= fy - 7 && y <= fy + 4 && x >= fx - 3 && x <= fx + fw + 3) {
          const [tx2, ty2, tw2] = to;
          for (let dx = -3; dx <= tw2 + 3; dx++)
            for (let dy = -4; dy <= 6; dy++) push(tx2 + dx, ty2 + dy);
        }
      }
    }
  }
  return seen;
}

function nearReachable(an, seen, tx, ty, radX = 2, radUp = 4, radDown = 2) {
  for (let dy = -radDown; dy <= radUp; dy++)
    for (let dx = -radX; dx <= radX; dx++) {
      const x = tx + dx, y = ty + dy;
      if (x >= 0 && x < an.w && y >= 0 && y < an.h && seen.has(an.key(x, y))) return true;
    }
  return false;
}

function render(an, seen) {
  const CH = {
    [T.EMPTY]: '.', [T.GROUND]: '#', [T.STONE]: 'X', [T.PLATFORM]: '=',
    [T.BRICK]: 'B', [T.QCOIN]: '?', [T.QFRUIT]: 'M', [T.QGLIDER]: 'G', [T.QMOSS]: 'E',
    [T.QCLOVER]: 'U', [T.USED]: 'u', [T.SPIKES]: '^', [T.CRUMBLE]: '~', [T.LANTERN]: 'L',
    [T.GOAL]: '!', [T.GOAL2]: '2', [T.DOOR]: 'n', [T.THORN]: 'v', [T.WATER]: ',',
    [T.MIRROR_A]: '/', [T.MIRROR_B]: '\\', [T.CRYSTAL]: 'C', [T.GATE]: 'D',
    [T.UPDRAFT]: 'T', [T.SPRING]: 'J',
  };
  const out = [];
  for (let y = 0; y < an.h; y++) {
    let row = '';
    for (let x = 0; x < an.w; x++) {
      if (seen && seen.has(an.key(x, y)) && an.tile(x, y) === T.EMPTY) { row += '·'; continue; }
      row += CH[an.tile(x, y)] ?? '?';
    }
    out.push(String(y).padStart(3) + ' ' + row);
  }
  return out.join('\n');
}

console.log('=== Overgrown level verifier ===\n');

const renderId = process.argv.includes('--render') ? process.argv[process.argv.indexOf('--render') + 1] : null;
const order = levelOrder();
if (!order.length) { console.log('no levels registered yet'); process.exit(0); }

for (const id of order) {
  const parsed = getLevel(id);
  const def = parsed;
  const problems = [];
  const warns = [];

  const widths = new Set(def.rows.map(r => r.replace(/\|/g, '').length));
  if (widths.size > 1) warns.push(`row widths differ: ${[...widths].join(',')}`);
  if (def.bonus) {
    const bw = new Set(def.bonus.rows.map(r => r.replace(/\|/g, '').length));
    if (bw.size > 1) warns.push(`bonus row widths differ: ${[...bw].join(',')}`);
  }

  const main = parsed.rooms.main;
  const an = analyzeRoom(main);

  if (!main.start) problems.push('no start (S)');
  const stars = [];
  for (const rk of ['main', 'bonus']) {
    const room = parsed.rooms[rk];
    if (!room) continue;
    for (const sp of room.spawns) if (sp.type === 'star') stars.push({ ...sp, room: rk });
  }
  if (!def.boss && !def.practice) {
    if (stars.length !== 3) problems.push(`expected 3 dew stars, found ${stars.length}`);
    if (!main.goals.length) problems.push('no goal gate');
    if (!main.checkpoints.length) warns.push('no checkpoint');
  }

  // ground-enemy support check
  for (const sp of main.spawns) {
    if (['bumble', 'snapcap', 'spikelet', 'lobber', 'pod', 'warden', 'duelist'].includes(sp.type)) {
      const tx = Math.floor(sp.x / TILE), ty = Math.floor(sp.y / TILE);
      if (!isSupport(an.tile(tx, ty))) warns.push(`${sp.type} at (${tx},${ty - 1}) has no floor`);
      if (isSolid(an.tile(tx, ty - 1))) warns.push(`${sp.type} at (${tx},${ty - 1}) embedded in solid`);
    }
  }

  // crystals need a beam line: some standable cell in the same row with a
  // clear axis-aligned path, or adjacent mirror plumbing (warn only)
  for (const cr of main.crystals || []) {
    let ok = false;
    for (const dir of [-1, 1]) {
      for (let d = 1; d < 22 && !ok; d++) {
        const x = cr.x + dir * d;
        const id = an.t(x, cr.y);
        if (isSolid(id) && id !== T.MIRROR_A && id !== T.MIRROR_B) break;
        if (an.stand(x, cr.y) || an.stand(x, cr.y + 1) || an.stand(x, cr.y - 1)) { ok = true; }
      }
    }
    // vertical feeds come via mirrors: accept if any mirror is in line
    if (!ok) {
      for (let d = 1; d < 22 && !ok; d++) {
        for (const [dx, dy] of [[0, -d], [0, d], [-d, 0], [d, 0]]) {
          const id = an.t(cr.x + dx, cr.y + dy);
          if (id === T.MIRROR_A || id === T.MIRROR_B) ok = true;
        }
      }
    }
    if (!ok) warns.push(`crystal at (${cr.x},${cr.y}) has no obvious beam line`);
  }

  if (main.start) {
    const sx = Math.floor(main.start.x / TILE), sy = Math.floor(main.start.y / TILE) - 1;
    const startCells = [];
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) startCells.push([sx + dx, sy + dy]);
    const seen = bfs(an, startCells);
    if (!seen.size) problems.push('start position is not standable');

    for (const g of main.goals) {
      if (!nearReachable(an, seen, g.x, g.y, 2, 3, 3)) {
        problems.push(`goal${g.secret ? ' (secret)' : ''} at (${g.x},${g.y}) unreachable`);
      }
    }
    for (const cp of main.checkpoints) {
      const tx = Math.floor(cp.x / TILE), ty = Math.floor(cp.y / TILE) - 1;
      if (!nearReachable(an, seen, tx, ty, 2, 3, 3)) problems.push(`checkpoint at (${tx},${ty}) unreachable`);
    }
    for (const st of stars.filter(s => s.room === 'main')) {
      const tx = Math.floor(st.x / TILE), ty = Math.floor(st.y / TILE);
      if (!nearReachable(an, seen, tx, ty, 3, 4, 2)) {
        problems.push(`dew star ${st.starIndex} at (${tx},${ty}) unreachable`);
      }
    }
    for (const d of main.doors) {
      if (!nearReachable(an, seen, d.x, d.y, 1, 2, 2)) problems.push(`door at (${d.x},${d.y}) unreachable`);
    }
    if (parsed.rooms.bonus) {
      const bn = analyzeRoom(parsed.rooms.bonus);
      const bd = parsed.rooms.bonus.doors[0];
      if (!bd) problems.push('bonus room has no return door');
      else {
        const bseen = bfs(bn, [[bd.x, bd.y], [bd.x, bd.y - 1], [bd.x + 1, bd.y], [bd.x - 1, bd.y]]);
        for (const st of stars.filter(s => s.room === 'bonus')) {
          const tx = Math.floor(st.x / TILE), ty = Math.floor(st.y / TILE);
          if (!nearReachable(bn, bseen, tx, ty, 3, 4, 2)) problems.push(`bonus star at (${tx},${ty}) unreachable`);
        }
        if (main.doors.length === 0) problems.push('bonus room exists but main has no door');
      }
    }

    if ((problems.length && process.argv.includes('--render-fails')) || renderId === id) {
      console.log(render(an, seen));
    }
  }

  const status = problems.length ? 'FAIL' : 'ok  ';
  const wtxt = warns.length ? `  [warn: ${warns.join('; ')}]` : '';
  console.log(`${status} ${id} ${String(def.name).padEnd(18)} ${main.w}x${main.h}${wtxt}`);
  for (const p of problems) console.log(`      - ${p}`);
  failures += problems.length;
  warnings += warns.length;
}

console.log(`\n${failures} problems, ${warnings} warnings`);
process.exit(failures ? 1 : 0);
