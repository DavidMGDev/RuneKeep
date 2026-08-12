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

import { CardFunctionControl } from '@/components/card-function-control';
import { type FunctionState, functionsAt } from '@/lib/card-functions';
import { Rune } from '@/constants/theme';

import { ForgedArmorCard, ForgedCard, ForgedFaceCard, ForgedLootCard, ForgedWeaponCard } from './forged-card';

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
  const fns = card.functions ?? [];
  const strip = (where: 'above' | 'below') => {
    const list = functionsAt(fns, where);
    if (!list.length) return undefined;
    return (
      <View style={{ gap: 8, paddingVertical: 4 }}>
        {list.map((f) => (
          <CardFunctionControl
            key={f.id}
            fn={f}
            state={functionStates?.[f.id]}
            compact
            onChange={onFunction ? (next) => onFunction(f.id, next) : undefined}
          />
        ))}
      </View>
    );
  };
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
      bodyAbove={strip('above')}
      bodyBelow={strip('below')}
    />
  );
}
