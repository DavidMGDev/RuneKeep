/**
 * Counters, as the DM sees them (v0.41.3, owner).
 *
 * Two shapes for one idea, so a counter reads the same wherever it is:
 *
 *  - {@link CounterStepper} is the number and its two buttons, and nothing else. It goes beside a
 *    name in a title row, where there is no room for anything more.
 *  - {@link CounterRow} is the whole counter: name, what kind it is, what it means, and the stepper.
 *    It goes in a list, whether that is the expanded detail of an ordinary adversary or the entry of
 *    one a pile of counters has taken over.
 *
 * Neither owns the number. The encounter does, because a counter that forgot where it was when the
 * panel re-rendered would be worse than no counter at all.
 *
 * The design is the DM's own: chamfered boxes, the desaturated `DmRune` palette, `DmPress` so a
 * press feels like every other press in this mode. See `docs/architecture.md`.
 */
import { Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { Body, Display, DmRune, DmType } from '@/constants/theme';
import { type AdversaryCounter, counterNote } from '@/lib/dm-counters';
import { DmPress } from './dm-ui';

function StepButton({ sign, label, size, onPress }: { sign: 1 | -1; label: string; size: number; onPress?: () => void }) {
  const arm = size * 0.3;
  return (
    <DmPress onPress={onPress} disabled={!onPress} hitSlop={7} accessibilityRole="button" accessibilityLabel={label}>
      <ChamferBox
        chamfer={5}
        fill="rgba(20,24,30,0.92)"
        stroke={DmRune.accentDim}
        strokeWidth={1.2}
        style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', opacity: onPress ? 1 : 0.45 }}>
        <Svg width={size * 0.62} height={size * 0.62} viewBox={`0 0 ${size} ${size}`}>
          <Line x1={size / 2 - arm} y1={size / 2} x2={size / 2 + arm} y2={size / 2} stroke={DmRune.accent} strokeWidth={2} strokeLinecap="round" />
          {sign === 1 ? <Line x1={size / 2} y1={size / 2 - arm} x2={size / 2} y2={size / 2 + arm} stroke={DmRune.accent} strokeWidth={2} strokeLinecap="round" /> : null}
        </Svg>
      </ChamferBox>
    </DmPress>
  );
}

/** The number and its two buttons. `onStep` absent draws it read-only, which is how the library shows it. */
export function CounterStepper({ c, size = 30, onStep }: { c: AdversaryCounter; size?: number; onStep?: (delta: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <StepButton sign={-1} size={size} label={`Lower ${c.name || 'the counter'}`} onPress={onStep ? () => onStep(-1) : undefined} />
      <Text
        accessibilityLabel={`${c.name || 'Counter'} at ${c.value}`}
        style={{ minWidth: size + 6, textAlign: 'center', color: DmRune.ivory, fontSize: size * 0.66, lineHeight: size * 0.82, fontFamily: Display.black, fontVariant: ['tabular-nums'] }}>
        {c.value}
      </Text>
      <StepButton sign={1} size={size} label={`Raise ${c.name || 'the counter'}`} onPress={onStep ? () => onStep(1) : undefined} />
    </View>
  );
}

/** The whole counter, for a list: what it is called, what kind it is, what it means, and its number. */
export function CounterRow({ c, onStep }: { c: AdversaryCounter; onStep?: (delta: number) => void }) {
  return (
    <ChamferBox chamfer={8} fill="rgba(16,20,26,0.7)" stroke={DmRune.line} strokeWidth={1.1} style={{ padding: 10, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, gap: 1 }}>
          <Text numberOfLines={1} style={{ color: DmRune.ivory, fontSize: DmType.body, fontFamily: Body.bold, letterSpacing: 0.3 }}>{c.name || 'Counter'}</Text>
          <Text style={{ color: DmRune.accentDim, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 0.7, textTransform: 'uppercase' }}>{counterNote(c)}</Text>
        </View>
        <CounterStepper c={c} onStep={onStep} />
      </View>
      {c.text ? <Text style={{ color: DmRune.text, fontSize: DmType.body, fontFamily: Body.regular, lineHeight: 16.5 }}>{c.text}</Text> : null}
    </ChamferBox>
  );
}
