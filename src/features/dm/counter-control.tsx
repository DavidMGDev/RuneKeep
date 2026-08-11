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
import { type AdversaryCounter, canStep, counterNote, isSpent } from '@/lib/dm-counters';
import { playSfx } from '@/lib/sfx';
import { DmPress } from './dm-ui';

type Glyph = 'plus' | 'minus' | 'cross';

function StepButton({ glyph, label, size, danger, onPress }: { glyph: Glyph; label: string; size: number; danger?: boolean; onPress?: () => void }) {
  const arm = size * 0.3;
  const tint = danger ? DmRune.red : DmRune.accent;
  return (
    <DmPress onPress={onPress} disabled={!onPress} hitSlop={7} accessibilityRole="button" accessibilityLabel={label}>
      <ChamferBox
        chamfer={5}
        fill="rgba(20,24,30,0.92)"
        stroke={danger ? DmRune.red : DmRune.accentDim}
        strokeWidth={1.2}
        style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', opacity: onPress ? 1 : 0.45 }}>
        <Svg width={size * 0.62} height={size * 0.62} viewBox={`0 0 ${size} ${size}`}>
          {glyph === 'cross' ? (
            <>
              <Line x1={size / 2 - arm * 0.8} y1={size / 2 - arm * 0.8} x2={size / 2 + arm * 0.8} y2={size / 2 + arm * 0.8} stroke={tint} strokeWidth={2.2} strokeLinecap="round" />
              <Line x1={size / 2 + arm * 0.8} y1={size / 2 - arm * 0.8} x2={size / 2 - arm * 0.8} y2={size / 2 + arm * 0.8} stroke={tint} strokeWidth={2.2} strokeLinecap="round" />
            </>
          ) : (
            <>
              <Line x1={size / 2 - arm} y1={size / 2} x2={size / 2 + arm} y2={size / 2} stroke={tint} strokeWidth={2} strokeLinecap="round" />
              {glyph === 'plus' ? <Line x1={size / 2} y1={size / 2 - arm} x2={size / 2} y2={size / 2 + arm} stroke={tint} strokeWidth={2} strokeLinecap="round" /> : null}
            </>
          )}
        </Svg>
      </ChamferBox>
    </DmPress>
  );
}

/**
 * The number and its buttons (v0.41.4, owner).
 *
 * The control draws what the MODEL says is possible rather than deciding for itself, which is why
 * `canStep` and `isSpent` live in `lib/dm-counters`. A resource keeps both buttons. A countdown loses
 * its plus, because a timer that can be wound backwards is not a timer. And a countdown that does not
 * loop, once it reaches zero, turns its minus into an X: there is nowhere left for it to go, and the
 * press means "this is over", so it fells the adversary exactly as the X on any other entry does.
 *
 * `onStep` absent draws it read-only, which is how the library shows a counter it cannot change.
 */
export function CounterStepper({ c, size = 30, onStep, onSpent }: {
  c: AdversaryCounter;
  size?: number;
  onStep?: (delta: number) => void;
  /** Pressed the X on a spent countdown. Absent leaves the button inert rather than lying about it. */
  onSpent?: () => void;
}) {
  const spent = isSpent(c);
  const name = c.name || 'the counter';
  const down = () => {
    if (!onStep) return;
    // The wrap gets a voice of its own: a timer coming back round is a different event from a tick.
    const wraps = c.kind === 'countdown' && c.loop && c.value - 1 < 0;
    playSfx(wraps ? 'transitionIconFilled' : 'placeToken', wraps ? undefined : { cents: -180 });
    onStep(-1);
  };
  const up = () => {
    if (!onStep) return;
    playSfx('placeToken', { cents: 160 });
    onStep(1);
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {spent ? (
        <StepButton glyph="cross" danger size={size} label={`${name} has run out. Down this adversary`} onPress={onSpent ? () => { playSfx('cardDisable'); onSpent(); } : undefined} />
      ) : (
        <StepButton glyph="minus" size={size} label={`Lower ${name}`} onPress={onStep && canStep(c, -1) ? down : undefined} />
      )}
      <Text
        accessibilityLabel={`${c.name || 'Counter'} at ${c.value}`}
        style={{ minWidth: size + 6, textAlign: 'center', color: spent ? DmRune.red : DmRune.ivory, fontSize: size * 0.66, lineHeight: size * 0.82, fontFamily: Display.black, fontVariant: ['tabular-nums'] }}>
        {c.value}
      </Text>
      {/* A countdown has no plus at all: its direction is part of what it IS. */}
      {c.kind === 'countdown' ? null : <StepButton glyph="plus" size={size} label={`Raise ${name}`} onPress={onStep ? up : undefined} />}
    </View>
  );
}

/** The whole counter, for a list: what it is called, what kind it is, what it means, and its number. */
export function CounterRow({ c, onStep, onSpent }: { c: AdversaryCounter; onStep?: (delta: number) => void; onSpent?: () => void }) {
  return (
    <ChamferBox chamfer={8} fill="rgba(16,20,26,0.7)" stroke={DmRune.line} strokeWidth={1.1} style={{ padding: 10, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, gap: 1 }}>
          <Text numberOfLines={1} style={{ color: DmRune.ivory, fontSize: DmType.body, fontFamily: Body.bold, letterSpacing: 0.3 }}>{c.name || 'Counter'}</Text>
          <Text style={{ color: DmRune.accentDim, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 0.7, textTransform: 'uppercase' }}>{counterNote(c)}</Text>
        </View>
        <CounterStepper c={c} onStep={onStep} onSpent={onSpent} />
      </View>
      {c.text ? <Text style={{ color: DmRune.text, fontSize: DmType.body, fontFamily: Body.regular, lineHeight: 16.5 }}>{c.text}</Text> : null}
    </ChamferBox>
  );
}
