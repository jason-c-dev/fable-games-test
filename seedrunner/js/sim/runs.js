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

export const RUNS = [
  {
    id: 'run1', name: 'Sowing Run I — Meadow Seedway', kind: 'campaign', biome: 'meadow',
    world: 0, seedName: 'the Dawn Seed',
    chunks: [
      'pad-20', 'm-tut-run', 'm-tut-jump', 'm-tut-lane', 'm-tut-slide', 'm-hop-1',
      'cp-25', 'm-tut-dash', 'm-tut-parry', 'm-seed', 'm-hop-2', 'm-weave',
      'm-gap-hop', 'm-breather', 'm-parry-1', 'm-slide-row', 'm-ramp-flow', 'm-mix-1',
      'finish-45',
    ],
    speedStart: 10, speedEnd: 12.5,
    tide: { creepBase: 0.08, creepPerTier: 0.04 },
  },
  {
    id: 'run2', name: 'Sowing Run II — Deeproot Cavern', kind: 'campaign', biome: 'cavern',
    world: 1, seedName: 'the Ember Seed',
    chunks: [
      'pad-20', 'c-intro', 'c-lantern-1', 'c-arch-run', 'c-dark-weave',
      ['cp-25', 'cavern'], ['m-seed', 'cavern'], 'c-crystal-gap', 'c-parry-glow',
      'c-breather', 'c-dark-weave', 'c-mix', 'c-arch-run', ['finish-45', 'cavern'],
    ],
    speedStart: 11, speedEnd: 13.5,
    tide: { creepBase: 0.1, creepPerTier: 0.05 },
  },
  {
    id: 'run3', name: 'Sowing Run III — Cloudline Spans', kind: 'campaign', biome: 'cloudline',
    world: 2, seedName: 'the Sky Seed',
    chunks: [
      'pad-20', 'l-intro', 'l-gap-span', 'l-wind-1', 'l-ramp-soar',
      ['cp-25', 'cloudline'], ['m-seed', 'cloudline'], 'l-wind-gap', 'l-arch-wind',
      'l-breather', 'l-parry-1', 'l-gap-span', 'l-wind-1', ['finish-45', 'cloudline'],
    ],
    speedStart: 11.5, speedEnd: 14,
    tide: { creepBase: 0.11, creepPerTier: 0.05 },
  },
  {
    id: 'run4', name: 'Sowing Run IV — Bramble Wastes', kind: 'campaign', biome: 'wastes',
    world: 3, seedName: 'the Thorn Seed',
    chunks: [
      'pad-20', 'w-intro', 'w-thorn-field', 'w-gauntlet-1', 'w-weave-2',
      ['cp-25', 'wastes'], ['m-seed', 'wastes'], 'w-gap-rot', 'w-gauntlet-2',
      'w-breather', 'w-mix-3', 'w-thorn-field', ['finish-45', 'wastes'],
    ],
    speedStart: 12, speedEnd: 15,
    tide: { creepBase: 0.12, creepPerTier: 0.06 },
  },
  {
    id: 'run5', name: 'Sowing Run V — The Long Seedway', kind: 'campaign', biome: 'meadow',
    world: 0, seedName: 'the Heart Seed',
    chunks: [
      'pad-20', 'm-hop-2', 'm-weave', 'm-mix-1',
      ['c-lantern-1', 'cavern'], ['c-crystal-gap', 'cavern'], ['c-parry-glow', 'cavern'],
      ['cp-25', 'cavern'], ['m-seed', 'cloudline'],
      ['l-wind-1', 'cloudline'], ['l-wind-gap', 'cloudline'], ['l-gap-span', 'cloudline'],
      ['w-thorn-field', 'wastes'], ['w-gauntlet-2', 'wastes'], ['w-mix-3', 'wastes'],
      ['finish-45', 'meadow'],
    ],
    speedStart: 13, speedEnd: 16.5,
    tide: { creepBase: 0.13, creepPerTier: 0.06 },
  },
  {
    id: 'run6', name: 'Sowing Run VI — The Last Surge', kind: 'campaign', biome: 'wastes',
    world: 3, seedName: 'the Last Seed', finale: true,
    chunks: [
      'pad-20', 'f-open', 'w-gauntlet-1', 'w-thorn-field', 'w-mix-3', 'f-surge',
      ['c-parry-glow', 'cavern'], ['c-dark-weave', 'cavern'], ['c-mix', 'cavern'], ['cp-25', 'cavern'],
      ['f-surge', 'cavern'], ['m-seed', 'cloudline'], ['l-wind-gap', 'cloudline'],
      ['l-wind-1', 'cloudline'], ['l-gap-span', 'cloudline'], ['f-surge', 'cloudline'],
      ['m-weave', 'meadow'], ['m-parry-1', 'meadow'], ['m-mix-2', 'meadow'], 'f-parade', 'finish-45',
    ],
    speedStart: 14, speedEnd: 18,
    tide: { creepBase: 0.16, creepPerTier: 0.07, startGap: 22 },
  },
];

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
