import { Accelerometer } from 'expo-sensors';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Polyline } from 'react-native-svg';

import { box } from '@/lib/design';
import type { CardItem } from '../card-data';
import { useCarousel } from '../carousel-context';
import { CARD_H, CARD_W, FS_SPRING } from '../carousel-geometry';
import { Card } from './card';

const REST_Y = 631; // the expanded center card's resting Y
const CENTER_Y = 396; // flown to roughly screen-centre, leaving room for the close handle
const FS_SCALE = 1.35; // ~95% of the 412 design width
const SHAKE_G = 1.8; // total accel (g) that counts as a shake while a card is open

/** A small gold "swipe down to close" handle shown above the focused card (AC2.7). */
function CloseHandle() {
  return (
    <View style={[box(176, 86, 60, 26), { alignItems: 'center' }]} pointerEvents="none">
      <View style={{ width: 46, height: 4, borderRadius: 2, backgroundColor: 'rgba(249,214,141,0.85)' }} />
      <Svg width={22} height={12} style={{ marginTop: 4 }}>
        <Polyline points="3,3 11,9 19,3" fill="none" stroke="rgba(249,214,141,0.85)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

/**
 * The focused card flown full-screen, IN FRONT of everything (high zIndex). Driven by
 * `fullscreenProgress`. Swipe down, tap, or a device shake returns it to the hand. Mounted but
 * pointer-inert and image-free until opened (so it never re-decodes while scrolling).
 */
export function FullscreenCard({ item }: { item: CardItem }) {
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

  // Device-shake to close (AC2.5). Subscribe only while a card is open; guard for web/unsupported.
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

  const backdrop = useAnimatedStyle(() => ({ opacity: fullscreenProgress.value * 0.9 }));
  const cardStyle = useAnimatedStyle(() => {
    const p = fullscreenProgress.value;
    const y = REST_Y + (CENTER_Y - REST_Y) * p;
    const scale = 1 + (FS_SCALE - 1) * p;
    return { transform: [{ translateX: 206 }, { translateY: y }, { scale }], opacity: p };
  });
  const handleStyle = useAnimatedStyle(() => ({ opacity: fullscreenProgress.value }));

  const swipeDown = Gesture.Pan().onEnd((e) => {
    if (e.translationY > 60 || e.velocityY > 600) {
      runOnJS(closeFullscreen)();
    } else {
      fullscreenProgress.value = withSpring(1, FS_SPRING);
    }
  });
  const tapClose = Gesture.Tap().onEnd(() => runOnJS(closeFullscreen)());
  const gesture = Gesture.Exclusive(swipeDown, tapClose);

  // Only mount the (heavy) card image while the overlay is active.
  if (!active) return <View style={box(0, 0, 0, 0)} pointerEvents="none" />;

  return (
    <View style={[box(0, 0, 412, 892), { zIndex: 5000 }]} pointerEvents="auto">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#06080d' }, backdrop]} />
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill}>
          <Animated.View style={[StyleSheet.absoluteFill, handleStyle]} pointerEvents="none">
            <CloseHandle />
          </Animated.View>
          <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, cardStyle]}>
            <View style={{ position: 'absolute', left: -CARD_W / 2, top: -CARD_H / 2, width: CARD_W, height: CARD_H }}>
              <Card item={item} width={CARD_W} height={CARD_H} />
            </View>
          </Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
}
