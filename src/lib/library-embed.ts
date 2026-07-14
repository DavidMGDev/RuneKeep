/**
 * Embedding library (custom) content ONTO a CharacterFile (v0.10.3). When a homebrew card is picked in
 * creation or added via ADD GEAR, a COPY of the `LibraryCard` is stored on `file.libraryCards` so the
 * character is self-contained: it renders + resolves effects with no expansion installed, survives the
 * expansion being disabled/deleted, and travels whole in a shared `.rkp` (Bug 4).
 *
 * Pure + additive: a file with no `libraryCards` behaves exactly as before — every helper here short-
 * circuits on an empty/absent store. This is the ONE module the sheet resolver + creation forge share.
 */
import { composeSections } from './card-markdown';
import type { CharacterFile } from './character-file';
import { CONTENT_TYPE_LABEL, type ArmorSpec, type LibraryCard } from './library';
import type { CardEffect } from './modifiers';

export function libraryCardById(file: CharacterFile | undefined, id: string): LibraryCard | undefined {
  return file?.libraryCards?.find((c) => c.id === id);
}

/** The plaque label for an embedded card — the user's custom label else the content-type word. */
export function libraryCardKindLabel(lc: LibraryCard): string {
  return lc.typeLabel || CONTENT_TYPE_LABEL[lc.contentType];
}

/** The card body as markdown: a bold stat line for weapon/armor, then the composed sections (or flat text). */
export function libraryCardBody(lc: LibraryCard): string {
  const parts: string[] = [];
  if (lc.contentType === 'weapon' && lc.weapon) {
    const w = lc.weapon;
    parts.push(`**${w.trait} · ${w.range} · ${w.damage} ${w.damageType} · ${w.burden}**`);
  }
  if (lc.contentType === 'armor' && lc.armor) parts.push(`**Score ${lc.armor.baseScore} · Thresholds ${lc.armor.thresholds}**`);
  const body = composeSections(lc.sections) || lc.text;
  if (body) parts.push(body);
  return parts.join('\n\n');
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
