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
import { focusHaptic, tapHaptic } from '@/lib/haptics';
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
  GEAR_SWIPE_PX,
  GRIND_LOOKAHEAD,
  GRIND_SHRINK,
  GRIND_TIGHTEN,
  imageOpacityAt,
  IMG_MOUNT_HALF,
  MAX_FLING_VEL,
  PAD_H,
  PAD_W,
  PAD_X,
  PAD_Y,
  maxRotation,
  OVERSCROLL_RESIST,
  OX,
  OY,
  PAN_R,
  R,
  slotOpacityAt,
  snapRot,
  SNAP_SPRING,
  WINDOW_HALF,
} from '../carousel-geometry';
import { Card, CardBack } from './card';
import { FocusOverlay } from './focus-overlay';
import { GearDecoration } from './gear-decoration';

/** White card-back placeholders DISABLED for now (#67 A): with all mounted slots pre-decoding
 *  their WebP at alpha 0, fast scrolls show cards fading in instead of a back→image pop. Kept
 *  behind this toggle for one more iteration before deleting. */
const SHOW_CARD_BACKS = false;

interface SlotProps {
  index: number;
  item: CardItem;
  count: number;
  /** Mount the real Image (within ±IMG_MOUNT_HALF of center). Far slots are back-only. */
  withImage: boolean;
  rotation: SharedValue<number>;
  expandProgress: SharedValue<number>;
  fullscreenProgress: SharedValue<number>;
  grindProgress: SharedValue<number>;
  machineState: SharedValue<ExpandState>;
  focusIndex: SharedValue<number>;
  closeFullscreen: () => void;
}

const CardSlot = memo(function CardSlot({ index, item, count, withImage, rotation, expandProgress, fullscreenProgress, grindProgress, machineState, focusIndex, closeFullscreen }: SlotProps) {
  const style = useAnimatedStyle(() => {
    const p = expandProgress.value;
    // Grinding the inner gear tightens the fan (#62 D): same card size, ~5 cards skimming past.
    const stepNow = (COMPACT_STEP + (ANGLE_STEP - COMPACT_STEP) * p) * (1 - GRIND_TIGHTEN * grindProgress.value);
    const centerPos = rotation.value / ANGLE_STEP;
    const theta = (index - centerPos) * stepNow;
    const dist = Math.abs(index - centerPos); // in card steps, state-independent

    let x = OX + R * Math.sin(theta);
    let y = OY - R * Math.cos(theta) + COMPACT_DROP * (1 - p);
    // Grinding shrinks the cards 30% (spacing already tightened above) so more of the deck shows.
    let scale = cardScaleAt(theta) * (COMPACT_SCALE + (1 - COMPACT_SCALE) * p) * (1 - GRIND_SHRINK * grindProgress.value);
    let tilt = theta * 0.5;

    // Slots stay SOLID (the white backs are meant to be seen, #54 B) and only fade in a narrow
    // band right before unmounting; at rest detents every alpha is exactly 0 or 1 (#54 A).
    let opacity = slotOpacityAt(dist);
    let z = Math.round(1000 - dist * 10);

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
    return { opacity: imageOpacityAt(d, grindProgress.value) };
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
          {SHOW_CARD_BACKS ? <CardBack /> : null}
          {/* The ±IMG_MOUNT_HALF boundary slot holds its decoded image at alpha 0, ready to fade
              in without a pop or a decode hitch (#54 B, #67 A). */}
          {withImage ? (
            <Animated.View style={[StyleSheet.absoluteFill, imgFade]}>
              <Card item={item} width={CARD_W} height={CARD_H} />
            </Animated.View>
          ) : null}
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
  const { rotation, expandProgress, fullscreenProgress, machineState, focusIndex, category, closeFullscreen, collapse } = useCarousel();
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
  // Inner-gear grind state (#62 D): touch began on the gear pad / from which hand state / fan
  // tightening progress / last detent ticked (haptics).
  const padTouch = useSharedValue(false);
  const padWasExpanded = useSharedValue(false);
  const grindProgress = useSharedValue(0);
  const lastDetent = useSharedValue(0);
  const grindDir = useSharedValue(0); // -1 | 0 | +1, mirrored into grindAhead on change
  // Adaptive gear sensitivity (#67 C): one ~GEAR_SWIPE_PX swipe sweeps the WHOLE deck.
  const gearPanR = GEAR_SWIPE_PX / Math.max(ANGLE_STEP, maxRotation(count));

  const [center, setCenter] = useState(middle);
  // Grind foresight (#75): ±1 while the gear is being dragged in that direction, 0 otherwise.
  // Drives the extended, image-carrying mount window ahead of the scroll.
  const [grindAhead, setGrindAhead] = useState(0);

  const onCenter = useCallback((c: number) => setCenter(c), []);
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
        .onBegin((e) => {
          cancelAnimation(rotation);
          startRot.value = rotation.value;
          anchorY.value = 0;
          prevX.value = 0;
          prevY.value = 0;
          scrolled.value = false;
          transitioned.value = false;
          // Touch began on the inner-gear pad? (coords are design px — the container IS the
          // 412x892 design box.) Grinding tightens the fan only from the expanded hand.
          padTouch.value = e.x >= PAD_X && e.x <= PAD_X + PAD_W && e.y >= PAD_Y && e.y <= PAD_Y + PAD_H;
          padWasExpanded.value = machineState.value === 'expanded';
          lastDetent.value = Math.round(rotation.value / ANGLE_STEP);
          if (padTouch.value && padWasExpanded.value) grindProgress.value = withTiming(1, { duration: 160 });
        })
        .onUpdate((e) => {
          if (machineState.value === 'fullscreen') return;
          // Grinding the gear (#62 D): a much stronger scroll with a haptic tick per detent.
          if (padTouch.value && padWasExpanded.value) {
            scrolled.value = true;
            const raw = startRot.value - e.translationX / gearPanR;
            const max = maxRotation(count);
            rotation.value = raw < 0 ? raw * OVERSCROLL_RESIST : raw > max ? max + (raw - max) * OVERSCROLL_RESIST : raw;
            const det = Math.round(rotation.value / ANGLE_STEP);
            if (det !== lastDetent.value) {
              lastDetent.value = det;
              runOnJS(tapHaptic)();
            }
            // Foresight (#75): tell React which way the grind is heading so extra slots mount
            // (and decode) ahead of the finger.
            const dir = e.translationX < -4 ? 1 : e.translationX > 4 ? -1 : 0;
            if (dir !== 0 && dir !== grindDir.value) {
              grindDir.value = dir;
              runOnJS(setGrindAhead)(dir);
            }
            return;
          }
          const dx = e.translationX - prevX.value;
          const dy = e.translationY - prevY.value;
          prevX.value = e.translationX;
          prevY.value = e.translationY;
          if (Math.abs(dx) >= Math.abs(dy)) {
            // horizontal-dominant: scroll 1:1, reset the upward reference. Past a deck end the drag
            // keeps moving at OVERSCROLL_RESIST (soft rubber) instead of hard-pinning (#30 A).
            // Scrolling a COMPACT hand fans it open immediately (#62 B) — no tap required; the
            // same drag keeps scrolling as the hand expands.
            if (machineState.value === 'compact') {
              machineState.value = 'expanded';
              expandProgress.value = withSpring(1, EXPAND_SPRING);
            }
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
          const stillTap = Math.abs(e.translationX) < 8 && Math.abs(e.translationY) < 8;
          // Focused: a tap on the gear closes the card AND collapses the whole hand (#62 D);
          // a downward swipe (or flick) returns the card; otherwise settle it back open.
          if (machineState.value === 'fullscreen') {
            if (padTouch.value && stillTap) {
              runOnJS(closeFullscreen)();
              runOnJS(collapse)();
            } else if (e.translationY > 60 || e.velocityY > 600) runOnJS(closeFullscreen)();
            else fullscreenProgress.value = withSpring(1, FS_SPRING);
            padTouch.value = false;
            return;
          }
          if (!scrolled.value) {
            // A still tap on the gear pad toggles the hand (#62 D). padWasExpanded (captured at
            // touch-down) keeps this idempotent with a card's own tap on the overlap zone.
            if (padTouch.value && stillTap) {
              if (padWasExpanded.value) {
                machineState.value = 'compact';
                expandProgress.value = withSpring(0, EXPAND_SPRING);
              } else if (machineState.value === 'compact') {
                machineState.value = 'expanded';
                expandProgress.value = withSpring(1, EXPAND_SPRING);
              }
            }
            padTouch.value = false;
            return;
          }
          // Predict the landing detent from the capped velocity and spring there CARRYING the
          // velocity (#30 A). The spring overshoots a little on a hard fling — intentional, bounded —
          // and always converges onto a detent, even released past a deck end (drag overscroll snaps
          // home the same way). No decay phase → no off-center float, no teleport at the extremes.
          const grinding = padTouch.value && padWasExpanded.value;
          const panR = grinding ? gearPanR : PAN_R;
          const v = Math.max(-MAX_FLING_VEL, Math.min(MAX_FLING_VEL, -e.velocityX / panR));
          const target = snapRot(rotation.value + v * FLING_TIME, count);
          rotation.value = withSpring(target, { ...SNAP_SPRING, velocity: v });
          if (grinding) grindProgress.value = withTiming(0, { duration: 220 });
          padTouch.value = false;
        })
        // A clean tap never activates the pan (minDistance) — onEnd doesn't run, onFinalize does.
        .onFinalize((e, success) => {
          if (!success && padTouch.value && Math.abs(e.translationX) < 8 && Math.abs(e.translationY) < 8) {
            if (machineState.value === 'fullscreen') {
              runOnJS(closeFullscreen)();
              runOnJS(collapse)();
            } else if (padWasExpanded.value) {
              machineState.value = 'compact';
              expandProgress.value = withSpring(0, EXPAND_SPRING);
            } else if (machineState.value === 'compact') {
              machineState.value = 'expanded';
              expandProgress.value = withSpring(1, EXPAND_SPRING);
            }
          }
          if (grindProgress.value !== 0 && !scrolled.value) grindProgress.value = withTiming(0, { duration: 220 });
          if (grindDir.value !== 0) {
            grindDir.value = 0;
            runOnJS(setGrindAhead)(0);
          }
          padTouch.value = false;
        }),
    [count, gearPanR, rotation, expandProgress, fullscreenProgress, machineState, focusIndex, closeFullscreen, collapse, startRot, anchorY, prevX, prevY, scrolled, transitioned, padTouch, padWasExpanded, grindProgress, lastDetent],
  );

  const c = Math.min(count - 1, Math.max(0, center)); // clamp: deck may have shrunk on a category switch
  // Grind foresight (#75): the mount window grows GRIND_LOOKAHEAD slots in the scroll direction,
  // every one carrying its image (decoding at alpha 0, rolling with the center) — a fast grind
  // meets already-decoded cards instead of empty slots. Collapses when the grind ends.
  const aheadHi = grindAhead > 0 ? GRIND_LOOKAHEAD : 0;
  const aheadLo = grindAhead < 0 ? GRIND_LOOKAHEAD : 0;
  const slots = [];
  for (let i = Math.max(0, c - WINDOW_HALF - aheadLo); i <= Math.min(count - 1, c + WINDOW_HALF + aheadHi); i++) {
    slots.push(
      <CardSlot
        key={deck[i].id}
        index={i}
        item={deck[i]}
        count={count}
        withImage={grindAhead !== 0 || Math.abs(i - c) <= IMG_MOUNT_HALF}
        rotation={rotation}
        expandProgress={expandProgress}
        fullscreenProgress={fullscreenProgress}
        grindProgress={grindProgress}
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
        {/* Gear art INSIDE the container so it interleaves with the stack: under the cards
            normally, above the fullscreen dim, under the focused card (#62 D). */}
        <GearDecoration />
        {slots}
        <FocusOverlay />
        {/* The inner gear's touchable pad: a transparent hit-target child, so the container pan
            receives gear touches instead of the ExpandVeil swallowing them. Above the dim (2600)
            so the gear stays usable while a card is focused. */}
        <View
          style={[box(PAD_X, PAD_Y, PAD_W, PAD_H), { zIndex: 2600 }]}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Card scroll gear. Drag to skim cards, tap to toggle the hand"
        />
      </View>
    </GestureDetector>
  );
}
