#!/usr/bin/env node
// Difficulty-curve audit: for every threat in every campaign run (plus an
// endless sample), how much time does a player have between an obstacle
// becoming readable and the last possible action? Prints the distribution
// per run; the minimum must clear the reaction floor with margin.

import { World } from '../js/sim/world.js';
import '../js/sim/chunklib.js';
import { RUNS, GYM_RUN, ENDLESS_RUN } from '../js/sim/runs.js';
import { SPEED, PLAYER, STEP } from '../js/config.js';
import * as cap from '../js/sim/capabilities.js';

const THREATS = new Set(['block', 'arch', 'barrier', 'gap']);
const FLOOR = SPEED.reactionFloor + SPEED.inputLatency;

function actionLead(it, speed) {
  // seconds before impact the verb must start
  if (it.type === 'block') return cap.blockJumpWindow(speed)[0] / speed;
  if (it.type === 'gap') return 0.15;
  if (it.type === 'arch') return (speed * 6 * STEP + 1.2) / speed;
  if (it.type === 'barrier') return PLAYER.parryWindowFrames * STEP;
  return 0.1;
}

function audit(def, endlessCap) {
  const w = new World(def, { seed: 5 });
  if (def.kind === 'endless') {
    // materialize enough track for a sample
    while (w.track.length < endlessCap) w.track.append(def.composer(w));
  }
  const windows = [];
  for (const it of w.track.items) {
    if (!THREATS.has(it.type)) continue;
    const speed = w.speedAt(it.d);
    const dark = w.track.biomeAt(it.d) === 'cavern' && it.type !== 'barrier' && !w.track.litAt(it.d);
    const vis = dark ? SPEED.darkVisibility : SPEED.visibility;
    windows.push({ t: vis / speed - actionLead(it, speed), it, speed });
  }
  windows.sort((a, b) => a.t - b.t);
  const q = (f) => windows[Math.floor(f * (windows.length - 1))]?.t ?? 0;
  const min = windows[0];
  const ok = min && min.t > FLOOR + 0.15;
  console.log(
    `${def.id.padEnd(8)} threats=${String(windows.length).padStart(3)}  ` +
    `min=${min?.t.toFixed(2)}s (${min?.it.type}@${min?.it.d.toFixed(0)}m ${min?.speed.toFixed(1)}m/s)  ` +
    `p25=${q(0.25).toFixed(2)}s  median=${q(0.5).toFixed(2)}s  floor=${FLOOR.toFixed(2)}s  ${ok ? 'OK' : 'TOO TIGHT'}`);
  return ok;
}

let allOk = true;
for (const def of [GYM_RUN, ...RUNS]) allOk = audit(def) && allOk;
allOk = audit(ENDLESS_RUN, 3200) && allOk;
process.exit(allOk ? 0 : 1);
