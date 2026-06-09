import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { box } from '@/lib/design';
import type { CardItem } from '../card-data';
import { useCarousel } from '../carousel-context';
import { CARD_H, CARD_W, FS_SPRING } from '../carousel-geometry';
import { Card } from './card';

const REST_Y = 765; // the expanded center card's resting Y
const CENTER_Y = 410; // flown to roughly screen-centre
const FS_SCALE = 1.35; // ~95% of the 412 design width

/**
 * The center card flown full-screen, IN FRONT of everything (high zIndex). Driven by
 * `fullscreenProgress`. Swipe down (or tap) returns it to the deck. Mounted always but pointer-inert
 * and invisible until opened.
 */
export function FullscreenCard({ item }: { item: CardItem }) {
  const { fullscreenProgress } = useCarousel();
  const [active, setActive] = useState(false);

  const wasActive = useSharedValue(false);
  useDerivedValue(() => {
    const a = fullscreenProgress.value > 0.02;
    if (a !== wasActive.value) {
      wasActive.value = a;
      runOnJS(setActive)(a);
    }
  });

  const backdrop = useAnimatedStyle(() => ({ opacity: fullscreenProgress.value * 0.9 }));
  const cardStyle = useAnimatedStyle(() => {
    const p = fullscreenProgress.value;
    const y = REST_Y + (CENTER_Y - REST_Y) * p;
    const scale = 1 + (FS_SCALE - 1) * p;
    return { transform: [{ translateX: 206 }, { translateY: y }, { scale }], opacity: p };
  });

  const swipeDown = Gesture.Pan().onEnd((e) => {
    const close = e.translationY > 70 || e.velocityY > 700;
    fullscreenProgress.value = withSpring(close ? 0 : 1, FS_SPRING);
  });
  const tapClose = Gesture.Tap().onEnd(() => {
    fullscreenProgress.value = withSpring(0, FS_SPRING);
  });
  const gesture = Gesture.Exclusive(swipeDown, tapClose);

  // Only mount the (heavy) card image while the overlay is active — otherwise the centermost card
  // would re-decode on every scrolled detent even though it's invisible.
  if (!active) return <View style={box(0, 0, 0, 0)} pointerEvents="none" />;

  return (
    <View style={[box(0, 0, 412, 892), { zIndex: 5000 }]} pointerEvents="auto">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#06080d' }, backdrop]} />
      <GestureDetector gesture={gesture}>
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, cardStyle]}>
          <View style={{ position: 'absolute', left: -CARD_W / 2, top: -CARD_H / 2, width: CARD_W, height: CARD_H }}>
            <Card item={item} width={CARD_W} height={CARD_H} />
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
