/**
 * Cards that ask the player to CHOOSE which benefits they grant (v0.25.0).
 *
 * A handful of rulebook cards do not simply give you something: they give you a menu and let you take
 * some of it. Vitality is the clearest, and the reason this exists:
 *
 *   "When you choose this card, permanently gain two of the following benefits:
 *    One Stress slot / One Hit Point slot / +2 bonus to your damage thresholds.
 *    Then place this card in your vault permanently."
 *
 * The engine could not express any of that. Effects were all-or-nothing and tied to whether the card
 * was equipped, so a card whose whole point is that you gain something PERMANENTLY and then put the
 * card away lost its benefit the moment you followed its own instructions.
 *
 * Two additions carry it, both on `CardEffect`:
 *  - `option: n` ties an effect to one menu entry, so only the picked ones apply.
 *  - `permanent: true` keeps it applying once picked, regardless of where the card sits, until the
 *    card is deleted from every category.
 *
 * The player's pick is stored per card on the character file (`cardChoices`), so it survives, travels
 * with a shared character, and is inside the history snapshot, which is what makes undo work without
 * any replay logic.
 */
import type { CardEffect } from '@/lib/modifiers';

export interface CardChoice {
  /** How many options the player takes. */
  pick: number;
  /** Shown above the options. Plain language: say what the card is asking. */
  prompt: string;
  /** One label per option, in the same order as the effects' `option` indexes. */
  options: string[];
  /** Explained once, the first time a card like this is taken. */
  note?: string;
}

export const CARD_CHOICES: Record<string, CardChoice> = {
  // Blade level 5. DH Core 113/270.
  'blade-05-2': {
    pick: 2,
    prompt: 'Vitality permanently grants two of these. Pick two.',
    options: ['One Stress slot', 'One Hit Point slot', '+2 bonus to your damage thresholds'],
    note: 'These are permanent. The card can sit in your vault or archive and you keep them, and it does not count against your equipped domain cards.',
  },
};

/** The choice a card asks for, if it asks for one. */
export const cardChoiceFor = (catalogId: string): CardChoice | undefined => CARD_CHOICES[catalogId];

/** Every effect Vitality can grant, one per option, all permanent. */
export const VITALITY_EFFECTS: CardEffect[] = [
  { target: 'stressMax', delta: 1, option: 0, permanent: true, note: 'Vitality: one Stress slot' },
  { target: 'maxHp', delta: 1, option: 1, permanent: true, note: 'Vitality: one Hit Point slot' },
  { target: 'majorThreshold', mode: 'bonus', delta: 2, option: 2, permanent: true, note: 'Vitality: +2 damage thresholds' },
  { target: 'severeThreshold', mode: 'bonus', delta: 2, option: 2, permanent: true, note: 'Vitality: +2 damage thresholds' },
];

/**
 * Keep only the effects the player's pick actually grants.
 *
 * An unpicked card contributes NOTHING rather than everything, which is the safe default: a card that
 * silently granted all three benefits until you chose would be a bug the player is unlikely to spot.
 */
export function effectsForChoice(effects: CardEffect[], picked: number[] | undefined): CardEffect[] {
  return effects.filter((e) => e.option == null || (picked ?? []).includes(e.option));
}
