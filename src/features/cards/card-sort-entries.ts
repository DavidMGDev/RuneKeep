/**
 * Reading a card down to the five things a sort needs (v0.38, owner).
 *
 * `lib/card-sort` decides the ORDER; this decides what each card's answers are. They are apart
 * because the ordering is arithmetic and testable while this is a walk through every kind of card the
 * app can put in a hand: printed scans, forged text cards, weapons, armour, loot, homebrew from a
 * shared expansion, a photograph, and the live controls (gold, a companion, a class tracker) that are
 * React elements rather than data at all.
 *
 * Three judgement calls, all of which the owner asked for explicitly:
 *
 *  - **A colour for every card that has one.** A printed scan's colour is sampled from its art ahead
 *    of time (`scripts/card_art_colors.py`); a forged item's is the colour its art block is painted;
 *    a live control's is the colour it obviously is. A card whose art is a PHOTOGRAPH the player
 *    supplied has no colour the app can read: React Native has no pixel API, so the honest answer is
 *    null and `card-sort` files those at the end rather than inventing one.
 *  - **A length for every card.** "How much description" means the rules text the app holds. A
 *    printed scan's text lives in the picture and nowhere else, so its length is zero, and zero is a
 *    real answer here rather than a blank: a scan genuinely carries no text the sheet can show you.
 *  - **A type and a family for every card.** The type is the word on the plaque. The family is the
 *    group the type picker files it under, extended to cover the types the picker never offers
 *    because you cannot author them (Domain, Ancestry, Class, Currency).
 */

import { cardById } from '@/data/catalog';
import { armorById, weaponById } from '@/data/equipment-data';
import { ART_COLORS } from '@/data/art-colors';
import { itemColor } from '@/data/item-colors';
import { lootById } from '@/data/loot-data';
import { martialStanceById } from '@/data/martial-form-data';
import { wildshapeById } from '@/data/wildshape-data';
import { classInfo, classColor, type ClassName } from '@/constants/identity';
import { BUILTIN_TYPE_GROUPS } from '@/features/character-sheet/card-types';
import { type CharacterFile } from '@/lib/character-file';
import { type SortEntry } from '@/lib/card-sort';
import { libraryCardById } from '@/lib/library-embed';

import { contentIdOf, customCards, sourceLabelForCardId } from './card-effects';

/** Which family a type belongs to. Seeded from the picker, extended with the types you cannot author. */
const GROUP_OF_TYPE: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const g of BUILTIN_TYPE_GROUPS) for (const t of g.types) m[t.toLowerCase()] = g.label;
  const extra: Record<string, string> = {
    domain: 'Arsenal', beastform: 'Arsenal', 'wild shape': 'Arsenal', 'martial form': 'Arsenal',
    action: 'Arsenal', reaction: 'Arsenal', passive: 'Arsenal', grimoire: 'Arsenal', feature: 'Arsenal',
    loot: 'Inventory', consumable: 'Inventory', currency: 'Inventory',
    ancestry: 'Character', community: 'Character', subclass: 'Character', class: 'Character',
    companion: 'Character', transformation: 'Character', statblock: 'Character', level: 'Character',
    vitals: 'Character', evasion: 'Character', thresholds: 'Character',
  };
  for (const k of Object.keys(extra)) if (!m[k]) m[k] = extra[k];
  return m;
})();

export const groupForType = (type: string): string => GROUP_OF_TYPE[(type ?? '').trim().toLowerCase()] ?? (type.trim() ? 'Custom' : '');

const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The word a catalog card would print on its plaque. */
function typeForCatalogKind(kind: string | undefined): string {
  if (!kind) return '';
  if (kind === 'transformation') return 'Transformation';
  return cap(kind);
}

/** Live controls: no data behind them, so they are named here rather than looked up. */
const LIVE_CARDS: Record<string, { title: string; type: string; color: string }> = {
  gold: { title: 'Gold', type: 'Currency', color: '#C8AA32' },
  'martial-focus': { title: 'Martial Focus', type: 'Martial Form', color: '#8A5A34' },
  'summoner-tracker': { title: 'Summoner', type: 'Class', color: '#A82A2A' },
  'warlock-tracker': { title: 'Warlock', type: 'Class', color: '#7A56A0' },
};

const textLen = (s: string | null | undefined): number => (s ?? '').replace(/\s+/g, ' ').trim().length;

/**
 * Everything the sort needs about one card in a deck.
 *
 * `id` is the DECK's id, which is what the reorder writes back, while everything else is read through
 * the card the id resolves to, so a copy sorts exactly like the card it mirrors.
 */
export function sortEntryFor(id: string, file?: CharacterFile): SortEntry {
  const blank: SortEntry = { id, title: '', type: '', group: '', length: 0, color: null };
  const cid = contentIdOf(id, file);

  // --- the live controls -----------------------------------------------------------------------
  const liveKey = cid.startsWith('companion') ? 'companion' : cid;
  if (liveKey === 'companion') {
    return { ...blank, title: 'Companion', type: 'Companion', group: 'Character', color: '#7BA05B' };
  }
  const live = LIVE_CARDS[liveKey];
  if (live) return { ...blank, title: live.title, type: live.type, group: groupForType(live.type), color: live.color };

  // --- the class feature card (a multi-page cover with no data row of its own) -------------------
  const feat = /^(?:mc-)?features-(.+)$/.exec(cid);
  if (feat) {
    const key = feat[1] as ClassName;
    const info = (() => { try { return classInfo(key); } catch { return null; } })();
    return {
      ...blank,
      title: info?.label ?? cap(feat[1]),
      type: 'Class',
      group: 'Character',
      color: info ? classColor(key).bright : null,
    };
  }

  // --- a card the player wrote ------------------------------------------------------------------
  const custom = customCards(file).find((c) => c.id === cid);
  if (custom) {
    const type = custom.typeLabel ?? 'Card';
    return { id, title: custom.title ?? '', type, group: groupForType(type), length: textLen(custom.text), color: custom.color ?? null };
  }

  // --- a card from an expansion (homebrew, or the Void's structured content) ---------------------
  const lib = libraryCardById(file, cid);
  if (lib) {
    const type = lib.typeLabel ?? typeForCatalogKind(lib.contentType);
    const body = lib.sections?.length ? lib.sections.map((sec) => `${sec.name ?? ''} ${sec.body ?? ''}`).join(' ') : lib.text;
    return { id, title: lib.title ?? '', type, group: groupForType(type), length: textLen(body), color: lib.color ?? null };
  }

  // --- a printed card ---------------------------------------------------------------------------
  const cat = cardById(cid);
  if (cat) {
    const type = typeForCatalogKind(cat.kind);
    // Length 0 on purpose: the rules are printed INTO the picture, so there is no text to measure.
    return { id, title: cat.label, type, group: groupForType(type), length: 0, color: ART_COLORS[cid] ?? null };
  }

  // --- the equipment tables ---------------------------------------------------------------------
  const wpn = weaponById(cid);
  if (wpn) return { id, title: wpn.name, type: 'Weapon', group: 'Arsenal', length: textLen(wpn.feature ? `${wpn.feature.name} ${wpn.feature.text}` : ''), color: itemColor(wpn.name) };
  const arm = armorById(cid);
  if (arm) return { id, title: arm.name, type: 'Armor', group: 'Inventory', length: textLen(arm.feature ? `${arm.feature.name} ${arm.feature.text}` : ''), color: itemColor(arm.name) };
  const loot = lootById(cid);
  if (loot) {
    const type = loot.kind === 'consumable' ? 'Consumable' : 'Loot';
    return { id, title: loot.name, type, group: 'Inventory', length: textLen(loot.text), color: itemColor(loot.name) };
  }
  const beast = wildshapeById(cid);
  if (beast) return { id, title: beast.name, type: 'Beastform', group: 'Arsenal', length: 0, color: itemColor(beast.name) };
  const stance = martialStanceById(cid);
  if (stance) return { id, title: stance.name, type: 'Martial Form', group: 'Arsenal', length: 0, color: itemColor(stance.name) };

  // --- anything else: the kit items, whose id IS their name -------------------------------------
  const label = sourceLabelForCardId(id, file);
  return { id, title: label === id ? '' : label, type: 'Item', group: 'Inventory', length: 0, color: label === id ? null : itemColor(label) };
}
