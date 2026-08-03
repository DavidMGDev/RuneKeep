/**
 * Snapping with hysteresis (v0.34.0).
 *
 * The moodboard snaps rotation to right angles and position to the canvas centre lines, and this is
 * the part that decides whether that feels like a photo app or like a fight.
 *
 * Two thresholds, not one. A single threshold gives a value that flips between snapped and free every
 * time the finger jitters across it, which is visible as a shimmer and feels broken. And a snap you
 * cannot leave is worse than no snap at all: the owner asked for it to work "very similar to how
 * Instagram handles it", which means it grabs early and lets go late. So a snap ENGAGES within a
 * narrow band and only RELEASES outside a wider one, and the gap between them is the stickiness.
 *
 * `entered` is reported exactly once per engagement so a caller can fire a haptic without it
 * stuttering while the finger sits inside the band.
 *
 * Pure and free-standing, because it is the one piece of the moodboard whose correctness is not
 * obvious by looking at it, and because both axes and the rotation all want the same behaviour.
 */

export interface SnapOptions {
  /** Distance within which a free value is captured. */
  enter: number;
  /** Distance beyond which a captured value is released. Must be larger than `enter`. */
  exit: number;
  /** Period for values that wrap, e.g. 360 for degrees. Omit for a linear axis. */
  wrap?: number;
}

export interface SnapResult {
  /** What to draw: a target when snapped, otherwise the raw value. */
  value: number;
  /** The target currently held, or null when free. Pass back in on the next call. */
  target: number | null;
  /** True only on the call where a target is newly taken. For a haptic, not for a state write. */
  entered: boolean;
}

/** Shortest signed distance from `a` to `b`, going the short way round when the axis wraps. */
function delta(a: number, b: number, wrap?: number): number {
  const d = a - b;
  if (!wrap) return d;
  const m = ((d % wrap) + wrap) % wrap;
  return m > wrap / 2 ? m - wrap : m;
}

/**
 * Where a dragged value should sit, given the targets it can snap to and the target it is already
 * holding (`held`, or null when free).
 *
 * Written as a worklet so it can run on the UI thread inside a gesture, where this is used.
 */
export function snapValue(raw: number, targets: readonly number[], opts: SnapOptions, held: number | null): SnapResult {
  'worklet';
  // Still holding: only a deliberate move past the WIDER threshold lets go. This is the stickiness.
  if (held != null && Math.abs(delta(raw, held, opts.wrap)) <= opts.exit) {
    return { value: held, target: held, entered: false };
  }
  let best: number | null = null;
  let bestDist = Infinity;
  for (const t of targets) {
    const d = Math.abs(delta(raw, t, opts.wrap));
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  if (best != null && bestDist <= opts.enter) {
    return { value: best, target: best, entered: held !== best };
  }
  return { value: raw, target: null, entered: false };
}

/** The right angles a moodboard image snaps to. */
export const ANGLE_TARGETS = [0, 90, 180, 270] as const;
/** Rotation grabs within 6 degrees and holds until 13, which is about a centimetre of thumb travel. */
export const ANGLE_SNAP: SnapOptions = { enter: 6, exit: 13, wrap: 360 };
/** Position grabs within 7 canvas px and holds until 16. */
export const CENTRE_SNAP: SnapOptions = { enter: 7, exit: 16 };
