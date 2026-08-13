import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Svg, { Path, Polyline } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { Overlay } from '@/components/overlay-host';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import type { FunctionVar } from '@/lib/function-vars';
import { deleteGroup, groupEffects, groupNames, isGroupOn, moveToGroup, renameGroup, setGroupOn } from '@/lib/modifier-groups';
import { type CardEffect, type EffectFormula, type EffectTarget, TARGET_LABEL } from '@/lib/modifiers';
import { DimScreen } from '@/lib/screen-dim';

/**
 * The shared "Effects when enabled" editor (#278) — used by the card create/edit dialog AND the per-card
 * Modifiers panel, so they always edit the same effect list. Each row is a modifier with either a
 * SIMPLE flat amount (±N, or a 0–40 Set threshold) or an ADVANCED formula (a sheet variable scaled by
 * ×/÷, rounded up). `EffectPicker` (the target chooser) is rendered at the parent's root.
 */

export interface EffectOption { key: string; label: string; target: EffectTarget; mode?: 'set' | 'bonus'; experienceId?: string }

/** A character's Experiences, the minimum this module needs to build their picker options. */
export interface ExperienceRef { id: string; title: string }

/** v0.14.0: the Experiences group is per-CHARACTER, so it can't live in the static groups below, it's
 *  generated from the file and appended. Every Experience is offered, however many the character has. */
export function experienceOptions(experiences: ExperienceRef[] | undefined): EffectOption[] {
  return (experiences ?? []).map((e, i) => ({ key: `experience:${e.id}`, label: e.title.trim() || `Experience ${i + 1}`, target: 'experience' as EffectTarget, experienceId: e.id }));
}
export const EFFECT_GROUPS: { label: string; options: EffectOption[] }[] = [
  { label: 'Resources', options: [
    { key: 'maxHp', label: 'Max Hit Points', target: 'maxHp' },
    { key: 'stressMax', label: 'Max Stress', target: 'stressMax' },
    // v0.35.1 (owner): Max Hope is NOT a modifier. Six is six for everyone, and the only thing that
    // ever changes it is a scar taking a slot away. The engine drops any that already exist.
    { key: 'armorScore', label: 'Armor Score', target: 'armorScore' },
  ] },
  { label: 'Damage Thresholds', options: [
    { key: 'set-major', label: 'Set Major Threshold', target: 'majorThreshold', mode: 'set' },
    { key: 'set-severe', label: 'Set Severe Threshold', target: 'severeThreshold', mode: 'set' },
    { key: 'bonus-major', label: 'Bonus Major Threshold', target: 'majorThreshold', mode: 'bonus' },
    { key: 'bonus-severe', label: 'Bonus Severe Threshold', target: 'severeThreshold', mode: 'bonus' },
  ] },
  { label: 'Defense', options: [
    { key: 'evasion', label: 'Evasion', target: 'evasion' },
    { key: 'proficiency', label: 'Proficiency', target: 'proficiency' },
  ] },
  { label: 'Traits', options: [
    { key: 'agility', label: 'Agility', target: 'agility' },
    { key: 'strength', label: 'Strength', target: 'strength' },
    { key: 'finesse', label: 'Finesse', target: 'finesse' },
    { key: 'instinct', label: 'Instinct', target: 'instinct' },
    { key: 'presence', label: 'Presence', target: 'presence' },
    { key: 'knowledge', label: 'Knowledge', target: 'knowledge' },
  ] },
  /**
   * v0.41.0 (owner): what a card adds to a ROLL, rather than to the sheet.
   *
   * Nothing on the character sheet moves when these change, because the app does not roll your checks.
   * They are read by the dice tray's roll presets, so "+2 to attack rolls" written on a card turns up
   * in the total of any preset built to use it.
   */
  { label: 'Rolls', options: [
    { key: 'attackRoll', label: 'Attack Rolls', target: 'attackRoll' },
    { key: 'damageRoll', label: 'Damage Rolls', target: 'damageRoll' },
    { key: 'spellcastRoll', label: 'Spellcast Rolls', target: 'spellcastRoll' },
  ] },
  // v0.13.0 SCARS: no amount, no formula — equipping the card scars one Hope slot, full stop.
  { label: 'Misc', options: [
    { key: 'scar', label: 'Add Scar', target: 'scar' },
  ] },
];

/**
 * The DM's own modifier (v0.35, owner): the character's LEVEL.
 *
 * Offered only on a DM surface. Levelling a character up spends advancements and cannot be undone by
 * levelling them back down, so "you are all level 6 tonight" needs to be a modifier rather than a
 * progression. A player has no business writing one onto a card of their own, which is why it is not
 * in the list above.
 */
export const DM_EFFECT_GROUP: { label: string; options: EffectOption[] } = {
  label: 'DM',
  options: [{ key: 'level', label: 'Level', target: 'level' }],
};
const ALL_EFFECT_OPTIONS = [...EFFECT_GROUPS.flatMap((g) => g.options), ...DM_EFFECT_GROUP.options];
export const isThresholdTarget = (t: EffectTarget) => t === 'majorThreshold' || t === 'severeThreshold';
export const isSetEffect = (e: CardEffect) => isThresholdTarget(e.target) && e.mode === 'set' && e.dynamic !== 'formula';
export function matchOption(e: CardEffect, experiences?: ExperienceRef[]): EffectOption | undefined {
  // An experience effect names an INSTANCE, so it must match on the id too — otherwise switching from
  // one Experience to another would silently keep pointing at the first.
  if (e.target === 'experience') {
    const opts = experienceOptions(experiences);
    return opts.find((o) => o.experienceId === (e.experienceId ?? opts[0]?.experienceId));
  }
  return ALL_EFFECT_OPTIONS.find((o) => o.target === e.target && (isThresholdTarget(e.target) ? (o.mode ?? 'bonus') === (e.mode ?? 'bonus') : true));
}
export function effectLabel(e: CardEffect, experiences?: ExperienceRef[]): string {
  return matchOption(e, experiences)?.label ?? TARGET_LABEL[e.target];
}

/** Rewrite an effect for a freshly-picked option — shared by every EffectPicker call site. A scar is
 *  always exactly `{ target: 'scar', delta: 1 }` (no amount/formula/tier shapes survive the switch). */
export function applyPickedOption(e: CardEffect, o: EffectOption): CardEffect {
  if (o.target === 'scar') return { target: 'scar', delta: 1, note: e.note };
  // An experience bonus is a flat amount on one Experience — no threshold mode, no formula/tier shapes.
  if (o.target === 'experience') return { target: 'experience', experienceId: o.experienceId, delta: e.delta ?? 1, note: e.note };
  return { ...e, target: o.target, mode: isThresholdTarget(o.target) ? o.mode : undefined, experienceId: undefined };
}

/** Formula variables a player can scale (#278). v0.21.0: `spellcast` = your subclass's Spellcast trait.
 *  v0.32.0 adds two that are not sheet stats: the Stress currently marked, and a NUMBER INPUT the
 *  card asks its owner for (per card, never shared). */
const FORMULA_VARS: EffectFormula['variable'][] = ['level', 'tier', 'proficiency', 'spellcast', 'stress', 'input', 'attackRoll', 'spellcastRoll', 'damageRoll', 'currentHp', 'missingHp', 'currentHope', 'missingHope', 'currentArmor', 'missingArmor', 'agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];
const VAR_LABEL: Record<EffectFormula['variable'], string> = {
  level: 'Level', tier: 'Tier', proficiency: 'Proficiency', spellcast: 'Spellcast', stress: 'Current Stress', input: 'Number Input',
  attackRoll: 'Attack Rolls', spellcastRoll: 'Spellcast Rolls', damageRoll: 'Damage Rolls',
  // v0.42.5: the live vitals, each against the character's OWN maximum.
  currentHp: 'Current Hit Points', missingHp: 'Missing Hit Points',
  currentHope: 'Current Hope', missingHope: 'Missing Hope',
  currentArmor: 'Current Armor', missingArmor: 'Missing Armor',
  agility: 'Agility', strength: 'Strength', finesse: 'Finesse', instinct: 'Instinct', presence: 'Presence', knowledge: 'Knowledge',
  // v0.42.3: not in FORMULA_VARS, because it is not one entry. A character's numeric card elements
  // are listed individually below, each already carrying its own functionKey.
  function: 'Card element',
};
/** What a variable means, for the ones a player cannot guess from the name alone. */
const VAR_HINT: Partial<Record<EffectFormula['variable'], string>> = {
  stress: 'How much Stress is marked right now. Changes as you play.',
  input: 'A number you type on this card. Tap # under the card to set it.',
  attackRoll: 'Everything your cards add to an attack roll. Used by dice tray presets.',
  damageRoll: 'Everything your cards add to a damage roll. Used by dice tray presets.',
  spellcastRoll: 'Everything your cards add to a spellcast roll. Used by dice tray presets.',
  currentHp: 'The Hit Points you have left right now.',
  missingHp: 'How far below your maximum you are. Grows as you take damage.',
  currentHope: 'The Hope you are holding right now.',
  missingHope: 'How much Hope you could still gain before you are full.',
  currentArmor: 'The armor slots you have left.',
  missingArmor: 'How many armor slots you have spent.',
};

/**
 * #325: convert a card's CODE-DEFINED effects into the editor's editable shapes — the legacy dynamics
 * become the equivalent editable formula so the Modifiers panel can SHOW and EDIT them. `byTier` stays
 * `byTier` (a per-tier editor handles it). Idempotent — a plain flat/formula/byTier effect is unchanged.
 */
export function toEditableEffects(effects: CardEffect[]): CardEffect[] {
  return effects.map((e) => {
    if (e.dynamic === 'proficiency') return { ...e, dynamic: 'formula', formula: { variable: 'proficiency', multiply: 1, divide: 1 } };
    if (e.dynamic === 'halfAgility') return { ...e, dynamic: 'formula', formula: { variable: 'agility', multiply: 1, divide: 2 } };
    if (e.dynamic === 'strengthPlus3') return { ...e, dynamic: 'formula', formula: { variable: 'strength', multiply: 1, divide: 1, plus: 3 } };
    return e;
  });
}

/** #325: a full-screen chooser for a formula's VARIABLE (Level / Tier / Proficiency / a trait) — same
 *  shape as EffectPicker, so picking a starter is a tap in a list instead of cycling. Rendered at root. */
export function FormulaVarPicker({ current, currentKey, functionVars, onPick, onClose }: {
  current?: EffectFormula['variable'];
  /** v0.42.3: which card element is picked, when `current` is 'function'. */
  currentKey?: string;
  /** v0.42.3: the character's numeric card elements. See `lib/function-vars`. */
  functionVars?: FunctionVar[];
  onPick: (v: EffectFormula['variable'], functionKey?: string) => void;
  onClose: () => void;
}) {
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 10002, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,8,13,0.9)' }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <DimScreen opacity={0.9} />
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 300, maxHeight: '82%', paddingHorizontal: 16, paddingVertical: 16 }}>
        <Text style={{ color: Rune.goldText, fontSize: 18, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Pick a variable</Text>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingBottom: 4 }}>
          {FORMULA_VARS.map((v) => {
            const on = current === v;
            return (
              <Pressable key={v} onPress={() => onPick(v)} accessibilityRole="button" accessibilityState={{ selected: on }}>
                <View style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 5, backgroundColor: on ? Rune.red : 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: on ? 'transparent' : 'rgba(218,162,73,0.4)' }}>
                  <Text style={{ color: on ? Rune.ivory : Rune.sheet, fontSize: 13.5, fontFamily: Body.bold }}>{VAR_LABEL[v]}</Text>
                  {VAR_HINT[v] ? <Text style={{ color: on ? Rune.ivory : Rune.muted, fontSize: 10, lineHeight: 13, fontFamily: Body.regular, marginTop: 2 }}>{VAR_HINT[v]}</Text> : null}
                </View>
              </Pressable>
            );
          })}
          {/* v0.42.3 (owner): the character's own card elements, by name. A counter or a numeric
              cycling button is a number the player is already keeping, so a formula can scale by it.
              Nothing here can be written to: there is no matching effect target. */}
          {functionVars?.length ? (
            <>
              <Text style={{ color: Rune.bronze, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 6 }}>Your card elements</Text>
              {functionVars.map((fv) => {
                const on = current === 'function' && currentKey === fv.key;
                return (
                  <Pressable key={fv.key} onPress={() => onPick('function', fv.key)} accessibilityRole="button" accessibilityState={{ selected: on }}>
                    <View style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 5, backgroundColor: on ? Rune.red : 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: on ? 'transparent' : 'rgba(218,162,73,0.4)' }}>
                      <Text style={{ color: on ? Rune.ivory : Rune.sheet, fontSize: 13.5, fontFamily: Body.bold }}>{fv.title}</Text>
                      <Text style={{ color: on ? Rune.ivory : Rune.muted, fontSize: 10, lineHeight: 13, fontFamily: Body.regular, marginTop: 2 }}>On {fv.cardTitle}. Currently {fv.value}.</Text>
                    </View>
                  </Pressable>
                );
              })}
            </>
          ) : null}
        </ScrollView>
      </ChamferBox>
    </View>
  );
}

export function EffectPicker({ current, onPick, onClose, experiences, dm }: { current?: EffectOption; onPick: (o: EffectOption) => void; onClose: () => void; experiences?: ExperienceRef[]; dm?: boolean }) {
  const expOpts = experienceOptions(experiences);
  const groups = [
    ...EFFECT_GROUPS,
    ...(expOpts.length ? [{ label: 'Experiences', options: expOpts }] : []),
    ...(dm ? [DM_EFFECT_GROUP] : []),
  ];
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 10002, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,8,13,0.9)' }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <DimScreen opacity={0.9} />
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 320, maxHeight: '82%', paddingHorizontal: 16, paddingVertical: 16 }}>
        <Text style={{ color: Rune.goldText, fontSize: 18, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Pick a modifier</Text>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 11, paddingBottom: 4 }}>
          {groups.map((g) => (
            <View key={g.label} style={{ gap: 6 }}>
              <Text style={{ color: Rune.bronze, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>{g.label}</Text>
              {g.options.map((o) => {
                const on = current?.key === o.key;
                return (
                  <Pressable key={o.key} onPress={() => onPick(o)} accessibilityRole="button" accessibilityState={{ selected: on }}>
                    <View style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 5, backgroundColor: on ? Rune.red : 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: on ? 'transparent' : 'rgba(218,162,73,0.4)' }}>
                      <Text style={{ color: on ? Rune.ivory : Rune.sheet, fontSize: 13.5, fontFamily: Body.bold }}>{o.label}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </ChamferBox>
    </View>
  );
}

function MiniStepper({ value, onBump, lo, hi, label }: { value: number; onBump: (d: number) => void; lo: number; hi: number; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Text style={{ color: Rune.bronze, fontSize: 11, fontFamily: Body.bold }}>{label}</Text>
      <Pressable onPress={() => onBump(-1)} disabled={value <= lo} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Decrease ${label}`}>
        <View style={{ width: 24, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 4, backgroundColor: 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: 'rgba(218,162,73,0.4)', opacity: value <= lo ? 0.4 : 1 }}>
          <Text style={{ color: Rune.sheet, fontSize: 16, fontFamily: Display.bold }}>−</Text>
        </View>
      </Pressable>
      <Text style={{ color: Rune.goldBright, fontSize: 14, fontFamily: Display.black, minWidth: 16, textAlign: 'center' }}>{value}</Text>
      <Pressable onPress={() => onBump(1)} disabled={value >= hi} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Increase ${label}`}>
        <View style={{ width: 24, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 4, backgroundColor: 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: 'rgba(218,162,73,0.4)', opacity: value >= hi ? 0.4 : 1 }}>
          <Text style={{ color: Rune.sheet, fontSize: 16, fontFamily: Display.bold }}>+</Text>
        </View>
      </Pressable>
    </View>
  );
}

/** A small mode toggle button for the flat / formula / by-tier selector (#325). */
function ModeBtn({ label, on, onPress, a11y }: { label: string; on: boolean; onPress: () => void; a11y: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={3} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={a11y}>
      <View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 5, backgroundColor: on ? Rune.red : 'rgba(14,17,22,0.6)', borderWidth: 1, borderColor: on ? 'transparent' : 'rgba(218,162,73,0.4)' }}>
        <Text style={{ color: on ? Rune.ivory : Rune.bronze, fontSize: 12, fontFamily: Display.bold }}>{label}</Text>
      </View>
    </Pressable>
  );
}

type EffectMode = 'flat' | 'formula' | 'byTier';
function modeOf(e: CardEffect): EffectMode {
  return e.dynamic === 'formula' ? 'formula' : e.byTier ? 'byTier' : 'flat';
}

/** A small square check box, the one shape used for every modifier and group switch (v0.35). */
function Check({ on, onPress, label }: { on: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label}>
      <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 1.6, borderColor: on ? Rune.goldBright : 'rgba(218,162,73,0.45)', backgroundColor: on ? Rune.goldBright : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {on ? <Svg width={12} height={12} viewBox="0 0 12 12"><Polyline points="2,6 5,9 10,3" fill="none" stroke={Rune.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg> : null}
      </View>
    </Pressable>
  );
}

/**
 * Where a modifier is filed (v0.35): no group, one of the card's groups, or a new one.
 *
 * Creating is DM-only, per the owner: a player can tidy what they were given, and move a modifier
 * between the groups that exist, but the organisation itself is the DM's.
 */
function GroupPicker({ current, groups, dm, onPick, onClose }: { current?: string; groups: string[]; dm?: boolean; onPick: (g: string | null) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 10002, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,8,13,0.9)' }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <DimScreen opacity={0.9} />
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 300, maxHeight: '82%', paddingHorizontal: 16, paddingVertical: 16 }}>
        <Text style={{ color: Rune.goldText, fontSize: 18, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Put it in</Text>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingBottom: 4 }} keyboardShouldPersistTaps="handled">
          {[null, ...groups].map((g) => {
            const on = (current ?? null) === g;
            return (
              <Pressable key={g ?? '__none'} onPress={() => onPick(g)} accessibilityRole="button" accessibilityState={{ selected: on }}>
                <View style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 5, backgroundColor: on ? Rune.red : 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: on ? 'transparent' : 'rgba(218,162,73,0.4)' }}>
                  <Text style={{ color: on ? Rune.ivory : Rune.sheet, fontSize: 13.5, fontFamily: Body.bold }}>{g ?? 'No group'}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
        {dm ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <ChamferBox chamfer={7} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ flex: 1, height: 40, justifyContent: 'center', paddingHorizontal: 12 }}>
              <TextInput value={name} onChangeText={setName} placeholder="New group" placeholderTextColor={Rune.muted} selectionColor={Rune.goldBright} maxLength={24} style={{ color: Rune.sheet, fontSize: 14, fontFamily: Body.semibold, padding: 0 }} accessibilityLabel="New group name" />
            </ChamferBox>
            <RuneButton label="Add" kind="primary" dense height={40} disabled={!name.trim()} onPress={() => onPick(name.trim())} />
          </View>
        ) : null}
      </ChamferBox>
    </View>
  );
}

/**
 * Name a group (v0.35.2, owner). Used for both halves of the same job: a new group is ASKED for its
 * name rather than handed one, and an existing one is renamed from its header.
 */
function GroupNameDialog({ title, initial, taken, onSave, onClose }: { title: string; initial: string; taken: string[]; onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(initial);
  const clash = name.trim() !== initial && taken.includes(name.trim());
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 10002, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,8,13,0.9)' }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <DimScreen opacity={0.9} />
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 300, paddingHorizontal: 16, paddingVertical: 16 }}>
        <Text style={{ color: Rune.goldText, fontSize: 18, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>{title}</Text>
        <ChamferBox chamfer={7} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ height: 44, justifyContent: 'center', paddingHorizontal: 12 }}>
          <TextInput value={name} onChangeText={setName} autoFocus placeholder="Group name" placeholderTextColor={Rune.muted} selectionColor={Rune.goldBright} maxLength={24} style={{ color: Rune.sheet, fontSize: 15, fontFamily: Body.semibold, padding: 0 }} accessibilityLabel="Group name" />
        </ChamferBox>
        {clash ? <Text style={{ color: '#E2705A', fontSize: 11, fontFamily: Body.regular, marginTop: 6 }}>There is already a group with that name.</Text> : null}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <RuneButton label="Cancel" kind="ghost" height={42} style={{ flex: 1 }} onPress={onClose} />
          <RuneButton label="Save" kind="primary" height={42} style={{ flex: 1.3 }} disabled={!name.trim() || clash} onPress={() => onSave(name.trim())} />
        </View>
      </ChamferBox>
    </View>
  );
}

export function EffectsField({ effects, onChange, onRequestPick, onRequestPickVar, preview, experiences, dm, collapsed, onCollapsedChange }: {
  effects: CardEffect[];
  onChange: (e: CardEffect[]) => void;
  /** v0.14.0: the character's Experiences, so an experience-targeting row shows WHICH one by name. */
  experiences?: ExperienceRef[];
  onRequestPick: (i: number) => void;
  /** #325: open the variable PICKER for the formula at index i (a panel, not a cycle). */
  onRequestPickVar: (i: number) => void;
  /** Optional resolver for the live "= N" value preview (current character) — formula/by-tier. */
  preview?: (e: CardEffect) => number | null;
  /**
   * v0.35: this is a DM surface, so it gets the DM's controls: a switch on each modifier, a switch on
   * each group, group creation, and the Level modifier. A player's own card editor has none of them,
   * which is the owner's split: a player toggles a whole card, a DM toggles what is inside it.
   */
  dm?: boolean;
  /** Group names currently collapsed. Owned by the caller so the state survives closing the panel. */
  collapsed?: string[];
  onCollapsedChange?: (names: string[]) => void;
}) {
  // Groups declared but not yet filled. ponytail: a group IS its modifiers, so an empty one exists
  // only while the editor is open; put something in it before saving or it is gone.
  const [draftGroups, setDraftGroups] = useState<string[]>([]);
  const [groupPick, setGroupPick] = useState<number | null>(null);
  /** Naming a group: an empty string is a NEW one, anything else renames that group. */
  const [naming, setNaming] = useState<string | null>(null);
  const [localCollapsed, setLocalCollapsed] = useState<string[]>([]);
  const shut = collapsed ?? localCollapsed;
  const setShut = (next: string[]) => (onCollapsedChange ? onCollapsedChange(next) : setLocalCollapsed(next));
  const toggleOpen = (name: string) => setShut(shut.includes(name) ? shut.filter((n) => n !== name) : [...shut, name]);

  const setAt = (i: number, patch: Partial<CardEffect>) => onChange(effects.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const bump = (i: number, d: number) => {
    const e = effects[i];
    const [lo, hi] = isSetEffect(e) ? [0, 40] : [-9, 12];
    setAt(i, { delta: Math.max(lo, Math.min(hi, (e.delta ?? 0) + d)) });
  };
  // #325: three modes — a flat amount, a scaling formula, or a per-tier value. Switching seeds sensible
  // defaults and clears the other shapes so the saved effect is unambiguous.
  const setMode = (i: number, mode: EffectMode) => {
    const e = effects[i];
    if (mode === 'flat') setAt(i, { delta: e.delta ?? 1, dynamic: undefined, formula: undefined, byTier: undefined });
    else if (mode === 'formula') setAt(i, { dynamic: 'formula', formula: e.formula ?? { variable: 'level', multiply: 1, divide: 1 }, delta: undefined, byTier: undefined });
    else setAt(i, { byTier: e.byTier ?? [1, 1, 1, 1], delta: undefined, dynamic: undefined, formula: undefined });
  };
  const bumpFormula = (i: number, key: 'multiply' | 'divide', d: number) => {
    const f = effects[i].formula ?? { variable: 'level' as const };
    const cur = f[key] ?? 1;
    setAt(i, { formula: { ...f, [key]: Math.max(1, Math.min(9, cur + d)) } });
  };
  const bumpPlus = (i: number, d: number) => {
    const f = effects[i].formula ?? { variable: 'level' as const };
    setAt(i, { formula: { ...f, plus: Math.max(-20, Math.min(40, (f.plus ?? 0) + d)) } });
  };
  const bumpTier = (i: number, t: number, d: number) => {
    const bt = [...(effects[i].byTier ?? [1, 1, 1, 1])] as [number, number, number, number];
    bt[t] = Math.max(-9, Math.min(40, (bt[t] ?? 0) + d));
    setAt(i, { byTier: bt });
  };

  const existingGroups = groupNames(effects);
  const allGroups = [...existingGroups, ...draftGroups.filter((g) => !existingGroups.includes(g))];

  const row = (e: CardEffect, i: number) => {
    const mode = modeOf(e);
    const set = isSetEffect(e);
    const v = e.delta ?? 0;
    const amount = set ? `${v}` : v >= 0 ? `+${v}` : `${v}`;
    const pv = preview ? preview(e) : null;
    return (
      <View key={i} style={{ borderWidth: 1, borderColor: 'rgba(218,162,73,0.4)', borderRadius: 6, backgroundColor: 'rgba(20,24,31,0.5)', padding: 7, gap: 6, opacity: e.off ? 0.5 : 1 }}>
        {/* v0.26.0: laid out DOWN the panel rather than crammed across one line. The target, the
            shape and the amount were three unrelated controls fighting for one row, so the
            target truncated and ±N / fx / T sat as three unlabelled glyphs. There is plenty of
            vertical space here; using it costs nothing. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {/* v0.35: the DM's per-modifier switch, on the LEFT of the row (owner). */}
          {dm ? <Check on={!e.off} onPress={() => setAt(i, { off: e.off ? undefined : true })} label={`${effectLabel(e, experiences)} applied`} /> : null}
          <Pressable onPress={() => onRequestPick(i)} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`Modifier ${effectLabel(e, experiences)}, tap to choose`}>
            <View style={{ height: 36, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 5, backgroundColor: 'rgba(14,17,22,0.6)', borderWidth: 1, borderColor: 'rgba(218,162,73,0.4)' }}>
              <Text numberOfLines={2} style={{ color: Rune.sheet, fontSize: 12, fontFamily: Body.bold }}>{effectLabel(e, experiences)}</Text>
            </View>
          </Pressable>
          {/* v0.35: which group this modifier is filed in. A player can move one; only a DM can make
              a new place to move it to. */}
          <Pressable onPress={() => setGroupPick(i)} hitSlop={6} accessibilityRole="button" accessibilityLabel={e.group ? `Filed in ${e.group}, tap to move` : 'Not in a group, tap to file'} style={{ paddingHorizontal: 3 }}>
            <View style={{ height: 36, minWidth: 30, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center', borderRadius: 5, borderWidth: 1, borderColor: e.group ? Rune.goldEdge : 'rgba(218,162,73,0.3)' }}>
              <Svg width={15} height={13} viewBox="0 0 20 16"><Polyline points="1,14 1,2 7,2 9,5 19,5 19,14 1,14" fill="none" stroke={e.group ? Rune.goldBright : Rune.muted} strokeWidth={1.6} strokeLinejoin="round" /></Svg>
            </View>
          </Pressable>
          <Pressable onPress={() => onChange(effects.filter((_, j) => j !== i))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove effect" style={{ padding: 3 }}>
            <Text style={{ color: '#E2705A', fontSize: 16, fontFamily: Body.bold }}>✕</Text>
          </Pressable>
        </View>
        {/* #325: flat / formula / by-tier selector, now on its own line and named. v0.13.0: a
            SCAR has no amount or formula, so it gets neither. */}
        {e.target !== 'scar' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Text style={{ width: 52, color: Rune.muted, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>Amount</Text>
            <ModeBtn label="±N" on={mode === 'flat'} onPress={() => setMode(i, 'flat')} a11y="Flat amount" />
            {/* An experience bonus is always a flat amount, no formula or per-tier shapes. A LEVEL
                modifier is resolved before the sheet exists (v0.35), so it has no formula either. */}
            {e.target !== 'experience' ? (
              <>
                {e.target !== 'level' ? <ModeBtn label="ƒx" on={mode === 'formula'} onPress={() => setMode(i, 'formula')} a11y="Scaling formula" /> : null}
                <ModeBtn label="T" on={mode === 'byTier'} onPress={() => setMode(i, 'byTier')} a11y="Per-tier value" />
              </>
            ) : null}
          </View>
        ) : null}
        {e.target === 'scar' ? (
          <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.regular }}>While this card is equipped, the character&apos;s rightmost open Hope slot is scarred and can&apos;t be used.</Text>
        ) : mode === 'formula' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Pressable onPress={() => onRequestPickVar(i)} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Variable ${VAR_LABEL[e.formula?.variable ?? 'level']}, tap to choose`}>
              <View style={{ height: 30, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 5, backgroundColor: 'rgba(14,17,22,0.6)', borderWidth: 1, borderColor: Rune.goldEdge }}>
                <Text style={{ color: Rune.goldBright, fontSize: 12, fontFamily: Body.bold }}>{VAR_LABEL[e.formula?.variable ?? 'level']}</Text>
              </View>
            </Pressable>
            <MiniStepper label="×" value={e.formula?.multiply ?? 1} lo={1} hi={9} onBump={(d) => bumpFormula(i, 'multiply', d)} />
            <MiniStepper label="÷" value={e.formula?.divide ?? 1} lo={1} hi={9} onBump={(d) => bumpFormula(i, 'divide', d)} />
            <MiniStepper label="+" value={e.formula?.plus ?? 0} lo={-20} hi={40} onBump={(d) => bumpPlus(i, d)} />
            {pv != null ? <Text style={{ color: Rune.goldBright, fontSize: 13, fontFamily: Display.black }}>{`= ${pv >= 0 ? '+' : ''}${pv}`}</Text> : null}
          </View>
        ) : mode === 'byTier' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {[0, 1, 2, 3].map((t) => (
              <MiniStepper key={t} label={`T${t + 1}`} value={(e.byTier ?? [0, 0, 0, 0])[t] ?? 0} lo={-9} hi={40} onBump={(d) => bumpTier(i, t, d)} />
            ))}
            {pv != null ? <Text style={{ color: Rune.goldBright, fontSize: 13, fontFamily: Display.black }}>{`now ${pv >= 0 ? '+' : ''}${pv}`}</Text> : null}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable onPress={() => bump(i, -1)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Decrease">
              <View style={{ width: 40, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 5, backgroundColor: 'rgba(14,17,22,0.6)', borderWidth: 1, borderColor: 'rgba(218,162,73,0.4)' }}>
                <Text style={{ color: Rune.sheet, fontSize: 19, fontFamily: Display.bold }}>−</Text>
              </View>
            </Pressable>
            <Text style={{ color: Rune.goldBright, fontSize: 17, fontFamily: Display.black, minWidth: 42, textAlign: 'center' }}>{amount}</Text>
            <Pressable onPress={() => bump(i, 1)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Increase">
              <View style={{ width: 40, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 5, backgroundColor: 'rgba(14,17,22,0.6)', borderWidth: 1, borderColor: 'rgba(218,162,73,0.4)' }}>
                <Text style={{ color: Rune.sheet, fontSize: 19, fontFamily: Display.bold }}>+</Text>
              </View>
            </Pressable>
            <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.regular, flex: 1 }}>{set ? 'absolute value' : e.target === 'level' ? 'levels added' : 'flat ± amount'}</Text>
          </View>
        )}
        {/* v0.26.0: PERMANENT. Some rulebook cards give you something once and you keep it, and
            the card then tells you to put it away (Vitality is the clearest). Without this the
            benefit died the moment you followed the card's own instructions.
            The warning is here, at the moment of choosing, rather than later when unequipping
            mysteriously does nothing. */}
        {e.target !== 'scar' && e.target !== 'experience' ? (
          <View style={{ gap: 4, borderTopWidth: 1, borderTopColor: 'rgba(218,162,73,0.18)', paddingTop: 6 }}>
            <Pressable onPress={() => setAt(i, { permanent: e.permanent ? undefined : true })} accessibilityRole="switch" accessibilityState={{ checked: !!e.permanent }} accessibilityLabel="Permanent">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 18, height: 18, borderRadius: 3, borderWidth: 1.6, borderColor: e.permanent ? Rune.goldBright : 'rgba(218,162,73,0.45)', backgroundColor: e.permanent ? Rune.goldBright : 'transparent' }} />
                <Text style={{ color: e.permanent ? Rune.goldBright : Rune.sheet, fontSize: 12, fontFamily: Body.bold }}>Permanent</Text>
              </View>
            </Pressable>
            <Text style={{ color: Rune.muted, fontSize: 10, lineHeight: 14, fontFamily: Body.regular }}>
              {e.permanent
                ? 'Kept whether or not the card is equipped. To lose it you must delete this card from every category it appears in.'
                : 'Applies only while the card is equipped.'}
            </Text>
            {/* v0.32.0: OVERWRITE. Some cards do not add to a stat, they replace it: Overwhelming
                Aura's "your Presence is equal to your Spellcast trait" is a statement about what
                Presence IS. Modelling that as a bonus would have needed a number nobody can know
                in advance. */}
            <Pressable onPress={() => setAt(i, { overwrite: e.overwrite ? undefined : true })} accessibilityRole="switch" accessibilityState={{ checked: !!e.overwrite }} accessibilityLabel="Overwrite" style={{ marginTop: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 18, height: 18, borderRadius: 3, borderWidth: 1.6, borderColor: e.overwrite ? Rune.goldBright : 'rgba(218,162,73,0.45)', backgroundColor: e.overwrite ? Rune.goldBright : 'transparent' }} />
                <Text style={{ color: e.overwrite ? Rune.goldBright : Rune.sheet, fontSize: 12, fontFamily: Body.bold }}>Overwrite</Text>
              </View>
            </Pressable>
            <Text style={{ color: Rune.muted, fontSize: 10, lineHeight: 14, fontFamily: Body.regular }}>
              {e.overwrite
                ? 'The stat BECOMES this value. Everything else contributing to it is discarded, however it got there.'
                : 'Adds to whatever else is contributing to the stat.'}
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  const bands = groupEffects(effects);
  const loose = bands[0];

  return (
    <View style={{ gap: 7, marginTop: 2 }}>
      <Text style={{ color: Rune.bronze, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>Effects when enabled</Text>
      {effects.length === 0 ? (
        <Text style={{ color: Rune.muted, fontSize: 11.5, fontFamily: Body.regular }}>None. Add one for a buff or penalty (e.g. +3 Max HP, −1 Evasion, Set Major Threshold 8). Use ƒx for a formula (e.g. ×Proficiency, ½ Agility, Strength +3) or T for per-tier values.</Text>
      ) : null}
      {loose.rows.map((r) => row(r.effect, r.index))}
      {allGroups.map((name) => {
        const rows = bands.find((b) => b.name === name)?.rows ?? [];
        const open = !shut.includes(name);
        const on = isGroupOn(effects, name);
        return (
          <View key={name} style={{ borderWidth: 1, borderColor: 'rgba(218,162,73,0.45)', borderRadius: 6, backgroundColor: 'rgba(14,17,22,0.45)', padding: 6, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {/* Only a DM switches a whole group; a player can open it and read it. */}
              {dm ? <Check on={on} onPress={() => onChange(setGroupOn(effects, name, !on))} label={`${name} applied`} /> : null}
              <Pressable
                onPress={() => toggleOpen(name)}
                onLongPress={dm ? () => setNaming(name) : undefined}
                delayLongPress={340}
                style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.6 : 1 })}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={`${name}, ${rows.length} modifiers${dm ? ', hold to rename' : ''}`}>
                <Svg width={11} height={11} viewBox="0 0 16 16" style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
                  <Polyline points="5,3 11,8 5,13" fill="none" stroke={Rune.goldText} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
                <Text numberOfLines={1} style={{ flex: 1, color: Rune.goldText, fontSize: 12.5, fontFamily: Body.bold, letterSpacing: 0.4, textTransform: 'uppercase' }}>{name}</Text>
                <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.bold }}>{rows.length}</Text>
              </Pressable>
              {/* v0.35.2 (owner): rename. A hold on the header works too; the pencil is the visible way. */}
              {dm ? (
                <Pressable onPress={() => setNaming(name)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Rename ${name}`} style={({ pressed }) => ({ padding: 3, opacity: pressed ? 0.55 : 1 })}>
                  <Svg width={13} height={13} viewBox="0 0 24 24">
                    <Path d="M4 20 L4.5 15.5 L15 5 L19 9 L8.5 19.5 Z" fill="none" stroke={Rune.goldText} strokeWidth={1.9} strokeLinejoin="round" />
                  </Svg>
                </Pressable>
              ) : null}
              {/* Deleting the group keeps every modifier in it; they come back out ungrouped. */}
              <Pressable onPress={() => { setDraftGroups((g) => g.filter((n) => n !== name)); onChange(deleteGroup(effects, name)); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Delete the group ${name}`} style={{ padding: 3 }}>
                <Text style={{ color: '#E2705A', fontSize: 15, fontFamily: Body.bold }}>✕</Text>
              </Pressable>
            </View>
            {open ? (
              <>
                {rows.length ? rows.map((r) => row(r.effect, r.index)) : <Text style={{ color: Rune.muted, fontSize: 10.5, fontFamily: Body.regular, paddingHorizontal: 4, paddingBottom: 2 }}>Empty. Add one below, move one in with the folder button, or this group is gone when you save.</Text>}
                {/* v0.35.1 (owner): add straight INTO the open group. Adding at the bottom and then
                    filing it with the folder button is two steps for the common case. */}
                <Pressable onPress={() => onChange([...effects, { target: 'maxHp', delta: 1, group: name }])} accessibilityRole="button" accessibilityLabel={`Add a modifier to ${name}`} style={{ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 5, borderWidth: 1, borderColor: 'rgba(218,162,73,0.4)' }}>
                  <Text style={{ color: Rune.goldText, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 0.5, textTransform: 'uppercase' }}>+ Add here</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        );
      })}
      {/* v0.35.2 (owner): side by side, with Add effect on the right. */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {dm ? <RuneButton label="+ New group" kind="ghost" dense height={36} style={{ flex: 1 }} onPress={() => setNaming('')} /> : null}
        <RuneButton label="+ Add effect" kind="secondary" dense height={36} style={{ flex: 1 }} onPress={() => onChange([...effects, { target: 'maxHp', delta: 1 }])} />
      </View>
      {naming != null ? (
        <Overlay><GroupNameDialog
          title={naming ? 'Rename group' : 'Name the group'}
          initial={naming}
          taken={allGroups}
          onSave={(next) => {
            if (naming) {
              onChange(renameGroup(effects, naming, next));
              setDraftGroups((g) => g.map((n) => (n === naming ? next : n)));
              setShut(shut.map((n) => (n === naming ? next : n)));
            } else {
              setDraftGroups((g) => [...g, next]);
            }
            setNaming(null);
          }}
          onClose={() => setNaming(null)}
        /></Overlay>
      ) : null}
      {groupPick != null && effects[groupPick] ? (
        <Overlay><GroupPicker
          current={effects[groupPick].group}
          groups={allGroups}
          dm={dm}
          onPick={(g) => {
            if (g && !allGroups.includes(g)) setDraftGroups((d) => [...d, g]);
            onChange(moveToGroup(effects, groupPick, g));
            setGroupPick(null);
          }}
          onClose={() => setGroupPick(null)}
        /></Overlay>
      ) : null}
    </View>
  );
}
