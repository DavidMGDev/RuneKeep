/**
 * Whole-display dimming (v0.24.0).
 *
 * Every overlay in the app dims by painting an absolutely-positioned scrim inside its own screen.
 * On a phone that screen IS the display, so it works. Inside the tablet's `PhoneFrame` it is only the
 * middle column, so opening a dialog darkened the app and left the margins at full brightness, which
 * read as a rendering bug rather than a frame.
 *
 * Rather than rewrite thirteen scrims to escape their parent (they cannot: the frame clips), each one
 * announces the darkness it is applying. `PhoneFrame` paints the same value in the margins, so the
 * whole display dims together.
 *
 * Deliberately module-level rather than a context: scrims live at every depth of the tree, and a
 * provider high enough to reach them all would re-render the entire app on every open.
 */

import { useEffect, useState } from 'react';

const active = new Map<number, number>();
const subscribers = new Set<(v: number) => void>();
let nextId = 1;

/** The darkest scrim currently on screen. Overlays stack, so the deepest one wins rather than summing. */
export function dimLevel(): number {
  let max = 0;
  for (const v of active.values()) if (v > max) max = v;
  return max;
}

function emit(): void {
  const v = dimLevel();
  for (const f of subscribers) f(v);
}

/** Add a dim; call the returned function to remove it. The hook below is the only intended caller. */
export function registerDim(opacity: number): () => void {
  if (opacity <= 0) return () => {};
  const id = nextId++;
  active.set(id, opacity);
  emit();
  return () => {
    active.delete(id);
    emit();
  };
}

/**
 * Declare that this component is dimming the screen by `opacity` while it is mounted.
 *
 * Call it alongside the scrim it describes. On a phone nothing observes it, so it costs a map write.
 */
export function useScreenDim(opacity: number): void {
  useEffect(() => registerDim(opacity), [opacity]);
}

/** The current dim, for whoever paints the margins. */
export function useDimLevel(): number {
  const [v, setV] = useState(dimLevel);
  useEffect(() => {
    subscribers.add(setV);
    setV(dimLevel());
    return () => {
      subscribers.delete(setV);
    };
  }, []);
  return v;
}

/**
 * Drop this next to a scrim to declare it. Renders nothing, so it can sit anywhere in the JSX the
 * scrim itself sits, which keeps the two impossible to separate by accident.
 */
export function DimScreen({ opacity }: { opacity: number }): null {
  useScreenDim(opacity);
  return null;
}

/** Test seam: drop every registration. */
export function resetScreenDim(): void {
  active.clear();
  emit();
}
