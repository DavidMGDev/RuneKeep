/**
 * A word from the app when a card comes on (v0.32.0).
 *
 * Most cards need nothing: you equip them and the numbers move, which is the whole conversation.
 * A few grant something the sheet cannot show on its own because the player has to declare it first,
 * and those look broken. Master of the Craft is the case that prompted this: it hands you a bonus to
 * one of your Experiences, and until you say WHICH, nothing anywhere changes and the card appears to
 * have done nothing at all.
 *
 * Keyed by catalog id, so a homebrew card never accidentally inherits somebody else's instruction.
 */
export const EQUIP_NOTICES: Record<string, string> = {
  // Grace 9. "Permanently gain a +1 bonus to two Experiences." The bonus is per Experience, so the
  // player picks it in the card's own Modifiers panel.
  'grace-09-2': 'Press MODIFIERS below the card to choose your bonus!',
};

/** The message to show when this card is equipped, if it has one. */
export const equipNoticeFor = (catalogId: string): string | undefined => EQUIP_NOTICES[catalogId];
