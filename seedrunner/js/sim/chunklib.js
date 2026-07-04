// The chunk library. Every chunk here is verified by tools/verify-chunks.js
// at every tier it may appear at, entered from every lane — including gyms,
// tutorials, and the credits stretch (Lessons Ledger #2: nothing is exempt).
// tiers: [min,max] index into SPEED.tiers this chunk may be composed at.

import { defineChunk, dewArc } from './chunks.js';

// ------------------------------------------------------------------- pads --
defineChunk({ id: 'pad-20', biome: 'meadow', tiers: [0, 6], len: 20, lines: `` });
defineChunk({ id: 'pad-30', biome: 'meadow', tiers: [0, 6], len: 30, lines: `` });

// -------------------------------------------------------------------- gym --
// The Feel Gym: one straight of every verb. Used by probes, the P2 feel
// pass, and kept shipping as a hidden practice run.
defineChunk({
  id: 'gym-jump', biome: 'meadow', tiers: [0, 3], len: 60, lines: `
    sign C 15 text=Hold_%jump%_to_leap
    block C 20
    dew C 24..32 step=2
    block C 36
    ${dewArc(33.5, 'C', 6.5)}
    block L 50
    block R 50
    dew C 46..54 step=2
  `,
});

defineChunk({
  id: 'gym-slide', biome: 'meadow', tiers: [0, 3], len: 60, lines: `
    sign C 15 text=%slide%_to_slide_under
    arch C 22
    dew C 18..26 step=2
    arch L 40
    arch C 40
    dew L 36..44 step=2
    arch C 52
  `,
});

defineChunk({
  id: 'gym-lane', biome: 'meadow', tiers: [0, 3], len: 70, lines: `
    sign C 15 text=%left%_/_%right%_to_change_lanes
    dew L 20..28 step=2
    dew R 32..40 step=2
    gap C 46 len=14
    gap L 46 len=14
    dew R 44..62 step=3
  `,
});

defineChunk({
  id: 'gym-parry', biome: 'meadow', tiers: [0, 3], len: 70, lines: `
    sign C 15 text=%parry%_on_the_glint!
    barrier C 24
    dew C 26..32 step=2
    barrier C 44
    barrier L 60
    barrier C 60
    barrier R 60
  `,
});

defineChunk({
  id: 'gym-dash', biome: 'meadow', tiers: [0, 3], len: 60, lines: `
    sign C 15 text=%dash%_bursts_through_rot
    block C 24
    dew C 20..28 step=2
    ramp C 40
    ${dewArc(41, 'C', 8, 2.6)}
  `,
});

defineChunk({
  id: 'gym-mix', biome: 'meadow', tiers: [0, 3], len: 80, lines: `
    block C 14
    arch C 26
    gap C 38 len=5
    ${dewArc(37, 'C', 7)}
    barrier C 54
    block L 66
    arch R 66
    dew C 62..72 step=2
    shrine C 78
  `,
});
