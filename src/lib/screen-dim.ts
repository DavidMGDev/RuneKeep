/**
 * What the tablet margins must mirror (v0.24.1).
 *
 * `PhoneFrame` draws the app into a phone-shaped column and leaves margins either side. Those margins
 * have to be indistinguishable from a continuation of the screen, or the frame reads as a bug rather
 * than a frame. Two things decide what is at the column's horizontal edge:
 *
 *  - **A base colour.** Most screens paint `Rune.ink`. The character sheet paints its parchment matte
 *    edge to edge, which is why a tablet showed a near-white column between two dark strips.
 *  - **Whatever is dimming.** Every overlay in the app dims by painting a scrim inside its own screen,
 *    and the column clips, so the margins could not see any of them.
 *
 * Neither can be sampled: React Native has no cheap way to read back a rendered pixel, and doing it
 * per frame would cost more than the whole frame does. So the screen DECLARES both, and the margins
 * paint the declaration. Anything that covers the screen edge belongs here.
 *
 * Deliberately module-level rather than context: these are declared at every depth of the tree, and a
 * provider high enough to reach them all would re-render the whole app on every dialog.
 */

import { useEffect, useState } from 'react';

// ---------------------------------------------------------------------------------------------
// Dimming
// ---------------------------------------------------------------------------------------------

const active = new Map<number, number>();
const dimSubscribers = new Set<(v: number) => void>();
let nextId = 1;

/** The darkest scrim currently on screen. Overlays stack, so the deepest one wins rather than summing. */
export function dimLevel(): number {
  let max = 0;
  for (const v of active.values()) if (v > max) max = v;
  return max;
}

function emitDim(): void {
  const v = dimLevel();
  for (const f of dimSubscribers) f(v);
}

/** Add a dim; call the returned function to remove it. The hook below is the only intended caller. */
export function registerDim(opacity: number): () => void {
  if (opacity <= 0) return () => {};
  const id = nextId++;
  active.set(id, opacity);
  emitDim();
  return () => {
    active.delete(id);
    emitDim();
  };
}

/**
 * Declare that this component is dimming the screen by `opacity` while it is mounted.
 *
 * Call it alongside the scrim it describes. Pass 0 when the scrim is not up, so a conditional dim
 * needs no branch. On a phone nothing observes it, so it costs a map write.
 */
export function useScreenDim(opacity: number): void {
  useEffect(() => registerDim(opacity), [opacity]);
}

/** The current dim, for whoever paints the margins. */
export function useDimLevel(): number {
  const [v, setV] = useState(dimLevel);
  useEffect(() => {
    dimSubscribers.add(setV);
    setV(dimLevel());
    return () => {
      dimSubscribers.delete(setV);
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

// ---------------------------------------------------------------------------------------------
// Edge colour
// ---------------------------------------------------------------------------------------------

/**
 * No screen has declared an edge. The caller supplies its own fallback (the app's ink navy); this
 * module stays free of theme imports so it remains a plain unit-testable module.
 */
export const DEFAULT_EDGE = null;

const edges: { id: number; color: string }[] = [];
const edgeSubscribers = new Set<(v: string | null) => void>();

/**
 * The colour at the screen's horizontal edge. A stack, not a map: screens nest (the sheet mounts
 * inside the router, a panel mounts inside the sheet), and the most recently mounted declaration is
 * the one on top, so it is the one the edge shows.
 */
export function edgeColor(): string | null {
  return edges.length ? edges[edges.length - 1].color : DEFAULT_EDGE;
}

function emitEdge(): void {
  const v = edgeColor();
  for (const f of edgeSubscribers) f(v);
}

export function registerEdge(color: string): () => void {
  const id = nextId++;
  edges.push({ id, color });
  emitEdge();
  return () => {
    const i = edges.findIndex((e) => e.id === id);
    if (i >= 0) edges.splice(i, 1);
    emitEdge();
  };
}

/** Declare the colour this screen paints at its left and right edges, for as long as it is mounted. */
export function useScreenEdge(color: string): void {
  useEffect(() => registerEdge(color), [color]);
}

export function useEdgeColor(): string | null {
  const [v, setV] = useState(edgeColor);
  useEffect(() => {
    edgeSubscribers.add(setV);
    setV(edgeColor());
    return () => {
      edgeSubscribers.delete(setV);
    };
  }, []);
  return v;
}

/** Test seam: drop every registration. */
export function resetScreenDim(): void {
  active.clear();
  edges.length = 0;
  emitDim();
  emitEdge();
}
