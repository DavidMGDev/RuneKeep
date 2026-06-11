import { memo, useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDecay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { box } from '@/lib/design';
import { focusHaptic } from '@/lib/haptics';
import { CARD_DECKS, type CardItem } from '../card-data';
import { type ExpandState, useCarousel } from '../carousel-context';
import {
  ANGLE_STEP,
  CARD_H,
  CARD_W,
  cardScaleAt,
  clampRot,
  COLLAPSE_TRIGGER,
  COMPACT_DROP,
  COMPACT_SCALE,
  COMPACT_STEP,
  EXPAND_SPRING,
  EXPAND_TRIGGER,
  FS_SPRING,
  FS_UP_TRIGGER,
  FS_UP_VELOCITY,
  maxRotation,
  OX,
  OY,
  PAN_R,
  R,
  snapRot,
  SNAP_SPRING,
  WINDOW_HALF,
} from '../carousel-geometry';
import { Card } from './card';
import { FullscreenCard } from './fullscreen-card';

interface SlotProps {
  index: number;
  item: CardItem;
  count: number;
  rotation: SharedValue<number>;
  expandProgress: SharedValue<number>;
  fullscreenProgress: SharedValue<number>;
  machineState: SharedValue<ExpandState>;
  focusIndex: SharedValue<number>;
}

const CardSlot = memo(function CardSlot({ index, item, count, rotation, expandProgress, fullscreenProgress, machineState, focusIndex }: SlotProps) {
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

  // Tap a card: when compact, expand the hand; when expanded, fly THIS card full-screen.
  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(260)
        .onEnd(() => {
          if (machineState.value === 'fullscreen') return;
          if (machineState.value === 'compact') {
            machineState.value = 'expanded';
            expandProgress.value = withSpring(1, EXPAND_SPRING);
          } else {
            rotation.value = withSpring(snapRot(index * ANGLE_STEP, count), SNAP_SPRING);
            focusIndex.value = index;
            machineState.value = 'fullscreen';
            fullscreenProgress.value = withSpring(1, FS_SPRING);
            runOnJS(focusHaptic)();
          }
        }),
    [index, count, machineState, expandProgress, fullscreenProgress, rotation, focusIndex],
  );

  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, style]} renderToHardwareTextureAndroid shouldRasterizeIOS>
      <GestureDetector gesture={tap}>
        <View style={{ position: 'absolute', left: -CARD_W / 2, top: -CARD_H / 2, width: CARD_W, height: CARD_H }}>
          <Card item={item} width={CARD_W} height={CARD_H} />
        </View>
      </GestureDetector>
    </Animated.View>
  );
});

/**
 * The card hand — three states only (compact → expanded → fullscreen), no timers, no lock (see
 * docs/ui-fix-brief §2):
 * - horizontal drag scrolls the hand 1:1 in any state;
 * - from compact, an upward drag (or a tap on a card) fans the hand open;
 * - from expanded, a light upward flick flies the center card full-screen, a downward drag bundles it
 *   back, and tapping a specific card flies THAT card full-screen.
 * The fullscreen overlay owns swipe-down / shake to return. A full-sheet pan container coordinates
 * with each card's own tap via nested gesture detectors (the scroll-view-with-buttons pattern).
 */
export function CardCarousel() {
  const { rotation, expandProgress, fullscreenProgress, machineState, focusIndex, category } = useCarousel();
  const deck = CARD_DECKS[category];
  const count = deck.length;
  const middle = Math.round((count - 1) / 2);

  const startRot = useSharedValue(0);
  const anchorY = useSharedValue(0); // translationY at the last horizontal-dominant frame
  const prevX = useSharedValue(0);
  const prevY = useSharedValue(0);
  const scrolled = useSharedValue(false);
  const transitioned = useSharedValue(false); // at most one state change per gesture
  const lastCenter = useSharedValue(-999);

  const [focusedIndex, setFocusedIndex] = useState(middle);
  const [win, setWin] = useState({ start: Math.max(0, middle - WINDOW_HALF), end: Math.min(count - 1, middle + WINDOW_HALF) });

  const onCenter = useCallback(
    (c: number) => {
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

  // Mirror the focused card index to JS so the fullscreen overlay renders the right card.
  const lastFocus = useSharedValue(-999);
  useDerivedValue(() => {
    const f = Math.min(count - 1, Math.max(0, Math.round(focusIndex.value)));
    if (f !== lastFocus.value) {
      lastFocus.value = f;
      runOnJS(setFocusedIndex)(f);
    }
  });

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(2)
        .onBegin(() => {
          cancelAnimation(rotation);
          startRot.value = rotation.value;
          anchorY.value = 0;
          prevX.value = 0;
          prevY.value = 0;
          scrolled.value = false;
          transitioned.value = false;
        })
        .onUpdate((e) => {
          if (machineState.value === 'fullscreen') return;
          const dx = e.translationX - prevX.value;
          const dy = e.translationY - prevY.value;
          prevX.value = e.translationX;
          prevY.value = e.translationY;
          if (Math.abs(dx) >= Math.abs(dy)) {
            // horizontal-dominant: scroll 1:1, reset the upward reference
            anchorY.value = e.translationY;
            scrolled.value = true;
            rotation.value = clampRot(startRot.value - e.translationX / PAN_R, count);
            return;
          }
          if (transitioned.value) return; // one transition per gesture
          const up = anchorY.value - e.translationY; // +ve when moving up
          if (machineState.value === 'compact') {
            if (up > EXPAND_TRIGGER) {
              machineState.value = 'expanded';
              expandProgress.value = withTiming(1, { duration: 200 });
              transitioned.value = true;
            }
          } else if (up > FS_UP_TRIGGER || e.velocityY < -FS_UP_VELOCITY) {
            const centerIdx = Math.min(count - 1, Math.max(0, Math.round(rotation.value / ANGLE_STEP)));
            focusIndex.value = centerIdx;
            machineState.value = 'fullscreen';
            rotation.value = withSpring(snapRot(centerIdx * ANGLE_STEP, count), SNAP_SPRING);
            fullscreenProgress.value = withSpring(1, FS_SPRING);
            runOnJS(focusHaptic)();
            transitioned.value = true;
          } else if (-up > COLLAPSE_TRIGGER) {
            machineState.value = 'compact';
            expandProgress.value = withSpring(0, EXPAND_SPRING);
            transitioned.value = true;
          }
        })
        .onEnd((e) => {
          if (machineState.value === 'fullscreen' || !scrolled.value) return;
          rotation.value = withDecay(
            { velocity: -e.velocityX / PAN_R, deceleration: 0.997, clamp: [0, maxRotation(count)], rubberBandEffect: true },
            (finished) => {
              if (finished) rotation.value = withSpring(snapRot(rotation.value, count), SNAP_SPRING);
            },
          );
        }),
    [count, rotation, expandProgress, fullscreenProgress, machineState, focusIndex, startRot, anchorY, prevX, prevY, scrolled, transitioned],
  );

  const slots = [];
  for (let i = win.start; i <= win.end; i++) {
    slots.push(
      <CardSlot
        key={deck[i].id}
        index={i}
        item={deck[i]}
        count={count}
        rotation={rotation}
        expandProgress={expandProgress}
        fullscreenProgress={fullscreenProgress}
        machineState={machineState}
        focusIndex={focusIndex}
      />,
    );
  }

  return (
    <>
      {/* Full-sheet pan container. `box-none` lets compact-sheet controls above stay tappable and lets
          each card's own tap through; the pan still recognizes drags that start on a card. `overflow:
          hidden` clips the hand to the design box so cards never spill past the gold frame into the
          margin (#1). */}
      <GestureDetector gesture={pan}>
        <View style={[box(0, 0, 412, 892), { overflow: 'hidden' }]} pointerEvents="box-none">
          {slots}
        </View>
      </GestureDetector>

      <FullscreenCard item={deck[focusedIndex]} />
    </>
  );
}
