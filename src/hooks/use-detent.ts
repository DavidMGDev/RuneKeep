/**
 * Never leave a carousel between two options (v0.40.0, owner).
 *
 * Both carousels scroll a single number and land on whole-numbered detents, and both cancel whatever
 * spring is in flight the moment a finger goes down, because from then on the finger owns the
 * position. The trouble is the number of ways a touch can end WITHOUT the matching snap: a tap never
 * activates the pan, so the handler that springs to a landing detent never runs; a card opening,
 * a deck switch, an overlay stealing the gesture and a browser taking pointer capture all end the
 * touch somewhere other than the release handler. Any of them leaves the row parked half way between
 * two cards with nothing in the middle, and it stays there until the player nudges it.
 *
 * Chasing those paths one at a time is what has been happening, and it keeps coming back. This is the
 * general answer, and it is deliberately not a gesture branch:
 *
 *   **After every touch, watch the value until it stops moving. If it stopped off a detent, put it
 *   on one.**
 *
 * Because it acts only once the value is AT REST, it can never fight a throw that is still
 * travelling: a fling settles onto its own target and this then agrees with it and does nothing. And
 * because it never asks why the value is where it is, it does not care which of the paths failed.
 *
 * It samples from JS rather than from a worklet on purpose. A frame callback would have to run every
 * frame forever to catch a case that happens once in a hundred touches, and reading a shared value
 * from a timer costs nothing between touches.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { SharedValue } from 'react-native-reanimated';

/** How close counts as already on a detent, and as no longer moving. */
const EPSILON = 0.0008;
/** How long to wait before the first sample, and between samples. */
const FIRST_MS = 140;
const STEP_MS = 90;
/** Give up after this many samples, so a value that is animated forever is never fought. */
const MAX_SAMPLES = 40;

/**
 * One sample of the watch, as a decision.
 *
 * Pure, and separate from the hook, because this IS the rule and the rest is a timer: given where the
 * value was and where it is now, either keep watching or stop, and if it has come to rest off a
 * detent, say where it belongs. Reanimated cannot be driven from a unit test; arithmetic can.
 */
export interface DetentStep {
  /** Stop watching. */
  done: boolean;
  /** Where the value should be put, or null to leave it. */
  settleTo: number | null;
}

export function detentStep(prev: number | null, cur: number, snap: (v: number) => number, samplesLeft: number): DetentStep {
  const moving = prev === null || Math.abs(cur - prev) > EPSILON;
  if (moving && samplesLeft > 0) return { done: false, settleTo: null };
  if (moving) return { done: true, settleTo: null }; // never came to rest: leave it alone
  const to = snap(cur);
  return { done: true, settleTo: Math.abs(to - cur) > EPSILON ? to : null };
}

export interface DetentGuard {
  /** Call when a touch ends. Re-arming cancels any watch already running. */
  arm: () => void;
  /** Call to stop watching (a screen leaving, a mode taking the value over). */
  cancel: () => void;
}

export function useDetentGuard(
  value: SharedValue<number>,
  /** The nearest resting position for a value. */
  snap: (v: number) => number,
  /** Put the value there. Left to the caller so it keeps its own spring. */
  settle: (to: number) => void,
  /** False while something else legitimately owns the value (a focused card, a deck switch, a drag). */
  canSettle: () => boolean = () => true,
): DetentGuard {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, []);
  useEffect(() => cancel, [cancel]);

  const arm = useCallback(() => {
    cancel();
    let last: number | null = null;
    let left = MAX_SAMPLES;
    const tick = () => {
      timer.current = null;
      const v = value.value;
      const step = detentStep(last, v, snap, left--);
      last = v;
      if (!step.done) { timer.current = setTimeout(tick, STEP_MS); return; }
      if (step.settleTo !== null && canSettle()) settle(step.settleTo);
    };
    timer.current = setTimeout(tick, FIRST_MS);
  }, [cancel, value, snap, settle, canSettle]);

  return { arm, cancel };
}
