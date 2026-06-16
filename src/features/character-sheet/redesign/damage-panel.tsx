import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { Body, Display, Rune } from '@/constants/theme';
import { hpLostFromDamage } from '@/lib/damage';
import { playRiser, playSfx, type RiserHandle } from '@/lib/sfx';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

const HOLD_MS = 620;

/** A flat chamfered keypad key. */
function Key({ label, onPress, accent }: { label: string; onPress: () => void; accent?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ flex: 1 }}>
      {({ pressed }) => (
        <ChamferBox
          chamfer={8}
          fill={pressed ? 'rgba(224,181,99,0.18)' : 'rgba(14,17,22,0.96)'}
          stroke={accent ? 'rgba(200,27,24,0.7)' : 'rgba(218,162,73,0.5)'}
          strokeWidth={1.2}
          style={{ height: 46, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: accent ? '#E2705A' : Rune.sheet, fontSize: 18, fontFamily: Display.bold }}>{label}</Text>
        </ChamferBox>
      )}
    </Pressable>
  );
}

/**
 * Damage-threshold panel (#128): replaces the old static HP info card. Animates in/out; shows the
 * character's (read-only) damage thresholds and a custom number keypad — no system keyboard. Enter
 * the incoming damage; HOLD OK (a hearts-style charge) to confirm. On confirm the panel animates
 * OUT first, THEN the parent bursts the lost hearts. Tap the dim outside the panel to cancel.
 */
export function DamagePanel({ thresholds, onApply, onClose }: { thresholds: { major: number; severe: number }; onApply: (hpLoss: number) => void; onClose: () => void }) {
  const reduced = useReducedMotion();
  const vis = useSharedValue(0);
  const charge = useSharedValue(0);
  const [typed, setTyped] = useState('');
  const riser = useRef<RiserHandle | null>(null);

  useEffect(() => {
    vis.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
  }, [vis]);
  useEffect(() => {
    playSfx('panelOpen'); // #255
  }, []);

  const damage = parseInt(typed || '0', 10) || 0;
  const hpLoss = hpLostFromDamage(damage, thresholds);

  const finish = useCallback(
    (apply: boolean) => {
      const loss = hpLoss;
      playSfx('panelClose'); // #255: the panel closes; the staggered HP-loss hits then fire from the hearts
      vis.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.quad) }, (f) => {
        if (!f) return;
        if (apply) runOnJS(onApply)(loss); // hearts burst only AFTER the panel is gone (#128)
        runOnJS(onClose)();
      });
    },
    [vis, onApply, onClose, hpLoss],
  );

  const press = useCallback((d: string) => {
    playSfx('numpadPress');
    setTyped((t) => (t.length < 3 ? t + d : t));
  }, []);
  const clear = useCallback(() => {
    playSfx('numpadPress');
    setTyped('');
  }, []);
  const confirm = useCallback(() => finish(true), [finish]);

  // The OK hold gets the HP riser, but MUCH lower (#255), cut the instant the hold completes/cancels.
  const startOkRiser = useCallback(() => {
    riser.current = playRiser('riserHp', { cents: -600, volume: 0.8 });
  }, []);
  const stopOkRiser = useCallback((fadeMs?: number) => {
    riser.current?.stop(fadeMs);
    riser.current = null;
  }, []);

  // OK is a HOLD (#128): charges like a heart, fires at HOLD_MS. A plain tap won't confirm.
  const okHold = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(reduced ? 1 : HOLD_MS)
        .maxDistance(44)
        .onBegin(() => {
          if (!reduced) {
            charge.value = withTiming(1, { duration: HOLD_MS, easing: Easing.out(Easing.cubic) });
            runOnJS(startOkRiser)();
          }
        })
        .onStart(() => {
          runOnJS(stopOkRiser)(120);
          runOnJS(confirm)();
        })
        .onFinalize((_e, ok) => {
          if (!ok) {
            charge.value = withTiming(0, { duration: 160 });
            runOnJS(stopOkRiser)(160);
          }
        }),
    [charge, confirm, reduced, startOkRiser, stopOkRiser],
  );

  const panelStyle = useAnimatedStyle(() => ({ opacity: vis.value, transform: [{ translateY: (1 - vis.value) * 26 }, { scale: 0.96 + vis.value * 0.04 }] }));
  const okStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + charge.value * 0.12 }] }));
  // The charge now RISES from the bottom of the chamfered key (a filling meter) instead of an ugly
  // flat rectangle fading in over a 45°-chamfer shape (#255). overflow:hidden clips it to the chamfer.
  const okFill = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - charge.value) * 46 }] }));
  const okEdge = useAnimatedStyle(() => ({ opacity: charge.value > 0.02 ? 1 : 0 }));

  // No own dark scrim (#250): the shared SheetDim darkens the screen; this sits ABOVE it. A full-screen
  // tap-catcher (#258r2) absorbs every touch so the character sheet can't be reached through the panel
  // (an outside tap cancels). The centered panel sits directly above it — NO box-none, which leaked
  // (matches the OverlayShell pattern).
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 10001, alignItems: 'center', justifyContent: 'center' }]}>
      {/* #258r3: a near-invisible backgroundColor + collapsable={false} make this a real, OCCLUDING
          native view so gesture-handler's hit-test stops here instead of passing through to the hearts
          underneath (a fully-transparent catcher does NOT occlude GH gestures). SheetDim still dims. */}
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,8,13,0.01)' }]} collapsable={false} onPress={() => finish(false)} accessibilityRole="button" accessibilityLabel="Close damage panel" accessibilityHint="Cancels and lets you adjust hit points manually" />
      <Animated.View style={panelStyle}>
        <ChamferBox chamfer={16} fill="rgba(11,14,19,0.98)" stroke="rgba(218,162,73,0.6)" strokeWidth={1.4} style={{ width: 264, padding: 16, gap: 12 }}>
          <Text style={{ color: Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center' }}>Incoming damage</Text>

          {/* read-only thresholds */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[
              { label: 'Major', value: thresholds.major },
              { label: 'Severe', value: thresholds.severe },
            ].map((t) => (
              <ChamferBox key={t.label} chamfer={6} fill="rgba(14,17,22,0.9)" stroke="rgba(218,162,73,0.4)" strokeWidth={1} style={{ flex: 1, alignItems: 'center', paddingVertical: 6 }}>
                <Text style={{ color: Rune.muted, fontSize: 8, fontFamily: Body.bold, letterSpacing: 1.4, textTransform: 'uppercase' }}>{t.label}</Text>
                <Text style={{ color: Rune.goldBright, fontSize: 17, fontFamily: Display.black }}>{t.value}</Text>
              </ChamferBox>
            ))}
          </View>

          {/* typed number + live HP-loss preview */}
          <View style={{ alignItems: 'center', minHeight: 52, justifyContent: 'center' }}>
            <Text style={{ color: typed ? Rune.sheet : Rune.muted, fontSize: 40, fontFamily: Display.black, lineHeight: 44 }}>{typed || '0'}</Text>
            <Text style={{ color: damage > 0 ? '#E2705A' : 'transparent', fontSize: 11, fontFamily: Body.bold, letterSpacing: 1 }}>−{hpLoss} HP</Text>
          </View>

          {/* keypad */}
          {[
            ['1', '2', '3'],
            ['4', '5', '6'],
            ['7', '8', '9'],
          ].map((row, r) => (
            <View key={r} style={{ flexDirection: 'row', gap: 8 }}>
              {row.map((d) => (
                <Key key={d} label={d} onPress={() => press(d)} />
              ))}
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Key label="CLR" onPress={clear} accent />
            <Key label="0" onPress={() => press('0')} />
            {/* OK = hold to confirm */}
            <GestureDetector gesture={okHold}>
              <Animated.View style={[{ flex: 1 }, okStyle]}>
                <ChamferBox chamfer={8} fill="rgba(14,17,22,0.96)" stroke={Rune.red} strokeWidth={1.4} style={{ height: 46, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {/* charge meter: a red fill rises from the bottom with a bright leading edge, clipped to
                      the chamfer — a deliberate "charging the hit" instead of a flat fading rectangle. */}
                  <Animated.View style={[StyleSheet.absoluteFill, okFill]} pointerEvents="none">
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: Rune.red }]} />
                    <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: 2.5, backgroundColor: Rune.goldBright }, okEdge]} />
                  </Animated.View>
                  <Svg width={20} height={20} viewBox="0 0 20 20">
                    <Path d="M 4 10 L 8.5 14.5 L 16 6" fill="none" stroke={Rune.ivory} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </ChamferBox>
              </Animated.View>
            </GestureDetector>
          </View>
          <Text style={{ color: Rune.muted, fontSize: 8.5, fontFamily: Body.medium, textAlign: 'center', letterSpacing: 0.4 }}>Hold OK to take the hit · tap outside to adjust manually</Text>
        </ChamferBox>
      </Animated.View>
    </View>
  );
}
