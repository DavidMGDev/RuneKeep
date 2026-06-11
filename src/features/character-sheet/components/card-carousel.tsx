import { memo, useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
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
  COLLAPSE_TRIGGER,
  COMPACT_DROP,
  COMPACT_SCALE,
  COMPACT_STEP,
  EXPAND_SPRING,
  EXPAND_TRIGGER,
  FLING_TIME,
  FS_CENTER_Y,
  FS_FOCUS_SCALE,
  FS_SPRING,
  FS_UP_TRIGGER,
  FS_UP_VELOCITY,
  imageOpacityAt,
  MAX_FLING_VEL,
  maxRotation,
  OVERSCROLL_RESIST,
  OX,
  OY,
  PAN_R,
  R,
  snapRot,
  SNAP_SPRING,
  WINDOW_HALF,
} from '../carousel-geometry';
import { Card, CardBack } from './card';
import { FocusOverlay } from './focus-overlay';

interface SlotProps {
  index: number;
  item: CardItem;
  count: number;
  rotation: SharedValue<number>;
  expandProgress: SharedValue<number>;
  fullscreenProgress: SharedValue<number>;
  machineState: SharedValue<ExpandState>;
  focusIndex: SharedValue<number>;
  closeFullscreen: () => void;
}

const CardSlot = memo(function CardSlot({ index, item, count, rotation, expandProgress, fullscreenProgress, machineState, focusIndex, closeFullscreen }: SlotProps) {
  const style = useAnimatedStyle(() => {
    const p = expandProgress.value;
    const stepNow = COMPACT_STEP + (ANGLE_STEP - COMPACT_STEP) * p;
    const centerPos = rotation.value / ANGLE_STEP;
    const theta = (index - centerPos) * stepNow;

    let x = OX + R * Math.sin(theta);
    let y = OY - R * Math.cos(theta) + COMPACT_DROP * (1 - p);
    let scale = cardScaleAt(theta) * (COMPACT_SCALE + (1 - COMPACT_SCALE) * p);
    let tilt = theta * 0.5;

    // Falloff tightened to the ±2 mount window (issue #41): fully faded by ~2.6 steps out, so the
    // unmounted third neighbor never pops in/out visibly.
    const edge = (1.6 + 0.6 * p) * stepNow;
    let opacity = Math.min(1, Math.max(0, (1.2 * edge - Math.abs(theta)) / (0.5 * edge)));
    let z = Math.round(1000 - (Math.abs(theta) / stepNow) * 10);

    // Focus: the SAME card grows in place toward screen centre over the dim veil (#8c) — no second
    // object. It lifts above the veil (z 3000); the others stay below it and are dimmed.
    const fs = fullscreenProgress.value;
    if (fs > 0 && Math.round(focusIndex.value) === index) {
      x = x + (OX - x) * fs;
      y = y + (FS_CENTER_Y - y) * fs;
      scale = scale + (FS_FOCUS_SCALE - scale) * fs;
      tilt = tilt * (1 - fs);
      opacity = 1;
      z = 3000;
    }

    return {
      transform: [{ translateX: x }, { translateY: y }, { rotateZ: `${tilt}rad` }, { scale }],
      zIndex: z,
      opacity,
    };
  });

  // Real-art alpha: full within ±1 step of center, 0 by ±2 (#48 B). At alpha 0 the platform skips
  // the draw entirely, so at most ~3 full card textures composite per frame — the outer slots show
  // the cheap CardBack underneath instead. A focused card always counts as center (rotation snaps
  // to it), so its art is always full.
  const imgFade = useAnimatedStyle(() => {
    const d = Math.abs(index - rotation.value / ANGLE_STEP);
    return { opacity: imageOpacityAt(d) };
  });

  // Tap a card: compact → fan open; expanded → fly THIS card to focus; focused → close.
  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(260)
        .onEnd(() => {
          if (machineState.value === 'fullscreen') {
            runOnJS(closeFullscreen)();
            return;
          }
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
    [index, count, machineState, expandProgress, fullscreenProgress, rotation, focusIndex, closeFullscreen],
  );

  return (
    // NO renderToHardwareTexture/rasterize here (issue #41): the slot's opacity + scale change every
    // scrolled frame, which invalidates a rasterized layer each frame — N re-uploaded textures per
    // frame tanked the device globally. Plain composite of a static image is far cheaper.
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, style]}>
      <GestureDetector gesture={tap}>
        <View style={{ position: 'absolute', left: -CARD_W / 2, top: -CARD_H / 2, width: CARD_W, height: CARD_H }}>
          <CardBack />
          <Animated.View style={[StyleSheet.absoluteFill, imgFade]}>
            <Card item={item} width={CARD_W} height={CARD_H} />
          </Animated.View>
        </View>
      </GestureDetector>
    </Animated.View>
  );
});

/**
 * The card hand — three states (compact → expanded → fullscreen), no timers, no lock. A full-sheet
 * pan scrolls the arc 1:1 and drives the state transitions; each card owns a nested tap. Focusing a
 * card grows that same slot in place over a dim veil (see FocusOverlay) instead of flying a second
 * object up, so there is no dizzying cross-fade (#8c).
 */
export function CardCarousel() {
  const { rotation, expandProgress, fullscreenProgress, machineState, focusIndex, category, closeFullscreen } = useCarousel();
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
            // horizontal-dominant: scroll 1:1, reset the upward reference. Past a deck end the drag
            // keeps moving at OVERSCROLL_RESIST (soft rubber) instead of hard-pinning (#30 A).
            anchorY.value = e.translationY;
            scrolled.value = true;
            const raw = startRot.value - e.translationX / PAN_R;
            const max = maxRotation(count);
            rotation.value = raw < 0 ? raw * OVERSCROLL_RESIST : raw > max ? max + (raw - max) * OVERSCROLL_RESIST : raw;
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
          // Focused: a downward swipe (or flick) returns the card; otherwise settle it back open.
          if (machineState.value === 'fullscreen') {
            if (e.translationY > 60 || e.velocityY > 600) runOnJS(closeFullscreen)();
            else fullscreenProgress.value = withSpring(1, FS_SPRING);
            return;
          }
          if (!scrolled.value) return;
          // Predict the landing detent from the capped velocity and spring there CARRYING the
          // velocity (#30 A). The spring overshoots a little on a hard fling — intentional, bounded —
          // and always converges onto a detent, even released past a deck end (drag overscroll snaps
          // home the same way). No decay phase → no off-center float, no teleport at the extremes.
          const v = Math.max(-MAX_FLING_VEL, Math.min(MAX_FLING_VEL, -e.velocityX / PAN_R));
          const target = snapRot(rotation.value + v * FLING_TIME, count);
          rotation.value = withSpring(target, { ...SNAP_SPRING, velocity: v });
        }),
    [count, rotation, expandProgress, fullscreenProgress, machineState, focusIndex, closeFullscreen, startRot, anchorY, prevX, prevY, scrolled, transitioned],
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
        closeFullscreen={closeFullscreen}
      />,
    );
  }

  return (
    // Full-sheet pan container. `box-none` keeps the compact-sheet controls above tappable and lets
    // each card's own tap through; the pan still grabs drags that start on a card. NOT clipped: the
    // focus veil inside must overdraw to the physical screen edges (#30 B) — card spill into the
    // letterbox margins is hidden under the full-bleed border bands. The focus veil lives INSIDE here
    // so it can layer between the focused card and the rest of the hand (#8c).
    <GestureDetector gesture={pan}>
      <View style={box(0, 0, 412, 892)} pointerEvents="box-none">
        {slots}
        <FocusOverlay />
      </View>
    </GestureDetector>
  );
}
