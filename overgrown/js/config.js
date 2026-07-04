// Sprout Kingdom: Overgrown — shared constants and tuning.
// Node-safe (no DOM/PIXI): imported by the game and by tools/ for headless QA.
// All speeds are px per frame at the fixed 60 Hz timestep; TILE = 16 sim px.

export const TILE = 16;
export const VIEW_W = 512;
export const VIEW_H = 288;
export const STEP = 1 / 60;

// ---------------------------------------------------------------- physics --
export const PHYS = {
  // ground movement
  walkAccel: 0.07,
  runAccel: 0.11,
  airAccel: 0.09,
  friction: 0.12,
  skidDecel: 0.38,
  maxWalk: 1.45,
  maxRun: 2.6,

  // jumping
  gravityHeld: 0.26,        // rising while jump held
  gravity: 0.5,
  maxFall: 4.4,
  jumpBase: 4.9,
  jumpRunBonus: 1.1,        // scaled by |vx| / maxRun
  coyoteFrames: 6,
  bufferFrames: 6,

  // stomp / pogo
  stompBounce: 3.4,
  stompBounceHeld: 5.6,
  plungeSpeed: 5.4,         // down-plunge terminal vy
  plungeStartVy: 2.2,
  pogoBounce: 4.5,
  pogoBounceHeld: 5.9,

  // dash
  dashSpeed: 4.6,
  dashFrames: 10,
  dashCooldown: 12,         // frames after dash before next (ground) dash
  dashTrailEvery: 2,

  // wall moves
  wallSlideFall: 1.15,
  wallJumpVx: 3.0,
  wallJumpVy: 4.75,
  wallJumpLockFrames: 9,    // steering lock after wall jump
  wallRegrabFrames: 10,     // forgiveness window to re-stick
  wallCoyoteFrames: 6,

  // ledge grab
  ledgeReachPx: 7,          // hand may catch a corner within this many px
  clamberFrames: 12,

  // glider relic
  glideFall: 0.9,
  soarFrames: 45,

  // swimming
  swimGravity: 0.09,
  swimMaxSink: 1.15,
  swimStroke: 2.45,
  swimAccel: 0.07,
  swimMaxX: 1.6,
  swimMaxUp: 2.3,
  waterEntryDamp: 0.45,

  // carrying / shells
  shellSpeed: 3.4,
  throwVx: 3.2,
  throwVy: 1.6,
};

// ----------------------------------------------------------------- combat --
export const COMBAT = {
  // Thorn Blade ground combo: [startup, active, recovery] frames per swing
  slash: [
    { startup: 3, active: 6, recovery: 8,  dmg: 1, kb: 1.6 },
    { startup: 3, active: 6, recovery: 9,  dmg: 1, kb: 1.8 },
    { startup: 5, active: 7, recovery: 14, dmg: 2, kb: 3.0 },
  ],
  comboLinkFrames: 22,      // window after recovery to link the next swing
  upSlash:   { startup: 4, active: 7, recovery: 10, dmg: 1, kb: 2.0 },
  airSlash:  { startup: 3, active: 7, recovery: 8,  dmg: 1, kb: 1.6 },
  plungeDmg: 1,
  charge: { holdFrames: 38, active: 14, recovery: 14, dmg: 3, kb: 3.4, radius: 30 },
  slashReach: 22,           // px in front of Pip
  slashArcH: 26,            // vertical coverage of a slash
  deflectRadius: 20,        // small projectiles near an active swing get deflected

  // parry
  parryWindow: 8,
  parryRecovery: 15,        // whiffed-parry lag
  parryFreezeFrames: 16,    // time-stop beat on success
  parryStagger: 100,        // frames a melee attacker is staggered
  parrySlowmo: 20,          // render slow-mo tail after the freeze

  // hit-stop (sim freeze frames)
  hitstopLight: 2,
  hitstopHeavy: 4,
  hitstopParry: 3,

  // Sunbeam Lance
  beamChargeFrames: 30,
  beamFireFrames: 46,
  beamDps: 0.12,            // damage per frame while beam is on a target
  beamHeatPerFrame: 1.25,
  beamHeatMax: 100,
  beamCoolPerFrame: 0.55,
  beamOverheatLock: 150,
  beamRange: 320,
  beamMaxBounces: 5,

  // Sap Gauge
  sapMax: 100,
  sapPerHit: 8,
  sapPerParry: 26,
  healCost: 55,
  healChannelFrames: 55,    // vulnerable while casting
  burstCost: 100,
  burstRadius: 120,
  burstDmg: 3,

  // health
  heartsStart: 3,
  heartsCap: 5,
  invulnFrames: 75,
  respawnFrames: 45,        // sub-second respawn
};

// ------------------------------------------------------------------ tiles --
export const T = {
  EMPTY: 0,
  GROUND: 1,       // themed solid ground
  STONE: 2,        // solid block
  PLATFORM: 3,     // one-way platform
  BRICK: 4,        // breakable (charge slash, plunge from above, bump)
  QCOIN: 5,        // item block: coin
  QFRUIT: 6,       // item block: sun fruit (heart)
  QGLIDER: 7,      // item block: glider cap relic
  QMOSS: 8,        // item block: Moss the beetle
  QCLOVER: 9,      // item block: 1-up clover
  USED: 10,        // spent item block
  SPIKES: 11,      // deadly to touch — except a down-plunge pogos off the top
  CRUMBLE: 12,     // crumbling ledge
  LANTERN: 13,     // non-solid light source
  GOAL: 14,        // goal gate marker
  GOAL2: 15,       // secret goal gate
  DOOR: 16,        // burrow door: press Down/Up to travel
  THORN: 17,       // thorn-lava surface (deadly, pogo does NOT save you)
  WATER: 18,       // swimmable volume
  MIRROR_A: 19,    // '/' beam mirror
  MIRROR_B: 20,    // '\' beam mirror
  CRYSTAL: 21,     // sun crystal: light with the beam to open gates
  GATE: 22,        // solid until the room's crystals are all lit
  UPDRAFT: 23,     // rising wind column (Cloudline)
  SPRING: 24,      // bounce bloom
};

export const TILE_SOLID = new Set([
  T.GROUND, T.STONE, T.BRICK, T.QCOIN, T.QFRUIT, T.QGLIDER, T.QMOSS,
  T.QCLOVER, T.USED, T.GATE, T.MIRROR_A, T.MIRROR_B, T.CRYSTAL,
  T.SPRING,   // a solid pad you land on — landing is what fires the bounce
]);
export const TILE_BUMPABLE = new Set([T.BRICK, T.QCOIN, T.QFRUIT, T.QGLIDER, T.QMOSS, T.QCLOVER]);
export const TILE_ITEMBLOCK = new Set([T.QCOIN, T.QFRUIT, T.QGLIDER, T.QMOSS, T.QCLOVER]);
export const TILE_DEADLY = new Set([T.SPIKES, T.THORN]);

// DSL character -> tile. Lowercase letters are reserved for entities.
export const CHAR_TILES = {
  '#': T.GROUND, 'X': T.STONE, '=': T.PLATFORM, 'B': T.BRICK,
  '?': T.QCOIN, 'M': T.QFRUIT, 'G': T.QGLIDER, 'E': T.QMOSS, 'U': T.QCLOVER,
  '^': T.SPIKES, '~': T.CRUMBLE, 'L': T.LANTERN, '!': T.GOAL, '2': T.GOAL2,
  'n': T.DOOR, 'v': T.THORN, ',': T.WATER, '/': T.MIRROR_A, '\\': T.MIRROR_B,
  'C': T.CRYSTAL, 'D': T.GATE, 'T': T.UPDRAFT, 'J': T.SPRING,
};

// DSL character -> entity spawn. See sim/level.js parser.
export const ENTITY_CHARS = {
  b: 'bumble',      // meadow walker
  s: 'snapcap',     // shell — stomp to stun, carry/throw, parry ricochets
  k: 'spikelet',    // spiky walker — sword or pogo only
  p: 'puffhawk',    // swooping flyer
  l: 'lobber',      // arcing projectiles (deflect/parry)
  w: 'wisp',        // dark spirit — light it with the Sunbeam first
  o: 'pod',         // turret firing parry-reflectable burrs
  a: 'warden',      // NEW shielded enemy — break with charge slash or pogo
  d: 'duelist',     // NEW sword enemy with its own parry
  z: 'glintwing',   // NEW laser drone — telegraphed beams, parry-reflect
  m: 'moss',        // Moss, rideable companion (direct spawn)
  y: 'dummy',       // training dummy (gym levels only)
  x: 'beampickup',  // the Sunbeam Lance (World 2 unlock)
};

export const WORLD_NAMES = ['MEADOW', 'CAVERN', 'CLOUDLINE', 'BRAMBLE KEEP'];

// world color grades for the post stack (renderer reads these)
export const WORLD_GRADE = [
  { tint: [1.06, 1.0, 0.86], lift: [0.02, 0.015, 0.0], sat: 1.08, name: 'golden haze' },
  { tint: [0.88, 1.0, 1.08], lift: [0.0, 0.01, 0.03], sat: 0.98, name: 'cold teal' },
  { tint: [1.04, 1.03, 1.0], lift: [0.05, 0.05, 0.06], sat: 1.0, name: 'blown sun' },
  { tint: [1.08, 0.92, 0.85], lift: [0.03, 0.0, 0.0], sat: 1.02, name: 'red-brown' },
];

export const SCORE = {
  coin: 100,
  brick: 50,
  star: 3000,
  stompChain: [100, 200, 400, 800, 1000, 2000, 4000, 8000], // then 1UP
  enemySword: 150,
  parry: 300,
  bossHit: 1000,
  bossClear: 10000,
  goalMax: 5000,
};

// upgrade shrine catalog: cost in Dew Stars
export const UPGRADES = {
  heart1: { name: 'HEART CONTAINER', cost: 5, desc: 'One more heart (max 5).' },
  heart2: { name: 'HEART CONTAINER II', cost: 8, desc: 'One more heart (max 5).', needs: 'heart1' },
  longdash: { name: 'ROOTED WIND', cost: 4, desc: 'Dash carries further (+30%).' },
  wideparry: { name: 'PETAL GUARD', cost: 4, desc: 'Parry window +4 frames.' },
  fastcharge: { name: 'SUNPATIENCE', cost: 3, desc: 'Charge attacks arm 35% faster.' },
  bladeart: { name: 'BLOOMFANG', cost: 6, desc: 'Combo ender erupts in a petal shockwave.' },
};

export const START_LIVES = 5;
export const COINS_PER_LIFE = 100;
export const SAVE_KEY = 'sproutOvergrownSave_v1';
