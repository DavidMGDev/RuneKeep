import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Line, Path, Rect } from 'react-native-svg';

import { Rune } from '@/constants/theme';
import type { CardCategory } from '../card-data';

/**
 * The deck-mode toggle below the portrait (#136): two distinct gold icons — a fanned hand of cards
 * for ARSENAL (abilities), a chest for INVENTORY — that cross-fade and spin into each other when the
 * category switches, so the current mode reads at a glance. Sized to sit inside the old icon's box.
 */
const GOLD = Rune.goldBright;

function ArsenalIcon() {
  const s = { fill: 'none' as const, stroke: GOLD, strokeWidth: 2.2, strokeLinejoin: 'round' as const };
  return (
    <Svg width={34} height={34} viewBox="0 0 40 40">
      <Rect x={15} y={11} width={11} height={18} rx={1.5} {...s} transform="rotate(-16 20 27)" />
      <Rect x={15} y={11} width={11} height={18} rx={1.5} {...s} transform="rotate(16 20 27)" />
      <Rect x={14.5} y={9} width={11} height={18} rx={1.5} fill={Rune.ink} stroke={GOLD} strokeWidth={2.2} strokeLinejoin="round" />
    </Svg>
  );
}

function InventoryIcon() {
  const s = { fill: 'none' as const, stroke: GOLD, strokeWidth: 2.2, strokeLinejoin: 'round' as const };
  return (
    <Svg width={32} height={32} viewBox="0 0 40 40">
      <Path d="M 8 18 Q 8 10 20 10 Q 32 10 32 18 L 32 32 L 8 32 Z" {...s} />
      <Line x1={8} y1={22} x2={32} y2={22} {...s} />
      <Rect x={17.5} y={20} width={5} height={6} fill={GOLD} />
    </Svg>
  );
}

export function DeckToggleIcon({ category }: { category: CardCategory }) {
  const t = useSharedValue(category === 'inventory' ? 1 : 0);
  useEffect(() => {
    t.value = withTiming(category === 'inventory' ? 1 : 0, { duration: 280, easing: Easing.inOut(Easing.cubic) });
  }, [category, t]);
  const arsenal = useAnimatedStyle(() => ({
    opacity: 1 - t.value,
    transform: [{ perspective: 400 }, { rotateY: `${t.value * 90}deg` }, { scale: 0.78 + (1 - t.value) * 0.22 }],
  }));
  const inventory = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ perspective: 400 }, { rotateY: `${(1 - t.value) * -90}deg` }, { scale: 0.78 + t.value * 0.22 }],
  }));
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, arsenal]}>
        <ArsenalIcon />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, inventory]}>
        <InventoryIcon />
      </Animated.View>
    </View>
  );
}
