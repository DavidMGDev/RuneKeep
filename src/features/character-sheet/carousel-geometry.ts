import { CARD_ASPECT } from './card-data';

/**
 * Arc-carousel geometry, in the sheet's 412x892 design space. Cards ride a circle centered far below
 * the screen; the gear (visual) and cards share the same `rotation` angle. See
 * docs/card-carousel-architecture.md. Helpers are worklets so the per-frame layout runs on the UI
 * thread; they're plain enough to also unit-test on JS.
 */
export const OX = 206; // circle center X (screen center)
export const OY = 1180; // circle center Y, well below the design bottom (892)
export const R = 500; // arc radius — large so the fan stays flat and the feel is "heavy"

/** Resting rotation that centers the middle of a deck (a balanced fan, not a lopsided end).
 *  Plain JS (called in React render, not in a worklet) — do NOT mark 'worklet'. */
export function middleRotation(count: number): number {
  return (Math.max(0, count - 1) / 2) * ANGLE_STEP;
}

export const CARD_W = 128; // centermost card width (design px)
export const CARD_H = CARD_W / CARD_ASPECT; // 5:7

export const ANGLE_STEP = 0.25; // radians between adjacent cards when expanded
export const COMPACT_STEP = 0.075; // tight bundle when compact
export const COMPACT_SCALE = 0.42; // cards shrink to a small bundle when compact
export const COMPACT_DROP = 80; // ...and drop toward the gear

export const SCALE_MAX = 1.0; // centermost card
export const SCALE_MIN = 0.5; // far cards
export const SIGMA = 1.7 * ANGLE_STEP; // falloff width: ~3 cards large, ~5 medium

/** Finger px -> rotation coupling (R scaled by an approx stage scale; tuned by feel). */
export const PAN_R = 452;

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
