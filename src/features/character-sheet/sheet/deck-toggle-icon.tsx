import { memo, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Polygon, Rect } from 'react-native-svg';

import { Rune } from '@/constants/theme';
import { type CardCategory, isBuiltinCategory } from '../card-data';
import { useCarousel } from '../carousel-context';
import { CategoryIconSvg } from './category-icons';

/**
 * The deck-mode toggle below the portrait (#136): two distinct gold icons — a fanned hand of cards
 * for ARSENAL (abilities), a banded treasure chest for INVENTORY — that cross-fade and spin into
 * each other on switch. Bigger + more detailed than the first pass; fills the old icon's box.
 */
const GOLD = Rune.goldBright;
const FILL = '#15191F';

export function ArsenalIcon() {
  return (
    <Svg width={46} height={46} viewBox="0 0 48 48">
      {/* two fanned back cards */}
      <Rect x={16} y={13} width={17} height={25} rx={2.5} fill={FILL} stroke={GOLD} strokeWidth={2} strokeLinejoin="round" transform="rotate(-20 24 36)" />
      <Rect x={16} y={13} width={17} height={25} rx={2.5} fill={FILL} stroke={GOLD} strokeWidth={2} strokeLinejoin="round" transform="rotate(20 24 36)" />
      {/* front card + a diamond pip and a corner mark */}
      <Rect x={14.5} y={9} width={19} height={28} rx={2.5} fill={FILL} stroke={GOLD} strokeWidth={2.4} strokeLinejoin="round" />
      <Polygon points="24,15 28.5,23 24,31 19.5,23" fill={GOLD} />
      <Polygon points="18,12.5 20,16 16,16" fill={GOLD} />
    </Svg>
  );
}

export function InventoryIcon() {
  return (
    <Svg width={44} height={44} viewBox="0 0 48 48">
      {/* lid */}
      <Path d="M 8 21 Q 8 10 24 10 Q 40 10 40 21 L 40 23 L 8 23 Z" fill={FILL} stroke={GOLD} strokeWidth={2.4} strokeLinejoin="round" />
      {/* body */}
      <Rect x={8} y={23} width={32} height={17} fill={FILL} stroke={GOLD} strokeWidth={2.4} strokeLinejoin="round" />
      {/* two iron bands */}
      <Line x1={16} y1={10.5} x2={16} y2={40} stroke={GOLD} strokeWidth={2} />
      <Line x1={32} y1={10.5} x2={32} y2={40} stroke={GOLD} strokeWidth={2} />
      {/* lid rail + lock plate */}
      <Line x1={8} y1={23} x2={40} y2={23} stroke={GOLD} strokeWidth={2.2} />
      <Rect x={20.5} y={25} width={7} height={9} rx={1} fill={GOLD} />
      <Circle cx={24} cy={28.5} r={1.4} fill={FILL} />
    </Svg>
  );
}

/** Notes (#214): a dog-eared page with rule lines. */
export function NotesIcon() {
  return (
    <Svg width={42} height={42} viewBox="0 0 48 48">
      <Path d="M 12 7 H 30 L 37 14 V 41 H 12 Z" fill={FILL} stroke={GOLD} strokeWidth={2.4} strokeLinejoin="round" />
      <Path d="M 30 7 V 14 H 37" fill="none" stroke={GOLD} strokeWidth={2.2} strokeLinejoin="round" />
      <Line x1={17} y1={21} x2={32} y2={21} stroke={GOLD} strokeWidth={2} strokeLinecap="round" />
      <Line x1={17} y1={27} x2={32} y2={27} stroke={GOLD} strokeWidth={2} strokeLinecap="round" />
      <Line x1={17} y1={33} x2={27} y2={33} stroke={GOLD} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** Wild Shape (#214, Druid): a beast paw print. */
export function WildshapeIcon() {
  return (
    <Svg width={42} height={42} viewBox="0 0 48 48">
      {/* main pad */}
      <Path d="M 24 40 C 16 40 14 33 17 29 C 19 26 29 26 31 29 C 34 33 32 40 24 40 Z" fill={GOLD} />
      {/* toe beans */}
      <Circle cx={14.5} cy={24} r={3.6} fill={GOLD} />
      <Circle cx={20} cy={18.5} r={3.8} fill={GOLD} />
      <Circle cx={28} cy={18.5} r={3.8} fill={GOLD} />
      <Circle cx={33.5} cy={24} r={3.6} fill={GOLD} />
    </Svg>
  );
}

/** Companion (#311, Beastbound Ranger): a canine companion's head — distinct from the Beastform paw.
 *  Memoized (#328): zero props, so it renders once and never re-walks on parent re-renders. */
export const CompanionIcon = memo(function CompanionIcon() {
  return (
    <Svg width={42} height={42} viewBox="0 0 48 48">
      {/* ears */}
      <Path d="M 12 9 L 19 19 L 11 21 Z" fill={FILL} stroke={GOLD} strokeWidth={2.2} strokeLinejoin="round" />
      <Path d="M 36 9 L 29 19 L 37 21 Z" fill={FILL} stroke={GOLD} strokeWidth={2.2} strokeLinejoin="round" />
      {/* head */}
      <Path d="M 12 19 Q 12 15 24 15 Q 36 15 36 19 L 33 33 Q 30 41 24 41 Q 18 41 15 33 Z" fill={FILL} stroke={GOLD} strokeWidth={2.4} strokeLinejoin="round" />
      {/* eyes + snout */}
      <Circle cx={19} cy={26} r={1.9} fill={GOLD} />
      <Circle cx={29} cy={26} r={1.9} fill={GOLD} />
      <Path d="M 24 30 L 24 34" stroke={GOLD} strokeWidth={2} strokeLinecap="round" />
      <Path d="M 21 34 Q 24 37 27 34" fill="none" stroke={GOLD} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
});

/** Archive (#306): a banker's archive box — flat lid + a front handle slot, distinct from the domed,
 *  banded Inventory chest. The stash you move cards into. */
export function ArchiveIcon() {
  return (
    <Svg width={44} height={44} viewBox="0 0 48 48">
      {/* lid */}
      <Rect x={8} y={11} width={32} height={9} rx={2} fill={FILL} stroke={GOLD} strokeWidth={2.4} strokeLinejoin="round" />
      {/* body */}
      <Path d="M 11 20 H 37 V 36.5 Q 37 39 34.5 39 H 13.5 Q 11 39 11 36.5 Z" fill={FILL} stroke={GOLD} strokeWidth={2.4} strokeLinejoin="round" />
      {/* handle slot */}
      <Rect x={18.5} y={26} width={11} height={3.6} rx={1.8} fill={GOLD} />
    </Svg>
  );
}

/** The right glyph for any category (#214/#246) — built-in glyph, or a custom category's chosen icon
 *  (resolved from the carousel's category meta). Used by the trigger + the over-scroll indicator. */
export function CategoryGlyph({ category }: { category: CardCategory }) {
  const { categoryMeta } = useCarousel();
  const m = categoryMeta[category];
  if (category === 'favorites') return <CategoryIconSvg iconKey="star" size={42} />; // v0.9.8: special built-in, star glyph
  if (m && !m.builtin) return <CategoryIconSvg iconKey={m.icon} size={42} />;
  if (!isBuiltinCategory(category)) return <CategoryIconSvg iconKey={m?.icon} size={42} />;
  switch (category) {
    case 'inventory':
      return <InventoryIcon />;
    case 'notes':
      return <NotesIcon />;
    case 'wildshape':
      return <WildshapeIcon />;
    case 'companion':
      return <CompanionIcon />;
    case 'archive':
      return <ArchiveIcon />;
    default:
      return <ArsenalIcon />;
  }
}

export function DeckToggleIcon({ category }: { category: CardCategory }) {
  // Cross-fade the OUTGOING glyph to the INCOMING one on any category change (#214: the ring may hold
  // up to four categories now, so the old two-face flip generalizes to a fade between glyphs).
  const [shown, setShown] = useState(category);
  const [prev, setPrev] = useState<CardCategory | null>(null);
  const t = useSharedValue(1);
  useEffect(() => {
    if (category === shown) return;
    setPrev(shown);
    setShown(category);
    t.value = 0;
    t.value = withTiming(1, { duration: 280, easing: Easing.inOut(Easing.cubic) });
  }, [category, shown, t]);
  const incoming = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ scale: 0.8 + 0.2 * t.value }] }));
  const outgoing = useAnimatedStyle(() => ({ opacity: 1 - t.value, transform: [{ scale: 0.8 + 0.2 * (1 - t.value) }] }));
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
      {prev ? (
        <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, outgoing]}>
          <CategoryGlyph category={prev} />
        </Animated.View>
      ) : null}
      <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, incoming]}>
        <CategoryGlyph category={shown} />
      </Animated.View>
    </View>
  );
}
