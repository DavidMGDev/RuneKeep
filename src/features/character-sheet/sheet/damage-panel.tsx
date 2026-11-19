import { DesktopPortal } from '@/components/desktop-portal';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { Body, Display, Rune } from '@/constants/theme';
import { hpLostFromDamage } from '@/lib/damage';
import { playRiser, playSfx, type RiserHandle } from '@/lib/sfx';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useDesktop } from '@/hooks/use-desktop';
import { RuneButton } from '@/components/rune-button';
import { StepBtn } from './number-keypad';

const HOLD_MS = 620;

/** A flat chamfered keypad key. */
function Key({ label, onPress, accent, height = 46, a11y }: { label: string; onPress: () => void; accent?: boolean; height?: number; a11y?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y ?? label} style={{ flex: 1 }}>
      {({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => (
        <ChamferBox
          chamfer={8}
          fill={pressed ? 'rgba(224,181,99,0.18)' : hovered ? '#1A1E26' : 'rgba(14,17,22,0.96)'}
          stroke={accent ? 'rgba(200,27,24,0.7)' : hovered ? Rune.goldBright : 'rgba(218,162,73,0.5)'}
          strokeWidth={1.2}
          style={{ height, alignItems: 'center', justifyContent: 'center' }}>
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
  // v0.32.0: nudge the figure instead of retyping it. Clamped to the 3 digits the keypad accepts.
  const step = useCallback((d: number) => {
    playSfx('numpadPress');
    setTyped((t) => String(Math.max(0, Math.min(999, (parseInt(t || '0', 10) || 0) + d))));
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

  const desktop = !!useDesktop();
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
  // Desktop (v0.46.0, owner): a pop-up over the port, built for a keyboard. The figure is a real field (type it,
  // Enter applies, Esc cancels), the keypad stays for the mouse, the bands show where the hit lands, and one
  // click applies it.
  if (desktop) {
    const bands = [
      { label: 'Minor', range: `1 to ${Math.max(1, thresholds.major - 1)}`, hp: 1, on: damage > 0 && hpLoss === 1 },
      { label: 'Major', range: `${thresholds.major} to ${Math.max(thresholds.major, thresholds.severe - 1)}`, hp: 2, on: hpLoss === 2 },
      { label: 'Severe', range: `${thresholds.severe}+`, hp: 3, on: hpLoss >= 3 },
    ];
    return (
      <View style={[StyleSheet.absoluteFill, { zIndex: 10001, alignItems: 'center', justifyContent: 'center' }]}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,8,13,0.01)', cursor: 'default' } as never]} onPress={() => finish(false)} accessibilityRole="button" accessibilityLabel="Close damage panel" />
        <Animated.View style={panelStyle}>
          <ChamferBox chamfer={16} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 352, padding: 22, gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ flex: 1, color: Rune.ivory, fontSize: 24, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.3 }}>Take damage</Text>
              <Pressable onPress={() => finish(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
                {({ hovered }: { hovered?: boolean }) => <Text style={{ color: hovered ? Rune.ivory : Rune.goldText, fontSize: 18, fontFamily: Body.bold }}>{'\u2715'}</Text>}
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {bands.map((b) => (
                <ChamferBox key={b.label} chamfer={7} fill={b.on ? '#1d0f10' : Rune.ink} stroke={b.on ? Rune.red : 'rgba(218,162,73,0.4)'} strokeWidth={1.2} style={{ flex: 1, alignItems: 'center', paddingVertical: 8, gap: 1 }}>
                  <Text style={{ color: b.on ? Rune.ivory : Rune.muted, fontSize: 10, fontFamily: Body.bold, letterSpacing: 1.3, textTransform: 'uppercase' }}>{b.label}</Text>
                  <Text style={{ color: b.on ? Rune.ivory : Rune.goldBright, fontSize: 15, fontFamily: Display.black }}>{b.range}</Text>
                  <Text style={{ color: b.on ? '#F08A74' : Rune.muted, fontSize: 10, fontFamily: Body.bold }}>{`\u2212${b.hp} HP`}</Text>
                </ChamferBox>
              ))}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <StepBtn label={'\u2212'} onPress={() => step(-1)} disabled={damage <= 0} a11y="One less" />
              <ChamferBox chamfer={8} fill={Rune.ink} stroke={Rune.goldEdge} strokeWidth={1.3} style={{ flex: 1, height: 64, justifyContent: 'center' }}>
                <TextInput
                  autoFocus
                  value={typed}
                  onChangeText={(t) => setTyped(t.replace(/[^0-9]/g, '').slice(0, 3))}
                  onSubmitEditing={() => { if (damage > 0) confirm(); }}
                  onKeyPress={(e) => { if (e.nativeEvent.key === 'Escape') finish(false); }}
                  inputMode="numeric"
                  placeholder="0"
                  placeholderTextColor={Rune.muted}
                  accessibilityLabel="Damage"
                  style={{ color: Rune.sheet, fontSize: 40, fontFamily: Display.black, textAlign: 'center', padding: 0, outlineStyle: 'none' } as never}
                />
              </ChamferBox>
              <StepBtn label="+" onPress={() => step(1)} disabled={damage >= 999} a11y="One more" />
            </View>
            {[
              ['1', '2', '3'],
              ['4', '5', '6'],
              ['7', '8', '9'],
            ].map((row, r) => (
              <View key={r} style={{ flexDirection: 'row', gap: 8 }}>
                {row.map((d) => <Key key={d} label={d} height={42} onPress={() => press(d)} />)}
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Key label="CLR" height={42} onPress={clear} accent a11y="Clear" />
              <Key label="0" height={42} onPress={() => press('0')} />
              <Key label={'\u232B'} height={42} a11y="Delete a digit" onPress={() => { playSfx('numpadPress'); setTyped((t) => t.slice(0, -1)); }} />
            </View>
            <RuneButton label={damage > 0 ? `Take ${hpLoss} HP` : 'Take the hit'} kind="primary" height={46} disabled={damage <= 0} onPress={confirm} />
            <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.medium, textAlign: 'center' }}>Enter applies it. Esc or a click outside cancels.</Text>
          </ChamferBox>
        </Animated.View>
      </View>
    );
  }
  return (
    <DesktopPortal to="side" priority="dialog" onDismiss={onClose}>
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

          {/* typed number + live HP-loss preview. v0.32.0: a minus and a plus flank it, because
              adjusting a damage figure by one is far more common than retyping it. */}
          <View style={{ alignItems: 'center', minHeight: 52, justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <StepBtn label="−" onPress={() => step(-1)} disabled={damage <= 0} a11y="One less" />
              <Text style={{ minWidth: 100, textAlign: 'center', color: typed ? Rune.sheet : Rune.muted, fontSize: 40, fontFamily: Display.black, lineHeight: 44 }}>{typed || '0'}</Text>
              <StepBtn label="+" onPress={() => step(1)} disabled={damage >= 999} a11y="One more" />
            </View>
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
    </DesktopPortal>
  );
}
