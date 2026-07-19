import { Pressable, ScrollView, Text, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { type CardEffect, type EffectFormula, type EffectTarget, TARGET_LABEL } from '@/lib/modifiers';

/**
 * The shared "Effects when enabled" editor (#278) — used by the card create/edit dialog AND the per-card
 * Modifiers panel, so they always edit the same effect list. Each row is a modifier with either a
 * SIMPLE flat amount (±N, or a 0–40 Set threshold) or an ADVANCED formula (a sheet variable scaled by
 * ×/÷, rounded up). `EffectPicker` (the target chooser) is rendered at the parent's root.
 */

export interface EffectOption { key: string; label: string; target: EffectTarget; mode?: 'set' | 'bonus'; experienceId?: string }

/** A character's Experiences, the minimum this module needs to build their picker options. */
export interface ExperienceRef { id: string; title: string }

/** v0.14.0: the Experiences group is per-CHARACTER, so it can't live in the static groups below — it's
 *  generated from the file and appended. Every Experience is offered, however many the character has. */
export function experienceOptions(experiences: ExperienceRef[] | undefined): EffectOption[] {
  return (experiences ?? []).map((e, i) => ({ key: `experience:${e.id}`, label: e.title.trim() || `Experience ${i + 1}`, target: 'experience' as EffectTarget, experienceId: e.id }));
}
export const EFFECT_GROUPS: { label: string; options: EffectOption[] }[] = [
  { label: 'Resources', options: [
    { key: 'maxHp', label: 'Max Hit Points', target: 'maxHp' },
    { key: 'stressMax', label: 'Max Stress', target: 'stressMax' },
    { key: 'hopeMax', label: 'Max Hope', target: 'hopeMax' },
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
  // v0.13.0 SCARS: no amount, no formula — equipping the card scars one Hope slot, full stop.
  { label: 'Misc', options: [
    { key: 'scar', label: 'Add Scar', target: 'scar' },
  ] },
];
const ALL_EFFECT_OPTIONS = EFFECT_GROUPS.flatMap((g) => g.options);
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

/** Formula variables a player can scale (#278). */
const FORMULA_VARS: EffectFormula['variable'][] = ['level', 'tier', 'proficiency', 'agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];
const VAR_LABEL: Record<EffectFormula['variable'], string> = {
  level: 'Level', tier: 'Tier', proficiency: 'Proficiency', agility: 'Agility', strength: 'Strength', finesse: 'Finesse', instinct: 'Instinct', presence: 'Presence', knowledge: 'Knowledge',
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
export function FormulaVarPicker({ current, onPick, onClose }: { current?: EffectFormula['variable']; onPick: (v: EffectFormula['variable']) => void; onClose: () => void }) {
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 10002, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,8,13,0.9)' }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 300, maxHeight: '82%', paddingHorizontal: 16, paddingVertical: 16 }}>
        <Text style={{ color: Rune.goldText, fontSize: 18, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Pick a variable</Text>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingBottom: 4 }}>
          {FORMULA_VARS.map((v) => {
            const on = current === v;
            return (
              <Pressable key={v} onPress={() => onPick(v)} accessibilityRole="button" accessibilityState={{ selected: on }}>
                <View style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 5, backgroundColor: on ? Rune.red : 'rgba(20,24,31,0.7)', borderWidth: 1, borderColor: on ? 'transparent' : 'rgba(218,162,73,0.4)' }}>
                  <Text style={{ color: on ? Rune.ivory : Rune.sheet, fontSize: 13.5, fontFamily: Body.bold }}>{VAR_LABEL[v]}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </ChamferBox>
    </View>
  );
}

export function EffectPicker({ current, onPick, onClose, experiences }: { current?: EffectOption; onPick: (o: EffectOption) => void; onClose: () => void; experiences?: ExperienceRef[] }) {
  const expOpts = experienceOptions(experiences);
  const groups = expOpts.length ? [...EFFECT_GROUPS, { label: 'Experiences', options: expOpts }] : EFFECT_GROUPS;
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 10002, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,8,13,0.9)' }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
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

export function EffectsField({ effects, onChange, onRequestPick, onRequestPickVar, preview, experiences }: {
  effects: CardEffect[];
  onChange: (e: CardEffect[]) => void;
  /** v0.14.0: the character's Experiences, so an experience-targeting row shows WHICH one by name. */
  experiences?: ExperienceRef[];
  onRequestPick: (i: number) => void;
  /** #325: open the variable PICKER for the formula at index i (a panel, not a cycle). */
  onRequestPickVar: (i: number) => void;
  /** Optional resolver for the live "= N" value preview (current character) — formula/by-tier. */
  preview?: (e: CardEffect) => number | null;
}) {
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
  return (
    <View style={{ gap: 7, marginTop: 2 }}>
      <Text style={{ color: Rune.bronze, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>Effects when enabled</Text>
      {effects.length === 0 ? (
        <Text style={{ color: Rune.muted, fontSize: 11.5, fontFamily: Body.regular }}>None. Add one for a buff or penalty (e.g. +3 Max HP, −1 Evasion, Set Major Threshold 8). Use ƒx for a formula (e.g. ×Proficiency, ½ Agility, Strength +3) or T for per-tier values.</Text>
      ) : null}
      {effects.map((e, i) => {
        const mode = modeOf(e);
        const set = isSetEffect(e);
        const v = e.delta ?? 0;
        const amount = set ? `${v}` : v >= 0 ? `+${v}` : `${v}`;
        const pv = preview ? preview(e) : null;
        return (
          <View key={i} style={{ borderWidth: 1, borderColor: 'rgba(218,162,73,0.4)', borderRadius: 6, backgroundColor: 'rgba(20,24,31,0.5)', padding: 7, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Pressable onPress={() => onRequestPick(i)} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`Modifier ${effectLabel(e, experiences)}, tap to choose`}>
                <View style={{ height: 34, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 5, backgroundColor: 'rgba(14,17,22,0.6)', borderWidth: 1, borderColor: 'rgba(218,162,73,0.4)' }}>
                  <Text numberOfLines={1} style={{ color: Rune.sheet, fontSize: 12, fontFamily: Body.bold }}>{effectLabel(e, experiences)}</Text>
                </View>
              </Pressable>
              {/* #325: flat / formula / by-tier selector. v0.13.0: a SCAR has no amount or formula —
                  the row is just the pick + remove. */}
              {e.target !== 'scar' ? (
                <>
                  <ModeBtn label="±N" on={mode === 'flat'} onPress={() => setMode(i, 'flat')} a11y="Flat amount" />
                  {/* An experience bonus is always a flat amount — no formula or per-tier shapes. */}
                  {e.target !== 'experience' ? (
                    <>
                      <ModeBtn label="ƒx" on={mode === 'formula'} onPress={() => setMode(i, 'formula')} a11y="Scaling formula" />
                      <ModeBtn label="T" on={mode === 'byTier'} onPress={() => setMode(i, 'byTier')} a11y="Per-tier value" />
                    </>
                  ) : null}
                </>
              ) : null}
              <Pressable onPress={() => onChange(effects.filter((_, j) => j !== i))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove effect" style={{ padding: 3 }}>
                <Text style={{ color: '#E2705A', fontSize: 16, fontFamily: Body.bold }}>✕</Text>
              </Pressable>
            </View>
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
                <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.regular, flex: 1 }}>{set ? 'absolute value' : 'flat ± amount'}</Text>
              </View>
            )}
          </View>
        );
      })}
      <RuneButton label="+ Add effect" kind="secondary" dense height={36} onPress={() => onChange([...effects, { target: 'maxHp', delta: 1 }])} />
    </View>
  );
}
