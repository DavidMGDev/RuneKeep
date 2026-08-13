/**
 * Rendering an EMBEDDED library (homebrew) card (v0.14.0).
 *
 * Before this existed, every place that drew a `LibraryCard` built the generic `ForgedCard` inline —
 * five call sites, all identical. That is why a homebrew or NFC-received WEAPON rendered as a flat
 * rectangle of color with its stats mashed into the body text: catalog equipment (a `WeaponDef` id →
 * `ForgedWeaponCard`) and embedded equipment (a `LibraryCard` → generic card) were two disjoint render
 * paths, and only the first one knew about glyphs, stat blocks and equipment plaques.
 *
 * This is the ONE place that dispatch happens now. Weapon/armor content synthesizes the definition the
 * real equipment cards already take and delegates to them, so a received weapon looks like a weapon
 * everywhere and forever — not just during the receive ceremony.
 */
import type { ArmorDef, WeaponDef } from '@/data/equipment-data';
import { lootById } from '@/data/loot-data';
import { VOID_ANCESTRY_FACE } from '@/data/void-ancestries';
import { authoredSections } from '@/lib/card-form';
import { composeSections } from '@/lib/card-markdown';
import { libraryCardBody, libraryCardKindLabel } from '@/lib/library-embed';
import { SUBCLASS_TIER_LABEL, type LibraryCard } from '@/lib/library';
import { View } from 'react-native';

import { CardFunctionControl, functionHeight } from '@/components/card-function-control';
import { blocksOf, isSpacer, migrateBlocks } from '@/lib/card-blocks';
import type { FunctionState } from '@/lib/card-functions';
import { Rune } from '@/constants/theme';

import { type BodyBlock, ForgedArmorCard, ForgedCard, ForgedFaceCard, ForgedLootCard, ForgedWeaponCard } from './forged-card';

/**
 * The equipment cards print ONE feature line. Homebrew keeps it in the body as `**Name:** text`
 * (that's what the share path writes), so unwrap it back into the shape those cards expect.
 *
 * v0.30.0: the card's DETAIL FORM also writes a block into the body now, and on a weapon or armor
 * card that block is the trait / range / damage / burden the stat block above already prints. So the
 * author's own words are what reaches the feature line; printing the stats twice would be worse than
 * not printing them at all. Everywhere else the block is the only place those facts appear, and it
 * stays.
 */
function authoredText(card: LibraryCard): string {
  const own = authoredSections(card.sections);
  return card.sections ? composeSections(own) : card.text;
}

function specFeature(text: string): { name: string; text: string } | undefined {
  const t = text.trim();
  if (!t) return undefined;
  const m = /^\*\*(.+?):?\*\*:?\s*([\s\S]*)$/.exec(t);
  return m && m[2].trim() ? { name: m[1].trim(), text: m[2].trim() } : { name: 'Feature', text: t };
}

/** v0.14.0: the tier word printed under a custom subclass's title, matching the official scans (which
 *  bake it into the art). Only subclass content carries one. */
export function libraryCardSubtitle(lc: LibraryCard): string | undefined {
  return lc.contentType === 'subclass' ? SUBCLASS_TIER_LABEL[lc.tier ?? 1] : undefined;
}

export function LibraryForgedCard({ card, struckIndex, functionStates, onFunction }: {
  card: LibraryCard;
  struckIndex?: number;
  /** v0.42.0: the player's live state for this card's functional elements, by function id. */
  functionStates?: Record<string, FunctionState>;
  /** Absent draws them inert, which is how the card looks anywhere it cannot be played. */
  onFunction?: (functionId: string, next: FunctionState) => void;
}) {
  // v0.34.8: the author already laid this card out somewhere else (the Daggerheart card creator), so
  // it prints as its own face, exactly like the publisher's scans. Everything else about it — its
  // content type, domain, effects — still works; only the drawing is the picture.
  if (card.fullImage && card.imageUri) return <ForgedFaceCard face={card.imageUri} />;
  // v0.14.1: a shared loot/consumable travels as a reference. If this phone has the item bundled,
  // draw the REAL forged loot card (chest/flask glyph, roll row) rather than a flattened note.
  const loot = card.catalogId ? lootById(card.catalogId) : undefined;
  if (loot) return <ForgedLootCard loot={loot} />;
  if (card.contentType === 'weapon' && card.weapon) {
    const w = card.weapon;
    const def: WeaponDef = {
      id: card.id,
      name: card.title,
      tier: w.tier,
      trait: w.trait as WeaponDef['trait'],
      range: w.range as WeaponDef['range'],
      damage: w.damage,
      damageType: w.damageType,
      burden: w.burden,
      kind: w.kind,
      slot: w.slot,
      feature: specFeature(authoredText(card)),
      effects: card.effects,
    };
    return <ForgedWeaponCard weapon={def} />;
  }
  if (card.contentType === 'armor' && card.armor) {
    const def: ArmorDef = {
      id: card.id,
      name: card.title,
      tier: card.armor.tier,
      thresholds: card.armor.thresholds,
      baseScore: card.armor.baseScore,
      feature: specFeature(authoredText(card)),
      effects: card.effects,
    };
    return <ForgedArmorCard armor={def} />;
  }
  // v0.25.0: the Hope and Fear ancestries ARE their printed faces, bundled and looked up by id (kept
  // off the serializable card). Nothing to forge: the publisher laid the card out already. The
  // mixed-ancestry cross-out rides over the top as measured strike lines instead of striking text,
  // which is why `struckIndex` must not also apply here.
  const face = VOID_ANCESTRY_FACE[card.id];
  if (face != null) return <ForgedFaceCard face={face} />;
  /**
   * FUNCTIONAL ELEMENTS ride the card's body (v0.42.0, owner).
   *
   * Above or below the text, as the author placed them, and with real state in both the preview and
   * the sheet. `onFunction` absent draws them inert, which is what the gallery and any read-only
   * view want: the card should still LOOK like what it is.
   */
  /**
   * The body, IN THE ORDER THE AUTHOR ARRANGED IT (v0.42.3, owner).
   *
   * Text, a control, more text. `migrateBlocks` reads a card authored before elements were sections
   * into the same shape, so an old card with an above-placed counter still draws above the text and
   * nothing anybody wrote is lost. See `lib/card-blocks`.
   */
  const { sections, functions } = migrateBlocks(card.sections, card.functions);
  const blocks = blocksOf(sections, functions);
  /**
   * The BLOCK path is taken whenever the author has arranged anything (v0.42.5).
   *
   * v0.42.3 took it only for a card carrying functional elements, so per-section ALIGNMENT silently
   * did nothing on every other card: the alignment lives on the section, and the fallback composes
   * every section into one markdown string that has no sections left to align. The owner reported it
   * as "the alignment controls stopped working", and this is why.
   *
   * A card with neither elements nor alignment still takes the old path, which keeps one composed
   * body and one `fitText` pass for the overwhelming majority of cards.
   */
  const hasFunctions = blocks.some((x) => x.fn);
  const hasAlignment = blocks.some((x) => x.section.align && x.section.align !== 'left');
  const hasSpacers = blocks.some((x) => isSpacer(x.section));
  if (!hasFunctions && !hasAlignment && !hasSpacers) {
    return (
      <ForgedCard
        title={card.title}
        kindLabel={libraryCardKindLabel(card)}
        subtitle={libraryCardSubtitle(card)}
        body={libraryCardBody(card, struckIndex)}
        accentDeep={Rune.panel}
        imageUri={card.imageUri}
        colorArt={card.color}
        multilineTitle
      />
    );
  }
  const bodyBlocks: BodyBlock[] = blocks.map((x, i) =>
    x.fn
      ? {
          key: x.fn.id,
          node: (
            <CardFunctionControl
              fn={x.fn}
              state={functionStates?.[x.fn.id]}
              compact
              onChange={onFunction ? (next) => onFunction(x.fn!.id, next) : undefined}
            />
          ),
        }
      : isSpacer(x.section)
        ? { key: `sp${i}`, node: <View style={{ height: x.section.space }} /> }
        : { key: `s${i}`, text: sectionMarkdown(x.section, i === struckIndex), align: x.section.align },
  );
  return (
    <ForgedCard
      title={card.title}
      kindLabel={libraryCardKindLabel(card)}
      subtitle={libraryCardSubtitle(card)}
      body=""
      bodyBlocks={bodyBlocks}
      blocksHeight={blocks.reduce((n, x) => n + (x.fn ? functionHeight(x.fn) : 0), 0)}
      accentDeep={Rune.panel}
      imageUri={card.imageUri}
      colorArt={card.color}
      multilineTitle
    />
  );
}

/** One text section as the markdown it prints: the colon lead-in the typeset uses, struck if it is. */
function sectionMarkdown(s: { name?: string; body: string }, struck: boolean): string {
  const body = s.body.trim();
  const name = (s.name ?? '').trim();
  const line = name && body ? `**${name}:** ${body}` : name ? `**${name}:**` : body;
  return struck && line ? `~~${line}~~` : line;
}
