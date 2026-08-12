/**
 * A HOMEBREW CLASS (v0.42.0, owner) — everything an official one carries, and the rules for having it.
 *
 * The library could author an ancestry, a community, a domain card, a subclass, a weapon, armor and
 * an item. It could not author a CLASS, and the type picker said so out loud: "custom standalone
 * classes come later." This is later.
 *
 * A class is the one kind of content with real structure behind it, and the structure is what makes
 * it playable rather than decorative: starting Evasion and Hit Points, the items it begins with, a
 * hope feature, its abilities, its two domains, and at least one subclass to choose at creation. An
 * author who leaves any of it out has written a card that looks like a class, and the app must not
 * let that be shared, because the person who receives it cannot make a character with it.
 *
 * So this module is two things and nothing else: what a class IS, and what is MISSING from one. Both
 * are pure, because "is this shareable" has to be one answer given in one place, or the toast and the
 * share button will eventually disagree.
 */

import type { Expansion, LibraryCard } from './library';

/**
 * Everything a custom class needs to be played. Mirrors the built-in `ClassData` on purpose.
 *
 * v0.42.1 (owner) moved the FEATURES out. They are cards now, written on their own merits and linked
 * back to the class, which is the whole point of the correction: "the whole idea is to not create
 * cards from inside the class card UI". What is left here is what genuinely belongs to the class and
 * nothing else: its numbers, its Hope feature, its voice, and the two domains it grants.
 */
export interface CustomClassSpec {
  startingEvasion: number;
  startingHp: number;
  hopeFeature: { name: string; text: string };
  /** The card-voiced introduction, for the pick card. */
  summary: string;
  /** The two domains this class grants, by key. Chosen from a list, never typed (v0.42.1). */
  domains: string[];
  /**
   * STARTING ITEMS (v0.42.1, owner): what every character of this class begins with, and what they
   * choose between.
   *
   * "Make sure that class items have at least 1 fixed item that will be given... and make sure the
   * user has 2 choices to make in their items, so they can choose from a selection and then they
   * choose again from another selection." Ids point at bundled loot or at cards in this expansion.
   */
  fixedItemIds: string[];
  choiceAItemIds: string[];
  choiceBItemIds: string[];
  /** DEPRECATED (v0.42.0): the free-text items line, read for a class authored before the lists. */
  classItems?: string;
  /** DEPRECATED (v0.42.0): features are cards now. Read so an older class still validates. */
  features?: { name: string; text: string }[];
}

export const EMPTY_CLASS_SPEC: CustomClassSpec = {
  startingEvasion: 10,
  startingHp: 6,
  hopeFeature: { name: '', text: '' },
  summary: '',
  domains: [],
  fixedItemIds: [],
  choiceAItemIds: [],
  choiceBItemIds: [],
};

/**
 * How many CARDS this class comes to.
 *
 * The same rule the built-in classes follow since v0.42.0: one card per ability, plus the hope
 * feature, which is why the owner's "at least 2 pages" is a floor of one feature.
 */
export const classPageCount = (spec: CustomClassSpec | undefined, featureCards = 0): number => featureCards + (spec?.features?.length ?? 0) + 1;

/**
 * What is missing from ONE class card, in the author's words.
 *
 * Phrased as things to do rather than as errors, because the author is mid-authoring and a list of
 * failures reads as a telling-off. Empty means it is complete.
 */
export function classProblems(card: LibraryCard, attached?: { features: number; subclasses: number }): string[] {
  const out: string[] = [];
  const spec = card.classSpec;
  if (!card.title.trim()) out.push('give the class a name');
  if (!spec) return [...out, 'fill in the class details'];
  if (!spec.summary.trim()) out.push('write the class summary');
  if (!(spec.startingEvasion > 0)) out.push('set a starting Evasion');
  if (!(spec.startingHp > 0)) out.push('set starting Hit Points');
  if (!spec.hopeFeature.name.trim() || !spec.hopeFeature.text.trim()) out.push('write the Hope feature');
  /**
   * The features are CARDS (v0.42.1, owner), so this counts what points at the class rather than
   * what is embedded in it. A class authored in v0.42.0 still carries its own list, and that counts
   * too, so nobody's half-finished class breaks on update.
   */
  const features = (attached?.features ?? 0) + (spec.features?.length ?? 0);
  if (features < 1) out.push('write at least one feature card and link it to this class');
  if (spec.features?.some((f) => !f.name.trim() || !f.text.trim())) out.push('finish every class feature');
  if (spec.domains.filter((d) => d.trim()).length < 2) out.push('choose the two domains it grants');
  // Starting items: one that everyone gets, and two choices to make (owner).
  const items = spec.fixedItemIds ?? [];
  if (!items.length && !spec.classItems?.trim()) out.push('give it at least one starting item everyone receives');
  if ((spec.choiceAItemIds ?? []).length < 2) out.push('offer at least two options in the first item choice');
  if ((spec.choiceBItemIds ?? []).length < 2) out.push('offer at least two options in the second item choice');
  if (attached && attached.subclasses < 1) out.push('write a subclass card and link it to this class');
  return out;
}

/** The key a subclass points at to say which class it belongs to. Case- and space-insensitive. */
export const classKeyOf = (name: string | undefined): string => (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Everything wrong with an expansion's CLASSES, ready to be said out loud.
 *
 * The rule the owner asked for that is easy to miss: a class needs at least one SUBCLASS, and the
 * subclass is a separate card, so this has to look at the expansion rather than at the class. A class
 * with no subclass cannot be taken at creation at all, which is why it blocks sharing rather than
 * merely warning.
 */
export function expansionClassProblems(exp: Pick<Expansion, 'cards'>): string[] {
  const classes = exp.cards.filter((c) => c.contentType === 'class');
  if (!classes.length) return [];
  const out: string[] = [];
  for (const c of classes) {
    const name = c.title.trim() || 'a class';
    const key = classKeyOf(c.title);
    const linked = exp.cards.filter((x) => classKeyOf(x.className) === key);
    const attached = {
      features: linked.filter((x) => x.contentType === 'generic' && x.classRole === 'feature').length,
      subclasses: linked.filter((x) => x.contentType === 'subclass').length,
    };
    for (const p of classProblems(c, attached)) out.push(`${name}: ${p}`);
  }
  return out;
}

/**
 * A CUSTOM DOMAIN, and what it owes (v0.42.1, owner).
 *
 * "Every custom domain has at least 1 domain card created and assigned to it per level, and at least
 * 2 domain cards for level 1, so minimum 11 domain cards per domain, no maximum."
 *
 * Levels 1 to 10, with level 1 owing two, which is where 11 comes from. The rule lives here so the
 * share gate and the editor's own warning are the same sentence.
 */
export const DOMAIN_LEVELS = 10;
export const LEVEL_ONE_CARDS = 2;

export function domainProblems(domainKey: string, cards: LibraryCard[]): string[] {
  const key = classKeyOf(domainKey);
  const mine = cards.filter((c) => c.contentType === 'domain' && classKeyOf(c.domain) === key);
  const byLevel = new Map<number, number>();
  for (const c of mine) byLevel.set(c.level ?? 1, (byLevel.get(c.level ?? 1) ?? 0) + 1);
  const missing: number[] = [];
  for (let lvl = 1; lvl <= DOMAIN_LEVELS; lvl++) {
    const need = lvl === 1 ? LEVEL_ONE_CARDS : 1;
    if ((byLevel.get(lvl) ?? 0) < need) missing.push(lvl);
  }
  if (!missing.length) return [];
  const total = mine.length;
  return [`needs a card at ${missing.length === 1 ? 'level' : 'levels'} ${missing.join(', ')} (two at level 1). It has ${total} of ${DOMAIN_LEVELS + 1}`];
}

/** Everything wrong with an expansion's CUSTOM DOMAINS, ready to be said out loud. */
export function expansionDomainProblems(exp: Pick<Expansion, 'cards'>): string[] {
  const domains = exp.cards.filter((c) => c.contentType === 'customDomain');
  const out: string[] = [];
  for (const d of domains) {
    const name = d.title.trim() || 'a domain';
    if (!d.title.trim()) { out.push('a domain: give it a name'); continue; }
    for (const p of domainProblems(d.title, exp.cards)) out.push(`${name}: ${p}`);
  }
  return out;
}

/** One line for a toast: the first thing to fix, and how much else there is. */
export function problemToast(problems: string[]): string {
  if (!problems.length) return '';
  if (problems.length === 1) return `Before you can share this: ${problems[0]}.`;
  return `Before you can share this: ${problems[0]}, and ${problems.length - 1} more.`;
}

/** Whether the expansion may be shared. The ONE gate, so the toast and the button cannot disagree. */
export const canShare = (exp: Pick<Expansion, 'cards'>): boolean =>
  expansionClassProblems(exp).length === 0 && expansionDomainProblems(exp).length === 0;
