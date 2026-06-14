import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Polygon, Rect } from 'react-native-svg';

import { Rune } from '@/constants/theme';
import type { CardCategory } from '../card-data';

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
