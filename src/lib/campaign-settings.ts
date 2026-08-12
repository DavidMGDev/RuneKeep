/**
 * CAMPAIGN SETTINGS (v0.42.1, owner) — what character creation offers in THIS campaign.
 *
 * "Add campaign settings, where a DM can enable or disable options for character creation, in a UI
 * similar to characterize, and this is shipped in an expansion."
 *
 * A campaign that runs without the Void, or without magic, or with only the three classes the table
 * agreed on, has always been possible at the table and impossible in the app: every player saw every
 * option and the DM had to say "not that one" nine times. So the DM writes it down once, in an
 * expansion, and the expansion travels: anyone who enables it creates characters inside those rules.
 *
 * Two decisions worth keeping:
 *
 *  - Only what is turned OFF is stored. A campaign written today against the base game does not have
 *    to be edited when an expansion adds a class, and an option the app gains later is on by default,
 *    which is the answer that cannot strand anyone.
 *  - Settings from several enabled expansions UNION. Two DMs' restrictions can only ever narrow, never
 *    widen, so enabling a second campaign pack cannot quietly re-open what the first one closed.
 */

/** A restriction shipped in an expansion. */
export interface CampaignSettings {
  /** Off until the author says otherwise, so an expansion never silently limits anybody. */
  on: boolean;
  /** The option and step keys that are turned OFF. Everything absent is available. */
  disabled: string[];
}

export const EMPTY_CAMPAIGN_SETTINGS: CampaignSettings = { on: false, disabled: [] };

/** One creation option, by the deck it belongs to and its own id. */
export const optionKey = (deck: string, id: string): string => `${deck}:${id}`;
/** A whole creation step. */
export const stepKey = (deck: string): string => `step:${deck}`;

/**
 * Every restriction in force, from every enabled expansion.
 *
 * The union, not the last one: restrictions narrow. `on` is true if any of them is on, because a pack
 * whose author never turned settings on is not saying "everything is allowed", it is saying nothing.
 */
export function mergeSettings(list: (CampaignSettings | undefined)[]): CampaignSettings {
  const live = list.filter((s): s is CampaignSettings => !!s && s.on);
  if (!live.length) return EMPTY_CAMPAIGN_SETTINGS;
  return { on: true, disabled: [...new Set(live.flatMap((s) => s.disabled))] };
}

/** Whether one option is available. Absent or inactive settings allow everything. */
export const isOptionOn = (cs: CampaignSettings | undefined, deck: string, id: string): boolean =>
  !cs?.on || !cs.disabled.includes(optionKey(deck, id));

/** Whether a whole creation step is available. */
export const isStepOn = (cs: CampaignSettings | undefined, deck: string): boolean =>
  !cs?.on || !cs.disabled.includes(stepKey(deck));

/**
 * A step with nothing left in it is HIDDEN, not shown empty (owner).
 *
 * Turning off every ancestry is the same statement as turning off the ancestry step, and a creator
 * that stopped on an empty carousel would be a soft-lock. `counts` is what each step has left AFTER
 * the option filter, which the creator already computes to draw them.
 */
export const isStepVisible = (cs: CampaignSettings | undefined, deck: string, remaining: number): boolean =>
  isStepOn(cs, deck) && remaining > 0;

/** Turn a set of keys on or off in one go, for the Enable all / Disable all buttons. */
export function setKeys(cs: CampaignSettings, keys: string[], on: boolean): CampaignSettings {
  const set = new Set(cs.disabled);
  for (const k of keys) {
    if (on) set.delete(k);
    else set.add(k);
  }
  return { ...cs, disabled: [...set] };
}

/**
 * A step with nothing left in it turns itself off (owner: the step auto-hides).
 *
 * Decided HERE, where the whole list of options is known, rather than in the creator, where it would
 * mean building every deck to count them. Re-enabling any one option turns the step back on, which is
 * what an author who just un-ticked something by accident expects.
 */
export function syncSteps(cs: CampaignSettings, groups: { deck: string; keys: string[] }[]): CampaignSettings {
  let out = cs;
  for (const g of groups) {
    if (!g.keys.length) continue;
    out = setKeys(out, [stepKey(g.deck)], countOn(out, g.keys) > 0);
  }
  return out;
}

/** Flip one key. */
export const toggleKey = (cs: CampaignSettings, key: string): CampaignSettings =>
  setKeys(cs, [key], cs.disabled.includes(key));

/** How many of a group are on, for the "3 of 9" line over each group's rows. */
export const countOn = (cs: CampaignSettings, keys: string[]): number =>
  keys.filter((k) => !cs.disabled.includes(k)).length;

/**
 * What the player is told when creation is running under a campaign.
 *
 * Named, not silent: a creator missing four classes with no explanation reads as a broken app.
 */
export function campaignNote(names: string[]): string {
  if (!names.length) return '';
  return names.length === 1
    ? `Creation is limited by ${names[0]}.`
    : `Creation is limited by ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}.`;
}
