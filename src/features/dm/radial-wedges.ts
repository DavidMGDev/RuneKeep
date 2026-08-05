/**
 * The stat wheel's geometry, on its own (v0.35).
 *
 * Split out of `stat-radial` so it can be unit-tested: that module imports the theme, which pulls in
 * a stylesheet Jest cannot parse. Pure maths, no React, no theme.
 */

/**
 * Six wedges, reading as ONE scale (v0.35, owner).
 *
 * The top row always read +1 +2 +3 left to right; the bottom row read −1 −2 −3 the same way, so the
 * two halves of the wheel counted in opposite directions and the biggest penalty sat next to the
 * biggest bonus. Reversing the bottom row makes the whole wheel a number line: −3 at the bottom left,
 * up the left side, over the top, to +3 at the top right.
 *
 * Angles are screen-space degrees (y grows downward), so the negative half is the top of the wheel.
 * The left and right sides (around ±0° and ±180°) are the cancel gaps.
 */
export const RADIAL_WEDGES = [
  { center: -128, delta: 1 }, { center: -90, delta: 2 }, { center: -52, delta: 3 },
  { center: 128, delta: -3 }, { center: 90, delta: -2 }, { center: 52, delta: -1 },
];

export const WEDGE_HALF = 19; // wedge half-width (deg)
export const WEDGE_DEAD = 24; // centre dead-zone radius (frame px)
export const WEDGE_RIN = 32;
export const WEDGE_ROUT = 96;
export const WEDGE_RICON = 64;

/** Which wedge the finger points at (-1 = cancel). Pure angular + radial hit-test (worklet-safe). */
export function pickWedge(dx: number, dy: number): number {
  'worklet';
  const dist = Math.hypot(dx, dy);
  if (dist < WEDGE_DEAD || dist > WEDGE_ROUT + 26) return -1;
  const a = (Math.atan2(dy, dx) * 180) / Math.PI;
  for (let i = 0; i < RADIAL_WEDGES.length; i++) {
    let d = a - RADIAL_WEDGES[i].center;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    if (Math.abs(d) <= WEDGE_HALF) return i;
  }
  return -1;
}
