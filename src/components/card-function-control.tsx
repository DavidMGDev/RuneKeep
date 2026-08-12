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

function StepButton({ plus, label, disabled, size = 28, onPress }: { plus: boolean; label: string; disabled: boolean; size?: number; onPress: () => void }) {
  return (
    <Pressable onPress={() => { if (disabled) return; playSfx('placeToken', { cents: plus ? 160 : -180 }); onPress(); }} disabled={disabled} hitSlop={6} accessibilityRole="button" accessibilityState={{ disabled }} accessibilityLabel={label}>
      <ChamferBox chamfer={5} fill="rgba(20,24,31,0.85)" stroke={GOLD_EDGE} strokeWidth={1.1} style={{ width: size, height: size - 2, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 }}>
        <Svg width={13} height={13} viewBox="0 0 16 16">
          <Line x1={4} y1={8} x2={12} y2={8} stroke={Rune.goldText} strokeWidth={2} strokeLinecap="round" />
          {plus ? <Line x1={8} y1={4} x2={8} y2={12} stroke={Rune.goldText} strokeWidth={2} strokeLinecap="round" /> : null}
        </Svg>
      </ChamferBox>
    </Pressable>
  );
}

/**
 * The three sizes an author may choose (v0.42.3, owner), as the numbers each control uses.
 *
 * One table rather than three scattered ternaries, so "large" means the same amount of larger to a
 * counter, a cycle and a text field, and so adding a fourth size later is one row.
 */
const SIZES = {
  small: { number: 14, step: 24, cycleH: 24, cycleText: 9.5, line: 13, text: 9.5, title: 7.5, gap: 3 },
  medium: { number: 17, step: 28, cycleH: 28, cycleText: 11, line: 15, text: 11, title: 8.5, gap: 4 },
  large: { number: 22, step: 34, cycleH: 34, cycleText: 13, line: 18, text: 13, title: 10, gap: 6 },
} as const;

/** What one element occupies vertically, so the card's prose can be sized around it. */
export function functionHeight(fn: CardFunction): number {
  if (fn.hidden) return 0;
  const s = SIZES[fn.size ?? 'medium'];
  const titleH = fn.titleHidden ? 0 : s.title + 4;
  const controlH = fn.kind === 'text' ? 8 + Math.max(1, fn.lines ?? 1) * s.line : fn.kind === 'cycle' ? s.cycleH : s.step;
  return titleH + controlH + s.gap + 4;
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
  const S = SIZES[fn.size ?? 'medium'];
  const gap = S.gap;
  const label = fn.title?.trim();
  /**
   * HUG or FULL (v0.42.3, owner: "if the element should be full card width or just hug the text /
   * number it has for its size").
   *
   * Hug is the default because a counter that stretches across a card looks like a bug. Full is for
   * the one element a card is really about, and for a text field somebody is meant to write in.
   */
  const full = fn.width === 'full';
  /**
   * A LOCKED element is read-only, and a HIDDEN one is not there at all (v0.42.1, owner).
   *
   * The difference matters: locked says "your Combo Die is a d4" and means it; hidden says nothing,
   * because a feature you do not have yet is not a greyed-out feature. Only a level advancement
   * opens either (see `applyAdvance`).
   */
  const move = fn.locked ? undefined : onChange;

  const body = () => {
    if (fn.kind === 'counter') {
      const n = st.n ?? 0;
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: full ? 'space-between' : 'center', gap: 8, alignSelf: full ? 'stretch' : 'center' }}>
          <StepButton size={S.step} plus={false} label={`Lower ${label || 'the counter'}`} disabled={!move || !canStepFunction(fn, st, -1)} onPress={() => move?.(stepFunction(fn, st, -1))} />
          <Text
            accessibilityLabel={`${label || 'Counter'} at ${n}${fn.max ? ` of ${fn.max}` : ''}`}
            style={{ minWidth: 34, textAlign: 'center', color: Rune.inkText, fontSize: S.number, lineHeight: S.number + 4, fontFamily: Display.black, fontVariant: ['tabular-nums'] }}>
            {n}{fn.max != null && fn.max > 0 ? <Text style={{ fontSize: S.number * 0.6, color: Rune.inkMuted }}>{` /${fn.max}`}</Text> : null}
          </Text>
          {/* A countdown has no plus at all: its direction is part of what it is. */}
          {fn.countdown ? <View style={{ width: S.step }} /> : <StepButton size={S.step} plus label={`Raise ${label || 'the counter'}`} disabled={!move || !canStepFunction(fn, st, 1)} onPress={() => move?.(stepFunction(fn, st, 1))} />}
        </View>
      );
    }
    if (fn.kind === 'cycle') {
      return (
        <Pressable
          onPress={() => { if (!move) return; playSfx('buttonTap'); move(cycleFunction(fn, st)); }}
          disabled={!move}
          style={{ alignSelf: full ? 'stretch' : 'center' }}
          accessibilityRole="button"
          accessibilityLabel={`${label || 'Option'}: ${cycleLabel(fn, st)}. Tap to change.`}>
          <ChamferBox chamfer={6} fill="rgba(218,162,73,0.14)" stroke={Rune.goldEdge} strokeWidth={1.2} style={{ minWidth: full ? undefined : 84, height: S.cycleH, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}>
            <Text numberOfLines={1} style={{ color: Rune.goldText, fontSize: S.cycleText, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>{cycleLabel(fn, st)}</Text>
          </ChamferBox>
        </Pressable>
      );
    }
    const lines = Math.max(1, fn.lines ?? 1);
    return (
      // A text field ignores hug: a box you write in that is as wide as its placeholder is a box you
      // cannot write in. It stretches, and `width` governs the counters and cycles it sits among.
      <ChamferBox chamfer={5} fill="rgba(20,24,31,0.06)" stroke={GOLD_EDGE} strokeWidth={1.1} style={{ alignSelf: 'stretch', minHeight: 8 + lines * S.line, justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 4 }}>
        <TextInput
          value={st.s ?? ''}
          onChangeText={(s) => move?.(setTextValue(s))}
          editable={!!move}
          multiline={lines > 1}
          placeholder={fn.placeholder || ''}
          placeholderTextColor={Rune.inkMuted}
          accessibilityLabel={label || 'Write here'}
          style={{ color: Rune.inkText, fontSize: S.text, fontFamily: Body.regular, padding: 0, minHeight: lines * S.line, textAlignVertical: lines > 1 ? 'top' : 'center' }}
        />
      </ChamferBox>
    );
  };

  if (fn.hidden) return null;
  void compact;
  return (
    /**
     * The TITLE, centred, above (v0.42.3, owner).
     *
     * Standard on every element rather than optional, because the title is also the element's name in
     * the dice and modifier variable lists, and an element nobody named is one nobody can pick out of
     * a list. `titleHidden` takes it off the CARD; it never takes it off those lists.
     */
    <View style={{ gap, alignSelf: full ? 'stretch' : 'center', alignItems: 'center' }}>
      {fn.titleHidden || !label ? null : (
        <Text numberOfLines={1} style={{ color: Rune.inkMuted, fontSize: SIZES[fn.size ?? 'medium'].title, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase', textAlign: 'center' }}>
          {label}{fn.locked ? ' · LOCKED' : ''}
        </Text>
      )}
      {body()}
    </View>
  );
}
