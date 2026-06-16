import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ChamferBox } from '@/components/chamfer-box';
import { Body, Display, Rune } from '@/constants/theme';
import { playSfx } from '@/lib/sfx';

/** A flat chamfered keypad key (shared shape with the damage panel). */
function Key({ label, onPress, accent, disabled }: { label: string; onPress: () => void; accent?: boolean; disabled?: boolean }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} style={{ flex: 1 }}>
      {({ pressed }) => (
        <ChamferBox
          chamfer={8}
          fill={pressed ? 'rgba(224,181,99,0.18)' : 'rgba(14,17,22,0.96)'}
          stroke={accent ? 'rgba(200,27,24,0.7)' : 'rgba(218,162,73,0.5)'}
          strokeWidth={1.2}
          style={{ height: 46, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}>
          <Text style={{ color: accent ? '#E2705A' : Rune.sheet, fontSize: 18, fontFamily: Display.bold }}>{label}</Text>
        </ChamferBox>
      )}
    </Pressable>
  );
}

/**
 * A plain number keypad (#248 item 6) — the damage panel's keypad WITHOUT the hold-to-accept charge
 * and WITHOUT the damage thresholds. Used to ask the player for a dice result during a rest. OK is a
 * normal tap, enabled only when the typed value is within [min, max]. Tap the dim outside to cancel.
 */
export function NumberKeypad({ title, subtitle, min = 1, max = 9, onSubmit, onClose }: { title: string; subtitle?: string; min?: number; max?: number; onSubmit: (n: number) => void; onClose: () => void }) {
  const vis = useSharedValue(0);
  const [typed, setTyped] = useState('');
  useEffect(() => { vis.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) }); }, [vis]);

  const val = parseInt(typed || '0', 10) || 0;
  const ok = val >= min && val <= max;
  const press = useCallback((d: string) => {
    playSfx('numpadPress');
    setTyped((t) => (t.length < 2 ? t + d : t));
  }, []);
  const clear = useCallback(() => {
    playSfx('numpadPress');
    setTyped('');
  }, []);
  // Clear after a successful OK (#264 item 1): the keypad instance is reused across consecutive rest
  // prompts (HP then stress), so without this the prior value lingers ("2" → typing 2 makes "22").
  const submit = useCallback(() => { if (ok) { onSubmit(val); setTyped(''); } }, [ok, onSubmit, val]);

  const panelStyle = useAnimatedStyle(() => ({ opacity: vis.value, transform: [{ translateY: (1 - vis.value) * 26 }, { scale: 0.96 + vis.value * 0.04 }] }));

  // No own dark scrim (#250): the shared SheetDim already darkens the screen; this sits ABOVE it
  // (zIndex 10001) so the keypad is never hidden behind a dim. Transparent tap-catcher closes it.
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 10001, alignItems: 'center', justifyContent: 'center' }]}>
      {/* #258r3: occluding bg so GH's hit-test can't reach the sheet's stat tracks underneath */}
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,8,13,0.01)' }]} collapsable={false} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel" />
      <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      <Animated.View style={panelStyle}>
        <ChamferBox chamfer={16} fill="rgba(11,14,19,0.98)" stroke="rgba(218,162,73,0.6)" strokeWidth={1.4} style={{ width: 264, padding: 16, gap: 12 }}>
          <Text style={{ color: Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center' }}>{title}</Text>
          {subtitle ? <Text style={{ color: Rune.muted, fontSize: 11.5, fontFamily: Body.regular, textAlign: 'center', marginTop: -6 }}>{subtitle}</Text> : null}
          <View style={{ alignItems: 'center', minHeight: 52, justifyContent: 'center' }}>
            <Text style={{ color: typed ? Rune.sheet : Rune.muted, fontSize: 40, fontFamily: Display.black, lineHeight: 44 }}>{typed || '0'}</Text>
          </View>
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
            <Key label="OK" onPress={submit} disabled={!ok} />
          </View>
          <Text style={{ color: Rune.muted, fontSize: 8.5, fontFamily: Body.medium, textAlign: 'center', letterSpacing: 0.4 }}>{`Enter ${min}–${max} · tap outside to cancel`}</Text>
        </ChamferBox>
      </Animated.View>
      </View>
    </View>
  );
}
