/**
 * Embedding library (custom) content ONTO a CharacterFile (v0.10.3). When a homebrew card is picked in
 * creation or added via ADD GEAR, a COPY of the `LibraryCard` is stored on `file.libraryCards` so the
 * character is self-contained: it renders + resolves effects with no expansion installed, survives the
 * expansion being disabled/deleted, and travels whole in a shared `.rkp` (Bug 4).
 *
 * Pure + additive: a file with no `libraryCards` behaves exactly as before — every helper here short-
 * circuits on an empty/absent store. This is the ONE module the sheet resolver + creation forge share.
 */
import type { CharacterFile } from './character-file';
import { isTemplateCard, plaqueLabelFor } from './card-plaque';
import { CONTENT_TYPE_LABEL, type ArmorSpec, type LibraryCard } from './library';
import type { CardEffect } from './modifiers';

export function libraryCardById(file: CharacterFile | undefined, id: string): LibraryCard | undefined {
  return file?.libraryCards?.find((c) => c.id === id);
}

/**
 * What a TEMPLATE'S own chip says when nobody has named it: the thing it declares.
 *
 * v0.43.1, owner: "the title and chip will be shared, so whatever the class is called, the chip will
 * read [that]". A class named Shaman shows SHAMAN on the chip the author is designing, a domain shows
 * its own name, and a type shows its kind, rather than all three showing the word for what sort of
 * template they are. Every other card still says what KIND of card it is.
 */
const defaultKindLabel = (lc: LibraryCard): string =>
  isTemplateCard(lc) ? lc.title.trim() || CONTENT_TYPE_LABEL[lc.contentType] : CONTENT_TYPE_LABEL[lc.contentType];

/**
 * The plaque label for an embedded card.
 *
 * v0.43.0: the card's own label still wins, then a chip INHERITED from the class, domain or type it
 * belongs to, then what kind of card it is. `pack` is the cards the label can be resolved against;
 * without it only the card's own fields are read, which is what every caller did before. See
 * `lib/card-plaque`.
 */
export function libraryCardKindLabel(lc: LibraryCard, pack?: readonly LibraryCard[]): string {
  return plaqueLabelFor(lc, defaultKindLabel(lc), pack);
}

/** The card body as markdown: a bold stat line for weapon/armor, then the sections (or flat text).
 *  `struckIndex` wraps that section in `~~…~~` — the mixed-ancestry crossed-out feature (Feature 4). */
export function libraryCardBody(lc: LibraryCard, struckIndex?: number): string {
  const parts: string[] = [];
  if (lc.contentType === 'weapon' && lc.weapon) {
    const w = lc.weapon;
    parts.push(`**${w.trait} · ${w.range} · ${w.damage} ${w.damageType} · ${w.burden}**`);
  }
  if (lc.contentType === 'armor' && lc.armor) parts.push(`**Score ${lc.armor.baseScore} · Thresholds ${lc.armor.thresholds}**`);
  let body: string;
  if (lc.sections?.length) {
    body = lc.sections
      .map((s, i) => {
        const b = s.body.trim();
        const name = (s.name ?? '').trim();
        let line = name && b ? `**${name}:** ${b}` : name ? `**${name}:**` : b; // colon lead (v0.13.0 typeset)
        if (i === struckIndex && line) line = `~~${line}~~`; // crossed-out feature in a mix
        return line;
      })
      .filter((x) => x)
      .join('\n\n');
  } else {
    body = lc.text;
  }
  if (body) parts.push(body);
  return parts.join('\n\n');
}

/** For a custom ancestry used in a MIXED ancestry, which feature (1 or 2) is crossed out on THIS card:
 *  the first-picked keeps feature 1 (feature 2 is struck), the second keeps feature 2 (feature 1 is
 *  struck) — mirrors the built-in ancestryCrossOuts. 0 = not in a mix / not this card. */
export function mixedCrossedTrait(file: CharacterFile | undefined, id: string): 0 | 1 | 2 {
  const m = file?.mixedAncestry;
  if (!m) return 0;
  return m.first === id ? 2 : m.second === id ? 1 : 0;
}

/** Armor's mechanical effects when equipped: its score (slots) + SET thresholds (parsed from "major/severe").
 *  Mirrors the built-in equipment path in card-effects so custom armor works the same. */
export function armorSpecEffects(a: ArmorSpec): CardEffect[] {
  const [mj, sv] = a.thresholds.split('/').map((n) => parseInt(n.trim(), 10) || 0);
  const out: CardEffect[] = [];
  if (a.baseScore) out.push({ target: 'armorScore', mode: 'bonus', delta: a.baseScore });
  if (mj) out.push({ target: 'majorThreshold', mode: 'set', delta: mj });
  if (sv) out.push({ target: 'severeThreshold', mode: 'set', delta: sv });
  return out;
}

/** The structured effects an embedded card applies when enabled. Armor bakes in its score + thresholds. */
export function libraryCardEffects(lc: LibraryCard): CardEffect[] {
  const own = lc.effects ?? [];
  if (lc.contentType === 'armor' && lc.armor) return [...own, ...armorSpecEffects(lc.armor)];
  return own;
}
