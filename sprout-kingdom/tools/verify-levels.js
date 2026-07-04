#!/usr/bin/env node
// Headless level completability checker for Sprout Kingdom.
// Parses every level with the real DSL parser, then runs a reachability BFS
// using conservative jump physics derived from constants.js:
//   run-jump height ~4 tiles, run-jump gap ~6 tiles (4-high jumps max 3 across)
// Movers are treated as bridges between their endpoints.
// This is a sanity net for hand-authored data, backed by manual playtesting.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ctx = { console };
vm.createContext(ctx);
for (const f of ['js/constants.js', 'js/levels.js', 'js/levels2.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}
const { LEVELS, LEVEL_ORDER, T } = vm.runInContext('({LEVELS, LEVEL_ORDER, T, WORLD_MAP})', ctx);
const TILE_SOLID = vm.runInContext('TILE_SOLID', ctx);

const JUMP_UP = 4;        // max tiles up (run jump, generous)
const JUMP_DX = 6;        // max tiles across at flat/downward
const WALK_UP = 3;        // walk-speed jump height (used when narrow)

let failures = 0, warnings = 0;

function isSolidId(id) { return TILE_SOLID.has(id); }
function isSupport(id) { return isSolidId(id) || id === T.PLATFORM || id === T.CRUMBLE; }
function isHazard(id) { return id === T.SPIKES || id === T.THORN; }

function analyzeRoom(room, label, level) {
  const { w, h, grid } = room;
  const tile = (x, y) => (x < 0 || x >= w) ? T.STONE : (y < 0 || y >= h) ? T.EMPTY : grid[y][x];

  // standable: cell free (non-solid, non-hazard), support below, head free
  const standable = [];
  const isFree = (x, y) => !isSolidId(tile(x, y)) && !isHazard(tile(x, y));
  const stand = (x, y) => isFree(x, y) && isFree(x, y - 1) && isSupport(tile(x, y + 1)) && !isHazard(tile(x, y + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (stand(x, y)) standable.push([x, y]);

  const key = (x, y) => y * w + x;
  const standSet = new Set(standable.map(([x, y]) => key(x, y)));

  // mover bridge cells: standing "virtual" nodes above each endpoint
  const bridges = [];
  for (const m of room.movers) {
    const ax = Math.round(m.x / 16), ay = Math.round(m.y / 16) - 1;
    const bx = Math.round(m.x2 / 16), by = Math.round(m.y2 / 16) - 1;
    const wTiles = Math.round(m.w / 16);
    bridges.push({ a: [ax, ay, wTiles], b: [bx, by, wTiles] });
  }

  return { w, h, tile, stand, standSet, key, bridges, grid };
}

function bfs(an, startCells) {
  const { w, h, standSet, key, bridges } = an;
  const seen = new Set();
  const q = [];
  for (const [x, y] of startCells) {
    if (standSet.has(key(x, y)) && !seen.has(key(x, y))) { seen.add(key(x, y)); q.push([x, y]); }
  }
  const push = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const k = key(x, y);
    if (standSet.has(k) && !seen.has(k)) { seen.add(k); q.push([x, y]); }
  };
  while (q.length) {
    const [x, y] = q.shift();
    // jumps: up to JUMP_UP tiles up (reach shrinks with height), and
    // running jumps that land up to 3 tiles lower at full distance
    for (let dy = -JUMP_UP; dy <= 3; dy++) {
      const up = Math.max(0, -dy);
      const maxDx = up >= 4 ? 3 : up >= 3 ? 4 : JUMP_DX;
      for (let dx = -maxDx; dx <= maxDx; dx++) push(x + dx, y + dy);
    }
    // deeper falls: drop any depth within a forward cone
    for (let drop = 4; drop <= h; drop++) {
      const spread = Math.min(JUMP_DX + 2, 2 + drop);
      for (let dx = -spread; dx <= spread; dx++) push(x + dx, y + drop);
    }
    // mover bridges: if near one endpoint (beside it, or up to a short jump
    // below its riding height), can ride to the other endpoint
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

function render(an, seen, marks) {
  const CH = { [T.EMPTY]: '.', [T.GROUND]: '#', [T.STONE]: 'X', [T.PLATFORM]: '=',
    [T.BRICK]: 'B', [T.QCOIN]: '?', [T.QPOWER]: 'M', [T.QGLIDER]: 'G', [T.QMOSS]: 'E',
    [T.QONEUP]: 'U', [T.USED]: 'u', [T.SPIKES]: '^', [T.CRUMBLE]: '~', [T.LANTERN]: 'L',
    [T.GOAL]: '!', [T.GOAL2]: '2', [T.BURROW]: 'n', [T.THORN]: 'v' };
  const out = [];
  for (let y = 0; y < an.h; y++) {
    let row = '';
    for (let x = 0; x < an.w; x++) {
      const m = marks && marks[an.key(x, y)];
      if (m) { row += m; continue; }
      if (seen && seen.has(an.key(x, y))) { row += '·'; continue; }
      row += CH[an.tile(x, y)] ?? '?';
    }
    out.push(row);
  }
  return out.join('\n');
}

console.log('=== Sprout Kingdom level verifier ===\n');

for (const id of LEVEL_ORDER) {
  const def = LEVELS[id];
  const problems = [];
  const warns = [];

  // row width consistency (catches typos — '|' stripping etc.)
  const widths = new Set(def.rows.map(r => r.replace(/\|/g, '').length));
  if (widths.size > 1) {
    warns.push(`row widths differ: ${[...widths].join(',')}`);
  }
  if (def.bonus) {
    const bw = new Set(def.bonus.rows.map(r => r.replace(/\|/g, '').length));
    if (bw.size > 1) warns.push(`bonus row widths differ: ${[...bw].join(',')}`);
  }

  const parsed = vm.runInContext(`getLevel(${JSON.stringify(id)})`, ctx);
  const main = parsed.rooms.main;
  const an = analyzeRoom(main, 'main', def);

  // --- structure ---
  if (!main.start) problems.push('no start (S)');
  const stars = [];
  for (const rk of ['main', 'bonus']) {
    const room = parsed.rooms[rk];
    if (!room) continue;
    for (const sp of room.spawns) if (sp.type === 'star') stars.push({ ...sp, room: rk });
  }
  if (!def.boss) {
    if (stars.length !== 3) problems.push(`expected 3 dew stars, found ${stars.length}`);
    if (!main.goals.length) problems.push('no goal gate');
    if (!main.checkpoints.length) warns.push('no checkpoint');
  }

  // enemy support check (ground walkers)
  for (const sp of main.spawns) {
    if (['bumble', 'snapcap', 'spikelet', 'lobber', 'pod'].includes(sp.type)) {
      const tx = Math.floor(sp.x / 16), ty = Math.floor(sp.y / 16); // ty = row below feet
      if (!isSupport(an.tile(tx, ty))) warns.push(`${sp.type} at (${tx},${ty - 1}) has no floor under it`);
      if (isSolidId(an.tile(tx, ty - 1))) warns.push(`${sp.type} at (${tx},${ty - 1}) embedded in solid`);
    }
  }

  // --- reachability ---
  if (main.start) {
    const sx = Math.floor(main.start.x / 16), sy = Math.floor(main.start.y / 16) - 1;
    const startCells = [];
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) startCells.push([sx + dx, sy + dy]);
    const seen = bfs(an, startCells);
    if (!seen.size) problems.push('start position is not standable');

    // nearReachable(tx, ty, radX, rowsBelow, rowsAbove): a target counts as
    // reachable if a reachable standing cell exists within radX cols and
    // between (ty - rowsAbove) and (ty + rowsBelow) — below = jump up to grab.
    for (const g of main.goals) {
      if (!nearReachable(an, seen, g.x, g.y, 2, 3, 3)) {
        problems.push(`goal${g.secret ? ' (secret)' : ''} at (${g.x},${g.y}) unreachable`);
      }
    }
    for (const cp of main.checkpoints) {
      const tx = Math.floor(cp.x / 16), ty = Math.floor(cp.y / 16) - 1;
      if (!nearReachable(an, seen, tx, ty, 2, 3, 3)) problems.push(`checkpoint at (${tx},${ty}) unreachable`);
    }
    for (const st of stars.filter(s => s.room === 'main')) {
      const tx = Math.floor(st.x / 16), ty = Math.floor(st.y / 16);
      if (!nearReachable(an, seen, tx, ty, 3, 4, 2)) {
        problems.push(`dew star ${st.starIndex} at (${tx},${ty}) unreachable`);
      }
    }
    for (const d of main.doors) {
      if (!nearReachable(an, seen, d.x, d.y, 1, 2, 2)) problems.push(`burrow door at (${d.x},${d.y}) unreachable`);
    }
    // bonus room reachability from its door
    if (parsed.rooms.bonus) {
      const bn = analyzeRoom(parsed.rooms.bonus, 'bonus', def);
      const bd = parsed.rooms.bonus.doors[0];
      if (!bd) problems.push('bonus room has no return door');
      else {
        const bseen = bfs(bn, [[bd.x, bd.y], [bd.x, bd.y - 1], [bd.x + 1, bd.y], [bd.x - 1, bd.y]]);
        for (const st of stars.filter(s => s.room === 'bonus')) {
          const tx = Math.floor(st.x / 16), ty = Math.floor(st.y / 16);
          if (!nearReachable(bn, bseen, tx, ty, 3, 4, 2)) problems.push(`bonus dew star at (${tx},${ty}) unreachable`);
        }
        if (main.doors.length === 0) problems.push('bonus room exists but main has no door');
      }
    }

    if (problems.length && process.argv.includes('--render')) {
      console.log(render(an, seen));
    }
  }

  const status = problems.length ? 'FAIL' : 'ok  ';
  const wtxt = warns.length ? `  [warn: ${warns.join('; ')}]` : '';
  console.log(`${status} ${id} ${def.name.padEnd(18)} ${main.w}x${main.h}${wtxt}`);
  for (const p of problems) console.log(`      - ${p}`);
  failures += problems.length;
  warnings += warns.length;
}

console.log(`\n${failures} problems, ${warnings} warnings`);
process.exit(failures ? 1 : 0);
