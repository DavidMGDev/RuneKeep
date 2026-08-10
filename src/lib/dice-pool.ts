/**
 * A handful of dice (v0.39.0, owner) — the arithmetic, with no idea what a die looks like.
 *
 * The sheet's dice tray is a tray, not a dice bot: it throws the dice you put in it and adds them up.
 * The app still never resolves a check for you, which is the rule this feature had to be designed
 * around rather than the rule it breaks. What is here is the part worth testing: what order the dice
 * sit in, where each one goes as the pool fills, what a roll comes to, and which of Hope and Fear won.
 *
 * `Math.random` lives at the very edge of this file, in {@link rollValue}, so everything above it can
 * be checked with fixed numbers.
 */

import { DIE_MAX, type DieType } from '@/features/character-sheet/components/card-tokens-data';

/** Which dice the tray offers. `duality` is not one of them: it is a PAIR, and it arrives as two. */
export const TRAY_DICE: DieType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

export interface PoolDie {
  id: string;
  type: DieType;
  /** The face showing. Null before the pool has been rolled at all. */
  value: number | null;
  /**
   * A duality die knows which of the two it is, and nothing else does.
   *
   * It is the only thing that makes a d12 in this pool different from another d12: it is drawn in the
   * Hope or the Fear colours, and it is what decides the verdict.
   */
  side?: 'hope' | 'fear';
}

/**
 * The pool in reading order: smallest die first, and ties in the order they were added.
 *
 * The owner's rule, stated exactly: "if there are 4d20s and 6d8s the d20s always appear after the d8
 * no matter in what order they were added". So the pool always looks the same for the same dice, and
 * adding a d6 to a pile of d20s does not shuffle the pile.
 *
 * The duality pair is the one exception, and it is not really one: Hope leads Fear because that is
 * the order they are named in, and a pair is never mixed with anything (throwing it clears the pool).
 */
export function sortPool(pool: PoolDie[]): PoolDie[] {
  return pool
    .map((d, i) => ({ d, i }))
    .sort((a, b) => {
      const ma = DIE_MAX[a.d.type], mb = DIE_MAX[b.d.type];
      if (ma !== mb) return ma - mb;
      const sa = a.d.side === 'hope' ? 0 : a.d.side === 'fear' ? 1 : 2;
      const sb = b.d.side === 'hope' ? 0 : b.d.side === 'fear' ? 1 : 2;
      if (sa !== sb) return sa - sb;
      return a.i - b.i;
    })
    .map((x) => x.d);
}

export interface GridSlot { x: number; y: number }
export interface PoolGrid {
  cols: number;
  rows: number;
  /** The side of one die's square box, in design px. */
  cell: number;
  /** Top-left of each die's box, in the panel's own coordinates, in pool order. */
  slots: GridSlot[];
}

/**
 * Where every die sits, and how big it is.
 *
 * One die should be as big as the panel allows and twenty should still be legible, which is the whole
 * requirement: "at first being as big as can be, then as the user adds more dice, the dice get smaller
 * and re-arrange into a dynamic grid formation".
 *
 * Every column count is tried and the one that makes the biggest die wins. That is not the same as
 * `ceil(sqrt(n))`: in a panel more than twice as wide as it is tall, six dice are far better as two
 * rows of three than as three rows of two, and the search finds that without a table of special cases.
 * The last row is centred, so seven dice in a grid of three read as a shape rather than as a mistake.
 */
export function poolGrid(n: number, width: number, height: number, opts?: { gap?: number; max?: number }): PoolGrid {
  const gap = opts?.gap ?? 8;
  const max = opts?.max ?? 96;
  if (n <= 0) return { cols: 0, rows: 0, cell: 0, slots: [] };
  let best = { cols: 1, rows: n, cell: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cell = Math.min((width - gap * (cols + 1)) / cols, (height - gap * (rows + 1)) / rows);
    if (cell > best.cell) best = { cols, rows, cell };
  }
  const cell = Math.max(1, Math.min(max, best.cell));
  const { cols, rows } = best;
  const blockH = rows * cell + (rows - 1) * gap;
  const top = (height - blockH) / 2;
  const slots: GridSlot[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, n - row * cols); // the last row may be short, and is centred
    const rowW = inRow * cell + (inRow - 1) * gap;
    const left = (width - rowW) / 2;
    slots.push({ x: left + (i - row * cols) * (cell + gap), y: top + row * (cell + gap) });
  }
  return { cols, rows, cell, slots };
}

/** The sum of every face showing, plus whatever modifier was thrown with them. */
export function poolTotal(pool: PoolDie[], modifier = 0): number {
  return pool.reduce((sum, d) => sum + (d.value ?? 0), modifier);
}

export type Duality = 'hope' | 'fear' | 'critical' | null;

/**
 * Which of the two won, when the pool IS the duality pair.
 *
 * Null for any other pool, because "with Hope" is a statement about a specific pair of d12s and
 * saying it about four d6 would be meaningless.
 */
export function dualityVerdict(pool: PoolDie[]): Duality {
  const hope = pool.find((d) => d.side === 'hope');
  const fear = pool.find((d) => d.side === 'fear');
  if (!hope || !fear || pool.length !== 2 || hope.value == null || fear.value == null) return null;
  if (hope.value === fear.value) return 'critical';
  return hope.value > fear.value ? 'hope' : 'fear';
}

/**
 * How far a die's roll sound is pitched up, in cents.
 *
 * The owner asked to hear the shape of the handful: "starting at a lower pitch and raising the pitch
 * on each individual dice and even more raised when changing dice size so that it can be felt". So a
 * die's place in the throw lifts it a little and reaching a bigger die lifts it a lot, which makes a
 * pool of mixed dice sound like a staircase with landings rather than a ramp.
 */
export function rollCents(pool: PoolDie[], index: number): number {
  let step = 0;
  for (let i = 1; i <= index && i < pool.length; i++) if (DIE_MAX[pool[i].type] !== DIE_MAX[pool[i - 1].type]) step++;
  return -420 + index * 34 + step * 150;
}

/** The one impure line in the file: a fair face of this die. */
export const rollValue = (type: DieType): number => 1 + Math.floor(Math.random() * DIE_MAX[type]);
