import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Rune } from '@/constants/theme';
import { advOption, advRemaining, applyLevelUp, availableAdvancements, type ChosenAdv, isTierStart, type LevelDefaults, type LevelUpPlan, picksUsed, tierForLevel } from '@/lib/leveling';
import type { CharacterFile } from '@/lib/character-file';

import { TRAIT_ORDER } from '../character';
import { DomainCarousel } from './domain-carousel';
import type { DomainCardInfo } from './settings-panel';
import { OverlayShell } from './overlay-shell';

/** Small selectable chip. */
function Chip({ label, on, disabled, onPress }: { label: string; on: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected: on, disabled }}>
      <ChamferBox chamfer={6} fill={on ? Rune.red : 'rgba(20,24,31,0.7)'} stroke={on ? 'transparent' : 'rgba(218,162,73,0.4)'} strokeWidth={1} style={{ paddingHorizontal: 10, paddingVertical: 6, opacity: disabled ? 0.4 : 1 }}>
        <Text style={{ color: on ? Rune.ivory : Rune.muted, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.3, textTransform: 'uppercase' }}>{label}</Text>
      </ChamferBox>
    </Pressable>
  );
}

/**
 * Level Up (#167) — the Daggerheart advancement flow, adapted from character creation. Shows the
 * automatic effects (level, +1/+1 thresholds, a new domain card, and at a tier start a +2 Experience
 * + proficiency), then has you choose two advancements (with their sub-selections). Applies to the
 * file via applyLevelUp; toSheetCharacter derives the new runtime stats.
 */
export function LevelUpPanel({
  file,
  defaults,
  domainOptions,
  classOptions,
  onApply,
  onClose,
}: {
  file: CharacterFile;
  defaults: LevelDefaults;
  domainOptions: DomainCardInfo[];
  classOptions: { key: string; label: string }[];
  onApply: (next: CharacterFile) => void;
  onClose: () => void;
}) {
  const newLevel = file.level + 1;
  const tier = tierForLevel(newLevel);
  const tierStart = isTierStart(newLevel);
  const exps = file.experiences ?? [];
  const marked = file.traitMarks ?? [];

  const [autoDomain, setAutoDomain] = useState<string | null>(null);
  const [expTitle, setExpTitle] = useState('');
  const [takes, setTakes] = useState<ChosenAdv[]>([]);

  const picks = picksUsed(takes);
  const remainingPicks = 2 - picks;
  const takesOfKey = (k: string) => takes.filter((t) => t.key === k).length;
  const canAdd = (key: ReturnType<typeof advOption>['key']) => {
    const opt = advOption(key);
    if (opt.needs === 'exps' && exps.length < 2) return false;
    if (remainingPicks < opt.picks) return false;
    return advRemaining(file, key) - takesOfKey(key) * opt.picks >= opt.picks;
  };
  const addTake = (key: ChosenAdv['key']) => setTakes((t) => [...t, { key, traits: [], expIds: [] }]);
  const removeTake = (i: number) => setTakes((t) => t.filter((_, j) => j !== i));
  const toggleIn = (i: number, field: 'traits' | 'expIds', val: string, max: number) =>
    setTakes((t) =>
      t.map((x, j) => {
        if (j !== i) return x;
        const cur = (x[field] ?? []) as string[];
        const has = cur.includes(val);
        const nx = has ? cur.filter((v) => v !== val) : cur.length < max ? [...cur, val] : cur;
        return { ...x, [field]: nx };
      }),
    );
  const setField = (i: number, patch: Partial<ChosenAdv>) => setTakes((t) => t.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const domainPoolFor = (idx: number) => domainOptions.filter((d) => d.id !== autoDomain && !takes.some((t, j) => j !== idx && t.domainCardId === d.id));

  const takeComplete = (t: ChosenAdv) => {
    const needs = advOption(t.key).needs;
    if (needs === 'traits') return (t.traits ?? []).length === 2;
    if (needs === 'exps') return (t.expIds ?? []).length === 2;
    if (needs === 'domain') return !!t.domainCardId;
    if (needs === 'multiclass') return !!t.multiclass;
    return true;
  };
  const canConfirm = !!autoDomain && (!tierStart || expTitle.trim().length > 0) && picks === 2 && takes.every(takeComplete);
  const confirm = () => {
    const planObj: LevelUpPlan = { domainCardId: autoDomain!, experienceTitle: tierStart ? expTitle.trim() : undefined, advancements: takes };
    onApply(applyLevelUp(file, planObj, defaults));
  };

  const addable = availableAdvancements(file, newLevel).filter((o) => canAdd(o.key));

  return (
    <OverlayShell
      title="Level Up"
      subtitle={`Level ${file.level} → ${newLevel} · Tier ${tier}`}
      onClose={onClose}
      dismissOnScrim={false}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <RuneButton label="Cancel" kind="ghost" height={44} style={{ flex: 1 }} onPress={onClose} />
          <RuneButton label="Confirm level" kind="primary" height={44} style={{ flex: 1.6 }} disabled={!canConfirm} onPress={confirm} />
        </View>
      }>
      {/* auto effects */}
      <ChamferBox chamfer={9} fill="rgba(20,24,31,0.55)" stroke="rgba(218,162,73,0.4)" strokeWidth={1.1} style={{ paddingVertical: 10, paddingHorizontal: 12 }}>
        <Text style={{ color: Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>Automatic</Text>
        {[`Level ${newLevel}`, '+1 to both damage thresholds', 'Gain a domain card', ...(tierStart ? ['New Experience (+2)', '+1 Proficiency', ...(newLevel === 5 || newLevel === 8 ? ['Clear trait marks'] : [])] : [])].map((line) => (
          <Text key={line} style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.regular }}>{`· ${line}`}</Text>
        ))}
      </ChamferBox>

      {/* auto domain card — a swipeable carousel of the available cards */}
      <Text style={{ color: Rune.bronze, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>New domain card (≤ level {newLevel})</Text>
      <DomainCarousel cards={domainOptions.filter((d) => !takes.some((t) => t.domainCardId === d.id))} selectedId={autoDomain ?? undefined} onSelect={(id) => setAutoDomain((cur) => (cur === id ? null : id))} />

      {/* tier experience */}
      {tierStart ? (
        <>
          <Text style={{ color: Rune.bronze, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>New Experience (+2)</Text>
          <ChamferBox chamfer={8} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ height: 44, justifyContent: 'center', paddingHorizontal: 12 }}>
            <TextInput value={expTitle} onChangeText={setExpTitle} placeholder="e.g. Silver Tongue" placeholderTextColor={Rune.muted} selectionColor={Rune.goldBright} maxLength={30} style={{ color: Rune.sheet, fontSize: 14, fontFamily: Body.semibold, padding: 0 }} accessibilityLabel="New experience name" />
          </ChamferBox>
        </>
      ) : null}

      {/* advancements */}
      <Text style={{ color: Rune.bronze, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 4 }}>{`Choose 2 advancements · ${picks}/2`}</Text>
      {takes.map((t, i) => {
        const opt = advOption(t.key);
        return (
          <ChamferBox key={`${t.key}-${i}`} chamfer={8} fill="rgba(200,27,24,0.12)" stroke={Rune.red} strokeWidth={1.2} style={{ paddingVertical: 9, paddingHorizontal: 11, gap: 7 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: Rune.sheet, fontSize: 13, fontFamily: Body.bold, flex: 1 }}>{opt.label}{opt.picks === 2 ? ' (×2)' : ''}</Text>
              <Pressable onPress={() => removeTake(i)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${opt.label}`} style={{ padding: 3 }}>
                <Text style={{ color: '#E2705A', fontSize: 16, fontFamily: Body.bold }}>✕</Text>
              </Pressable>
            </View>
            {opt.needs === 'traits' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {TRAIT_ORDER.map((tr) => {
                  const sel = (t.traits ?? []).includes(tr.key);
                  const lockMarked = marked.includes(tr.key);
                  return <Chip key={tr.key} label={tr.label} on={sel} disabled={lockMarked || (!sel && (t.traits ?? []).length >= 2)} onPress={() => toggleIn(i, 'traits', tr.key, 2)} />;
                })}
              </View>
            ) : null}
            {opt.needs === 'exps' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {exps.map((e) => {
                  const sel = (t.expIds ?? []).includes(e.id);
                  return <Chip key={e.id} label={e.title} on={sel} disabled={!sel && (t.expIds ?? []).length >= 2} onPress={() => toggleIn(i, 'expIds', e.id, 2)} />;
                })}
              </View>
            ) : null}
            {opt.needs === 'domain' ? (
              <DomainCarousel cards={domainPoolFor(i)} selectedId={t.domainCardId} onSelect={(id) => setField(i, { domainCardId: t.domainCardId === id ? undefined : id })} />
            ) : null}
            {opt.needs === 'multiclass' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {classOptions.map((c) => <Chip key={c.key} label={c.label} on={t.multiclass === c.key} onPress={() => setField(i, { multiclass: t.multiclass === c.key ? undefined : c.key })} />)}
              </View>
            ) : null}
          </ChamferBox>
        );
      })}

      {remainingPicks > 0 ? (
        <View style={{ gap: 6 }}>
          {addable.length === 0 ? <Text style={{ color: Rune.muted, fontSize: 11.5, fontFamily: Body.regular }}>No more advancements available.</Text> : null}
          {addable.map((o) => (
            <Pressable key={o.key} onPress={() => addTake(o.key)} accessibilityRole="button" accessibilityLabel={o.label}>
              <ChamferBox chamfer={8} fill="rgba(20,24,31,0.6)" stroke="rgba(218,162,73,0.45)" strokeWidth={1.2} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: Rune.sheet, fontSize: 13, fontFamily: Body.bold }}>{o.label}{o.picks === 2 ? ' (uses both)' : ''}</Text>
                  <Text style={{ color: Rune.muted, fontSize: 10.5, fontFamily: Body.regular, marginTop: 1 }}>{o.desc}</Text>
                </View>
                <Text style={{ color: Rune.goldBright, fontSize: 22, fontFamily: Body.bold, marginLeft: 8 }}>+</Text>
              </ChamferBox>
            </Pressable>
          ))}
        </View>
      ) : null}
    </OverlayShell>
  );
}
