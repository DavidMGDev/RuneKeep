import { useEffect } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Rune } from '@/constants/theme';
import { box } from '@/lib/design';
import { useCarousel } from '../carousel-context';

/**
 * The subtle "still expanded" hint: a small gold dot at the bottom-center that fades in with the
 * expanded state and gently pulses — intuitive, not informative (no labels), per the brief.
 */
export function ExpandIndicator() {
  const { expandProgress } = useCarousel();
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [pulse]);

  const style = useAnimatedStyle(() => {
    const p = expandProgress.value;
    return {
      opacity: p * (0.4 + pulse.value * 0.45),
      transform: [{ scale: 1 + pulse.value * 0.5 }],
    };
  });

  return (
    <Animated.View
      style={[box(203, 701, 6, 6), { borderRadius: 3, backgroundColor: Rune.goldBright }, style]}
      pointerEvents="none"
    />
  );
}
