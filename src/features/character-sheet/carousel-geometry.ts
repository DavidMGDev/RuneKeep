import { CARD_ASPECT } from './card-data';

/**
 * Arc-carousel geometry, in the sheet's 412x892 design space. Cards ride a circle centered far below
 * the screen; the gear (visual) and cards share the same `rotation` angle. See
 * docs/card-carousel-architecture.md. Helpers are worklets so the per-frame layout runs on the UI
 * thread; they're plain enough to also unit-test on JS.
 */
export const OX = 206; // circle center X (screen center)
// Big radius + low center => a nearly-flat fan whose expanded center card sits at y = OY - R = 765,
// i.e. low on the screen (the compact cards' top edge), so expanding grows the cards in place rather
// than flying them up. Compact then drops a little further toward the bottom edge.
export const R = 900;
// Expanded center card sits at y = OY - R = 631 → the full card (center 3) is on-screen, with the
// gear peeking below it. Compact then drops well below toward/under the bottom edge.
export const OY = 1531;

/** Resting rotation that centers the middle of a deck (a balanced fan, not a lopsided end).
 *  Plain JS (called in React render, not in a worklet) — do NOT mark 'worklet'. */
export function middleRotation(count: number): number {
  return (Math.max(0, count - 1) / 2) * ANGLE_STEP;
}

export const CARD_W = 230; // centermost expanded card width (~56% of the 412 design); ~20% smaller
export const CARD_H = CARD_W / CARD_ASPECT; // 5:7

// Wider step so the expanded fan spreads out: the center card now overlaps each neighbor ~10% instead
// of ~45%, which kills the abrupt z-restack "pop" when a neighbor becomes the new center (#8a).
export const ANGLE_STEP = 0.22; // radians between adjacent cards
export const COMPACT_STEP = 0.05; // a tight little hand of cards when compact
export const COMPACT_SCALE = 0.32; // small hand near the bottom edge
export const COMPACT_DROP = 230; // compact drops well below the expanded center (partly under the edge)

export const SCALE_MAX = 1.0; // centermost card
export const SCALE_MIN = 0.55; // far cards
export const SIGMA = 1.5 * ANGLE_STEP; // falloff width

/** Finger px -> rotation coupling (≈ R*stageScale so the center card tracks the finger ~1:1). */
export const PAN_R = 540;

/** How many cards each side of center stay mounted (virtualization window). Kept small for perf. */
export const WINDOW_HALF = 3;

/** Upward drag (design px) to fully open the center card to full-screen (live-drag distance). */
export const FS_OPEN_DIST = 150;

// Focus (fullscreen) targets — the SAME card slot grows in place to these, no separate object (#8c).
export const FS_CENTER_Y = 396; // y the focused card eases to (≈ screen centre, room for the handle)
export const FS_FOCUS_SCALE = 1.55; // absolute scale of the focused card (230 * 1.55 ≈ 356px wide)

// Fling model (issue #30 A): NO free decay. A release predicts its landing detent from the capped
// velocity and springs there carrying that velocity — the spring overshoots a touch (intentional,
// bounded) and ALWAYS converges onto a detent, so an over-swipe at a deck end can never leave the
// hand floating off-center and then teleport-snap back.
export const MAX_FLING_VEL = 6; // rad/s ceiling on the release velocity
export const FLING_TIME = 0.18; // s — how far a fling "throws" (target = rot + v * FLING_TIME)
export const OVERSCROLL_RESIST = 0.35; // drag past a deck end moves at 35% (soft rubber while dragging)

// Gesture thresholds (design px / velocity). Tuned LOW per the brief — a light flick should work.
export const EXPAND_TRIGGER = 16; // up-drag from compact to fan the hand
export const FS_UP_TRIGGER = 26; // up-drag from expanded to fly the center card full-screen
export const FS_UP_VELOCITY = 700; // …or an upward flick faster than this (px/s)
export const COLLAPSE_TRIGGER = 38; // down-drag from expanded to bundle the hand back

// Shared spring configs so the carousel and the fullscreen overlay move cohesively.
export const EXPAND_SPRING = { damping: 16, stiffness: 130, mass: 0.8 };
export const SNAP_SPRING = { damping: 18, stiffness: 140, mass: 0.7 };
export const FS_SPRING = { damping: 18, stiffness: 120, mass: 0.9 };

/** Smooth center-out scale: centermost largest, tapering to SCALE_MIN. */
export function cardScaleAt(theta: number): number {
  'worklet';
  const d = Math.abs(theta);
  const bell = Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
  return SCALE_MIN + (SCALE_MAX - SCALE_MIN) * bell;
}

/** Max rotation = last card centered (finite: first/last card, never infinite). */
export function maxRotation(count: number): number {
  'worklet';
  return Math.max(0, count - 1) * ANGLE_STEP;
}

export function clampRot(value: number, count: number): number {
  'worklet';
  const max = maxRotation(count);
  return Math.min(max, Math.max(0, value));
}

/** Snap to the nearest card detent, clamped to the deck. */
export function snapRot(value: number, count: number): number {
  'worklet';
  return clampRot(Math.round(value / ANGLE_STEP) * ANGLE_STEP, count);
}
