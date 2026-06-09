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

// Rest position of the centermost card in the carousel -> screen-center target.
const REST_Y = 690;
const CENTER_Y = 446;
const FS_SCALE = 2.5;

/**
 * The center card flown full-screen. Driven by `fullscreenProgress` (0 = in the carousel,
 * 1 = filling the screen). A swipe down or tap returns it. Mounted always but pointer-inert and
 * invisible until opened, so it never blocks the carousel beneath.
 */
export function FullscreenCard({ item }: { item: CardItem }) {
  const { fullscreenProgress } = useCarousel();
  const [active, setActive] = useState(false);

  // Toggle pointer-events on the JS side when the overlay becomes (in)active.
  const wasActive = useSharedValue(false);
  useDerivedValue(() => {
    const a = fullscreenProgress.value > 0.02;
    if (a !== wasActive.value) {
      wasActive.value = a;
      runOnJS(setActive)(a);
    }
  });

  const backdrop = useAnimatedStyle(() => ({ opacity: fullscreenProgress.value * 0.88 }));
  const cardStyle = useAnimatedStyle(() => {
    const p = fullscreenProgress.value;
    const y = REST_Y + (CENTER_Y - REST_Y) * p;
    const scale = 1 + (FS_SCALE - 1) * p;
    return { transform: [{ translateX: 206 }, { translateY: y }, { scale }], opacity: p };
  });

  const swipeDown = Gesture.Pan()
    .activeOffsetY([-16, 16])
    .onEnd((e) => {
      const close = e.translationY > 70 || e.velocityY > 800;
      fullscreenProgress.value = withSpring(close ? 0 : 1, FS_SPRING);
    });
  const tapClose = Gesture.Tap().onEnd(() => {
    fullscreenProgress.value = withSpring(0, FS_SPRING);
  });
  const gesture = Gesture.Exclusive(swipeDown, tapClose);

  return (
    <View style={box(0, 0, 412, 892)} pointerEvents={active ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#05070a' }, backdrop]} />
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
