/**
 * Turning a card's detail form into the card's own words (v0.30.0).
 *
 * Authoring homebrew asks for a lot of structured data: a weapon's trait, range, damage and burden, a
 * domain card's domain and level, which tier a subclass card is. All of it was collected and then
 * went nowhere the player could read it, so an author filling the form had no way to check they had
 * filled it in correctly, and anyone the card was later shared with saw none of it.
 *
 * So the form writes itself into the description, as markdown, laid out the way the printed cards lay
 * the same facts out: label first, value after, one per line. It is ordinary card text from that
 * point on, which means it renders, shares and prints like anything else the author typed.
 *
 * Two rules make that safe:
 *
 *  1. The generated block is one SECTION, flagged, so it can be found and rewritten without touching
 *     a word of what the author wrote themselves.
 *  2. It is only ever rewritten with the author's consent once they have edited it. The whole point
 *     is to save them typing, so silently retyping over their sentences would be a poor trade.
 *
 * Cards whose renderer already prints these facts (weapons and armor have a real stat block) drop the
 * block rather than printing it twice; see `library-forged-card`.
 *
 * Pure, so every content type's wording is a table test.
 */
import type { ArmorSpec, CardSection, LibraryContentType, WeaponSpec } from './library';
import { SUBCLASS_TIER_LABEL } from './library';
import { domainLabel } from './domain-label';

/** Everything the authoring form can set that is worth printing. Mirrors the editor's config block. */
export interface CardFormFacts {
  contentType: LibraryContentType;
  domain?: string;
  /** v0.42.6: a class card's spec, so a PAGE can be told from a base and write nothing. v0.43.0
   *  carries the summary too, because a base class card's body IS its summary. */
  classSpec?: { role?: 'base' | 'page'; summary?: string };
  level?: number;
  className?: string;
  subclass?: string;
  tier?: 1 | 2 | 3;
  weapon?: WeaponSpec;
  armor?: ArmorSpec;
}

/** One printed row. A blank value is dropped rather than printed empty. */
const row = (label: string, value: string | number | undefined | null): string | null => {
  const v = typeof value === 'number' ? String(value) : (value ?? '').trim();
  return v ? `**${label}:** ${v}` : null;
};

/** Rows are separated by a blank line so each lands on its own line, the way the printed cards read.
 *  A single wrapped paragraph would run them together, which is not a stat block. */
const join = (rows: (string | null)[]): string => rows.filter(Boolean).join('\n\n');

/**
 * The markdown for a card's detail form, or '' when that kind of card has no mechanical facts to
 * print (an ancestry or a community is all prose).
 */
export function formMarkdown(f: CardFormFacts): string {
  switch (f.contentType) {
    case 'weapon': {
      const w = f.weapon;
      if (!w) return '';
      // The order the printed weapon cards use. Tier comes last because it is real data the author
      // set and nothing else on the card ever shows it.
      return join([
        row('Trait', w.trait),
        row('Range', w.range),
        row('Damage', `${w.damage} ${w.damageType}`.trim()),
        row('Burden', w.burden),
        row('Tier', w.tier),
      ]);
    }
    case 'armor': {
      const a = f.armor;
      if (!a) return '';
      return join([row('Thresholds', a.thresholds), row('Base Score', a.baseScore), row('Tier', a.tier)]);
    }
    case 'domain':
      // v0.42.3: printed the way the book prints it. The stored key is untouched (`lib/domain-label`).
      return join([row('Domain', domainLabel(f.domain)), row('Level', f.level)]);
    case 'subclass':
      /**
       * v0.42.7 (owner): a subclass writes NOTHING.
       *
       * "Subclass cards already have their type either foundation specialization or expertise, so it
       * makes no sense that you make the subclass card have auto markdown for displaying its tier,
       * remove the auto markdown section for the custom subclass cards's tier and class."
       *
       * Exactly so: the tier is printed under the title by the card itself, and the class is now the
       * card's whole appearance. Printing both again into the body was the app narrating what the card
       * already shows.
       */
      return '';
    case 'class':
      /**
       * v0.42.6 (owner): a class PAGE writes nothing.
       *
       * "Remove the automatic markdown generation for class card pages because it is unnecessary
       * considering that the class card pages already copy the style of the original class card."
       *
       * It printed "Class: Warden" onto a card that already says Warden across the top in the class's
       * own colour, which is the app repeating itself onto somebody's card.
       *
       * v0.43.0: a BASE class card prints its SUMMARY. The summary is the class's own introduction,
       * asked for by the class form in so many words ("What this class is, in two or three
       * sentences") and until now it went nowhere anybody could read it, while the card's body was a
       * blank the author had to fill in a second time. A template's body is what it declares.
       */
      return f.classSpec?.role === 'page' ? '' : (f.classSpec?.summary ?? '').trim();
    /**
     * A TEMPLATE PRINTS NO PROSE (v0.43.1, owner).
     *
     * v0.43.0 had these cards explain themselves in their own body: "A kind of card this pack adds.
     * Its cards are the cards that name it." The owner on reading it: "that copy is very confusing".
     * It is the app narrating its own data model onto a card, and it told an author nothing they could
     * act on.
     *
     * What tells them the card is different is now VISUAL and it is on the card itself: the system
     * hatch and its band (see `library-forged-card`). A sentence competing with that would be saying
     * the same thing twice, worse.
     */
    case 'customDomain':
    case 'type':
      return '';
    default:
      return '';
  }
}

/** The generated section in a card's body, if it has one. */
export const generatedSection = (sections?: CardSection[]): CardSection | undefined => sections?.find((s) => s.generated);

/** The author's own words: everything except the block the form wrote. */
export const authoredSections = (sections?: CardSection[]): CardSection[] => (sections ?? []).filter((s) => !s.generated);

/**
 * Put `body` into `sections` as the generated block, in place.
 *
 * It leads, because that is where the printed cards put their stats, and because an author reading
 * their own card wants to see what the form produced without hunting for it. An empty body removes
 * the block entirely rather than leaving a blank section behind.
 */
export function withGenerated(sections: CardSection[] | undefined, body: string): CardSection[] {
  const rest = authoredSections(sections);
  return body.trim() ? [{ body, generated: true }, ...rest] : rest;
}
