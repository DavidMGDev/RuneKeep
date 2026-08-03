import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, runOnJS, type SharedValue, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { useStageScale } from '@/components/design-stage';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { FLING_TIME, MAX_FLING_VEL, SNAP_SPRING } from '@/features/character-sheet/carousel-geometry';
import { useFrame } from '@/hooks/use-layout';
import { hexToHsl, nearestColorName, nearestShadeIndex, normalizeHex, randomShade, readableInk, shadesForHue } from '@/lib/color';
import { playSfx } from '@/lib/sfx';

/**
 * The colour picker (v0.34.4) — a hue, then an endless carousel of that hue's shades.
 *
 * v0.34.3 offered a fixed grid of forty swatches, and the owner's verdict was that it was an
 * assortment of colours rather than a picker, which it was. You cannot ask a grid for "that blue, but
 * two shades darker": it either has the square or it does not.
 *
 * So the choice is split in two, the way a real picker splits it. A thick hue bar across the top says
 * WHICH colour, and the carousel underneath says WHICH ONE OF IT, endlessly, seventy squares per hue.
 * The hex field reads and writes the centred square, and typing into it moves both.
 *
 * ## Why the carousel is written here and not reused
 *
 * The motion IS the sheet's: the same 1:1 pan, the same predicted-detent release
 * (`pos + velocity * FLING_TIME`), the same `SNAP_SPRING`, and a per-slot falloff on scale and
 * opacity. What is NOT reused is `StraightCarousel` itself, which carries a gear, a fullscreen grow,
 * a flip-deck, two-LOD art and a mount window: every one of those is a card affordance, and the owner
 * asked for squares and no golden gears. Reusing the constants gets the feel; reusing the component
 * would mean deleting most of it on the way past.
 *
 * And this one WRAPS, which that one deliberately does not: a deck has a first and last card, and a
 * colour wheel has neither. Wrapping is what lets `pos` run unbounded and the slots index modulo.
 */

/** Distance between detents, in design px. The squares are smaller than cards, so the step is too. */
const SPACING = 74;
const SQUARE = 62;
/** How many squares are drawn either side of the centre. Six is a screen's worth at this spacing. */
const VISIBLE_HALF = 4;
const SIDE_FALLOFF = 0.1;
const HUE_H = 26;
const PANEL_W = 300;

const mod = (n: number, m: number) => {
  'worklet';
  return ((n % m) + m) % m;
};

/** One square. Its colour comes from the WRAPPED index, so a slot is reused all the way round. */
const Swatch = memo(function Swatch({ offset, pos, shades, count }: { offset: number; pos: SharedValue<number>; shades: string[]; count: number }) {
  /**
   * Which shade this slot is currently showing.
   *
   * A slot holds a fixed OFFSET from the centre, not a fixed colour: as `pos` moves, the slot at +4
   * becomes the next colour along. That is what makes the carousel endless with eleven mounted views
   * instead of seventy, and it is the same trick the sheet's window does, minus the unmounting.
   */
  const [idx, setIdx] = useState(() => mod(Math.round(pos.value) + offset, count));
  useAnimatedReaction(
    () => mod(Math.round(pos.value) + offset, count),
    (next: number, prev: number | null) => {
      if (next !== prev) runOnJS(setIdx)(next);
    },
    [offset, count],
  );

  const style = useAnimatedStyle(() => {
    const d = Math.round(pos.value) + offset - pos.value;
    const ad = Math.abs(d);
    return {
      transform: [{ translateX: d * SPACING }, { scale: 1 - Math.min(ad, 4) * SIDE_FALLOFF }],
      opacity: Math.min(1, Math.max(0, (VISIBLE_HALF + 0.6 - ad) / 0.8)),
      zIndex: Math.round(100 - ad * 10),
    };
  });
  /** The name rides the CENTRED square only, and fades with how centred it is. */
  const nameStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - Math.abs(Math.round(pos.value) + offset - pos.value) * 3) }));

  const hex = shades[idx] ?? shades[0];
  return (
    <Animated.View style={[{ position: 'absolute', left: '50%', marginLeft: -SQUARE / 2, top: 0, width: SQUARE, height: SQUARE, backgroundColor: hex, borderWidth: 1, borderColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 3 }, style]}>
      {offset === 0 ? (
        <Animated.Text numberOfLines={2} style={[{ color: readableInk(hex), fontSize: 9, fontFamily: Body.bold, textAlign: 'center', lineHeight: 11 }, nameStyle]}>
          {nearestColorName(hex)}
        </Animated.Text>
      ) : null}
    </Animated.View>
  );
});

/** The endless shade rail. `onSettle` fires once per detent, with the colour now in the middle. */
function ShadeCarousel({ shades, startIndex, onSettle }: { shades: string[]; startIndex: number; onSettle: (hex: string, index: number) => void }) {
  const count = shades.length;
  const pos = useSharedValue(startIndex);
  const start = useSharedValue(0);
  const last = useSharedValue(startIndex);
  /**
   * Gesture translations arrive in screen px on web, design px on a phone (v0.31.0's trap, twice
   * bitten). The stage scale is an ancestor of the target, so gesture-handler does not divide it out.
   */
  const stage = useStageScale();
  const frame = useFrame();
  const coordScale = Platform.OS === 'web' ? (stage || 1) * (frame.scale || 1) : 1;

  // Re-centre when the hue changes under us, or when a typed hex lands on a different square.
  useEffect(() => {
    cancelAnimation(pos);
    pos.value = withSpring(startIndex, SNAP_SPRING);
    last.value = startIndex;
  }, [startIndex, pos, last]);

  const settle = useCallback(
    (i: number) => {
      playSfx('carouselScroll');
      onSettle(shades[i] ?? shades[0], i);
    },
    [onSettle, shades],
  );

  useAnimatedReaction(
    () => mod(Math.round(pos.value), count),
    (i: number, prev: number | null) => {
      if (prev != null && i !== prev) runOnJS(settle)(i);
    },
    [count, settle],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(2)
        .onBegin(() => {
          cancelAnimation(pos);
          start.value = pos.value;
        })
        .onUpdate((e) => {
          // 1:1 with the finger, exactly as the deck is. No clamp: this wheel has no ends.
          pos.value = start.value - e.translationX / coordScale / SPACING;
        })
        .onEnd((e) => {
          const v = Math.max(-MAX_FLING_VEL * 4, Math.min(MAX_FLING_VEL * 4, -e.velocityX / coordScale / SPACING));
          pos.value = withSpring(Math.round(pos.value + v * FLING_TIME), { ...SNAP_SPRING, velocity: v });
        })
        .onFinalize((_e, ok) => {
          // A tap never activates the pan, so without this a click leaves the rail between detents.
          if (!ok) pos.value = withSpring(Math.round(pos.value), SNAP_SPRING);
        }),
    [pos, start, coordScale],
  );

  const slots = useMemo(() => Array.from({ length: VISIBLE_HALF * 2 + 1 }, (_, i) => i - VISIBLE_HALF), []);

  return (
    <GestureDetector gesture={pan}>
      <View style={{ height: SQUARE + 10, marginHorizontal: -14, overflow: 'hidden', justifyContent: 'center' }}>
        <View style={{ height: SQUARE }}>
          {slots.map((o) => (
            <Swatch key={o} offset={o} pos={pos} shades={shades} count={count} />
          ))}
        </View>
        {/* The centre marks itself, so it is obvious which square the hex belongs to. */}
        <View pointerEvents="none" style={{ position: 'absolute', left: '50%', marginLeft: -(SQUARE + 8) / 2, top: 0, bottom: 0, width: SQUARE + 8, borderWidth: 1.4, borderColor: Rune.goldBright, zIndex: 200 }} />
      </View>
    </GestureDetector>
  );
}

/** The hue bar: a real spectrum, dragged anywhere along its length. */
function HueBar({ hue, onHue }: { hue: number; onHue: (h: number) => void }) {
  const [w, setW] = useState(0);
  const stage = useStageScale();
  const frame = useFrame();
  const coordScale = Platform.OS === 'web' ? (stage || 1) * (frame.scale || 1) : 1;
  const set = useCallback((x: number) => onHue(Math.min(359, Math.max(0, Math.round((x / Math.max(1, w)) * 359)))), [onHue, w]);
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin((e) => runOnJS(set)(e.x / coordScale))
        .onUpdate((e) => runOnJS(set)(e.x / coordScale)),
    [set, coordScale],
  );
  const stops = [0, 60, 120, 180, 240, 300, 360].map((h) => ({ h, at: h / 360 }));
  return (
    <GestureDetector gesture={pan}>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: HUE_H, justifyContent: 'center' }} accessibilityRole="adjustable" accessibilityLabel="Hue" accessibilityValue={{ now: hue, min: 0, max: 359 }}>
        <Svg width="100%" height={HUE_H}>
          <Defs>
            <LinearGradient id="hue" x1="0" y1="0" x2="1" y2="0">
              {stops.map((s) => (
                <Stop key={s.h} offset={s.at} stopColor={`hsl(${s.h}, 100%, 50%)`} />
              ))}
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width="100%" height={HUE_H} fill="url(#hue)" />
        </Svg>
        {w > 0 ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: (hue / 359) * w - 3, top: -2, width: 6, height: HUE_H + 4, borderWidth: 1.6, borderColor: Rune.ivory, backgroundColor: 'transparent' }} />
        ) : null}
      </View>
    </GestureDetector>
  );
}

export function ColorPalette({
  title,
  current,
  onPick,
  allowRandom,
  onClose,
}: {
  title: string;
  /** The colour in use. The picker opens on it, hue and all. */
  current?: string | null;
  onPick: (color: string) => void;
  /** Offer the dice. It rolls INSIDE the picker, moving the hue and the rail onto what it rolled,
   *  so a random is still something you see before you take it. */
  allowRandom?: boolean;
  onClose: () => void;
}) {
  const opening = useMemo(() => normalizeHex(current ?? '') ?? '#4682b4', [current]);
  const [hue, setHue] = useState(() => Math.round(hexToHsl(opening).h));
  const shades = useMemo(() => shadesForHue(hue), [hue]);
  /** Which square the rail should be centred on. Changed by the hue bar, the hex field and the dice. */
  const [aim, setAim] = useState(() => nearestShadeIndex(shadesForHue(Math.round(hexToHsl(opening).h)), opening));
  const [hex, setHex] = useState(() => shadesForHue(Math.round(hexToHsl(opening).h))[nearestShadeIndex(shadesForHue(Math.round(hexToHsl(opening).h)), opening)]);
  /** What the field shows while it is being typed in, which is not always a colour yet. */
  const [typed, setTyped] = useState<string | null>(null);
  const hueRef = useRef(hue);
  hueRef.current = hue;

  /** Moving the hue keeps the SHADE you were on, so walking the spectrum compares like with like. */
  const onHue = useCallback((h: number) => {
    if (h === hueRef.current) return;
    setHue(h);
    setHex((prev) => shadesForHue(h)[nearestShadeIndex(shadesForHue(hueRef.current), prev)]);
  }, []);

  const onSettle = useCallback((next: string) => {
    setHex(next);
    setTyped(null);
  }, []);

  /** A typed hex moves the hue AND the rail, and the picker keeps the nearest square it can offer. */
  const commitTyped = useCallback(() => {
    const parsed = normalizeHex(typed ?? '');
    setTyped(null);
    if (!parsed) return;
    const h = Math.round(hexToHsl(parsed).h);
    const list = shadesForHue(h);
    const i = nearestShadeIndex(list, parsed);
    setHue(h);
    setAim(i);
    setHex(list[i]);
  }, [typed]);

  const roll = useCallback(() => {
    const r = randomShade();
    playSfx('tokenCopyColor');
    setHue(r.hue);
    setAim(r.index);
    setHex(r.hex);
  }, []);

  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 10020 }}>
      <Pressable style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,8,13,0.92)' }} onPress={onClose} accessibilityRole="button" accessibilityLabel={`Close ${title.toLowerCase()}`} />
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.5} style={{ width: PANEL_W, maxWidth: '94%', paddingHorizontal: 14, paddingVertical: 14 }}>
        <Text style={{ color: Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 }}>{title}</Text>

        {/* Hex in, hex out. The only notation the owner asked for, so the only one offered. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <ChamferBox chamfer={7} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ flex: 1, height: 40, justifyContent: 'center', paddingHorizontal: 11 }}>
            <TextInput
              value={typed ?? hex}
              onChangeText={setTyped}
              onBlur={commitTyped}
              onSubmitEditing={commitTyped}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={7}
              returnKeyType="done"
              selectionColor={Rune.goldBright}
              placeholder="#000000"
              placeholderTextColor={Rune.muted}
              accessibilityLabel="Hex colour"
              style={{ color: Rune.sheet, fontSize: 15, fontFamily: Display.bold, letterSpacing: 1, padding: 0 }}
            />
          </ChamferBox>
          <View style={{ width: 40, height: 40, backgroundColor: hex, borderWidth: 1.4, borderColor: Rune.goldEdge }} />
        </View>

        <HueBar hue={hue} onHue={onHue} />

        <View style={{ marginTop: 12 }}>
          <ShadeCarousel shades={shades} startIndex={aim} onSettle={onSettle} />
        </View>

        <View style={{ marginTop: 12, gap: 8 }}>
          {allowRandom ? <RuneButton label="Surprise me" kind="ghost" dense height={36} onPress={roll} muteSfx /> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <RuneButton label="Cancel" kind="ghost" height={40} style={{ flex: 1 }} onPress={onClose} />
            <RuneButton label="Use this colour" kind="primary" height={40} style={{ flex: 1.4 }} onPress={() => onPick(hex)} />
          </View>
        </View>
      </ChamferBox>
    </View>
  );
}
