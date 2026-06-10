import { useEffect } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Polyline } from 'react-native-svg';

import { box } from '@/lib/design';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useCarousel } from '../carousel-context';

/**
 * Discoverability hint (AC2.6): a gold "swipe up" chevron that gently bobs above the compact hand and
 * fades out as the hand fans open. Non-text, clearly perceptible (replaces the old sub-pixel dot).
 */
export function ExpandIndicator() {
  const { expandProgress } = useCarousel();
  const reducedMotion = useReducedMotion();
  const bob = useSharedValue(0);

  useEffect(() => {
    // Respect "reduce motion": show the chevron statically instead of looping it (X3).
    bob.value = reducedMotion ? 0.5 : withRepeat(withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [bob, reducedMotion]);

  const style = useAnimatedStyle(() => {
    const visible = 1 - expandProgress.value; // hide once expanded
    return {
      opacity: visible * (0.45 + bob.value * 0.4),
      transform: [{ translateY: -bob.value * 6 }],
    };
  });

  return (
    <Animated.View style={[box(186, 712, 40, 26), style]} pointerEvents="none">
      <Svg width={40} height={26}>
        <Polyline points="6,16 20,5 34,16" fill="none" stroke="#E0B563" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        <Polyline points="6,23 20,12 34,23" fill="none" stroke="#E0B563" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.55} />
      </Svg>
    </Animated.View>
  );
}
