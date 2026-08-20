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
import { isTemplateCard, resolvedPlaque } from '@/lib/card-plaque';
import { plaqueThemeOf } from './card-divider';
import { SUBCLASS_TIER_LABEL, type LibraryCard } from '@/lib/library';
import { type ReactNode, useId } from 'react';
import { Text, View } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';

import { CardFunctionControl, functionHeight } from '@/components/card-function-control';
import { blocksOf, isSpacer, migrateBlocks } from '@/lib/card-blocks';
import type { FunctionState } from '@/lib/card-functions';
import type { EffectFormula } from '@/lib/modifiers';
import { Body, Rune } from '@/constants/theme';

import { type BodyBlock, ForgedArmorCard, ForgedCard, ForgedFaceCard, FORGED_H, ForgedLootCard, FORGED_W, ForgedWeaponCard } from './forged-card';

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

/**
 * THIS CARD STARTS A SYSTEM (v0.43.1, owner).
 *
 * "I just want a good indicator that this card is different from the rest. So yeah, maybe even an SVG
 * that just has a different pattern on top of the card, to make it look different from all the other
 * cards. Creating a class, creating a type, or creating a domain should have a distinction for it to
 * not be so confusing, since this is a very different card and the players will not have this in
 * their hand."
 *
 * A diagonal hatch across the whole face and one band across the foot. Drawn OVER the card rather
 * than replacing any of it, so the author still sees the real thing, and at low opacity so it reads
 * as a watermark rather than as damage.
 *
 * The hatch is what carries the meaning at thumbnail size, where the band's words are illegible: in a
 * gallery of thirty cards the three that start systems are the three with texture on them.
 */
function SystemCardMark({ label }: { label: string }) {
  /**
   * A UNIQUE id per instance, which on the web is not optional.
   *
   * Every inline `<svg>` on a page shares ONE document, so a hard-coded pattern id means the second
   * card of this kind on screen references the first one's pattern. This project has already been
   * bitten by exactly that: v0.24.3 shipped every class banner painted with the wrong gradient
   * because SVGO minified ids per file and they all collided (see `docs/web-deploy.md`).
   */
  const patternId = `rk-system-hatch-${useId()}`;
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id={patternId} patternUnits="userSpaceOnUse" width={10} height={10}>
            <Line x1={0} y1={10} x2={10} y2={0} stroke="#0B0E13" strokeWidth={1.4} strokeOpacity={0.16} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${patternId})`} />
      </Svg>
      {/* The band sits at the foot, where a normal card has its watermark and nothing else. */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11,14,19,0.86)', paddingVertical: 3, alignItems: 'center' }}>
        <Text allowFontScaling={false} numberOfLines={1} style={{ color: Rune.goldText, fontSize: 6.5, fontFamily: Body.bold, letterSpacing: 1.1, textTransform: 'uppercase' }}>
          {label}
        </Text>
      </View>
    </View>
  );
}

/**
 * A card, with the system mark over it when it IS one.
 *
 * A plain pass-through for every ordinary card, so the overwhelming majority of cards gain nothing
 * but one component in the tree, and the two drawing paths below stay identical to each other.
 */
function Marked({ card, children }: { card: LibraryCard; children: ReactNode }) {
  if (!isTemplateCard(card)) return <>{children}</>;
  return (
    <View style={{ width: FORGED_W, height: FORGED_H }}>
      {children}
      <SystemCardMark label="Starts a system - players never hold this" />
    </View>
  );
}

export function LibraryForgedCard({ card, pack, struckIndex, functionStates, onFunction, variableValue, pageMark }: {
  card: LibraryCard;
  /**
   * v0.43.0: the cards this one can resolve its CHIP against — its expansion, or a character's own
   * embedded copies.
   *
   * Absent draws the card's own chip only, which is every call site written before templates could
   * hand one down. See `lib/card-plaque`.
   */
  pack?: readonly LibraryCard[];
  /**
   * v0.42.6: the "1/3" a card carries when it is one FACE of a paginated card.
   *
   * A homebrew class and its pages are one card you flip through, exactly as a published class is, so
   * its faces are numbered the way theirs are. See `lib/custom-class-pages`.
   */
  pageMark?: string;
  /**
   * v0.42.5: what a variable resolves to for the character holding this card, for a DICE element
   * whose count is multiplied by one. Absent means every variable reads as 1, which is what a
   * catalogue or an author's preview wants.
   */
  variableValue?: (v: EffectFormula['variable'], key?: string) => number;
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
  /**
   * The chip, resolved once for both drawing paths below (v0.43.0).
   *
   * The label and the colours travel together on purpose: a card that inherits its class's chip
   * should inherit the word as well as the paint, or a Feature card would come out saying FEATURE in
   * the class's colours, which reads as a mistake rather than as a set.
   */
  const kindLabel = libraryCardKindLabel(card, pack);
  const plaqueTheme = plaqueThemeOf(resolvedPlaque(card, pack));
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
      <Marked card={card}>
        <ForgedCard
          title={card.title}
          kindLabel={kindLabel}
          plaqueTheme={plaqueTheme}
          subtitle={libraryCardSubtitle(card)}
          body={libraryCardBody(card, struckIndex)}
          accentDeep={Rune.panel}
          imageUri={card.imageUri}
          colorArt={card.color}
          pageMark={pageMark}
          bannerArt={card.contentType === 'class'}
          multilineTitle
        />
      </Marked>
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
              variableValue={variableValue}
              onChange={onFunction ? (next) => onFunction(x.fn!.id, next) : undefined}
            />
          ),
        }
      : isSpacer(x.section)
        ? { key: `sp${i}`, node: <View style={{ height: x.section.space }} /> }
        : { key: `s${i}`, text: sectionMarkdown(x.section, i === struckIndex), align: x.section.align },
  );
  return (
    <Marked card={card}>
    <ForgedCard
      title={card.title}
      kindLabel={kindLabel}
      plaqueTheme={plaqueTheme}
      subtitle={libraryCardSubtitle(card)}
      body=""
      bodyBlocks={bodyBlocks}
      blocksHeight={blocks.reduce((n, x) => n + (x.fn ? functionHeight(x.fn) : 0), 0)}
      accentDeep={Rune.panel}
      imageUri={card.imageUri}
      colorArt={card.color}
      pageMark={pageMark}
      bannerArt={card.contentType === 'class'}
      multilineTitle
    />
    </Marked>
  );
}

/** One text section as the markdown it prints: the colon lead-in the typeset uses, struck if it is. */
function sectionMarkdown(s: { name?: string; body: string }, struck: boolean): string {
  const body = s.body.trim();
  const name = (s.name ?? '').trim();
  const line = name && body ? `**${name}:** ${body}` : name ? `**${name}:**` : body;
  return struck && line ? `~~${line}~~` : line;
}
