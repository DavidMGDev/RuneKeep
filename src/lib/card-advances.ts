/**
 * Level advancements that come from a CARD (v0.42.1, owner).
 *
 * "Some features are described as 'as a level advancement option', for example the Brawler's Combo
 * Die, and these should be added to the level advancement options."
 *
 * The rulebook writes these on the class, not in the advancement table, and they change a tracker
 * rather than a stat: a Brawler's Combo Die goes up a size. So an advancement lives next to the
 * element it changes (see {@link CardAdvance}) and the level-up menu asks the character's cards what
 * they offer.
 *
 * What the character stores is the LIST OF TAKES, never the resulting numbers. Folding the takes over
 * the authored element every time it is read is what lets an expansion update rename a counter, or
 * fix its ceiling, without stranding somebody mid-campaign, and it is the same rule the rest of the
 * app follows: derive the total, never accumulate it.
 */

import { advanceAt, advanceRemaining, applyAdvance, type CardAdvance, type CardFunction, type FunctionState, stateOf } from './card-functions';

/** One advancement taken, and the tier it was taken at (the per-tier limits need the tier). */
export interface AdvanceTake {
  /** `${cardId}|${advanceId}` — see {@link advanceKey}. */
  key: string;
  tier: number;
}

export const advanceKey = (cardId: string, advanceId: string): string => `${cardId}|${advanceId}`;

/** The shape this module needs of a card. Both library cards and authored cards satisfy it. */
export interface AdvanceCard {
  id: string;
  title: string;
  functions?: CardFunction[];
  advances?: CardAdvance[];
}

/** An advancement on offer, with enough about its card to draw a row for it. */
export interface OfferedAdvance {
  key: string;
  cardId: string;
  cardTitle: string;
  advance: CardAdvance;
}

const takesOf = (takes: AdvanceTake[] | undefined, key: string, tier: number): number =>
  (takes ?? []).filter((t) => t.key === key && t.tier === tier).length;

/**
 * Everything the character's cards offer at this tier that is not already used up.
 *
 * `pending` is what has been chosen in the level-up currently open but not yet applied, so a
 * once-per-tier option disappears the moment it is picked rather than the moment it is confirmed.
 */
export function offeredAdvances(cards: AdvanceCard[], tier: number, taken: AdvanceTake[] | undefined, pending: string[] = []): OfferedAdvance[] {
  const out: OfferedAdvance[] = [];
  for (const c of cards) {
    for (const a of c.advances ?? []) {
      const key = advanceKey(c.id, a.id);
      const used = takesOf(taken, key, tier) + pending.filter((p) => p === key).length;
      if (advanceRemaining(a, tier, used) <= 0) continue;
      // v0.42.3: the advancement AS IT IS AT THIS TIER. A per-tier override changes both what the
      // level-up list says and what taking it does, so resolving it here is what keeps the two in
      // step wherever it is drawn.
      const at = advanceAt(a, tier);
      out.push({ key, cardId: c.id, cardTitle: c.title, advance: { ...a, label: at.label, effect: at.effect } });
    }
  }
  return out;
}

/** Whether this character has anything to be offered at all, which is what gates the menu entry. */
export const hasCardAdvances = (cards: AdvanceCard[], tier: number, taken: AdvanceTake[] | undefined): boolean =>
  offeredAdvances(cards, tier, taken).length > 0;

/**
 * One card's elements with every advancement the character has taken folded in.
 *
 * Returns the authored list untouched when nothing applies, so the overwhelming majority of cards
 * cost one array scan and no allocation.
 */
export function advancedFunctions(card: AdvanceCard, taken: AdvanceTake[] | undefined): CardFunction[] {
  const fns = card.functions ?? [];
  if (!fns.length || !card.advances?.length || !taken?.length) return fns;
  const mine = taken.filter((t) => t.key.startsWith(`${card.id}|`));
  if (!mine.length) return fns;
  let out = fns;
  // v0.42.5: the index makes each TAKE distinct, which is what keeps two takes of a dice advancement
  // from granting the same die twice under one id and collapsing into one.
  let takeIndex = 0;
  for (const t of mine) {
    takeIndex += 1;
    const a = card.advances.find((x) => advanceKey(card.id, x.id) === t.key);
    if (!a) continue; // an advancement the author has since deleted simply stops applying
    // The effect of the tier it was TAKEN at, not of the character's current tier: what a player
    // took at Tier 2 is theirs, and reaching Tier 3 must not silently rewrite it.
    const { effect } = advanceAt(a, t.tier);
    out = out.map((f) => (f.id === a.functionId ? applyAdvance(f, {}, effect, `t${t.tier}-${takeIndex}`).fn : f));
  }
  return out;
}

/**
 * The player's state for one card, with the advancements folded in too.
 *
 * A step advancement moves the value as well as the range, because a d4 that becomes a d6 should read
 * as a d6. An untouched element has no stored state at all, and its advanced default is derived from
 * the advanced element, so this only has to move the values somebody has actually set.
 */
export function advancedStates(
  card: AdvanceCard,
  states: Record<string, FunctionState> | undefined,
  taken: AdvanceTake[] | undefined,
): Record<string, FunctionState> | undefined {
  if (!states || !card.advances?.length || !taken?.length) return states;
  const mine = taken.filter((t) => t.key.startsWith(`${card.id}|`));
  if (!mine.length) return states;
  const out = { ...states };
  for (const t of mine) {
    const a = card.advances.find((x) => advanceKey(card.id, x.id) === t.key);
    const f = a && (card.functions ?? []).find((x) => x.id === a.functionId);
    if (!a || !f || !out[a.functionId]) continue;
    out[a.functionId] = applyAdvance(f, stateOf(f, out[a.functionId]), advanceAt(a, t.tier).effect).state;
  }
  return out;
}

/** A one-line description of what an advancement does, for the level-up list. */
export function advanceSummary(o: OfferedAdvance): string {
  const e = o.advance.effect;
  const what =
    e.kind === 'unlock' ? 'unlocks it'
    : e.kind === 'set' ? `sets it to ${e.text ?? e.value}`
    // v0.42.5: a dice advancement GRANTS dice, so it reads as what you gain.
    : e.kind === 'dice' ? `adds ${e.add.map((d) => `${d.count && d.count > 1 ? d.count : ''}${d.type}`).join(' + ') || 'dice'}`
    : `${e.by > 0 ? '+' : ''}${e.by}`;
  return `${o.cardTitle}: ${what}`;
}
