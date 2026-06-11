import { useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import Svg, { Polyline } from 'react-native-svg';

import { box } from '@/lib/design';
import { useCarousel } from '../carousel-context';

/**
 * The focus dim — a dark veil that fades in BETWEEN the focused card and the rest of the hand (#8c).
 * It is a sibling of the card slots inside the carousel container: its zIndex (2000) sits above the
 * other cards but below the focused slot (which lifts to 3000 and grows in place), so focusing a card
 * is the SAME image getting bigger over a darkening sheet — no second object cross-fading in.
 * Tapping the veil or swiping the card down closes it (shake-to-close removed per owner, #41).
 */
export function FocusOverlay() {
  const { fullscreenProgress, closeFullscreen } = useCarousel();
  const [active, setActive] = useState(false);

  const wasActive = useSharedValue(false);
  useDerivedValue(() => {
    const a = fullscreenProgress.value > 0.02;
    if (a !== wasActive.value) {
      wasActive.value = a;
      runOnJS(setActive)(a);
    }
  });

  const dim = useAnimatedStyle(() => ({ opacity: fullscreenProgress.value * 0.82 }));
  const handleStyle = useAnimatedStyle(() => ({ opacity: fullscreenProgress.value }));
  const tap = Gesture.Tap().onEnd(() => runOnJS(closeFullscreen)());

  if (!active) return null;

  return (
    <>
      {/* Oversized past the (unclipped) stage so the dim reaches the physical screen edges — status
          bar and letterbox margins included (#30 B). Square corners; color matches ExpandVeil. */}
      <GestureDetector gesture={tap}>
        <Animated.View style={[box(-120, -160, 652, 1212), { backgroundColor: '#06080d', zIndex: 2000 }, dim]} />
      </GestureDetector>
      {/* gold "swipe down to close" handle, above the focused card */}
      <Animated.View style={[box(176, 104, 60, 26), { zIndex: 3500, alignItems: 'center' }, handleStyle]} pointerEvents="none">
        <View style={{ width: 46, height: 4, borderRadius: 2, backgroundColor: 'rgba(249,214,141,0.85)' }} />
        <Svg width={22} height={12} style={{ marginTop: 4 }}>
          <Polyline points="3,3 11,9 19,3" fill="none" stroke="rgba(249,214,141,0.85)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Animated.View>
    </>
  );
}
