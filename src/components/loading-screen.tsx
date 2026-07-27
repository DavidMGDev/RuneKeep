import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Polygon } from 'react-native-svg';

import { Body, DmRune, Rune } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { beginLoading, endLoading } from '@/lib/sfx';

/**
 * The app's loading state (PRODUCT.md 5: loading is designed): ink ground, a chamfered gold
 * diamond breathing, a tracked label. Never a bare spinner. Use full-screen while a route's data
 * loads, or inline (height-bounded) inside a panel.
 */
export function LoadingScreen({ label = 'Preparing', dm }: { label?: string; dm?: boolean }) {
  // v0.22.0: DM screens get the desaturated sigil. This is the first thing a DM sees on every one
  // of their screens, so a gold diamond here alone was enough to undo the mode's identity.
  const edge = dm ? DmRune.accent : Rune.goldEdge;
  const fill = dm ? DmRune.accentDim : Rune.gold;
  const text = dm ? DmRune.accent : Rune.goldText;
  const pulse = useSharedValue(0.35);
  const reduced = useReducedMotion();
  // #258: suppress "enter" sounds while a loader is up; the chime fires when it clears.
  useEffect(() => {
    beginLoading();
    return endLoading;
  }, []);
  useEffect(() => {
    if (reduced) {
      pulse.value = 0.8;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }), -1, true);
  }, [pulse, reduced]);
  const glow = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Rune.ink, gap: 18 }}>
      <Animated.View style={glow}>
        <Svg width={56} height={56} viewBox="0 0 56 56">
          {/* chamfered diamond — the keep's sigil */}
          <Polygon points="28,2 50,24 50,32 28,54 6,32 6,24" fill="none" stroke={edge} strokeWidth={2} strokeLinejoin="miter" />
          <Polygon points="28,16 39,27 39,29 28,40 17,29 17,27" fill={fill} opacity={0.85} />
        </Svg>
      </Animated.View>
      <Text style={{ color: text, fontSize: 12, fontFamily: Body.bold, letterSpacing: 3, textTransform: 'uppercase' }}>{label}</Text>
    </View>
  );
}
