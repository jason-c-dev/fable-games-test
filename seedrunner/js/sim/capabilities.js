// Closed-form movement capabilities derived from config. This is the ONLY
// model of the physics outside the sim itself, shared by the chunk verifier
// and the bot. tools/sim-probe.js validates every number here against the
// real sim (Lessons Ledger #1: model drift ships bugs).

import { PLAYER, LANES, OBSTACLES, STEP } from '../config.js';

// full-hold jump: rise under gravityHeld, fall under gravity
export function jumpApex() {
  return (PLAYER.jumpVel * PLAYER.jumpVel) / (2 * PLAYER.gravityHeld);
}

export function jumpAirtime() {
  const tUp = PLAYER.jumpVel / PLAYER.gravityHeld;
  const tDown = Math.sqrt((2 * jumpApex()) / PLAYER.gravity);
  return tUp + tDown;
}

// seconds after takeoff until y first reaches h (rising, full hold)
export function riseTimeTo(h) {
  const v = PLAYER.jumpVel, g = PLAYER.gravityHeld;
  const disc = v * v - 2 * g * h;
  if (disc < 0) return Infinity;
  return (v - Math.sqrt(disc)) / g;
}

// window (seconds) during which y > h on a full-hold jump
export function timeAbove(h) {
  const apex = jumpApex();
  if (h >= apex) return 0;
  const tUp = PLAYER.jumpVel / PLAYER.gravityHeld;
  const riseLeft = tUp - riseTimeTo(h);
  const fallTo = Math.sqrt((2 * (apex - h)) / PLAYER.gravity);
  return riseLeft + fallTo;
}

export const jumpDistance = (speed) => jumpAirtime() * speed;
export const laneSwitchTime = () => LANES.switchFrames * STEP;
export const slideLenMin = (speed) => PLAYER.slideMinFrames * STEP * speed;
export const slideLenMax = (speed) => PLAYER.slideMaxFrames * STEP * speed;
export const dashLen = (speed) => PLAYER.dashFrames * STEP * speed * PLAYER.dashSpeedMult;
// meters before a barrier at which a parry press still lands
export const parryApproach = (speed) => PLAYER.parryWindowFrames * STEP * speed;

// how far before a block you must jump (latest press) to clear it, and the
// earliest press that still clears its far edge — [latest, earliest] margins.
// +0.15 covers the sim's semi-implicit Euler lag (~vy*dt/2 ≈ 0.07 m) with
// headroom; sim-probe cap.blockJump keeps this honest at both edges.
export function blockJumpWindow(speed) {
  const need = OBSTACLES.blockH + 0.15;
  const tRise = riseTimeTo(need);
  const tOver = timeAbove(OBSTACLES.blockH);
  const latest = tRise * speed + PLAYER.radius;                     // press at >= this distance before block front
  const earliest = (tRise + tOver) * speed - (OBSTACLES.blockDepth + PLAYER.radius) - 0.1;
  return [latest, Math.max(latest, earliest)];
}

// max gap length crossable at speed with a full-hold jump from the edge
export function maxGapCross(speed) {
  return jumpDistance(speed) - 0.3;
}
