/**
 * Authoring a CLASS and its FUNCTIONAL ELEMENTS (v0.42.0, owner).
 *
 * Two forms that only ever appear in the expansion editor, kept out of `library-screen` because that
 * file is already the longest in the feature and these are self-contained: a class spec is a form over
 * `CustomClassSpec`, and a function list is a form over `CardFunction[]`. Neither knows anything about
 * the library beyond the shape it edits.
 *
 * The class form asks for exactly what an official class carries, because that is what makes a
 * homebrew one playable rather than decorative. What is missing is reported by `lib/custom-class`,
 * which is also the share gate, so the form never has to decide what "complete" means.
 */
import { Pressable, Text, TextInput, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { CardFunctionControl } from '@/components/card-function-control';
import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Rune } from '@/constants/theme';
import { type CardFunction, type FunctionKind, type FunctionState, functionSummary, newFunction, stateOf } from '@/lib/card-functions';
import { ALL_DOMAINS } from '@/constants/identity';
import { type CustomClassSpec, EMPTY_CLASS_SPEC } from '@/lib/custom-class';

const smallLabel = { color: Rune.bronze, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' as const };
const chipRow = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 };

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={label}>
      <View style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 5, backgroundColor: on ? Rune.red : 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: on ? 'transparent' : 'rgba(218,162,73,0.4)' }}>
        <Text style={{ color: on ? Rune.ivory : Rune.sheet, fontSize: 12.5, fontFamily: Body.bold }}>{label}</Text>
      </View>
    </Pressable>
  );
}

function Field({ label, value, onChangeText, placeholder, multiline, numeric, maxLength }: { label: string; value: string; onChangeText: (t: string) => void; placeholder?: string; multiline?: boolean; numeric?: boolean; maxLength?: number }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={smallLabel}>{label}</Text>
      <ChamferBox chamfer={6} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ minHeight: multiline ? 62 : 40, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: multiline ? 7 : 0 }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Rune.muted}
          multiline={multiline}
          keyboardType={numeric ? 'number-pad' : 'default'}
          maxLength={maxLength}
          accessibilityLabel={label}
          style={{ color: Rune.sheet, fontSize: multiline ? 13 : 14, fontFamily: multiline ? Body.regular : Body.semibold, padding: 0, textAlignVertical: multiline ? 'top' : 'center', minHeight: multiline ? 46 : undefined, lineHeight: multiline ? 18 : undefined }}
        />
      </ChamferBox>
    </View>
  );
}

function RemoveX({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}>
      <Svg width={14} height={14} viewBox="0 0 16 16"><Line x1={3} y1={3} x2={13} y2={13} stroke={Rune.red} strokeWidth={2} /><Line x1={13} y1={3} x2={3} y2={13} stroke={Rune.red} strokeWidth={2} /></Svg>
    </Pressable>
  );
}

const num = (t: string) => Math.max(0, parseInt(t.replace(/[^0-9]/g, '') || '0', 10));

export function ClassSpecForm({ spec, onChange }: { spec: CustomClassSpec | undefined; onChange: (s: CustomClassSpec) => void }) {
  const s = spec ?? EMPTY_CLASS_SPEC;
  const set = (patch: Partial<CustomClassSpec>) => onChange({ ...s, ...patch });
  return (
    <View style={{ gap: 10 }}>
      {/* v0.42.1 (owner): the heading is printed by the panel that hosts this form, so printing it
          again here said "Class details" twice for no reason. */}
      <Text style={{ color: Rune.muted, fontSize: 9.5, fontFamily: Body.regular, lineHeight: 13 }}>
        A class needs all of this to be played, and at least one subclass in the same expansion. The Share button says what is missing.
      </Text>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Field label="Starting Evasion" value={String(s.startingEvasion)} onChangeText={(t) => set({ startingEvasion: num(t) })} numeric maxLength={2} />
        <Field label="Starting Hit Points" value={String(s.startingHp)} onChangeText={(t) => set({ startingHp: num(t) })} numeric maxLength={2} />
      </View>

      <Field label="Class items" value={s.classItems} onChangeText={(classItems) => set({ classItems })} placeholder="A worn compass or a bundle of dried sage" maxLength={120} />
      <Field label="Summary" value={s.summary} onChangeText={(summary) => set({ summary })} placeholder="What this class is, in the voice of the printed cards." multiline maxLength={400} />

      {/**
        * The two domains are CHOSEN, not typed (v0.42.1, owner: "how does the card ever know what its
        * domains are for picking domain cards???").
        *
        * A typed domain is a string that matches nothing, so the class granted no cards at all. These
        * are the real domain keys, which is what creation looks a domain card up by.
        */}
      <View style={{ gap: 6 }}>
        <Text style={smallLabel}>Domains it grants (pick two)</Text>
        <View style={chipRow}>
          {ALL_DOMAINS.map((d) => {
            const chosen = s.domains.includes(d);
            return (
              <Chip
                key={d}
                label={d}
                on={chosen}
                onPress={() => {
                  const next = chosen ? s.domains.filter((x) => x !== d) : [...s.domains.filter((x) => x.trim()), d];
                  set({ domains: next.slice(-2) });
                }}
              />
            );
          })}
        </View>
        <Text style={{ color: Rune.muted, fontSize: 9.5, fontFamily: Body.regular }}>
          {s.domains.filter((d) => d.trim()).length === 2 ? `Grants ${s.domains.filter((d) => d.trim()).join(' and ')}.` : 'A class grants two domains. Picking a third replaces the first.'}
        </Text>
      </View>

      <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: 'rgba(218,162,73,0.25)', paddingTop: 10 }}>
        <Text style={smallLabel}>Hope feature</Text>
        <Field label="Name" value={s.hopeFeature.name} onChangeText={(name) => set({ hopeFeature: { ...s.hopeFeature, name } })} placeholder="e.g. Root" maxLength={60} />
        <Field label="What it does" value={s.hopeFeature.text} onChangeText={(text) => set({ hopeFeature: { ...s.hopeFeature, text } })} placeholder="Spend 3 Hope to…" multiline maxLength={600} />
      </View>

      <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: 'rgba(218,162,73,0.25)', paddingTop: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={smallLabel}>Class features ({s.features.length})</Text>
          <Pressable onPress={() => set({ features: [...s.features, { name: '', text: '' }] })} hitSlop={8} accessibilityRole="button" accessibilityLabel="Add a class feature">
            <Text style={{ color: Rune.goldText, fontSize: 12, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>+ Add</Text>
          </Pressable>
        </View>
        <Text style={{ color: Rune.muted, fontSize: 9.5, fontFamily: Body.regular, lineHeight: 13 }}>
          One card each, plus one for the Hope feature. At least one, so the class is at least two cards.
        </Text>
        {s.features.map((f, i) => (
          <ChamferBox key={i} chamfer={7} fill="rgba(20,24,31,0.55)" stroke="rgba(218,162,73,0.3)" strokeWidth={1.1} style={{ padding: 9, gap: 7 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Field label={`Feature ${i + 1}`} value={f.name} onChangeText={(name) => set({ features: s.features.map((x, j) => (j === i ? { ...x, name } : x)) })} placeholder="Name" maxLength={60} />
              <View style={{ paddingTop: 16 }}><RemoveX label={`Remove feature ${i + 1}`} onPress={() => set({ features: s.features.filter((_, j) => j !== i) })} /></View>
            </View>
            <Field label="What it does" value={f.text} onChangeText={(text) => set({ features: s.features.map((x, j) => (j === i ? { ...x, text } : x)) })} placeholder="The rule, in full." multiline maxLength={900} />
          </ChamferBox>
        ))}
      </View>
    </View>
  );
}

// ------------------------------------------------------------------------------- functional cards

const KINDS: { key: FunctionKind; label: string }[] = [
  { key: 'counter', label: 'Counter' },
  { key: 'text', label: 'Text field' },
  { key: 'cycle', label: 'Cycling button' },
];

function FunctionEditor({ fn, state, onChange, onState, onRemove }: {
  fn: CardFunction;
  state: FunctionState;
  onChange: (f: CardFunction) => void;
  onState: (s: FunctionState) => void;
  onRemove: () => void;
}) {
  return (
    <ChamferBox chamfer={8} fill="rgba(20,24,31,0.55)" stroke="rgba(218,162,73,0.3)" strokeWidth={1.1} style={{ padding: 10, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, color: Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>{functionSummary(fn)}</Text>
        <RemoveX label="Remove this element" onPress={onRemove} />
      </View>

      <View style={chipRow}>{KINDS.map((k) => <Chip key={k.key} label={k.label} on={fn.kind === k.key} onPress={() => onChange({ ...newFunction(fn.id, k.key), label: fn.label, placement: fn.placement })} />)}</View>

      <Field label="Subtitle (optional)" value={fn.label ?? ''} onChangeText={(label) => onChange({ ...fn, label })} placeholder="What this is" maxLength={40} />

      <View style={{ gap: 4 }}>
        <Text style={smallLabel}>Where it sits</Text>
        <View style={chipRow}>
          <Chip label="Above the text" on={fn.placement === 'above'} onPress={() => onChange({ ...fn, placement: 'above' })} />
          <Chip label="Below the text" on={fn.placement === 'below'} onPress={() => onChange({ ...fn, placement: 'below' })} />
        </View>
      </View>

      {fn.kind === 'counter' ? (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Field label="Starts at" value={String(fn.start ?? 0)} onChangeText={(t) => onChange({ ...fn, start: num(t) })} numeric maxLength={3} />
            {/* v0.42.1 (owner): a RANGE, so a counter can be held between two numbers rather than
                only under a ceiling. Zero on either end means "no limit that way". */}
            <Field label="Lowest" value={String(fn.min ?? 0)} onChangeText={(t) => onChange({ ...fn, min: num(t) || undefined })} numeric maxLength={3} />
            <Field label="Highest (0 = none)" value={String(fn.max ?? 0)} onChangeText={(t) => onChange({ ...fn, max: num(t) || undefined })} numeric maxLength={3} />
          </View>
          <View style={chipRow}>
            <Chip label="Counts down only" on={!!fn.countdown} onPress={() => onChange({ ...fn, countdown: !fn.countdown, loop: fn.countdown ? undefined : fn.loop })} />
            {fn.countdown ? <Chip label="Restarts below zero" on={!!fn.loop} onPress={() => onChange({ ...fn, loop: !fn.loop })} /> : null}
          </View>
        </View>
      ) : null}

      {fn.kind === 'text' ? (
        <View style={{ gap: 8 }}>
          <Field label="Placeholder" value={fn.placeholder ?? ''} onChangeText={(placeholder) => onChange({ ...fn, placeholder })} placeholder="What to write here" maxLength={60} />
          <View style={{ gap: 4 }}>
            <Text style={smallLabel}>How big</Text>
            <View style={chipRow}>
              {[1, 2, 4].map((n) => <Chip key={n} label={n === 1 ? 'A word' : n === 2 ? 'A sentence' : 'A paragraph'} on={(fn.lines ?? 1) === n} onPress={() => onChange({ ...fn, lines: n })} />)}
            </View>
          </View>
        </View>
      ) : null}

      {fn.kind === 'cycle' ? (
        <View style={{ gap: 6 }}>
          <Text style={smallLabel}>Options, one per line</Text>
          <ChamferBox chamfer={6} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ minHeight: 70, paddingHorizontal: 10, paddingVertical: 7 }}>
            <TextInput
              value={(fn.options ?? []).join('\n')}
              onChangeText={(t) => onChange({ ...fn, options: t.split('\n') })}
              multiline
              placeholder={'Calm\nRoused\nRaging'}
              placeholderTextColor={Rune.muted}
              accessibilityLabel="Cycle options"
              style={{ color: Rune.sheet, fontSize: 13, fontFamily: Body.regular, padding: 0, textAlignVertical: 'top', minHeight: 56, lineHeight: 18 }}
            />
          </ChamferBox>
          <Field label="Starts on option number" value={String((fn.startIndex ?? 0) + 1)} onChangeText={(t) => onChange({ ...fn, startIndex: Math.max(0, num(t) - 1) })} numeric maxLength={2} />
        </View>
      ) : null}

      {/* v0.42.1 (owner): a line before and a line after the control, so a locked element can explain
          itself where it is rather than somewhere else on the card. */}
      <Field label="Line above the control" value={fn.before ?? ''} onChangeText={(before) => onChange({ ...fn, before })} placeholder="Optional" maxLength={160} />
      <Field label="Line below the control" value={fn.after ?? ''} onChangeText={(after) => onChange({ ...fn, after })} placeholder="e.g. Raise this once per tier as a level advancement." maxLength={160} />

      {/* v0.42.1 (owner): locked and hidden. Locked shows the value and refuses to move; hidden is
          not drawn at all. Only a level advancement opens either. */}
      <View style={{ gap: 4 }}>
        <Text style={smallLabel}>Can the player change it?</Text>
        <View style={chipRow}>
          <Chip label="Yes, freely" on={!fn.locked && !fn.hidden} onPress={() => onChange({ ...fn, locked: undefined, hidden: undefined })} />
          <Chip label="Locked" on={!!fn.locked && !fn.hidden} onPress={() => onChange({ ...fn, locked: true, hidden: undefined })} />
          <Chip label="Hidden until unlocked" on={!!fn.hidden} onPress={() => onChange({ ...fn, locked: true, hidden: true })} />
        </View>
      </View>

      {/* The REAL control, with real state (owner): "the card should be able to be tested with its
          functionality during the preview". A picture of a control is not a test of one. */}
      <View style={{ gap: 5, borderTopWidth: 1, borderTopColor: 'rgba(218,162,73,0.25)', paddingTop: 9 }}>
        <Text style={smallLabel}>Try it</Text>
        <View style={{ backgroundColor: Rune.sheet, borderRadius: 6, padding: 10 }}>
          <CardFunctionControl fn={fn} state={state} onChange={onState} />
        </View>
      </View>
    </ChamferBox>
  );
}

export function CardFunctionsForm({ functions, states, onChange, onStates }: {
  functions: CardFunction[] | undefined;
  states: Record<string, FunctionState>;
  onChange: (f: CardFunction[]) => void;
  onStates: (s: Record<string, FunctionState>) => void;
}) {
  const list = functions ?? [];
  const add = (kind: FunctionKind) => onChange([...list, newFunction(`fn-${Date.now().toString(36)}-${list.length}`, kind)]);
  return (
    <View style={{ gap: 9 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={smallLabel}>Functional elements</Text>
      </View>
      <Text style={{ color: Rune.muted, fontSize: 9.5, fontFamily: Body.regular, lineHeight: 13 }}>
        Something the player uses on the card itself: a number they move, a line they write on, a state they switch. Try each one below before you share it.
      </Text>
      <View style={chipRow}>{KINDS.map((k) => <Chip key={k.key} label={`+ ${k.label}`} on={false} onPress={() => add(k.key)} />)}</View>
      {list.map((fn, i) => (
        <FunctionEditor
          key={fn.id}
          fn={fn}
          state={stateOf(fn, states[fn.id])}
          onChange={(next) => onChange(list.map((x, j) => (j === i ? next : x)))}
          onState={(st) => onStates({ ...states, [fn.id]: st })}
          onRemove={() => onChange(list.filter((_, j) => j !== i))}
        />
      ))}
      {list.length ? <RuneButton label="Clear all elements" kind="ghost" dense height={34} onPress={() => onChange([])} /> : null}
    </View>
  );
}
