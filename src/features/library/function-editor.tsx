/**
 * Configuring a functional element (v0.42.3, owner) — rebuilt.
 *
 * The v0.42.1 form asked for a subtitle first, offered "above the text / below the text", and drew a
 * little copy of the control inside itself. All three were wrong, and the owner said so plainly: the
 * author should "first configure it then customize it", position is now the element's place in the
 * section list, and the preview is the CARD at the top of the editor, not a swatch in a panel.
 *
 * So this form is three parts in the order an author thinks in:
 *
 *   1. WHAT IT IS      the kind, and the rules of that kind
 *   2. WHAT IT IS FOR  its title (which is also its name in the dice and modifier lists), and whether
 *                      the player may move it
 *   3. HOW IT LOOKS    width and size, judged on the card above
 *
 * Nothing in here draws the element. That is the whole point.
 */
import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { CounterField, EntryList, FormSection, SelectRow, SwitchRow, TextField } from '@/components/form-controls';
import { Body, Gap, Rune } from '@/constants/theme';
import { type AdvanceEffect, type CardAdvance, type CardFunction, type FunctionKind, newFunction } from '@/lib/card-functions';
import { playSfx } from '@/lib/sfx';

const KINDS: { value: FunctionKind; label: string }[] = [
  { value: 'counter', label: 'A number' },
  { value: 'cycle', label: 'A switch' },
  { value: 'text', label: 'Something to write' },
];

const KIND_HINT: Record<FunctionKind, string> = {
  counter: 'A count the player raises and lowers. Charges, uses, a die size, a tally.',
  cycle: 'A button that walks through a list of states. A stance, a mode, a die that steps up.',
  text: 'A line or a paragraph the player writes on and can change whenever they like.',
};

/** How far a counter may be pushed either way. Wide, because a homebrew tally is nobody's business. */
const COUNT_MIN = -50;
const COUNT_MAX = 99;

export function FunctionEditor({ fn, advance, onChange, onAdvance }: {
  fn: CardFunction;
  /** The level advancement this element offers, if it offers one. */
  advance: CardAdvance | undefined;
  onChange: (f: CardFunction) => void;
  onAdvance: (a: CardAdvance | undefined) => void;
}) {
  const set = (patch: Partial<CardFunction>) => onChange({ ...fn, ...patch });
  return (
    <View style={{ gap: Gap.group }}>
      {/* 1. WHAT IT IS -------------------------------------------------------------------------- */}
      <SelectRow
        label="What it is"
        hint={KIND_HINT[fn.kind]}
        value={fn.kind}
        options={KINDS}
        // Changing the kind rebuilds the element's own rules and keeps everything that is not about
        // the kind: its name, its lock, and how it is drawn.
        onChange={(kind) => onChange({ ...newFunction(fn.id, kind), title: fn.title, titleHidden: fn.titleHidden, width: fn.width, size: fn.size, locked: fn.locked, hidden: fn.hidden })}
      />

      {fn.kind === 'counter' ? (
        <View style={{ gap: Gap.intra }}>
          <CounterField label="Starts at" value={fn.start ?? 0} min={COUNT_MIN} max={COUNT_MAX} onChange={(start) => set({ start })} />
          {/* v0.42.3 (owner): a checkbox FIRST. A field whose zero silently meant "no limit" was a
              rule nobody would guess, and it left two dead boxes on screen most of the time. */}
          <SwitchRow label="It has a lowest value" hint="Without one it can fall as far as the player pushes it." on={fn.min != null} onToggle={() => set({ min: fn.min == null ? 0 : undefined })}>
            <CounterField label="Lowest" value={fn.min ?? 0} min={COUNT_MIN} max={COUNT_MAX} onChange={(min) => set({ min })} />
          </SwitchRow>
          <SwitchRow label="It has a highest value" hint="A resource with a maximum. Without one it is an open tally." on={fn.max != null} onToggle={() => set({ max: fn.max == null ? Math.max(1, (fn.start ?? 0) || 1) : undefined })}>
            <CounterField label="Highest" value={fn.max ?? 1} min={COUNT_MIN} max={COUNT_MAX} onChange={(max) => set({ max })} />
          </SwitchRow>
          <SwitchRow label="Counts down only" hint="No plus button. Its direction is part of what it is." on={!!fn.countdown} onToggle={() => set({ countdown: !fn.countdown, loop: fn.countdown ? undefined : fn.loop })}>
            <SwitchRow label="Restarts below zero" hint="Pushed past zero it goes back to where it started." on={!!fn.loop} onToggle={() => set({ loop: !fn.loop })} />
          </SwitchRow>
        </View>
      ) : null}

      {fn.kind === 'cycle' ? (
        <View style={{ gap: Gap.intra }}>
          {/* v0.42.3 (owner): a LIST, not one line per option in a text box. */}
          <EntryList
            label="The states it walks through"
            hint="In order. The player taps the button to move to the next one. All numbers (d4, d6, d8) makes it usable as a dice and modifier variable."
            entries={fn.options ?? []}
            placeholder="e.g. Calm"
            addLabel="+ Add state"
            onChange={(options) => set({ options })}
          />
          <CounterField label="Starts on" suffix={(fn.options ?? [])[fn.startIndex ?? 0] ?? ''} value={(fn.startIndex ?? 0) + 1} min={1} max={Math.max(1, (fn.options ?? []).length)} onChange={(n) => set({ startIndex: n - 1 })} />
        </View>
      ) : null}

      {fn.kind === 'text' ? (
        <View style={{ gap: Gap.intra }}>
          <TextField label="Placeholder" hint="What the empty field suggests. Left blank it simply looks empty." value={fn.placeholder ?? ''} placeholder="What to write here" maxLength={60} onChangeText={(placeholder) => set({ placeholder })} />
          <SelectRow
            label="How big"
            value={(fn.lines ?? 1) >= 4 ? 'para' : (fn.lines ?? 1) >= 2 ? 'sentence' : 'word'}
            options={[{ value: 'word', label: 'A word' }, { value: 'sentence', label: 'A sentence' }, { value: 'para', label: 'A paragraph' }]}
            onChange={(v) => set({ lines: v === 'para' ? 4 : v === 'sentence' ? 2 : 1 })}
          />
        </View>
      ) : null}

      {/* 2. WHAT IT IS FOR ---------------------------------------------------------------------- */}
      <FormSection
        title="Its name"
        hint="Printed above it on the card, and how it is named in the dice tray and the modifier formulas. A number nobody named is a number nobody can pick out of a list.">
        <TextField label="Name" value={fn.title ?? ''} placeholder="e.g. Combo Die" maxLength={40} onChangeText={(title) => set({ title })} />
        <SwitchRow label="Do not print the name on the card" hint="It keeps the name everywhere else." on={!!fn.titleHidden} onToggle={() => set({ titleHidden: !fn.titleHidden })} />
      </FormSection>

      <FormSection title="Can the player change it?" hint="Locked shows the value and refuses to move. Hidden is not drawn at all. A level advancement opens either.">
        <SelectRow
          value={fn.hidden ? 'hidden' : fn.locked ? 'locked' : 'free'}
          options={[{ value: 'free', label: 'Yes, freely' }, { value: 'locked', label: 'Locked' }, { value: 'hidden', label: 'Hidden until unlocked' }]}
          onChange={(v) => set({ locked: v !== 'free', hidden: v === 'hidden' })}
        />
      </FormSection>

      {/* 3. HOW IT LOOKS ------------------------------------------------------------------------ */}
      <FormSection title="How it looks" hint="Watch the card above as you change these. It is drawn exactly as the player will see it.">
        <SelectRow
          label="Width"
          value={fn.width ?? 'hug'}
          options={[{ value: 'hug', label: 'Hug its content' }, { value: 'full', label: 'Full card width' }]}
          onChange={(width) => set({ width })}
        />
        <SelectRow
          label="Size"
          value={fn.size ?? 'medium'}
          options={[{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }]}
          onChange={(size) => set({ size })}
        />
      </FormSection>

      <AdvanceEditor fn={fn} advance={advance} onAdvance={onAdvance} />
    </View>
  );
}

const TIERS: (2 | 3 | 4)[] = [2, 3, 4];

/**
 * The level advancement an element offers, and what it does AT EACH TIER (v0.42.3, owner).
 *
 * "'Offer as level advancement' is incomplete, it must have a way to customize text edit to something
 * different on every tier, make a smart UI for managing this."
 *
 * The smart part is that the common case stays one line. Most advancements do the same thing at every
 * tier, so that is the default and the per-tier rows are not even drawn. A tier is broken out only
 * when the author says so, and breaking one out starts from the shared setting rather than from blank,
 * so "the same but two steps" is one number rather than a re-authoring.
 */
function AdvanceEditor({ fn, advance, onAdvance }: { fn: CardFunction; advance: CardAdvance | undefined; onAdvance: (a: CardAdvance | undefined) => void }) {
  const offeredTiers = advance ? (advance.tiers.length ? advance.tiers : TIERS) : [];
  return (
    <FormSection
      title="Level advancement"
      hint="An option in the level-up list that changes this element. The Brawler's Combo Die is the printed example.">
      <SwitchRow
        label="Offer it as a level advancement"
        on={!!advance}
        onToggle={() =>
          onAdvance(
            advance
              ? undefined
              : { id: `adv-${fn.id}`, label: '', functionId: fn.id, tiers: [], perTier: 1, effect: fn.kind === 'text' ? { kind: 'unlock' } : { kind: 'step', by: 1 } },
          )
        }>
        {advance ? (
          <View style={{ gap: Gap.intra }}>
            <TextField
              label="What the level-up list calls it"
              value={advance.label}
              placeholder="e.g. Increase your Combo Die by one step"
              maxLength={70}
              onChangeText={(label) => onAdvance({ ...advance, label })}
            />
            <SelectRow
              label="Offered at"
              value={advance.tiers.length === 0 ? 'all' : 'some'}
              options={[{ value: 'all', label: 'Every tier' }, { value: 'some', label: 'Only some tiers' }]}
              onChange={(v) => onAdvance({ ...advance, tiers: v === 'all' ? [] : [2] })}
            />
            {advance.tiers.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Gap.tightRow }}>
                {TIERS.map((t) => (
                  <TierChip
                    key={t}
                    label={`Tier ${t}`}
                    on={advance.tiers.includes(t)}
                    onPress={() => {
                      const next = advance.tiers.includes(t) ? advance.tiers.filter((x) => x !== t) : [...advance.tiers, t].sort((a, z) => a - z);
                      // Never leave it offered at nothing: that is an advancement nobody can take.
                      onAdvance({ ...advance, tiers: next.length ? next : advance.tiers });
                    }}
                  />
                ))}
              </View>
            ) : null}
            <SelectRow
              label="How often, per tier"
              value={advance.perTier === 2 ? 'twice' : 'once'}
              options={[{ value: 'once', label: 'Once' }, { value: 'twice', label: 'Twice' }]}
              onChange={(v) => onAdvance({ ...advance, perTier: v === 'twice' ? 2 : 1 })}
            />

            <EffectFields
              label="What taking it does"
              hint="At every tier, unless a tier below says otherwise."
              fn={fn}
              effect={advance.effect}
              onChange={(effect) => onAdvance({ ...advance, effect })}
            />

            {/* The per-tier overrides. Each tier this is offered at gets one line, and that line stays
                a single switch until the author actually wants that tier to differ. */}
            <View style={{ gap: Gap.intra }}>
              <Text style={{ color: Rune.bronze, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.7, textTransform: 'uppercase' }}>Different at a particular tier</Text>
              {offeredTiers.map((t) => {
                const over = advance.byTier?.[t as 2 | 3 | 4];
                const setOver = (v: { label?: string; effect?: AdvanceEffect } | undefined) => {
                  const byTier = { ...(advance.byTier ?? {}) };
                  if (v) byTier[t as 2 | 3 | 4] = v;
                  else delete byTier[t as 2 | 3 | 4];
                  onAdvance({ ...advance, byTier: Object.keys(byTier).length ? byTier : undefined });
                };
                return (
                  <SwitchRow
                    key={t}
                    label={`Tier ${t} is different`}
                    on={!!over}
                    // Breaking a tier out STARTS from the shared setting, so "the same but bigger" is
                    // one number rather than filling the whole thing in again.
                    onToggle={() => setOver(over ? undefined : { label: advance.label, effect: advance.effect })}>
                    {over ? (
                      <View style={{ gap: Gap.intra }}>
                        <TextField label={`What Tier ${t} calls it`} value={over.label ?? ''} placeholder={advance.label} maxLength={70} onChangeText={(label) => setOver({ ...over, label })} />
                        <EffectFields label={`What Tier ${t} does`} fn={fn} effect={over.effect ?? advance.effect} onChange={(effect) => setOver({ ...over, effect })} />
                      </View>
                    ) : null}
                  </SwitchRow>
                );
              })}
            </View>
          </View>
        ) : null}
      </SwitchRow>
    </FormSection>
  );
}

/** One tier, on or off. Its own control rather than a one-option SelectRow, which would lie about being a choice. */
function TierChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={() => { playSfx('buttonTap'); onPress(); }} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label}>
      <ChamferBox chamfer={5} fill={on ? Rune.red : 'rgba(20,24,31,0.7)'} stroke={on ? 'transparent' : 'rgba(218,162,73,0.4)'} strokeWidth={1.1} style={{ minHeight: 34, justifyContent: 'center', paddingHorizontal: 14 }}>
        <Text style={{ color: on ? Rune.ivory : Rune.sheet, fontSize: 12.5, fontFamily: Body.bold }}>{label}</Text>
      </ChamferBox>
    </Pressable>
  );
}

/** What one effect does, for the shared setting and for each tier that differs from it. */
function EffectFields({ label, hint, fn, effect, onChange }: { label: string; hint?: string; fn: CardFunction; effect: AdvanceEffect; onChange: (e: AdvanceEffect) => void }): ReactNode {
  return (
    <View style={{ gap: Gap.intra }}>
      <SelectRow
        label={label}
        hint={hint}
        value={effect.kind}
        options={[
          ...(fn.kind !== 'text' ? [{ value: 'step' as const, label: fn.kind === 'cycle' ? 'Moves it along' : 'Moves the number' }] : []),
          { value: 'set' as const, label: 'Sets it' },
          { value: 'unlock' as const, label: 'Unlocks it' },
        ]}
        onChange={(kind) => onChange(kind === 'step' ? { kind: 'step', by: 1 } : kind === 'set' ? { kind: 'set', value: 0 } : { kind: 'unlock' })}
      />
      {effect.kind === 'step' ? (
        <CounterField
          label={fn.kind === 'cycle' ? 'How many states along' : 'By how much'}
          value={effect.by}
          min={-20}
          max={20}
          onChange={(by) => onChange({ kind: 'step', by })}
        />
      ) : null}
      {effect.kind === 'set' && fn.kind === 'cycle' ? (
        <CounterField label="To which state" suffix={(fn.options ?? [])[effect.value] ?? ''} value={effect.value + 1} min={1} max={Math.max(1, (fn.options ?? []).length)} onChange={(n) => onChange({ kind: 'set', value: n - 1 })} />
      ) : null}
      {effect.kind === 'set' && fn.kind === 'counter' ? (
        <CounterField label="To what" value={effect.value} min={COUNT_MIN} max={COUNT_MAX} onChange={(value) => onChange({ kind: 'set', value })} />
      ) : null}
      {effect.kind === 'set' && fn.kind === 'text' ? (
        <TextField label="To what" value={effect.text ?? ''} placeholder="What it should say" maxLength={80} onChangeText={(text) => onChange({ kind: 'set', value: 0, text })} />
      ) : null}
    </View>
  );
}
