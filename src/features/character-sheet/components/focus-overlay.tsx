import { useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue } from 'react-native-reanimated';

import { box } from '@/lib/design';
import { useScreenDim } from '@/lib/screen-dim';
import { useCarousel } from '../carousel-context';

// #293: tap-to-dismiss only in the BOTTOM 40% of the 892-design-tall screen. The top 60% (where the
// card, drawer and edit/delete buttons live) absorbs taps so a near-miss never closes the card.
const SCREEN_H = 892;
const SPLIT_Y = SCREEN_H * 0.6; // 535

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

  // v0.24.1: declare it so the tablet margins darken with the screen (lib/screen-dim).
  useScreenDim(active ? 0.82 : 0);
  if (!active) return null;

  return (
    // Oversized past the (unclipped) stage so the dim reaches the physical screen edges — status bar and
    // letterbox margins included (#30 B). The dim is visual-only (pointerEvents none); two catchers
    // split the tap behaviour: the top 60% SWALLOWS taps (#293, no close), the bottom 40% closes. Swipe
    // -down (card-carousel) still closes from anywhere.
    <>
      <Animated.View pointerEvents="none" style={[box(-120, -160, 652, 1212), { backgroundColor: '#06080d', zIndex: 2000 }, dim]} />
      <View pointerEvents="auto" style={[box(-120, -160, 652, 160 + SPLIT_Y), { zIndex: 2001 }]} />
      <GestureDetector gesture={tap}>
        <Animated.View style={[box(-120, SPLIT_Y, 652, 1052 - SPLIT_Y), { zIndex: 2001 }]} />
      </GestureDetector>
    </>
  );
}
