import { type ReactNode, useId } from 'react';
import { View } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

import CardDividerSvg from '../../../../assets/art/cardElements/CardDivider.svg';
import { type ClassName } from '@/constants/identity';

// Source geometry: divider viewBox 1979x151; the inner mask plaque is 1321x192 and, centered on
// the divider (owner: grow ~3px left / ~1px up at source scale), cuts the divider's center
// exactly. Whatever sits inside the mask's bounding box reads as content ON the plaque.
const DIV_AR = 1978.811 / 151.3009;
const MASK_W_FRAC = 1321.3586 / 1978.811;
const MASK_AR = 1321.3586 / 192.1075;
/**
 * How far the coloured plaque reaches back under the divider's gold, in px.
 *
 * v0.37 took it to 2 and the owner called that one too many: the chip then read as wider than its
 * frame on the left. One pixel covers the seam and nothing more.
 */
const PLAQUE_BLEED = 1;

export interface PlaqueTheme {
  gradientStops?: { offset: string; color: string }[];
  solidColor?: string;
  textColor: string;
}

/**
 * Every card type's plaque (v0.36.2 -> v0.36.3, owner).
 *
 * Class cards are handled above, because their colour is the CLASS's rather than the type's. Every
 * other kind the app can generate or a player can choose now has one here, which is what the owner
 * asked for: the plaque is the one place a card says what it is, and until now most of them said it
 * in the same parchment-and-red as everything else.
 *
 * Three rules held throughout, because a plaque is a 10dp strip of type on a coloured band and
 * nothing else matters as much as being able to read it:
 *
 *  1. The two stops are always close in value. A gradient that runs light to dark leaves the label
 *     legible at one end and lost at the other.
 *  2. Text is either bright on a dark band or ink on a light one, never mid on mid.
 *  3. Families share a hue. The arsenal runs warm through red and amber; the inventory runs earth
 *     and metal; notes run paper and ink; everything a stat block carries runs cold steel and slate,
 *     so a characterized adversary's cards read as one set.
 *
 * Keys are lower-cased kind labels. An unknown kind falls through to the parchment default, which is
 * deliberately still there: the generic "Card" type is meant to look generic.
 */
const KIND_THEMES: Record<string, PlaqueTheme> = {
  // --- the character themselves -------------------------------------------------------------
  // v0.37.1 (owner): was two browns, which on a 10dp band read as mud rather than as leather. Green:
  // an Experience is something a character has grown into, and green is the only family the arsenal
  // was not already using.
  experience: { gradientStops: [{ offset: '0%', color: '#15442A' }, { offset: '100%', color: '#237848' }], textColor: '#9BF3BE' },
  ancestry: { gradientStops: [{ offset: '0%', color: '#1E3A34' }, { offset: '100%', color: '#2E5347' }], textColor: '#A7E8C9' },
  community: { gradientStops: [{ offset: '0%', color: '#243247' }, { offset: '100%', color: '#37496A' }], textColor: '#B9CDF2' },
  subclass: { gradientStops: [{ offset: '0%', color: '#2E2340' }, { offset: '100%', color: '#453257' }], textColor: '#D9C2F5' },
  domain: { gradientStops: [{ offset: '0%', color: '#2A2140' }, { offset: '100%', color: '#3E2F5E' }], textColor: '#CDB8F0' },
  /**
   * v0.42.3 (owner): "Domain" and "Domain Card" had no plaque of their own and fell through to the
   * generic parchment, which is the one thing every other card type here avoids. A domain CARD is a
   * shade lighter than the domain itself, so a domain and its cards read as a family without reading
   * as the same card.
   */
  'domain card': { gradientStops: [{ offset: '0%', color: '#352A52' }, { offset: '100%', color: '#4C3A72' }], textColor: '#DCC9F7' },
  /**
   * v0.42.3: GRIMOIRE, the third type the printed domain cards carry, after Ability and Spell. The
   * book prints it as a book, so it takes the ink-and-vellum end of the arcane family rather than
   * another violet.
   */
  grimoire: { gradientStops: [{ offset: '0%', color: '#1B2438' }, { offset: '100%', color: '#2D3A5C' }], textColor: '#C3D2F5' },
  transformation: { gradientStops: [{ offset: '0%', color: '#301C2E' }, { offset: '100%', color: '#4A2A44' }], textColor: '#F0B8E4' },
  beastform: { gradientStops: [{ offset: '0%', color: '#2A3A1E' }, { offset: '100%', color: '#3F5730' }], textColor: '#C8E8A0' },
  'wild shape': { gradientStops: [{ offset: '0%', color: '#2A3A1E' }, { offset: '100%', color: '#3F5730' }], textColor: '#C8E8A0' },
  'martial form': { gradientStops: [{ offset: '0%', color: '#3A2118' }, { offset: '100%', color: '#573324' }], textColor: '#F2C3A6' },
  companion: { gradientStops: [{ offset: '0%', color: '#33301C' }, { offset: '100%', color: '#4C472B' }], textColor: '#EDE0A8' },
  // v0.37.1: a scar takes a Hope slot away, so it is painted in the colour of a wound going cold,
  // and it is the only plaque in the character family that is not a colour you would choose.
  scar: { gradientStops: [{ offset: '0%', color: '#4A1220' }, { offset: '100%', color: '#2A1A24' }], textColor: '#F0A8B4' },

  // --- the arsenal: warm, active ------------------------------------------------------------
  ability: { gradientStops: [{ offset: '0%', color: '#4A1C22' }, { offset: '100%', color: '#6B2A2E' }], textColor: '#FFC9A3' },
  // v0.37.1: an Attack is the sharpest thing in the arsenal, so it takes the hottest red of the family.
  attack: { gradientStops: [{ offset: '0%', color: '#6B1410' }, { offset: '100%', color: '#9E2318' }], textColor: '#FFD8C0' },
  skill: { gradientStops: [{ offset: '0%', color: '#33232E' }, { offset: '100%', color: '#4E3444' }], textColor: '#F2C6E0' },
  spell: { gradientStops: [{ offset: '0%', color: '#1F2C55' }, { offset: '100%', color: '#33417A' }], textColor: '#A9C8FF' },
  trick: { gradientStops: [{ offset: '0%', color: '#22303A' }, { offset: '100%', color: '#334857' }], textColor: '#9FE3F5' },
  maneuver: { gradientStops: [{ offset: '0%', color: '#3A2E18' }, { offset: '100%', color: '#564526' }], textColor: '#F5D89B' },

  // --- what a stat block carries: cold steel, one family --------------------------------------
  statblock: { gradientStops: [{ offset: '0%', color: '#1C2430' }, { offset: '100%', color: '#2E3B4D' }], textColor: '#BFD4EC' },
  level: { gradientStops: [{ offset: '0%', color: '#23303F' }, { offset: '100%', color: '#39506B' }], textColor: '#CBE2FF' },
  thresholds: { gradientStops: [{ offset: '0%', color: '#3B2B22' }, { offset: '100%', color: '#573F31' }], textColor: '#FFCFA8' },
  vitals: { gradientStops: [{ offset: '0%', color: '#3E1D22' }, { offset: '100%', color: '#5C2C31' }], textColor: '#FFB8B8' },
  evasion: { gradientStops: [{ offset: '0%', color: '#1F3330' }, { offset: '100%', color: '#2F4C46' }], textColor: '#A8E6D4' },
  action: { gradientStops: [{ offset: '0%', color: '#571F1B' }, { offset: '100%', color: '#7A2F26' }], textColor: '#FFD2B0' },
  reaction: { gradientStops: [{ offset: '0%', color: '#1B3A4A' }, { offset: '100%', color: '#2A5468' }], textColor: '#A9DDF2' },
  passive: { gradientStops: [{ offset: '0%', color: '#2C3038' }, { offset: '100%', color: '#414750' }], textColor: '#D6DDE6' },
  feature: { gradientStops: [{ offset: '0%', color: '#2C3038' }, { offset: '100%', color: '#414750' }], textColor: '#D6DDE6' },

  // --- the inventory: earth and metal ---------------------------------------------------------
  tool: { gradientStops: [{ offset: '0%', color: '#33302A' }, { offset: '100%', color: '#4B463C' }], textColor: '#E4DCC6' },
  treasure: { gradientStops: [{ offset: '0%', color: '#4A3410' }, { offset: '100%', color: '#6E4E17' }], textColor: '#FFE29A' },
  key: { gradientStops: [{ offset: '0%', color: '#2E2A22' }, { offset: '100%', color: '#4A4231' }], textColor: '#F0D89A' },
  trinket: { gradientStops: [{ offset: '0%', color: '#2B2536' }, { offset: '100%', color: '#413851' }], textColor: '#DCC8F0' },
  supply: { gradientStops: [{ offset: '0%', color: '#25311F' }, { offset: '100%', color: '#3A4A30' }], textColor: '#CDE6B0' },
  relic: { gradientStops: [{ offset: '0%', color: '#331E33' }, { offset: '100%', color: '#4E2F4E' }], textColor: '#EFC4EF' },

  // --- notes: paper and ink -------------------------------------------------------------------
  note: { gradientStops: [{ offset: '0%', color: '#E8E1CE' }, { offset: '100%', color: '#D6CCB2' }], textColor: '#3A3324' },
  reminder: { gradientStops: [{ offset: '0%', color: '#F0D9A8' }, { offset: '100%', color: '#E0BE7C' }], textColor: '#4A3410' },
  important: { gradientStops: [{ offset: '0%', color: '#7A1F1C' }, { offset: '100%', color: '#A62B24' }], textColor: '#FFE0D2' },
  /**
   * v0.37.1 (owner): the old Story was two near-blacks, which is not what a story looks like. This is
   * the dusk end of the classic indigo-to-violet pair, deep enough to hold pale lilac type and bright
   * enough to be a colour rather than an absence of one. It is the most saturated plaque in the set
   * on purpose: Story is the note a player writes when something actually happened.
   */
  story: { gradientStops: [{ offset: '0%', color: '#3A2A7A' }, { offset: '100%', color: '#7B3FB5' }], textColor: '#F2E4FF' },
  // The three notes that sit around it, each a clear hue of its own so a page of notes reads as a set
  // of different things rather than one thing repeated (v0.37.1, owner).
  lore: { gradientStops: [{ offset: '0%', color: '#123A4A' }, { offset: '100%', color: '#1F6076' }], textColor: '#B7ECFF' },
  flavor: { gradientStops: [{ offset: '0%', color: '#6E2A46' }, { offset: '100%', color: '#A03C5E' }], textColor: '#FFD6E4' },
  mystery: { gradientStops: [{ offset: '0%', color: '#1C1B3A' }, { offset: '100%', color: '#3B2C6B' }], textColor: '#C4BFF5' },
  place: { gradientStops: [{ offset: '0%', color: '#1F3A33' }, { offset: '100%', color: '#31564B' }], textColor: '#AEE6D2' },
  person: { gradientStops: [{ offset: '0%', color: '#3A2A2A' }, { offset: '100%', color: '#573F3F' }], textColor: '#F2D2C6' },
  quest: { gradientStops: [{ offset: '0%', color: '#233A4A' }, { offset: '100%', color: '#365468' }], textColor: '#B4DCF2' },

  // --- kept from before, unchanged ------------------------------------------------------------
  item: { gradientStops: [{ offset: '0%', color: '#4A3B2A' }, { offset: '100%', color: '#6B5540' }], textColor: '#F5E6D3' },
  weapon: { gradientStops: [{ offset: '0%', color: '#3A1A1A' }, { offset: '100%', color: '#5C2E2E' }], textColor: '#FFD7B5' },
  secondary: { gradientStops: [{ offset: '0%', color: '#3A1A1A' }, { offset: '100%', color: '#5C2E2E' }], textColor: '#FFD7B5' },
  armor: { gradientStops: [{ offset: '0%', color: '#3E352E' }, { offset: '100%', color: '#221C18' }], textColor: '#F59E0B' },
  loot: { gradientStops: [{ offset: '0%', color: '#2B2113' }, { offset: '100%', color: '#6B4A12' }], textColor: '#FCD34D' },
  consumable: { gradientStops: [{ offset: '0%', color: '#241B33' }, { offset: '100%', color: '#1B3A2E' }], textColor: '#6EE7B7' },
  currency: { gradientStops: [{ offset: '0%', color: '#B45309' }, { offset: '100%', color: '#FBBF24' }], textColor: '#0B0E13' },
};

/**
 * An AUTHORED chip, as a theme (v0.43.0, owner).
 *
 * The two stops are drawn as the gradient; one stop on its own is taken as a flat band, because a
 * gradient from a colour to nothing is not a thing anybody means. The text colour defaults to the
 * parchment ivory, which reads on every dark band and is the safe answer when an author has picked
 * colours and not thought about the type sitting on them.
 *
 * Returns nothing when the spec says nothing about colour, so a type that only renamed its chip keeps
 * whatever palette its kind already had.
 */
export function plaqueThemeOf(spec: { from?: string; to?: string; text?: string } | undefined): PlaqueTheme | undefined {
  if (!spec) return undefined;
  const { from, to, text } = spec;
  if (!from && !to) return undefined;
  const textColor = text || '#FAF8F2';
  if (from && to) return { gradientStops: [{ offset: '0%', color: from }, { offset: '100%', color: to }], textColor };
  return { solidColor: (from || to)!, textColor };
}

/**
 * Returns a custom plaque theme (gradient or solid background, and label text color)
 * based on the card's kindLabel and optional class key.
 */
export function getPlaqueTheme(kindLabel: string, classKey?: ClassName): PlaqueTheme {
  const normalizedKind = kindLabel.trim().toLowerCase();

  // If it's a class or features card
  if (normalizedKind === 'class' || normalizedKind === 'features') {
    if (classKey) {
      switch (classKey) {
        case 'bard':
          return {
            gradientStops: [
              { offset: '0%', color: '#802A50' }, // rich raspberry
              { offset: '100%', color: '#1D4D75' }, // deep sapphire
            ],
            textColor: '#FDE047', // Radiant Gold
          };
        case 'druid':
          return {
            gradientStops: [
              { offset: '0%', color: '#1B4D2E' }, // forest pine
              { offset: '100%', color: '#4D205A' }, // deep amethyst
            ],
            textColor: '#E6F4EA', // Soft Mint
          };
        case 'guardian':
          return {
            gradientStops: [
              { offset: '0%', color: '#6E2E1D' }, // terracotta
              { offset: '100%', color: '#3D4045' }, // dark slate iron
            ],
            textColor: '#F6D365', // Warm Gold
          };
        case 'ranger':
          return {
            gradientStops: [
              { offset: '0%', color: '#6E624A' }, // mossy bark
              { offset: '100%', color: '#245436' }, // spruce green
            ],
            textColor: '#FDFBF7', // Bone White
          };
        case 'rogue':
          return {
            gradientStops: [
              { offset: '0%', color: '#1F1B24' }, // midnight obsidian
              { offset: '100%', color: '#73244D' }, // violet rose
            ],
            textColor: '#F59E0B', // Bright Amber
          };
        case 'seraph':
          return {
            gradientStops: [
              { offset: '0%', color: '#8F6E18' }, // burnished gold
              { offset: '100%', color: '#9E3E1B' }, // holy ember red
            ],
            textColor: '#FFFBEB', // Celestial Ivory
          };
        case 'sorcerer':
          return {
            gradientStops: [
              { offset: '0%', color: '#4C2269' }, // purple void
              { offset: '100%', color: '#181824' }, // space black
            ],
            textColor: '#D8B4FE', // Glowing Violet
          };
        case 'warrior':
          return {
            gradientStops: [
              { offset: '0%', color: '#8B1C1C' }, // crimson blood
              { offset: '100%', color: '#4A4B50' }, // gunmetal grey
            ],
            textColor: '#F1F5F9', // Polished Steel
          };
        case 'wizard':
          return {
            gradientStops: [
              { offset: '0%', color: '#1E3A8A' }, // royal blue
              { offset: '100%', color: '#B45309' }, // amber light
            ],
            textColor: '#FEF08A', // Bright Yellow-Gold
          };
        /**
         * The six expansion classes (v0.37, owner).
         *
         * They fell through to the generic red below, so an Assassin's card said CLASS in the same
         * plaque a card with no class at all gets, while every base class carried its own banner.
         * Each of these is its two DOMAINS, which is what the banner above the plaque is painted
         * from: Midnight and Blade for the Assassin, Dread and Sage for the Witch, and so on. The
         * stops are the sampled domain colours pulled toward each other in value, because a plaque
         * is a 10dp strip of type and a gradient that runs light to dark loses the word at one end.
         */
        case 'assassin':
          return {
            gradientStops: [
              { offset: '0%', color: '#2F2F26' }, // midnight ink
              { offset: '100%', color: '#7E2420' }, // blade crimson
            ],
            textColor: '#F3D8A4', // Pale Gold
          };
        case 'witch':
          return {
            gradientStops: [
              { offset: '0%', color: '#3A2C4E' }, // dread violet
              { offset: '100%', color: '#1F4A32' }, // sage green
            ],
            textColor: '#DED2F5', // Pale Lilac
          };
        case 'warlock':
          return {
            gradientStops: [
              { offset: '0%', color: '#3A2C4E' }, // dread violet
              { offset: '100%', color: '#6B2A48' }, // grace magenta
            ],
            textColor: '#F2C4E2', // Soft Rose
          };
        case 'bloodhunter':
          return {
            gradientStops: [
              { offset: '0%', color: '#5C1E1E' }, // blood crimson
              { offset: '100%', color: '#4A4B42' }, // bone grey
            ],
            textColor: '#E8E1CA', // Bone White
          };
        case 'summoner':
          return {
            gradientStops: [
              { offset: '0%', color: '#5C1E1E' }, // blood crimson
              { offset: '100%', color: '#6B5A22' }, // splendor gold
            ],
            textColor: '#FFE7A8', // Warm Gold
          };
        case 'brawler':
          return {
            gradientStops: [
              { offset: '0%', color: '#4E4F44' }, // bone grey
              { offset: '100%', color: '#6E4426' }, // valor umber
            ],
            textColor: '#FFE0B8', // Lamplight
          };
      }
    }
    // Fallback for Class / Features
    return {
      gradientStops: [
        { offset: '0%', color: '#801A1A' },
        { offset: '100%', color: '#4A0E0E' },
      ],
      textColor: '#FDE047', // Gold
    };
  }

  const themed = KIND_THEMES[normalizedKind];
  if (themed) return themed;

  // General fallback
  return {
    solidColor: '#FAF8F2',
    textColor: '#C81B18', // Rune.red
  };
}

/** Vector plaque mask using inline SVG path and linear gradient fill support */
function PlaqueMask({ width, height, gradientStops, fill }: { width: string | number; height: string | number; gradientStops?: { offset: string; color: string }[]; fill?: string }) {
  // #328: a stable per-instance id (was Math.random() every render, which recreated the SVG gradient
  // <Defs> + url(#...) fill each render — wasteful churn on live cards). useId is internal-only, so
  // output is pixel-identical; same proven pattern as card-tokens.tsx TokenButton/DieButton.
  const gradientId = useId();
  return (
    <Svg viewBox="369.1956 476.1373 1321.3586 192.1075" width={width} height={height} preserveAspectRatio="none">
      {gradientStops ? (
        <Defs>
          <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            {gradientStops.map((stop, idx) => (
              <Stop key={idx} offset={stop.offset} stopColor={stop.color} />
            ))}
          </LinearGradient>
        </Defs>
      ) : null}
      <Path
        transform="translate(0,0)"
        fill={gradientStops ? `url(#${gradientId})` : fill || 'currentColor'}
        d="M 569.801 476.21 L 1490.03 477.999 L 1538.86 517.323 L 1607.8 517.323 L 1690.31 576.329 C 1669.67 580.936 1648.19 583.52 1627.59 588.357 C 1613.81 591.591 1599.88 601.275 1586.88 607.013 C 1556.6 620.376 1532.83 645.899 1508.37 667.923 L 1489.5 667.923 L 570.101 667.923 C 562.47 660.729 531.391 628.283 524.096 623.184 C 495.878 603.462 448.303 584.893 414.243 578.407 C 406.352 576.905 378.077 575.408 369.051 574.797 C 395.144 558.165 424.623 536.826 450.486 519.095 L 517.614 515.695 L 569.801 476.21 z"
      />
    </Svg>
  );
}

/**
 * The owner's ornamental card divider with its center plaque as a CONTENT SLOT: gold filigree
 * strip, the inner-mask silhouette laid over its center, children centered inside the mask's
 * bounding box. Used as the forged cards' 40/60 seam and as the app's section dividers.
 */
export function DividerPlaque({
  width,
  maskFill = '#FAF8F2',
  maskScale = 0.66,
  gradientStops,
  children,
}: {
  width: number;
  maskFill?: string;
  maskScale?: number;
  gradientStops?: { offset: string; color: string }[];
  children?: ReactNode;
}) {
  const h = width / DIV_AR;
  // 0.66 (calibrated against the divider art): the mask's full-height BODY spans the divider's
  // native center hollow exactly — smaller leaks the hollow's corner ornaments around the taper,
  // larger paints over the wing filigree.
  const maskW = width * MASK_W_FRAC * maskScale;
  const maskH = maskW / MASK_AR;
  return (
    <View style={{ width, height: h, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', left: 0, top: 0, width, height: h }} pointerEvents="none">
        <CardDividerSvg width="100%" height="100%" preserveAspectRatio="none" />
      </View>
      {/* The mask's plaque BODY sits ~7.6% right of its own bounding box (a thin tail sweeps
          left): shift the whole box LEFT so the body centers on the divider, then shift the
          content back RIGHT inside it so the label centers on the body. */}
      <View style={{ width: maskW, height: maskH, marginTop: -maskH * 0.01, alignItems: 'center', justifyContent: 'center', transform: [{ translateX: -maskW * 0.076 }] }}>
        {/* The bbox over-extends LEFT of the divider's hollow (#108): the mask SVG renders inside
            a RIGHT-anchored sub-box trimmed from the left, so only its left edge moves right while
            the right edge (and the text below) stay exactly where they are. Calibrated to 0.16.

            v0.37 (owner): and then two pixels back the other way. Zoomed in, the coloured body
            stopped a hair short of the gold and left a sliver of the divider's dark hollow showing
            down its left edge, so the chip was outlined in shadow rather than surrounded by gold.
            Absolute rather than proportional: it is a rendering seam between two SVGs, the same
            width whatever size the divider is drawn at. */}
        <View style={{ position: 'absolute', left: maskW * 0.16 - PLAQUE_BLEED, top: 0, width: maskW * 0.84 + PLAQUE_BLEED, height: maskH }} pointerEvents="none">
          <PlaqueMask width="100%" height="100%" gradientStops={gradientStops} fill={maskFill} />
        </View>
        <View style={{ transform: [{ translateX: maskW * 0.076 }] }}>{children}</View>
      </View>
    </View>
  );
}

