import { memo, type ReactNode, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
import Svg, { Polygon, Polyline } from 'react-native-svg';

import { ArtImage } from '@/components/art-image';
import { RuneButton } from '@/components/rune-button';
import { Body, Rune } from '@/constants/theme';
import { MAX_FLING_VEL, FLING_TIME, OVERSCROLL_RESIST, SNAP_SPRING, FS_SPRING } from '@/features/character-sheet/carousel-geometry';
import { FORGED_H, FORGED_W } from './forged-card';

// The sheet's inner gear (U3) — here it IS the fast-scroll control, riding the bottom edge.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const INNER_GEAR = require('../../../assets/art/gears/raster/U3.png') as number;

/**
 * The forge's STRAIGHT carousel (#102): the sheet hand's feel — 1:1 pan, predicted-detent spring
 * release, two-LOD cards, grow-in-place fullscreen, gear grind — laid out on a straight line for
 * picking cards while reading them. Always expanded (no compact state); selection controls live
 * where the sheet keeps its gear, plus above the card in fullscreen.
 */

export interface StraightItem {
  id: string;
  /** Printed card pair (catalog cards)... */
  thumb?: number;
  source?: number;
  /** ...or a FORGED card rendered live (cheaper than a thumb; no LOD pair needed). */
  custom?: ReactNode;
  label?: string;
}

const SPACING = 148; // px between detents
const CARD_SCALE = 0.74; // center card: 230x322 authored -> ~170x238 on screen
const SIDE_FALLOFF = 0.085; // per-step shrink
const GRIND_TIGHTEN_L = 0.52; // straight-line grind: tighter…
const GRIND_SHRINK_L = 0.45; // …and smaller, never curved
const GEAR_SWIPE_L = 200; // grind: this many px sweep the whole deck
const IMG_HALF = 2;

function clampIdx(i: number, count: number): number {
  'worklet';
  return Math.min(count - 1, Math.max(0, i));
}

interface SlotProps {
  index: number;
  item: StraightItem;
  count: number;
  width: number;
  pos: SharedValue<number>;
  grind: SharedValue<number>;
  fs: SharedValue<number>;
  focusIdx: SharedValue<number>;
  selected: boolean;
  withImage: boolean;
  onTap: (index: number) => void;
}

const Slot = memo(function Slot({ index, item, count, width, pos, grind, fs, focusIdx, selected, withImage, onTap }: SlotProps) {
  const style = useAnimatedStyle(() => {
    const g = grind.value;
    const d = index - pos.value;
    const ad = Math.abs(d);
    let x = d * SPACING * (1 - GRIND_TIGHTEN_L * g);
    let scale = CARD_SCALE * (1 - Math.min(ad, 3.4) * SIDE_FALLOFF) * (1 - GRIND_SHRINK_L * g);
    let y = 0;
    // visibility window: solid then a quick fade band; widens while grinding
    const cut = 2.9 + 2.6 * g;
    let opacity = Math.min(1, Math.max(0, (cut - ad) / 0.45));
    let z = Math.round(100 - ad * 10);
    const f = fs.value;
    if (f > 0 && Math.round(focusIdx.value) === index) {
      // grow in place toward the stage center (the overlay owns the veil + controls)
      const fsScale = Math.min((width - 28) / FORGED_W, 1.55);
      x = x * (1 - f);
      y = -34 * f;
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

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(260)
        .onEnd(() => {
          runOnJS(onTap)(index);
        }),
    [index, onTap],
  );

  return (
    <Animated.View style={[{ position: 'absolute', left: width / 2 - FORGED_W / 2, top: '42%', marginTop: -FORGED_H / 2, width: FORGED_W, height: FORGED_H }, style]}>
      <GestureDetector gesture={tap}>
        <View style={{ flex: 1 }}>
          {item.custom ? (
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
        </View>
      </GestureDetector>
    </Animated.View>
  );
});

export function StraightCarousel({
  items,
  selectedIds,
  maxSelect,
  onToggle,
  initialIndex = 0,
  onIndexChange,
  selectNoun,
}: {
  items: StraightItem[];
  selectedIds: string[];
  maxSelect: number;
  onToggle: (id: string) => void;
  initialIndex?: number;
  onIndexChange?: (i: number) => void;
  /** e.g. "class" — used in the control labels + a11y. */
  selectNoun: string;
}) {
  const count = items.length;
  const [width, setWidth] = useState(0);
  const heightSV = useSharedValue(0);
  const pos = useSharedValue(clampIdx(initialIndex, count));
  const grind = useSharedValue(0);
  const fs = useSharedValue(0);
  const focusIdx = useSharedValue(clampIdx(initialIndex, count));
  const startPos = useSharedValue(0);
  const padTouch = useSharedValue(false);
  const scrolled = useSharedValue(false);
  const lastCenter = useSharedValue(clampIdx(initialIndex, count));
  const [center, setCenter] = useState(() => Math.min(count - 1, Math.max(0, initialIndex)));
  const [fsOpen, setFsOpen] = useState(false);

  const onCenter = useCallback(
    (c: number) => {
      setCenter(c);
      onIndexChange?.(c);
    },
    [onIndexChange],
  );
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
  }, [fs]);

  const onTapCard = useCallback(
    (index: number) => {
      if (fs.value > 0.5) {
        closeFs();
        return;
      }
      if (Math.abs(index - pos.value) < 0.5) {
        focusIdx.value = index;
        fs.value = withSpring(1, FS_SPRING);
        setFsOpenJS(true);
      } else {
        pos.value = withSpring(clampIdx(index, count), SNAP_SPRING);
      }
    },
    [fs, pos, focusIdx, count, closeFs, setFsOpenJS],
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
          padTouch.value = heightSV.value > 0 && e.y > heightSV.value - 72; // bottom strip = the gear
          if (padTouch.value) grind.value = withTiming(1, { duration: 160 });
        })
        .onUpdate((e) => {
          if (fs.value > 0.5) return;
          scrolled.value = true;
          const ratio = padTouch.value ? gearRatio : SPACING;
          const raw = startPos.value - e.translationX / ratio;
          const max = count - 1;
          pos.value = raw < 0 ? raw * OVERSCROLL_RESIST : raw > max ? max + (raw - max) * OVERSCROLL_RESIST : raw;
        })
        .onEnd((e) => {
          if (fs.value > 0.5) {
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
          if (grind.value !== 0 && !scrolled.value) grind.value = withTiming(0, { duration: 220 });
          padTouch.value = false;
        }),
    [count, gearRatio, pos, grind, fs, startPos, padTouch, scrolled, closeFs, heightSV],
  );

  const veil = useAnimatedStyle(() => ({ opacity: fs.value * 0.86 }));
  const gearStyle = useAnimatedStyle(() => ({ opacity: 0.5 + 0.5 * grind.value }));

  const centerItem = items[center];
  const centerSelected = !!centerItem && selectedIds.includes(centerItem.id);
  const full = selectedIds.length >= maxSelect;

  const selectControls = (compact: boolean) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <Text style={{ color: full ? Rune.goldBright : Rune.muted, fontSize: 11, fontFamily: Body.bold, letterSpacing: 1.2 }}>
        {selectedIds.length}/{maxSelect}
      </Text>
      <RuneButton
        label={centerSelected ? 'Deselect' : `Select ${selectNoun}`}
        kind={centerSelected ? 'ghost' : 'primary'}
        height={compact ? 36 : 40}
        onPress={() => centerItem && onToggle(centerItem.id)}
        accessibilityLabel={centerSelected ? `Deselect ${centerItem?.label ?? selectNoun}` : `Select ${centerItem?.label ?? selectNoun}`}
      />
    </View>
  );

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
          <View style={{ flex: 1 }}>
            {/* fullscreen veil sits between the focused card (z 300) and the rest */}
            {fsOpen ? (
              <Pressable style={[StyleSheet.absoluteFill, { zIndex: 200 }]} onPress={closeFs} accessibilityRole="button" accessibilityLabel="Close card">
                <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#06080d' }, veil]} />
              </Pressable>
            ) : null}
            {width > 0
              ? items.map((item, i) => (
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
                    selected={selectedIds.includes(item.id)}
                    withImage={Math.abs(i - center) <= IMG_HALF}
                    onTap={onTapCard}
                  />
                ))
              : null}
            {/* fullscreen controls — ABOVE the card, not over it */}
            {fsOpen ? (
              <View style={{ position: 'absolute', top: 2, left: 0, right: 0, zIndex: 400, alignItems: 'center' }}>{selectControls(true)}</View>
            ) : null}
          </View>
          {/* below the rail: count + select; the gear rides the bottom edge for the fast grind */}
          <View style={{ paddingTop: 6, paddingBottom: 2 }}>{selectControls(false)}</View>
          {/* only the gear's crown peeks over the bottom edge — IN FRONT of the screen border
              (the create screen lifts its content above the frame). Drag it for the fast grind. */}
          <View style={{ alignItems: 'center', height: 36, overflow: 'hidden' }} pointerEvents="none">
            <Animated.View style={[{ width: 150, height: 150 }, gearStyle]}>
              <ArtImage source={INNER_GEAR} fit="contain" />
            </Animated.View>
          </View>
        </View>
      </GestureDetector>
    </View>
  );
}
