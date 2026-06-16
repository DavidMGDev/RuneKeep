import { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { ChamferBox } from '@/components/chamfer-box';
import { Display, Rune } from '@/constants/theme';
import { playSfx } from '@/lib/sfx';

const HOLD_MS = 620;

/**
 * Hold-to-confirm button (#264 item 5) — the Damage Thresholds OK gesture, generalized: a red fill
 * rises from the bottom of a chamfered key over the hold, with a bright leading edge, and fires on
 * completion. A plain tap won't confirm; releasing early eases back. Reduced-motion fires instantly.
 * Used for "hold to delete card" in the editor and for deleting a catalog card from the carousel.
 */
export function HoldToConfirm({
  label,
  onConfirm,
  height = 46,
  chamfer = 8,
  color = Rune.red,
  sfx = 'tokenRemove',
}: {
  label: string;
  onConfirm: () => void;
  height?: number;
  chamfer?: number;
  color?: string;
  /** Sound on completion; pass null to stay silent. */
  sfx?: Parameters<typeof playSfx>[0] | null;
}) {
  const reduced = useReducedMotion();
  const charge = useSharedValue(0);

  const fire = useCallback(() => {
    if (sfx) playSfx(sfx);
    onConfirm();
  }, [onConfirm, sfx]);

  const hold = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(reduced ? 1 : HOLD_MS)
        .maxDistance(44)
        .onBegin(() => {
          if (!reduced) charge.value = withTiming(1, { duration: HOLD_MS, easing: Easing.out(Easing.cubic) });
        })
        .onStart(() => {
          runOnJS(fire)();
        })
        .onFinalize((_e, ok) => {
          if (!ok) charge.value = withTiming(0, { duration: 160 });
        }),
    [charge, fire, reduced],
  );

  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + charge.value * 0.1 }] }));
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - charge.value) * height }] }));
  const edgeStyle = useAnimatedStyle(() => ({ opacity: charge.value > 0.02 ? 1 : 0 }));

  return (
    <GestureDetector gesture={hold}>
      <Animated.View style={[{ alignSelf: 'stretch' }, scaleStyle]} accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Press and hold to confirm">
        <ChamferBox chamfer={chamfer} fill="rgba(14,17,22,0.96)" stroke={color} strokeWidth={1.4} style={{ height, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <Animated.View style={[StyleSheet.absoluteFill, fillStyle]} pointerEvents="none">
            <View style={[StyleSheet.absoluteFill, { backgroundColor: color }]} />
            <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: 2.5, backgroundColor: Rune.goldBright }, edgeStyle]} />
          </Animated.View>
          <Text style={{ color: Rune.ivory, fontSize: 13, fontFamily: Display.bold, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</Text>
        </ChamferBox>
      </Animated.View>
    </GestureDetector>
  );
}
