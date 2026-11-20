import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, type SharedValue, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

import { Body, Rune } from '@/constants/theme';
import { playSfx } from '@/lib/sfx';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { burn } from '@/lib/flames';

/** One tongue of flame, drawn in a 20 x 32 box, point up. */
const TONGUE = 'M10 0 C12 6 17 11 17 19 C17 26 14 31 10 31 C6 31 3 26 3 19 C3 14 6 11 7 7 C8 10 9 11 10 13 C10 9 9 5 10 0 Z';
/** The tongues along the button's top edge: where (0..1 across), how tall, and their rhythm. */
const TONGUES = [
  { at: 0.04, h: 0.5, ms: 620, delay: 0 },
  { at: 0.15, h: 0.8, ms: 540, delay: 180 },
  { at: 0.26, h: 0.62, ms: 700, delay: 90 },
  { at: 0.38, h: 0.95, ms: 580, delay: 260 },
  { at: 0.5, h: 0.72, ms: 660, delay: 40 },
  { at: 0.62, h: 1, ms: 520, delay: 210 },
  { at: 0.74, h: 0.66, ms: 640, delay: 120 },
  { at: 0.85, h: 0.85, ms: 600, delay: 300 },
  { at: 0.96, h: 0.5, ms: 680, delay: 150 },
];
const EMBERS = [
  { at: 0.28, ms: 1500, delay: 0 },
  { at: 0.55, ms: 1800, delay: 600 },
  { at: 0.74, ms: 1350, delay: 1100 },
  { at: 0.42, ms: 1650, delay: 1500 },
];

/**
 * The Forge button catching fire (v0.45.0, owner): once a hero is complete, flames lick up over the button's top
 * edge, embers drift off it and the heat glows and breathes, so a finished hero is impossible to miss. Heraldic
 * red at the root through ember orange to the app's gold at the tips. Still under reduced motion: a steady glow.
 */
export function ForgeFlames({ active, height, label, onPress, accessibilityLabel, minWidth, children }: { active: boolean; height: number; label: string; onPress: () => void; accessibilityLabel: string; minWidth?: number; children: ReactNode }) {
  // The web draws the whole button burning (a shader); a phone keeps the lighter drawn flames.
  if (Platform.OS === 'web' && active) return <FireButton height={height} label={label} onPress={onPress} accessibilityLabel={accessibilityLabel} minWidth={minWidth} fallback={<DrawnFlames active height={height}>{children}</DrawnFlames>} />;
  return <DrawnFlames active={active} height={height}>{children}</DrawnFlames>;
}

function DrawnFlames({ active, height, children }: { active: boolean; height: number; children: ReactNode }) {
  const reduced = useReducedMotion();
  const breathe = useSharedValue(0);
  const live = active && !reduced;
  useEffect(() => {
    if (!live) { cancelAnimation(breathe); breathe.value = 0; return; }
    breathe.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(breathe);
  }, [live, breathe]);
  const glow = useAnimatedStyle(() => ({ opacity: 0.55 + 0.45 * breathe.value, transform: [{ scale: 1 + 0.06 * breathe.value }] }));
  const pulse = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.025 * breathe.value }] }));
  if (!active) return <>{children}</>;
  const flameH = Math.round(height * 0.95);
  return (
    <View style={{ position: 'relative' }}>
      {/* the heat behind it all */}
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -18, right: -18, top: -height * 0.6, bottom: -height * 0.35 }, reduced ? { opacity: 0.7 } : glow]}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <Defs>
            <RadialGradient id="forgeHeat" cx="50%" cy="62%" rx="50%" ry="50%">
              <Stop offset="0" stopColor="#E8641E" stopOpacity={0.55} />
              <Stop offset="0.55" stopColor={Rune.red} stopOpacity={0.22} />
              <Stop offset="1" stopColor={Rune.red} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Path d="M0 0 H100 V100 H0 Z" fill="url(#forgeHeat)" />
        </Svg>
      </Animated.View>
      {/* the flames: rooted inside the button, rising over its top edge */}
      {reduced ? null : (
        <View pointerEvents="none" style={{ position: 'absolute', left: 6, right: 6, top: -flameH * 0.5, height: flameH }}>
          {TONGUES.map((t, i) => <Tongue key={i} {...t} flameH={flameH} />)}
          {EMBERS.map((e, i) => <Ember key={i} {...e} rise={height} />)}
        </View>
      )}
      <Animated.View style={reduced ? undefined : pulse}>{children}</Animated.View>
    </View>
  );
}

function useLoop(ms: number, delay: number): SharedValue<number> {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: ms / 2, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: ms / 2, easing: Easing.inOut(Easing.quad) })), -1));
    return () => cancelAnimation(v);
  }, [v, ms, delay]);
  return v;
}

function Tongue({ at, h, ms, delay, flameH }: { at: number; h: number; ms: number; delay: number; flameH: number }) {
  const v = useLoop(ms, delay);
  const w = flameH * 0.5 * (0.75 + 0.25 * h);
  const style = useAnimatedStyle(() => ({
    opacity: 0.75 + 0.25 * v.value,
    transform: [{ translateY: (1 - v.value) * flameH * 0.08 }, { scaleY: h * (0.78 + 0.3 * v.value) }, { scaleX: 1 - 0.12 * v.value }, { rotate: `${(v.value - 0.5) * 8}deg` }],
  }));
  return (
    <Animated.View style={[{ position: 'absolute', bottom: 0, left: `${at * 100}%`, marginLeft: -w / 2, width: w, height: flameH, transformOrigin: 'bottom' } as object, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 20 32" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="forgeTongue" x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor={Rune.red} />
            <Stop offset="0.45" stopColor="#E8641E" />
            <Stop offset="1" stopColor={Rune.goldText} stopOpacity={0.9} />
          </LinearGradient>
        </Defs>
        <Path d={TONGUE} fill="url(#forgeTongue)" />
        {/* the hot core */}
        <Path d={TONGUE} fill={Rune.goldText} opacity={0.55} transform="translate(5 12) scale(0.5)" />
      </Svg>
    </Animated.View>
  );
}

function Ember({ at, ms, delay, rise }: { at: number; ms: number; delay: number; rise: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withRepeat(withTiming(1, { duration: ms, easing: Easing.out(Easing.quad) }), -1));
    return () => cancelAnimation(v);
  }, [v, ms, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: v.value < 0.15 ? v.value / 0.15 : 1 - (v.value - 0.15) / 0.85,
    transform: [{ translateY: -v.value * rise }, { translateX: Math.sin(v.value * 6.3) * 5 }],
  }));
  return <Animated.View style={[{ position: 'absolute', bottom: 4, left: `${at * 100}%`, width: 3, height: 3, borderRadius: 2, backgroundColor: Rune.goldBright }, style]} />;
}

// ---------------------------------------------------------------------------------------------
// The web: the whole button on fire
// ---------------------------------------------------------------------------------------------

/** How far the fire climbs above the button, in button heights, and spills past its sides, in px. */
const RISE = 0.62; // the button sits near the top of the window; taller flames would run off it
const SPILL = 16;
const FOOT = 6; // canvas below the button, so the bottom edge can smoulder too

function FireButton({ height, label, onPress, accessibilityLabel, minWidth = 0, fallback }: { height: number; label: string; onPress: () => void; accessibilityLabel: string; minWidth?: number; fallback: ReactNode }) {
  const hostRef = useRef<View>(null);
  // No WebGL, or the context was lost: the ordinary button with the drawn flames, never bare text.
  const [failed, setFailed] = useState(false);
  const [w, setW] = useState(0);
  const reduced = useReducedMotion();
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    const host = hostRef.current as unknown as HTMLElement | null;
    if (!host || !w) return;
    // The table's own flame (lib/flames, owner v0.47.12): one shared context, so the button is alight at once.
    const f = burn(host, { width: w, height, rise: RISE, spill: SPILL, foot: FOOT, chamfer: 10, body: true, still: reduced });
    if (!f) { setFailed(true); return; }
    return f.stop;
  }, [w, height, reduced]);

  if (failed) return <>{fallback}</>;
  return (
    <Pressable
      onPress={() => { playSfx('buttonTap'); onPress(); }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}
      style={{ minWidth, height, transform: [{ scale: pressed ? 0.965 : 1 }] }}>
      <View ref={hostRef} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} />
      <View pointerEvents="none" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }}>
        <Text style={{ color: Rune.ivory, fontSize: 14, fontFamily: Body.bold, letterSpacing: 1.6, textTransform: 'uppercase', textShadowColor: 'rgba(40,4,2,0.95)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } }}>{label}</Text>
      </View>
    </Pressable>
  );
}
