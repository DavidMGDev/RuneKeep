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

/**
 * What the carousel offers, in order.
 *
 * `duality` is one ENTRY and two DICE (v0.40.0, owner). It is shown as the overlapping pair, exactly
 * as it looks on a card, because that is what it is: adding it puts a Hope die and a Fear die in the
 * pool, they animate in and settle separately, and neither can be added or taken out on its own. The
 * binding is a shared {@link PoolDie.pairId} and nothing else, so everything downstream (the order,
 * the grid, the roll) goes on treating them as two ordinary d12s.
 */
export const TRAY_DICE: DieType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100', 'duality'];

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
  /** Set on both halves of a duality pair. They are added and removed together (v0.40.0, owner). */
  pairId?: string;
}

/**
 * Add a die, or a bound duality PAIR, to the pool.
 *
 * `id` mints the ids, so the caller keeps its own counter and this stays pure and testable.
 */
export function addDie(pool: PoolDie[], type: DieType, id: (n: number) => string): PoolDie[] {
  if (type !== 'duality') return [...pool, { id: id(0), type, value: null }];
  // One pair at a time (v0.40.1, owner). Two pairs have no answer to "with Hope or with Fear", so the
  // second is refused rather than quietly averaged; the caller says so out loud.
  if (hasDuality(pool)) return pool;
  const pairId = id(0);
  return [
    ...pool,
    { id: id(1), type: 'd12', value: null, side: 'hope', pairId },
    { id: id(2), type: 'd12', value: null, side: 'fear', pairId },
  ];
}

/** Whether a duality pair is already in the pool. */
export const hasDuality = (pool: PoolDie[]): boolean => pool.some((d) => !!d.pairId);

/** Take a die out. A half of a pair takes its partner with it. */
export function removeDie(pool: PoolDie[], dieId: string): PoolDie[] {
  const gone = pool.find((d) => d.id === dieId);
  if (!gone) return pool;
  return pool.filter((d) => (gone.pairId ? d.pairId !== gone.pairId : d.id !== dieId));
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
  /**
   * v0.40.1 (owner): the pair still answers when it is thrown WITH other dice.
   *
   * This used to insist the pool was exactly two dice, on the reasoning that "with Hope" is a
   * statement about a pair. It is, and the pair is still there when you add two d4 to it: the total
   * is everything, and Hope or Fear is which of those two d12s came out on top. Only one pair can be
   * in the pool (see `addDie`), so there is never a second one to disagree.
   */
  const hope = pool.find((d) => d.side === 'hope');
  const fear = pool.find((d) => d.side === 'fear');
  if (!hope || !fear || hope.value == null || fear.value == null) return null;
  if (hope.value === fear.value) return 'critical';
  return hope.value > fear.value ? 'hope' : 'fear';
}

/**
 * How the throw went, as two counts (v0.40.1, owner).
 *
 * The total's own animation hangs on which way the handful leaned: more dice at their best than at
 * their worst is a good throw and the number celebrates, otherwise it just lands. A duality pair
 * contributes a success when it comes up matched and NOTHING otherwise, because a low Hope die is not
 * a fumble, it is a Fear roll, which the pair has already said in its own way.
 */
export interface RollTally { crits: number; fails: number }

export function rollTally(pool: PoolDie[]): RollTally {
  const v = dieVerdicts(pool);
  let crits = 0, fails = 0;
  for (const d of pool) {
    if (v[d.id] === 'critical') crits++;
    else if (v[d.id] === 'fear' && !d.pairId) fails++;
  }
  // Both halves of a matched pair are marked critical; that is ONE good thing happening, not two.
  const pairIds = new Set(pool.filter((d) => d.pairId && v[d.id] === 'critical').map((d) => d.pairId));
  crits -= pool.filter((d) => d.pairId && v[d.id] === 'critical').length - pairIds.size;
  return { crits, fails };
}

/**
 * What a single die's result deserves when it lands (v0.40.0, owner).
 *
 * The dice tokens on a card already say this with their bodies: Fear jerks, Hope sways, a critical
 * flourishes. The tray now says it too, and says it about ORDINARY dice as well, which the tokens
 * never had to: a natural 20 is a critical and a natural 1 gets the Fear treatment, so the two
 * results anyone cares about are felt rather than only read. Everything between them stays quiet,
 * which is what keeps the other two worth noticing.
 *
 * For a duality pair only the WINNER moves, because "it rolled with Hope" is a statement about which
 * die won and a pair where both dice animate says nothing. Two equal faces is the critical, and then
 * they both go.
 *
 * It is here, and not in the animation, so that "a natural 20 is a critical" is a testable sentence.
 */
export type DieVerdict = 'critical' | 'hope' | 'fear' | 'plain';

export function dieVerdicts(pool: PoolDie[]): Record<string, DieVerdict> {
  const out: Record<string, DieVerdict> = {};
  const pairs = new Map<string, PoolDie[]>();
  for (const d of pool) {
    if (d.pairId) { pairs.set(d.pairId, [...(pairs.get(d.pairId) ?? []), d]); continue; }
    out[d.id] = d.value == null ? 'plain' : d.value >= DIE_MAX[d.type] ? 'critical' : d.value <= 1 ? 'fear' : 'plain';
  }
  for (const half of pairs.values()) {
    const hope = half.find((d) => d.side === 'hope');
    const fear = half.find((d) => d.side === 'fear');
    for (const d of half) out[d.id] = 'plain';
    if (!hope || !fear || hope.value == null || fear.value == null) continue;
    if (hope.value === fear.value) { out[hope.id] = 'critical'; out[fear.id] = 'critical'; }
    else if (hope.value > fear.value) out[hope.id] = 'hope';
    else out[fear.id] = 'fear';
  }
  return out;
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
