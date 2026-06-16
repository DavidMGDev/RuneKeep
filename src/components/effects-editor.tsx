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

export interface EffectOption { key: string; label: string; target: EffectTarget; mode?: 'set' | 'bonus' }
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
];
const ALL_EFFECT_OPTIONS = EFFECT_GROUPS.flatMap((g) => g.options);
export const isThresholdTarget = (t: EffectTarget) => t === 'majorThreshold' || t === 'severeThreshold';
export const isSetEffect = (e: CardEffect) => isThresholdTarget(e.target) && e.mode === 'set' && e.dynamic !== 'formula';
export function matchOption(e: CardEffect): EffectOption | undefined {
  return ALL_EFFECT_OPTIONS.find((o) => o.target === e.target && (isThresholdTarget(e.target) ? (o.mode ?? 'bonus') === (e.mode ?? 'bonus') : true));
}
export function effectLabel(e: CardEffect): string {
  return matchOption(e)?.label ?? TARGET_LABEL[e.target];
}

/** Formula variables a player can scale (#278). */
const FORMULA_VARS: EffectFormula['variable'][] = ['level', 'tier', 'proficiency', 'agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];
const VAR_LABEL: Record<EffectFormula['variable'], string> = {
  level: 'Level', tier: 'Tier', proficiency: 'Proficiency', agility: 'Agility', strength: 'Strength', finesse: 'Finesse', instinct: 'Instinct', presence: 'Presence', knowledge: 'Knowledge',
};

export function EffectPicker({ current, onPick, onClose }: { current?: EffectOption; onPick: (o: EffectOption) => void; onClose: () => void }) {
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 10002, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,8,13,0.9)' }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 320, maxHeight: '82%', paddingHorizontal: 16, paddingVertical: 16 }}>
        <Text style={{ color: Rune.goldText, fontSize: 18, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Pick a modifier</Text>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 11, paddingBottom: 4 }}>
          {EFFECT_GROUPS.map((g) => (
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

export function EffectsField({ effects, onChange, onRequestPick, preview }: {
  effects: CardEffect[];
  onChange: (e: CardEffect[]) => void;
  onRequestPick: (i: number) => void;
  /** Optional resolver for the live "= N" formula preview (current character). */
  preview?: (e: CardEffect) => number | null;
}) {
  const setAt = (i: number, patch: Partial<CardEffect>) => onChange(effects.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const bump = (i: number, d: number) => {
    const e = effects[i];
    const [lo, hi] = isSetEffect(e) ? [0, 40] : [-9, 12];
    setAt(i, { delta: Math.max(lo, Math.min(hi, (e.delta ?? 0) + d)) });
  };
  const toggleFormula = (i: number) => {
    const e = effects[i];
    if (e.dynamic === 'formula') setAt(i, { dynamic: undefined, formula: undefined, delta: e.delta ?? 1 });
    else setAt(i, { dynamic: 'formula', formula: e.formula ?? { variable: 'level', multiply: 1, divide: 1 }, delta: undefined });
  };
  const cycleVar = (i: number) => {
    const f = effects[i].formula ?? { variable: 'level' as const };
    const next = FORMULA_VARS[(FORMULA_VARS.indexOf(f.variable) + 1) % FORMULA_VARS.length];
    setAt(i, { formula: { ...f, variable: next } });
  };
  const bumpFormula = (i: number, key: 'multiply' | 'divide', d: number) => {
    const f = effects[i].formula ?? { variable: 'level' as const };
    const cur = f[key] ?? 1;
    setAt(i, { formula: { ...f, [key]: Math.max(1, Math.min(9, cur + d)) } });
  };
  return (
    <View style={{ gap: 7, marginTop: 2 }}>
      <Text style={{ color: Rune.bronze, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>Effects when enabled</Text>
      {effects.length === 0 ? (
        <Text style={{ color: Rune.muted, fontSize: 11.5, fontFamily: Body.regular }}>None. Add one for a buff or penalty (e.g. +3 Max HP, −1 Evasion, Set Major Threshold 8). Tap ƒ for a formula (e.g. ×Proficiency, ½ Level).</Text>
      ) : null}
      {effects.map((e, i) => {
        const isFormula = e.dynamic === 'formula';
        const set = isSetEffect(e);
        const v = e.delta ?? 0;
        const amount = set ? `${v}` : v >= 0 ? `+${v}` : `${v}`;
        const pv = preview && isFormula ? preview(e) : null;
        return (
          <View key={i} style={{ borderWidth: 1, borderColor: 'rgba(218,162,73,0.4)', borderRadius: 6, backgroundColor: 'rgba(20,24,31,0.5)', padding: 7, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Pressable onPress={() => onRequestPick(i)} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`Modifier ${effectLabel(e)}, tap to choose`}>
                <View style={{ height: 34, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 5, backgroundColor: 'rgba(14,17,22,0.6)', borderWidth: 1, borderColor: 'rgba(218,162,73,0.4)' }}>
                  <Text numberOfLines={1} style={{ color: Rune.sheet, fontSize: 12, fontFamily: Body.bold }}>{effectLabel(e)}</Text>
                </View>
              </Pressable>
              <Pressable onPress={() => toggleFormula(i)} hitSlop={4} accessibilityRole="button" accessibilityLabel={isFormula ? 'Use a flat amount' : 'Use a formula'} accessibilityState={{ selected: isFormula }}>
                <View style={{ width: 38, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 5, backgroundColor: isFormula ? Rune.red : 'rgba(14,17,22,0.6)', borderWidth: 1, borderColor: isFormula ? 'transparent' : 'rgba(218,162,73,0.4)' }}>
                  <Text style={{ color: isFormula ? Rune.ivory : Rune.bronze, fontSize: 13, fontFamily: Display.bold }}>{isFormula ? 'ƒx' : '123'}</Text>
                </View>
              </Pressable>
              <Pressable onPress={() => onChange(effects.filter((_, j) => j !== i))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove effect" style={{ padding: 3 }}>
                <Text style={{ color: '#E2705A', fontSize: 16, fontFamily: Body.bold }}>✕</Text>
              </Pressable>
            </View>
            {isFormula ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Pressable onPress={() => cycleVar(i)} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Variable ${VAR_LABEL[e.formula?.variable ?? 'level']}, tap to change`}>
                  <View style={{ height: 30, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 5, backgroundColor: 'rgba(14,17,22,0.6)', borderWidth: 1, borderColor: Rune.goldEdge }}>
                    <Text style={{ color: Rune.goldBright, fontSize: 12, fontFamily: Body.bold }}>{VAR_LABEL[e.formula?.variable ?? 'level']}</Text>
                  </View>
                </Pressable>
                <MiniStepper label="×" value={e.formula?.multiply ?? 1} lo={1} hi={9} onBump={(d) => bumpFormula(i, 'multiply', d)} />
                <MiniStepper label="÷" value={e.formula?.divide ?? 1} lo={1} hi={9} onBump={(d) => bumpFormula(i, 'divide', d)} />
                {pv != null ? <Text style={{ color: Rune.goldBright, fontSize: 13, fontFamily: Display.black }}>{`= ${pv >= 0 ? '+' : ''}${pv}`}</Text> : null}
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
