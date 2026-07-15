/**
 * Golden Gear Edit — the pure card-move maths (v0.10.7 rework). The interactive pile-drag is a live
 * preview; the DATA outcome is this one function, so it's unit-tested. The selection is dragged as one
 * BLOCK (the selected cards, kept in their current left-to-right order) and dropped at an insertion
 * point among the cards that stayed behind.
 */

/** Move the selected `dragSet` (in their current relative order) to `insertAt` within the sequence of
 *  the remaining (non-dragged) cards. `insertAt` is clamped to the remaining length. */
export function reorderBlock(ids: string[], dragSet: Set<string>, insertAt: number): string[] {
  const moving = ids.filter((id) => dragSet.has(id)); // keep original relative order
  const remaining = ids.filter((id) => !dragSet.has(id));
  const at = Math.max(0, Math.min(remaining.length, insertAt));
  return [...remaining.slice(0, at), ...moving, ...remaining.slice(at)];
}
