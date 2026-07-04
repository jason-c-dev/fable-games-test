// Sprout Kingdom — global constants & physics tuning.
// All speeds are px/frame at a fixed 60fps timestep.

const TILE = 16;
const VIEW_W = 512, VIEW_H = 288;
const VIEW_TILES_X = VIEW_W / TILE, VIEW_TILES_Y = VIEW_H / TILE;

const PHYS = {
  walkAccel: 0.07,
  runAccel: 0.11,
  airAccel: 0.09,
  friction: 0.12,
  skidDecel: 0.38,
  maxWalk: 1.4,
  maxRun: 2.6,
  gravityHeld: 0.26,   // rising while jump held
  gravity: 0.5,
  maxFall: 4.4,
  glideFall: 0.9,
  jumpBase: 4.9,
  jumpRunBonus: 1.1,   // scaled by |vx|/maxRun
  coyoteFrames: 6,
  bufferFrames: 6,
  stompBounce: 3.2,
  stompBounceHeld: 5.6,
  spinBounce: 4.2,
  shellSpeed: 3.4,
  seedSpeed: 3.0,
  seedBounce: 2.6,
  soarFrames: 45,      // reduced gravity window after run+jump with glider
  soarFramesFull: 130, // soar window with a full P-meter (real flight)
  pspeedCharge: 45,    // frames at full run speed to charge the P-meter
  doubleTapWindow: 14, // frames for double-tap-jump spin hop
};

// Player power tiers
const POWER = { SMALL: 0, SPROUT: 1, BLOSSOM: 2, GLIDER: 3 };
const POWER_NAMES = ['SMALL', 'SPROUT', 'BLOSSOM', 'GLIDER'];

// Tile ids stored in the collision grid
const T = {
  EMPTY: 0,
  GROUND: 1,     // themed solid ground
  STONE: 2,      // solid block
  PLATFORM: 3,   // one-way
  BRICK: 4,      // breakable when big / spin-hop
  QCOIN: 5,      // item block: coin
  QPOWER: 6,     // item block: fruit / blossom
  QGLIDER: 7,    // item block: glider cap
  QMOSS: 8,      // item block: Moss the beetle
  QONEUP: 9,     // item block: 1-up clover
  USED: 10,      // spent item block
  SPIKES: 11,    // deadly to touch from any side while not spinning on top
  CRUMBLE: 12,   // crumbling ledge
  LANTERN: 13,   // non-solid light source (dark levels)
  GOAL: 14,      // goal gate post marker (non solid, handled by gameplay)
  GOAL2: 15,     // secret goal gate
  BURROW: 16,    // door: press Down to travel
  THORN: 17,     // thorn-lava surface deco (deadly), used by W4
};

const TILE_SOLID = new Set([T.GROUND, T.STONE, T.BRICK, T.QCOIN, T.QPOWER, T.QGLIDER, T.QMOSS, T.QONEUP, T.USED]);
const TILE_BUMPABLE = new Set([T.BRICK, T.QCOIN, T.QPOWER, T.QGLIDER, T.QMOSS, T.QONEUP]);
const TILE_ITEMBLOCK = new Set([T.QCOIN, T.QPOWER, T.QGLIDER, T.QMOSS, T.QONEUP]);

// DSL character -> tile / entity mapping (see levels.js parser)
const CHAR_TILES = {
  '#': T.GROUND, 'X': T.STONE, '=': T.PLATFORM, 'B': T.BRICK,
  '?': T.QCOIN, 'M': T.QPOWER, 'G': T.QGLIDER, 'E': T.QMOSS, 'U': T.QONEUP,
  '^': T.SPIKES, '~': T.CRUMBLE, 'L': T.LANTERN, '!': T.GOAL, '2': T.GOAL2,
  'n': T.BURROW,
};

const WORLD_NAMES = ['MEADOW', 'CAVERN', 'CLOUDLINE', 'BRAMBLE KEEP'];

const SCORE = {
  coin: 100,
  brick: 50,
  star: 3000,
  stompChain: [100, 200, 400, 800, 1000, 2000, 4000, 8000], // then 1UP
  bossHit: 1000,
  bossClear: 10000,
  goalMax: 5000,
  timeBonusPerSec: 10,
};

const START_LIVES = 5;
const COINS_PER_LIFE = 100;
const SAVE_KEY = 'sproutKingdomSave_v1';
