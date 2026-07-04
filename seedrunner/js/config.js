// Sprout Kingdom: Seedrunner — ALL tuning in one Node-safe module.
// Imported by the sim, the renderer, and every QA tool. No DOM, no Three.
// Units: meters and seconds (fixed 60 Hz timestep); windows in frames.

export const STEP = 1 / 60;
export const FPS = 60;

// ------------------------------------------------------------------ lanes --
export const LANES = {
  count: 3,
  width: 2.2,             // meters between lane centers
  switchFrames: 8,        // full lane-to-lane slide
  forgiveness: 0.55,      // fraction of lane width: how close to "in lane" counts
};

// ----------------------------------------------------------------- player --
export const PLAYER = {
  radius: 0.42,           // collision half-width within a lane
  height: 1.5,            // standing collision height
  slideHeight: 0.65,      // collision height while sliding

  // jumping (meters, seconds)
  jumpVel: 8.4,
  gravityHeld: 26,        // m/s^2 while rising with jump held
  gravity: 46,            // otherwise
  maxFall: 22,
  coyoteFrames: 7,
  bufferFrames: 7,        // input buffer for jump/slide/lane/parry/dash

  // slide
  slideMinFrames: 18,
  slideMaxFrames: 45,     // hold to extend

  // dash: brief burst + i-frames through one obstacle
  dashFrames: 16,
  dashSpeedMult: 1.75,
  dashCooldownFrames: 210,   // 3.5 s; refreshed instantly by perfect actions
  dashIframes: 16,

  // stumble (first hit) and recovery
  stumbleFrames: 55,
  stumbleSpeedMult: 0.55,
  stumbleIframes: 80,     // can't be re-stumbled instantly

  // parry
  parryWindowFrames: 12,  // press-to-impact window (~200 ms)
  parryFreezeFrames: 5,   // hit-stop on success
  parrySlowmoFrames: 24,  // half-rate slow-mo after the freeze
};

// --------------------------------------------------------------- rot tide --
export const TIDE = {
  startGap: 26,           // meters behind Pip at run start
  maxGap: 34,
  catchGap: 1.2,          // caught -> run ends
  creepBase: 0.14,        // m/s the tide closes by default (scaled by pressure)
  creepPerTier: 0.10,     // extra creep per speed tier
  stumbleSurge: 7,        // meters gained instantly on a stumble
  gapFallSurge: 5,
  parryPush: 4.5,         // meters pushed back on a bloom parry
  nearMissPush: 0.6,
  dewChainPush: 1.5,      // per 20-dew chain milestone
  seedPush: 10,           // planting celebration shoves it right back
  dangerGap: 8,           // under this: panic music layer, vignette, rumble
};

// ------------------------------------------------------------------ speed --
// Speed tiers quantize verifier checks; speed(d) is linear per run segment.
export const SPEED = {
  tiers: [9, 11, 13, 15, 17.5, 20, 22.5],  // m/s — tier i covers speeds <= tiers[i]
  reactionFloor: 0.30,    // seconds a human needs after an obstacle is visible
  inputLatency: 0.05,
  visibility: 80,         // meters ahead an obstacle is readable (default biomes)
  darkVisibility: 26,     // in cavern darkness, outside lantern pools
  telegraphTime: 1.1,     // seconds before impact a barrier starts its glint
};

// ---------------------------------------------------------------- scoring --
export const SCORE = {
  dew: 1,
  parryDew: 8,            // banked burst on a bloom parry
  chainStep: 20,          // dew chain milestone size
  nearMissWindow: 0.35,   // meters of clearance that counts as a near miss
};

export const BIOMES = ['meadow', 'cavern', 'cloudline', 'wastes'];
export const BIOME_NAMES = {
  meadow: 'Meadow Seedway', cavern: 'Deeproot Cavern',
  cloudline: 'Cloudline Spans', wastes: 'Bramble Wastes',
};
