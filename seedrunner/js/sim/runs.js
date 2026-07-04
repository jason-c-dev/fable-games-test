// Run definitions: the six campaign Sowing Runs, the endless composer, and
// the gym. Campaign runs are fixed chunk sequences at hand-tuned speed
// curves; endless composes verified chunks only. Node-safe.

import './chunklib.js';
import { allChunks } from './chunks.js';
import { tierOf } from './tide.js';

export const GYM_RUN = {
  id: 'gym', name: 'The Feel Gym', kind: 'gym', biome: 'meadow',
  chunks: ['pad-20', 'gym-jump', 'gym-slide', 'gym-lane', 'gym-parry', 'gym-dash', 'gym-mix'],
  speedStart: 10, speedEnd: 12,
  tide: { creepBase: 0.05, creepPerTier: 0 },
};

export const RUNS = [];           // campaign runs land in P3/P4/P6

// endless: verified-chunk composition, biome rotation, no immediate repeats
export function endlessComposer(world) {
  const speed = world.speedAt(world.track.length);
  const tier = tierOf(speed);
  world._recent ||= [];
  world._biomeMeter ||= { i: 0, left: 260 };

  const bm = world._biomeMeter;
  if (bm.left <= 0) { bm.i = (bm.i + 1) % 4; bm.left = 220 + world.rng() * 160; }
  const biome = ['meadow', 'cavern', 'cloudline', 'wastes'][bm.i];

  const pool = allChunks().filter((c) =>
    c.biome === biome && !c.id.startsWith('gym') && !c.id.startsWith('pad') &&
    !c.noEndless && tier >= c.tiers[0] && tier <= c.tiers[1] &&
    !world._recent.includes(c.id));
  const fallback = allChunks().filter((c) => c.id === 'pad-30');
  const pick = pool.length ? pool[(world.rng() * pool.length) | 0] : fallback[0];
  world._recent.push(pick.id);
  if (world._recent.length > 3) world._recent.shift();
  bm.left -= pick.len;
  return pick.id;
}

export const ENDLESS_RUN = {
  id: 'endless', name: 'Endless Seedway', kind: 'endless',
  chunks: ['pad-30'],
  endless: { base: 10, perM: 1 / 110, cap: 22.5 },
  composer: endlessComposer,
  tide: { creepBase: 0.1 },
};

export function runById(id) {
  if (id === 'gym') return GYM_RUN;
  if (id === 'endless') return ENDLESS_RUN;
  const r = RUNS.find((r) => r.id === id);
  if (!r) throw new Error(`unknown run ${id}`);
  return r;
}
