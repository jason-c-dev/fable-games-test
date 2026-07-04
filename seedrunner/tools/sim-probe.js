#!/usr/bin/env node
// Reality probes: drive the REAL sim headlessly and assert every piece of
// frame data — and every capabilities.js number the verifier/bot plan with
// (Lessons Ledger #1: the model and the sim drift unless forced together).
// Usage: node tools/sim-probe.js [filter]

import { World } from '../js/sim/world.js';
import { Bot } from '../js/sim/bot.js';
import { defineChunk } from '../js/sim/chunks.js';
import '../js/sim/chunklib.js';
import { GYM_RUN } from '../js/sim/runs.js';
import { PLAYER, OBSTACLES, LANES, STEP, SPEED } from '../js/config.js';
import * as cap from '../js/sim/capabilities.js';

const KEYS = ['left', 'right', 'jump', 'slide', 'dash', 'parry'];
let pass = 0, fail = 0, probeN = 0;
const filter = process.argv[2];
const results = [];

function check(name, cond, detail = '') {
  if (filter && !name.includes(filter)) return;
  if (cond) { pass++; results.push(`  ok  ${name}`); }
  else { fail++; results.push(`FAIL  ${name}  ${detail}`); }
}

function makeWorld(lines, { len = 300, speed = 12, biome = 'meadow', tide, seed = 7 } = {}) {
  const id = `probe-${probeN++}`;
  defineChunk({ id, biome, tiers: [0, 6], len, lines });
  return new World({
    id, kind: 'gym', chunks: [id], speedStart: speed, speedEnd: speed,
    tide: tide ?? { creepBase: 0, creepPerTier: 0, startGap: 30 },
  }, { seed });
}

class Feeder {
  constructor() { this.prev = {}; }
  inp(keys = []) {
    const held = {}, pressed = {};
    for (const k of KEYS) { held[k] = keys.includes(k); pressed[k] = held[k] && !this.prev[k]; }
    this.prev = held;
    return { held, pressed };
  }
}

// step until pred or maxFrames; keysFn(world) -> array of held keys
function run(world, keysFn, pred, maxFrames = 1200) {
  const f = new Feeder();
  const seen = [];
  for (let i = 0; i < maxFrames; i++) {
    world.step(f.inp(keysFn ? keysFn(world, i) : []));
    seen.push(...world.events);
    if (pred && pred(world)) return { frames: i + 1, events: seen };
  }
  return { frames: maxFrames, events: seen, timeout: true };
}

const has = (events, t) => events.some((e) => e.t === t);

// ============================================================ capabilities
{
  // full-hold jump: airtime + apex vs closed form
  const w = makeWorld(``, { speed: 12 });
  let apex = 0;
  const f = new Feeder();
  for (let i = 0; i < 10; i++) w.step(f.inp([]));
  const d0 = w.player.d;
  w.step(f.inp(['jump']));
  let frames = 0;
  while (w.player.state === 'air' && frames < 300) { w.step(f.inp(['jump'])); apex = Math.max(apex, w.player.y); frames++; }
  const airDist = w.player.d - d0;
  check('cap.airtime', Math.abs(frames + 1 - cap.jumpAirtime() / STEP) <= 2, `sim=${frames + 1}f model=${(cap.jumpAirtime() / STEP).toFixed(1)}f`);
  check('cap.apex', Math.abs(apex - cap.jumpApex()) < 0.09, `sim=${apex.toFixed(3)} model=${cap.jumpApex().toFixed(3)}`);
  check('cap.jumpDistance', Math.abs(airDist - cap.jumpDistance(12)) < 0.6, `sim=${airDist.toFixed(2)} model=${cap.jumpDistance(12).toFixed(2)}`);
}
{
  // lane switch takes exactly switchFrames
  const w = makeWorld(``);
  const f = new Feeder();
  for (let i = 0; i < 5; i++) w.step(f.inp([]));
  w.step(f.inp(['right']));
  let frames = 1;
  while (Math.abs(w.player.x - LANES.width) > 1e-6 && frames < 60) { w.step(f.inp(['right'])); frames++; }
  check('cap.laneSwitch', frames === LANES.switchFrames, `sim=${frames}f cfg=${LANES.switchFrames}f`);
}
{
  // slide min (tap) and max (hold) lengths
  for (const [mode, hold, frames] of [['min', 1, PLAYER.slideMinFrames], ['max', 999, PLAYER.slideMaxFrames]]) {
    const w = makeWorld(``, { speed: 12 });
    const f = new Feeder();
    for (let i = 0; i < 5; i++) w.step(f.inp([]));
    const d0 = w.player.d;
    let i = 0, slid = 0;
    while (i < 200) {
      w.step(f.inp(i < hold ? ['slide'] : []));
      i++;
      if (w.player.sliding) slid++;
      if (slid > 0 && !w.player.sliding) break;
    }
    const len = w.player.d - d0 - 12 * STEP; // subtract the pre-slide frame
    const model = mode === 'min' ? cap.slideLenMin(12) : cap.slideLenMax(12);
    check(`cap.slideLen.${mode}`, Math.abs(slid - frames) <= 1 && Math.abs(len - model) < 0.5, `sim=${slid}f/${len.toFixed(2)}m model=${frames}f/${model.toFixed(2)}m`);
  }
}
{
  // dash length
  const w = makeWorld(``, { speed: 12 });
  const f = new Feeder();
  for (let i = 0; i < 5; i++) w.step(f.inp([]));
  const d0 = w.player.d;
  w.step(f.inp(['dash']));
  let frames = 1;
  while (w.player.dashT > 0 && frames < 100) { w.step(f.inp([])); frames++; }
  const extra = (w.player.d - d0) - 12 * STEP * frames;
  const modelExtra = cap.dashLen(12) - 12 * (PLAYER.dashFrames * STEP);
  check('cap.dashLen', Math.abs(extra - modelExtra) < 0.35, `simExtra=${extra.toFixed(2)} modelExtra=${modelExtra.toFixed(2)}`);
}
{
  // blockJumpWindow: pressing at the model's latest distance clears the
  // block; pressing 0.8m later does not
  for (const [name, offset, wantClear] of [['latest-ok', 0.05, true], ['late-hits', -0.8, false]]) {
    const w = makeWorld(`block C 60`, { speed: 12 });
    const [latest] = cap.blockJumpWindow(12);
    const f = new Feeder();
    let jumped = false;
    const r = run(w, (w) => {
      if (!jumped && 60 - w.player.d <= latest + offset) { jumped = true; return ['jump']; }
      return jumped ? ['jump'] : [];
    }, (w) => w.player.d > 63 || w.player.stumbleT > 0, 600);
    check(`cap.blockJump.${name}`, wantClear ? !has(r.events, 'stumble') : has(r.events, 'stumble'), `events=${r.events.map((e) => e.t).join(',')}`);
  }
}

// ============================================================== frame data
{
  // jump buffer: press N frames before landing -> jump executes on landing
  const w = makeWorld(``, { speed: 12 });
  const f = new Feeder();
  for (let i = 0; i < 5; i++) w.step(f.inp([]));
  w.step(f.inp(['jump']));
  while (w.player.vy > 0) w.step(f.inp(['jump']));
  // falling now: press jump a few frames before landing
  while (w.player.y > 0.45) w.step(f.inp([]));
  w.step(f.inp(['jump'])); // buffered press while airborne
  // the buffered press must re-fire on/right after the landing frame
  let rejumped = -1;
  for (let i = 0; i < 30; i++) {
    w.step(f.inp([]));
    if (w.events.some((e) => e.t === 'jump')) { rejumped = i; break; }
  }
  check('buffer.jump', rejumped >= 0 && rejumped <= PLAYER.bufferFrames + 2, `rejumped after ${rejumped}f`);
}
{
  // coyote: jump 5 frames after walking off an edge works, 10 frames does not
  for (const [name, delay, want] of [['ok', 5, true], ['expired', PLAYER.coyoteFrames + 3, false]]) {
    const w = makeWorld(`gap C 60 len=4`, { speed: 12 });
    let air = -1;
    const r = run(w, (w, i) => {
      if (w.player.state === 'air' && air < 0) air = i;
      if (air >= 0 && i >= air + delay) return ['jump'];
      return [];
    }, (w) => w.player.d > 66 || has(w.events, 'fall'), 700);
    const jumped = r.events.some((e) => e.t === 'jump' && e.coyote);
    check(`coyote.${name}`, want ? (jumped && !has(r.events, 'fall')) : (!jumped && has(r.events, 'fall')), `jumped=${jumped} events=${r.events.filter((e) => ['jump', 'fall'].includes(e.t)).map((e) => e.t).join(',')}`);
  }
}
{
  // slide-cancel into jump
  const w = makeWorld(``, { speed: 12 });
  const f = new Feeder();
  for (let i = 0; i < 5; i++) w.step(f.inp([]));
  w.step(f.inp(['slide']));
  for (let i = 0; i < 8; i++) w.step(f.inp(['slide']));
  check('slidecancel.pre', w.player.sliding, `state=${w.player.state}`);
  w.step(f.inp(['slide', 'jump']));
  check('slidecancel.jump', w.player.state === 'air', `state=${w.player.state}`);
}
{
  // dash i-frames pass a barrier; dash on cooldown is refused; parry refreshes
  const w = makeWorld(`barrier C 60\nbarrier C 120`, { speed: 12 });
  let dashed = false;
  const r = run(w, (w) => {
    if (!dashed && 60 - w.player.d <= cap.dashLen(12) * 0.5) { dashed = true; return ['dash']; }
    return [];
  }, (w) => w.player.d > 65, 600);
  check('dash.iframes', has(r.events, 'barrierdash') && !has(r.events, 'stumble'), r.events.map((e) => e.t).join(','));
  const cdBefore = w.player.dashCd;
  const f2 = new Feeder();
  w.step(f2.inp(['dash']));
  check('dash.cooldown', w.player.dashT === 0 && w.player.dashCd <= cdBefore, `dashT=${w.player.dashT}`);
  w.player.refreshDash();
  check('dash.refresh', w.player.dashCd === 0, `cd=${w.player.dashCd}`);
}
{
  // parry window edges: press k frames before impact
  for (const [name, k, want] of [['inside', 4, true], ['edge', PLAYER.parryWindowFrames - 1, true], ['early', PLAYER.parryWindowFrames + 4, false]]) {
    const w = makeWorld(`barrier C 60`, { speed: 12 });
    let pressed = false;
    const r = run(w, (w) => {
      const framesToImpact = (60 - PLAYER.radius - w.player.d) / (12 * STEP);
      if (!pressed && framesToImpact <= k) { pressed = true; return ['parry']; }
      return [];
    }, (w) => w.player.d > 63, 600);
    check(`parry.${name}`, want ? (has(r.events, 'parry') && !has(r.events, 'stumble')) : (!has(r.events, 'parry') && has(r.events, 'stumble')), r.events.filter((e) => ['parry', 'parrywhiff', 'stumble'].includes(e.t)).map((e) => e.t).join(','));
  }
}
{
  // stumble -> fragile death; fragile expiry -> survives two spaced hits
  const near = makeWorld(`block C 60\nblock C 75`, { speed: 12 });   // ~1.25s apart
  const r1 = run(near, () => [], (w) => w.dead || w.player.d > 80, 800);
  check('fragile.dies', near.dead && has(r1.events, 'dead'), `dead=${near.dead}`);
  const far = makeWorld(`block C 60\nblock C 105`, { speed: 12 });   // ~3.75s apart
  const r2 = run(far, () => [], (w) => w.dead || w.player.d > 110, 900);
  check('fragile.recovers', !far.dead && r2.events.length >= 0 && far.stumbles === 2, `dead=${far.dead} stumbles=${far.stumbles}`);
}
{
  // tide: surge on stumble, push on parry, catch kills, gap clamps
  const w = makeWorld(`block C 60`, { speed: 12, tide: { creepBase: 0, creepPerTier: 0, startGap: 20 } });
  const g0 = w.tide.gap;
  run(w, () => [], (w) => w.stumbles > 0, 600);
  check('tide.surge', g0 - w.tide.gap >= w.tideCfg.stumbleSurge - 0.5, `gap ${g0.toFixed(1)}->${w.tide.gap.toFixed(1)}`);

  const w2 = makeWorld(`barrier C 60`, { speed: 12, tide: { creepBase: 0, creepPerTier: 0, startGap: 20 } });
  let pressed = false;
  const gBefore = w2.tide.gap;
  run(w2, (w) => {
    const fti = (60 - PLAYER.radius - w.player.d) / (12 * STEP);
    if (!pressed && fti <= 6) { pressed = true; return ['parry']; }
    return [];
  }, (w) => w.parries > 0, 600);
  check('tide.parrypush', w2.tide.gap > gBefore + w2.tideCfg.parryPush - 1, `gap ${gBefore.toFixed(1)}->${w2.tide.gap.toFixed(1)}`);

  const w3 = makeWorld(``, { speed: 12, tide: { creepBase: 40, creepPerTier: 0, startGap: 5 } });
  const r3 = run(w3, () => [], (w) => w.dead, 300);
  check('tide.catch', w3.dead && w3.deathCause === 'tide', `cause=${w3.deathCause} t/o=${!!r3.timeout}`);

  const w4 = makeWorld(``, { speed: 12, tide: { creepBase: -80, creepPerTier: 0, startGap: 20, maxGap: 34 } });
  run(w4, () => [], null, 240);
  check('tide.maxclamp', w4.tide.gap <= w4.tideCfg.maxGap + 0.01, `gap=${w4.tide.gap.toFixed(1)}`);
}
{
  // gap fall: vine rescue at far edge + tide surge, chain broken
  const w = makeWorld(`gap C 60 len=6`, { speed: 12, tide: { creepBase: 0, creepPerTier: 0, startGap: 20 } });
  const r = run(w, () => [], (w) => has(w.events, 'fall') || w.player.d > 70, 700);
  check('gapfall.rescue', has(r.events, 'fall') && !w.dead && w.player.d >= 66 && w.player.y === 0, `d=${w.player.d.toFixed(1)} y=${w.player.y}`);
}
{
  // wind bends airborne drift; ground steering recovers after landing
  const w = makeWorld(`wind A 40 len=40 dir=1`, { speed: 12 });
  const f = new Feeder();
  while (w.player.d < 45) w.step(f.inp([]));
  w.step(f.inp(['jump']));
  let maxOff = 0;
  while (w.player.state === 'air') { w.step(f.inp(['jump'])); maxOff = Math.max(maxOff, Math.abs(w.player.x)); }
  check('wind.drift', maxOff > 0.25, `maxOff=${maxOff.toFixed(2)}`);
  for (let i = 0; i < 20; i++) w.step(f.inp([]));
  check('wind.recover', Math.abs(w.player.x) < 0.1, `x=${w.player.x.toFixed(2)}`);
}
{
  // input latched through parry hit-stop/slow-mo: jump lands after freeze
  const w = makeWorld(`barrier C 60`, { speed: 12 });
  let pressed = false, jumpQueued = false;
  const r = run(w, (w) => {
    const fti = (60 - PLAYER.radius - w.player.d) / (12 * STEP);
    if (!pressed && fti <= 6) { pressed = true; return ['parry']; }
    if (w.hitstop > 0 && !jumpQueued) { jumpQueued = true; return ['jump']; }
    return [];
  }, (w) => jumpQueued && w.player.state === 'air', 700);
  check('latch.hitstop', !r.timeout && w.player.state === 'air', `timeout=${!!r.timeout}`);
}
{
  // ramp: boost + elevated dew arc collected on the flight
  const w = makeWorld(`ramp C 60\n${['dew C 63 y=1.2', 'dew C 66 y=1.4', 'dew C 68 y=0.8'].join('\n')}`, { speed: 12 });
  const r = run(w, () => [], (w) => w.player.d > 75, 700);
  check('ramp.boost', has(r.events, 'ramp') && w.dew >= 2, `dew=${w.dew}`);
}
{
  // checkpoint: crossing records; restore rebuilds state
  const w = makeWorld(`dew C 30..40 step=2\ncheckpoint C 60`, { speed: 12 });
  run(w, () => [], (w) => !!w.checkpoint, 700);
  check('checkpoint.set', w.checkpoint && Math.abs(w.checkpoint.d - 60) < 1, `cp=${JSON.stringify(w.checkpoint)}`);
  const w2 = new World(w.def, { seed: 7, checkpoint: w.checkpoint });
  check('checkpoint.restore', Math.abs(w2.player.d - 60) < 1 && w2.dew === w.checkpoint.dew, `d=${w2.player.d} dew=${w2.dew}`);
}
{
  // near-miss: a tight block clearance pushes the tide back + trims dash cd
  const w = makeWorld(`block C 60`, { speed: 12, tide: { creepBase: 0, creepPerTier: 0, startGap: 20 } });
  let jumped = false;
  const [latest] = cap.blockJumpWindow(12);
  const r = run(w, (w) => {
    if (!jumped && 60 - w.player.d <= latest + 0.1) { jumped = true; }
    return jumped ? ['jump'] : [];
  }, (w) => w.player.d > 64, 600);
  check('nearmiss.block', has(r.events, 'nearmiss') && !has(r.events, 'stumble'), r.events.map((e) => e.t).join(','));
}
{
  // determinism: same seed + same inputs -> identical trajectories
  const mk = () => makeWorld(`block C 40\nbarrier C 80\ngap C 120 len=4\ndew C 20..140 step=6`, { speed: 12, seed: 99 });
  const a = mk(), b = new World(a.def, { seed: 99 });
  const fa = new Feeder(), fb = new Feeder();
  const script = (i) => (i % 90 === 30 ? ['jump'] : i % 90 === 60 ? ['slide'] : []);
  for (let i = 0; i < 600; i++) { a.step(fa.inp(script(i))); b.step(fb.inp(script(i))); }
  const sig = (w) => [w.player.d.toFixed(6), w.player.x.toFixed(6), w.player.y.toFixed(6), w.dew, w.tide.d.toFixed(6)].join('|');
  check('determinism', sig(a) === sig(b), `${sig(a)} vs ${sig(b)}`);
}
{
  // seed + shrine: carry and plant
  const w = makeWorld(`seed C 40\nshrine C 80`, { speed: 12 });
  const r = run(w, () => [], (w) => w.finished, 700);
  check('seed.plant', w.carrying && w.finished && r.events.some((e) => e.t === 'win' && e.planted), `carrying=${w.carrying}`);
}

// ================================================================= the bot
{
  // frame-perfect bot AND human-reaction bot both clear the gym unhurt
  for (const [name, reaction] of [['perfect', 0], ['human', SPEED.reactionFloor + SPEED.inputLatency]]) {
    const w = new World(GYM_RUN, { seed: 3 });
    const bot = new Bot(w, { reaction });
    let frames = 0;
    while (!w.finished && !w.dead && frames < 60 * 120) { w.step(bot.step()); frames++; }
    check(`bot.gym.${name}`, w.finished && w.stumbles === 0 && !w.dead, `finished=${w.finished} stumbles=${w.stumbles} dead=${w.dead} d=${w.player.d.toFixed(0)}/${w.track.length}`);
  }
}

console.log(results.join('\n'));
console.log(`\nsim-probe: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
