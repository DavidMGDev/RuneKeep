import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Polygon } from 'react-native-svg';

import { Body, Rune } from '@/constants/theme';
import { beginLoading, endLoading } from '@/lib/sfx';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

/** The deck-swap loader (#150): a turning rune ring + pulsing core, centered while the cards +
 *  controls are faded out — clearly a loader, not a tiny blip. */
export function DeckLoader() {
  const pulse = useSharedValue(0.4);
  const spin = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      pulse.value = 0.85;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 720, easing: Easing.inOut(Easing.quad) }), -1, true);
    spin.value = withRepeat(withTiming(1, { duration: 3600, easing: Easing.linear }), -1, false);
  }, [pulse, spin, reduced]);
  const glow = useAnimatedStyle(() => ({ opacity: 0.5 + 0.5 * pulse.value, transform: [{ scale: 0.9 + 0.14 * pulse.value }] }));
  const ring = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  return (
    // top 36% = the carousel's card REST_FRAC, with -45 to center the 90px ring ON that line, so the
    // loader sits exactly where the cards appear (#150 follow-up, owner).
    <View style={{ position: 'absolute', left: 0, right: 0, top: '36%', marginTop: -45, alignItems: 'center' }} pointerEvents="none">
      <View style={{ width: 90, height: 90, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }, ring]}>
          <Svg width={90} height={90} viewBox="0 0 92 92">
            <Polygon points="46,4 84,25 84,67 46,88 8,67 8,25" fill="none" stroke={Rune.goldEdge} strokeWidth={2} strokeLinejoin="miter" opacity={0.5} />
            <Polygon points="46,16 72,31 72,61 46,76 20,61 20,31" fill="none" stroke="rgba(218,162,73,0.25)" strokeWidth={1} strokeLinejoin="miter" />
          </Svg>
        </Animated.View>
        <Animated.View style={glow}>
          <Svg width={40} height={40} viewBox="0 0 56 56">
            <Polygon points="28,8 46,27 46,29 28,48 10,29 10,27" fill={Rune.gold} />
          </Svg>
        </Animated.View>
      </View>
    </View>
  );
}

/**
 * Full-screen entry loader (#110): the create screen has real warm-up cost (forging the nine class
 * cards to bitmaps, mounting the carousel) and the owner could watch the pieces pop in. This veil
 * covers the WHOLE screen — a slowly turning rune ring around a pulsing core — until the first deck
 * is painted, then fades out, so nothing is ever seen assembling. Self-unmounts after the fade.
 */
export function CreateLoader({ done, onHidden }: { done: boolean; onHidden: () => void }) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0.4);
  const spin = useSharedValue(0);
  const fade = useSharedValue(1);
  // #258: hold any "enter" chime until this loader has gone, so nothing sounds behind it.
  useEffect(() => {
    beginLoading();
    return endLoading;
  }, []);
  useEffect(() => {
    if (reduced) {
      pulse.value = 0.85;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 760, easing: Easing.inOut(Easing.quad) }), -1, true);
    spin.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.linear }), -1, false);
  }, [pulse, spin, reduced]);
  useEffect(() => {
    if (done) fade.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.quad) }, (f) => f && runOnJS(onHidden)());
  }, [done, fade, onHidden]);
  const glow = useAnimatedStyle(() => ({ opacity: 0.45 + 0.55 * pulse.value, transform: [{ scale: 0.92 + 0.12 * pulse.value }] }));
  const ring = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const veil = useAnimatedStyle(() => ({ opacity: fade.value }));
  return (
    <Animated.View
      pointerEvents={done ? 'none' : 'auto'}
      style={[{ position: 'absolute', top: -80, bottom: -120, left: -60, right: -60, zIndex: 900, backgroundColor: '#06080d', alignItems: 'center', justifyContent: 'center', gap: 26 }, veil]}>
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
      <Text style={{ color: Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 3, textTransform: 'uppercase' }}>Preparing the forge</Text>
    </Animated.View>
  );
}
