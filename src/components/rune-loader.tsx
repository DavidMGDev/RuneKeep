import { useCallback, useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Polygon } from 'react-native-svg';

import { Body, Rune } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { beginLoading, endLoading } from '@/lib/sfx';
import { useScreenDim } from '@/lib/screen-dim';

/**
 * Full-screen forge loader (#150): a slowly turning rune ring around a pulsing core that covers the
 * whole screen until `done`, then fades out and self-unmounts (a hard fallback timer in the parent
 * guarantees it never strands). Used so a screen's pieces assemble BEHIND it and only fade in once
 * everything is ready — nothing is seen popping in.
 */
export function RuneLoader({ done, onHidden, caption }: { done: boolean; onHidden: () => void; caption?: string }) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0.4);
  const spin = useSharedValue(0);
  const fade = useSharedValue(1);
  // #258r3: this is a real loader (the sheet forges behind it) — hold any "enter" chime until the loader
  // clears. #289: release it as the loader BEGINS fading out (not on full unmount), so the sheet-enter
  // sound lands as the sheet reveals (~360ms earlier) instead of after the veil is gone. Released once.
  const released = useRef(false);
  const release = useCallback(() => {
    if (!released.current) { released.current = true; endLoading(); }
  }, []);
  useEffect(() => {
    beginLoading();
    return release; // unmount releases too (e.g. fallback path) — the guard keeps it to exactly one.
  }, [release]);
  useEffect(() => {
    if (reduced) {
      pulse.value = 0.85;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 760, easing: Easing.inOut(Easing.quad) }), -1, true);
    spin.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.linear }), -1, false);
  }, [pulse, spin, reduced]);
  useEffect(() => {
    if (done) {
      release(); // #289: play the deferred sheet-enter chime now, as the veil begins to lift
      fade.value = withTiming(0, { duration: 360, easing: Easing.out(Easing.quad) }, (f) => f && runOnJS(onHidden)());
    }
  }, [done, fade, onHidden, release]);
  const glow = useAnimatedStyle(() => ({ opacity: 0.45 + 0.55 * pulse.value, transform: [{ scale: 0.92 + 0.12 * pulse.value }] }));
  const ring = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const veil = useAnimatedStyle(() => ({ opacity: fade.value }));
  // v0.24.1: declare it so the tablet margins darken with the screen (lib/screen-dim).
  useScreenDim(done ? 0 : 1);
  return (
    <Animated.View
      pointerEvents={done ? 'none' : 'auto'}
      style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 12000, backgroundColor: '#06080d', alignItems: 'center', justifyContent: 'center', gap: 26 }, veil]}>
      <View style={{ width: 104, height: 104, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }, ring]}>
          <Svg width={104} height={104} viewBox="0 0 92 92">
            <Polygon points="46,4 84,25 84,67 46,88 8,67 8,25" fill="none" stroke={Rune.goldEdge} strokeWidth={2} strokeLinejoin="miter" opacity={0.5} />
            <Polygon points="46,16 72,31 72,61 46,76 20,61 20,31" fill="none" stroke="rgba(218,162,73,0.25)" strokeWidth={1} strokeLinejoin="miter" />
          </Svg>
        </Animated.View>
        <Animated.View style={glow}>
          <Svg width={46} height={46} viewBox="0 0 56 56">
            <Polygon points="28,8 46,27 46,29 28,48 10,29 10,27" fill={Rune.gold} />
          </Svg>
        </Animated.View>
      </View>
      {caption ? <Text style={{ color: Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 3, textTransform: 'uppercase' }}>{caption}</Text> : null}
    </Animated.View>
  );
}
