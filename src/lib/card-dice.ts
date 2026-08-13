/**
 * DICE, as a functional element (v0.42.5, owner).
 *
 * "Add a new function option, the dice option. Use the existing dice framework to add a feature that
 * handles dice as a feature that can be level-advanced or rolled the same way they are rolled on the
 * dice tray functionality from the character sheet."
 *
 * The Brawler's Combo Die is the shape of it: a card that carries a die, you tap it, it rolls. A card
 * that carries several rolls them together and may add them up. And a level advancement can GRANT
 * more dice, so a tier 3 version of the card rolls a handful where the tier 1 version rolled one.
 *
 * ## The multiplier is the interesting part
 *
 * "Every dice added to this function section must have the ability to be rolled a number of times
 * dependent on variable, for example, if I set the default dice to just a d6 but I make it so that it
 * is multiplied by a variable, say proficiency, then by tier two this section will have two d6
 * instead of just one... an agility +3 character would see a 2d6 from their proficiency being 2 and
 * 3d4 from them having 3 agility."
 *
 * So an entry is not "a die", it is "a die, this many times, times whatever this variable says". The
 * count is resolved against the character at the moment the card is drawn, which is why a card can
 * say "d6 per Proficiency" and mean it for the whole campaign rather than for the tier it was written
 * in.
 *
 * Everything here is arithmetic on purpose: what dice this element currently holds, and what they add
 * up to. The rolling, the spinning and the noise belong to the component.
 */

import type { DieType } from '@/features/character-sheet/components/card-tokens-data';
import type { EffectFormula } from './modifiers';

/** One entry in a dice element: a die, a count, and optionally a variable that multiplies the count. */
export interface DieSpec {
  id: string;
  type: DieType;
  /** How many, before the variable. One unless the author says otherwise. */
  count?: number;
  /**
   * The variable the count is MULTIPLIED by. Absent means the count is the count.
   *
   * A variable that resolves to zero yields no dice of this entry, which is the honest answer: a card
   * that says "one d6 per Proficiency" on a character with no Proficiency is holding no d6.
   */
  variable?: EffectFormula['variable'];
  /** v0.42.5: which card element the variable reads, when it is `function`. */
  functionKey?: string;
}

/** How the element is rolled. */
export type DiceRollMode = 'tap' | 'button';

/** What one entry comes to for this character. Floored at zero, because a die cannot be rolled -1 times. */
export const specCount = (s: DieSpec, variableValue: (v: EffectFormula['variable'], key?: string) => number): number => {
  const base = Math.max(0, Math.floor(s.count ?? 1));
  if (!s.variable) return base;
  return Math.max(0, base * Math.floor(variableValue(s.variable, s.functionKey)));
};

/** One die, resolved and ready to roll. The list a card actually shows. */
export interface RolledDie {
  /** Unique within this element, so a re-roll can animate each die on its own. */
  id: string;
  type: DieType;
}

/**
 * The dice this element is holding right now.
 *
 * Entries in their authored order, each repeated as many times as it resolves to. `cap` exists
 * because a variable can climb: nobody wants a card that tries to draw ninety dice, and a card that
 * silently drew forty would be the same bug with a slower failure.
 */
export function resolveDice(
  specs: DieSpec[] | undefined,
  variableValue: (v: EffectFormula['variable'], key?: string) => number,
  cap = 24,
): RolledDie[] {
  const out: RolledDie[] = [];
  for (const s of specs ?? []) {
    const n = specCount(s, variableValue);
    for (let i = 0; i < n && out.length < cap; i++) out.push({ id: `${s.id}-${i}`, type: s.type });
  }
  return out;
}

/** How many sides a die has, for rolling it. `duality` is a pair of d12 and is not offered here. */
export const dieSides = (t: DieType): number => (t === 'd100' ? 100 : parseInt(String(t).slice(1), 10) || 6);

/** What this element reads as in a list: "2d6 + 1d8", or "None yet". */
export function diceSummary(dice: RolledDie[]): string {
  if (!dice.length) return 'No dice';
  const counts = new Map<string, number>();
  for (const d of dice) counts.set(d.type, (counts.get(d.type) ?? 0) + 1);
  return [...counts].map(([t, n]) => `${n}${t}`).join(' + ');
}

/** The authored shape, for the form: "d6 × Proficiency", or just "2d8". */
export function specSummary(s: DieSpec, variableLabel?: string): string {
  const n = Math.max(1, Math.floor(s.count ?? 1));
  const base = `${n}${s.type}`;
  return s.variable ? `${base} per ${variableLabel ?? 'variable'}` : base;
}

/** The total of a set of rolled values, for the tally. */
export const diceTotal = (values: number[]): number => values.reduce((a, b) => a + b, 0);

/**
 * The dice an ADVANCEMENT grants, folded onto the element.
 *
 * Additive: a level advancement gives you MORE dice, it never takes the ones you had. Taking the same
 * advancement twice grants twice, which is what "twice per tier" means, so the ids are made unique by
 * the take rather than shared.
 */
export function withGrantedDice(specs: DieSpec[] | undefined, granted: DieSpec[] | undefined, takeId: string): DieSpec[] {
  if (!granted?.length) return specs ?? [];
  return [...(specs ?? []), ...granted.map((g) => ({ ...g, id: `${g.id}@${takeId}` }))];
}
