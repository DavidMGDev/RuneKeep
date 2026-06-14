import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChamferBox } from '@/components/chamfer-box';
// (useState/useCallback/useMemo/useEffect/useRef used by the multi-face flip slot, #108/#110)
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { box } from '@/lib/design';
import { Body, Rune } from '@/constants/theme';
import { type CardCategory, type CardItem } from '../card-data';
import { CATEGORY_LABEL, nextCategory } from '../carousel-categories';
import { type ArrivalEnd, type ExpandState, useCarousel } from '../carousel-context';
import { CategoryGlyph } from '../redesign/deck-toggle-icon';
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
  OVERSCROLL_GAIN,
  OVERSCROLL_CAP_GEAR,
  OVERSCROLL_CAP_NORMAL,
  OVERSCROLL_HOLD_MS,
  DECK_EXIT_DROP,
  DECK_ENTER_RISE,
  OX,
  OY,
  PAN_R,
  R,
  slotOpacityAt,
  snapRot,
  SNAP_SPRING,
} from '../carousel-geometry';
import { Card, CardThumb } from './card';
import { EnabledCorner } from './enabled-corner';
import { FocusOverlay } from './focus-overlay';
import { GearDecoration } from './gear-decoration';
import { focusHaptic, tapHaptic } from '@/lib/haptics';

const flipPar = (t: number) => ((t % 2) + 2) % 2;

/** Press-and-hold duration to toggle a card (#175). Quartic ease-IN (#189) so the fill starts slow
 *  (a quick tap barely moves it) and finishes fast — a deliberate hold, never an accidental one. */
const HOLD_MS = 760;
/** Stationary time before the hold "arms" with a light haptic (past the tap window, #189). */
const ARM_MS = 200;

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
  /** Gear over-scroll fan push (#174): design px the whole hand is shoved sideways past a deck end. */
  overscrollX: SharedValue<number>;
  machineState: SharedValue<ExpandState>;
  focusIndex: SharedValue<number>;
  closeFullscreen: () => void;
  /** Multi-face slots register their pager so the parent pan can flip them on a horizontal swipe. */
  registerPager: (index: number, pager: ((delta: number) => void) | null) => void;
  /** This card is currently enabled/equipped (#175) — show the corner check. */
  enabled: boolean;
  /** Toggle this card's enabled state (#175): committed by a press-and-hold on the centered/focused card. */
  onToggle: (id: string) => void;
}

const CardSlot = memo(function CardSlot({ index, item, count, withImage, rotation, expandProgress, fullscreenProgress, grindProgress, deckShift, overscrollX, machineState, focusIndex, closeFullscreen, registerPager, enabled, onToggle }: SlotProps) {
  const style = useAnimatedStyle(() => {
    const p = expandProgress.value;
    // Grinding the inner gear tightens the fan (#62 D): same card size, ~5 cards skimming past.
    const stepNow = (COMPACT_STEP + (ANGLE_STEP - COMPACT_STEP) * p) * (1 - GRIND_TIGHTEN * grindProgress.value);
    const centerPos = rotation.value / ANGLE_STEP;
    const theta = (index - centerPos) * stepNow;
    const dist = Math.abs(index - centerPos); // in card steps, state-independent

    let x = OX + R * Math.sin(theta) + overscrollX.value; // gear over-scroll shoves the whole fan sideways (#174)
    let y = OY - R * Math.cos(theta) + COMPACT_DROP * (1 - p);
    // Grinding shrinks the cards 30% (spacing already tightened above) so more of the deck shows.
    let scale = cardScaleAt(theta) * (COMPACT_SCALE + (1 - COMPACT_SCALE) * p) * (1 - GRIND_SHRINK * grindProgress.value);
    let tilt = theta * 0.5;

    // Slots stay SOLID (the white backs are meant to be seen, #54 B) and only fade in a narrow
    // band right before unmounting; at rest detents every alpha is exactly 0 or 1 (#54 A). The
    // COMPACT hand draws a wider window — up to ~13 thumbs (#95 D).
    let opacity = slotOpacityAt(dist, p);
    let z = Math.round(1000 - dist * 10);

    // Deck switch EXIT (#174): the OLD hand slides DOWN off the bottom and fades only as it nears the
    // edge (it stays visible most of the travel), while the incoming ghost fan rises + fades in over
    // it — no fade-to-empty in place. Rests at 0 → integer alphas at rest (the saveLayerAlpha rule).
    const sweep = deckShift.value;
    if (sweep > 0) {
      y += sweep * DECK_EXIT_DROP;
      const fade = sweep < 0.6 ? 0 : (sweep - 0.6) / 0.4; // hold opaque, fade only in the last ~40%
      opacity *= 1 - fade;
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

  // Press-and-hold to enable/disable a card (#175): only the CENTERED card (expanded) or the FOCUSED
  // card (full-screen) arms. A bottom-to-top fill scans over the hold; reaching the top commits the
  // toggle. Moving the finger (>maxDistance) cancels — so it never fights a scroll/flip. Live cards
  // (gold) keep their own controls and are not holdable.
  const holdProgress = useSharedValue(0); // 0 = no fill .. 1 = filled (quartic ease-in)
  const holdArmed = useSharedValue(0);
  const armSignal = useSharedValue(0); // linear 0->1 over ARM_MS — the arm-haptic timer
  const armHapticDone = useSharedValue(0);
  const commitToggle = useCallback(() => {
    onToggle(item.id);
    focusHaptic(); // medium = the commit
  }, [onToggle, item.id]);
  // Light haptic once the hold ARMS (past the tap window) — distinct from the commit, and never on a
  // quick tap-to-fullscreen (a tap releases before armSignal reaches 1, so it's cancelled first).
  useDerivedValue(() => {
    if (armSignal.value >= 0.999 && holdArmed.value === 1 && armHapticDone.value === 0) {
      armHapticDone.value = 1;
      runOnJS(tapHaptic)();
    }
  });
  const hold = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(HOLD_MS)
        .maxDistance(12) // any real movement (a scroll) cancels — only a stationary hold equips
        .onBegin(() => {
          'worklet';
          const centered = Math.round(rotation.value / ANGLE_STEP) === index;
          const focused = Math.round(focusIndex.value) === index;
          const ms = machineState.value;
          const armed = !item.interactive && ((ms === 'expanded' && centered) || (ms === 'fullscreen' && focused));
          holdArmed.value = armed ? 1 : 0;
          armHapticDone.value = 0;
          if (armed) {
            // quartic ease-in: ~no visible fill in the first ~40% of the hold, so a tap never starts it
            holdProgress.value = withTiming(1, { duration: HOLD_MS, easing: Easing.in(Easing.poly(4)) });
            armSignal.value = 0;
            armSignal.value = withTiming(1, { duration: ARM_MS, easing: Easing.linear });
          }
        })
        .onStart(() => {
          'worklet';
          if (holdArmed.value === 1) {
            runOnJS(commitToggle)();
            holdProgress.value = withTiming(0, { duration: 240 }); // snap the fill out, revealing the corner check
            holdArmed.value = 0;
          }
        })
        .onFinalize(() => {
          'worklet';
          cancelAnimation(holdProgress);
          cancelAnimation(armSignal);
          if (holdProgress.value !== 0) holdProgress.value = withTiming(0, { duration: 160 });
          armSignal.value = 0;
          holdArmed.value = 0;
        }),
    [index, item.interactive, commitToggle, machineState, rotation, focusIndex, holdProgress, holdArmed, armSignal, armHapticDone],
  );
  const slotGesture = useMemo(() => Gesture.Race(hold, tap), [hold, tap]);
  // The scan-fill overlay: a translucent gold sheet rising from the bottom with a bright leading edge.
  // Opacity ramps in over the first slice of the hold (#200) — no pop / first-frames jitter.
  const fillStyle = useAnimatedStyle(() => ({ height: holdProgress.value * CARD_H, opacity: Math.min(1, holdProgress.value * 14) }));

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
      <GestureDetector gesture={slotGesture}>
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
          {/* hold-to-toggle scan fill (#175): rises bottom-to-top while held on the centered/focused card */}
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(224,181,99,0.26)' }, fillStyle]}>
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2.5, backgroundColor: Rune.goldBright }} />
          </Animated.View>
          {/* enabled corner check (#175): overlay on any equipped card, in both LOD and focused states */}
          {enabled ? <EnabledCorner width={CARD_W} height={CARD_H} /> : null}
        </View>
      </GestureDetector>
    </Animated.View>
  );
});

/** The incoming deck rendered as a ghost fan during a switch (#174/#188): rising + fading in
 *  (deckEnter 0→1) while the OLD live hand slides down and fades out beneath it. Centered on the
 *  ARRIVAL extreme (#188 continuation) — so the FIRST cards the user will see are the ones near that
 *  end, and they're preloaded at full-res (not just LOD) before the live deck takes this exact pose. */
function GhostFan({ items, enter, arrival }: { items: CardItem[]; enter: SharedValue<number>; arrival: ArrivalEnd }) {
  const n = items.length;
  const center = arrival === 'start' ? 0 : n - 1; // the extreme the switch lands on
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 1500 }]}>
      {items.map((it, i) => (
        <GhostSlot key={it.id} item={it} index={i} center={center} enter={enter} withImage={Math.abs(i - center) <= IMG_MOUNT_HALF} />
      ))}
    </View>
  );
}

function GhostSlot({ item, index, center, enter, withImage }: { item: CardItem; index: number; center: number; enter: SharedValue<number>; withImage: boolean }) {
  // Resting EXPANDED arc pose (p=1, no grind), centered on the arrival extreme — where the live hand
  // lands at commit. Static geometry; only the enter progress (rise + fade) animates.
  const theta = (index - center) * ANGLE_STEP;
  const x = OX + R * Math.sin(theta);
  const y0 = OY - R * Math.cos(theta);
  const scale = cardScaleAt(theta);
  const tilt = theta * 0.5;
  const dist = Math.abs(index - center);
  const base = slotOpacityAt(dist, 1);
  const z = Math.round(1000 - dist * 10);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x }, { translateY: y0 + (1 - enter.value) * DECK_ENTER_RISE }, { rotateZ: `${tilt}rad` }, { scale }],
    opacity: base * enter.value,
    zIndex: z,
  }));
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, style]}>
      <View style={{ position: 'absolute', left: -CARD_W / 2, top: -CARD_H / 2, width: CARD_W, height: CARD_H }}>
        <CardThumb item={item} />
        {/* preload full-res for the first-seen cards so they don't pop from LOD after the swap (#188) */}
        {withImage ? <Card item={item} width={CARD_W} height={CARD_H} /> : null}
      </View>
    </Animated.View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const IND = 64; // indicator box (design px)
const RING_R = 28;
const RING_C = 2 * Math.PI * RING_R;

/** The over-scroll indicator (#174/#188): sits where a PHANTOM card would be — just left of the first
 *  card / right of the last (carousel-aligned, #9), riding the fan push. Fades in over the push
 *  (osProgress), then its ring fills over the 1s hold (osHold); brightens to red + "RELEASE" when
 *  armed (the hold completed → release switches). */
function DeckSwitchIndicator({ osProgress, osDir, osArmed, osHold, overscrollX }: { osProgress: SharedValue<number>; osDir: SharedValue<number>; osArmed: SharedValue<number>; osHold: SharedValue<number>; overscrollX: SharedValue<number> }) {
  const { category, ring } = useCarousel();
  // The target depends on the pull direction (#214): osDir > 0 (first card pulled right) walks the
  // ring BACKWARD (-1), osDir < 0 (last card pulled left) walks it FORWARD (+1). Sync the live dir to
  // JS so the right glyph/label renders; the indicator is hidden whenever osDir is 0.
  const [dir, setDir] = useState(0);
  useAnimatedReaction(
    () => osDir.value,
    (v, prev) => {
      if (v !== prev && v !== 0) runOnJS(setDir)(v);
    },
  );
  const target: CardCategory = nextCategory(ring, category, dir > 0 ? -1 : 1);
  const wrap = useAnimatedStyle(() => {
    // Phantom card slot one step beyond the pushed edge (left of first / right of last), riding the
    // push. It enters from ~4 card-steps further out, sliding + fading toward the slot as the
    // over-scroll grows to the cap (#200 — a smooth glide, never a pop).
    const p = Math.min(1, osProgress.value);
    const side = osDir.value > 0 ? -1 : 1; // left phantom for a start-end pull, right for an end pull
    const theta = side * ANGLE_STEP;
    const entrance = side * (1 - p) * 4 * 64; // 4 card-steps out at p=0, at the slot by p=1
    const x = OX + R * Math.sin(theta) + overscrollX.value + entrance;
    const y = OY - R * Math.cos(theta);
    const fade = p * p * (3 - 2 * p); // smoothstep — perceptible early, fully in by the cap
    return {
      opacity: osDir.value === 0 ? 0 : fade,
      transform: [{ translateX: x - IND / 2 }, { translateY: y - IND / 2 }, { scale: 0.85 + 0.15 * p + (osArmed.value === 1 ? 0.06 : 0) }],
    };
  });
  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_C * (1 - Math.min(1, osHold.value)),
    stroke: osArmed.value === 1 ? Rune.red : Rune.goldBright,
  }));
  const pullLabel = useAnimatedStyle(() => ({ opacity: osArmed.value === 1 ? 0 : 1 }));
  const armLabel = useAnimatedStyle(() => ({ opacity: osArmed.value === 1 ? 1 : 0 }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: IND, height: IND + 16, alignItems: 'center', zIndex: 2700 }, wrap]}>
      <View style={{ width: IND, height: IND }}>
        <Svg width={IND} height={IND} style={StyleSheet.absoluteFill}>
          <Circle cx={IND / 2} cy={IND / 2} r={RING_R} stroke="rgba(218,162,73,0.22)" strokeWidth={3} fill="rgba(10,12,17,0.66)" />
          <AnimatedCircle cx={IND / 2} cy={IND / 2} r={RING_R} strokeWidth={3.6} fill="none" strokeLinecap="round" strokeDasharray={RING_C} animatedProps={ringProps} transform={`rotate(-90 ${IND / 2} ${IND / 2})`} />
        </Svg>
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}><CategoryGlyph category={target} /></View>
      </View>
      <View style={{ height: 14, marginTop: 2, width: 120, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.Text numberOfLines={1} style={[{ position: 'absolute', color: Rune.goldText, fontSize: 9, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }, pullLabel]}>
          {CATEGORY_LABEL[target]}
        </Animated.Text>
        <Animated.Text numberOfLines={1} style={[{ position: 'absolute', color: Rune.goldBright, fontSize: 9, fontFamily: Body.bold, letterSpacing: 1.2, textTransform: 'uppercase' }, armLabel]}>
          Release
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

/**
 * The card hand — three states (compact → expanded → fullscreen), no timers, no lock. A full-sheet
 * pan scrolls the arc 1:1 and drives the state transitions; each card owns a nested tap. Focusing a
 * card grows that same slot in place over a dim veil (see FocusOverlay) instead of flying a second
 * object up, so there is no dizzying cross-fade (#8c).
 */
export function CardCarousel() {
  const { rotation, expandProgress, fullscreenProgress, machineState, focusIndex, deckShift, deckEnter, incoming, incomingArrival, decks, category, ring, closeFullscreen, collapse, cycleCategory, enabledIds, toggleCard, showCardInfo } = useCarousel();
  const deck = decks[category];
  const count = deck.length;
  const middle = Math.round((count - 1) / 2);

  // Gear over-scroll → category switch (#174). All UI-thread shared state for the sideways
  // pull-to-refresh at a deck end: how far the fan is shoved, which end, and whether it's armed.
  const overscrollX = useSharedValue(0); // design px the fan is pushed sideways past the end
  const osDir = useSharedValue(0); // +1 = first card pushed RIGHT (start end), -1 = last card pushed LEFT (end)
  const osProgress = useSharedValue(0); // 0..1 = indicator fade-in (push / cap)
  const osHold = useSharedValue(0); // 0..1 = radial fill while held AT the cap (over OVERSCROLL_HOLD_MS)
  const osHolding = useSharedValue(0); // 1 while the hold timer is running (so it only starts once)
  const osArmed = useSharedValue(0); // 1 once osHold reached 1 — release here fires the switch

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

  // The "Modifiers" button (#175) fades in on focus and reveals what the focused card applies.
  const [focused, setFocused] = useState(false);
  const wasFocused = useSharedValue(false);
  useDerivedValue(() => {
    const f = fullscreenProgress.value > 0.6;
    if (f !== wasFocused.value) {
      wasFocused.value = f;
      runOnJS(setFocused)(f);
    }
  });
  const modBtnStyle = useAnimatedStyle(() => ({ opacity: fullscreenProgress.value }));

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

  const pan = useMemo(() => {
    // Over-scroll → time-based deck switch (#188). Past a deck end the fan is pushed sideways up to a
    // CAP (gear 50% / normal 15%); the indicator fades in over that push (osProgress). AT the cap a
    // radial bar fills over OVERSCROLL_HOLD_MS (quartic ease in+out, osHold) and arms; release while
    // armed switches, scrolling back below the cap cancels.
    const osPush = (push: number, dir: number, cap: number) => {
      'worklet';
      overscrollX.value = dir > 0 ? push : -push;
      osDir.value = dir;
      osProgress.value = Math.min(1, push / cap);
      if (push >= cap) {
        if (osHolding.value === 0) {
          osHolding.value = 1;
          osHold.value = withTiming(1, { duration: OVERSCROLL_HOLD_MS, easing: Easing.inOut(Easing.poly(4)) }, (fin) => {
            if (fin) {
              osArmed.value = 1;
              runOnJS(focusHaptic)();
            }
          });
        }
      } else if (osHolding.value === 1) {
        osHolding.value = 0;
        osArmed.value = 0;
        cancelAnimation(osHold);
        osHold.value = withTiming(0, { duration: 200 });
      }
    };
    // Back in range mid-drag: drop the over-scroll instantly (no spring — the finger is still down).
    const osClear = () => {
      'worklet';
      if (osDir.value === 0) return;
      overscrollX.value = 0;
      osDir.value = 0;
      osProgress.value = 0;
      osHolding.value = 0;
      osArmed.value = 0;
      cancelAnimation(osHold);
      osHold.value = 0;
    };
    return Gesture.Pan()
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
          // Grinding the gear (#62 D): the power-scroll. Past a deck END it stops feeding rotation
          // (clamped) and instead pushes the WHOLE fan sideways — a sideways pull-to-refresh that
          // arms a category switch at OVERSCROLL_ARM and fires on release (#174). The sensitive sweep
          // (GEAR_SWIPE_PX) means one center->edge drag covers the whole deck AND this over-scroll.
          if (padTouch.value && padWasExpanded.value) {
            scrolled.value = true;
            const raw = startRot.value - e.translationX / gearPanR;
            const max = maxRotation(count);
            if (raw < 0) {
              rotation.value = 0; // first card shoved RIGHT, gap opens LEFT
              osPush(Math.min(OVERSCROLL_CAP_GEAR, -raw * gearPanR * OVERSCROLL_GAIN), 1, OVERSCROLL_CAP_GEAR);
            } else if (raw > max) {
              rotation.value = max; // last card shoved LEFT, gap opens RIGHT
              osPush(Math.min(OVERSCROLL_CAP_GEAR, (raw - max) * gearPanR * OVERSCROLL_GAIN), -1, OVERSCROLL_CAP_GEAR);
            } else {
              rotation.value = raw;
              osClear();
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
            // Normal-scroll over-scroll on the first/last card (#188 #8): clamp + push the fan up to
            // the 15% cap, driving the same time-based switch (gentler than the gear's 50%).
            if (raw < 0) {
              rotation.value = 0;
              osPush(Math.min(OVERSCROLL_CAP_NORMAL, -raw * PAN_R * OVERSCROLL_GAIN), 1, OVERSCROLL_CAP_NORMAL);
            } else if (raw > max) {
              rotation.value = max;
              osPush(Math.min(OVERSCROLL_CAP_NORMAL, (raw - max) * PAN_R * OVERSCROLL_GAIN), -1, OVERSCROLL_CAP_NORMAL);
            } else {
              rotation.value = raw;
              osClear();
            }
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
          // Over-scroll release (#188): armed (the radial filled over the 1s hold) → switch, landing on
          // the OPPOSITE extreme (pulled from the first card → arrive at the last card of the new deck,
          // and vice-versa). Not armed (released early / dragged back) → just spring the push back.
          if (osDir.value !== 0) {
            // osDir > 0 = first card pulled RIGHT → previous category (arrive at its END); osDir < 0
            // = last card pulled LEFT → next category (arrive at its START). The ring loops (#214).
            const arrival = osDir.value > 0 ? 'end' : 'start';
            const dir = osDir.value > 0 ? -1 : 1;
            if (osArmed.value === 1) {
              runOnJS(cycleCategory)(dir, arrival);
              overscrollX.value = withTiming(0, { duration: 220 });
            } else {
              overscrollX.value = withSpring(0, SNAP_SPRING);
            }
            osDir.value = 0;
            osProgress.value = 0;
            osArmed.value = 0;
            osHolding.value = 0;
            cancelAnimation(osHold);
            osHold.value = withTiming(0, { duration: 200 });
            rotation.value = withSpring(snapRot(rotation.value, count), SNAP_SPRING);
            grindProgress.value = withTiming(0, { duration: 220 });
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
          // Safety (#174): a gear over-scroll cancelled mid-drag (onEnd never ran) must not leave the
          // fan stranded pushed-aside — spring it home without firing a switch.
          if (osDir.value !== 0) {
            overscrollX.value = withSpring(0, SNAP_SPRING);
            osDir.value = 0;
            osProgress.value = 0;
            osArmed.value = 0;
            osHolding.value = 0;
            cancelAnimation(osHold);
            osHold.value = withTiming(0, { duration: 200 });
          }
          if (grindProgress.value !== 0 && !scrolled.value) grindProgress.value = withTiming(0, { duration: 220 });
          padTouch.value = false;
        });
    },
    [count, gearPanR, rotation, expandProgress, fullscreenProgress, machineState, focusIndex, closeFullscreen, collapse, cycleCategory, flipFocused, startRot, anchorY, prevX, prevY, scrolled, transitioned, padTouch, padWasExpanded, grindProgress, overscrollX, osDir, osProgress, osHold, osHolding, osArmed],
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
        overscrollX={overscrollX}
        machineState={machineState}
        focusIndex={focusIndex}
        closeFullscreen={closeFullscreen}
        registerPager={registerPager}
        enabled={enabledIds.has(deck[i].id)}
        onToggle={toggleCard}
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
        {/* Incoming deck preloaded off-screen as a ghost fan during a switch (#174) — rises + fades
            in over the outgoing hand, then the live deck takes its place at commit. */}
        {incoming ? <GhostFan items={decks[incoming]} enter={deckEnter} arrival={incomingArrival} /> : null}
        <FocusOverlay />
        {/* "Modifiers" button (#175): fades in under the focused card; opens its per-card effect view. */}
        <Animated.View pointerEvents={focused ? 'box-none' : 'none'} style={[box(106, 730, 200, 40), { zIndex: 3500, alignItems: 'center' }, modBtnStyle]}>
          {focused && deck[c] && !deck[c].interactive ? (
            <Pressable onPress={() => showCardInfo(deck[c].id)} hitSlop={10} accessibilityRole="button" accessibilityLabel="View this card's modifiers">
              <ChamferBox chamfer={9} fill="rgba(14,17,22,0.95)" stroke={Rune.goldEdge} strokeWidth={1.4} style={{ paddingHorizontal: 18, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: Rune.goldText, fontSize: 12.5, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>Modifiers</Text>
              </ChamferBox>
            </Pressable>
          ) : null}
        </Animated.View>
        {/* Gear over-scroll indicator (#174): progress ring + target deck SVG in the opened gap. */}
        <DeckSwitchIndicator osProgress={osProgress} osDir={osDir} osArmed={osArmed} osHold={osHold} overscrollX={overscrollX} />
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
