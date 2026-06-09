import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withSpring,
} from 'react-native-reanimated';

import { box } from '@/lib/design';
import { CARD_DECKS, type CardItem } from '../card-data';
import { useCarousel } from '../carousel-context';
import {
  ANGLE_STEP,
  CARD_H,
  CARD_W,
  cardScaleAt,
  clampRot,
  COMPACT_DROP,
  COMPACT_SCALE,
  COMPACT_STEP,
  maxRotation,
  OX,
  OY,
  PAN_R,
  R,
  snapRot,
} from '../carousel-geometry';
import { Card } from './card';

const EXPAND_SPRING = { damping: 16, stiffness: 130, mass: 0.8 };
const SNAP_SPRING = { damping: 18, stiffness: 140, mass: 0.7 };

interface SlotProps {
  index: number;
  item: CardItem;
  rotation: SharedValue<number>;
  expandProgress: SharedValue<number>;
}

function CardSlot({ index, item, rotation, expandProgress }: SlotProps) {
  const style = useAnimatedStyle(() => {
    const p = expandProgress.value;
    const stepNow = COMPACT_STEP + (ANGLE_STEP - COMPACT_STEP) * p;
    const theta = index * stepNow - rotation.value;

    const x = OX + R * Math.sin(theta);
    const y = OY - R * Math.cos(theta) + COMPACT_DROP * (1 - p);
    const scale = cardScaleAt(theta) * (COMPACT_SCALE + (1 - COMPACT_SCALE) * p);
    const tilt = theta * 0.7;

    // Fade cards far off the arc so virtualization's absence (PR5) isn't visible at the edges.
    const opacity = Math.max(0, 1 - Math.max(0, Math.abs(theta) - 3.2 * ANGLE_STEP) * 1.4);

    return {
      transform: [{ translateX: x }, { translateY: y }, { rotateZ: `${tilt}rad` }, { scale }],
      zIndex: Math.round(1000 - (Math.abs(theta) / ANGLE_STEP) * 10),
      opacity,
    };
  });

  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, style]} pointerEvents="none">
      <View style={{ position: 'absolute', left: -CARD_W / 2, top: -CARD_H / 2, width: CARD_W, height: CARD_H }}>
        <Card item={item} width={CARD_W} height={CARD_H} />
      </View>
    </Animated.View>
  );
}

/**
 * The card hand. Cards ride an arc coupled to the shared `rotation`; a horizontal drag on the bottom
 * band spins it (and the gear), snapping to a card on release. Tap toggles compact/expanded. Cards
 * are pointer-transparent so the band beneath them receives the scroll (per-card gestures arrive in PR6).
 */
export function CardCarousel() {
  const { rotation, expandProgress, category } = useCarousel();
  const deck = CARD_DECKS[category];
  const count = deck.length;
  const startRot = useSharedValue(0);

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-24, 24])
    .onBegin(() => {
      startRot.value = rotation.value;
      expandProgress.value = withSpring(1, EXPAND_SPRING);
    })
    .onUpdate((e) => {
      rotation.value = clampRot(startRot.value - e.translationX / PAN_R, count);
    })
    .onEnd((e) => {
      rotation.value = withDecay(
        {
          velocity: -e.velocityX / PAN_R,
          deceleration: 0.997,
          clamp: [0, maxRotation(count)],
          rubberBandEffect: true,
        },
        (finished) => {
          if (finished) rotation.value = withSpring(snapRot(rotation.value, count), SNAP_SPRING);
        },
      );
    });

  const tap = Gesture.Tap().onEnd(() => {
    expandProgress.value = withSpring(expandProgress.value > 0.5 ? 0 : 1, EXPAND_SPRING);
  });

  const gesture = Gesture.Exclusive(pan, tap);

  return (
    <>
      {/* Transparent scroll/tap surface at the bottom band (below the trait banners). */}
      <GestureDetector gesture={gesture}>
        <View style={box(0, 720, 412, 172)} />
      </GestureDetector>

      {deck.map((item, i) => (
        <CardSlot key={item.id} index={i} item={item} rotation={rotation} expandProgress={expandProgress} />
      ))}
    </>
  );
}
