/**
 * A functional element, as it appears ON a card (v0.42.0, owner).
 *
 * The same component in the author's PREVIEW and on the player's sheet, with real state in both, which
 * is the owner's own requirement: "the card should be able to be tested with its functionality during
 * the preview. This way they can see if their markdown looks nice alongside the functional elements
 * and they can make sure that they display and work the way they intended." A preview that only
 * pictures the control is not a test of it.
 *
 * What it may do is decided in `lib/card-functions`, which is pure. This file only draws the answer,
 * so the rules can be read as sentences and tested with fixed numbers.
 */
import { Pressable, Text, TextInput, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { Body, Display, Rune } from '@/constants/theme';
import { type CardFunction, type FunctionState, canStepFunction, cycleFunction, cycleLabel, setTextValue, stateOf, stepFunction } from '@/lib/card-functions';
import { playSfx } from '@/lib/sfx';

const GOLD_EDGE = 'rgba(218,162,73,0.5)';

function StepButton({ plus, label, disabled, onPress }: { plus: boolean; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={() => { if (disabled) return; playSfx('placeToken', { cents: plus ? 160 : -180 }); onPress(); }} disabled={disabled} hitSlop={6} accessibilityRole="button" accessibilityState={{ disabled }} accessibilityLabel={label}>
      <ChamferBox chamfer={5} fill="rgba(20,24,31,0.85)" stroke={GOLD_EDGE} strokeWidth={1.1} style={{ width: 28, height: 26, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 }}>
        <Svg width={13} height={13} viewBox="0 0 16 16">
          <Line x1={4} y1={8} x2={12} y2={8} stroke={Rune.goldText} strokeWidth={2} strokeLinecap="round" />
          {plus ? <Line x1={8} y1={4} x2={8} y2={12} stroke={Rune.goldText} strokeWidth={2} strokeLinecap="round" /> : null}
        </Svg>
      </ChamferBox>
    </Pressable>
  );
}

export function CardFunctionControl({ fn, state, onChange, compact }: {
  fn: CardFunction;
  state: FunctionState | undefined;
  /** Absent draws it inert, which is how a card is shown somewhere it cannot be played. */
  onChange?: (next: FunctionState) => void;
  /** Tighter, for a card face rather than a panel. */
  compact?: boolean;
}) {
  const st = stateOf(fn, state);
  const gap = compact ? 4 : 6;
  const label = fn.label?.trim();

  const body = () => {
    if (fn.kind === 'counter') {
      const n = st.n ?? 0;
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <StepButton plus={false} label={`Lower ${label || 'the counter'}`} disabled={!onChange || !canStepFunction(fn, st, -1)} onPress={() => onChange?.(stepFunction(fn, st, -1))} />
          <Text
            accessibilityLabel={`${label || 'Counter'} at ${n}${fn.max ? ` of ${fn.max}` : ''}`}
            style={{ minWidth: 34, textAlign: 'center', color: Rune.inkText, fontSize: compact ? 16 : 19, lineHeight: compact ? 20 : 23, fontFamily: Display.black, fontVariant: ['tabular-nums'] }}>
            {n}{fn.max != null && fn.max > 0 ? <Text style={{ fontSize: compact ? 10 : 12, color: Rune.inkMuted }}>{` /${fn.max}`}</Text> : null}
          </Text>
          {/* A countdown has no plus at all: its direction is part of what it is. */}
          {fn.countdown ? null : <StepButton plus label={`Raise ${label || 'the counter'}`} disabled={!onChange || !canStepFunction(fn, st, 1)} onPress={() => onChange?.(stepFunction(fn, st, 1))} />}
        </View>
      );
    }
    if (fn.kind === 'cycle') {
      return (
        <Pressable
          onPress={() => { if (!onChange) return; playSfx('buttonTap'); onChange(cycleFunction(fn, st)); }}
          disabled={!onChange}
          accessibilityRole="button"
          accessibilityLabel={`${label || 'Option'}: ${cycleLabel(fn, st)}. Tap to change.`}>
          <ChamferBox chamfer={6} fill="rgba(218,162,73,0.14)" stroke={Rune.goldEdge} strokeWidth={1.2} style={{ minWidth: 96, height: compact ? 26 : 30, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}>
            <Text numberOfLines={1} style={{ color: Rune.goldText, fontSize: compact ? 10.5 : 12, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>{cycleLabel(fn, st)}</Text>
          </ChamferBox>
        </Pressable>
      );
    }
    const lines = Math.max(1, fn.lines ?? 1);
    return (
      <ChamferBox chamfer={5} fill="rgba(20,24,31,0.06)" stroke={GOLD_EDGE} strokeWidth={1.1} style={{ minHeight: 8 + lines * 15, justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 4 }}>
        <TextInput
          value={st.s ?? ''}
          onChangeText={(s) => onChange?.(setTextValue(s))}
          editable={!!onChange}
          multiline={lines > 1}
          placeholder={fn.placeholder || ''}
          placeholderTextColor={Rune.inkMuted}
          accessibilityLabel={label || 'Write here'}
          style={{ color: Rune.inkText, fontSize: compact ? 10.5 : 12.5, fontFamily: Body.regular, padding: 0, minHeight: lines * 15, textAlignVertical: lines > 1 ? 'top' : 'center' }}
        />
      </ChamferBox>
    );
  };

  return (
    <View style={{ gap }}>
      {label ? (
        <Text style={{ color: Rune.inkMuted, fontSize: compact ? 8 : 9.5, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
      ) : null}
      {body()}
    </View>
  );
}
