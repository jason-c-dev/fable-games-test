// The chunk library. Every chunk here is verified by tools/verify-chunks.js
// at every tier it may appear at, entered from every lane — including gyms,
// tutorials, and the credits stretch (Lessons Ledger #2: nothing is exempt).
// tiers: [min,max] index into SPEED.tiers this chunk may be composed at.

import { defineChunk, dewArc } from './chunks.js';

// ------------------------------------------------------------------- pads --
defineChunk({ id: 'pad-20', biome: 'meadow', tiers: [0, 6], len: 20, lines: `` });
defineChunk({ id: 'pad-30', biome: 'meadow', tiers: [0, 6], len: 30, lines: `` });

// generic run furniture (biome overridden per run)
defineChunk({
  id: 'cp-25', biome: 'meadow', tiers: [0, 6], len: 25, noEndless: true, lines: `
    checkpoint C 12
    dew A 8..16 step=4
  `,
});
defineChunk({
  id: 'finish-45', biome: 'meadow', tiers: [0, 6], len: 45, noEndless: true, lines: `
    dew L 6..18 step=3
    dew C 6..18 step=3
    dew R 6..18 step=3
    shrine C 34
  `,
});

// ----------------------------------------------------------------- meadow --
// Run 1 tutorial set (noEndless: they carry signs and gentle pacing)
defineChunk({
  id: 'm-tut-run', biome: 'meadow', tiers: [0, 1], len: 45, noEndless: true, lines: `
    sign C 16 text=Run,_little_sprout_—_the_Rot_Tide_follows!
    dew C 20..36 step=3
  `,
});
defineChunk({
  id: 'm-tut-jump', biome: 'meadow', tiers: [0, 1], len: 55, noEndless: true, lines: `
    sign C 14 text=Hold_%jump%_to_leap
    block C 20
    ${dewArc(17, 'C', 7)}
    block C 38
    ${dewArc(35, 'C', 7)}
  `,
});
defineChunk({
  id: 'm-tut-lane', biome: 'meadow', tiers: [0, 1], len: 65, noEndless: true, lines: `
    sign C 14 text=%left%_/_%right%_to_change_lanes
    dew L 20..30 step=2.5
    dew C 34..40 step=3
    dew R 44..54 step=2.5
    block C 48
  `,
});
defineChunk({
  id: 'm-tut-slide', biome: 'meadow', tiers: [0, 1], len: 55, noEndless: true, lines: `
    sign C 14 text=%slide%_to_slide_under_thorns
    arch C 22
    dew C 19..27 step=2
    arch C 40
    dew C 37..45 step=2
  `,
});
defineChunk({
  id: 'm-tut-dash', biome: 'meadow', tiers: [0, 1], len: 55, noEndless: true, lines: `
    sign C 14 text=%dash%_to_dash_—_perfect_moves_recharge_it
    block C 24
    ${dewArc(21, 'C', 7)}
    ramp C 38
    ${dewArc(39, 'C', 7.5, 1.6)}
  `,
});
defineChunk({
  id: 'm-tut-parry', biome: 'meadow', tiers: [0, 1], len: 70, noEndless: true, lines: `
    sign C 14 text=%parry%_on_the_glint_to_BLOOM!
    barrier C 26
    dew C 28..34 step=2
    sign C 40 text=A_bloom_shoves_the_Tide_back
    barrier C 56
    dew C 58..64 step=2
  `,
});
defineChunk({
  id: 'm-seed', biome: 'meadow', tiers: [0, 6], len: 35, noEndless: true, lines: `
    sign C 8 text=The_Sun_Seed!_Carry_it_home
    seed C 20
    dew L 16..24 step=4
    dew R 16..24 step=4
  `,
});

// endless-eligible meadow chunks
defineChunk({
  id: 'm-hop-1', biome: 'meadow', tiers: [0, 3], len: 45, lines: `
    block C 10
    ${dewArc(7, 'C', 7)}
    block L 24
    dew R 20..28 step=2.5
    block R 36
    dew C 33..41 step=2.5
  `,
});
defineChunk({
  id: 'm-hop-2', biome: 'meadow', tiers: [1, 5], len: 50, lines: `
    block L 12
    block C 12
    dew R 8..16 step=2.5
    block C 26
    block R 26
    dew L 22..30 step=2.5
    block L 40
    ${dewArc(37, 'L', 7)}
  `,
});
defineChunk({
  id: 'm-slide-row', biome: 'meadow', tiers: [0, 5], len: 50, lines: `
    arch C 12
    dew C 9..17 step=2
    arch L 26
    arch R 26
    dew C 24..30 step=3
    arch C 40
    dew C 37..45 step=2
  `,
});
defineChunk({
  id: 'm-gap-hop', biome: 'meadow', tiers: [0, 5], len: 55, lines: `
    gap C 12 len=4
    ${dewArc(11, 'C', 6.5)}
    gap L 28 len=4.5
    gap C 28 len=4.5
    dew R 26..34 step=2.5
    gap R 44 len=4
    ${dewArc(43, 'R', 6.5)}
  `,
});
defineChunk({
  id: 'm-ramp-flow', biome: 'meadow', tiers: [0, 4], len: 55, lines: `
    ramp C 10
    ${dewArc(11, 'C', 8, 1.7, 6)}
    block C 30
    ramp R 40
    ${dewArc(41, 'R', 8, 1.7, 6)}
  `,
});
defineChunk({
  id: 'm-parry-1', biome: 'meadow', tiers: [1, 6], len: 50, lines: `
    barrier C 14
    dew C 16..22 step=2
    barrier L 32
    barrier R 32
    dew C 28..36 step=3
  `,
});
defineChunk({
  id: 'm-weave', biome: 'meadow', tiers: [1, 6], len: 55, lines: `
    block L 10
    block C 14
    dew R 8..18 step=2.5
    block R 28
    block C 32
    dew L 26..36 step=2.5
    block L 46
    dew C 44..50 step=3
  `,
});
defineChunk({
  id: 'm-mix-1', biome: 'meadow', tiers: [1, 4], len: 60, lines: `
    block C 10
    ${dewArc(7, 'C', 7)}
    arch L 24
    arch C 24
    dew R 20..28 step=2.5
    gap C 38 len=4.5
    ${dewArc(37, 'C', 7)}
    barrier C 52
  `,
});
defineChunk({
  id: 'm-mix-2', biome: 'meadow', tiers: [2, 6], len: 60, lines: `
    barrier R 10
    block C 16
    dew L 12..20 step=2.5
    arch C 28
    arch R 28
    gap L 40 len=5
    dew C 38..46 step=2.5
    block R 52
    block C 55
  `,
});
defineChunk({
  id: 'm-breather', biome: 'meadow', tiers: [0, 6], len: 35, lines: `
    dew L 8..26 step=3
    dew C 10..28 step=3
    dew R 12..30 step=3
  `,
});

// ----------------------------------------------------------------- cavern --
defineChunk({
  id: 'c-intro', biome: 'cavern', tiers: [1, 3], len: 60, noEndless: true, lines: `
    sign C 14 text=The_dark_hides_thorns_—_follow_the_lanterns
    lantern C 26
    block C 28
    ${dewArc(25, 'C', 7)}
    lantern C 46
    arch C 48
    dew C 45..53 step=2
  `,
});
defineChunk({
  id: 'c-lantern-1', biome: 'cavern', tiers: [1, 4], len: 50, lines: `
    lantern C 12
    block L 14
    block C 14
    dew R 10..18 step=2.5
    lantern C 34
    arch C 36
    dew C 33..41 step=2
  `,
});
defineChunk({
  id: 'c-dark-weave', biome: 'cavern', tiers: [1, 5], len: 55, lines: `
    block C 10
    dew L 8..14 step=2.5
    lantern C 24
    block L 26
    block R 26
    ${dewArc(23, 'C', 7)}
    block C 44
    dew R 40..48 step=2.5
  `,
});
defineChunk({
  id: 'c-crystal-gap', biome: 'cavern', tiers: [1, 5], len: 55, lines: `
    lantern C 12
    gap C 14 len=4.5
    ${dewArc(13, 'C', 7)}
    lantern C 36
    gap L 38 len=5
    gap C 38 len=5
    dew R 34..42 step=2.5
  `,
});
defineChunk({
  id: 'c-arch-run', biome: 'cavern', tiers: [1, 5], len: 50, lines: `
    lantern C 14
    arch L 16
    arch C 16
    dew R 12..20 step=2.5
    lantern C 36
    arch C 38
    arch R 38
    dew L 34..42 step=2.5
  `,
});
defineChunk({
  id: 'c-parry-glow', biome: 'cavern', tiers: [1, 6], len: 50, lines: `
    barrier C 14
    dew C 16..22 step=2
    barrier L 34
    barrier C 34
    barrier R 34
    dew C 37..43 step=2
  `,
});
defineChunk({
  id: 'c-mix', biome: 'cavern', tiers: [2, 6], len: 60, lines: `
    lantern C 10
    block C 12
    dew L 8..16 step=2.5
    barrier R 26
    lantern C 40
    arch C 42
    arch L 42
    gap R 52 len=4.5
    dew C 50..56 step=3
  `,
});
defineChunk({
  id: 'c-breather', biome: 'cavern', tiers: [1, 6], len: 35, lines: `
    lantern C 12
    dew L 8..26 step=3
    dew C 10..28 step=3
    lantern C 26
    dew R 12..30 step=3
  `,
});

// -------------------------------------------------------------- cloudline --
defineChunk({
  id: 'l-intro', biome: 'cloudline', tiers: [1, 3], len: 60, noEndless: true, lines: `
    sign C 14 text=The_wind_bends_your_leaps!
    wind A 20 len=22 dir=1
    gap C 28 len=4
    ${dewArc(27, 'C', 7)}
    dew C 46..54 step=2.5
  `,
});
defineChunk({
  id: 'l-wind-1', biome: 'cloudline', tiers: [1, 6], len: 55, lines: `
    wind A 8 len=20 dir=-1
    block C 14
    ${dewArc(11, 'C', 7)}
    block R 24
    dew L 20..28 step=2.5
    block L 40
    ${dewArc(37, 'L', 7)}
  `,
});
defineChunk({
  id: 'l-gap-span', biome: 'cloudline', tiers: [1, 5], len: 55, lines: `
    gap L 10 len=5
    gap C 10 len=5
    dew R 6..14 step=2.5
    gap C 26 len=4.5
    ${dewArc(25, 'C', 7)}
    gap R 42 len=5
    gap C 42 len=5
    dew L 38..46 step=2.5
  `,
});
defineChunk({
  id: 'l-wind-gap', biome: 'cloudline', tiers: [2, 6], len: 55, lines: `
    wind A 8 len=26 dir=1
    gap C 16 len=4
    ${dewArc(15, 'C', 7)}
    gap L 34 len=4
    dew C 30..38 step=2.5
    dew R 44..50 step=3
  `,
});
defineChunk({
  id: 'l-ramp-soar', biome: 'cloudline', tiers: [1, 4], len: 55, lines: `
    ramp C 10
    ${dewArc(11, 'C', 8, 1.7, 6)}
    wind A 26 len=20 dir=-1
    ramp L 34
    ${dewArc(35, 'L', 8, 1.7, 6)}
  `,
});
defineChunk({
  id: 'l-arch-wind', biome: 'cloudline', tiers: [2, 6], len: 50, lines: `
    arch C 12
    dew C 9..17 step=2
    wind A 22 len=18 dir=1
    block L 30
    dew R 26..34 step=2.5
    arch C 44
    dew C 41..47 step=2
  `,
});
defineChunk({
  id: 'l-parry-1', biome: 'cloudline', tiers: [2, 6], len: 45, lines: `
    barrier C 14
    dew C 16..22 step=2
    barrier R 32
    barrier C 32
    dew L 28..36 step=2.5
  `,
});
defineChunk({
  id: 'l-breather', biome: 'cloudline', tiers: [1, 6], len: 35, lines: `
    dew L 8..26 step=3
    dew C 10..28 step=3
    dew R 12..30 step=3
    ramp C 24
  `,
});

// ----------------------------------------------------------------- wastes --
defineChunk({
  id: 'w-intro', biome: 'wastes', tiers: [2, 4], len: 60, noEndless: true, lines: `
    sign C 14 text=The_rot_thickens_—_BLOOM_through_it
    barrier C 26
    dew C 28..34 step=2
    barrier L 46
    barrier C 46
    barrier R 46
    dew C 49..55 step=2
  `,
});
defineChunk({
  id: 'w-gauntlet-1', biome: 'wastes', tiers: [2, 6], len: 55, lines: `
    barrier L 12
    barrier C 12
    barrier R 12
    dew C 15..21 step=2
    barrier C 38
    dew L 34..42 step=2.5
  `,
});
defineChunk({
  id: 'w-gauntlet-2', biome: 'wastes', tiers: [3, 6], len: 60, lines: `
    block L 10
    barrier C 16
    dew R 8..18 step=2.5
    arch C 30
    arch R 30
    barrier L 44
    barrier C 44
    barrier R 44
    dew C 47..53 step=2
  `,
});
defineChunk({
  id: 'w-thorn-field', biome: 'wastes', tiers: [2, 6], len: 55, lines: `
    block C 10
    block R 13
    dew L 8..16 step=2.5
    arch L 26
    arch C 26
    dew R 22..30 step=2.5
    block R 40
    block C 43
    ${dewArc(37, 'R', 7)}
  `,
});
defineChunk({
  id: 'w-gap-rot', biome: 'wastes', tiers: [3, 6], len: 55, lines: `
    gap C 10 len=5
    ${dewArc(9, 'C', 7.5)}
    barrier C 26
    dew C 29..35 step=2
    gap L 42 len=5
    gap C 42 len=5
    dew R 38..46 step=2.5
  `,
});
defineChunk({
  id: 'w-weave-2', biome: 'wastes', tiers: [3, 6], len: 55, lines: `
    block L 10
    block C 13
    dew R 8..16 step=2.5
    block R 26
    block C 29
    dew L 22..32 step=2.5
    barrier C 44
    dew C 47..51 step=2
  `,
});
defineChunk({
  id: 'w-mix-3', biome: 'wastes', tiers: [3, 6], len: 65, lines: `
    barrier R 10
    block C 16
    dew L 12..20 step=2.5
    arch C 30
    arch L 30
    gap R 42 len=5
    ${dewArc(41, 'R', 7.5)}
    barrier L 58
    barrier C 58
    barrier R 58
  `,
});
defineChunk({
  id: 'w-breather', biome: 'wastes', tiers: [2, 6], len: 35, lines: `
    dew L 8..26 step=3
    dew C 10..28 step=3
    dew R 12..30 step=3
  `,
});

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
