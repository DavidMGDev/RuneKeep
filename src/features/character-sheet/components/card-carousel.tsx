import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
// (useState/useCallback/useMemo/useEffect/useRef used by the multi-face flip slot, #108/#110)
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { box } from '@/lib/design';
import { Rune } from '@/constants/theme';
import { type CardItem } from '../card-data';
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
} from '../carousel-geometry';
import { Card, CardThumb } from './card';
import { FocusOverlay } from './focus-overlay';
import { GearDecoration } from './gear-decoration';

const flipPar = (t: number) => ((t % 2) + 2) % 2;

/**
 * The 3D flip element (#110) — only mounted/visible when a multi-face card is FOCUSED (the parent
 * fades it in over the flat LOD on open). Two-side model: each flip animates the angle to an
 * ABSOLUTE clean target (`turns * 180`, always a flat multiple of 180), so even an interrupted flip
 * re-targets flat and can NEVER rest at a weird angle (#121). The busy lock (parent) plus the clean
 * target both guard re-entrancy; `renderFace` draws each face through the sheet's own Card.
 */
const FlipCard = memo(function FlipCard({ faceCount, index, dir, renderFace, onSettle }: { faceCount: number; index: number; dir: number; renderFace: (i: number) => ReactNode; onSettle: () => void }) {
  const angle = useSharedValue(0);
  const [faceA, setFaceA] = useState(index);
  const [faceB, setFaceB] = useState(index);
  const turns = useRef(0);
  const prev = useRef(index);
  useEffect(() => {
    if (index === prev.current || faceCount <= 1) return;
    prev.current = index;
    const next = turns.current + (dir >= 0 ? -1 : 1);
    if (flipPar(next) === 0) setFaceA(index);
    else setFaceB(index);
    turns.current = next;
    angle.value = withTiming(next * 180, { duration: 320, easing: Easing.inOut(Easing.cubic) }, (f) => {
      if (f) runOnJS(onSettle)();
    });
  }, [index, dir, faceCount, angle, onSettle]);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ perspective: 900 }, { rotateY: `${angle.value}deg` }], backfaceVisibility: 'hidden' }));
  const bStyle = useAnimatedStyle(() => ({ transform: [{ perspective: 900 }, { rotateY: `${angle.value + 180}deg` }], backfaceVisibility: 'hidden' }));
  return (
    <View style={{ flex: 1 }}>
      <Animated.View style={[StyleSheet.absoluteFill, aStyle]}>{renderFace(faceA)}</Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, bStyle]}>{renderFace(faceB)}</Animated.View>
    </View>
  );
});

interface SlotProps {
  index: number;
  item: CardItem;
  count: number;
  /** Mount the FULL-RES layer (within ±IMG_MOUNT_HALF of center). Far slots are thumb-only (#78). */
  withImage: boolean;
  rotation: SharedValue<number>;
  expandProgress: SharedValue<number>;
  fullscreenProgress: SharedValue<number>;
  grindProgress: SharedValue<number>;
  deckShift: SharedValue<number>;
  machineState: SharedValue<ExpandState>;
  focusIndex: SharedValue<number>;
  closeFullscreen: () => void;
  /** Multi-face slots register their pager so the parent pan can flip them on a horizontal swipe. */
  registerPager: (index: number, pager: ((delta: number) => void) | null) => void;
}

const CardSlot = memo(function CardSlot({ index, item, count, withImage, rotation, expandProgress, fullscreenProgress, grindProgress, deckShift, machineState, focusIndex, closeFullscreen, registerPager }: SlotProps) {
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
    // band right before unmounting; at rest detents every alpha is exactly 0 or 1 (#54 A). The
    // COMPACT hand draws a wider window — up to ~13 thumbs (#95 D).
    let opacity = slotOpacityAt(dist, p);
    let z = Math.round(1000 - dist * 10);

    // Deck switch (#95 C): the whole hand FADES in place (a light 30px settle, no big travel —
    // a real sweep read as the old hand "coming back", owner) while the decks swap underneath,
    // then fades back in once the new thumbs have painted. Rests at 0 → integer alphas at rest.
    const sweep = deckShift.value;
    if (sweep > 0) {
      y += sweep * 30;
      opacity *= 1 - sweep;
    }

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
  // Full-res draws on the 3 center cards and fades to the thumb beneath; the grind damp drops it
  // to ZERO while the gear runs — a grind composites nothing but tiny thumbs (#78).
  const imgFade = useAnimatedStyle(() => {
    const d = Math.abs(index - rotation.value / ANGLE_STEP);
    return { opacity: imageOpacityAt(d) * (1 - grindProgress.value) };
  });

  // Multi-FACE cards (#110: the class-feature card): the slot tracks the page and persists it. The
  // FLAT LOD (thumb + full) of the current face is shown in compact and during the open transition;
  // the 3D flip element is a separate layer the parent fades in only when FOCUSED.
  const [pageIdx, setPageIdx] = useState(0);
  const faces = item.faces;
  const faceCount = faces?.length ?? 0;
  const hasFaces = faceCount > 1;
  const flipDir = useRef(1);
  const flipBusy = useRef(false);
  const curFace = hasFaces ? faces![Math.min(pageIdx, faceCount - 1)] : null;
  // A flip can't start until the previous one settles (#110: re-entrant flips broke the card).
  const pageBy = useCallback(
    (delta: number) => {
      if (flipBusy.current || faceCount <= 1) return;
      flipBusy.current = true;
      flipDir.current = delta;
      setPageIdx((p) => (p + delta + faceCount) % faceCount);
    },
    [faceCount],
  );
  const onFlipSettle = useCallback(() => {
    flipBusy.current = false;
  }, []);

  // register/unregister this slot's pager so the parent pan can flip it on a horizontal swipe (#110)
  useEffect(() => {
    if (!hasFaces) return;
    registerPager(index, pageBy);
    return () => registerPager(index, null);
  }, [hasFaces, index, pageBy, registerPager]);

  // One face → the sheet's own Card (matches the flat LOD beneath, no pop), or its live node until
  // its bitmap is forged (so an un-forged page still renders — #110 missing-page fix).
  const renderFace = useCallback(
    (i: number): ReactNode => {
      const f = faces?.[i];
      if (!f) return null;
      if (f.custom) return f.custom;
      return <Card item={{ id: `${item.id}#${i}`, source: f.source!, thumb: f.thumb! }} width={CARD_W} height={CARD_H} />;
    },
    [faces, item.id],
  );

  // the 3D flip element fades in/out with focus (#110): flat LOD when compact, 3D only when focused
  const fsFade = useAnimatedStyle(() => ({ opacity: fullscreenProgress.value }));
  // the flat LOD fades OUT under the flip element (so the old card never shows behind a turning
  // card) and fades back IN before the card slides home (#110, owner). Crossfade of the same face.
  const lodFade = useAnimatedStyle(() => ({ opacity: 1 - fullscreenProgress.value }));

  // Tap a card: compact → fan open; expanded → fly THIS card to focus; focused → close, OR (a
  // multi-face card) flip back/forward by which half you tapped (#110) — close by swipe-down/gear.
  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(260)
        .onEnd((e) => {
          if (machineState.value === 'fullscreen') {
            if (item.interactive) return; // live card (#136 gold) keeps its taps; close via swipe/gear
            if (hasFaces) runOnJS(pageBy)(e.x < CARD_W / 2 ? -1 : 1);
            else runOnJS(closeFullscreen)();
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
          }
        }),
    [index, count, hasFaces, item.interactive, pageBy, machineState, expandProgress, fullscreenProgress, rotation, focusIndex, closeFullscreen],
  );

  // A live interactive card (#136 gold) only accepts touches when FOCUSED; otherwise its controls
  // would swallow the compact-hand expand tap. Gate pointerEvents on a JS focused flag.
  const [liveActive, setLiveActive] = useState(false);
  const liveActiveSV = useSharedValue(false);
  useDerivedValue(() => {
    const active = !!item.interactive && fullscreenProgress.value > 0.5 && Math.round(focusIndex.value) === index;
    if (active !== liveActiveSV.value) {
      liveActiveSV.value = active;
      runOnJS(setLiveActive)(active);
    }
  });

  return (
    // NO renderToHardwareTexture/rasterize here (issue #41): the slot's opacity + scale change every
    // scrolled frame, which invalidates a rasterized layer each frame — N re-uploaded textures per
    // frame tanked the device globally. Plain composite of a static image is far cheaper.
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, style]}>
      <GestureDetector gesture={tap}>
        <View style={{ position: 'absolute', left: -CARD_W / 2, top: -CARD_H / 2, width: CARD_W, height: CARD_H }}>
          {item.live ? (
            // a LIVE interactive card (#136 gold): rendered as-is; its controls only take touches
            // once focused (else they'd eat the compact expand tap).
            <View style={StyleSheet.absoluteFill} pointerEvents={liveActive ? 'auto' : 'none'}>
              {item.live}
            </View>
          ) : hasFaces ? (
            <>
              {/* flat LOD of the current face — shown compact + during the open transition, faded
                  OUT under the flip element while focused so it never shows behind a turning card */}
              <Animated.View style={[StyleSheet.absoluteFill, lodFade]}>
                {curFace?.custom ? (
                  curFace.custom
                ) : (
                  <>
                    <CardThumb item={{ id: `${item.id}#${pageIdx}`, source: curFace!.source!, thumb: curFace!.thumb! }} />
                    {withImage ? (
                      <Animated.View style={[StyleSheet.absoluteFill, imgFade]}>
                        <Card item={{ id: `${item.id}#${pageIdx}`, source: curFace!.source!, thumb: curFace!.thumb! }} width={CARD_W} height={CARD_H} />
                      </Animated.View>
                    ) : null}
                  </>
                )}
              </Animated.View>
              {/* the 3D flip element — only near center, fades in with focus (the LOD beneath fades out) */}
              {withImage ? (
                <Animated.View style={[StyleSheet.absoluteFill, fsFade]} pointerEvents="none">
                  <FlipCard faceCount={faceCount} index={pageIdx} dir={flipDir.current} renderFace={renderFace} onSettle={onFlipSettle} />
                </Animated.View>
              ) : null}
              {/* page dots BELOW the card, fading with focus (matches the forge) */}
              <Animated.View style={[{ position: 'absolute', top: CARD_H + 8, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 }, fsFade]} pointerEvents="none">
                {faces!.map((_, i) => (
                  <View key={i} style={{ width: 7, height: 7, transform: [{ rotate: '45deg' }], backgroundColor: i === pageIdx ? Rune.red : 'rgba(147,142,136,0.55)' }} />
                ))}
              </Animated.View>
            </>
          ) : (
            <>
              {/* LOD base: the tiny thumb, always present (#78). */}
              <CardThumb item={item} />
              {/* Full-res layer: only near the center; the ±IMG_MOUNT_HALF boundary holds it at
                  alpha 0, decoded and ready to fade in without a pop (#54 B, #78). */}
              {withImage ? (
                <Animated.View style={[StyleSheet.absoluteFill, imgFade]}>
                  <Card item={item} width={CARD_W} height={CARD_H} />
                </Animated.View>
              ) : null}
            </>
          )}
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
  const { rotation, expandProgress, fullscreenProgress, machineState, focusIndex, deckShift, decks, category, closeFullscreen, collapse } = useCarousel();
  const deck = decks[category];
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
  // tightening progress.
  const padTouch = useSharedValue(false);
  const padWasExpanded = useSharedValue(false);
  const grindProgress = useSharedValue(0);
  // Adaptive gear sensitivity (#67 C): one ~GEAR_SWIPE_PX swipe sweeps the WHOLE deck.
  const gearPanR = GEAR_SWIPE_PX / Math.max(ANGLE_STEP, maxRotation(count));

  const [center, setCenter] = useState(middle);

  // Multi-face slots register their pager here so a horizontal swipe in fullscreen flips the
  // FOCUSED card (#110: the page state is per-slot, the pan is here — this is the small lift).
  const pagersRef = useRef<Record<number, (delta: number) => void>>({});
  const registerPager = useCallback((idx: number, pager: ((delta: number) => void) | null) => {
    if (pager) pagersRef.current[idx] = pager;
    else delete pagersRef.current[idx];
  }, []);
  const flipFocused = useCallback((idx: number, delta: number) => {
    pagersRef.current[idx]?.(delta);
  }, []);

  const onCenter = useCallback((c: number) => setCenter(c), []);
  useDerivedValue(() => {
    // Center tracking FREEZES while the gear grinds (#78): full-res is fully damped then anyway,
    // and skipping the per-detent React round-trips keeps the grind on the UI thread alone. It
    // re-fires as grindProgress relaxes, so the landing cards mount + sharpen on release.
    if (grindProgress.value > 0.05) return;
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
          if (padTouch.value && padWasExpanded.value) grindProgress.value = withTiming(1, { duration: 160 });
        })
        .onUpdate((e) => {
          if (machineState.value === 'fullscreen') return;
          // Grinding the gear (#62 D): a much stronger scroll.
          if (padTouch.value && padWasExpanded.value) {
            scrolled.value = true;
            const raw = startRot.value - e.translationX / gearPanR;
            const max = maxRotation(count);
            rotation.value = raw < 0 ? raw * OVERSCROLL_RESIST : raw > max ? max + (raw - max) * OVERSCROLL_RESIST : raw;
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
            // Focused gestures (#110): gear-tap closes+collapses; a horizontal swipe FLIPS the
            // focused card (left = next, right = back); a downward swipe closes; else settle open.
            const ax = Math.abs(e.translationX);
            const ay = Math.abs(e.translationY);
            if (padTouch.value && stillTap) {
              runOnJS(closeFullscreen)();
              runOnJS(collapse)();
            } else if (ax > 44 && ax > ay * 1.2) {
              runOnJS(flipFocused)(Math.round(focusIndex.value), e.translationX < 0 ? 1 : -1);
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
          padTouch.value = false;
        }),
    [count, gearPanR, rotation, expandProgress, fullscreenProgress, machineState, focusIndex, closeFullscreen, collapse, flipFocused, startRot, anchorY, prevX, prevY, scrolled, transitioned, padTouch, padWasExpanded, grindProgress],
  );

  const c = Math.min(count - 1, Math.max(0, center)); // clamp: deck may have shrunk on a category switch
  // Every slot mounts forever on its tiny LOD thumb (#78) — no virtualization churn, no unmount
  // pops, and the whole deck of thumbs composites for less than two full cards. Only the
  // full-res LAYER windows around the center.
  const slots = [];
  for (let i = 0; i < count; i++) {
    slots.push(
      <CardSlot
        key={deck[i].id}
        index={i}
        item={deck[i]}
        count={count}
        withImage={Math.abs(i - c) <= IMG_MOUNT_HALF}
        rotation={rotation}
        expandProgress={expandProgress}
        fullscreenProgress={fullscreenProgress}
        grindProgress={grindProgress}
        deckShift={deckShift}
        machineState={machineState}
        focusIndex={focusIndex}
        closeFullscreen={closeFullscreen}
        registerPager={registerPager}
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
      {/* zIndex 30: the card UI (and its dims) stacks above the hearts layer (10) and the expand
          veil (20) — nothing on the sheet may ever draw or hit-test over the cards (#87). */}
      <View style={[box(0, 0, 412, 892), { zIndex: 30 }]} pointerEvents="box-none">
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
