#!/usr/bin/env node
// The chunk verifier. Two layers, both against the REAL sim:
//
// 1. Dynamic: a reaction-limited bot (human floor + input latency) plays
//    every chunk at every tier it can appear at, entered from every lane,
//    padded fore/aft. It must finish with ZERO stumbles/falls — if the bot
//    can't clear it cleanly with human reactions, a player can't either.
// 2. Static: capability checks that the bot could pass by luck — arch spans
//    vs slide length, gap length vs jump distance (or a free lane), dew
//    reachability, telegraph budget, endless-composition entry/exit margins.
//
// Campaign sequences are verified end-to-end the same way, at their real
// speed curves. Zero problems required. Usage:
//   node tools/verify-chunks.js [--chunk id] [--run id] [-v]

import { World } from '../js/sim/world.js';
import { Bot } from '../js/sim/bot.js';
import { allChunks, getChunk, laneX } from '../js/sim/chunks.js';
import '../js/sim/chunklib.js';
import { RUNS, GYM_RUN } from '../js/sim/runs.js';
import { SPEED, PLAYER, OBSTACLES, LANES } from '../js/config.js';
import * as cap from '../js/sim/capabilities.js';

const problems = [];
const verbose = process.argv.includes('-v');
const onlyChunk = process.argv.includes('--chunk') ? process.argv[process.argv.indexOf('--chunk') + 1] : null;
const onlyRun = process.argv.includes('--run') ? process.argv[process.argv.indexOf('--run') + 1] : null;
const REACTION = SPEED.reactionFloor + SPEED.inputLatency;
const problem = (where, msg) => problems.push(`${where}: ${msg}`);

const THREATS = new Set(['block', 'arch', 'barrier', 'gap']);

// ---------------------------------------------------------------- dynamic --
function playChunk(chunk, tierSpeed, entryLane) {
  const def = {
    id: `verify-${chunk.id}`, kind: 'gym',
    chunks: ['pad-20', chunk.id, 'pad-30'],
    speedStart: tierSpeed, speedEnd: tierSpeed,
    tide: { creepBase: 0, creepPerTier: 0, startGap: 34, maxGap: 34 },
  };
  const w = new World(def, { seed: 11 });
  w.player.lane = entryLane;
  w.player.x = laneX(entryLane);
  const bot = new Bot(w, { reaction: REACTION });
  const maxFrames = ((20 + chunk.len + 30) / tierSpeed + 6) * 60;
  let fell = false;
  for (let f = 0; f < maxFrames; f++) {
    w.step(bot.step());
    if (w.events.some((e) => e.t === 'fall')) fell = true;
    if (w.dead || w.player.d > 20 + chunk.len + 8) break;
  }
  return { w, fell, done: w.player.d > 20 + chunk.len + 4 };
}

function verifyChunkDynamic(chunk) {
  const [tMin, tMax] = chunk.tiers;
  for (let tier = tMin; tier <= tMax; tier++) {
    const speed = SPEED.tiers[tier];
    for (const lane of [-1, 0, 1]) {
      const { w, fell, done } = playChunk(chunk, speed, lane);
      const where = `${chunk.id} @t${tier}(${speed}m/s) lane ${lane}`;
      if (w.dead) problem(where, `bot DIED (${w.deathCause}) at d=${(w.player.d - 20).toFixed(1)}`);
      else if (w.stumbles > 0) problem(where, `bot stumbled x${w.stumbles} (first at ~${(w.player.d - 20).toFixed(1)})`);
      else if (fell) problem(where, 'bot fell into a gap');
      else if (!done) problem(where, `bot never finished (stuck at ${(w.player.d - 20).toFixed(1)}/${chunk.len})`);
      else if (verbose) console.log(`  ok ${where}`);
    }
  }
}

// ----------------------------------------------------------------- static --
function verifyChunkStatic(chunk) {
  const id = chunk.id;
  const speedMin = SPEED.tiers[chunk.tiers[0]];
  const speedMax = SPEED.tiers[chunk.tiers[1]];

  const byLane = { '-1': [], 0: [], 1: [] };
  for (const it of chunk.items) if (THREATS.has(it.type)) byLane[it.lane]?.push(it);

  for (const laneKey of Object.keys(byLane)) {
    const items = byLane[laneKey];
    // contiguous arch spans must fit in one max slide at the slowest speed
    let archStart = null, archEnd = null;
    const flushArch = () => {
      if (archStart == null) return;
      const span = archEnd - archStart + OBSTACLES.archDepth;
      if (cap.slideLenMax(speedMin) <= span + 1.4) {
        problem(id, `lane ${laneKey}: arch corridor ${archStart}..${archEnd} (${span.toFixed(1)}m) exceeds max slide ${cap.slideLenMax(speedMin).toFixed(1)}m at ${speedMin}m/s`);
      }
      archStart = null;
    };
    for (const it of items) {
      if (it.type === 'arch') {
        if (archStart == null) { archStart = it.d; archEnd = it.d; }
        else if (it.d - archEnd < OBSTACLES.archDepth + 3.2) archEnd = it.d;
        else { flushArch(); archStart = it.d; archEnd = it.d; }
      }
    }
    flushArch();

    // gaps: crossable at the slowest tier or escapable sideways
    for (const it of items) {
      if (it.type !== 'gap') continue;
      const len = it.dEnd - it.d;
      if (cap.maxGapCross(speedMin) >= len + 0.9) continue;
      const escape = [-1, 0, 1].some((l) => l !== it.lane &&
        !chunk.items.some((o) => THREATS.has(o.type) && o.lane === l &&
          (o.dEnd ?? o.d) >= it.d - Math.max(8, speedMax * 0.8) && o.d <= it.dEnd + 6));
      if (!escape) problem(id, `lane ${it.lane}: gap ${it.d}..${it.dEnd} too long to jump at ${speedMin}m/s and no clear escape lane`);
    }
  }

  // dew reachability: ground band or full-jump/ramp band
  const apex = cap.jumpApex();
  for (const it of chunk.items) {
    if (it.type === 'dew' && (it.y ?? 0) > apex + 0.75) {
      const ramp = chunk.items.some((r) => r.type === 'ramp' && r.lane === it.lane && it.d - r.d > 0 && it.d - r.d < 14);
      if (!ramp) problem(id, `dew at ${it.d} y=${it.y} above jump apex ${apex.toFixed(2)} with no ramp before it`);
    }
  }

  // endless-eligible chunks need clean entry/exit margins from any lane
  if (!chunk.noEndless && !id.startsWith('pad')) {
    for (const it of chunk.items) {
      if (THREATS.has(it.type) && it.d < 5) problem(id, `endless chunk has a ${it.type} at ${it.d}m — needs >=5m entry margin`);
      if (THREATS.has(it.type) && (it.dEnd ?? it.d) > chunk.len - 3) problem(id, `endless chunk has a ${it.type} ending at ${(it.dEnd ?? it.d)}m — needs >=3m exit margin`);
    }
  }
}

// -------------------------------------------------------------- campaigns --
function verifyRun(def) {
  const w = new World(def, { seed: 1 });
  const bot = new Bot(w, { reaction: REACTION });
  const maxFrames = (w.track.length / def.speedStart + 30) * 60;
  for (let f = 0; f < maxFrames; f++) {
    w.step(bot.step());
    if (w.dead || w.finished) break;
  }
  const where = `run ${def.id}`;
  if (w.dead) problem(where, `bot DIED (${w.deathCause}) at d=${w.player.d.toFixed(0)}/${w.track.length}`);
  else if (!w.finished) problem(where, `bot never finished (d=${w.player.d.toFixed(0)}/${w.track.length})`);
  else {
    if (w.stumbles > 0) problem(where, `bot stumbled x${w.stumbles} — no-hit line must exist`);
    if (def.kind === 'campaign' && !w.carrying) problem(where, 'bot finished without the Sun Seed');
    if (verbose) console.log(`  ok ${where}: ${(w.frame / 60).toFixed(0)}s, ${w.dew} dew, tide gap ${w.tide.gap.toFixed(1)}`);
  }
  // every campaign run needs a checkpoint and a shrine
  if (def.kind === 'campaign') {
    if (!w.track.items.some((i) => i.type === 'checkpoint')) problem(where, 'no checkpoint');
    if (!w.track.items.some((i) => i.type === 'shrine')) problem(where, 'no shrine');
    if (!w.track.items.some((i) => i.type === 'seed')) problem(where, 'no Sun Seed');
  }
}

// ------------------------------------------------------------------- main --
// global timing budget: a telegraph must always fit reaction + parry window
if (SPEED.telegraphTime < REACTION + PLAYER.parryWindowFrames / 60 + 0.2) {
  problem('config', `telegraphTime ${SPEED.telegraphTime}s < reaction ${REACTION}s + parry window + 0.2s`);
}

const chunks = allChunks().filter((c) => !c.id.startsWith('pad') && !c.id.startsWith('probe-'));
for (const chunk of chunks) {
  if (onlyChunk && chunk.id !== onlyChunk) continue;
  if (onlyRun) continue;
  verifyChunkStatic(chunk);
  verifyChunkDynamic(chunk);
}

for (const def of [GYM_RUN, ...RUNS]) {
  if (onlyRun && def.id !== onlyRun) continue;
  if (onlyChunk) continue;
  verifyRun(def);
}

if (problems.length) {
  console.log(problems.map((p) => 'PROBLEM ' + p).join('\n'));
  console.log(`\nverify-chunks: ${problems.length} problems`);
  process.exit(1);
}
console.log(`verify-chunks: 0 problems (${chunks.length} chunks × tiers × lanes, ${1 + RUNS.length} runs)`);
