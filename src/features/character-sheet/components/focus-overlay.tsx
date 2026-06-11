import { Accelerometer } from 'expo-sensors';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import Svg, { Polyline } from 'react-native-svg';

import { box } from '@/lib/design';
import { useCarousel } from '../carousel-context';

const SHAKE_G = 1.8; // total accel (g) that counts as a shake while a card is focused

/**
 * The focus dim — a dark veil that fades in BETWEEN the focused card and the rest of the hand (#8c).
 * It is a sibling of the card slots inside the carousel container: its zIndex (2000) sits above the
 * other cards but below the focused slot (which lifts to 3000 and grows in place), so focusing a card
 * is the SAME image getting bigger over a darkening sheet — no second object cross-fading in.
 * Tapping the veil, swiping the card down, or shaking the device closes it.
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

  // Device-shake to close. Subscribe only while focused; guard for web/unsupported.
  useEffect(() => {
    if (!active) return;
    let sub: { remove: () => void } | undefined;
    let cancelled = false;
    Accelerometer.isAvailableAsync()
      .then((ok) => {
        if (!ok || cancelled) return;
        Accelerometer.setUpdateInterval(120);
        sub = Accelerometer.addListener(({ x, y, z }) => {
          if (Math.sqrt(x * x + y * y + z * z) > SHAKE_G) closeFullscreen();
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [active, closeFullscreen]);

  const dim = useAnimatedStyle(() => ({ opacity: fullscreenProgress.value * 0.82 }));
  const handleStyle = useAnimatedStyle(() => ({ opacity: fullscreenProgress.value }));
  const tap = Gesture.Tap().onEnd(() => runOnJS(closeFullscreen)());

  if (!active) return null;

  return (
    <>
      <GestureDetector gesture={tap}>
        <Animated.View style={[box(0, 0, 412, 892), { backgroundColor: '#06080d', zIndex: 2000 }, dim]} />
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
