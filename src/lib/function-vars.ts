/**
 * A card's functional element as a VARIABLE (v0.42.3, owner).
 *
 * "They must now always appear in the modifiers list for cards if they are a counter or cycling
 * button with a numeric value. If they are not a numeric value or they are a text field, the modifier
 * automatically does not appear as a variable for dicerolls and card modifier formulas."
 *
 * A Combo Die is a number the player is already keeping. Not being able to roll with it, or scale a
 * bonus by it, made it a decoration. So every element that resolves to a number is offered by name in
 * the dice preset picker and the modifier formula picker, and every element that does not is offered
 * nowhere.
 *
 * ## What "numeric" means, decided once
 *
 * A counter always is. A cycling button is only if EVERY option parses as a number, because a variable
 * that is 4 on Tuesday and "Raging" on Wednesday is not a variable. A text field never is. That rule
 * lives here and nowhere else, so the two pickers and the resolver cannot come to different answers,
 * which is the failure mode that would show up as a formula quietly reading zero.
 *
 * ## Read-only by construction
 *
 * There is no matching `EffectTarget`. A formula can read an element; nothing can write one. The
 * owner was explicit, and the way to guarantee it is to never build the door.
 */

import { advancedFunctions, advancedStates, type AdvanceCard, type AdvanceTake } from './card-advances';
import { type CardFunction, stateOf } from './card-functions';

/** The variable key for one element. Same shape as an advancement's, and for the same reason. */
export const functionVarKey = (cardId: string, functionId: string): string => `${cardId}|${functionId}`;

/** One element offered as a variable. */
export interface FunctionVar {
  key: string;
  /** The element's title, which is what the picker shows and why a title is required. */
  title: string;
  /** The card it is on, so two cards with a "Charges" can be told apart. */
  cardTitle: string;
  /** Its value right now. */
  value: number;
}

/** A cycle whose every option is a number. `d4` counts: the digits are the value. */
export function cycleNumbers(f: CardFunction): number[] | null {
  const opts = f.options ?? [];
  if (!opts.length) return null;
  const nums = opts.map((o) => {
    const m = o.trim().match(/-?\d+/);
    return m && /^[^\d]*-?\d+[^\d]*$/.test(o.trim()) ? parseInt(m[0], 10) : NaN;
  });
  return nums.some((n) => Number.isNaN(n)) ? null : nums;
}

/** Whether this element can be a variable at all. */
export const isNumericFunction = (f: CardFunction): boolean =>
  f.kind === 'counter' || (f.kind === 'cycle' && cycleNumbers(f) !== null);

/** What this element reads as right now, or null if it is not a number. */
export function functionValue(f: CardFunction, state: { n?: number; s?: string; i?: number } | undefined): number | null {
  const st = stateOf(f, state);
  if (f.kind === 'counter') return st.n ?? 0;
  if (f.kind !== 'cycle') return null;
  const nums = cycleNumbers(f);
  return nums ? nums[Math.max(0, Math.min(nums.length - 1, st.i ?? 0))] : null;
}

/** The shape this module needs of a card that could carry elements. */
export interface VarCard extends AdvanceCard {
  id: string;
  title: string;
}

/**
 * Every element on these cards that can be a variable, with its live value.
 *
 * Level advancements are folded in first, for the same reason they are folded in wherever the card is
 * drawn: a Combo Die that has been raised is a d6, and a formula reading 4 would be reading a number
 * that is on nobody's card.
 */
export function functionVars(
  cards: VarCard[],
  states: Record<string, Record<string, { n?: number; s?: string; i?: number }>> | undefined,
  takes: AdvanceTake[] | undefined,
): FunctionVar[] {
  const out: FunctionVar[] = [];
  for (const c of cards) {
    const fns = advancedFunctions(c, takes);
    const st = advancedStates(c, states?.[c.id], takes);
    for (const f of fns) {
      if (!isNumericFunction(f)) continue;
      const value = functionValue(f, st?.[f.id]);
      if (value == null) continue;
      out.push({ key: functionVarKey(c.id, f.id), title: f.title || 'Element', cardTitle: c.title, value });
    }
  }
  return out;
}

/** The map a formula resolves against. */
export const functionVarValues = (vars: FunctionVar[]): Record<string, number> =>
  Object.fromEntries(vars.map((v) => [v.key, v.value]));
