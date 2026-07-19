import { type FC } from 'react';
import { Image as ExpoImage } from 'expo-image';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop, type SvgProps } from 'react-native-svg';

import { CardMarkdownBody } from '@/components/card-markdown';
import { DividerPlaque, getPlaqueTheme } from './card-divider';
import { Body, Display, Rune } from '@/constants/theme';
import { type ClassName } from '@/constants/identity';
import { type ArmorDef, type WeaponDef } from '@/data/equipment-data';
import { type LootDef } from '@/data/loot-data';

/** Authoring size — same plane as the printed cards (5:7). Parents scale the whole card. */
export const FORGED_W = 230;
export const FORGED_H = 322;
const ART_H = Math.round(FORGED_H * 0.4); // top 40% = art; the divider plaque rides the seam

/** Auto-fit plaque text helper: tightly squeezes long labels (like "Experience") so they don't bleed out of the plaque */
export function PlaqueLabel({ text, textColor }: { text: string; textColor: string }) {
  return (
    <View style={{ maxWidth: 104, alignItems: 'center' }}>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={{
          color: textColor,
          fontSize: text.length >= 8 ? 7.6 : 8.5,
          fontFamily: Body.bold,
          letterSpacing: text.length >= 8 ? 0.4 : 1.5,
          textTransform: 'uppercase',
        }}
      >
        {text}
      </Text>
    </View>
  );
}

/**
 * A FORGED card: a code-rendered element that lives among the scanned cards as an equal — same
 * aspect, same reading order as the printed layout: art, the owner's CardDivider seam with its
 * inner-mask plaque carrying the kind label, title, body, footer watermark. It IS its own LOD
 * (one svg + text composites cheaper than a thumb). First clients: the nine class picks. Later:
 * player-authored cards (rasterize-to-webp on edit is the planned optimization).
 */
export function ForgedCard({
  title,
  kindLabel,
  subtitle,
  body,
  accentDeep,
  Banner,
  imageUri,
  colorArt,
  fallbackArt,
  pageMark,
  multilineTitle,
  classKey,
  experience,
  modifier,
}: {
  title: string;
  kindLabel: string;
  /** v0.14.0: a small centered line under the title — the subclass tier word (Foundation /
   *  Specialization / Mastery), which the official subclass scans bake into their art. */
  subtitle?: string;
  body: string;
  accentDeep: string;
  Banner?: FC<SvgProps>;
  /** Player-supplied art (#107 experiences): fills the art zone instead of a banner. */
  imageUri?: string | null;
  /** A flat random fill color for the art zone (#153) — used when there's no uploaded image. */
  colorArt?: string | null;
  /** Default art (#128 inventory items) shown when there's no player image and no banner. */
  fallbackArt?: number;
  /** Deck position (#110): when this card is face 0 of a flip-deck, the gray "1/N" mark by the title. */
  pageMark?: string;
  /** Custom cards (#136): let a long title wrap to up to 3 shrinking rows instead of ellipsizing,
   *  and shrink the body to fit. One short line stays at full size. */
  multilineTitle?: boolean;
  classKey?: ClassName;
  /** Experience card (#202): no body — the title is a big auto-fitting phrase (up to 7 lines), with
   *  the experience's bonus shown below. Short and long phrases both read well (min/max size). */
  experience?: boolean;
  /** The experience bonus to show (e.g. +2), experience cards only. */
  modifier?: number;
}) {
  const theme = getPlaqueTheme(kindLabel, classKey);
  return (
    // No frame border (owner: borders mark SELECTION only) — the parchment edge is the card edge.
    <View style={{ width: FORGED_W, height: FORGED_H, backgroundColor: Rune.sheet, overflow: 'hidden' }}>
      {/* art zone — class-deep ground (or a flat random color, #153); a banner, or the player's image */}
      <View style={{ height: ART_H, backgroundColor: !imageUri && colorArt ? colorArt : accentDeep, alignItems: 'center', justifyContent: 'flex-start', overflow: 'hidden' }}>
        {imageUri ? (
          <ExpoImage source={{ uri: imageUri }} style={{ width: FORGED_W, height: ART_H }} contentFit="cover" cachePolicy="memory-disk" />
        ) : colorArt ? null : fallbackArt != null ? (
          <ExpoImage source={fallbackArt} style={{ width: FORGED_W, height: ART_H }} contentFit="cover" cachePolicy="memory-disk" />
        ) : Banner ? (
          <Banner width={62} height={ART_H + 12} preserveAspectRatio="xMidYMin meet" />
        ) : null}
      </View>
      {/* the 40/60 seam: the divider with its plaque carrying the kind label */}
      <View style={{ position: 'absolute', top: ART_H - (FORGED_W + 14) / (1978.811 / 151.3009) / 2, left: -7, right: -7, alignItems: 'center' }} pointerEvents="none">
        <DividerPlaque width={FORGED_W + 14} gradientStops={theme.gradientStops} maskFill={theme.solidColor}>
          <PlaqueLabel text={kindLabel} textColor={theme.textColor} />
        </DividerPlaque>
      </View>
      {/* printed-card lower body — typeset against the DH scans (#103 impeccable typeset):
          extrabold caps title, regular near-black body, ~1.7 title:body ratio. */}
      {experience ? (
        // Experience (#202/#233): the phrase fills the area ABOVE a FIXED bonus pill. The title block
        // is absolutely bounded (top..just above the pill) so it auto-fits within that band, and the
        // +N pill is anchored at a constant height regardless of how many lines the title takes.
        <View style={{ flex: 1 }}>
          <View style={{ position: 'absolute', top: 16, left: 16, right: 16, bottom: 58, alignItems: 'center', justifyContent: 'center' }}>
            <Text
              numberOfLines={7}
              adjustsFontSizeToFit
              minimumFontScale={0.42}
              style={{ color: Rune.inkText, fontSize: 23, lineHeight: 26, fontFamily: Display.bold, letterSpacing: 0.2, textAlign: 'center' }}>
              {title}
            </Text>
          </View>
          {modifier != null ? (
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 30, alignItems: 'center' }}>
              <View style={{ paddingHorizontal: 14, paddingVertical: 3, backgroundColor: Rune.red }}>
                <Text style={{ color: Rune.ivory, fontSize: 17, fontFamily: Display.black, letterSpacing: 0.5 }}>{modifier >= 0 ? `+${modifier}` : `${modifier}`}</Text>
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', paddingTop: 20, paddingHorizontal: 15, paddingBottom: 24 }}>
          {/* #318: a titleless card (e.g. a note with only a body) drops the title row entirely and lets
              the body fill from the top — no "Untitled"/"Note" placeholder. */}
          {title.trim() ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 5, alignSelf: 'stretch' }}>
              <Text
                numberOfLines={multilineTitle ? 4 : 1}
                adjustsFontSizeToFit
                minimumFontScale={multilineTitle ? 0.42 : 0.55}
                style={{ flexShrink: 1, color: Rune.inkText, fontSize: 17, fontFamily: Display.black, letterSpacing: 0.3, textTransform: 'uppercase', textAlign: 'center' }}>
                {title}
              </Text>
              {pageMark ? <Text style={{ color: Rune.inkMuted, fontSize: 7.5, fontFamily: Body.bold }}>{pageMark}</Text> : null}
            </View>
          ) : pageMark ? (
            <Text style={{ alignSelf: 'flex-end', color: Rune.inkMuted, fontSize: 7.5, fontFamily: Body.bold }}>{pageMark}</Text>
          ) : null}
          {subtitle ? (
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ color: Rune.inkMuted, fontSize: 8.5, fontFamily: Body.bold, letterSpacing: 1.1, textTransform: 'uppercase', textAlign: 'center', marginTop: 3 }}>
              {subtitle}
            </Text>
          ) : null}
          <CardMarkdownBody
            body={body}
            numberOfLines={multilineTitle ? 9 : undefined}
            adjustsFontSizeToFit={multilineTitle}
            minimumFontScale={0.6}
            // v0.13.0 typeset vs the DH scans: bigger body (10.5/14), LEFT aligned like the prints
            // (justify opened rivers at this measure), black-weight title above.
            style={{ color: Rune.inkText, fontSize: 10.5, lineHeight: 14, fontFamily: Body.regular, textAlign: 'left', alignSelf: 'stretch', marginTop: title.trim() ? 6 : 0, flexShrink: 1 }}
          />
        </View>
      )}
      <ForgedFooter />
    </View>
  );
}

/** Scan-faithful print line: pen + author left, copyright right, no rule. Shared by all forged cards. */
function ForgedFooter() {
  return (
    <View style={{ position: 'absolute', left: 12, right: 12, bottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <Svg width={7} height={7} viewBox="0 0 12 12">
          <Path d="M 1 11 L 3 6 L 9 0 L 12 3 L 6 9 Z M 1 11 L 3.4 9.8" fill={Rune.inkText} />
        </Svg>
        <Text style={{ color: Rune.inkText, fontSize: 6.3, fontFamily: Body.medium, letterSpacing: 0.2 }}>RuneKeep</Text>
      </View>
      <Text style={{ color: Rune.inkText, fontSize: 6.3, fontFamily: Body.medium, letterSpacing: 0.2 }}>RuneKeep © Treehouse109 2026</Text>
    </View>
  );
}

/**
 * A forged RULES card: the class feature + hope feature text in the printed-card layout. One
 * class may need 2–3 of these (see featurePages); the header carries the page mark. Same plaque
 * seam, same footer — it lives among the scans as an equal.
 */
export function ForgedTextCard({
  title,
  kindLabel,
  pageMark,
  sections,
  accentDeep,
  Banner,
  classKey,
}: {
  title: string;
  kindLabel: string;
  pageMark?: string;
  sections: { name: string; text: string }[];
  accentDeep: string;
  Banner: FC<SvgProps>;
  classKey?: ClassName;
}) {
  const theme = getPlaqueTheme(kindLabel, classKey);
  // UNIFORM layout (#105): same 40% art band, same seam position, same banner size as the class
  // pick card — the divider never moves between forged cards. Less text per card; more cards.
  return (
    <View style={{ width: FORGED_W, height: FORGED_H, backgroundColor: Rune.sheet, overflow: 'hidden' }}>
      <View style={{ height: ART_H, backgroundColor: accentDeep, alignItems: 'center', justifyContent: 'flex-start', overflow: 'hidden' }}>
        <Banner width={62} height={ART_H + 12} preserveAspectRatio="xMidYMin meet" />
      </View>
      <View style={{ position: 'absolute', top: ART_H - (FORGED_W + 14) / (1978.811 / 151.3009) / 2, left: -7, right: -7, alignItems: 'center' }} pointerEvents="none">
        <DividerPlaque width={FORGED_W + 14} gradientStops={theme.gradientStops} maskFill={theme.solidColor}>
          <PlaqueLabel text={kindLabel} textColor={theme.textColor} />
        </DividerPlaque>
      </View>
      <View style={{ flex: 1, paddingTop: 19, paddingHorizontal: 14, paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 5 }}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55} style={{ flexShrink: 1, color: Rune.inkText, fontSize: 15, fontFamily: Display.black, letterSpacing: 0.3, textTransform: 'uppercase' }}>
            {title}
          </Text>
          {pageMark ? <Text style={{ color: Rune.inkMuted, fontSize: 7.5, fontFamily: Body.bold }}>{pageMark}</Text> : null}
        </View>
        {/* v0.13.0 typeset: left-aligned like the prints; size bumped only to 9.5 — the feature
            pagination (featurePages) is fit-tuned and this container CLIPS overflow. */}
        <View style={{ marginTop: 5, gap: 5, overflow: 'hidden', flex: 1 }}>
          {sections.map((s) => (
            <Text key={s.name} style={{ color: Rune.inkText, fontSize: 9.5, lineHeight: 13.2, fontFamily: Body.regular, textAlign: 'left' }}>
              <Text style={{ fontFamily: Body.bold }}>{s.name}: </Text>
              {s.text}
            </Text>
          ))}
        </View>
      </View>
      <ForgedFooter />
    </View>
  );
}

/** Art-zone emblem for the equipment cards (#121): sword / sparkle / shield, stroked gold. */
function EquipGlyph({ kind }: { kind: 'physical' | 'magic' | 'armor' }) {
  const stroke = Rune.goldEdge;
  const size = Math.round(ART_H * 0.6);
  if (kind === 'armor') {
    return (
      <Svg width={size} height={size} viewBox="0 0 40 44">
        <Path d="M20 3 L35 8 V20 Q35 33 20 41 Q5 33 5 20 V8 Z" fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
        <Path d="M20 12 V32 M12 20 H28" fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />
      </Svg>
    );
  }
  if (kind === 'magic') {
    return (
      <Svg width={size} height={size} viewBox="0 0 40 44">
        <Path d="M20 4 L23.5 17 L36 20.5 L23.5 24 L20 37 L16.5 24 L4 20.5 L16.5 17 Z" fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 40 44">
      <Path d="M20 4 L20 30 M12 30 H28 M20 30 V40 M16 40 H24" fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** One label/value row of an equipment card's stat block. */
function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <Text style={{ color: Rune.inkMuted, fontSize: 7.5, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ color: Rune.inkText, fontSize: 10, fontFamily: Body.semibold }}>{value}</Text>
    </View>
  );
}

/**
 * A forged WEAPON card (#121, immutable): the printed-card layout with the weapon's stat block
 * (trait / range / damage / burden) and its feature. Physical = steel ground, magic = arcane.
 */
export function ForgedWeaponCard({ weapon }: { weapon: WeaponDef }) {
  const accentDeep = weapon.kind === 'magic' ? '#2E1F3A' : '#23262C';
  const kindLabel = weapon.slot === 'secondary' ? 'Secondary' : 'Weapon';
  const theme = getPlaqueTheme(kindLabel);
  return (
    <View style={{ width: FORGED_W, height: FORGED_H, backgroundColor: Rune.sheet, overflow: 'hidden' }}>
      <View style={{ height: ART_H, backgroundColor: accentDeep, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <EquipGlyph kind={weapon.kind} />
      </View>
      <View style={{ position: 'absolute', top: ART_H - (FORGED_W + 14) / (1978.811 / 151.3009) / 2, left: -7, right: -7, alignItems: 'center' }} pointerEvents="none">
        <DividerPlaque width={FORGED_W + 14} gradientStops={theme.gradientStops} maskFill={theme.solidColor}>
          <PlaqueLabel text={kindLabel} textColor={theme.textColor} />
        </DividerPlaque>
      </View>
      <View style={{ flex: 1, paddingTop: 19, paddingHorizontal: 16, paddingBottom: 24 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55} style={{ color: Rune.inkText, fontSize: 15, fontFamily: Display.black, letterSpacing: 0.3, textTransform: 'uppercase', textAlign: 'center' }}>{weapon.name}</Text>
        <View style={{ marginTop: 8, gap: 3 }}>
          <StatRow label="Trait" value={weapon.trait} />
          <StatRow label="Range" value={weapon.range} />
          <StatRow label="Damage" value={`${weapon.damage} ${weapon.damageType}`} />
          <StatRow label="Burden" value={weapon.burden} />
        </View>
        {weapon.feature ? (
          <Text style={{ color: Rune.inkText, fontSize: 8.5, lineHeight: 12.5, fontFamily: Body.regular, textAlign: 'justify', marginTop: 9 }}>
            <Text style={{ fontFamily: Body.bold }}>{weapon.feature.name}: </Text>
            {weapon.feature.text}
          </Text>
        ) : null}
      </View>
      <ForgedFooter />
    </View>
  );
}

/** Art-zone emblem for the loot cards (v0.14.0): a banded treasure chest, or an alchemist's flask. */
function LootGlyph({ kind }: { kind: 'loot' | 'consumable' }) {
  const stroke = Rune.goldEdge;
  const size = Math.round(ART_H * 0.6);
  if (kind === 'consumable') {
    return (
      <Svg width={size} height={size} viewBox="0 0 40 44">
        {/* erlenmeyer flask: neck, shoulders, a settled liquid line and two rising bubbles */}
        <Path d="M16 6 V17 L7 34 Q5.5 38.5 10 38.5 H30 Q34.5 38.5 33 34 L24 17 V6" fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
        <Path d="M13 6 H27" fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" />
        <Path d="M10.5 29 H29.5" fill="none" stroke={stroke} strokeWidth={1.4} strokeLinecap="round" />
        <Circle cx={16} cy={33} r={1.5} fill="none" stroke={stroke} strokeWidth={1.2} />
        <Circle cx={23.5} cy={34.5} r={1.1} fill="none" stroke={stroke} strokeWidth={1.2} />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 40 44">
      {/* treasure chest: domed lid, banded body, keyhole plate */}
      <Path d="M5 21 V16 Q5 7 20 7 Q35 7 35 16 V21" fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M4 21 H36 V36 Q36 38.5 33.5 38.5 H6.5 Q4 38.5 4 36 Z" fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M16.5 21 H23.5 V30 H16.5 Z" fill="none" stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" />
      <Circle cx={20} cy={25} r={1.4} fill="none" stroke={stroke} strokeWidth={1.2} />
    </Svg>
  );
}

/**
 * A forged LOOT / CONSUMABLE card (v0.14.0, immutable): the same printed-card layout the equipment
 * cards use, so found treasure reads as a sibling of weapons and armor rather than as a plain note.
 * Loot sits on dug earth, consumables on apothecary glass; the rulebook table roll rides a stat row.
 */
export function ForgedLootCard({ loot }: { loot: LootDef }) {
  const kindLabel = loot.kind === 'consumable' ? 'Consumable' : 'Loot';
  const accentDeep = loot.kind === 'consumable' ? '#1A2620' : '#241B10';
  const theme = getPlaqueTheme(kindLabel);
  return (
    <View style={{ width: FORGED_W, height: FORGED_H, backgroundColor: Rune.sheet, overflow: 'hidden' }}>
      <View style={{ height: ART_H, backgroundColor: accentDeep, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <LootGlyph kind={loot.kind} />
      </View>
      <View style={{ position: 'absolute', top: ART_H - (FORGED_W + 14) / (1978.811 / 151.3009) / 2, left: -7, right: -7, alignItems: 'center' }} pointerEvents="none">
        <DividerPlaque width={FORGED_W + 14} gradientStops={theme.gradientStops} maskFill={theme.solidColor}>
          <PlaqueLabel text={kindLabel} textColor={theme.textColor} />
        </DividerPlaque>
      </View>
      <View style={{ flex: 1, paddingTop: 19, paddingHorizontal: 16, paddingBottom: 24 }}>
        <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.5} style={{ color: Rune.inkText, fontSize: 15, fontFamily: Display.black, letterSpacing: 0.3, textTransform: 'uppercase', textAlign: 'center' }}>{loot.name}</Text>
        <View style={{ marginTop: 8 }}>
          <StatRow label="Roll" value={loot.roll} />
        </View>
        <CardMarkdownBody
          body={loot.text}
          numberOfLines={11}
          adjustsFontSizeToFit
          minimumFontScale={0.55}
          style={{ color: Rune.inkText, fontSize: 9.5, lineHeight: 13, fontFamily: Body.regular, textAlign: 'left', alignSelf: 'stretch', marginTop: 8, flexShrink: 1 }}
        />
      </View>
      <ForgedFooter />
    </View>
  );
}

/**
 * The GOLD card (#128, immutable): the character's coin. A flat-but-rich golden gradient art zone
 * with a coin emblem — simple/modern, not a detailed illustration, per owner.
 */
export function ForgedGoldCard({ amount }: { amount?: number }) {
  const theme = getPlaqueTheme('Currency');
  return (
    <View style={{ width: FORGED_W, height: FORGED_H, backgroundColor: Rune.sheet, overflow: 'hidden' }}>
      <View style={{ height: ART_H, overflow: 'hidden' }}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="rk_gold_card" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#7a5e22" />
              <Stop offset="0.42" stopColor="#e7c668" />
              <Stop offset="0.62" stopColor="#fff2c4" />
              <Stop offset="0.8" stopColor="#caa247" />
              <Stop offset="1" stopColor="#6f5320" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#rk_gold_card)" />
        </Svg>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={Math.round(ART_H * 0.52)} height={Math.round(ART_H * 0.52)} viewBox="0 0 40 40">
            <Circle cx={20} cy={20} r={14} fill="rgba(255,246,212,0.18)" stroke="#fff6df" strokeWidth={2} />
            <Path d="M 20 11 V 29 M 16 15.5 h 7 a 3 3 0 0 1 0 6 h -6 a 3 3 0 0 0 0 6 h 7" fill="none" stroke="#5a4416" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </View>
      </View>
      <View style={{ position: 'absolute', top: ART_H - (FORGED_W + 14) / (1978.811 / 151.3009) / 2, left: -7, right: -7, alignItems: 'center' }} pointerEvents="none">
        <DividerPlaque width={FORGED_W + 14} gradientStops={theme.gradientStops} maskFill={theme.solidColor}>
          <PlaqueLabel text="Currency" textColor={theme.textColor} />
        </DividerPlaque>
      </View>
      <View style={{ flex: 1, alignItems: 'center', paddingTop: 20, paddingHorizontal: 16, paddingBottom: 24 }}>
        <Text numberOfLines={1} style={{ color: Rune.inkText, fontSize: 17, fontFamily: Display.black, letterSpacing: 0.3, textTransform: 'uppercase' }}>Gold</Text>
        {amount != null ? <Text style={{ color: Rune.inkText, fontSize: 22, fontFamily: Display.black, marginTop: 4 }}>{amount}</Text> : null}
        <Text style={{ color: Rune.inkText, fontSize: 9, lineHeight: 13.5, fontFamily: Body.regular, textAlign: 'center', marginTop: 7 }}>Coin for trade, bribes, and the finer things. Track it here as you spend and earn.</Text>
      </View>
      <ForgedFooter />
    </View>
  );
}

/** A forged ARMOR card (#121, immutable): base thresholds, base score, feature. */
export function ForgedArmorCard({ armor }: { armor: ArmorDef }) {
  const theme = getPlaqueTheme('Armor');
  return (
    <View style={{ width: FORGED_W, height: FORGED_H, backgroundColor: Rune.sheet, overflow: 'hidden' }}>
      <View style={{ height: ART_H, backgroundColor: '#23262C', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <EquipGlyph kind="armor" />
      </View>
      <View style={{ position: 'absolute', top: ART_H - (FORGED_W + 14) / (1978.811 / 151.3009) / 2, left: -7, right: -7, alignItems: 'center' }} pointerEvents="none">
        <DividerPlaque width={FORGED_W + 14} gradientStops={theme.gradientStops} maskFill={theme.solidColor}>
          <PlaqueLabel text="Armor" textColor={theme.textColor} />
        </DividerPlaque>
      </View>
      <View style={{ flex: 1, paddingTop: 19, paddingHorizontal: 16, paddingBottom: 24 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55} style={{ color: Rune.inkText, fontSize: 15, fontFamily: Display.black, letterSpacing: 0.3, textTransform: 'uppercase', textAlign: 'center' }}>{armor.name}</Text>
        <View style={{ marginTop: 8, gap: 3 }}>
          <StatRow label="Thresholds" value={armor.thresholds} />
          <StatRow label="Base Score" value={String(armor.baseScore)} />
        </View>
        {armor.feature ? (
          <Text style={{ color: Rune.inkText, fontSize: 8.5, lineHeight: 12.5, fontFamily: Body.regular, textAlign: 'justify', marginTop: 9 }}>
            <Text style={{ fontFamily: Body.bold }}>{armor.feature.name}: </Text>
            {armor.feature.text}
          </Text>
        ) : null}
      </View>
      <ForgedFooter />
    </View>
  );
}
