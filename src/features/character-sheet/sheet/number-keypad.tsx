import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ChamferBox } from '@/components/chamfer-box';
import { DmRune, Body, Display, Rune } from '@/constants/theme';
import { scaled, useLayout } from '@/hooks/use-layout';
import { playSfx } from '@/lib/sfx';
import { DimScreen } from '@/lib/screen-dim';

/** A flat chamfered keypad key (shared shape with the damage panel). */
function Key({ label, onPress, accent, disabled, dm }: { label: string; onPress: () => void; accent?: boolean; disabled?: boolean; dm?: boolean }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} style={{ flex: 1 }}>
      {({ pressed }) => (
        <ChamferBox
          chamfer={8}
          fill={pressed ? (dm ? 'rgba(218,162,73,0.16)' : 'rgba(224,181,99,0.18)') : 'rgba(14,17,22,0.96)'}
          stroke={accent ? (dm ? 'rgba(178,86,78,0.75)' : 'rgba(200,27,24,0.7)') : dm ? DmRune.line : 'rgba(218,162,73,0.5)'}
          strokeWidth={1.2}
          style={{ height: 46, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}>
          <Text style={{ color: accent ? (dm ? DmRune.red : '#E2705A') : dm ? DmRune.ivory : Rune.sheet, fontSize: 18, fontFamily: Display.bold }}>{label}</Text>
        </ChamferBox>
      )}
    </Pressable>
  );
}

/** A small step button flanking the current number. The GLYPH is small so it does not shout over the
 *  value, but the touch target is a comfortable 44dp square, which is the whole trick (v0.32.0). */
export function StepBtn({ label, onPress, disabled, a11y }: { label: string; onPress: () => void; disabled?: boolean; a11y: string }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} disabled={disabled} hitSlop={10} accessibilityRole="button" accessibilityLabel={a11y}>
      <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.3 : 1 }}>
        <Text style={{ color: Rune.goldText, fontSize: 22, fontFamily: Display.bold, lineHeight: 26 }}>{label}</Text>
      </View>
    </Pressable>
  );
}

/**
 * A plain number keypad (#248 item 6) — the damage panel's keypad WITHOUT the hold-to-accept charge
 * and WITHOUT the damage thresholds. Used to ask the player for a dice result during a rest, and
 * (v0.32.0) for the number a card like Ferocity reads. OK is a normal tap, enabled only when the
 * typed value is within [min, max]. Tap the dim outside to cancel.
 *
 * v0.32.0: a minus and a plus flank the number. Typing a value from scratch every time is the wrong
 * interaction for a figure you are nudging ("it was 3, now it is 4"), which is most of the time.
 */
export function NumberKeypad({ title, subtitle, min = 1, max = 9, initial, dm, onSubmit, onClose }: { title: string; subtitle?: string; min?: number; max?: number; /** v0.32.0: the number already set, so the keypad opens on it rather than empty. */ initial?: number; /** v0.22.0: this is the PRIMARY stat-editing surface of DM mode, and it was gold-and-red. */ dm?: boolean; onSubmit: (n: number) => void; onClose: () => void }) {
  const { scale } = useLayout();
  const vis = useSharedValue(0);
  const [typed, setTyped] = useState(initial != null && initial !== 0 ? String(initial) : '');
  useEffect(() => { vis.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) }); }, [vis]);

  const val = parseInt(typed || '0', 10) || 0;
  const ok = val >= min && val <= max;
  const press = useCallback((d: string) => {
    playSfx('numpadPress');
    setTyped((t) => (t.length < 2 ? t + d : t));
  }, []);
  // Steps CLAMP rather than refusing, so holding the edge of the range is not a dead button press.
  const step = useCallback((d: number) => {
    playSfx('numpadPress');
    setTyped((t) => String(Math.max(min, Math.min(max, (parseInt(t || '0', 10) || 0) + d))));
  }, [min, max]);
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
      {/* #258r3: occluding bg so GH's hit-test can't reach the sheet's stat tracks underneath.
          v0.36.3 (owner): in DM MODE it is a real scrim. The sheet has its own `SheetDim` behind this,
          which is why the tap-catcher was left all but transparent; the DM screens have nothing, so
          the keypad floated over a fully lit encounter and was hard to pick out. */}
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: dm ? 'rgba(6,8,13,0.72)' : 'rgba(6,8,13,0.01)' }]} collapsable={false} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel" />
      {dm ? <DimScreen opacity={0.72} /> : null}
      <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      <Animated.View style={panelStyle}>
        <ChamferBox chamfer={16} fill="rgba(11,14,19,0.98)" stroke={dm ? DmRune.line : 'rgba(218,162,73,0.6)'} strokeWidth={1.4} style={{ width: scaled(264, scale), maxWidth: '92%', padding: scaled(16, scale), gap: 12 }}>
          <Text style={{ color: dm ? DmRune.accent : Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center' }}>{title}</Text>
          {subtitle ? <Text style={{ color: Rune.muted, fontSize: 11.5, fontFamily: Body.regular, textAlign: 'center', marginTop: -6 }}>{subtitle}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 52 }}>
            <StepBtn label="−" onPress={() => step(-1)} disabled={val <= min} a11y="One less" />
            <Text style={{ minWidth: 92, textAlign: 'center', color: typed ? (dm ? DmRune.ivory : Rune.sheet) : Rune.muted, fontSize: 40, fontFamily: Display.black, lineHeight: 44 }}>{typed || '0'}</Text>
            <StepBtn label="+" onPress={() => step(1)} disabled={val >= max} a11y="One more" />
          </View>
          {[
            ['1', '2', '3'],
            ['4', '5', '6'],
            ['7', '8', '9'],
          ].map((row, r) => (
            <View key={r} style={{ flexDirection: 'row', gap: 8 }}>
              {row.map((d) => (
                <Key key={d} label={d} onPress={() => press(d)} dm={dm} />
              ))}
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Key label="CLR" onPress={clear} accent dm={dm} />
            <Key label="0" onPress={() => press('0')} dm={dm} />
            <Key label="OK" onPress={submit} disabled={!ok} dm={dm} />
          </View>
          <Text style={{ color: Rune.muted, fontSize: 8.5, fontFamily: Body.medium, textAlign: 'center', letterSpacing: 0.4 }}>{`Enter ${min}–${max} · tap outside to cancel`}</Text>
        </ChamferBox>
      </Animated.View>
      </View>
    </View>
  );
}
