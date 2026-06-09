/**
 * Pure resolver for resource tracks rendered as rows of pips (Hope, Stress, Armor, Hit Points).
 *
 * Daggerheart tracks have up to four visual states per slot:
 *  - `active`   — filled / available (e.g. a remaining Hope or a full heart)
 *  - `empty`    — an available slot that is currently spent/unfilled
 *  - `depleted` — used up (distinct art from empty; e.g. a spent stress box)
 *  - `locked`   — not yet unlocked at this tier (greyed out)
 *
 * The row is laid out left→right as: active… then empty/depleted… then locked.
 * Unit-tested in pips.test.ts.
 */
export type PipState = 'active' | 'empty' | 'depleted' | 'locked';

export interface PipTrackInput {
  /** Total pip slots rendered in the row. */
  total: number;
  /** How many leading slots are filled/available. */
  active: number;
  /** Trailing slots that are locked (rendered after the unlocked ones). */
  locked?: number;
  /** If true, the unlocked-but-not-active slots render as `depleted` instead of `empty`. */
  depletedRemainder?: boolean;
}

export function resolvePips({
  total,
  active,
  locked = 0,
  depletedRemainder = false,
}: PipTrackInput): PipState[] {
  const safeTotal = Math.max(0, Math.floor(total));
  const safeLocked = Math.min(safeTotal, Math.max(0, Math.floor(locked)));
  const unlocked = safeTotal - safeLocked;
  const safeActive = Math.min(unlocked, Math.max(0, Math.floor(active)));

  const slots: PipState[] = [];
  for (let i = 0; i < safeActive; i++) slots.push('active');
  for (let i = safeActive; i < unlocked; i++) slots.push(depletedRemainder ? 'depleted' : 'empty');
  for (let i = 0; i < safeLocked; i++) slots.push('locked');
  return slots;
}
