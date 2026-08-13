/**
 * WHY A PACK CANNOT BE SHARED, said properly (v0.42.5, owner).
 *
 * "Instead of giving a toast notification I want a pop-up that recollects all the red warnings that
 * are blocking the expansion from being shared. This means it should say for each card what is
 * missing, if a class card is missing a part of its setup, or if a domain is missing which levels of
 * domain cards to be valid. It must be specific and it must name the cards, and it should prompt the
 * user to fix them before being able to download or share the expansion. Make it robust and serve as
 * a very practical learning tool for new expansion creators."
 *
 * The old gate was a flat list of sentences dropped into a toast, truncated at six, with the rest
 * counted. That is a notification, and this is a lesson: which card, what is missing, and what to do
 * about it. So the report is GROUPED BY CARD, each group naming the card and its kind, and each line
 * phrased as the next thing to do rather than as a complaint.
 *
 * Pure, so the dialog, the warning badge on the Share button and the block itself all read the same
 * answer. That is the important part: v0.42.4 could say "Could not share that expansion" and share it
 * anyway, because the check and the act were two different pieces of code.
 */

import { classProblems, domainProblems, classKeyOf } from './custom-class';
import { CONTENT_TYPE_LABEL, type Expansion, type LibraryCard } from './library';

/** Everything wrong with one card, under its name. */
export interface CardReport {
  cardId: string;
  /** What to call it in the dialog. A card with no name is named by its position. */
  title: string;
  /** Its kind, so two untitled cards can be told apart. */
  kind: string;
  /** The things to do, in the author's words. */
  problems: string[];
}

export interface ShareReport {
  cards: CardReport[];
  /** Problems about the pack itself rather than any one card. */
  pack: string[];
  /** Nothing at all is wrong. */
  ok: boolean;
  /** How many things there are to fix, for the badge and the heading. */
  count: number;
}

const nameOf = (c: LibraryCard, i: number): string => c.title.trim() || `Untitled card ${i + 1}`;

/**
 * The whole report.
 *
 * Every rule that used to live in `expansionShareIssues` is here, plus the two the owner asked for by
 * name: a class card's own setup, item by item, and a domain saying WHICH LEVELS it still needs.
 */
export function shareReport(exp: Pick<Expansion, 'cards'>): ShareReport {
  const cards: CardReport[] = [];
  const pack: string[] = [];

  exp.cards.forEach((c, i) => {
    const problems: string[] = [];

    if (!c.title.trim()) problems.push('Give it a name. A card with no name cannot be told apart from another on the other person’s device.');
    if (c.fullImage && !c.imageUri) problems.push('It is set to be a whole card image, but no image has been chosen. Pick one, or turn that option off.');

    if (c.contentType === 'domain') {
      if (!c.domain?.trim()) problems.push('Say which domain it belongs to. Without one it is a card no character can ever be offered.');
      if (!c.level || c.level < 1 || c.level > 10) problems.push('Set its level, between 1 and 10.');
    }

    if (c.contentType === 'subclass' && !classKeyOf(c.className)) {
      problems.push('Say which class it belongs to. A subclass with no class is never offered at character creation.');
    }

    /**
     * A CLASS, item by item (owner: "if a class card is missing a part of its setup").
     *
     * `classProblems` already answers this, and it counts what points at the class, so it is given
     * the same attachment counts the class form shows. Its sentences are instructions already.
     */
    if (c.contentType === 'class') {
      const key = classKeyOf(c.title);
      const linked = exp.cards.filter((x) => classKeyOf(x.className) === key);
      const attached = {
        features: linked.filter((x) => x.contentType === 'feature' || (x.contentType === 'generic' && x.classRole === 'feature')).length,
        subclasses: linked.filter((x) => x.contentType === 'subclass').length,
        pages: linked.filter((x) => x.contentType === 'class' && x.classSpec?.role === 'page').length,
      };
      for (const p of classProblems(c, attached)) problems.push(`${capitalise(p)}.`);
    }

    /**
     * A DOMAIN, level by level (owner: "if a domain is missing which levels of domain cards to be
     * valid"). `domainProblems` names every missing level and counts what is there.
     */
    if (c.contentType === 'customDomain') {
      if (!c.title.trim()) problems.push('Give the domain a name before writing cards for it.');
      else for (const p of domainProblems(c.title, exp.cards)) problems.push(`${capitalise(p)}.`);
    }

    if (problems.length) {
      cards.push({ cardId: c.id, title: nameOf(c, i), kind: CONTENT_TYPE_LABEL[c.contentType] ?? 'Card', problems });
    }
  });

  if (!exp.cards.length) pack.push('The pack has no cards in it yet.');

  const count = cards.reduce((n, c) => n + c.problems.length, 0) + pack.length;
  return { cards, pack, ok: count === 0, count };
}

/** Whether this pack may leave the device. The ONE answer the button, the badge and the block share. */
export const canSharePack = (exp: Pick<Expansion, 'cards'>): boolean => shareReport(exp).ok;

/** The heading over the report. Says the size of the job rather than making the author count. */
export function reportHeading(r: ShareReport): string {
  if (r.ok) return 'Ready to share';
  const cards = r.cards.length;
  return `${r.count} thing${r.count === 1 ? '' : 's'} to fix, on ${cards} card${cards === 1 ? '' : 's'}`;
}

const capitalise = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);
