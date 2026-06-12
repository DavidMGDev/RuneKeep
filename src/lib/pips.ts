/**
 * Pure resolver for resource tracks rendered as rows of pips (Hope, Stress, Armor, Hit Points).
 *
 * Daggerheart tracks have up to four visual states per slot:
 *  - `active`   — filled / available (e.g. a remaining Hope or a red heart, worth 1)
 *  - `empty`    — an available slot that is currently spent/unfilled
 *  - `depleted` — used up (distinct art from empty; e.g. a spent stress box)
 *  - `locked`   — not yet unlocked at this tier (greyed out)
 *  - `golden`   — a heart worth ×2 (Daggerheart golden hearts; overflow above full red)
 *
 * The row is laid out left→right as: active… then empty/depleted… then locked.
 * Unit-tested in pips.test.ts.
 */
export type PipState = 'active' | 'empty' | 'depleted' | 'locked' | 'golden';

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

export interface HeartResolve {
  /** Pip states, length = slots, ordered left→right: golden… then red(active)… then empty. */
  states: PipState[];
  golden: number;
  red: number;
  empty: number;
  /** Numeric HP readout, DERIVED from hp — never stored independently. */
  current: number;
  max: number;
}

/**
 * Daggerheart golden-heart HP (see docs/ui-fix-brief §1A). There are always `slots` heart boxes; each
 * is empty, red (worth 1), or golden (worth 2). Golden is pure overflow — a slot only turns golden
 * once all `slots` are red (i.e. HP ≥ slots + 1). Filling fills empties→red left→right, then
 * red→golden left→right; losing HP reverses exactly. The numeric tracker is derived from HP, so the
 * hearts and the `current / max` readout can never disagree. Unit-tested in pips.test.ts.
 */
export function resolveHearts(hp: number, slots = 6): HeartResolve {
  const s = Math.max(0, Math.floor(slots));
  const max = s * 2;
  const current = Math.max(0, Math.min(max, Math.floor(hp)));
  const golden = Math.max(0, Math.min(s, current - s)); // HP above `s` → golden, front-loaded
  const red = Math.min(s - golden, current - 2 * golden); // remaining HP shown as red
  const empty = s - golden - red;
  const states: PipState[] = [
    ...(Array(golden).fill('golden') as PipState[]),
    ...(Array(red).fill('active') as PipState[]),
    ...(Array(empty).fill('empty') as PipState[]),
  ];
  return { states, golden, red, empty, current, max };
}

/** A single ±1 HP step, expressed as which heart slot changes and how (#81 C). */
export type HeartAction = 'fill' | 'break' | 'goldify' | 'degold';

export interface HeartBoundaries {
  /** Slot index that can GAIN one HP (fill an empty heart, or goldify the first red), or -1. */
  up: number;
  upAction: HeartAction;
  /** Slot index that can LOSE one HP (break the last red, or degold the last golden), or -1. */
  down: number;
  downAction: HeartAction;
}

/**
 * Daggerheart never moves a resource more than ONE step at a time (#81): only the two BOUNDARY
 * hearts are ever interactive. With golden hearts front-loaded (see resolveHearts), the slot that
 * gains is the first empty (hp < slots) or the first red to goldify (hp >= slots); the slot that
 * loses is the last red (hp <= slots) or the last golden (hp > slots).
 */
export function heartBoundaries(hp: number, slots = 6): HeartBoundaries {
  const max = slots * 2;
  const current = Math.max(0, Math.min(max, Math.floor(hp)));
  const up = current >= max ? -1 : current < slots ? current : current - slots;
  const upAction: HeartAction = current < slots ? 'fill' : 'goldify';
  const down = current <= 0 ? -1 : current <= slots ? current - 1 : current - slots - 1;
  const downAction: HeartAction = current <= slots ? 'break' : 'degold';
  return { up, upAction, down, downAction };
}
