import { useState } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue } from 'react-native-reanimated';

import { box } from '@/lib/design';
import { useCarousel } from '../carousel-context';

/**
 * The focus dim — a dark veil that fades in BETWEEN the focused card and the rest of the hand (#8c).
 * It is a sibling of the card slots inside the carousel container: its zIndex (2000) sits above the
 * other cards but below the focused slot (which lifts to 3000 and grows in place), so focusing a card
 * is the SAME image getting bigger over a darkening sheet — no second object cross-fading in.
 * Tapping the veil or swiping the card down closes it. The gold "swipe down" handle chip is gone
 * (#95 A) — the card itself is the whole fullscreen UI now.
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
  const tap = Gesture.Tap().onEnd(() => runOnJS(closeFullscreen)());

  if (!active) return null;

  return (
    // Oversized past the (unclipped) stage so the dim reaches the physical screen edges — status
    // bar and letterbox margins included (#30 B). Square corners; color matches ExpandVeil.
    <GestureDetector gesture={tap}>
      <Animated.View style={[box(-120, -160, 652, 1212), { backgroundColor: '#06080d', zIndex: 2000 }, dim]} />
    </GestureDetector>
  );
}
