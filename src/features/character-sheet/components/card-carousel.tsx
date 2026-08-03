import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
  useFrameCallback,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { box } from '@/lib/design';
import { useStageScale } from '@/components/design-stage';
import { Body, Rune } from '@/constants/theme';
import { type CardCategory, type CardItem } from '../card-data';
import { CATEGORY_LABEL, nextCategory } from '../carousel-categories';
import { type ExpandState, useCarousel } from '../carousel-context';
import { CategoryGlyph } from '../sheet/deck-toggle-icon';
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
  EDIT_DWELL_MS,
  EDIT_DWELL_TOL,
  EDIT_SCROLL_CANCEL,
  EDIT_SCALE,
  EDIT_GAP,
  EDIT_ROW_Y,
  EDIT_RAISE,
  clampRot,
  pickWedgeFull,
  imageOpacityAt,
  IMG_MOUNT_HALF,
  LIVE_BUCKET,
  LIVE_MOUNT_HALF,
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
  OVERSCROLL_RESIST,
  OX,
  OY,
  PAN_R,
  R,
  slotOpacityAt,
  snapRot,
  SNAP_SPRING,
} from '../carousel-geometry';
import { reorderBlock } from '../edit-drag';
import { cardMenuOptions } from '../card-menu';
import { CardRadialMenu } from './card-radial-menu';
import { Card, CardThumb } from './card';
import { BakedTokenLayer, type PlacedToken } from './card-tokens';
import { type CornerTone, EnabledCorner } from './enabled-corner';
import { TraitCrossOut } from './trait-cross-out';
import { catalogIdOf } from '@/features/cards/card-effects';
import { FocusOverlay } from './focus-overlay';
import { GearDecoration } from './gear-decoration';
import { focusHaptic, tapHaptic } from '@/lib/haptics';
import { playSfx } from '@/lib/sfx';
import { GEAR_FAST_FLIP_PX, GEAR_SCROLL_PIP_VOLUME, PAGE_FLIP_VOLUME } from '@/lib/sfx-config';

const flipPar = (t: number) => ((t % 2) + 2) % 2;

// Golden-gear "swoosh" (#258r2): gearScroll1 only (owner dislikes 2 for the gear), on each FAST
// direction-reversal while grinding. Module-level + JS-only for safe runOnJS from the pan worklet.
function playGearGrind() {
  playSfx('gearScroll1');
}
// Per-detent pip while grinding the gear (#258r2): the normal carousel scroll tick, quieter (the gear
// scrolls fast). Tunable via GEAR_SCROLL_PIP_VOLUME.
function playGearPip() {
  playSfx('carouselScroll', { volume: GEAR_SCROLL_PIP_VOLUME });
}

/** Design-px the new deck sits BELOW its resting pose while a category switch readies it, before it
 *  rises into view (#242 item 3). Pushed well past the bottom so the hidden, un-ready deck is off-screen. */
const RISE_DIST = 340;

/** Press-and-hold duration to toggle a card (#175). Quartic ease-IN (#189) so the fill starts slow
 *  (a quick tap barely moves it) and finishes fast — a deliberate hold, never an accidental one. */
const HOLD_MS = 760;
/** Stationary time before the hold "arms" with a light haptic (past the tap window, #189). */
const ARM_MS = 200;
/**
 * Pointer travel allowed before the fan decides you are scrolling (v0.27.3).
 *
 * 2 is right for a finger: a touch screen reports a filtered contact point that barely moves while
 * you hold still. A browser compares raw CSS pixels from a mouse or trackpad, where 2px is inside the
 * noise of a resting hand -- so on web the pan activated almost immediately and cancelled the
 * hold-to-toggle every time, long before the hold's own maxDistance(12) was anywhere near. 10 keeps
 * it under that 12, so the hold's limit is the real limit again. Native is unchanged.
 */
const PAN_SLOP = Platform.OS === 'web' ? 10 : 2;
/** A press that never activated the pan is a tap. Tracks PAN_SLOP so the two meet with no dead band. */
const TAP_SLOP = Math.max(8, PAN_SLOP);

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
  /** Mount the LIVE body (within ±LIVE_MOUNT_HALF). Wider than withImage: a live card has no thumb
   *  under it, so cutting it at the image band left holes in the hand (v0.28.0). */
  withLive: boolean;
  rotation: SharedValue<number>;
  expandProgress: SharedValue<number>;
  fullscreenProgress: SharedValue<number>;
  grindProgress: SharedValue<number>;
  /** Gear over-scroll fan push (#174): design px the whole hand is shoved sideways past a deck end. */
  overscrollX: SharedValue<number>;
  /** Rise reveal (#242 item 3): 0 = the deck is mounted BELOW-screen + hidden while it gets ready,
   *  1 = risen into place. Per-slot (not a wrapper) so each slot keeps its own zIndex — the focused
   *  card must still rise over the veil. Drives both a downward translate and the slot's opacity. */
  riseProgress: SharedValue<number>;
  /** 1 while a category switch is in flight (#239): the slot's own tap/hold go inert so un-ready
   *  cards can't be grabbed mid-transition. */
  switching: SharedValue<number>;
  machineState: SharedValue<ExpandState>;
  focusIndex: SharedValue<number>;
  closeFullscreen: () => void;
  /** Multi-face slots register their pager so the parent pan can flip them on a horizontal swipe. */
  registerPager: (index: number, pager: ((delta: number) => void) | null) => void;
  /** This card is currently enabled/equipped (#175) — show the corner check. */
  enabled: boolean;
  /** What the corner says (v0.32.0): equipped, permanent, or equipped-with-modifiers-off. */
  cornerTone: CornerTone;
  /** Mixed ancestry (#265): which trait (1|2) is crossed out on this card, if any. */
  crossTrait?: 1 | 2;
  /** Toggle this card's enabled state (#175): committed by a press-and-hold on the centered/focused card. */
  onToggle: (id: string) => void;
  /** Cosmetic tokens stuck on this card (#244): drawn as a cheap baked LOD that rides the slot. */
  tokens?: PlacedToken[];
  /** v0.9.8 Golden Gear Edit: straighten progress (0 arc → 1 flat row), shared across the hand. */
  editMode: SharedValue<number>;
  /** This card is raised/selected in edit mode. */
  raised: boolean;
  /** Whether Golden Gear Edit is active (JS): disables this slot's long-press so it can't cancel the
   *  master pan and close the card-hold wheel (item 3). */
  editing: boolean;
  /** Tap in edit mode toggles this card's raised state instead of opening it. */
  onRaise: (id: string) => void;
  // --- in-row drag-reorder (v0.9.8) — all carousel-level shared values, read in the slot transform. ---
  /** Index of the card physically grabbed (−1 = none). In a group drag the whole selection follows. */
  grabIndex: SharedValue<number>;
  /** The grabbed finger's live center, in design px (raw). */
  grabX: SharedValue<number>;
  grabY: SharedValue<number>;
  /** SMOOTHED pile position (v0.11.1 item 5): the pile eases toward the finger instead of snapping. */
  grabXAnim: SharedValue<number>;
  grabYAnim: SharedValue<number>;
  /** Smoothed landing position (springs) in REMAINING-card terms — the row reflows the gap toward it so
   *  cards GLIDE into place instead of teleporting (v0.11.0 item 4). */
  hoverAnim: SharedValue<number>;
  /** Reflow gap WIDTH (v0.11.1 item 5): 1 while dragging (a single ghost slot), animating to dragCount
   *  on release so the row opens room for the block THEN the pile drops in (staged, no blink). */
  gapWidth: SharedValue<number>;
  /** 0 while dragging → 1 as the pile spreads from the finger into its landed columns (commit glide). */
  dropSpread: SharedValue<number>;
  /** The insertion index the pile spreads to (in remaining-card terms). */
  dropTo: SharedValue<number>;
  /** 0→1 on grab: eases the row from its resting layout into the reflow so it never snaps (item 8a). */
  grabAnim: SharedValue<number>;
  // --- v0.10.7 multi-select pile drag + breathing highlight ---
  /** 1 while a drag is in flight. */
  editGrabbed: SharedValue<number>;
  /** 1 = dragging the whole selection as a pile (else a lone card). */
  grabIsGroup: SharedValue<number>;
  /** v0.12.3 (2c): 0..1 — suppresses the raised look (lift/scale/breathe/hint) while a pile is being dragged. */
  editFlat: SharedValue<number>;
  /** v0.12.5 (drop-flash): id → NEW index, written at drop-commit BEFORE React re-renders. Slots resolve
   *  their position through it, so stale worklet closures (old `index` props) still paint the new
   *  arrangement — teardown can never flash the previous order. null outside the commit window. */
  pendingOrderSV: SharedValue<Record<string, number> | null>;
  /** index → rank among the raised cards (−1 if not raised) / prefix counts / total, for the reflow. */
  raiseOrderSV: SharedValue<number[]>;
  raisedBeforeSV: SharedValue<number[]>;
  raiseCountSV: SharedValue<number>;
  /** iOS-style wobble (0.5 = still) while the pile is dragged. */
  shake: SharedValue<number>;
  /** Synced 0..1 breathing pulse for the white selection highlight. */
  breathe: SharedValue<number>;
  /** The card the radial menu opened on + its 0→1→0 open-bounce (scale pop feedback). */
  menuCardIdx: SharedValue<number>;
  menuBounce: SharedValue<number>;
}

const CardSlot = memo(function CardSlot({ index, item, count, withImage, withLive, rotation, expandProgress, fullscreenProgress, grindProgress, overscrollX, riseProgress, switching, machineState, focusIndex, closeFullscreen, registerPager, enabled, cornerTone, crossTrait, onToggle, tokens, editMode, raised, editing, onRaise, grabIndex, grabX, grabY, grabXAnim, grabYAnim, hoverAnim, gapWidth, dropSpread, dropTo, grabAnim, editGrabbed, grabIsGroup, editFlat, pendingOrderSV, raiseOrderSV, raisedBeforeSV, raiseCountSV, shake, breathe, menuCardIdx, menuBounce }: SlotProps) {
  // Web reports gesture x in CSS pixels, not design pixels (see coordScale in CardCarousel):
  // without this the left/right half that decides which way a multi-page card turns lands at about a
  // quarter of the card instead of the middle.
  const slotStageScale = useStageScale();
  const coordScale = Platform.OS === 'web' ? slotStageScale : 1;
  // v0.9.8: animate the raised/selected lift (no highlight — the lift itself is the selection cue).
  const raiseSV = useSharedValue(raised ? 1 : 0);
  useEffect(() => { raiseSV.value = withTiming(raised ? 1 : 0, { duration: 220, easing: Easing.out(Easing.cubic) }); }, [raised, raiseSV]);
  const slotId = item.id; // primitive for the worklet (never capture the whole item — faces are ReactNodes)
  const style = useAnimatedStyle(() => {
    // v0.12.5 (drop-flash): resolve this slot's position through the id→index bridge. During the drop-commit
    // window the bridge holds the NEW order while the `index` props are still propagating — so even a stale
    // closure paints the new arrangement and the teardown can't flash the old one for a frame.
    const po = pendingOrderSV.value;
    const mapped = po ? po[slotId] : undefined;
    const idx = mapped !== undefined ? mapped : index;
    const p = expandProgress.value;
    // Grinding the inner gear tightens the fan (#62 D): same card size, ~5 cards skimming past.
    const stepNow = (COMPACT_STEP + (ANGLE_STEP - COMPACT_STEP) * p) * (1 - GRIND_TIGHTEN * grindProgress.value);
    const centerPos = rotation.value / ANGLE_STEP;
    const theta = (idx - centerPos) * stepNow;
    const dist = Math.abs(idx - centerPos); // in card steps, state-independent

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

    // v0.9.8/v0.10.7 Golden Gear Edit: lerp the curved fan toward a FLAT row of small cards, lift the
    // selected cards, and — during a drag — pile the dragged BLOCK at the finger while the rest reflow
    // to open a landing gap. editMode is 0 at rest so this is fully inert outside edit mode.
    const e = editMode.value;
    if (e > 0) {
      const flat = editFlat.value; // 2c: 1 = raised look suppressed (a grab visually deselects the pile)
      const grabbing = editGrabbed.value === 1;
      const isGroup = grabIsGroup.value === 1;
      const ord = raiseOrderSV.value[idx];
      const myOrder = ord == null ? -1 : ord; // rank among raised, or −1
      const inDrag = grabbing && (isGroup ? myOrder >= 0 : idx === grabIndex.value);
      if (inDrag) {
        // The pile RISES from the card's own row slot up to the finger (grabAnim 0→1, item 5), FOLLOWS the
        // finger during the drag, then SPREADS from the finger into its landed columns (dropSpread 0→1) on
        // release — both ends animate, symmetric, no snap.
        const pileOrder = isGroup ? myOrder : 0;
        const restX = OX + (idx - centerPos) * EDIT_GAP + overscrollX.value; // where the card sat before the grab
        const restY = EDIT_ROW_Y - raiseSV.value * (1 - flat) * EDIT_RAISE;
        const fingerX = grabXAnim.value + pileOrder * 3;
        const fingerY = grabYAnim.value - EDIT_RAISE + pileOrder * 2;
        const gapColX = OX + (dropTo.value + pileOrder - centerPos) * EDIT_GAP + overscrollX.value;
        const ga = grabAnim.value;
        const sp = dropSpread.value;
        const baseX = restX + (fingerX - restX) * ga; // slot → finger (grab)
        const baseY = restY + (fingerY - restY) * ga;
        const px = baseX + (gapColX - baseX) * sp; // finger → landed column (commit)
        const py = baseY + (EDIT_ROW_Y - (1 - flat) * EDIT_RAISE - baseY) * sp; // 2c: land FLAT when deselected
        x += (px - x) * e;
        y += (py - y) * e;
        scale += (EDIT_SCALE * (1 + 0.06 * (1 - flat)) - scale) * e; // 2c: drop the enlarge bump while flattened
        // iOS-app-style wobble while rearranging (shake is 0.5 when still); it settles as the pile lands.
        tilt = tilt * (1 - e) + (shake.value - 0.5) * 0.06 * e * (1 - sp);
        z = 5000 - pileOrder;
        // item 8b: a dragged card rides the FINGER, not its old deck slot — force it visible so it never
        // fades out when dragged several slots from where it started.
        opacity = opacity * (1 - e) + 1 * e;
      } else {
        // Reflow: the remaining cards close the gap the pile left and open ONE (ghost) slot at the
        // landing point while dragging; on release the gap widens to the block width (gapWidth 1→N) so
        // the row makes room before the pile drops in. The gap point (hoverAnim) springs → smooth glide.
        let displaySlot = idx;
        if (grabbing) {
          const rb = raisedBeforeSV.value[idx];
          const removedBefore = isGroup ? (rb == null ? 0 : rb) : (idx > grabIndex.value ? 1 : 0);
          const rrank = idx - removedBefore; // rank among the remaining cards
          const shift = Math.max(0, Math.min(1, rrank - hoverAnim.value + 1));
          const grabbedSlot = rrank + gapWidth.value * shift;
          // item 8a: ease from the resting slot into the reflow, so lifting a block out doesn't
          // snap the neighbours closed — they slide in over grabAnim.
          displaySlot = idx + (grabbedSlot - idx) * grabAnim.value;
        }
        // v0.11.1 item 1: a dead-STRAIGHT row at the grind size/height — no curve, no fan tilt.
        const slotOff = displaySlot - centerPos;
        const flatX = OX + slotOff * EDIT_GAP + overscrollX.value;
        x += (flatX - x) * e;
        y += (EDIT_ROW_Y - raiseSV.value * (1 - flat) * EDIT_RAISE - y) * e;
        scale += (EDIT_SCALE - scale) * e;
        tilt = tilt * (1 - e);
        z += Math.round(raiseSV.value * 50 * e);
        // item 8b: visibility follows the DISPLAYED slot, not the frozen deck index (a card whose gap-
        // shifted slot scrolls off the row fades; one still on the row stays solid).
        opacity = opacity * (1 - e) + slotOpacityAt(Math.abs(slotOff), 1) * e;
        // Open-bounce feedback: the card the radial menu blooms on gives a small scale pop.
        if (Math.round(menuCardIdx.value) === idx) scale *= 1 + 0.09 * menuBounce.value;
      }
    }

    // Focus: the SAME card grows in place toward screen centre over the dim veil (#8c) — no second
    // object. It lifts above the veil (z 3000); the others stay below it and are dimmed.
    const fs = fullscreenProgress.value;
    if (fs > 0 && Math.round(focusIndex.value) === idx) {
      x = x + (OX - x) * fs;
      y = y + (FS_CENTER_Y - y) * fs;
      scale = scale + (FS_FOCUS_SCALE - scale) * fs;
      tilt = tilt * (1 - fs);
      opacity = 1;
      z = 3000;
    }

    // Rise reveal (#242 item 3): while a switch readies the new deck it sits BELOW-screen + invisible
    // (riseProgress 0), then rises into place + fades in. A focus never coincides with a switch, so
    // riseProgress is 1 and the focused card stays put + fully opaque.
    const rise = riseProgress.value;
    y += (1 - rise) * RISE_DIST;
    opacity *= rise;

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
    // v0.9.8: Golden Gear Edit forces the lowest LOD (thumbnails only) — never composite full-res art.
    return { opacity: imageOpacityAt(d) * (1 - grindProgress.value) * (1 - editMode.value) };
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
      playSfx('gearScroll2', { volume: PAGE_FLIP_VOLUME }); // #258: quiet gear swoosh on page flip
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
  // Baked tokens (#244): the cheap LOD layer of stuck tokens. Visible in the deck + through every
  // transition, but HIDDEN on the focused card so the interactive board owns those tokens (the
  // board's HD/draggable copies take over, and a drop animation never doubles with a static twin).
  const tokenFade = useAnimatedStyle(() => {
    if (Math.round(focusIndex.value) !== index) return { opacity: 1 };
    // On the focused card, FADE the baked tokens OUT over the first quarter of the focus fly (the
    // interactive board fades them back in over the last quarter) — no jump/rerender pop (#248 item 8).
    return { opacity: Math.max(0, 1 - fullscreenProgress.value / 0.25) };
  });

  // Tap a card: compact → fan open; expanded → fly THIS card to focus; focused → close, OR (a
  // multi-face card) flip back/forward by which half you tapped (#110) — close by swipe-down/gear.
  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(260)
        .onEnd((e) => {
          if (switching.value === 1) return; // deck is mid-switch — not grabbable yet (#239 item 3)
          // v0.9.8 Golden Gear Edit: a tap RAISES/selects this card instead of opening it (no fullscreen).
          if (editMode.value > 0.5) { runOnJS(onRaise)(item.id); return; }
          if (machineState.value === 'fullscreen') {
            if (item.interactive) return; // live card (#136 gold) keeps its taps; close via swipe/gear
            if (hasFaces) runOnJS(pageBy)(e.x / coordScale < CARD_W / 2 ? -1 : 1);
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
            runOnJS(playSfx)('cardFullscreenEnter'); // #255: tap a centered card to focus it
          }
        }),
    [index, count, hasFaces, item.interactive, item.id, pageBy, machineState, expandProgress, fullscreenProgress, rotation, focusIndex, closeFullscreen, switching, editMode, onRaise],
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
        .enabled(!editing) // item 3: OFF in edit mode — its activation cancels the master pan + closes the card-hold wheel
        .minDuration(HOLD_MS)
        .maxDistance(12) // any real movement (a scroll) cancels — only a stationary hold equips
        .onBegin(() => {
          'worklet';
          if (switching.value === 1) return; // don't arm a hold on a mid-switch deck (#239 item 3)
          if (editMode.value > 0.5) { holdArmed.value = 0; return; } // v0.9.8: no enable-toggle in edit mode
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
    [index, item.interactive, commitToggle, machineState, rotation, focusIndex, holdProgress, holdArmed, armSignal, armHapticDone, switching, editMode, editing],
  );
  const slotGesture = useMemo(() => Gesture.Race(hold, tap), [hold, tap]);
  // The scan-fill overlay: a translucent gold sheet rising from the bottom with a bright leading edge.
  // Opacity ramps in over the first slice of the hold (#200) — no pop / first-frames jitter.
  const fillStyle = useAnimatedStyle(() => ({ height: holdProgress.value * CARD_H, opacity: Math.min(1, holdProgress.value * 14) }));
  // v0.10.7 selection breathing: a synced white pulse (0 → 20%) on the raised cards. The per-card
  // raiseSV envelope means a card that JOINS the selection fades into the shared breath instead of
  // snapping to its current peak. A plain View (no SVG) keeps it cheap under the edit dim.
  const breatheStyle = useAnimatedStyle(() => ({ opacity: breathe.value * 0.24 * raiseSV.value * (1 - editFlat.value) }));
  // v0.11.2 item 8e: an upward swipe hint (three chevrons) on every selected card, its opacity driven by
  // the SAME `breathe` value so all selected cards pulse in sync, and by `raiseSV` so a newly-selected
  // card fades into the shared pulse. Hidden while this card is being dragged (breathe carries on).
  const hintStyle = useAnimatedStyle(() => ({ opacity: raiseSV.value * (0.28 + 0.55 * breathe.value) * (1 - editFlat.value) }));

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
          {/* v0.28.0: a multi-page card is a PAGE DECK first, live body second.
              In a browser nothing is ever forged, so a class card arrives carrying BOTH a live node
              and its `faces`, and testing `live` first meant the browser rendered page 1 as a static
              picture and never mounted the pager at all. Tapping still ran the page logic, which
              latched its busy flag on a component that was not there, so after one attempt every tap
              and swipe was ignored too. On a phone the forged item has no `live`, which is why this
              only ever showed in the browser. */}
          {item.live && !hasFaces ? (
            // a LIVE interactive card (#136 gold): rendered as-is; its controls only take touches
            // once focused (else they'd eat the compact expand tap).
            //
            // v0.27.2: only NEAR THE CENTRE, on the same window the full-res image layer already uses.
            // A live card is two or three svg canvases plus a stack of auto-sizing text, which is the
            // whole reason cards are captured to bitmaps in the first place. Since v0.27.0 a card with
            // no bitmap yet renders live instead of being dropped, which is what put the cards back on
            // the browser build; on a phone it meant that during the first forge of a fresh character
            // the ENTIRE deck was live svg at once, every one of them re-rendering after each capture.
            // Far slots are a plain panel, exactly as they are for images, and become themselves as
            // they approach. Deck membership is untouched, so instance ids and ordering cannot shift.
            <View style={StyleSheet.absoluteFill} pointerEvents={liveActive ? 'auto' : 'none'}>
              {withLive ? item.live : null}
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
          {/* baked tokens (#244): the cheap LOD layer; hidden on the focused card (board takes over).
              Only on the near-centre (full-res) window (#297 perf): far thumbs no longer composite the
              gradient token SVGs — which, under the float-menu dim, tanked to ~3 FPS on decorated decks. */}
          {withImage && tokens && tokens.length ? (
            <Animated.View style={[StyleSheet.absoluteFill, tokenFade]} pointerEvents="none">
              <BakedTokenLayer tokens={tokens} cardW={CARD_W} cardH={CARD_H} />
            </Animated.View>
          ) : null}
          {/* v0.10.7 selection breathing (Golden Gear Edit): a synced white pulse on the raised cards. */}
          {raised ? <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 2, top: 2, right: 2, bottom: 2, borderRadius: 7, backgroundColor: '#ffffff' }, breatheStyle]} /> : null}
          {/* v0.12.1 item 3: upward swipe hint (three chevrons) sits ABOVE each selected card (was inside),
              synced to `breathe`. Negative top places it just over the card's top edge. */}
          {raised ? (
            <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: CARD_W / 2 - 22, top: -50, width: 44, height: 44 }, hintStyle]}>
              <Svg width={44} height={44} viewBox="0 0 24 24">
                <Path d="M5 10 L12 4.5 L19 10 M5 15 L12 9.5 L19 15 M5 20 L12 14.5 L19 20" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Animated.View>
          ) : null}
          {/* enabled corner check (#175): overlay on any equipped card, in both LOD and focused states */}
          {enabled ? <EnabledCorner width={CARD_W} height={CARD_H} tone={cornerTone} /> : null}
          {/* mixed-ancestry cross-out (#265): strikes the trait not taken; rides the slot like the corner */}
          {crossTrait ? <TraitCrossOut width={CARD_W} height={CARD_H} catalogId={catalogIdOf(item.id)} crossedTrait={crossTrait} /> : null}
        </View>
      </GestureDetector>
    </Animated.View>
  );
});

/**
 * One button in the focused card's action row. Same chamfered shape as the original Modifiers button,
 * so adding neighbours next to it did not invent a second visual language.
 *
 * v0.32.1: the Pressable FILLS the button and the button is 44 tall, not 40.
 *
 * The row is drawn over the focus veil, and a plain View is not a touch responder, so anything inside
 * the row that was not the Pressable itself fell straight through to the veil and closed the card.
 * That included the gaps between the buttons and, on the fixed-width ones, the padding around the
 * label. `ActionRow` below swallows what is left, so nothing in that band can reach the veil.
 */
function ActionBtn({ label, on, wide, a11y, onPress }: { label: string; on?: boolean; wide?: boolean; a11y: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={6}
      style={wide ? { flex: 1, height: ACTION_H } : { minWidth: 48, height: ACTION_H }}>
      <ChamferBox
        chamfer={9}
        fill={on ? 'rgba(200,27,24,0.9)' : 'rgba(14,17,22,0.95)'}
        stroke={on ? Rune.goldBright : Rune.goldEdge}
        strokeWidth={1.4}
        style={{ flex: 1, paddingHorizontal: wide ? 14 : 12, paddingVertical: 2, alignItems: 'center', justifyContent: 'center' }}>
        <Text numberOfLines={1} style={{ color: on ? Rune.ivory : Rune.goldText, fontSize: 12.5, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
      </ChamferBox>
    </Pressable>
  );
}

/** The row's height. 40 + 2px of vertical padding either side: the buttons were too short once there
 *  were three of them sharing the band. */
const ACTION_H = 44;

/**
 * The row of controls under a focused card (v0.32.0).
 *
 * "Modifiers" has been here since #175. Two neighbours join it, and only when they mean something:
 *
 *  - TOGGLE, on domain cards only. A card like Frenzy is true for one scene and false for the rest
 *    of the session, but it holds one of your five loadout slots either way. Unequipping it to turn
 *    the bonus off was the only lever there was, and it lied about your loadout. Lit = applying.
 *  - "#", only on a card whose modifiers actually read a typed number (Ferocity). A button that did
 *    nothing on every other card would be worse than no button.
 */
function FocusedCardActions({ cardId, instanceId }: { cardId: string; instanceId: string }) {
  const { showCardInfo, toggleCardModifiers, editNumberInput, enabledIds, cardStates } = useCarousel();
  const isDomain = cardStates.domain.has(cardId);
  const equipped = enabledIds.has(cardId);
  const live = !cardStates.modsOff.has(cardId);
  const takesNumber = cardStates.numberInput.has(cardId);
  return (
    // The row SWALLOWS every touch inside it (v0.32.1). Without this the 8px gaps between the buttons
    // were holes straight through to the focus veil, and tapping one closed the card.
    <View
      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      onStartShouldSetResponder={() => true}
      onResponderRelease={() => {}}>
      <ActionBtn label="Modifiers" wide a11y="View this card's modifiers" onPress={() => showCardInfo(instanceId)} />
      {isDomain && equipped ? (
        <ActionBtn
          label="Toggle"
          on={live}
          a11y={live ? "Switch this card's modifiers off, keeping it equipped" : "Switch this card's modifiers back on"}
          onPress={() => toggleCardModifiers(instanceId)}
        />
      ) : null}
      {takesNumber ? <ActionBtn label="#" a11y="Set this card's number" onPress={() => editNumberInput(instanceId)} /> : null}
    </View>
  );
}

/**
 * What an equipped card's corner should say (v0.32.0).
 *
 * Muted beats permanent: if the player has explicitly switched a card's modifiers off, that is the
 * fact they need to see, whatever else the card also is.
 */
function cornerToneFor(ref: string, states: { permanent: Set<string>; modsOff: Set<string> }): CornerTone {
  if (states.modsOff.has(ref)) return 'muted';
  if (states.permanent.has(ref)) return 'permanent';
  return 'on';
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
  const { category, ring, categoryMeta, favDetour } = useCarousel();
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
  // v0.9.8: in a disabled-Favorites detour, BOTH over-scroll sides return to (and label) the origin.
  const target: CardCategory = category === 'favorites' && favDetour ? favDetour : nextCategory(ring, category, dir > 0 ? -1 : 1);
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
          {categoryMeta[target]?.label ?? CATEGORY_LABEL[target] ?? ''}
        </Animated.Text>
        <Animated.Text numberOfLines={1} style={[{ position: 'absolute', color: Rune.goldBright, fontSize: 9, fontFamily: Body.bold, letterSpacing: 1.2, textTransform: 'uppercase' }, armLabel]}>
          Release
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

/** v0.11.1 item 5: the drag insertion GHOST — a single breathing white outline (no fill) that marks
 *  where the pile will land, so a multi-card drag previews a ONE-slot gap (never the full expanded
 *  result pushed off-screen). Sits at the gap column; fades in while dragging, out as the pile lands. */
const GHOST_W = CARD_W * EDIT_SCALE;
const GHOST_H = CARD_H * EDIT_SCALE;
function GhostCard({ editMode, editGrabbed, rotation, hoverAnim, overscrollX, dropSpread, breathe }: { editMode: SharedValue<number>; editGrabbed: SharedValue<number>; rotation: SharedValue<number>; hoverAnim: SharedValue<number>; overscrollX: SharedValue<number>; dropSpread: SharedValue<number>; breathe: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const on = editGrabbed.value * (1 - dropSpread.value) * editMode.value;
    const x = OX + (hoverAnim.value - rotation.value / ANGLE_STEP) * EDIT_GAP + overscrollX.value;
    return {
      opacity: on * (0.1 + 0.5 * breathe.value), // breathes 10% → 60% white while placing
      transform: [{ translateX: x - GHOST_W / 2 }, { translateY: EDIT_ROW_Y - GHOST_H / 2 }],
    };
  });
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: GHOST_W, height: GHOST_H, borderRadius: 7, borderWidth: 2, borderColor: '#ffffff', zIndex: 4800 }, style]} />;
}

/**
 * The card hand — three states (compact → expanded → fullscreen), no timers, no lock. A full-sheet
 * pan scrolls the arc 1:1 and drives the state transitions; each card owns a nested tap. Focusing a
 * card grows that same slot in place over a dim veil (see FocusOverlay) instead of flying a second
 * object up, so there is no dizzying cross-fade (#8c).
 */
export function CardCarousel() {
  const { rotation, expandProgress, fullscreenProgress, machineState, focusIndex, switching, riseProgress, decks, category, ring, closeFullscreen, collapse, cycleCategory, enabledIds, cardStates, crossOuts, toggleCard, cardTokens, editMode, editing, raisedIds, enterEdit, exitEdit, gearFlash, toggleRaise, deselectAll, onReorderCards, nfcAvailable, cardMenuAnchorX, cardMenuAnchorY, cardMenuFingerX, cardMenuFingerY, cardMenuHighlight, openCardMenu, closeCardMenu, selectCardMenu, onEmptyOpen } = useCarousel();
  const deck = decks[category];
  const count = deck.length;

  /**
   * Design-px conversion for the pan's own x and y (web only, v0.28.0).
   *
   * On a phone react-native-gesture-handler reports `e.x` / `e.y` in the handler view's OWN
   * untransformed coordinate space, which IS the 412x892 design space every hit test below is
   * written in. On the web it does not: it divides by the target's own computed transform, and the
   * DesignStage scale lives on an ancestor, so the divisor is 1 and the worklets are handed raw CSS
   * pixels instead.
   *
   * That is why the golden gear looked MISSING in a browser. It was drawn, correctly sized and on
   * top, but whether a touch "is" the gear is decided arithmetically against PAD_X/PAD_Y, and those
   * constants only line up when the stage happens to render at scale 1. At any other window size the
   * gear simply never responded, which is indistinguishable from not being there.
   *
   * Only x and y are wrong. Translations and velocities are screen pixels on both platforms, so they
   * are deliberately left alone.
   */
  const stageScale = useStageScale();
  const coordScale = Platform.OS === 'web' ? stageScale : 1;
  // v0.11.1: the card-hold wheel is spray-select (like the float menu) again — the pan needs the option
  // count to hit-test the wheel; re-memoizes when the category / NFC availability change.
  const menuOptCount = cardMenuOptions(category === 'favorites', nfcAvailable).length;
  const ringLen = ring.length; // #233 item 6: no over-scroll switch when ≤1 category is enabled
  const middle = Math.round((count - 1) / 2);

  // Gear over-scroll → category switch (#174). All UI-thread shared state for the sideways
  // pull-to-refresh at a deck end: how far the fan is shoved, which end, and whether it's armed.
  const overscrollX = useSharedValue(0); // design px the fan is pushed sideways past the end
  const osDir = useSharedValue(0); // +1 = first card pushed RIGHT (start end), -1 = last card pushed LEFT (end)
  const osProgress = useSharedValue(0); // 0..1 = indicator fade-in (push / cap)
  const osHold = useSharedValue(0); // 0..1 = radial fill while held AT the cap (over OVERSCROLL_HOLD_MS)
  const osHolding = useSharedValue(0); // 1 while the hold timer is running (so it only starts once)
  const osArmed = useSharedValue(0); // 1 once osHold reached 1 — release here fires the switch
  // v0.9.8 Golden Gear Edit: hold the gear STILL (≤ EDIT_DWELL_TOL drift) for EDIT_DWELL_MS to flatten
  // the deck. Movement re-anchors + restarts the timer, so a slow scroll never trips it but a paused
  // finger arms it. Purely additive to the gear scroll below.
  const gearDwell = useSharedValue(0);
  const dwellAX = useSharedValue(0);
  const dwellAY = useSharedValue(0);
  const gearScrolled = useSharedValue(0); // item 9: 1 once the gesture scrolled ≥1.5 cards (suppresses enter)
  const enteringEdit = useSharedValue(0); // 1 = the dwell just fired enterEdit (this gesture's release must not collapse)
  // v0.9.8 in-row drag-reorder (edit mode only): swipe a card UP to grab it, drag, drop to reposition.
  // v0.10.7: the RAISED selection drags together as one pile; a lone (unselected) card still drags solo.
  const grabIndex = useSharedValue(-1); // the physically-grabbed card (−1 = not dragging)
  const grabX = useSharedValue(0);
  const grabY = useSharedValue(0);
  const grabXAnim = useSharedValue(0); // v0.11.1 item 5: smoothed pile position (eases toward the finger)
  const grabYAnim = useSharedValue(0);
  const hoverIndex = useSharedValue(0); // landing target, in REMAINING-card terms (0..count-dragCount)
  const hoverAnim = useSharedValue(0); // SMOOTHED landing point the reflow reads (glides toward hoverIndex)
  const gapWidth = useSharedValue(1); // reflow gap width: 1 (ghost) while dragging → dragCount on commit
  const dropSpread = useSharedValue(0); // 0 dragging → 1 as the pile spreads into the gap on release
  const dropTo = useSharedValue(0); // the insertion index the pile spreads to
  const grabAnim = useSharedValue(0); // 0→1 on grab: eases the row from its resting layout into the reflow (item 8a)
  const editGearScroll = useSharedValue(0); // item 8g: 1 = this edit row-scroll came from the GEAR pad (2× speed)
  const autoScroll = useSharedValue(0); // edge-drag autoscroll speed (cards/sec, signed) while dragging
  const countSV = useSharedValue(count); // deck length, readable from the frame-callback worklet
  const editStartIdx = useSharedValue(-1); // card under the touch at edit-drag begin
  const editStartRaised = useSharedValue(0); // 1 if that card is in the selection (→ a group drag / menu)
  const editGrabbed = useSharedValue(0); // 1 once an upward swipe has grabbed
  const grabIsGroup = useSharedValue(0); // 1 = the whole selection is being dragged as a pile
  const editDecided = useSharedValue(0); // 0 undecided, 1 grabbed, 2 scrolling the row, 3 radial menu open
  const editPadTouch = useSharedValue(0); // 1 = this edit touch began on the gear pad (tap → exit edit)
  const editHandledSV = useSharedValue(0); // 1 = onEnd already fired the menu (skip onFinalize)
  const settling = useSharedValue(0); // v0.12.3 (2a): 1 while the staged release commit runs (make-room → spread); freezes the frame-callback so the reflow settles deterministically before the pile drops in
  const editFlat = useSharedValue(0); // v0.12.3 (2c): 0 = normal raised look, 1 = raised look SUPPRESSED — a grab visually deselects the pile so it drags/settles flat (re-raises only if dropped back home)
  const menuDwell = useSharedValue(0); // hold-still timer on a selected card → opens the radial
  const menuCardIdx = useSharedValue(-1); // the card the radial opened on (for the open bounce feedback)
  const menuBounce = useSharedValue(0); // 0→1→0 scale pop when the menu blooms
  const shake = useSharedValue(0.5); // iOS-style wobble while a pile is dragged (0.5 = centred/still)
  // v0.10.7 selection breathing (synced white pulse) + the per-index selection order + prefix counts the
  // pile-drag reflow reads. These arrays are recomputed off `raisedIds`/`deck` in the effect below.
  const breathe = useSharedValue(0);
  // v0.12.5 (drop-flash): id → NEW index bridge, written at drop-commit before React re-renders (see SlotProps).
  const pendingOrderSV = useSharedValue<Record<string, number> | null>(null);
  const raiseOrderSV = useSharedValue<number[]>([]); // index → rank among raised (−1 if not raised)
  const raisedBeforeSV = useSharedValue<number[]>([]); // index → count of raised cards before it
  const raiseCountSV = useSharedValue(0);
  useEffect(() => {
    const orders: number[] = [];
    const before: number[] = [];
    let cnt = 0;
    for (let i = 0; i < deck.length; i++) {
      before[i] = cnt;
      if (raisedIds.has(deck[i].id)) { orders[i] = cnt; cnt++; } else orders[i] = -1;
    }
    raiseOrderSV.value = orders;
    raisedBeforeSV.value = before;
    raiseCountSV.value = cnt;
  }, [raisedIds, deck, raiseOrderSV, raisedBeforeSV, raiseCountSV]);
  // Breathe loops ONLY while something is selected; it keeps looping as more cards join (each new card
  // fades into it via its own raiseSV envelope), and winds down to 0 when the selection empties.
  const anyRaised = raisedIds.size > 0;
  useEffect(() => {
    // v0.11.1 item 4: the breath is 80% faster than v0.11.0 (940 → 522ms).
    if (anyRaised) breathe.value = withRepeat(withTiming(1, { duration: 522, easing: Easing.inOut(Easing.sin) }), -1, true);
    else { cancelAnimation(breathe); breathe.value = withTiming(0, { duration: 300 }); }
  }, [anyRaised, breathe]);
  useEffect(() => { countSV.value = count; }, [count, countSV]);
  // v0.11.1 item 5: one per-frame worklet drives the whole drag feel while editing —
  //  (a) the pile EASES toward the finger (no snap),
  //  (b) the landing gap GLIDES toward its target (no pop, even under autoscroll),
  //  (c) near a screen edge the row autoscrolls, ramping harder over the outer 30% (up to +30%).
  const editFrame = useFrameCallback((info) => {
    'worklet';
    if (editGrabbed.value !== 1 || settling.value === 1 || dropSpread.value > 0.001) return; // inert during the release/drop glide (2a: settling freezes it so the reflow finishes cleanly)
    const cnt = countSV.value;
    const dt = Math.min(50, info.timeSincePreviousFrame ?? 16) / 1000;
    const k = Math.min(1, dt * 9); // exponential-smoothing factor (v0.11.2: ~20% slower, clearly animated)
    // (a) the pile FOLLOWS the finger with a little lag; grabAnim (a timed 0→1, set on grab) is the RISE
    // envelope so cards animate from their row slot up to the finger (item 5) — no snap.
    grabXAnim.value += (grabX.value - grabXAnim.value) * k;
    grabYAnim.value += (grabY.value - grabYAnim.value) * k;
    // (c) edge autoscroll: dead-zone in the center 40%, ramp out, and an extra kick over the outer 30%.
    const dxc = grabX.value - OX;
    const ax = Math.abs(dxc);
    let cps = 0;
    if (ax > 82) {
      let t = Math.min(1, (ax - 82) / (170 - 82));
      const edge = Math.min(1, ax / 206);
      if (edge > 0.7) t *= 1 + 0.3 * ((edge - 0.7) / 0.3); // up to +30% over the last 30% of the screen
      cps = Math.sign(dxc) * t * (2 + Math.min(9, cnt * 0.4));
    }
    autoScroll.value = cps;
    if (cps !== 0) rotation.value = clampRot(rotation.value + cps * ANGLE_STEP * dt, cnt);
    // (b) landing gap glides toward the finger's current slot (springs even as content scrolls beneath).
    const dragCount = grabIsGroup.value === 1 ? raiseCountSV.value : 1;
    const rem = Math.max(0, cnt - dragCount);
    const target = Math.max(0, Math.min(rem, Math.round(rotation.value / ANGLE_STEP + (grabX.value - OX) / EDIT_GAP)));
    hoverIndex.value = target;
    hoverAnim.value += (target - hoverAnim.value) * k;
  }, false);
  useEffect(() => { editFrame.setActive(editing); return () => editFrame.setActive(false); }, [editing, editFrame]);
  // Auto-select the held card when the menu opens on an UNSELECTED card with an empty selection (item 8),
  // so the wheel + its action operate on that single card.
  const selectIfEmpty = useCallback((idx: number) => {
    if (raisedIds.size === 0 && deck[idx]) toggleRaise(deck[idx].id);
  }, [raisedIds, deck, toggleRaise]);
  // v0.11.1 item 5: finish a drop with NO 1-frame blink. By the time this runs the pile has already
  // spread into the (dragCount-wide) gap, so the on-screen layout already equals the post-commit order.
  // We persist the reorder and let a deck-change effect flip `editGrabbed` off only once the new order is
  // live — so the transform never briefly renders the OLD positions. All drags go through the group path.
  // Finish a drop. v0.12.1 item 6: NO flicker — keep the drag state up until the reordered deck is LIVE
  // (a deck-change effect flips it), and pre-write the raiseOrder ranks for the new order so the bridge
  // frame already renders the cards in their final spots. v0.11.2 item 8c reliability is preserved via a
  // safety timeout: if the reordered deck never actually lands (a data-layer no-op), the mode still resets.
  const dropPendingRef = useRef(false);
  const pendingDeselectRef = useRef(false); // 2b: a committed move deselects, but only AFTER the reordered deck is live
  const resetDrag = useCallback(() => {
    dropPendingRef.current = false;
    editGrabbed.value = 0; grabIndex.value = -1; grabIsGroup.value = 0;
    gapWidth.value = 1; dropSpread.value = 0; grabAnim.value = 0; editHandledSV.value = 0; settling.value = 0;
  }, [editGrabbed, grabIndex, grabIsGroup, gapWidth, dropSpread, grabAnim, editHandledSV, settling]);
  // v0.12.3 (2b/2c): finalize a COMMITTED move — runs when the reordered deck is live (deck-change effect) or
  // via the safety net. Deselect the moved pile NOW (over the NEW deck → no old-layout flash), release the
  // flatten envelope only after the deselect fade has passed (so deselected cards never briefly re-raise), reset.
  const finalizeCommittedDrop = useCallback(() => {
    // v0.12.5 (flash fix, for real): teardown no longer races the React commit at all. The id→index bridge
    // (pendingOrderSV, written in finishDrop BEFORE onReorderCards) makes every slot resolve to its NEW
    // position even from a stale worklet closure, so reset/deselect can run immediately with no flash. The
    // bridge is released after the new index props are long since live — identical values, invisible.
    // (v0.12.4's 2-rAF hold still flashed: JS rAF ordering doesn't bound Reanimated's closure propagation.)
    resetDrag();
    if (pendingDeselectRef.current) { pendingDeselectRef.current = false; deselectAll(); }
    editFlat.value = withDelay(200, withTiming(0, { duration: 80 }));
    setTimeout(() => { pendingOrderSV.value = null; }, 600);
  }, [deselectAll, resetDrag, editFlat, pendingOrderSV]);
  const finishDrop = useCallback((to: number) => {
    const dragSet = new Set(deck.filter((c) => raisedIds.has(c.id)).map((c) => c.id));
    const ids = deck.map((c) => c.id);
    const ordered = dragSet.size ? reorderBlock(ids, dragSet, to) : ids;
    const changed = dragSet.size > 0 && !ordered.every((id, i) => id === ids[i]);
    if (changed && onReorderCards) {
      const orders: number[] = []; const before: number[] = []; let cnt = 0;
      for (let i = 0; i < ordered.length; i++) { before[i] = cnt; if (raisedIds.has(ordered[i])) { orders[i] = cnt; cnt++; } else orders[i] = -1; }
      raiseOrderSV.value = orders; raisedBeforeSV.value = before; raiseCountSV.value = cnt;
      // v0.12.5: write the id→index bridge BEFORE the reorder commits — slots follow it from this moment,
      // so the resting layout equals the drag-final layout regardless of when the new index props land.
      const map: Record<string, number> = {};
      for (let i = 0; i < ordered.length; i++) map[ordered[i]] = i;
      pendingOrderSV.value = map;
      dropPendingRef.current = true;
      pendingDeselectRef.current = true; // 2b: defer the deselect until the new deck lands (no flash)
      onReorderCards([...dragSet], category, ordered);
      playSfx('cardDragEnd');
      setTimeout(() => { if (dropPendingRef.current) finalizeCommittedDrop(); }, 500); // safety net (never wedge)
    } else {
      // 2c: no-op (dropped back home) → the pile stays SELECTED; re-raise it now that the settle animation ended.
      editFlat.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
      resetDrag();
    }
  }, [deck, raisedIds, category, onReorderCards, resetDrag, finalizeCommittedDrop, editFlat, raiseOrderSV, raisedBeforeSV, raiseCountSV, pendingOrderSV]);
  // Finalize only once the reordered deck has actually landed (seamless — no old-layout flash, item 2b).
  useEffect(() => {
    if (dropPendingRef.current) finalizeCommittedDrop();
  }, [deck, finalizeCommittedDrop]);
  // Safety: leaving edit mode must never strand the flatten envelope (which would hide future selections).
  useEffect(() => { if (!editing) editFlat.value = 0; }, [editing, editFlat]);

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
  // #258: gear swoosh — track finger travel + last fast direction so we only swoosh on a deliberate
  // fast reversal, never on the gear TAP that closes the carousel.
  const gearPrevTX = useSharedValue(0);
  const gearDirX = useSharedValue(0);
  const gearPipIdx = useSharedValue(0); // #258r2: last detent index seen while grinding (for the pip)
  // Adaptive gear sensitivity (#67 C): one ~GEAR_SWIPE_PX swipe sweeps the WHOLE deck.
  const gearPanR = GEAR_SWIPE_PX / Math.max(ANGLE_STEP, maxRotation(count));

  const [center, setCenter] = useState(middle);
  /**
   * The LIVE window's own centre (v0.28.0).
   *
   * `center` is the settled detent, and it is frozen on purpose while the gear grinds. A phone can
   * afford that, because every slot keeps a bitmap thumb underneath and only resolution is at stake.
   * In a browser nothing is ever forged, so a card's live body is all it draws, and the same freeze
   * (or merely a commit landing a couple of frames late in a fast scroll) blanked cards that were
   * still on screen. This follows the live rotation instead: it never freezes, and it is never more
   * than half a bucket behind.
   */
  const [liveCentre, setLiveCentre] = useState(middle);
  useAnimatedReaction(
    () => Math.round(rotation.value / ANGLE_STEP / LIVE_BUCKET),
    (bucket: number, prev: number | null) => {
      if (bucket !== prev) runOnJS(setLiveCentre)(bucket * LIVE_BUCKET);
    },
    [],
  );
  // On a category SWITCH the deck changes (#227): snap `center` to the landed index right away so the
  // new center card mounts its full-res from the first frame. Otherwise `center` lingers on the old
  // deck's index (the live tracker is frozen while the grind relaxes), so the landed card shows its
  // LOD thumb and only sharpens ~1s later — reading as a "cards reloaded" flicker after the switch.
  useEffect(() => {
    setCenter(Math.min(count - 1, Math.max(0, Math.round(rotation.value / ANGLE_STEP))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, count]);
  // v0.12.1 item 7: when the deck SHRINKS (e.g. deleting the on-screen cards in edit mode) and the view is
  // now past the last card, spring back to the last remaining card so the screen never sits empty.
  useEffect(() => {
    if (count <= 0) return;
    const max = maxRotation(count);
    if (rotation.value > max + 0.001) {
      cancelAnimation(rotation);
      rotation.value = withSpring(snapRot(max, count), SNAP_SPRING);
      focusIndex.value = count - 1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

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

  const onCenter = useCallback((c: number) => {
    setCenter(c);
    playSfx('carouselScroll'); // #255: a tick each time a new card lands centered
  }, []);
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
    const osPush = (push: number, dir: number, cap: number) => {
      'worklet';
      // No category to switch to (#233 item 6): with ≤1 enabled category, suppress the whole
      // over-scroll switch — no fan push, no indicator, no animation. The end just clamps.
      if (ringLen <= 1) {
        osClear();
        return;
      }
      // item 1: a category transition is starting (or in progress) — never let the edit-enter dwell fire
      // over it. Any real over-scroll push cancels the pending dwell (and hides its arming ring).
      cancelAnimation(gearDwell);
      gearDwell.value = 0;
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
              runOnJS(playSfx)('panelOpen'); // #258r2: over-scroll ring filled / armed (was transitionIconFilled — too low)
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
    return Gesture.Pan()
        .minDistance(PAN_SLOP)
        .onBegin((e) => {
          if (switching.value === 1) return; // a switch is in flight — deck isn't grabbable yet (#239)
          // v0.9.8 Golden Gear Edit: a fully separate path — prep a card grab / row scroll, and NONE of
          // the normal gear/grind/dwell logic runs (so normal scrolling is byte-for-byte unaffected).
          if (editMode.value > 0.5) {
            cancelAnimation(rotation);
            pendingOrderSV.value = null; // v0.12.5: a fresh touch ends the drop-commit bridge window (props are live by now)
            startRot.value = rotation.value;
            const cp = rotation.value / ANGLE_STEP;
            const idx = Math.round(cp + (e.x / coordScale - OX) / EDIT_GAP);
            const onRow = e.y / coordScale > EDIT_ROW_Y - 120 && e.y / coordScale < EDIT_ROW_Y + 120;
            editStartIdx.value = onRow && idx >= 0 && idx < count ? idx : -1;
            const ord = editStartIdx.value >= 0 ? raiseOrderSV.value[editStartIdx.value] : -1;
            editStartRaised.value = ord != null && ord >= 0 ? 1 : 0;
            editPadTouch.value = e.x / coordScale >= PAD_X && e.x / coordScale <= PAD_X + PAD_W && e.y / coordScale >= PAD_Y && e.y / coordScale <= PAD_Y + PAD_H ? 1 : 0;
            editGrabbed.value = 0;
            editDecided.value = 0;
            grabIsGroup.value = 0;
            editHandledSV.value = 0;
            grabIndex.value = -1;
            // item 7: hold the gear IN edit mode → drop back to the EXPANDED arc (a tap → compact, in onEnd).
            // The gear gives the white press-flash the same as entering.
            cancelAnimation(gearDwell);
            gearDwell.value = 0;
            if (editPadTouch.value === 1) {
              gearFlash.value = withTiming(1, { duration: 130 });
              gearDwell.value = withTiming(1, { duration: EDIT_DWELL_MS }, (fin) => {
                'worklet';
                if (fin) {
                  editPadTouch.value = 0; // consumed by the hold — don't ALSO tap-exit to compact on release
                  runOnJS(exitEdit)(false); // hold → expanded arc
                }
              });
            }
            // item 6/8: hold a card still → the SPRAY radial wheel (finger tracks a wedge, release fires).
            // A SELECTED card always arms it; an UNSELECTED card arms it only when nothing is selected.
            cancelAnimation(menuDwell);
            menuDwell.value = 0;
            const canMenu = editStartIdx.value >= 0 && (editStartRaised.value === 1 || raiseCountSV.value === 0);
            if (canMenu) {
              menuDwell.value = withTiming(1, { duration: 260 }, (fin) => {
                'worklet';
                if (fin && editDecided.value === 0) {
                  editDecided.value = 3;
                  const cp2 = rotation.value / ANGLE_STEP;
                  const ax = OX + (editStartIdx.value - cp2) * EDIT_GAP;
                  const ay = EDIT_ROW_Y - EDIT_RAISE; // straight row
                  menuCardIdx.value = editStartIdx.value;
                  menuBounce.value = withSequence(withTiming(1, { duration: 90 }), withTiming(0, { duration: 160 }));
                  runOnJS(focusHaptic)();
                  if (editStartRaised.value === 0) runOnJS(selectIfEmpty)(editStartIdx.value);
                  runOnJS(openCardMenu)(ax, ay);
                }
              });
            }
            return;
          }
          cancelAnimation(rotation);
          startRot.value = rotation.value;
          anchorY.value = 0;
          prevX.value = 0;
          prevY.value = 0;
          scrolled.value = false;
          transitioned.value = false;
          // Touch began on the inner-gear pad? (coords are design px — the container IS the
          // 412x892 design box.) Grinding tightens the fan only from the expanded hand.
          padTouch.value = e.x / coordScale >= PAD_X && e.x / coordScale <= PAD_X + PAD_W && e.y / coordScale >= PAD_Y && e.y / coordScale <= PAD_Y + PAD_H;
          // Never treat a touch on the focused card's Modifiers button as a gear-pad tap (#248 item 2):
          // it would otherwise close+collapse the card alongside opening the modifiers.
          // v0.32.1: widened to the whole action row (56..356), which grew when Toggle and # joined
          // Modifiers. The old box was the lone button's, so a tap on the new neighbours reached the
          // gear underneath as well.
          if (machineState.value === 'fullscreen' && e.x / coordScale >= 52 && e.x / coordScale <= 360 && e.y / coordScale >= 764 && e.y / coordScale <= 816) padTouch.value = false;
          padWasExpanded.value = machineState.value === 'expanded';
          if (padTouch.value && padWasExpanded.value) {
            grindProgress.value = withTiming(1, { duration: 160 });
            gearPrevTX.value = 0; // #258: reset swoosh tracking — a plain tap-to-close makes no sound
            gearDirX.value = 0;
            gearPipIdx.value = Math.round(rotation.value / ANGLE_STEP);
            // v0.9.8: arm the dwell-to-edit timer (skip if already editing — the gear then just scrolls).
            if (editMode.value < 0.5) {
              dwellAX.value = 0; dwellAY.value = 0;
              gearScrolled.value = 0; // item 9: once ≥1.5 cards are scrolled, a still hold won't enter edit
              enteringEdit.value = 0;
              gearFlash.value = withTiming(1, { duration: 130 }); // item 2: white press feedback on the gear
              cancelAnimation(gearDwell);
              gearDwell.value = 0;
              gearDwell.value = withTiming(1, { duration: EDIT_DWELL_MS }, (fin) => {
                'worklet';
                // item 1: don't enter over a category transition. item 5: clear the grind-shrink so
                // EXITING edit returns cards to their normal expanded size (not the small gear-scroll size).
                if (fin && osDir.value === 0 && switching.value !== 1 && gearScrolled.value === 0) {
                  enteringEdit.value = 1; // this gesture's eventual release must NOT collapse the hand
                  // item 4: KEEP the grind size while editMode straightens the fan (one seamless motion —
                  // no grow-then-shrink). Drop grindProgress only after editMode≈1 (invisible then), so
                  // EXIT still returns to the full expanded arc.
                  grindProgress.value = withDelay(460, withTiming(0, { duration: 80 }));
                  runOnJS(enterEdit)();
                }
              });
            }
          }
        })
        .onUpdate((e) => {
          if (switching.value === 1) return; // ignore drags while the deck is switching (#239 item 3)
          if (machineState.value === 'fullscreen') return;
          // v0.9.8 Golden Gear Edit: horizontal drag scrolls the flat row; an upward swipe on a card
          // grabs it (a deliberate, scroll-distinct gesture) and then the card follows the finger.
          if (editMode.value > 0.5) {
            // item 6: the radial is a SPRAY wheel (like the float menu) — track the finger + highlight.
            if (editDecided.value === 3) {
              // v0.31.0: through coordScale, like every other hit test here. The wheel's anchor is in
              // design px and the finger was not, so in a browser at any stage scale but 1 the dot
              // jumped away from the finger the instant it moved: on a tablet, straight to the
              // bottom-right. A phone browser renders the stage at ~1, which is why it looked fine.
              cardMenuFingerX.value = e.x / coordScale;
              cardMenuFingerY.value = e.y / coordScale;
              cardMenuHighlight.value = pickWedgeFull(cardMenuAnchorX.value, cardMenuAnchorY.value, e.x / coordScale, e.y / coordScale, menuOptCount);
              return;
            }
            if (editGrabbed.value === 1) {
              // Just feed the raw finger; the frame callback smooths the pile + gap + autoscroll (item 5).
              grabX.value = e.x / coordScale;
              grabY.value = e.y / coordScale;
              return;
            }
            if (editDecided.value === 0) {
              // Upward swipe → GRAB the selection as a pile. The grabbed card is ADDED to the selection so
              // ALL drags go through the group path (item 5: a clean, blink-free commit).
              if (editStartIdx.value >= 0 && e.translationY < -26 && Math.abs(e.translationY) > Math.abs(e.translationX) * 1.1) {
                cancelAnimation(menuDwell);
                menuDwell.value = 0;
                editDecided.value = 1;
                editGrabbed.value = 1;
                grabIsGroup.value = 1;
                grabIndex.value = editStartIdx.value;
                if (editStartRaised.value === 0) runOnJS(selectIfEmpty)(editStartIdx.value); // grab selects it
                grabX.value = e.x / coordScale;
                grabY.value = e.y / coordScale;
                // Seed the smoothed pile at the grabbed card's row slot so it EASES up to the finger.
                grabXAnim.value = OX + (editStartIdx.value - rotation.value / ANGLE_STEP) * EDIT_GAP;
                grabYAnim.value = EDIT_ROW_Y;
                gapWidth.value = 1;
                dropSpread.value = 0;
                // item 5: a timed rise envelope — the pile (and the row reflow) animate up over 250ms.
                grabAnim.value = 0;
                grabAnim.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.cubic) });
                editFlat.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.cubic) }); // 2c: a grab visually deselects the pile so it drags + settles FLAT (re-raises only on a same-slot drop)
                const dragCount = Math.max(1, raiseCountSV.value + (editStartRaised.value === 0 ? 1 : 0));
                const h0 = Math.max(0, Math.min(Math.max(0, count - dragCount), editStartIdx.value));
                hoverIndex.value = h0;
                hoverAnim.value = h0; // start the gap where the block was (no opening jump)
                shake.value = 0; // oscillate 0..1 (centred on 0.5 → symmetric ±wobble); rest is 0.5
                shake.value = withRepeat(withTiming(1, { duration: 90, easing: Easing.inOut(Easing.quad) }), -1, true);
                runOnJS(playSfx)('cardDragStart');
                return;
              }
              if (Math.abs(e.translationX) > 6) {
                cancelAnimation(menuDwell); menuDwell.value = 0; editDecided.value = 2;
                // item 8g: a drag that began on the GEAR pad scrolls the row at 2× (and cancels the
                // hold-to-exit dwell / press-white). A drag on the cards scrolls at 1×.
                if (editPadTouch.value === 1) {
                  editGearScroll.value = 1;
                  cancelAnimation(gearDwell); gearDwell.value = 0;
                  gearFlash.value = withTiming(0, { duration: 160 });
                } else editGearScroll.value = 0;
              }
            }
            if (editDecided.value === 2) {
              // Row scroll with soft rubber at the ends. The gear scrolls 2× the finger rate (item 8g).
              const div = editGearScroll.value === 1 ? EDIT_GAP / 2 : EDIT_GAP;
              const raw = startRot.value - (e.translationX / div) * ANGLE_STEP;
              const max = maxRotation(count);
              rotation.value = raw < 0 ? raw * OVERSCROLL_RESIST : raw > max ? max + (raw - max) * OVERSCROLL_RESIST : raw;
            }
            return;
          }
          // Grinding the gear (#62 D): the power-scroll. Past a deck END it stops feeding rotation
          // (clamped) and instead pushes the WHOLE fan sideways — a sideways pull-to-refresh that
          // arms a category switch at OVERSCROLL_ARM and fires on release (#174). The sensitive sweep
          // (GEAR_SWIPE_PX) means one center->edge drag covers the whole deck AND this over-scroll.
          if (padTouch.value && padWasExpanded.value) {
            scrolled.value = true;
            // item 9: once the gesture has scrolled ≥ EDIT_SCROLL_CANCEL cards, a STILL hold no longer
            // enters edit — you're clearly scrolling, and the white press-flash fades back to gold.
            const scrolledCards = Math.abs(e.translationX / (gearPanR * ANGLE_STEP));
            if (editMode.value < 0.5 && scrolledCards >= EDIT_SCROLL_CANCEL && gearScrolled.value === 0) {
              gearScrolled.value = 1;
              cancelAnimation(gearDwell);
              gearDwell.value = 0;
              gearFlash.value = withTiming(0, { duration: 200 });
            }
            // v0.9.8: any real drift re-anchors + restarts the dwell, so only a STILL finger flattens
            // the deck (a slow scroll keeps moving past the tolerance and never trips it) — unless the
            // gesture has already crossed the scroll threshold (item 9), then it's inert.
            if (editMode.value < 0.5 && gearScrolled.value === 0 && (Math.abs(e.translationX - dwellAX.value) > EDIT_DWELL_TOL || Math.abs(e.translationY - dwellAY.value) > EDIT_DWELL_TOL)) {
              dwellAX.value = e.translationX; dwellAY.value = e.translationY;
              gearFlash.value = withTiming(0, { duration: 200 }); // scrolling → the press-white fades to gold
              cancelAnimation(gearDwell);
              gearDwell.value = 0;
              gearDwell.value = withTiming(1, { duration: EDIT_DWELL_MS }, (fin) => {
                'worklet';
                // item 1: don't enter over a category transition. item 5: clear the grind-shrink so
                // EXITING edit returns cards to their normal expanded size (not the small gear-scroll size).
                if (fin && osDir.value === 0 && switching.value !== 1 && gearScrolled.value === 0) {
                  enteringEdit.value = 1;
                  grindProgress.value = withDelay(460, withTiming(0, { duration: 80 })); // item 4: seamless straighten
                  runOnJS(enterEdit)();
                }
              });
            }
            // #258: swoosh only on a FAST swipe that reverses direction (deliberate flicks)
            const dtx = e.translationX - gearPrevTX.value;
            gearPrevTX.value = e.translationX;
            if (Math.abs(dtx) > GEAR_FAST_FLIP_PX) {
              const d = dtx > 0 ? 1 : -1;
              if (d !== gearDirX.value) {
                gearDirX.value = d;
                runOnJS(playGearGrind)();
              }
            }
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
            // #258r2: per-detent scroll pip while grinding (quieter — see GEAR_SCROLL_PIP_VOLUME)
            const pip = Math.round(rotation.value / ANGLE_STEP);
            if (pip !== gearPipIdx.value) {
              gearPipIdx.value = pip;
              runOnJS(playGearPip)();
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
          if (switching.value === 1) return; // a switch owns the deck right now (#239 item 3)
          // v0.9.8 Golden Gear Edit: drop a grabbed card at the hovered slot (persist), else snap the row.
          if (editMode.value > 0.5) {
            cancelAnimation(menuDwell);
            menuDwell.value = 0;
            cancelAnimation(gearDwell); // release ends any pending hold-to-exit-expanded
            gearDwell.value = 0;
            if (editDecided.value === 3) {
              // item 6 spray-select: release on a wedge fires it; release in the dead-zone/beyond cancels.
              editHandledSV.value = 1;
              if (cardMenuHighlight.value >= 0) runOnJS(selectCardMenu)(cardMenuHighlight.value);
              else runOnJS(closeCardMenu)();
              editDecided.value = 0;
              editStartIdx.value = -1;
              return;
            }
            if (editGrabbed.value === 1) {
              // item 8c: mark the drop HANDLED so onFinalize (which fires right after onEnd) does NOT tear
              // it down before finishDrop runs — that torn-down drop was why re-arrange never committed.
              editHandledSV.value = 1;
              // v0.12.3 (2a): a STRICTLY STAGED commit. `settling` freezes the frame-callback so the gap point
              // no longer glides on its own; FIRST fully make room — settle the gap POINT onto its integer
              // target AND widen the gap to the block width — and only in THAT completion do we let the pile
              // SPREAD into the finished gap, then persist. The pile waits at the finger the whole time room is
              // being made, so the carousel's reflow always finishes before the finger cards re-arrange in.
              settling.value = 1;
              const to = hoverIndex.value;
              const dragCount = Math.max(1, raiseCountSV.value);
              autoScroll.value = 0;
              cancelAnimation(shake);
              shake.value = withTiming(0.5, { duration: 120 });
              dropTo.value = to;
              hoverAnim.value = withTiming(to, { duration: 240, easing: Easing.out(Easing.cubic) });
              gapWidth.value = withTiming(dragCount, { duration: 240, easing: Easing.out(Easing.cubic) }, (madeRoom) => {
                'worklet';
                if (madeRoom) {
                  dropSpread.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.cubic) }, (spread) => {
                    'worklet';
                    if (spread) runOnJS(finishDrop)(to);
                  });
                }
              });
              editDecided.value = 0;
              editStartIdx.value = -1;
              return;
            }
            // item 7: a still TAP on the gear pad exits edit mode → close the whole hand to COMPACT.
            if (editPadTouch.value === 1 && Math.abs(e.translationX) < TAP_SLOP && Math.abs(e.translationY) < TAP_SLOP) {
              editPadTouch.value = 0;
              runOnJS(exitEdit)(true);
              editDecided.value = 0;
              editStartIdx.value = -1;
              return;
            }
            if (editDecided.value === 2) {
              // item 8f: floatier momentum — carry MORE velocity (longer throw) into a softer spring that
              // only snaps as it slows. The gear scroll (2×) carries proportionally more.
              const editPanR = (editGearScroll.value === 1 ? EDIT_GAP / 2 : EDIT_GAP) / ANGLE_STEP;
              const v = Math.max(-MAX_FLING_VEL, Math.min(MAX_FLING_VEL, -e.velocityX / editPanR));
              const target = snapRot(rotation.value + v * FLING_TIME * 2.4, count);
              rotation.value = withSpring(target, { damping: 15, stiffness: 92, mass: 0.95, velocity: v });
            }
            editGearScroll.value = 0;
            editDecided.value = 0;
            editStartIdx.value = -1;
            return;
          }
          cancelAnimation(gearDwell); gearDwell.value = 0; // v0.9.8: a release ends any pending dwell
          // The dwell just ENTERED edit (editMode may still be animating up): don't run the gear-tap
          // collapse — that would compact the hand while edit mode is turning on.
          if (enteringEdit.value === 1) { enteringEdit.value = 0; padTouch.value = false; return; }
          gearFlash.value = withTiming(0, { duration: 220 }); // item 2: didn't enter edit → white fades to gold
          const stillTap = Math.abs(e.translationX) < TAP_SLOP && Math.abs(e.translationY) < TAP_SLOP;
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
            // touch-down) keeps this idempotent with a card's own tap on the overlap zone. v0.9.8: NOT
            // while editing — entering Golden Gear Edit ends with the finger still down, and a gear tap
            // in edit mode must not collapse the flattened deck (exit is the Done control).
            if (padTouch.value && stillTap && editMode.value < 0.5) {
              if (padWasExpanded.value) {
                machineState.value = 'compact';
                expandProgress.value = withSpring(0, EXPAND_SPRING);
              } else if (machineState.value === 'compact') {
                // v0.13.0: an empty deck never fans — show the "There is nothing here" panel instead.
                if (count === 0) runOnJS(onEmptyOpen)();
                else {
                  machineState.value = 'expanded';
                  expandProgress.value = withSpring(1, EXPAND_SPRING);
                }
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
          if (switching.value === 1) return; // don't settle/spring a deck that's mid-switch (#239)
          // v0.9.8/v0.11.1 Golden Gear Edit finalize: handle the cases where the pan never ACTIVATED
          // (a still hold/tap fires onFinalize only, not onEnd) and reset drag bookkeeping.
          if (editMode.value > 0.5) {
            cancelAnimation(menuDwell);
            menuDwell.value = 0;
            cancelAnimation(gearDwell);
            gearDwell.value = 0;
            // Spray wheel open but onEnd didn't run (a still hold released without dragging) → fire the
            // pointed wedge, or cancel in the dead-zone (item 6).
            if (editDecided.value === 3 && editHandledSV.value === 0) {
              if (cardMenuHighlight.value >= 0) runOnJS(selectCardMenu)(cardMenuHighlight.value);
              else runOnJS(closeCardMenu)();
            }
            // item 8c: only tear down a grab that onEnd did NOT already hand to the staged drop
            // (editHandledSV===1). Otherwise onFinalize would kill the in-flight drop → never commits.
            //
            // v0.29.1: `settling` is cleared here too, and that is the softlock. It is raised by the
            // staged commit in onEnd and lowered only at the very END of it, by resetDrag. Every link
            // in that commit chain is a reanimated completion callback with no else branch, so a
            // commit that is interrupted, which a browser does by taking pointer capture on a node
            // this row unmounts as it autoscrolls under the drag, abandons the drop with `settling`
            // left at 1. The per-frame drag worklet is inert while that is set (see its guard), so
            // the NEXT grab does nothing at all and the row reads as frozen with no way out. A
            // release that reaches finalize without a commit in flight must leave nothing latched.
            if (editGrabbed.value === 1 && editHandledSV.value === 0) { editGrabbed.value = 0; grabIndex.value = -1; grabIsGroup.value = 0; gapWidth.value = 1; dropSpread.value = 0; grabAnim.value = 0; autoScroll.value = 0; settling.value = 0; cancelAnimation(shake); shake.value = 0.5; }
            // Still gear tap that never activated the pan → exit edit to COMPACT (item 7).
            if (editDecided.value === 0 && editPadTouch.value === 1 && Math.abs(e.translationX) < TAP_SLOP && Math.abs(e.translationY) < TAP_SLOP) {
              runOnJS(exitEdit)(true);
            }
            editPadTouch.value = 0;
            editHandledSV.value = 0;
            editDecided.value = 0;
            editStartIdx.value = -1;
            return;
          }
          cancelAnimation(gearDwell); gearDwell.value = 0; // v0.9.8: a clean release ends any pending dwell
          if (enteringEdit.value === 1) { enteringEdit.value = 0; padTouch.value = false; return; } // just entered edit
          gearFlash.value = withTiming(0, { duration: 220 }); // item 2: didn't enter edit → white fades to gold
          // v0.9.8: a still gear tap that never activated the pan toggles the hand — but NOT in edit mode
          // (the dwell-enter ends with the finger still down; a tap must not collapse the flattened deck).
          if (!success && padTouch.value && editMode.value < 0.5 && Math.abs(e.translationX) < TAP_SLOP && Math.abs(e.translationY) < TAP_SLOP) {
            if (machineState.value === 'fullscreen') {
              runOnJS(closeFullscreen)();
              runOnJS(collapse)();
            } else if (padWasExpanded.value) {
              machineState.value = 'compact';
              expandProgress.value = withSpring(0, EXPAND_SPRING);
            } else if (machineState.value === 'compact') {
              // v0.13.0: an empty deck never fans — show the "There is nothing here" panel instead.
              if (count === 0) runOnJS(onEmptyOpen)();
              else {
                machineState.value = 'expanded';
                expandProgress.value = withSpring(1, EXPAND_SPRING);
              }
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
          /**
           * Always leave the deck on a detent (v0.28.0).
           *
           * `onBegin` cancels whatever spring is in flight, because a touch takes the deck over. But a
           * TAP never activates the pan, so `onEnd` — the only place that springs to a landing detent —
           * never runs, and the deck was left frozen wherever the fling had got to: two or three cards
           * strewn across the screen with nothing in the middle. Tapping a card mid-scroll showed it
           * best, because the card opened over the mess and revealed it on the way out.
           *
           * It bites hardest with a mouse. A finger drifts a few pixels and activates the pan, so the
           * phone usually got its snap by accident; a click does not move at all, and the web slop is
           * wider still, so on the browser it happened nearly every time.
           */
          if (!success && switching.value !== 1 && machineState.value !== 'fullscreen') {
            const settled = snapRot(rotation.value, count);
            if (Math.abs(settled - rotation.value) > 0.0001) rotation.value = withSpring(settled, SNAP_SPRING);
          }
          padTouch.value = false;
        });
    },
    [count, ringLen, gearPanR, rotation, expandProgress, fullscreenProgress, machineState, focusIndex, closeFullscreen, collapse, cycleCategory, onEmptyOpen, flipFocused, startRot, anchorY, prevX, prevY, scrolled, transitioned, padTouch, padWasExpanded, grindProgress, gearPrevTX, gearDirX, gearPipIdx, overscrollX, osDir, osProgress, osHold, osHolding, osArmed, switching, editMode, enterEdit, exitEdit, gearDwell, gearScrolled, enteringEdit, gearFlash, dwellAX, dwellAY, finishDrop, grabIndex, grabX, grabY, grabXAnim, grabYAnim, hoverIndex, hoverAnim, gapWidth, dropSpread, dropTo, grabAnim, editGearScroll, autoScroll, editStartIdx, editStartRaised, editGrabbed, grabIsGroup, editDecided, editPadTouch, editHandledSV, settling, menuDwell, menuCardIdx, menuBounce, shake, pendingOrderSV, raiseOrderSV, raiseCountSV, menuOptCount, cardMenuAnchorX, cardMenuAnchorY, cardMenuFingerX, cardMenuFingerY, cardMenuHighlight, openCardMenu, closeCardMenu, selectCardMenu, selectIfEmpty],
  );

  const c = Math.min(count - 1, Math.max(0, center)); // clamp: deck may have shrunk on a category switch
  const liveC = Math.min(count - 1, Math.max(0, liveCentre)); // same clamp for the live window
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
        withLive={Math.abs(i - liveC) <= LIVE_MOUNT_HALF}
        rotation={rotation}
        expandProgress={expandProgress}
        fullscreenProgress={fullscreenProgress}
        grindProgress={grindProgress}
        overscrollX={overscrollX}
        riseProgress={riseProgress}
        switching={switching}
        machineState={machineState}
        focusIndex={focusIndex}
        closeFullscreen={closeFullscreen}
        registerPager={registerPager}
        enabled={enabledIds.has(deck[i].ref ?? deck[i].id)}
        cornerTone={cornerToneFor(deck[i].ref ?? deck[i].id, cardStates)}
        crossTrait={crossOuts[deck[i].id]}
        onToggle={toggleCard}
        // v0.9.8: tokens are keyed by the card's ref so all copies (incl. favorites) share one board;
        // fall back to a legacy instance-keyed entry from older saves.
        tokens={cardTokens[deck[i].ref ?? deck[i].id] ?? cardTokens[deck[i].id]}
        editMode={editMode}
        raised={raisedIds.has(deck[i].id)}
        editing={editing}
        onRaise={toggleRaise}
        grabIndex={grabIndex}
        grabX={grabX}
        grabY={grabY}
        grabXAnim={grabXAnim}
        grabYAnim={grabYAnim}
        hoverAnim={hoverAnim}
        gapWidth={gapWidth}
        dropSpread={dropSpread}
        dropTo={dropTo}
        grabAnim={grabAnim}
        editGrabbed={editGrabbed}
        grabIsGroup={grabIsGroup}
        editFlat={editFlat}
        pendingOrderSV={pendingOrderSV}
        raiseOrderSV={raiseOrderSV}
        raisedBeforeSV={raisedBeforeSV}
        raiseCountSV={raiseCountSV}
        shake={shake}
        breathe={breathe}
        menuCardIdx={menuCardIdx}
        menuBounce={menuBounce}
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
        {/* The single live deck (#242 item 3): on a category switch it mounts below-screen + hidden,
            then rises into place via riseProgress — no separate ghost fan. */}
        {slots}
        <FocusOverlay />
        {/* "Modifiers" button (#175): fades in under the focused card; opens its per-card effect view.
            Sits BELOW the multi-page page dots (#233 item 3) so it never collides with them. */}
        <Animated.View pointerEvents={focused ? 'box-none' : 'none'} style={[box(56, 768, 300, ACTION_H), { zIndex: 3500 }, modBtnStyle]}>
          {/* kept MOUNTED whenever there's a focusable card so it FADES with fullscreenProgress (no
              pop). The Pressable fills the whole box (no hitSlop into the gear pad below) so a tap
              here ALWAYS opens the modifiers and is CONSUMED — it never falls through to the focus
              veil (which would close the card) or the gear (#248 item 2). */}
          {deck[c] && !deck[c].interactive ? (
            <FocusedCardActions cardId={deck[c].ref ?? deck[c].id} instanceId={deck[c].id} />
          ) : null}
        </Animated.View>
        {/* Gear over-scroll indicator (#174): progress ring + target deck SVG in the opened gap. */}
        <DeckSwitchIndicator osProgress={osProgress} osDir={osDir} osArmed={osArmed} osHold={osHold} overscrollX={overscrollX} />
        {/* v0.11.1 item 5: the drag insertion ghost (single breathing outline). */}
        <GhostCard editMode={editMode} editGrabbed={editGrabbed} rotation={rotation} hoverAnim={hoverAnim} overscrollX={overscrollX} dropSpread={dropSpread} breathe={breathe} />
        {/* v0.11.1 card-hold radial action menu (Golden Gear Edit): full-circle icon spray wheel. */}
        <CardRadialMenu />
        {/* The inner gear's touchable pad: a hit-target child, so the container pan receives gear touches
            instead of the ExpandVeil swallowing them. Above the dim (2600) so the gear stays usable while
            a card is focused. v0.12.0 device fix: `collapsable={false}` + a hairline background force
            Android to keep this as a REAL, hit-testable drawing layer — some OEM ROMs (Motorola G-series,
            several Xiaomi) flatten a transparent layout-only View under the New Architecture renderer, so
            the pan never received gear touches there while it worked fine on Samsung. */}
        <View
          collapsable={false}
          style={[box(PAD_X, PAD_Y, PAD_W, PAD_H), { zIndex: 2600, backgroundColor: 'rgba(0,0,0,0.012)' }]}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Card scroll gear. Drag to skim cards, tap to toggle the hand"
        />
      </View>
    </GestureDetector>
  );
}
