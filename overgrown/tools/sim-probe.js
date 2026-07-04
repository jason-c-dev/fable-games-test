#!/usr/bin/env node
// Headless mechanics probes for Sprout Kingdom: Overgrown.
// Drives the REAL simulation (js/sim/*) in Node with scripted input and
// asserts on movement + combat behavior. No browser required.
// Usage: node tools/sim-probe.js [--verbose]

import '../js/sim/levels/index.js';
import { parseRoom, getLevel } from '../js/sim/level.js';
import { World } from '../js/sim/world.js';
import { Run } from '../js/sim/run.js';
import { ScriptedInput } from '../js/core/input.js';
import { PHYS as P, COMBAT as C, TILE, T } from '../js/config.js';

const verbose = process.argv.includes('--verbose');
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass++; if (verbose) console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${extra ? '  (' + extra + ')' : ''}`); }
};

function makeWorld(rows, opts = {}) {
  const parsed = { id: opts.id || 'test', rooms: { main: parseRoom(rows, opts.movers) }, ...(opts.def || {}) };
  const run = new Run();
  if (opts.run) Object.assign(run, opts.run);
  const w = new World(parsed, run, { seed: opts.seed ?? 7 });
  const inp = new ScriptedInput();
  return { w, run, inp, p: w.player };
}

function drive(w, inp, frames, held = {}) {
  inp.feed(held);
  for (let i = 0; i < frames; i++) w.step(inp.poll());
}

// step until pred() true; returns frame count or -1 on timeout
function until(w, inp, held, pred, max = 600) {
  inp.feed(held);
  for (let i = 0; i < max; i++) {
    w.step(inp.poll());
    if (pred()) return i;
  }
  return -1;
}

function tap(w, inp, heldBase, key, frames = 2) {
  drive(w, inp, frames, { ...heldBase, [key]: true });
  drive(w, inp, 1, heldBase);   // release edge must be polled
}

function teleport(p, x, y) { p.x = x; p.y = y; p.px = x; p.py = y; p.vx = 0; p.vy = 0; }

const evs = (w, t) => w.events.filter(e => e.t === t);
const drain = (w) => { w.events.length = 0; };

// ---------------------------------------------------------------- rooms --
const FLAT = [
  '............................................',
  '............................................',
  '............................................',
  '............................................',
  '............................................',
  '............................................',
  '............................................',
  '............................................',
  '............................................',
  '............................................',
  '..S.........................................',
  '############################################',
  '############################################',
];

// ledge at col 12 (drop from x<192), floor lower right
const LEDGE = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '..S.....................',
  '############............',
  '############............',
  '############............',
  '############............',
  '########################',
  '########################',
];

// wall-jump shaft: walls at cols 3 and 9, open shaft between, floor at bottom
const SHAFT = [
  '...X.....X..............',
  '...X.....X..............',
  '...X.....X..............',
  '...X.....X..............',
  '...X.....X..............',
  '...X.....X..............',
  '...X.....X..............',
  '...X.....X..............',
  '...X.....X..............',
  '...X.....X..............',
  '...X.....X..............',
  '....S...................',
  '########################',
  '########################',
];

// ledge-grab target: platform top at row 6, approached from lower ground
const GRAB = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........XXXX............',
  '........XXXX............',
  '........XXXX............',
  '..S.....XXXX............',
  '########################',
  '########################',
];

// spikes strip + brick floor pocket
const SPIKE = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '..S.....................',
  '........................',
  '......^^^^....BB........',
  '######XXXX####BB########',
  '######XXXX####..########',
  '########################',
];

const WATER_ROOM = [
  '............................',
  '............................',
  '............................',
  '..S.........................',
  '#####.......................',
  '#####,,,,,,,,,,,............',
  '#####,,,,,,,,,,,............',
  '#####,,,,,,,,,,,............',
  '#####,,,,,,,,,,,............',
  '#####,,,,,,,,,,,############',
  '############################',
];

// ------------------------------------------------------------- movement --
{
  const { w, inp, p } = makeWorld(FLAT);
  drive(w, inp, 120, { right: true });
  check('run reaches max speed', Math.abs(p.vx - P.maxRun) < 0.05, `vx=${p.vx.toFixed(2)}`);
  drive(w, inp, 2, { left: true });
  const skidding = p.vx > 0; // still moving right while decelerating
  drive(w, inp, 30, { left: true });
  check('skid then turn around', skidding && p.vx < 0, `vx=${p.vx.toFixed(2)}`);
}

{
  // variable jump height
  const { w, inp, p } = makeWorld(FLAT);
  drive(w, inp, 10, {});
  const y0 = p.y;
  drive(w, inp, 2, { jump: true });
  inp.feed({});
  let peakTap = y0;
  for (let i = 0; i < 80; i++) { w.step(inp.poll()); peakTap = Math.min(peakTap, p.y); if (p.onGround && i > 6) break; }
  const tapH = y0 - peakTap;

  const { w: w2, inp: i2, p: p2 } = makeWorld(FLAT);
  drive(w2, i2, 10, {});
  const y1 = p2.y;
  let peakHold = y1;
  i2.feed({ jump: true });
  for (let i = 0; i < 80; i++) { w2.step(i2.poll()); peakHold = Math.min(peakHold, p2.y); if (p2.onGround && i > 6) break; }
  const holdH = y1 - peakHold;
  check('variable jump: hold ~3 tiles', holdH > 42 && holdH < 58, `holdH=${holdH.toFixed(1)}`);
  check('variable jump: tap is short', tapH < 28 && tapH > 8, `tapH=${tapH.toFixed(1)}`);

  // run jump is higher
  const { w: w3, inp: i3, p: p3 } = makeWorld(FLAT);
  drive(w3, i3, 90, { right: true });
  let peakRun = p3.y;
  const y2 = p3.y;
  i3.feed({ right: true, jump: true });
  for (let i = 0; i < 90; i++) { w3.step(i3.poll()); peakRun = Math.min(peakRun, p3.y); if (p3.onGround && i > 6) break; }
  check('run jump higher than stand jump', (y2 - peakRun) > holdH + 8, `runH=${(y2 - peakRun).toFixed(1)}`);
}

{
  // coyote time
  const { w, inp, p } = makeWorld(LEDGE);
  const f = until(w, inp, { right: true }, () => !p.onGround && p.x > 190, 400);
  check('walked off ledge', f >= 0, `x=${p.x.toFixed(0)}`);
  drive(w, inp, 3, { right: true });          // 3 frames after leaving ground
  drive(w, inp, 2, { right: true, jump: true });
  check('coyote jump works', p.vy < -3, `vy=${p.vy.toFixed(2)}`);
}
{
  // no coyote after window
  const { w, inp, p } = makeWorld(LEDGE);
  until(w, inp, { right: true }, () => !p.onGround && p.x > 190, 400);
  drive(w, inp, 12, { right: true });
  drive(w, inp, 2, { right: true, jump: true });
  check('coyote expires', p.vy > -3, `vy=${p.vy.toFixed(2)}`);
}

{
  // jump buffer: press jump while falling, jumps on landing
  const { w, inp, p } = makeWorld(FLAT);
  drive(w, inp, 10, {});
  drive(w, inp, 2, { jump: true }); inp.feed({});   // jump up
  until(w, inp, {}, () => p.vy > 2, 100);            // now falling
  const yAir = p.y;
  inp.feed({ jump: true });                          // hold: buffer + will hold thru landing
  const f = until(w, inp, { jump: true }, () => p.vy < -3 && p.y < yAir + 40, 100);
  check('jump buffer rejumps on landing', f >= 0);
}

{
  // ground dash distance + cooldown
  const { w, inp, p } = makeWorld(FLAT);
  drive(w, inp, 10, {});
  const x0 = p.x;
  drive(w, inp, 2, { dash: true, right: true });
  drive(w, inp, 12, { right: true });
  check('ground dash covers ~3 tiles', p.x - x0 > 40, `dx=${(p.x - x0).toFixed(1)}`);

  // air dash once only (drop from height so we stay airborne)
  const { w: w2, inp: i2, p: p2 } = makeWorld(FLAT);
  drive(w2, i2, 3, {});
  teleport(p2, 200, 3 * TILE);
  drive(w2, i2, 4, {});
  drain(w2);
  tap(w2, i2, {}, 'dash');
  const dashed1 = evs(w2, 'dash').length === 1;
  drive(w2, i2, 12, {});         // dash over, still airborne
  drain(w2);
  tap(w2, i2, {}, 'dash');
  const dashed2 = evs(w2, 'dash').length;
  check('air dash: first works, second blocked', dashed1 && dashed2 === 0 && p2.airDashUsed, `d1=${dashed1} d2=${dashed2} used=${p2.airDashUsed}`);
  // refresh on landing
  until(w2, i2, {}, () => p2.onGround, 200);
  check('air dash refreshed on landing', !p2.airDashUsed);
}

{
  // wall slide + wall jump + shaft climb
  const { w, inp, p } = makeWorld(SHAFT);
  until(w, inp, { right: true }, () => p.vx === 0 && p.x > 120, 200);   // run against right wall
  drive(w, inp, 2, { jump: true, right: true });
  drive(w, inp, 10, { jump: true, right: true });                       // rise along the wall
  const f = until(w, inp, { right: true }, () => p.state === 'wallslide', 120);
  check('wall slide engages', f >= 0, `state=${p.state}`);
  drive(w, inp, 6, { right: true });
  check('wall slide caps fall speed', p.vy <= P.wallSlideFall + 0.05, `vy=${p.vy.toFixed(2)}`);
  const yBefore = p.y;
  drive(w, inp, 2, { jump: true });
  check('wall jump pushes away and up', p.vy < -3 && p.vx < 0, `vy=${p.vy.toFixed(2)} vx=${p.vx.toFixed(2)}`);

  // climb the shaft by alternating (hold jump while crossing, human-style)
  let climbed = false;
  for (let hop = 0; hop < 16 && !climbed; hop++) {
    const dir = p.facing === 1 ? { right: true } : { left: true };
    const got = until(w, inp, { ...dir, jump: true }, () => p.state === 'wallslide', 90);
    if (got < 0) break;
    drive(w, inp, 1, dir);                    // release for a fresh press
    drive(w, inp, 2, { ...dir, jump: true }); // wall jump, facing flips
    if (p.y < yBefore - 4 * TILE) climbed = true;
  }
  check('shaft climb gains 4+ tiles', climbed, `y=${p.y.toFixed(0)} vs ${yBefore.toFixed(0)}`);
}

{
  // ledge grab + clamber
  const { w, inp, p } = makeWorld(GRAB);
  drive(w, inp, 6, {});
  // jump from beside the tower whose top is at row 6 (y=96): corner ~4 tiles up
  teleport(p, 100, 10 * TILE);
  drive(w, inp, 2, { right: true, jump: true });
  const f = until(w, inp, { right: true, jump: true }, () => p.state === 'ledge', 140);
  check('ledge grab catches the corner', f >= 0, `state=${p.state} x=${p.x.toFixed(0)} y=${p.y.toFixed(0)}`);
  drive(w, inp, 2, { up: true });
  const f2 = until(w, inp, {}, () => p.onGround && p.state === 'normal', 60);
  check('clamber tops out', f2 >= 0 && p.y <= 6 * TILE + 1, `y=${p.y.toFixed(0)}`);
}

{
  // plunge: pogo off spikes, no damage; then break brick from above
  const { w, inp, p, run } = makeWorld(SPIKE);
  p.x = 7 * TILE + 8; p.y = 4 * TILE; p.px = p.x; p.py = p.y;  // above the spike strip
  const h0 = run.hearts;
  drive(w, inp, 2, { down: true, attack: true });
  check('plunge starts', p.state === 'plunge', p.state);
  const f = until(w, inp, { down: true }, () => evs(w, 'pogo').length > 0, 90);
  check('pogo off spike tops', f >= 0 && run.hearts === h0, `hearts=${run.hearts}`);
  check('pogo refreshes air dash', !p.airDashUsed);

  // brick break: plunge onto the BB columns at col 14
  const { w: w2, inp: i2, p: p2 } = makeWorld(SPIKE);
  p2.x = 14 * TILE + 8; p2.y = 4 * TILE; p2.px = p2.x; p2.py = p2.y;
  drive(w2, i2, 2, { down: true, attack: true });
  until(w2, i2, { down: true }, () => evs(w2, 'plungeland').length > 0 || evs(w2, 'pogo').length > 0, 120);
  check('plunge smashes bricks under feet', evs(w2, 'brickbreak').length > 0,
    JSON.stringify(w2.events.map(e => e.t).slice(0, 8)));
}

{
  // hazard: walking into spikes costs a heart and returns to safe ground
  const { w, inp, p, run } = makeWorld(SPIKE);
  const h0 = run.hearts;
  const f = until(w, inp, { right: true }, () => run.hearts < h0, 300);
  check('spikes hurt', f >= 0, `hearts=${run.hearts}`);
  check('safe-return puts Pip on solid ground', Math.abs(p.x - p.lastSafe.x) < 2 && p.state === 'normal', `x=${p.x.toFixed(0)}`);
}

{
  // swimming
  const { w, inp, p } = makeWorld(WATER_ROOM);
  const f = until(w, inp, { right: true }, () => p.swim, 300);
  check('enters water', f >= 0 && evs(w, 'splash').length > 0);
  inp.feed({});
  drive(w, inp, 30, {});
  const sinkV = p.vy;
  check('gentle sink', sinkV > 0 && sinkV <= P.swimMaxSink + 0.01, `vy=${sinkV.toFixed(2)}`);
  drain(w);
  tap(w, inp, {}, 'jump');
  check('swim stroke lifts', p.vy < -1.5, `vy=${p.vy.toFixed(2)}`);
  // strokes to the surface then leap out
  drain(w);
  let leapt = false, minY = 1e9;
  for (let s = 0; s < 40 && !leapt; s++) {
    tap(w, inp, {}, 'jump', 2);
    for (let k = 0; k < 10; k++) {
      drive(w, inp, 1, {});
      minY = Math.min(minY, p.y);
      if (evs(w, 'waterleap').length > 0) leapt = true;
    }
  }
  drive(w, inp, 12, {});
  minY = Math.min(minY, p.y);
  check('surface leap exits water', leapt && minY < 90, `minY=${minY.toFixed(0)} leap=${leapt}`);
}

{
  // glide
  const runUp = { relic: 'glider' };
  const { w, inp, p } = makeWorld(FLAT, { run: runUp });
  p.y = 2 * TILE; p.py = p.y;                      // high drop
  drive(w, inp, 40, { jump: true });               // hold jump to glide (after buffer consumed on ground? we're airborne)
  check('glide caps fall speed', p.glide && Math.abs(p.vy - P.glideFall) < 0.05, `vy=${p.vy.toFixed(2)} glide=${p.glide}`);
}

// --------------------------------------------------------------- combat --
const DUMMY_ROOM = [
  '............................',
  '............................',
  '............................',
  '............................',
  '............................',
  '............................',
  '............................',
  '..S...y.....................',
  '############################',
  '############################',
];
const dummyOf = (w) => w.entities.find(e => e.constructor.name === 'Dummy');

{
  // 3-hit combo damage into a dummy
  const { w, inp, p } = makeWorld(DUMMY_ROOM);
  const d = dummyOf(w);
  drive(w, inp, 10, {});
  teleport(p, d.x - 22, p.y);
  p.facing = 1;
  for (let i = 0; i < 3; i++) { tap(w, inp, {}, 'attack'); drive(w, inp, 11, {}); }
  drive(w, inp, 40, {});
  check('3-hit combo lands 4 damage', d.taken >= 4, `taken=${d.taken}`);
  check('sword hits build sap', w.run.sap >= C.sapPerHit * 3, `sap=${w.run.sap}`);
}

{
  // charge spin-slash (the initial press swings first; charge builds after)
  const { w, inp, p } = makeWorld(DUMMY_ROOM);
  const d = dummyOf(w);
  drive(w, inp, 10, {});
  teleport(p, d.x - 24, p.y);
  drive(w, inp, C.charge.holdFrames + 30, { attack: true });
  const charged = p.charged;
  inp.feed({});
  drive(w, inp, 24, {});
  check('charge spin-slash: 3 damage all around', charged && d.taken >= C.charge.dmg, `charged=${charged} taken=${d.taken}`);
}

{
  // hit-stop freezes the sim briefly on hits
  const { w, inp, p } = makeWorld(DUMMY_ROOM);
  const d = dummyOf(w);
  drive(w, inp, 10, {});
  teleport(p, d.x - 22, p.y);
  p.facing = 1;
  tap(w, inp, {}, 'attack');
  const f = until(w, inp, {}, () => w.hitstop > 0, 30);
  check('hit-stop triggers on melee hit', f >= 0, `hitstop=${w.hitstop}`);
}

{
  // parry a projectile inside the window
  const { w, inp, p, run } = makeWorld(FLAT);
  drive(w, inp, 10, {});
  teleport(p, 200, p.y);
  const h0 = run.hearts;
  const proj = w.spawnProjectile(p.x - 60, p.y - 8, 2, 0, { kind: 'seed', grav: 0, parryable: true });
  drive(w, inp, 24, {});                      // ~24 frames: projectile 48px closer
  drain(w);
  inp.feed({ parry: true });
  const f = until(w, inp, { parry: true }, () => evs(w, 'parry').length > 0, 12);
  check('parry reflects projectile', f >= 0 && proj.friendly && run.hearts === h0, `f=${f}`);
  check('parry gives sap + freeze', run.sap >= C.sapPerParry && (w.parryFreeze > 0 || w.slowmoT > 0));
}

{
  // same setup, no parry -> damage
  const { w, inp, p, run } = makeWorld(FLAT);
  drive(w, inp, 10, {});
  teleport(p, 200, p.y);
  const h0 = run.hearts;
  w.spawnProjectile(p.x - 60, p.y - 8, 2, 0, { kind: 'seed', grav: 0, parryable: true });
  drive(w, inp, 40, {});
  check('unparried projectile hurts', run.hearts === h0 - 1, `hearts=${run.hearts}`);
}

{
  // early parry whiffs: window expires, lag punished
  const { w, inp, p, run } = makeWorld(FLAT);
  drive(w, inp, 10, {});
  teleport(p, 200, p.y);
  const h0 = run.hearts;
  w.spawnProjectile(p.x - 90, p.y - 8, 2, 0, { kind: 'seed', grav: 0, parryable: true });
  tap(w, inp, {}, 'parry');                   // way too early (45f to impact, window 8)
  drive(w, inp, 60, {});
  check('early parry whiffs and eats the hit', run.hearts === h0 - 1, `hearts=${run.hearts}`);
}

{
  // stomp a bumble
  const rows = FLAT.map((r, i) => i === 10 ? r.slice(0, 8) + 'b' + r.slice(9) : r);
  const { w, inp, p, run } = makeWorld(rows);
  const bumble = w.entities.find(e => e.constructor.name === 'Bumble');
  bumble.active = true;
  p.x = bumble.x + 1; p.y = bumble.y - 50; p.px = p.x; p.py = p.y;
  const f = until(w, inp, {}, () => evs(w, 'stomp').length > 0, 90);
  check('stomp kills bumble + bounces', f >= 0 && bumble.dying > 0 && p.vy < 0, `f=${f} vy=${p.vy.toFixed(1)}`);
}

{
  // shell: stomp -> stun -> grab -> throw -> chain kill; parry ricochet
  const rows = FLAT.map((r, i) => i === 10 ? r.slice(0, 8) + 's' + r.slice(9, 20) + 'b' + r.slice(21) : r);
  const { w, inp, p, run } = makeWorld(rows);
  const shell = w.entities.find(e => e.constructor.name === 'Snapcap');
  const bumble = w.entities.find(e => e.constructor.name === 'Bumble');
  shell.active = true; bumble.active = true;
  p.x = shell.x + 1; p.y = shell.y - 50; p.px = p.x; p.py = p.y;
  until(w, inp, {}, () => shell.mode === 'stunned', 90);
  check('stomp stuns snapcap into shell', shell.mode === 'stunned');
  until(w, inp, {}, () => p.onGround, 60);
  p.x = shell.x; p.px = p.x;
  tap(w, inp, {}, 'attack');
  check('grab stunned shell', p.carry === shell, `carry=${!!p.carry}`);
  p.facing = 1;
  tap(w, inp, {}, 'attack');
  check('throw sends shell sliding', shell.mode === 'slide' && shell.vx > 2, `vx=${shell.vx?.toFixed(1)}`);
  const f = until(w, inp, {}, () => bumble.dying > 0 || bumble.removed, 200);
  check('sliding shell chain-kills', f >= 0);
  // parry the shell as it returns
  shell.x = p.x + 70; shell.vx = -P.shellSpeed; shell.mode = 'slide'; shell.harmful = true; shell.friendlyT = 0;
  drive(w, inp, 14, {});
  drain(w);
  const f2 = until(w, inp, { parry: true }, () => evs(w, 'ricochet').length > 0, 16);
  check('parried shell ricochets away', f2 >= 0 && shell.vx > 0, `vx=${shell.vx?.toFixed(1)}`);
}

{
  // Sunbeam Lance: charge, fire, damage, heat
  const { w, inp, p } = makeWorld(DUMMY_ROOM, { run: { hasBeam: true } });
  const d = dummyOf(w);
  drive(w, inp, 10, {});
  p.facing = 1;
  drive(w, inp, C.beamChargeFrames + 4, { beam: true });
  inp.feed({});
  drive(w, inp, 2, {});
  check('beam fires after charge', p.beamFire > 0, `fire=${p.beamFire}`);
  drive(w, inp, 30, {});
  check('beam damages along the ray', d.taken >= 2, `taken=${d.taken}`);
  check('beam builds heat', p.heat > 10, `heat=${p.heat.toFixed(0)}`);
  // overheat after repeated cycles
  for (let i = 0; i < 3 && p.overheat <= 0; i++) {
    drive(w, inp, C.beamChargeFrames + 4, { beam: true });
    inp.feed({});
    drive(w, inp, C.beamFireFrames + 4, {});
  }
  check('sustained fire overheats', p.overheat > 0 || evs(w, 'overheat').length > 0, `heat=${p.heat.toFixed(0)}`);
}

{
  // beam -> mirror -> crystal -> gate opens
  const MIRROR_ROOM = [
    '............................',
    '............................',
    '............................',
    '..S..........\\..............',
    '#####........................',
    '#####........C..............',
    '#####.......................',
    '#####..D....................',
    '############################',
  ];
  const { w, inp, p } = makeWorld(MIRROR_ROOM, { run: { hasBeam: true } });
  p.x = 40; p.y = 4 * TILE; p.px = p.x; p.py = p.y; p.facing = 1;
  drive(w, inp, C.beamChargeFrames + 4, { beam: true });
  inp.feed({});
  const f = until(w, inp, {}, () => w.gatesOpen, C.beamFireFrames + 20);
  check('mirror routes beam to crystal, gate opens', f >= 0, `open=${w.gatesOpen} segs=${JSON.stringify(w.beamSegs)}`);
  check('open gate is passable', !w.tiles.solid(7, 7));
}

{
  // sap specials: heal channel + bloom burst
  const { w, inp, p, run } = makeWorld(FLAT);
  drive(w, inp, 10, {});
  run.sap = 100; run.hearts = 1;
  drive(w, inp, C.healChannelFrames + 20, { special: true });
  check('heal channel restores a heart', run.hearts === 2, `hearts=${run.hearts} sap=${run.sap}`);

  const rows2 = FLAT.map((r, i) => i === 10 ? r.slice(0, 7) + 'b' + r.slice(8) : r);
  const { w: w2, inp: i2, p: p2, run: r2 } = makeWorld(rows2);
  const bum = w2.entities.find(e => e.constructor.name === 'Bumble');
  bum.active = true;
  drive(w2, i2, 10, {});
  r2.sap = 100;
  drive(w2, i2, 3, { up: true, special: true });
  check('bloom burst nukes nearby enemies', bum.dying > 0 || bum.removed, `hp=${bum.hp}`);
  check('burst spends full gauge', r2.sap <= 10, `sap=${r2.sap}`);   // kill payback sap allowed
}

{
  // wisp: immune until lit by the beam
  const rows = FLAT.map((r, i) => i === 9 ? r.slice(0, 12) + 'w' + r.slice(13) : r);
  const { w, inp, p } = makeWorld(rows, { run: { hasBeam: true } });
  const wisp = w.entities.find(e => e.constructor.name === 'Wisp');
  wisp.active = true;
  drive(w, inp, 10, {});
  p.x = wisp.x - 20; p.px = p.x; p.facing = 1;
  tap(w, inp, {}, 'attack');
  drive(w, inp, 20, {});
  check('unlit wisp shrugs off the sword', wisp.hp === 1 && !wisp.dying, `hp=${wisp.hp}`);
  wisp.x = p.x + 40; wisp.y = p.y - 8;
  drive(w, inp, C.beamChargeFrames + 4, { beam: true });
  inp.feed({});
  const f = until(w, inp, {}, () => wisp.litT > 0, C.beamFireFrames + 10);
  check('beam lights the wisp', f >= 0, `lit=${wisp.litT}`);
  p.x = wisp.x - 20; p.px = p.x; p.y = wisp.y + 14; p.py = p.y;
  tap(w, inp, {}, 'attack');
  const f2 = until(w, inp, {}, () => wisp.dying > 0 || wisp.removed, 30);
  check('lit wisp dies to the sword', f2 >= 0);
}

{
  // warden: shield blocks front slashes; spin breaks it
  const rows = FLAT.map((r, i) => i === 10 ? r.slice(0, 10) + 'a' + r.slice(11) : r);
  const { w, inp, p } = makeWorld(rows);
  const warden = w.entities.find(e => e.constructor.name === 'Warden');
  warden.active = true;
  drive(w, inp, 6, {});
  p.x = warden.x - 24; p.px = p.x; p.facing = 1;
  warden.dir = -1; // facing Pip
  tap(w, inp, {}, 'attack');
  drive(w, inp, 20, {});
  check('warden shield blocks frontal slash', warden.hp === 3 && evs(w, 'clang').length > 0, `hp=${warden.hp}`);
  p.x = warden.x - 26; p.px = p.x;
  warden.stunT = 300;                        // hold it still during the charge
  drive(w, inp, C.charge.holdFrames + 30, { attack: true });
  drive(w, inp, 24, {});
  check('charge spin breaks shield + damages', !warden.shield && warden.hp < 3, `shield=${warden.shield} hp=${warden.hp} charged`);
}

{
  // duelist: parry its lunge to break its guard
  const rows = FLAT.map((r, i) => i === 10 ? r.slice(0, 12) + 'd' + r.slice(13) : r);
  const { w, inp, p, run } = makeWorld(rows);
  const duelist = w.entities.find(e => e.constructor.name === 'Duelist');
  duelist.active = true;
  drive(w, inp, 6, {});
  p.x = duelist.x - 36; p.px = p.x; p.facing = 1;
  const f = until(w, inp, {}, () => duelist.mode === 'windup', 400);
  check('duelist telegraphs a lunge', f >= 0, `mode=${duelist.mode}`);
  // parry as the lunge starts
  until(w, inp, {}, () => duelist.mode === 'lunge', 40);
  const f2 = until(w, inp, { parry: true }, () => duelist.mode === 'guardbreak', 20);
  check('parrying the lunge staggers the duelist', f2 >= 0, `mode=${duelist.mode} hearts=${run.hearts}`);
}

{
  // Moss: mount, chomp, absorb a hit
  const rows = FLAT.map((r, i) => i === 10 ? r.slice(0, 6) + 'm' + r.slice(7, 16) + 'b' + r.slice(17) : r);
  const { w, inp, p, run } = makeWorld(rows);
  const moss = w.entities.find(e => e.constructor.name === 'Moss');
  const bum = w.entities.find(e => e.constructor.name === 'Bumble');
  moss.active = true; bum.active = true;
  const f = until(w, inp, { right: true }, () => p.riding === moss, 300);
  check('Moss mounts on touch', f >= 0);
  const f2 = until(w, inp, { right: true }, () => bum.dying > 0 || bum.removed, 400);
  check('Moss chomps small enemies', f2 >= 0);
  const h0 = run.hearts;
  w.spawnProjectile(p.x + 50, p.y - 8, -2.5, 0, { kind: 'burr', grav: 0, parryable: true });
  drive(w, inp, 40, {});
  check('Moss absorbs one hit', run.hearts === h0 && p.riding === null, `hearts=${run.hearts} riding=${!!p.riding}`);
}

// ------------------------------------------------------------ boss: 1-B --
{
  const makeBossWorld = () => {
    const run = new Run();
    const w = new World(getLevel('1-B'), run, { seed: 11 });
    const inp = new ScriptedInput();
    return { w, run, inp, p: w.player, boss: w.boss };
  };

  {
    const { w, inp, p, boss } = makeBossWorld();
    drive(w, inp, 10, { right: true });
    const f = until(w, inp, { right: true }, () => boss.engaged, 400);
    check('snapjaw engages on approach', f >= 0);
    until(w, inp, {}, () => boss.introT === 0 && boss.mode !== 'wait', 200);
    // armored: sword does nothing outside windows
    teleport(p, boss.x - 24, boss.y);
    p.facing = 1;
    const hp0 = boss.hp;
    tap(w, inp, {}, 'attack');
    drive(w, inp, 20, {});
    check('snapjaw armored outside windows', boss.hp === hp0 && evs(w, 'clang').length > 0, `hp=${boss.hp}`);
  }

  {
    // parry the bite -> stagger -> punish window
    const { w, inp, p, boss, run } = makeBossWorld();
    until(w, inp, { right: true }, () => boss.engaged, 400);
    inp.feed({});
    // pin Pip in front of the king until the bite telegraph comes
    let f = -1;
    for (let i = 0; i < 2500; i++) {
      teleport(p, boss.x - 46, boss.y);
      p.invuln = 5;
      w.step(inp.poll());
      if (boss.mode === 'bitewind') { f = i; break; }
    }
    check('snapjaw telegraphs bite', f >= 0, `mode=${boss.mode}`);
    until(w, inp, {}, () => boss.mode === 'bite', 60);
    p.invuln = 0;
    const f2 = until(w, inp, { parry: true }, () => boss.mode === 'stagger', 30);
    check('parried bite staggers the king', f2 >= 0, `mode=${boss.mode} hearts=${run.hearts}`);
    teleport(p, boss.x - 24, boss.y);
    p.facing = 1;
    const hp0 = boss.hp;
    drive(w, inp, 1, {});
    tap(w, inp, {}, 'attack');
    drive(w, inp, 24, {});
    check('staggered boss takes sword damage', boss.hp < hp0, `hp=${boss.hp}/${hp0}`);
  }

  {
    // charge -> wall stun -> pogo punish; and dash-through immunity
    const { w, inp, p, boss, run } = makeBossWorld();
    until(w, inp, { right: true }, () => boss.engaged, 400);
    inp.feed({});
    teleport(p, 100, 240);
    const f = until(w, inp, {}, () => boss.mode === 'charge', 3000);
    check('snapjaw charges', f >= 0, `mode=${boss.mode}`);
    // dash through the charge without damage
    const h0 = run.hearts;
    let dashed = false;
    for (let i = 0; i < 300 && boss.mode === 'charge'; i++) {
      const closing = Math.abs(boss.x - p.x) < 40 && Math.sign(boss.vx || boss.dir) === Math.sign(p.x - boss.x);
      if (closing && !dashed && p.dashCd <= 0) {
        inp.feed({ dash: true, [boss.x < p.x ? 'left' : 'right']: true });
        dashed = true;
      } else inp.feed({});
      w.step(inp.poll());
    }
    const f2 = boss.mode === 'wallstun' ? 1 : until(w, inp, {}, () => boss.mode === 'wallstun', 600);
    check('charge ends wall-stunned', f2 >= 0, `mode=${boss.mode}`);
    check('dash-through avoids charge damage', run.hearts === h0, `hearts=${run.hearts}/${h0}`);
    // pogo the dazed king (one airborne frame so the plunge can start)
    const hp0 = boss.hp;
    teleport(p, boss.x, boss.y - 70);
    drive(w, inp, 1, { down: true });
    drive(w, inp, 2, { down: true, attack: true });
    drain(w);
    const f3 = until(w, inp, { down: true }, () => evs(w, 'pogo').length > 0, 90);
    check('pogo punishes the wall-stun', f3 >= 0 && boss.hp < hp0, `hp=${boss.hp}/${hp0} f=${f3} st=${p.state}`);
  }

  {
    // the fight is completable: scripted cheese via repeated punish windows
    const { w, inp, p, boss, run } = makeBossWorld();
    run.lives = 99;
    until(w, inp, { right: true }, () => boss.engaged, 400);
    inp.feed({});
    let guard = 0;
    while (!w.finished && guard++ < 12000 && !w.gameOver) {
      if (boss.removed || boss.dying > 0) { w.step(inp.poll()); continue; }
      if (boss.vulnT > 20 && !p.atk && p.state === 'normal') {
        const side = boss.x > 256 ? -1 : 1;    // attack from the open side
        teleport(p, boss.x + side * 24, boss.y);
        p.facing = -side;
        inp.feed({ attack: true });
        w.step(inp.poll());
        inp.feed({});
        w.step(inp.poll());        // poll the release so the next press edges
      } else {
        // stay away from danger while waiting for a window (never mid-punish)
        if (Math.abs(p.x - boss.x) < 90 && boss.vulnT <= 20) teleport(p, boss.x > 256 ? 80 : 430, 240);
        inp.feed({});
        w.step(inp.poll());
      }
      // create windows: parry bites when they come
      if (boss.mode === 'bite' && Math.abs(boss.x - p.x) < 60) {
        inp.feed({ parry: true }); w.step(inp.poll()); inp.feed({});
      }
    }
    check('King Snapjaw is beatable', !!w.finished, `hp=${boss.hp} guard=${guard} gameOver=${w.gameOver}`);
  }
}

// ------------------------------------------------- bosses: 2-B and 3-B --
function beatBoss(levelId, dodge, name) {
  const run = new Run();
  run.lives = 99;
  const w = new World(getLevel(levelId), run, { seed: 5 });
  const inp = new ScriptedInput();
  const p = w.player, boss = w.boss;
  const floor = (w.room.h - 3) * 16;
  until(w, inp, { right: true }, () => boss.engaged, 600);
  inp.feed({});
  let guard = 0;
  while (!w.finished && guard++ < 15000 && !w.gameOver) {
    if (boss.removed || boss.dying > 0) { w.step(inp.poll()); continue; }
    if (boss.vulnT > 20 && !p.atk && p.state === 'normal') {
      const side = boss.x > 256 ? -1 : 1;
      teleport(p, boss.x + side * 26, floor);
      p.facing = -side;
      inp.feed({ attack: true }); w.step(inp.poll());
      inp.feed({}); w.step(inp.poll());
      continue;
    }
    dodge(w, p, boss, floor);
    inp.feed({}); w.step(inp.poll());
  }
  check(`${name} is beatable`, !!w.finished, `hp=${boss.hp} guard=${guard} hearts=${run.hearts} gameOver=${w.gameOver}`);
}

beatBoss('2-B', (w, p, boss, floor) => {
  // stand still so the grub commits, dodge the eruption telegraph
  if (boss.mode === 'emergewind' || boss.mode === 'emerge') {
    if (Math.abs(p.x - boss.x) < 60) teleport(p, boss.x > 256 ? boss.x - 120 : boss.x + 120, floor);
  }
}, 'Grubmaw');

beatBoss('3-B', (w, p, boss, floor) => {
  // sidestep dives; feathers are shrugged off by distance
  if (boss.mode === 'divewind' || boss.mode === 'dive') {
    if (Math.abs(p.x - boss.x) < 90) teleport(p, boss.x > 256 ? 70 : 440, floor);
  }
}, 'Zephyra');

// ------------------------------------------------------ General Bramble --
{
  const run = new Run();
  run.lives = 99;
  const w = new World(getLevel('4-B'), run, { seed: 9 });
  const inp = new ScriptedInput();
  const p = w.player, boss = w.boss;
  const floor = 15 * TILE;
  until(w, inp, { right: true }, () => boss.engaged, 600);
  inp.feed({});
  let guard = 0, prevMode = '', duelSeen = false, parryKills = 0;
  while (!w.finished && guard++ < 40000 && !w.gameOver) {
    if (boss.removed || boss.dying > 0) { w.step(inp.poll()); continue; }
    if (boss.phase === 3) duelSeen = true;
    const justSlashed = (boss.mode === 'whip' || boss.mode === 'duelslash') && prevMode !== boss.mode;
    prevMode = boss.mode;
    if (boss.vulnT > 20 && !p.atk && p.state === 'normal') {
      const side = boss.x > 256 ? -1 : 1;
      teleport(p, boss.x + side * 28, floor);
      p.facing = -side;
      inp.feed({ attack: true }); w.step(inp.poll());
      inp.feed({}); w.step(inp.poll());
      continue;
    }
    if (boss.mode === 'whipwind' || boss.mode === 'duelwind') {
      teleport(p, boss.x + (boss.dir || 1) * 34, floor);
      p.parryLag = 0; p.parryT = 0;
    }
    if (justSlashed) {
      inp.feed({ parry: true }); w.step(inp.poll());
      inp.feed({}); w.step(inp.poll());
      if (boss.mode === 'stagger') parryKills++;
      continue;
    }
    if ((boss.mode === 'lunge' || boss.mode === 'laser' || boss.mode === 'laserwind') && Math.abs(p.x - boss.x) < 130) {
      teleport(p, boss.x > 256 ? 70 : 440, floor);
    }
    p.invuln = Math.max(p.invuln, 3);
    inp.feed({}); w.step(inp.poll());
  }
  check('General Bramble reaches the duel', duelSeen, `phase=${boss.phase} hp=${boss.hp}`);
  check('General Bramble falls to parry timing', !!w.finished, `hp=${boss.hp} guard=${guard} parries=${parryKills}`);
}

// ---------------------------------------------- verifier-model reality checks --
// The reachability BFS assumes these edges are humanly executable; drive the
// real sim through each on real level geometry so the model can't drift.

// generic wall-jump shaft climber: hold toward the wall, hop on regrab
function climbShaft(w, inp, p, untilY, maxHops = 24) {
  for (let hop = 0; hop < maxHops; hop++) {
    const dir = p.facing === 1 ? { right: true } : { left: true };
    const got = until(w, inp, { ...dir, jump: true }, () => p.state === 'wallslide', 120);
    if (got < 0) return false;
    drive(w, inp, 1, dir);
    drive(w, inp, 2, { ...dir, jump: true });
    if (p.y <= untilY) return true;
  }
  return p.y <= untilY;
}

{
  // 1-2 secret shaft: enter from the ground, zigzag to the top runway
  const run = new Run();
  const w = new World(getLevel('1-2'), run, { seed: 3 });
  const inp = new ScriptedInput();
  const p = w.player;
  teleport(p, 103 * TILE + 8, 16 * TILE);           // shaft base, on the floor
  drive(w, inp, 4, {});
  // hop into the slot and grab the left wall (col 102, rows 6-13)
  drive(w, inp, 2, { jump: true, left: true });
  const entered = until(w, inp, { left: true, jump: true }, () => p.state === 'wallslide', 90) >= 0;
  check('1-2 shaft: wall grab from the floor slot', entered, `state=${p.state} y=${p.y.toFixed(0)}`);
  const topped = climbShaft(w, inp, p, 6 * TILE + 8);
  check('1-2 shaft: real sim climbs to the runway', topped, `y=${p.y.toFixed(0)}`);
}

{
  // max dash-gap: measure how many tiles the real run+jump+dash actually clears
  const gapRow = (g) => {
    const rows = [];
    for (let i = 0; i < 10; i++) rows.push('.'.repeat(48));
    rows.push('..S.............................................');
    rows.push('#'.repeat(20) + '.'.repeat(g) + '#'.repeat(28 - g));
    rows.push(rows[rows.length - 1]);
    return rows;
  };
  let maxCleared = 0;
  for (let g = 5; g <= 11; g++) {
    const { w, inp, p } = makeWorld(gapRow(g));
    // run up, jump at the lip, dash at apex, hold right
    let cleared = false;
    let jumped = false, dashed = false;
    for (let i = 0; i < 400; i++) {
      const held = { right: true };
      if (p.x > (19 - 0) * TILE + 8 && p.onGround && !jumped) { held.jump = true; jumped = true; }
      if (jumped) held.jump = true;
      if (jumped && !dashed && p.x > 20 * TILE + 6 && p.vy > -2) { held.dash = true; dashed = true; }
      inp.feed(held);
      w.step(inp.poll());
      if (p.onGround && p.x > (20 + g) * TILE) { cleared = true; break; }
      if (p.y > 13 * TILE) break;   // fell in
    }
    if (cleared) maxCleared = g;
  }
  check(`dash-gap reality: clears at least the verifier's 8 tiles`, maxCleared >= 8, `max=${maxCleared}`);
}

{
  // 2-4 vertical mover: ride from the G ledge up to the F ledge (checkpoint)
  const run = new Run();
  const w = new World(getLevel('2-4'), run, { seed: 3 });
  const inp = new ScriptedInput();
  const p = w.player;
  teleport(p, 33 * TILE + 8, 33 * TILE);            // G ledge, beside the mover
  drive(w, inp, 6, {});
  let riding = false;
  for (let i = 0; i < 2400 && !riding; i++) {
    const m = w.movers[0];
    // wait on the lip; when the platform is low, hop onto it (hold the jump!)
    const platLow = m.cy >= 31 * TILE;
    if (platLow && p.onGround) inp.feed({ right: true, jump: true });
    else if (!p.onGround) inp.feed({ right: true, jump: true });
    else inp.feed(p.x > 34 * TILE ? { left: true } : {});
    w.step(inp.poll());
    if (p.moverRef) riding = true;
    if (p.y > 36 * TILE) teleport(p, 33 * TILE + 8, 33 * TILE);   // missed: reset and retry
  }
  check('2-4 mover: real sim can board it', riding, `y=${p.y.toFixed(0)}`);
  if (riding) {
    const f = until(w, inp, {}, () => p.y <= 23 * TILE, 700);
    check('2-4 mover: rides up to the checkpoint ledge height', f >= 0, `y=${p.y.toFixed(0)}`);
  }
}

{
  // Training Grove shaft: the first shaft players ever meet — climb it for real
  const run = new Run();
  const w = new World(getLevel('gym'), run, { seed: 3 });
  const inp = new ScriptedInput();
  const p = w.player;
  teleport(p, 71 * TILE + 8, 19 * TILE);
  drive(w, inp, 4, {});
  drive(w, inp, 2, { jump: true, left: true });
  const entered = until(w, inp, { left: true, jump: true }, () => p.state === 'wallslide', 90) >= 0;
  check('grove shaft: wall grab works', entered, `state=${p.state}`);
  const topped = climbShaft(w, inp, p, 8 * TILE);
  // ride the last wall jump (jump held for full height) across to the shelf
  until(w, inp, { left: true, jump: true }, () => p.x <= 68 * TILE + 8, 60);
  drive(w, inp, 4, { right: true });                               // brake
  const shelved = until(w, inp, {}, () => p.onGround && p.y <= 7 * TILE + 2, 120) >= 0;
  check('grove shaft: climbs out onto the star shelf', topped && shelved, `y=${p.y.toFixed(0)} x=${p.x.toFixed(0)}`);
}

{
  // Training Grove spring: land on the bloom, get launched to the star shelf
  const run = new Run();
  const w = new World(getLevel('gym'), run, { seed: 3 });
  const inp = new ScriptedInput();
  const p = w.player;
  teleport(p, 132 * TILE + 8, 17 * TILE);           // drop onto the J pad
  drain(w);
  const f = until(w, inp, { jump: true }, () => evs(w, 'spring').length > 0 && p.vy < -6, 90);
  check('spring pad launches on landing', f >= 0, `vy=${p.vy.toFixed(1)}`);
  const f2 = until(w, inp, { jump: true }, () => p.y <= 13 * TILE, 90);
  check('spring reaches the star shelf height', f2 >= 0, `y=${p.y.toFixed(0)}`);
}

{
  // 3-1 updraft: standing into the column carries Pip to the high platform
  const run = new Run();
  const w = new World(getLevel('3-1'), run, { seed: 3 });
  const inp = new ScriptedInput();
  const p = w.player;
  teleport(p, 41 * TILE + 8, 16 * TILE);            // island edge by the c2 column
  drive(w, inp, 4, {});
  drive(w, inp, 2, { right: true, jump: true });
  until(w, inp, { right: true }, () => p.x >= 43 * TILE + 2, 60);   // drift into the column
  const f = until(w, inp, {}, () => p.y <= 5 * TILE, 600);          // let it carry you
  check('3-1 updraft: column lifts to the sky platform', f >= 0, `y=${p.y.toFixed(0)} x=${p.x.toFixed(0)}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
