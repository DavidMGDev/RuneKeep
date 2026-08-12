/**
 * A card's body as ONE ORDERED LIST (v0.42.3, owner).
 *
 * "In the sections UI for feature cards, there should be two buttons now. '+ Add Section' and
 * '+ Add Function' so that the feature card can be arranged however the user wishes."
 *
 * Until now a card had two bodies: its sections, and its functional elements, which chose between
 * sitting above all the text or below all the text. So an element could never sit between two
 * paragraphs, and "where it sits" was a question with two bad answers.
 *
 * A section can now BE an element. `CardSection.functionId` names one, and that section draws the
 * control instead of text. Position is position, the placement chips are gone, and the same two
 * reorder arrows move either kind of block.
 *
 * ## Why this is additive rather than a new shape
 *
 * `sections` is the field every renderer, every exporter and every saved `.rune` file already walks.
 * Replacing it with a `blocks` array would mean migrating the wire format, and a pack written today
 * would stop opening on v0.42.2. A section that happens to name a function is invisible to anything
 * that does not know about functions: it reads as a section with an empty body.
 *
 * ## The legacy migration is a tolerant READ
 *
 * The v0.41.4 rule. A card authored with `placement`/`before`/`after` is converted when it is read,
 * never by a one-shot rewrite over the whole library: `above` elements land before the text, `below`
 * after it, and the `before`/`after` lines become ordinary text sections around the control, which is
 * what they were pretending to be. Nothing authored is lost, and a card that never had any of this
 * comes back byte-identical.
 */

import type { CardFunction } from './card-functions';
import type { CardSection } from './library';

/** One block of a card body: a section, and the element it draws if it is one. */
export interface CardBlock {
  section: CardSection;
  /** Present when this section IS a functional element. */
  fn?: CardFunction;
  /** Where this block sits in the section array, so an edit can name it. */
  index: number;
}

/** The body in order, with each function section paired to its configuration. */
export function blocksOf(sections: CardSection[] | undefined, functions: CardFunction[] | undefined): CardBlock[] {
  const byId = new Map((functions ?? []).map((f) => [f.id, f]));
  return (sections ?? []).map((section, index) => {
    const fn = section.functionId ? byId.get(section.functionId) : undefined;
    return fn ? { section, fn, index } : { section, index };
  });
}

/** The text sections only, which is what composes into the printed body. */
export const textSections = (sections: CardSection[] | undefined): CardSection[] =>
  (sections ?? []).filter((s) => !s.functionId);

/**
 * The elements in the order they appear on the card.
 *
 * An element whose section was deleted is not here, which is the point: the section list is the
 * authority on what the card shows, and a stranded configuration draws nothing.
 */
export function orderedFunctions(sections: CardSection[] | undefined, functions: CardFunction[] | undefined): CardFunction[] {
  return blocksOf(sections, functions).flatMap((b) => (b.fn ? [b.fn] : []));
}

/** Add an element: its configuration, and the section that places it at the end of the body. */
export function addFunction(
  sections: CardSection[] | undefined,
  functions: CardFunction[] | undefined,
  fn: CardFunction,
): { sections: CardSection[]; functions: CardFunction[] } {
  return {
    sections: [...(sections ?? []), { body: '', functionId: fn.id }],
    functions: [...(functions ?? []), fn],
  };
}

/** Remove an element, and the section that placed it. One action, because they are one thing. */
export function removeFunction(
  sections: CardSection[] | undefined,
  functions: CardFunction[] | undefined,
  functionId: string,
): { sections: CardSection[]; functions: CardFunction[] } {
  return {
    sections: (sections ?? []).filter((s) => s.functionId !== functionId),
    functions: (functions ?? []).filter((f) => f.id !== functionId),
  };
}

/** Move a block up or down. Out of range is a no-op rather than an error, because it is a button. */
export function moveBlock(sections: CardSection[], index: number, dir: -1 | 1): CardSection[] {
  const to = index + dir;
  if (to < 0 || to >= sections.length) return sections;
  const out = [...sections];
  [out[index], out[to]] = [out[to], out[index]];
  return out;
}

/**
 * Drop the configuration of any element no longer placed by a section.
 *
 * Called on save. Without it, deleting a section would leave its element behind as a variable in the
 * dice list pointing at something the card no longer draws.
 */
export const prunedFunctions = (sections: CardSection[] | undefined, functions: CardFunction[] | undefined): CardFunction[] => {
  const placed = new Set((sections ?? []).flatMap((s) => (s.functionId ? [s.functionId] : [])));
  return (functions ?? []).filter((f) => placed.has(f.id));
};

/** Whether this card was authored before elements became sections. */
export const needsBlockMigration = (sections: CardSection[] | undefined, functions: CardFunction[] | undefined): boolean =>
  (functions ?? []).length > 0 && !(sections ?? []).some((s) => s.functionId);

/**
 * A card authored before v0.42.3, read into the new shape.
 *
 * `above` elements lead, `below` elements follow, and each one's `before`/`after` lines become plain
 * text sections hugging it. The element keeps its id, so the player's state, and any level
 * advancement pointing at it, carry across untouched. `label` becomes the title if there is no title
 * yet, because that is what it was being used for.
 */
export function migrateBlocks(
  sections: CardSection[] | undefined,
  functions: CardFunction[] | undefined,
): { sections: CardSection[]; functions: CardFunction[] } {
  const src = sections ?? [];
  const fns = functions ?? [];
  if (!needsBlockMigration(src, fns)) return { sections: src, functions: fns };

  const migrated = fns.map((f) => ({
    ...f,
    title: f.title || f.label || 'Element',
    placement: undefined,
    label: undefined,
    before: undefined,
    after: undefined,
  }));

  const place = (f: CardFunction): CardSection[] => [
    ...(f.before?.trim() ? [{ body: f.before }] : []),
    { body: '', functionId: f.id },
    ...(f.after?.trim() ? [{ body: f.after }] : []),
  ];
  const above = fns.filter((f) => f.placement === 'above').flatMap(place);
  const below = fns.filter((f) => f.placement !== 'above').flatMap(place);
  return { sections: [...above, ...src, ...below], functions: migrated };
}
