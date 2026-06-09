import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  runOnJS,
  runOnUI,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDecay,
  withSpring,
  withTiming,
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
  EXPAND_SPRING,
  FS_SPRING,
  maxRotation,
  OX,
  OY,
  PAN_R,
  R,
  SNAP_SPRING,
  WINDOW_HALF,
} from '../carousel-geometry';
import { Card } from './card';
import { ExpandIndicator } from './expand-indicator';
import { FullscreenCard } from './fullscreen-card';

// Upward travel (px) within a scroll to fly the center card to full-screen — deliberate, not half-screen.
const FS_TRIGGER = 78;

interface SlotProps {
  index: number;
  item: CardItem;
  rotation: SharedValue<number>;
  expandProgress: SharedValue<number>;
  fullscreenProgress: SharedValue<number>;
}

const CardSlot = memo(function CardSlot({ index, item, rotation, expandProgress, fullscreenProgress }: SlotProps) {
  const style = useAnimatedStyle(() => {
    const p = expandProgress.value;
    const stepNow = COMPACT_STEP + (ANGLE_STEP - COMPACT_STEP) * p;
    const centerPos = rotation.value / ANGLE_STEP;
    const theta = (index - centerPos) * stepNow;

    const x = OX + R * Math.sin(theta);
    const y = OY - R * Math.cos(theta) + COMPACT_DROP * (1 - p);
    const scale = cardScaleAt(theta) * (COMPACT_SCALE + (1 - COMPACT_SCALE) * p);
    const tilt = theta * 0.5;

    const edge = (2.6 + 1.3 * p) * stepNow;
    let opacity = Math.min(1, Math.max(0, (1.2 * edge - Math.abs(theta)) / (0.5 * edge)));
    // Hide the centermost card while it is flown full-screen (the overlay shows it).
    if (Math.round(centerPos) === index) opacity *= 1 - fullscreenProgress.value;

    return {
      transform: [{ translateX: x }, { translateY: y }, { rotateZ: `${tilt}rad` }, { scale }],
      zIndex: Math.round(1000 - (Math.abs(theta) / stepNow) * 10),
      opacity,
    };
  });

  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, style]} pointerEvents="none" renderToHardwareTextureAndroid shouldRasterizeIOS>
      <View style={{ position: 'absolute', left: -CARD_W / 2, top: -CARD_H / 2, width: CARD_W, height: CARD_H }}>
        <Card item={item} width={CARD_W} height={CARD_H} />
      </View>
    </Animated.View>
  );
});

/**
 * The card hand. ONE pan drives the whole feel (see issue #15):
 * - horizontal drag scrolls (rotation 1:1) and expands the hand in sync from the first frame;
 * - while expanded, lifting the finger upward (without releasing) flies the center card to full-screen
 *   IN FRONT and snaps the rest into place;
 * - releasing without a tap-lock starts a 1s collapse-to-compact window.
 * A separate tap toggles a lock (stays expanded). The fullscreen overlay owns swipe-down-to-return.
 */
export function CardCarousel() {
  const { rotation, expandProgress, fullscreenProgress, machineState, locked, timerGen, category } =
    useCarousel();
  const deck = CARD_DECKS[category];
  const count = deck.length;
  const middle = Math.round((count - 1) / 2);

  const startRot = useSharedValue(0);
  const anchorY = useSharedValue(0); // translationY at the last horizontal-dominant frame
  const prevX = useSharedValue(0);
  const prevY = useSharedValue(0);
  const mode = useSharedValue<'scroll' | 'fs'>('scroll');
  const lastCenter = useSharedValue(-999);

  const [centerIndex, setCenterIndex] = useState(middle);
  const [expandedUI, setExpandedUI] = useState(false);
  const [win, setWin] = useState({ start: Math.max(0, middle - WINDOW_HALF), end: Math.min(count - 1, middle + WINDOW_HALF) });

  const onCenter = useCallback(
    (c: number) => {
      setCenterIndex(c);
      setWin({ start: Math.max(0, c - WINDOW_HALF), end: Math.min(count - 1, c + WINDOW_HALF) });
    },
    [count],
  );
  useDerivedValue(() => {
    const c = Math.min(count - 1, Math.max(0, Math.round(rotation.value / ANGLE_STEP)));
    if (c !== lastCenter.value) {
      lastCenter.value = c;
      runOnJS(onCenter)(c);
    }
  });

  // Grow the scroll hitbox when expanded so the cards (which rise) stay grabbable.
  const wasExpanded = useSharedValue(false);
  useDerivedValue(() => {
    const e = expandProgress.value > 0.4;
    if (e !== wasExpanded.value) {
      wasExpanded.value = e;
      runOnJS(setExpandedUI)(e);
    }
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armCollapse = useCallback(
    (gen: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        runOnUI(() => {
          'worklet';
          if (timerGen.value === gen && machineState.value === 'window' && fullscreenProgress.value < 0.5) {
            machineState.value = 'compact';
            expandProgress.value = withSpring(0, EXPAND_SPRING);
          }
        })();
      }, 1000);
    },
    [timerGen, machineState, expandProgress, fullscreenProgress],
  );

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .minDistance(2)
      .onBegin(() => {
        cancelAnimation(rotation);
        startRot.value = rotation.value;
        anchorY.value = 0;
        prevX.value = 0;
        prevY.value = 0;
        mode.value = 'scroll';
        timerGen.value += 1;
        if (!locked.value) {
          machineState.value = 'held';
          expandProgress.value = withTiming(1, { duration: 170 }); // expand fast so it follows the swipe
        }
      })
      .onUpdate((e) => {
        if (mode.value === 'fs') return;
        const dx = e.translationX - prevX.value;
        const dy = e.translationY - prevY.value;
        prevX.value = e.translationX;
        prevY.value = e.translationY;
        if (Math.abs(dx) >= Math.abs(dy)) {
          // horizontal-dominant: scroll 1:1 and reset the upward reference
          anchorY.value = e.translationY;
          rotation.value = clampRot(startRot.value - e.translationX / PAN_R, count);
        } else {
          // vertical-dominant: a deliberate lift, while expanded, flies the center card full-screen
          const upSince = anchorY.value - e.translationY;
          if (expandProgress.value > 0.5 && fullscreenProgress.value < 0.5 && upSince > FS_TRIGGER) {
            mode.value = 'fs';
            rotation.value = withSpring(Math.min(maxRotation(count), Math.max(0, Math.round(rotation.value / ANGLE_STEP) * ANGLE_STEP)), SNAP_SPRING);
            fullscreenProgress.value = withSpring(1, FS_SPRING);
          }
        }
      })
      .onEnd((e) => {
        if (mode.value === 'fs') return;
        rotation.value = withDecay(
          { velocity: -e.velocityX / PAN_R, deceleration: 0.997, clamp: [0, maxRotation(count)], rubberBandEffect: true },
          (finished) => {
            if (finished) rotation.value = withSpring(Math.min(maxRotation(count), Math.max(0, Math.round(rotation.value / ANGLE_STEP) * ANGLE_STEP)), SNAP_SPRING);
          },
        );
        if (!locked.value) {
          machineState.value = 'window';
          runOnJS(armCollapse)(timerGen.value);
        }
      });

    const tap = Gesture.Tap()
      .maxDuration(260)
      .onEnd(() => {
        timerGen.value += 1;
        if (fullscreenProgress.value > 0.5) {
          fullscreenProgress.value = withSpring(0, FS_SPRING);
          return;
        }
        if (machineState.value === 'locked') {
          machineState.value = 'compact';
          locked.value = false;
          expandProgress.value = withSpring(0, EXPAND_SPRING);
        } else {
          machineState.value = 'locked';
          locked.value = true;
          expandProgress.value = withSpring(1, EXPAND_SPRING);
        }
      });

    return Gesture.Exclusive(tap, pan);
  }, [count, armCollapse, rotation, expandProgress, fullscreenProgress, machineState, locked, timerGen, startRot, anchorY, prevX, prevY, mode]);

  const slots = [];
  for (let i = win.start; i <= win.end; i++) {
    slots.push(
      <CardSlot key={deck[i].id} index={i} item={deck[i]} rotation={rotation} expandProgress={expandProgress} fullscreenProgress={fullscreenProgress} />,
    );
  }

  return (
    <>
      {/* Scroll/tap surface — grows to cover the cards when they expand and rise. */}
      <GestureDetector gesture={gesture}>
        <View style={box(0, expandedUI ? 470 : 736, 412, expandedUI ? 422 : 156)} />
      </GestureDetector>

      {slots}
      <ExpandIndicator />
      <FullscreenCard item={deck[centerIndex]} />
    </>
  );
}
