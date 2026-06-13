import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { Body, Display, Rune } from '@/constants/theme';

/** A flat chamfered keypad key (matches the damage panel). */
function Key({ label, onPress, accent, glyph }: { label: string; onPress: () => void; accent?: boolean; glyph?: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ flex: 1 }}>
      {({ pressed }) => (
        <ChamferBox chamfer={8} fill={pressed ? 'rgba(224,181,99,0.18)' : 'rgba(14,17,22,0.96)'} stroke={accent ? 'rgba(200,27,24,0.7)' : 'rgba(218,162,73,0.5)'} strokeWidth={1.2} style={{ height: 46, alignItems: 'center', justifyContent: 'center' }}>
          {glyph ?? <Text style={{ color: accent ? '#E2705A' : Rune.sheet, fontSize: 18, fontFamily: Display.bold }}>{label}</Text>}
        </ChamferBox>
      )}
    </Pressable>
  );
}

/**
 * A number keypad (#166) — the damage-panel keypad reused for editing any sheet number, except OK is
 * a SINGLE TAP checkmark (no hold). Enter a value, optionally toggle sign, confirm. The result is
 * clamped to [min, max].
 */
export function NumberKeypad({
  title,
  initial,
  min = 0,
  max = 99,
  allowNegative = false,
  onConfirm,
  onClose,
}: {
  title: string;
  initial: number;
  min?: number;
  max?: number;
  allowNegative?: boolean;
  onConfirm: (value: number) => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState(String(initial));
  const [neg, setNeg] = useState(initial < 0);

  const press = (d: string) => setTyped((t) => (t.replace('-', '').replace(/^0$/, '').length < 3 ? (t === '0' ? d : t + d) : t));
  const clear = () => {
    setTyped('0');
    setNeg(false);
  };
  const back = () => setTyped((t) => (t.length > 1 ? t.slice(0, -1) : '0'));
  const toggleSign = () => setNeg((v) => !v);

  const magnitude = parseInt(typed.replace('-', '') || '0', 10) || 0;
  const value = Math.max(min, Math.min(max, (neg ? -1 : 1) * magnitude));
  const confirm = () => {
    onConfirm(value);
    onClose();
  };

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 9500, alignItems: 'center', justifyContent: 'center' }]}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,8,13,0.9)' }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel" />
      <ChamferBox chamfer={16} fill="rgba(11,14,19,0.99)" stroke="rgba(218,162,73,0.6)" strokeWidth={1.4} style={{ width: 264, padding: 16, gap: 12 }}>
        <Text style={{ color: Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center' }}>{title}</Text>
        <View style={{ alignItems: 'center', minHeight: 50, justifyContent: 'center' }}>
          <Text style={{ color: Rune.sheet, fontSize: 42, fontFamily: Display.black, lineHeight: 46 }}>{value}</Text>
          <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.medium, letterSpacing: 0.6 }}>{`range ${min} to ${max}`}</Text>
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
          {allowNegative ? <Key label={neg ? '+/−' : '−/+'} onPress={toggleSign} accent /> : <Key label="CLR" onPress={clear} accent />}
          <Key label="0" onPress={() => press('0')} />
          <Key label="back" glyph={<Text style={{ color: Rune.sheet, fontSize: 16, fontFamily: Display.bold }}>⌫</Text>} onPress={back} />
        </View>
        <Pressable onPress={confirm} accessibilityRole="button" accessibilityLabel="Confirm">
          {({ pressed }) => (
            <ChamferBox chamfer={8} fill={pressed ? '#A91613' : Rune.red} stroke="transparent" strokeWidth={0} style={{ height: 46, alignItems: 'center', justifyContent: 'center' }}>
              <Svg width={22} height={22} viewBox="0 0 20 20">
                <Path d="M 4 10 L 8.5 14.5 L 16 6" fill="none" stroke={Rune.ivory} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </ChamferBox>
          )}
        </Pressable>
      </ChamferBox>
    </View>
  );
}
