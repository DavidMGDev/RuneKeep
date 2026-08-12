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

/** Everything a custom class needs to be played. Mirrors the built-in `ClassData` on purpose. */
export interface CustomClassSpec {
  startingEvasion: number;
  startingHp: number;
  /** The line the class starts with, as the official ones print it. */
  classItems: string;
  hopeFeature: { name: string; text: string };
  /** The abilities. One card each once expanded, so the count here IS the class's page count minus one. */
  features: { name: string; text: string }[];
  /** The card-voiced introduction, for the pick card. */
  summary: string;
  /** The two domains this class grants. Free text, so a custom domain works as readily as a real one. */
  domains: string[];
}

export const EMPTY_CLASS_SPEC: CustomClassSpec = {
  startingEvasion: 10,
  startingHp: 6,
  classItems: '',
  hopeFeature: { name: '', text: '' },
  features: [],
  summary: '',
  domains: ['', ''],
};

/**
 * How many CARDS this class comes to.
 *
 * The same rule the built-in classes follow since v0.42.0: one card per ability, plus the hope
 * feature, which is why the owner's "at least 2 pages" is a floor of one feature.
 */
export const classPageCount = (spec: CustomClassSpec | undefined): number => (spec?.features.length ?? 0) + 1;

/**
 * What is missing from ONE class card, in the author's words.
 *
 * Phrased as things to do rather than as errors, because the author is mid-authoring and a list of
 * failures reads as a telling-off. Empty means it is complete.
 */
export function classProblems(card: LibraryCard): string[] {
  const out: string[] = [];
  const spec = card.classSpec;
  if (!card.title.trim()) out.push('give the class a name');
  if (!spec) return [...out, 'fill in the class details'];
  if (!spec.summary.trim()) out.push('write the class summary');
  if (!(spec.startingEvasion > 0)) out.push('set a starting Evasion');
  if (!(spec.startingHp > 0)) out.push('set starting Hit Points');
  if (!spec.classItems.trim()) out.push('name the starting class items');
  if (!spec.hopeFeature.name.trim() || !spec.hopeFeature.text.trim()) out.push('write the Hope feature');
  // "It also requires at least 2 pages" — the hope feature is one, so one ability is the floor.
  if (spec.features.length < 1) out.push('add at least one class feature, so the class is two cards');
  if (spec.features.some((f) => !f.name.trim() || !f.text.trim())) out.push('finish every class feature');
  if (spec.domains.filter((d) => d.trim()).length < 2) out.push('choose the two domains it grants');
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
  const subclassKeys = new Set(exp.cards.filter((c) => c.contentType === 'subclass').map((c) => classKeyOf(c.className)));
  const out: string[] = [];
  for (const c of classes) {
    const name = c.title.trim() || 'a class';
    for (const p of classProblems(c)) out.push(`${name}: ${p}`);
    if (!subclassKeys.has(classKeyOf(c.title)) && !subclassKeys.has(classKeyOf(c.className))) {
      out.push(`${name}: add at least one subclass for it`);
    }
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
export const canShare = (exp: Pick<Expansion, 'cards'>): boolean => expansionClassProblems(exp).length === 0;
