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
  FS_OPEN_DIST,
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
    // Angle RELATIVE to the current center index, so the centermost card stays at theta=0 in BOTH
    // compact and expanded (mixing absolute rotation with the compact step is what flung cards off-screen).
    const centerPos = rotation.value / ANGLE_STEP;
    const theta = (index - centerPos) * stepNow;

    const x = OX + R * Math.sin(theta);
    const y = OY - R * Math.cos(theta) + COMPACT_DROP * (1 - p);
    const scale = cardScaleAt(theta) * (COMPACT_SCALE + (1 - COMPACT_SCALE) * p);
    const tilt = theta * 0.7;

    // Show a small hand near center; fade toward the edge of the visible window (tighter when compact).
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
    <Animated.View
      style={[{ position: 'absolute', left: 0, top: 0 }, style]}
      pointerEvents="none"
      // The card art is static; cache it as a GPU texture so per-frame transforms are pure composites.
      renderToHardwareTextureAndroid
      shouldRasterizeIOS>
      <View style={{ position: 'absolute', left: -CARD_W / 2, top: -CARD_H / 2, width: CARD_W, height: CARD_H }}>
        <Card item={item} width={CARD_W} height={CARD_H} />
      </View>
    </Animated.View>
  );
});

/**
 * The interactive card hand. See docs/card-carousel-architecture.md.
 * - VIRTUALIZED: only a window of cards around center is mounted (keyed by absolute index).
 * - EXPAND STATE MACHINE: tap = lock expanded (toggle); hold+drag = expand while held, then a 1s
 *   cancelable window before collapsing. A generation counter invalidates a stale collapse timer.
 * - SWIPE-UP FULLSCREEN: a deliberate vertical drag (axis-locked vs the horizontal scroll) flies the
 *   center card to full-screen; harder while actively scrolling, easier when locked.
 */
export function CardCarousel() {
  const { rotation, expandProgress, fullscreenProgress, machineState, locked, timerGen, category } =
    useCarousel();
  const deck = CARD_DECKS[category];
  const count = deck.length;
  const middle = Math.round((count - 1) / 2);

  const startRot = useSharedValue(0);
  const fsStart = useSharedValue(0);
  const lastCenter = useSharedValue(-999);

  const [centerIndex, setCenterIndex] = useState(middle);
  const [win, setWin] = useState({
    start: Math.max(0, middle - WINDOW_HALF),
    end: Math.min(count - 1, middle + WINDOW_HALF),
  });

  // Window + center index update once per crossed detent (cheap JS, gated on the UI thread).
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

  // Cancelable 1s collapse timer (generation-guarded).
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armCollapse = useCallback(
    (gen: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        runOnUI(() => {
          'worklet';
          if (timerGen.value === gen && machineState.value === 'window') {
            machineState.value = 'compact';
            expandProgress.value = withSpring(0, EXPAND_SPRING);
          }
        })();
      }, 1000);
    },
    [timerGen, machineState, expandProgress],
  );

  // Build the gestures ONCE per deck (not on every virtualization re-render) so the GestureDetector
  // never reconfigures mid-scroll. Closures capture stable shared values + the stable armCollapse.
  const gesture = useMemo(() => {
    const hPan = Gesture.Pan()
      .activeOffsetX([-10, 10])
      .failOffsetY([-26, 26])
      .onBegin(() => {
        cancelAnimation(rotation); // stop any in-flight decay/spring so re-scroll is instant (no delay/jump)
        startRot.value = rotation.value;
        timerGen.value += 1; // invalidate any pending collapse
        if (!locked.value) {
          machineState.value = 'held';
          expandProgress.value = withSpring(1, EXPAND_SPRING);
        }
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
            if (finished) rotation.value = withSpring(snapToDetent(rotation.value, count), SNAP_SPRING);
          },
        );
        if (!locked.value) {
          machineState.value = 'window';
          runOnJS(armCollapse)(timerGen.value); // start the 1s window
        }
      });

    const tap = Gesture.Tap()
      .maxDuration(260)
      .onEnd(() => {
        timerGen.value += 1;
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

    // Vertical = fly the center card full-screen. Axis-locked against the horizontal scroll, harder to
    // trigger while actively scrolling (held) so it never fires by accident mid-scroll.
    const vPan = Gesture.Pan()
      .activeOffsetY([-16, 16])
      .failOffsetX([-20, 20])
      .onBegin(() => {
        fsStart.value = fullscreenProgress.value;
      })
      .onUpdate((e) => {
        const up = -e.translationY;
        const dist = machineState.value === 'held' ? FS_OPEN_DIST * 1.8 : FS_OPEN_DIST;
        fullscreenProgress.value = Math.min(1, Math.max(0, fsStart.value + up / dist));
      })
      .onEnd((e) => {
        const open = fullscreenProgress.value > 0.5 || -e.velocityY > 1000;
        fullscreenProgress.value = withSpring(open ? 1 : 0, FS_SPRING);
      });

    return Gesture.Exclusive(tap, Gesture.Race(vPan, hPan));
  }, [count, armCollapse, rotation, expandProgress, fullscreenProgress, machineState, locked, timerGen, startRot, fsStart]);

  const slots = [];
  for (let i = win.start; i <= win.end; i++) {
    slots.push(
      <CardSlot
        key={deck[i].id}
        index={i}
        item={deck[i]}
        rotation={rotation}
        expandProgress={expandProgress}
        fullscreenProgress={fullscreenProgress}
      />,
    );
  }

  return (
    <>
      {/* Transparent scroll/tap/swipe surface over the card zone (below the trait banners). */}
      <GestureDetector gesture={gesture}>
        <View style={box(0, 714, 412, 178)} />
      </GestureDetector>

      {slots}
      <ExpandIndicator />
      <FullscreenCard item={deck[centerIndex]} />
    </>
  );
}

// (snap helper kept local so the worklet import list stays tidy)
function snapToDetent(value: number, count: number): number {
  'worklet';
  const max = maxRotation(count);
  return Math.min(max, Math.max(0, Math.round(value / ANGLE_STEP) * ANGLE_STEP));
}
