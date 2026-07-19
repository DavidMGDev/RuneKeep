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

export interface PlaqueTheme {
  gradientStops?: { offset: string; color: string }[];
  solidColor?: string;
  textColor: string;
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

  if (normalizedKind === 'experience') {
    return {
      gradientStops: [
        { offset: '0%', color: '#5C2E0B' }, // rich mahogany
        { offset: '100%', color: '#8B4F1D' }, // warm bronze
      ],
      textColor: '#FAF8F2', // Warm Ivory
    };
  }

  if (normalizedKind === 'item') {
    return {
      gradientStops: [
        { offset: '0%', color: '#2C3539' }, // dark charcoal
        { offset: '100%', color: '#1B1E23' }, // deep slate
      ],
      textColor: '#CBD5E1', // Soft Silver-Blue
    };
  }

  if (normalizedKind === 'weapon' || normalizedKind === 'secondary') {
    return {
      gradientStops: [
        { offset: '0%', color: '#1E1F22' }, // dark iron
        { offset: '100%', color: '#5A1818' }, // blood red
      ],
      textColor: '#E2E8F0', // Steel White
    };
  }

  if (normalizedKind === 'armor') {
    return {
      gradientStops: [
        { offset: '0%', color: '#3E352E' }, // plate iron
        { offset: '100%', color: '#221C18' }, // burnished gold-brown
      ],
      textColor: '#F59E0B', // Bright Gold
    };
  }

  // v0.14.0: loot + consumables are their own families, distinct from weapons/armor/items. Loot reads
  // as buried treasure (deep earth → old gold); consumables as alchemy (nightshade → apothecary green).
  if (normalizedKind === 'loot') {
    return {
      gradientStops: [
        { offset: '0%', color: '#2B2113' }, // dug earth
        { offset: '100%', color: '#6B4A12' }, // old gold
      ],
      textColor: '#FCD34D', // Lamplight Gold
    };
  }

  if (normalizedKind === 'consumable') {
    return {
      gradientStops: [
        { offset: '0%', color: '#241B33' }, // nightshade
        { offset: '100%', color: '#1B3A2E' }, // apothecary green
      ],
      textColor: '#6EE7B7', // Elixir Green
    };
  }

  if (normalizedKind === 'currency') {
    return {
      gradientStops: [
        { offset: '0%', color: '#B45309' }, // golden honey
        { offset: '100%', color: '#FBBF24' }, // sparkling amber
      ],
      textColor: '#0B0E13', // Deep Ink Navy
    };
  }

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
            the right edge (and the text below) stay exactly where they are. Calibrated to 0.16. */}
        <View style={{ position: 'absolute', left: maskW * 0.16, top: 0, width: maskW * 0.84, height: maskH }} pointerEvents="none">
          <PlaqueMask width="100%" height="100%" gradientStops={gradientStops} fill={maskFill} />
        </View>
        <View style={{ transform: [{ translateX: maskW * 0.076 }] }}>{children}</View>
      </View>
    </View>
  );
}

