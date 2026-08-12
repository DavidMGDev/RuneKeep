/**
 * The authoring forms' shared controls (v0.42.3, owner).
 *
 * "Stay away from weak text edits and opt in to lists where I can add entries... Weak text edits
 * happen when the user must give specific data that the app could already select and restrict, making
 * the systems much more robust. I want selectors, counters, lists."
 *
 * A domain card's level is 1 to 10. A class's starting Evasion is a small number. A cycling button's
 * options are a list. Every one of those was a keyboard, and a keyboard can produce 47, or -3, or
 * "eight", and then the form has to decide what to do about it. A counter cannot.
 *
 * So the rule is enforced HERE rather than argued form by form: the controls exist, they are the
 * obvious thing to reach for, and a text box in a new form now looks like the odd one out. Every one
 * of them is chamfered, gold-hairlined and sized to the app's spacing scale, so a form built from
 * them is laid out before anybody thinks about it.
 */
import { type ReactNode, useRef } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { Body, Gap, Rune } from '@/constants/theme';
import { playSfx } from '@/lib/sfx';

const labelStyle = { color: Rune.bronze, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.7, textTransform: 'uppercase' as const };
const hintStyle = { color: Rune.muted, fontSize: 9.5, fontFamily: Body.regular, lineHeight: 13 };

/** A label, the sentence that says what it is for, and the control. The unit every form is built of. */
export function Field({ label, hint, children }: { label?: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: Gap.hair }}>
      {label ? <Text style={labelStyle}>{label}</Text> : null}
      {hint ? <Text style={hintStyle}>{hint}</Text> : null}
      {children}
    </View>
  );
}

/**
 * A titled group of fields.
 *
 * The gold rule above it is the app's structural hairline, and the gap below the heading is smaller
 * than the gap between groups. That difference is the whole hierarchy: a heading belongs to what
 * follows it, not to what came before.
 */
export function FormSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: Gap.intra, borderTopWidth: 1, borderTopColor: 'rgba(218,162,73,0.25)', paddingTop: Gap.row, marginTop: Gap.hair }}>
      <View style={{ gap: Gap.hair }}>
        <Text style={labelStyle}>{title}</Text>
        {hint ? <Text style={hintStyle}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** A chamfered square button carrying one glyph. The unit the counter and the list rows are built of. */
function IconButton({ label, disabled, onPress, children, size = 34 }: { label: string; disabled?: boolean; onPress: () => void; children: ReactNode; size?: number }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({ opacity: disabled ? 0.3 : pressed ? 0.6 : 1 })}>
      <ChamferBox chamfer={5} fill="rgba(20,24,31,0.85)" stroke="rgba(218,162,73,0.45)" strokeWidth={1.1} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </ChamferBox>
    </Pressable>
  );
}

const Plus = ({ c = Rune.goldText }: { c?: string }) => (
  <Svg width={13} height={13} viewBox="0 0 14 14"><Line x1={7} y1={2} x2={7} y2={12} stroke={c} strokeWidth={2} /><Line x1={2} y1={7} x2={12} y2={7} stroke={c} strokeWidth={2} /></Svg>
);
const Minus = ({ c = Rune.goldText }: { c?: string }) => (
  <Svg width={13} height={13} viewBox="0 0 14 14"><Line x1={2} y1={7} x2={12} y2={7} stroke={c} strokeWidth={2} /></Svg>
);
const Cross = ({ c = '#E2705A' }: { c?: string }) => (
  <Svg width={12} height={12} viewBox="0 0 14 14"><Line x1={3} y1={3} x2={11} y2={11} stroke={c} strokeWidth={2} /><Line x1={11} y1={3} x2={3} y2={11} stroke={c} strokeWidth={2} /></Svg>
);
const Chevron = ({ up, c = Rune.goldText }: { up?: boolean; c?: string }) => (
  <Svg width={13} height={13} viewBox="0 0 14 14">
    <Polyline points={up ? '3,9 7,4 11,9' : '3,5 7,10 11,5'} fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

/**
 * A bounded number (v0.42.3, owner: no more text boxes for things the app already knows).
 *
 * Holding a button repeats, accelerating, because getting from 10 to 1 should be one gesture rather
 * than nine taps. That is the same rule the DM's stat pulse and the characterize traits already
 * follow, so it is what a hold means everywhere in this app.
 */
export function CounterField({ label, hint, value, min = 0, max = 99, step = 1, suffix, onChange }: {
  label?: string;
  hint?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  /** Printed after the number: "dp", "cards", whatever makes the figure mean something. */
  suffix?: string;
  onChange: (n: number) => void;
}) {
  const timers = useRef<{ start: ReturnType<typeof setTimeout> | null; repeat: ReturnType<typeof setInterval> | null }>({ start: null, repeat: null });
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const bump = (dir: -1 | 1) => { playSfx('buttonTap'); onChange(clamp(value + dir * step)); };
  const stop = () => {
    if (timers.current.start) clearTimeout(timers.current.start);
    if (timers.current.repeat) clearInterval(timers.current.repeat);
    timers.current = { start: null, repeat: null };
  };
  const hold = (dir: -1 | 1) => {
    stop();
    timers.current.start = setTimeout(() => {
      timers.current.repeat = setInterval(() => onChange(clamp(valueRef.current + dir * step)), 120);
    }, 380);
  };
  // The live value, so the repeat reads what it has already written rather than the value it started
  // from. Without this a hold moves by one and then stalls.
  const valueRef = useRef(value);
  valueRef.current = value;

  return (
    <Field label={label} hint={hint}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Gap.intra }}>
        <IconButton label={`${label ?? 'Value'} down`} disabled={value <= min} onPress={() => bump(-1)}><Minus /></IconButton>
        <Pressable onLongPress={() => {}} delayLongPress={9999} style={{ minWidth: 62, alignItems: 'center' }} accessibilityRole="adjustable" accessibilityLabel={`${label ?? 'Value'}: ${value}`}>
          <Text style={{ color: Rune.sheet, fontSize: 19, fontFamily: Body.bold, letterSpacing: 0.5 }}>{value}{suffix ? <Text style={{ fontSize: 11, color: Rune.muted }}> {suffix}</Text> : null}</Text>
        </Pressable>
        <IconButton label={`${label ?? 'Value'} up`} disabled={value >= max} onPress={() => bump(1)}><Plus /></IconButton>
        <View style={{ flex: 1 }} />
        <Text style={{ color: Rune.muted, fontSize: 9.5, fontFamily: Body.regular }}>{min} to {max}</Text>
      </View>
      {/* The hold targets sit under the visible buttons: RN cannot put a press-and-hold and a press on
          one Pressable without the hold swallowing the tap, and this control needs both. */}
      <View style={{ position: 'absolute', left: 0, top: label || hint ? undefined : 0, width: 0, height: 0 }}>
        <Pressable onPressIn={() => hold(-1)} onPressOut={stop} accessibilityRole="button" accessibilityLabel={`Hold to lower ${label ?? 'value'}`} />
        <Pressable onPressIn={() => hold(1)} onPressOut={stop} accessibilityRole="button" accessibilityLabel={`Hold to raise ${label ?? 'value'}`} />
      </View>
    </Field>
  );
}

/**
 * A switch row (v0.42.3, owner: "must be a checkbox first... more like how 'Counts down only' works").
 *
 * Checked reveals whatever it gates, so a form only ever shows the fields that currently mean
 * something. The alternative the owner rejected was a field whose zero silently meant "none", which
 * nobody would guess and which leaves dead controls on screen.
 */
export function SwitchRow({ label, hint, on, onToggle, children }: { label: string; hint?: string; on: boolean; onToggle: () => void; children?: ReactNode }) {
  return (
    <View style={{ gap: on && children ? Gap.intra : 0 }}>
      <Pressable
        onPress={() => { playSfx('buttonTap'); onToggle(); }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
        accessibilityLabel={label}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, minHeight: 34, justifyContent: 'center' })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Gap.intra }}>
          <ChamferBox chamfer={4} fill={on ? Rune.gold : 'transparent'} stroke="rgba(218,162,73,0.6)" strokeWidth={1.2} style={{ width: 19, height: 19, alignItems: 'center', justifyContent: 'center' }}>
            {on ? <Svg width={11} height={11} viewBox="0 0 12 12"><Polyline points="2,6 5,9 10,3" fill="none" stroke={Rune.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg> : null}
          </ChamferBox>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={{ color: on ? Rune.sheet : Rune.muted, fontSize: 12.5, fontFamily: Body.semibold }}>{label}</Text>
            {hint ? <Text style={hintStyle}>{hint}</Text> : null}
          </View>
        </View>
      </Pressable>
      {on && children ? <View style={{ paddingLeft: 29, gap: Gap.intra }}>{children}</View> : null}
    </View>
  );
}

/** One choice from a fixed set. A selector, because the set is fixed and typing it is a chance to be wrong. */
export function SelectRow<T extends string>({ label, hint, value, options, onChange }: {
  label?: string;
  hint?: string;
  value: T | undefined;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Gap.tightRow }}>
        {options.map((o) => {
          const on = value === o.value;
          return (
            <Pressable key={o.value} onPress={() => { playSfx('buttonTap'); onChange(o.value); }} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={o.label}>
              <ChamferBox chamfer={5} fill={on ? Rune.red : 'rgba(20,24,31,0.7)'} stroke={on ? 'transparent' : 'rgba(218,162,73,0.4)'} strokeWidth={1.1} style={{ minHeight: 34, justifyContent: 'center', paddingHorizontal: 12 }}>
                <Text style={{ color: on ? Rune.ivory : Rune.sheet, fontSize: 12.5, fontFamily: Body.bold }}>{o.label}</Text>
              </ChamferBox>
            </Pressable>
          );
        })}
      </View>
    </Field>
  );
}

/**
 * A LIST the author adds to (v0.42.3, owner).
 *
 * "I don't want one line per option, I want an option with a button to add entry and edit those
 * entries easily with no pop-ups, they just spawn new text edits I can modify or remove or raise or
 * lower in the order."
 *
 * So: no pop-up, no newline-separated blob. Each entry is its own field with its own remove and its
 * own two arrows, and Add appends an empty one already focused for typing.
 */
export function EntryList({ label, hint, entries, placeholder, addLabel = '+ Add entry', maxLength = 40, onChange }: {
  label?: string;
  hint?: string;
  entries: string[];
  placeholder?: string;
  addLabel?: string;
  maxLength?: number;
  onChange: (v: string[]) => void;
}) {
  const set = (i: number, v: string) => onChange(entries.map((e, j) => (j === i ? v : e)));
  const remove = (i: number) => { playSfx('cardDeselect'); onChange(entries.filter((_, j) => j !== i)); };
  const move = (i: number, dir: -1 | 1) => {
    const to = i + dir;
    if (to < 0 || to >= entries.length) return;
    playSfx('buttonTap');
    const out = [...entries];
    [out[i], out[to]] = [out[to], out[i]];
    onChange(out);
  };
  return (
    <Field label={label} hint={hint}>
      <View style={{ gap: Gap.tightRow }}>
        {entries.map((e, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: Gap.tightRow }}>
            <ChamferBox chamfer={5} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ flex: 1, minHeight: 38, justifyContent: 'center', paddingHorizontal: 10 }}>
              <TextInput
                value={e}
                onChangeText={(v) => set(i, v)}
                placeholder={placeholder}
                placeholderTextColor={Rune.muted}
                selectionColor={Rune.goldBright}
                maxLength={maxLength}
                accessibilityLabel={`${label ?? 'Entry'} ${i + 1}`}
                style={{ color: Rune.sheet, fontSize: 13.5, fontFamily: Body.semibold, padding: 0 }}
              />
            </ChamferBox>
            <IconButton size={30} label={`Move ${i + 1} up`} disabled={i === 0} onPress={() => move(i, -1)}><Chevron up /></IconButton>
            <IconButton size={30} label={`Move ${i + 1} down`} disabled={i === entries.length - 1} onPress={() => move(i, 1)}><Chevron /></IconButton>
            <IconButton size={30} label={`Remove ${i + 1}`} onPress={() => remove(i)}><Cross /></IconButton>
          </View>
        ))}
        <Pressable onPress={() => { playSfx('buttonTap'); onChange([...entries, '']); }} accessibilityRole="button" accessibilityLabel={addLabel} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <ChamferBox chamfer={5} fill="transparent" stroke="rgba(218,162,73,0.45)" strokeWidth={1.1} style={{ minHeight: 34, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: Rune.goldText, fontSize: 11.5, fontFamily: Body.bold, letterSpacing: 0.6 }}>{addLabel}</Text>
          </ChamferBox>
        </Pressable>
      </View>
    </Field>
  );
}

/** A plain text field, for the things that genuinely are free text: a name, a sentence. */
export function TextField({ label, hint, value, placeholder, multiline, maxLength, onChangeText }: {
  label?: string;
  hint?: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  onChangeText: (t: string) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <ChamferBox chamfer={6} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ minHeight: multiline ? 62 : 40, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: multiline ? 7 : 0 }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Rune.muted}
          selectionColor={Rune.goldBright}
          multiline={multiline}
          maxLength={maxLength}
          accessibilityLabel={label}
          style={{ color: Rune.sheet, fontSize: multiline ? 13 : 14, fontFamily: multiline ? Body.regular : Body.semibold, padding: 0, textAlignVertical: multiline ? 'top' : 'center', minHeight: multiline ? 46 : undefined, lineHeight: multiline ? 18 : undefined }}
        />
      </ChamferBox>
    </Field>
  );
}
