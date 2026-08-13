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
import { CounterField, EntryList, Field, FormSection, SelectRow, SwitchRow, TextField } from '@/components/form-controls';
import { Body, Gap, Rune } from '@/constants/theme';
import { type AdvanceEffect, type CardAdvance, type CardFunction, type FunctionKind, newFunction } from '@/lib/card-functions';
import { RuneButton } from '@/components/rune-button';
import { type DieSpec, specCount, specSummary } from '@/lib/card-dice';
import type { DieType } from '@/features/character-sheet/components/card-tokens-data';
import type { EffectFormula } from '@/lib/modifiers';
import { playSfx } from '@/lib/sfx';

const KINDS: { value: FunctionKind; label: string }[] = [
  { value: 'counter', label: 'A number' },
  { value: 'dice', label: 'Dice' },
  { value: 'cycle', label: 'A switch' },
  { value: 'text', label: 'Something to write' },
];

const KIND_HINT: Record<FunctionKind, string> = {
  dice: 'Dice the player rolls on the card, the way the dice tray rolls them. One die, or a handful that a level advancement grows.',
  counter: 'A count the player raises and lowers. Charges, uses, a die size, a tally.',
  cycle: 'A button that walks through a list of states. A stance, a mode, a die that steps up.',
  text: 'A line or a paragraph the player writes on and can change whenever they like.',
};

/** How far a counter may be pushed either way. Wide, because a homebrew tally is nobody's business. */
const COUNT_MIN = -50;
const COUNT_MAX = 99;


/** The dice an author may reach for. `duality` is the sheet's own pair and is not one of these. */
const DICE: DieType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

/**
 * The variables a die's count may be multiplied by (v0.42.5, owner).
 *
 * A short list on purpose. "One die per Proficiency" and "one per Agility" are the cases the owner
 * gave, and a picker offering thirty variables to multiply a die count by would be a picker nobody
 * reads. Everything here is a small number that grows with the character, which is what a count wants.
 */
const COUNT_VARS: { value: EffectFormula['variable']; label: string }[] = [
  { value: 'proficiency', label: 'Proficiency' },
  { value: 'tier', label: 'Tier' },
  { value: 'level', label: 'Level' },
  { value: 'agility', label: 'Agility' },
  { value: 'strength', label: 'Strength' },
  { value: 'finesse', label: 'Finesse' },
  { value: 'instinct', label: 'Instinct' },
  { value: 'presence', label: 'Presence' },
  { value: 'knowledge', label: 'Knowledge' },
];

const varLabel = (v: EffectFormula['variable'] | undefined) => COUNT_VARS.find((x) => x.value === v)?.label;

/**
 * The character an author's PREVIEW stands in for (v0.42.5).
 *
 * An author has no character, so "one d6 per Proficiency" has nothing to resolve against and would
 * draw either nothing or one die, neither of which is what the card will look like. This is an
 * ordinary tier 2 hero: Proficiency 2, a couple of points in a trait. It is stated on screen so the
 * number under each die is read as "for this character" rather than as the truth.
 */
const PREVIEW_VARS: Partial<Record<string, number>> = {
  proficiency: 2, tier: 2, level: 4,
  agility: 2, strength: 1, finesse: 1, instinct: 1, presence: 1, knowledge: 1,
};
const previewVariable = (v: EffectFormula['variable']): number => PREVIEW_VARS[String(v)] ?? 1;

/**
 * ONE die entry, edited (v0.42.5).
 *
 * Read as a sentence: how many, of what, times what. The multiplier is behind a switch because most
 * dice do not have one, and a row that always showed a variable picker would make the simple case
 * look complicated.
 */
function DieRow({ die, index, count, onChange, onRemove, onMove }: {
  die: DieSpec;
  index: number;
  /** How many this comes to for a character with the preview's numbers, so the author can see it. */
  count: number;
  onChange: (d: DieSpec) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  return (
    <ChamferBox chamfer={7} fill="rgba(20,24,31,0.6)" stroke="rgba(218,162,73,0.32)" strokeWidth={1.1} style={{ padding: 10, gap: Gap.intra }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, color: Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.7, textTransform: 'uppercase' }}>
          {specSummary(die, varLabel(die.variable))}
          <Text style={{ color: Rune.muted }}>{`  ·  ${count} right now`}</Text>
        </Text>
        <Pressable onPress={() => onMove(-1)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Move die ${index + 1} up`}>
          <Text style={{ color: Rune.goldText, fontSize: 13, fontFamily: Body.bold }}>↑</Text>
        </Pressable>
        <Pressable onPress={() => onMove(1)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Move die ${index + 1} down`}>
          <Text style={{ color: Rune.goldText, fontSize: 13, fontFamily: Body.bold }}>↓</Text>
        </Pressable>
        <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove die ${index + 1}`}>
          <Text style={{ color: '#E2705A', fontSize: 14, fontFamily: Body.bold }}>✕</Text>
        </Pressable>
      </View>
      <SelectRow label="Which die" value={die.type} options={DICE.map((t) => ({ value: t, label: t }))} onChange={(type) => onChange({ ...die, type })} />
      <CounterField label="How many" value={die.count ?? 1} min={1} max={12} onChange={(n) => onChange({ ...die, count: n })} />
      <SwitchRow
        label="Multiply that by a variable"
        hint="One die per Proficiency, one per Agility. The count grows with the character instead of being written for one tier."
        on={!!die.variable}
        onToggle={() => onChange({ ...die, variable: die.variable ? undefined : 'proficiency' })}>
        <SelectRow value={die.variable} options={COUNT_VARS} onChange={(variable) => onChange({ ...die, variable })} />
      </SwitchRow>
    </ChamferBox>
  );
}

export function FunctionEditor({ fn, advance, previewTier, onPreviewTier, onChange, onAdvance }: {
  fn: CardFunction;
  /** The level advancement this element offers, if it offers one. */
  advance: CardAdvance | undefined;
  /**
   * v0.42.5 (owner): which tier the CARD PREVIEW at the top is showing.
   *
   * "Add a preview button for the level-advancement menu which allows toggling the preview of the
   * default version of this feature card, and any further advancement to see what the further
   * level-advancement changes will look like, this way if I only have one dice when I am tier 1, when
   * I am tier 2 I can advance to having 3 different dice."
   *
   * `null` is the card as written. A tier means "as it would be having taken this advancement at that
   * tier", applied to the real card at the top rather than drawn as a second little copy down here,
   * for the same reason the element itself is not previewed in this panel.
   */
  previewTier: number | null;
  onPreviewTier: (t: number | null) => void;
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
          <SwitchRow label="Counts down only" hint="It starts full and is spent. Its direction is part of what it is." on={!!fn.countdown} onToggle={() => set({ countdown: !fn.countdown, loop: fn.countdown ? undefined : fn.loop })}>
            <SwitchRow label="Restarts below zero" hint="Pushed past zero it goes back to where it started." on={!!fn.loop} onToggle={() => set({ loop: !fn.loop })} />
            {/* v0.42.5 (owner): a countdown always hid its raise button; now that is a choice. */}
            <SelectRow
              label="The raise button"
              hint="Faded is how a card promises the button is coming: a level advancement can unlock it later."
              value={fn.raiseButton ?? 'hidden'}
              options={[{ value: 'hidden', label: 'Not there' }, { value: 'faded', label: 'Faded, not usable yet' }, { value: 'shown', label: 'It can be raised' }]}
              onChange={(raiseButton) => set({ raiseButton })}
            />
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

      {fn.kind === 'dice' ? (
        <View style={{ gap: Gap.intra }}>
          {(fn.dice ?? []).map((d, i) => (
            <DieRow
              key={d.id}
              die={d}
              index={i}
              count={specCount(d, previewVariable)}
              onChange={(next) => set({ dice: (fn.dice ?? []).map((x) => (x.id === d.id ? next : x)) })}
              onRemove={() => set({ dice: (fn.dice ?? []).filter((x) => x.id !== d.id) })}
              onMove={(dir) => {
                const list = [...(fn.dice ?? [])];
                const to = i + dir;
                if (to < 0 || to >= list.length) return;
                [list[i], list[to]] = [list[to], list[i]];
                set({ dice: list });
              }}
            />
          ))}
          <RuneButton
            label="+ Add a die"
            kind="ghost"
            dense
            height={34}
            onPress={() => set({ dice: [...(fn.dice ?? []), { id: `die-${Date.now().toString(36)}`, type: 'd6' }] })}
          />
          <SwitchRow
            label="Add the results up"
            hint="The same tally the dice tray shows: every die's result added together, once they have all landed."
            on={!!fn.diceTally}
            onToggle={() => set({ diceTally: !fn.diceTally })}
          />
          <SelectRow
            label="How it is rolled"
            hint="Tapping the dice is quickest. A button is clearer on a card where something else is already tappable."
            value={fn.diceRollMode ?? 'tap'}
            options={[{ value: 'tap', label: 'Tap the dice' }, { value: 'button', label: 'A Roll button' }]}
            onChange={(diceRollMode) => set({ diceRollMode })}
          />
        </View>
      ) : null}

      {fn.kind === 'text' ? (
        <View style={{ gap: Gap.intra }}>
          <TextField label="Placeholder" hint="The grey suggestion, shown only while the field is empty. It is never part of what the card says." value={fn.placeholder ?? ''} placeholder="What to write here" maxLength={60} onChangeText={(placeholder) => set({ placeholder })} />
          {/* v0.42.5 (owner): "the text mode should have a placeholder option or a checkbox to set a
              starting text instead". They are genuinely different: a placeholder vanishes the moment
              anybody types, starting text is content the player was handed and may edit. */}
          <SwitchRow
            label="It arrives already saying something"
            hint="Starting text, which the player can then change. Unlike a placeholder, this IS on the card."
            on={fn.startText != null}
            onToggle={() => set({ startText: fn.startText == null ? '' : undefined })}>
            <TextField label="Starting text" value={fn.startText ?? ''} placeholder="What it says to begin with" multiline maxLength={200} onChangeText={(startText) => set({ startText })} />
          </SwitchRow>
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
        {/* v0.42.5 (owner): on a card where everything is locked by design, three copies of the word
            LOCKED is three words nobody needs. The element stays locked either way. */}
        {fn.locked ? (
          <SwitchRow label="Do not print the word LOCKED" hint="It is still locked. It simply stops announcing it." on={!!fn.lockedTextHidden} onToggle={() => set({ lockedTextHidden: !fn.lockedTextHidden })} />
        ) : null}
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

      <AdvanceEditor fn={fn} advance={advance} previewTier={previewTier} onPreviewTier={onPreviewTier} onAdvance={onAdvance} />
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
function AdvanceEditor({ fn, advance, previewTier, onPreviewTier, onAdvance }: {
  fn: CardFunction;
  advance: CardAdvance | undefined;
  previewTier: number | null;
  onPreviewTier: (t: number | null) => void;
  onAdvance: (a: CardAdvance | undefined) => void;
}) {
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

            {/**
              * SEE IT (v0.42.5, owner). The card at the top of the editor redraws as it would be
              * having taken this at each tier, so "one die now, three at tier 3" is something you
              * look at rather than something you imagine.
              */}
            <Field label="Show it on the card above" hint="The preview at the top, as it would be after taking this. It changes nothing about the card.">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Gap.tightRow }}>
                <TierChip label="As written" on={previewTier == null} onPress={() => onPreviewTier(null)} />
                {offeredTiers.map((t) => (
                  <TierChip key={t} label={`After tier ${t}`} on={previewTier === t} onPress={() => onPreviewTier(previewTier === t ? null : t)} />
                ))}
              </View>
            </Field>

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
          // v0.42.5: a DICE element grows by being given dice, which is the only thing that makes
          // sense for it, so it is the only effect it offers besides unlocking.
          ...(fn.kind === 'dice' ? [{ value: 'dice' as const, label: 'Grants dice' }] : []),
          ...(fn.kind !== 'text' && fn.kind !== 'dice' ? [{ value: 'step' as const, label: fn.kind === 'cycle' ? 'Moves it along' : 'Moves the number' }] : []),
          ...(fn.kind !== 'dice' ? [{ value: 'set' as const, label: 'Sets it' }] : []),
          { value: 'unlock' as const, label: 'Unlocks it' },
        ]}
        onChange={(kind) =>
          onChange(
            kind === 'dice' ? { kind: 'dice', add: [{ id: `g-${Date.now().toString(36)}`, type: 'd6' }] }
            : kind === 'step' ? { kind: 'step', by: 1 }
            : kind === 'set' ? { kind: 'set', value: 0 }
            : { kind: 'unlock' },
          )
        }
      />
      {/* The dice this advancement HANDS OVER. A list, because "a d4 and a d6 and a d8" is the
          owner's own example and one die would have been a poorer feature. */}
      {effect.kind === 'dice' ? (
        <View style={{ gap: Gap.tightRow }}>
          {effect.add.map((d, i) => (
            <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: Gap.tightRow }}>
              <View style={{ flex: 1 }}>
                <SelectRow value={d.type} options={DICE.map((t) => ({ value: t, label: t }))} onChange={(type) => onChange({ kind: 'dice', add: effect.add.map((x) => (x.id === d.id ? { ...x, type } : x)) })} />
              </View>
              <Pressable onPress={() => onChange({ kind: 'dice', add: effect.add.filter((x) => x.id !== d.id) })} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove granted die ${i + 1}`}>
                <Text style={{ color: '#E2705A', fontSize: 14, fontFamily: Body.bold }}>✕</Text>
              </Pressable>
            </View>
          ))}
          <RuneButton
            label="+ Grant another die"
            kind="ghost"
            dense
            height={32}
            onPress={() => onChange({ kind: 'dice', add: [...effect.add, { id: `g-${Date.now().toString(36)}`, type: 'd6' }] })}
          />
        </View>
      ) : null}
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
