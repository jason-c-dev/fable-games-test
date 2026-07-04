// Small math/easing helpers + deterministic RNG. Node-safe.

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const sign = (v) => v < 0 ? -1 : v > 0 ? 1 : 0;
export const approach = (v, target, step) =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);
export const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;

export const rectsOverlap = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// easing (t in 0..1)
export const easeOutQuad = t => 1 - (1 - t) * (1 - t);
export const easeInQuad = t => t * t;
export const easeInOutQuad = t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
export const easeOutCubic = t => 1 - (1 - t) ** 3;
export const easeInCubic = t => t * t * t;
export const easeOutBack = t => { const c = 1.70158; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
export const easeOutElastic = t => t === 0 ? 0 : t === 1 ? 1 :
  Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
export const easeInOutSine = t => -(Math.cos(Math.PI * t) - 1) / 2;

export const EASE = {
  linear: t => t,
  outQuad: easeOutQuad, inQuad: easeInQuad, inOutQuad: easeInOutQuad,
  outCubic: easeOutCubic, inCubic: easeInCubic, outBack: easeOutBack,
  outElastic: easeOutElastic, inOutSine: easeInOutSine,
};

// Mulberry32 — deterministic seeded RNG (attract demo + verifier need replayable sims)
export function makeRng(seed = 1) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (a, b) => a + next() * (b - a);
  next.int = (a, b) => Math.floor(a + next() * (b - a + 1));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  return next;
}
