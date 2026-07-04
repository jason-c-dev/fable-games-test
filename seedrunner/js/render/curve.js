// The Seedway's bend: an analytic gentle curve mapping sim distance d to
// world space, so the horizon always moves. Render-only — the sim is straight.

export const curveX = (d) => 6.5 * Math.sin(d * 0.011) + 3.2 * Math.sin(d * 0.023 + 1.7);
export const curveY = (d) => 1.8 * Math.sin(d * 0.017 + 0.5) + 0.9 * Math.sin(d * 0.031);

const dXdd = (d) => 6.5 * 0.011 * Math.cos(d * 0.011) + 3.2 * 0.023 * Math.cos(d * 0.023 + 1.7);

// world position of (track distance d, lateral offset x, height h) -> out[3]
export function worldPos(d, x, h, out = [0, 0, 0]) {
  const t = dXdd(d);
  const n = 1 / Math.sqrt(1 + t * t);
  // horizontal tangent (t,0,-1)*n; right = (n, 0, t*n)
  out[0] = curveX(d) + x * n;
  out[1] = curveY(d) + h;
  out[2] = -d + x * t * n;
  return out;
}

export const headingAt = (d) => Math.atan2(dXdd(d), 1);   // yaw around +Y
