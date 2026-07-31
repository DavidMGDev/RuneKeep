import { forwardRef, memo, type ReactNode, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Polygon, Polyline } from 'react-native-svg';

import { ArtImage } from '@/components/art-image';
import { useScreenInsets } from '@/components/app-screen';
import { Rune } from '@/constants/theme';
import { TraitCrossOut } from '@/features/character-sheet/components/trait-cross-out';
import { playSfx } from '@/lib/sfx';
import { GEAR_FAST_FLIP_PX, GEAR_SCROLL_PIP_VOLUME, PAGE_FLIP_VOLUME } from '@/lib/sfx-config';
import { MAX_FLING_VEL, FLING_TIME, OVERSCROLL_RESIST, SNAP_SPRING, FS_SPRING } from '@/features/character-sheet/carousel-geometry';
import { useLayout } from '@/hooks/use-layout';
import { useScreenDim } from '@/lib/screen-dim';
import { FORGED_H, FORGED_W } from './forged-card';

// Gear swoosh (#258r2): gearScroll1 only, on each fast direction-reversal while grinding — matches
// the sheet carousel. Module-level + JS-only for safe runOnJS from the pan worklet.
function playGearGrind() {
  playSfx('gearScroll1');
}
// Per-detent pip while grinding the gear (#258r2): the carousel scroll tick, quieter.
function playGearPip() {
  playSfx('carouselScroll', { volume: GEAR_SCROLL_PIP_VOLUME });
}

// The sheet's inner gear (U3) — here it IS the fast-scroll control, riding the bottom edge.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const INNER_GEAR = require('../../../../assets/art/gears/raster/U3.webp') as number;

/**
 * The forge's STRAIGHT carousel (#102): the sheet hand's feel — 1:1 pan, predicted-detent spring
 * release, two-LOD cards, grow-in-place fullscreen, gear grind — laid out on a straight line for
 * picking cards while reading them. Always expanded (no compact state); selection controls live
 * where the sheet keeps its gear, plus above the card in fullscreen.
 */

/** One rendered face of a card — an LOD/full image pair, or a live forged element. */
export interface StraightFace {
  thumb?: number | { uri: string };
  source?: number | { uri: string };
  custom?: ReactNode;
}

export interface StraightItem {
  id: string;
  /** Printed/pre-rendered card pair (catalog requires or forged-render uris)... */
  thumb?: number | { uri: string };
  source?: number | { uri: string };
  /** ...or a FORGED card rendered live (the pre-render loading state, #104). */
  custom?: ReactNode;
  /** Multi-face deck (#110): when focused this card becomes a 3D flip-deck — face 0 is the card
   *  itself (matches thumb/source/custom), the rest flip in on tap. Class cards: [class, ...features]. */
  faces?: StraightFace[];
  /** Interactive card (#128 gold): when focused, taps go to the card's OWN controls (the carousel
   *  won't close it on tap) — close it by swipe-down or the veil. */
  interactive?: boolean;
  label?: string;
}

const SPACING = 148; // px between detents
const CARD_SCALE = 0.70; // resting center card (#108: a touch smaller so it clears the controls)
/**
 * The resting card's centre, as a fraction of the rail height (#108: pushed up).
 *
 * v0.27.2: 0.36 -> 0.38, for headroom above the card. Note this is a FRACTION of the rail, which is
 * what makes trimming the header alone disappointing: every pixel reclaimed above makes the rail one
 * pixel taller, and the card's rest centre moves down by 0.36 of it, so only about a third of any trim
 * survives as visible gap. Moving the fraction is the half that lands in full.
 */
const REST_FRAC = 0.38;
const SIDE_FALLOFF = 0.085; // per-step shrink
const GRIND_TIGHTEN_L = 0.52; // straight-line grind: tighter…
const GRIND_SHRINK_L = 0.45; // …and smaller, never curved
const GEAR_SWIPE_L = 200; // grind: this many px sweep the whole deck
const GEAR_DEG_PER_STEP = 52; // gear rotation per detent (#110: spins as the deck moves)
const IMG_HALF = 2;
/** Slots kept mounted either side of the window centre, and how coarsely that centre tracks the
 *  scroll. The visible band is about six cards, so this is generous by design: it has to cover the
 *  bucket's own rounding as well as the fade band. */
const WIN_HALF = 16;
const WIN_BUCKET = 8;
// Fullscreen layout (#108): the card sits CENTERED with a real gap below the screen border (never
// off-screen) and a reserved band at the bottom for the fixed select controls.
const FS_TOP_PAD = 58; // gap from the screen border (inset top) to the card top
const FS_BOTTOM_RESERVE = 168; // reserved bottom band for the SELECT/FEATURES/counter stack

function clampIdx(i: number, count: number): number {
  'worklet';
  return Math.min(count - 1, Math.max(0, i));
}

function FaceContent({ face, fullRes }: { face: StraightFace; fullRes: boolean }) {
  if (face.custom) return <>{face.custom}</>;
  const src = fullRes ? (face.source ?? face.thumb) : (face.thumb ?? face.source);
  return src != null ? <ArtImage source={src} fit="contain" /> : null;
}

const flipPar = (t: number) => ((t % 2) + 2) % 2;

/**
 * A 3D flip-deck (#110): two persistent physical sides. Each flip animates the angle to an ABSOLUTE
 * clean target (`turns * 180`, always a flat multiple of 180) rather than relative to the live
 * value — so even an INTERRUPTED flip (fast double-tap) re-targets to a flat angle and can NEVER
 * rest at a weird angle (#121, owner). The soon-forward side gets the target face before the turn,
 * so there's no swap-frame flash. `onSettle` clears the parent's busy lock on completion.
 */
const FlipCard = memo(function FlipCard({ faces, index, dir, fullRes, animate, onSettle }: { faces: StraightFace[]; index: number; dir: number; fullRes: boolean; animate: boolean; onSettle?: () => void }) {
  const angle = useSharedValue(0);
  const [faceA, setFaceA] = useState(index); // forward when turns is even (angle ≡ 0°)
  const [faceB, setFaceB] = useState(index); // forward when turns is odd  (angle ≡ 180°)
  const turns = useRef(0);
  const prev = useRef(index);

  useEffect(() => {
    if (index === prev.current) return;
    prev.current = index;
    if (!animate || faces.length <= 1) {
      // snap: refresh whichever side currently faces the viewer (no turn)
      if (flipPar(turns.current) === 0) setFaceA(index);
      else setFaceB(index);
      onSettle?.();
      return;
    }
    // forward advance turns the reversed way (#110); ABSOLUTE target keeps every rest flat
    const next = turns.current + (dir >= 0 ? -1 : 1);
    if (flipPar(next) === 0) setFaceA(index);
    else setFaceB(index);
    turns.current = next;
    angle.value = withTiming(next * 180, { duration: 320, easing: Easing.inOut(Easing.cubic) }, (f) => {
      if (f && onSettle) runOnJS(onSettle)();
    });
  }, [index, animate, dir, angle, faces.length, onSettle]);

  const aStyle = useAnimatedStyle(() => ({ transform: [{ perspective: 900 }, { rotateY: `${angle.value}deg` }], backfaceVisibility: 'hidden' }));
  const bStyle = useAnimatedStyle(() => ({ transform: [{ perspective: 900 }, { rotateY: `${angle.value + 180}deg` }], backfaceVisibility: 'hidden' }));

  return (
    <View style={{ flex: 1 }}>
      <Animated.View style={[StyleSheet.absoluteFill, aStyle]}>
        <FaceContent face={faces[faceA] ?? faces[0]} fullRes={fullRes} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, bStyle]}>
        <FaceContent face={faces[faceB] ?? faces[0]} fullRes={fullRes} />
      </Animated.View>
    </View>
  );
});

interface SlotProps {
  index: number;
  item: StraightItem;
  count: number;
  width: number;
  pos: SharedValue<number>;
  grind: SharedValue<number>;
  fs: SharedValue<number>;
  focusIdx: SharedValue<number>;
  railH: SharedValue<number>;
  railTopWin: SharedValue<number>;
  insetTop: number;
  screenH: number;
  selected: boolean;
  withImage: boolean;
  /** Focus + flip state (#110): the focused card flips between faces; the centered card keeps its
   *  current face even when collapsed (page persists); others render face 0. */
  focused: boolean;
  isCenter: boolean;
  faceIndex: number;
  flipDir: number;
  onFlipSettle: () => void;
  onTap: (index: number, x: number) => void;
  /** Mixed ancestry (#265): which trait (1|2) is struck through on this card, if any. */
  crossTrait?: 1 | 2;
}

const Slot = memo(function Slot({ index, item, count, width, pos, grind, fs, focusIdx, railH, railTopWin, insetTop, screenH, selected, withImage, focused, isCenter, faceIndex, flipDir, onFlipSettle, onTap, crossTrait }: SlotProps) {
  const style = useAnimatedStyle(() => {
    const g = grind.value;
    const d = index - pos.value;
    const ad = Math.abs(d);
    let x = d * SPACING * (1 - GRIND_TIGHTEN_L * g);
    // v0.26.0: shrink to fit a short rail.
    //
    // The card is a fixed 322dp tall and sits at REST_FRAC down the rail, so on a short viewport its
    // top edge rose past the top of the rail and overlapped the step tabs above it. That happens on
    // mobile web whenever the browser's own chrome is showing, which is most of the time. The card
    // gives way instead: it is never bigger than the space it has, and never smaller than half, since
    // below that it stops being readable and something else has gone wrong.
    const fit = railH.value > 0 ? Math.min(1, Math.max(0.5, railH.value / (FORGED_H * CARD_SCALE / REST_FRAC / 2))) : 1;
    let scale = CARD_SCALE * fit * (1 - Math.min(ad, 3.4) * SIDE_FALLOFF) * (1 - GRIND_SHRINK_L * g);
    let y = 0;
    // visibility window: solid then a quick fade band; widens while grinding
    const cut = 2.9 + 2.6 * g;
    let opacity = Math.min(1, Math.max(0, (cut - ad) / 0.45));
    let z = Math.round(100 - ad * 10);
    const f = fs.value;
    if (f > 0 && Math.round(focusIdx.value) === index) {
      // Grow IN PLACE to a SCREEN-anchored target (#108): centred horizontally, top a fixed gap
      // below the border, scale fit so the bottom clears the reserved control band. Never off-screen.
      const fsScale = Math.min((width - 24) / FORGED_W, (screenH - insetTop - FS_TOP_PAD - FS_BOTTOM_RESERVE) / FORGED_H);
      const cardCenterScreen = insetTop + FS_TOP_PAD + (FORGED_H * fsScale) / 2;
      const targetCenterLocal = cardCenterScreen - railTopWin.value; // rail-local Y of that screen point
      const restCenterLocal = railH.value * REST_FRAC;
      x = x * (1 - f);
      y = (targetCenterLocal - restCenterLocal) * f;
      scale = scale + (fsScale - scale) * f;
      opacity = 1;
      z = 300;
    }
    return { transform: [{ translateX: x }, { translateY: y }, { scale }], opacity, zIndex: z };
  });

  const imgFade = useAnimatedStyle(() => {
    const ad = Math.abs(index - pos.value);
    return { opacity: Math.min(1, Math.max(0, 2 - ad)) * (1 - grind.value) };
  });

  // page dots fade IN/OUT with the focus progress (#110) — no pop when the dialogue closes
  const dotsStyle = useAnimatedStyle(() => ({ opacity: fs.value }));

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(260)
        .onEnd((e) => {
          runOnJS(onTap)(index, e.x);
        }),
    [index, onTap],
  );

  const hasFaces = (item.faces?.length ?? 0) > 0;

  return (
    <Animated.View style={[{ position: 'absolute', left: width / 2 - FORGED_W / 2, top: `${REST_FRAC * 100}%`, marginTop: -FORGED_H / 2, width: FORGED_W, height: FORGED_H }, style]}>
      <GestureDetector gesture={tap}>
        <View style={{ flex: 1 }}>
          {hasFaces ? (
            <FlipCard faces={item.faces!} index={isCenter ? faceIndex : 0} dir={focused ? flipDir : 1} fullRes={focused || withImage} animate={focused} onSettle={onFlipSettle} />
          ) : item.custom ? (
            item.custom
          ) : (
            <>
              {item.thumb != null ? <ArtImage source={item.thumb} fit="contain" recyclingKey={`${item.id}-lod`} /> : null}
              {withImage && item.source != null ? (
                <Animated.View style={[StyleSheet.absoluteFill, imgFade]}>
                  <ArtImage source={item.source} fit="contain" recyclingKey={item.id} />
                </Animated.View>
              ) : null}
            </>
          )}
          {selected ? (
            <>
              <View style={[StyleSheet.absoluteFill, { borderWidth: 3, borderColor: Rune.red }]} pointerEvents="none" />
              <View style={{ position: 'absolute', right: 8, top: 8 }} pointerEvents="none">
                <Svg width={24} height={24} viewBox="0 0 20 20">
                  <Polygon points="10,0 20,10 10,20 0,10" fill={Rune.red} />
                  <Polyline points="5.5,10 8.8,13.4 14.6,6.8" fill="none" stroke={Rune.ivory} strokeWidth={2} />
                </Svg>
              </View>
            </>
          ) : null}
          {/* mixed-ancestry cross-out (#265): strikes the trait not taken; rides the card like `selected` */}
          {crossTrait ? <TraitCrossOut width={FORGED_W} height={FORGED_H} catalogId={item.id} crossedTrait={crossTrait} /> : null}
          {/* page indicator (#110): BELOW the card, off the parchment (sibling of FlipCard so it
              never rotates). Fades in/out with focus progress — no pop on close. */}
          {isCenter && (item.faces?.length ?? 0) > 1 ? (
            <Animated.View style={[{ position: 'absolute', top: FORGED_H + 10, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 }, dotsStyle]} pointerEvents="none">
              {item.faces!.map((_, i) => (
                <View key={i} style={{ width: 7, height: 7, transform: [{ rotate: '45deg' }], backgroundColor: i === faceIndex ? Rune.red : 'rgba(147,142,136,0.55)' }} />
              ))}
            </Animated.View>
          ) : null}
        </View>
      </GestureDetector>
    </Animated.View>
  );
});

export interface StraightCarouselHandle {
  /** Close the focused card if one is open; returns whether it was (so a device-back can consume). */
  closeIfFullscreen: () => boolean;
  /** Spring the deck to center on `index` (e.g. after the Random button picks a card). Closes a
   *  focused card first so the recenter reads. */
  scrollTo: (index: number) => void;
  /** v0.14.0: the LIVE centered index, read straight off the deck position at call time. `onIndexChange`
   *  is a mirror that lags (it is suppressed while the gear grinds, and React commits a frame later), so
   *  anything that COMMITS a choice must resolve the card through this — never through the mirror. */
  centerIndex: () => number;
}

export const StraightCarousel = forwardRef<
  StraightCarouselHandle,
  {
    items: StraightItem[];
    selectedIds: string[];
    initialIndex?: number;
    /** Fires per detent; the PARENT owns the select controls (they live on the screen's top layer,
     *  above every veil — #106) and needs the center index to act on the right card. */
    onIndexChange?: (i: number) => void;
    /** Mixed ancestry (#265): card id → which trait (1|2) to strike through. */
    crossOuts?: Record<string, 1 | 2>;
    /** v0.23.0: dp of rail height reserved at the BOTTOM for the parent's select controls. The rest
     *  position is a fraction of the rail, so without this the centred card -- which is the largest
     *  one -- grew down into the buttons and overlapped them. Reserving the band makes the card
     *  centre itself in the space that is actually free. */
    reserveBottom?: number;
  }
>(function StraightCarousel({ items, selectedIds, initialIndex = 0, onIndexChange, crossOuts, reserveBottom = 0 }, ref) {
  const count = items.length;
  /**
   * v0.27.3: the deck, read through a ref so the GESTURES never re-identify.
   *
   * `items` is a fresh array every time a card finishes forging, and `center` changes on every
   * detent. `flip` closed over both, `onTapCard` closed over `flip`, and the master `Pan` closed over
   * `onTapCard` -- so the whole gesture graph was rebuilt roughly ninety times during a first
   * creation and again on every card you scrolled past. Two costs, and the second is the bad one:
   *
   *   - every mounted Slot got a new `onTap`, defeating its `memo` and rebuilding its `Gesture.Tap`,
   *     which is the per-detent stutter;
   *   - swapping the Pan handler MID-DRAG means the outgoing one never sees `onEnd` or `onFinalize`,
   *     so `grind` was left latched above the 0.05 threshold that freezes index publication below.
   *     A frozen index is exactly the reported break: the centred card keeps its low-res thumb
   *     because `center` never advances, and the parent's mirror goes stale so SELECT and RANDOM act
   *     on the wrong card. It never recovers, because nothing else unwinds `grind`. This is the same
   *     failure the v0.14.0 note further down describes, arriving by a route that fix never covered.
   *
   * Reading through a ref is one frame fresher than the old closure, never staler.
   */
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const insets = useScreenInsets();
  const { height: screenH } = useLayout();
  const railRef = useRef<View>(null);
  const [width, setWidth] = useState(0);
  const heightSV = useSharedValue(0);
  const railHSV = useSharedValue(0);
  const railTopWin = useSharedValue(insets.top + 200); // sane default until measured
  const pos = useSharedValue(clampIdx(initialIndex, count));
  const grind = useSharedValue(0);
  const fs = useSharedValue(0);
  const focusIdx = useSharedValue(clampIdx(initialIndex, count));
  const startPos = useSharedValue(0);
  const padTouch = useSharedValue(false);
  const scrolled = useSharedValue(false);
  // #258: gear swoosh tracking (fast direction-reversal only)
  const gearPrevTX = useSharedValue(0);
  const gearDirX = useSharedValue(0);
  const gearPipIdx = useSharedValue(0); // #258r2: last detent seen while grinding (for the pip)
  const lastCenter = useSharedValue(clampIdx(initialIndex, count));
  const [center, setCenter] = useState(() => Math.min(count - 1, Math.max(0, initialIndex)));
  /**
   * Which slots are actually mounted (v0.27.1).
   *
   * Every card in the deck used to be mounted at once, and a deck is up to eighty domain cards, each
   * one an animated view with its own gesture detector and card body. Changing section therefore
   * mounted the lot in a single commit, which is the stutter you feel when the step changes.
   *
   * At most a dozen are ever visible: the slot's own visibility window fades everything past about
   * six out either side. So the rest are mounted for nothing.
   *
   * The window follows a COARSE bucket of the scroll position rather than the settled centre. The
   * settled centre deliberately stops updating while the gear grinds, to keep that fast scroll off
   * the JS thread entirely, and a window that froze with it would leave the cards you were grinding
   * past unmounted. A bucket of eight costs one cheap state update per eight cards instead of one per
   * card, and stays well ahead of what is on screen.
   */
  const [winCentre, setWinCentre] = useState(() => clampIdx(initialIndex, count));
  useAnimatedReaction(
    () => Math.round(pos.value / WIN_BUCKET),
    (bucket: number, prev: number | null) => {
      if (bucket !== prev) runOnJS(setWinCentre)(bucket * WIN_BUCKET);
    },
    [],
  );
  const [fsOpen, setFsOpen] = useState(false);
  // Flip-deck paging (#110): the focused card's current face, and the last turn direction so the
  // flip spins the way the tap implied (left = back, right = forward).
  const [faceIdx, setFaceIdx] = useState(0);
  const flipDir = useRef(1);
  const flipBusy = useRef(false); // a flip can't start until the previous one settles (#121)

  const onCenter = useCallback(
    (c: number) => {
      setCenter(c);
      setFaceIdx(0); // a NEW card centered → start at its face 0 (page persists through focus/close)
      playSfx('carouselScroll'); // #258: scroll pip, like the sheet carousel
      onIndexChange?.(c);
    },
    [onIndexChange],
  );
  // On mount (and on each deck remount via the key) tell the parent where we START (#150: decks
  // open centered on the middle card) so the SELECT controls target it.
  useEffect(() => {
    onIndexChange?.(clampIdx(initialIndex, count));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useDerivedValue(() => {
    if (grind.value > 0.05) return; // same freeze rule as the sheet (#78)
    const c = clampIdx(Math.round(pos.value), count);
    if (c !== lastCenter.value) {
      lastCenter.value = c;
      runOnJS(onCenter)(c);
    }
  });

  const setFsOpenJS = useCallback((open: boolean) => setFsOpen(open), []);
  const closeFs = useCallback(() => {
    fs.value = withSpring(0, FS_SPRING);
    setFsOpen(false);
    // page is NOT reset (#110, owner): the card collapses showing whatever face you left it on
  }, [fs]);

  // Flip the focused card to the next/previous face (#110), wrapping. dir drives the turn direction.
  // Locked: ignored until the running flip settles, so a fast double-tap can't interrupt it (#121).
  const flip = useCallback(
    (delta: number) => {
      if (flipBusy.current) return;
      const n = itemsRef.current[clampIdx(Math.round(pos.value), count)]?.faces?.length ?? 0;
      if (n <= 1) return;
      flipBusy.current = true;
      flipDir.current = delta;
      playSfx('gearScroll2', { volume: PAGE_FLIP_VOLUME }); // #258: quiet gear swoosh on page flip
      setFaceIdx((i) => (i + delta + n) % n);
    },
    [pos, count],
  );
  const onFlipSettle = useCallback(() => {
    flipBusy.current = false;
  }, []);

  // Device-back / parent close hook (#108): consume the back press when a card is focused.
  useImperativeHandle(
    ref,
    () => ({
      closeIfFullscreen: () => {
        if (fsOpen) {
          closeFs();
          return true;
        }
        return false;
      },
      scrollTo: (index: number) => {
        if (fsOpen) closeFs();
        pos.value = withSpring(clampIdx(index, count), SNAP_SPRING);
      },
      centerIndex: () => clampIdx(Math.round(pos.value), count),
    }),
    [fsOpen, closeFs, pos, count],
  );

  const onTapCard = useCallback(
    (index: number, x: number) => {
      if (fs.value > 0.5) {
        // Focused: an interactive card (#128 gold) keeps its own taps — close it by swipe/veil only.
        // A multi-face card flips (left half = back, right half = forward). Else tap closes.
        if (itemsRef.current[index]?.interactive) return;
        const n = itemsRef.current[index]?.faces?.length ?? 0;
        if (n > 1) {
          flip(x < FORGED_W / 2 ? -1 : 1);
          return;
        }
        closeFs();
        return;
      }
      if (Math.abs(index - pos.value) < 0.5) {
        // open on whatever face this card was left on (no reset)
        focusIdx.value = index;
        fs.value = withSpring(1, FS_SPRING);
        setFsOpenJS(true);
      } else {
        pos.value = withSpring(clampIdx(index, count), SNAP_SPRING);
      }
    },
    [fs, pos, focusIdx, count, closeFs, setFsOpenJS, flip],
  );

  // gear pad: bottom strip; grinding sweeps the whole deck across ~GEAR_SWIPE_L px, straight.
  const gearRatio = GEAR_SWIPE_L / Math.max(1, count - 1);
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(2)
        .onBegin((e) => {
          cancelAnimation(pos);
          startPos.value = pos.value;
          scrolled.value = false;
          // The gear is INERT while a card is focused (#104: fullscreen taps were grinding it).
          padTouch.value = fs.value < 0.5 && heightSV.value > 0 && e.y > heightSV.value - 72;
          // Self-heal (v0.27.3): a grind that is still wound up as a NEW touch begins away from the
          // gear pad is left over from a gesture that never finalized. Left alone it freezes index
          // publication for good. Nothing legitimately holds it up across touches, so unwind it.
          if (!padTouch.value && grind.value !== 0) grind.value = withTiming(0, { duration: 120 });
          if (padTouch.value) {
            grind.value = withTiming(1, { duration: 160 });
            gearPrevTX.value = 0; // #258: reset swoosh tracking for the new grind
            gearDirX.value = 0;
            gearPipIdx.value = Math.round(pos.value);
          }
        })
        .onUpdate((e) => {
          if (fs.value > 0.5) return;
          scrolled.value = true;
          if (padTouch.value) {
            // #258: gear swoosh on a fast direction-reversal
            const dtx = e.translationX - gearPrevTX.value;
            gearPrevTX.value = e.translationX;
            if (Math.abs(dtx) > GEAR_FAST_FLIP_PX) {
              const d = dtx > 0 ? 1 : -1;
              if (d !== gearDirX.value) {
                gearDirX.value = d;
                runOnJS(playGearGrind)();
              }
            }
          }
          const ratio = padTouch.value ? gearRatio : SPACING;
          const raw = startPos.value - e.translationX / ratio;
          const max = count - 1;
          pos.value = raw < 0 ? raw * OVERSCROLL_RESIST : raw > max ? max + (raw - max) * OVERSCROLL_RESIST : raw;
          if (padTouch.value) {
            // #258r2: per-detent scroll pip while grinding (quieter)
            const pip = Math.round(pos.value);
            if (pip !== gearPipIdx.value && pip >= 0 && pip <= max) {
              gearPipIdx.value = pip;
              runOnJS(playGearPip)();
            }
          }
        })
        .onEnd((e) => {
          if (fs.value > 0.5) {
            // Focused gestures (#110): a horizontal swipe pages a multi-face card (left = next,
            // right = back); a downward swipe closes. flip() no-ops on single-face cards.
            const ax = Math.abs(e.translationX);
            const ay = Math.abs(e.translationY);
            if (ax > 44 && ax > ay * 1.2) {
              runOnJS(flip)(e.translationX < 0 ? 1 : -1);
              return;
            }
            if (e.translationY > 60 || e.velocityY > 600) runOnJS(closeFs)();
            return;
          }
          const ratio = padTouch.value ? gearRatio : SPACING;
          const v = Math.max(-MAX_FLING_VEL * 4, Math.min(MAX_FLING_VEL * 4, -e.velocityX / ratio));
          pos.value = withSpring(clampIdx(Math.round(pos.value + v * FLING_TIME), count), { ...SNAP_SPRING, velocity: v });
          if (padTouch.value) grind.value = withTiming(0, { duration: 220 });
          padTouch.value = false;
        })
        .onFinalize(() => {
          // v0.14.0: ALWAYS unwind the grind here. The old `&& !scrolled.value` guard left an uncovered
          // quadrant — a gear-strip drag that moved and was then CANCELLED (onEnd never ran) latched
          // `grind` above the 0.05 freeze threshold forever, which silently froze index publication in
          // the mapper below and made the parent's centered-card mirror go stale (the level-up
          // "picked a different domain card" bug). Nothing depends on the value surviving finalize.
          if (grind.value !== 0) grind.value = withTiming(0, { duration: 220 });
          padTouch.value = false;
        }),
    [count, gearRatio, pos, grind, fs, startPos, padTouch, scrolled, gearPrevTX, gearDirX, gearPipIdx, closeFs, heightSV, flip],
  );

  const veil = useAnimatedStyle(() => ({ opacity: fs.value * 0.86 }));
  // v0.24.1: declare it so the tablet margins darken with the screen (lib/screen-dim).
  useScreenDim(fsOpen ? 0.86 : 0);
  // The gear grinds with the deck (#110): rotation tracks pos linearly, so every detent turns it;
  // the fast-grind drag moves pos far more px-per-step, so it naturally spins faster while used.
  const gearStyle = useAnimatedStyle(() => ({ opacity: 0.5 + 0.5 * grind.value, transform: [{ rotate: `${pos.value * GEAR_DEG_PER_STEP}deg` }] }));

  return (
    <View
      style={{ flex: 1 }}
      onLayout={(e) => {
        setWidth(e.nativeEvent.layout.width);
        heightSV.value = e.nativeEvent.layout.height;
      }}>
      <GestureDetector gesture={pan}>
        <View style={{ flex: 1 }}>
          {/* the rail */}
          <View
            ref={railRef}
            style={{ flex: 1, marginBottom: reserveBottom }}
            onLayout={(e) => {
              railHSV.value = e.nativeEvent.layout.height;
              // measure the rail's absolute window Y so the fullscreen target lands at a
              // screen-anchored spot (the rail itself starts below the header, #108)
              railRef.current?.measureInWindow((_x, y) => {
                if (y > 0) railTopWin.value = y;
              });
            }}>
            {/* the gear rides the bottom edge BEHIND the dim now (#110, owner): NOT hidden in
                fullscreen — the rising dim fades it down and the focused card sits above it.
                zIndex 199 keeps it above the rail cards (~100, peeks as before) but UNDER the dim
                (200) so fullscreen fades it down. */}
            <View style={{ position: 'absolute', left: -18, right: -18, bottom: 0, height: 36, overflow: 'hidden', alignItems: 'center', zIndex: 199 }} pointerEvents="none">
              <Animated.View style={[{ width: 150, height: 150 }, gearStyle]}>
                <ArtImage source={INNER_GEAR} fit="contain" />
              </Animated.View>
            </View>
            {/* fullscreen dim — ALWAYS mounted; opacity rides fs so it FADES in/out (no pop when the
                dialogue closes and the rail cards return). Oversized past the rail to cover
                header/tabs/everything; sits between the focused card (z300) and the rest (z<200). */}
            <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -480, bottom: -160, left: -60, right: -60, zIndex: 200, backgroundColor: '#06080d' }, veil]} />
            {/* tap-to-close catcher, only while open (above the dim, below the focused card) */}
            {fsOpen ? (
              <Pressable style={{ position: 'absolute', top: -480, bottom: -160, left: -60, right: -60, zIndex: 201 }} onPress={closeFs} accessibilityRole="button" accessibilityLabel="Close card" />
            ) : null}
            {width > 0
              ? items.map((item, i) =>
                  Math.abs(i - winCentre) > WIN_HALF ? null : (
                  <Slot
                    key={item.id}
                    index={i}
                    item={item}
                    count={count}
                    width={width}
                    pos={pos}
                    grind={grind}
                    fs={fs}
                    focusIdx={focusIdx}
                    railH={railHSV}
                    railTopWin={railTopWin}
                    insetTop={insets.top}
                    screenH={screenH}
                    selected={selectedIds.includes(item.id)}
                    crossTrait={crossOuts?.[item.id]}
                    withImage={Math.abs(i - center) <= IMG_HALF}
                    focused={fsOpen && i === center}
                    isCenter={i === center}
                    faceIndex={faceIdx}
                    flipDir={flipDir.current}
                    onFlipSettle={onFlipSettle}
                    onTap={onTapCard}
                  />
                  ),
                )
              : null}
          </View>
        </View>
      </GestureDetector>
    </View>
  );
});
