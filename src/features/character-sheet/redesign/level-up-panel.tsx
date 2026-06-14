import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { CardEditor } from '@/components/card-editor';
import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { useScreenInsets } from '@/components/app-screen';
import { Body, Display, Rune } from '@/constants/theme';
import { advOption, advRemaining, applyLevelUp, availableAdvancements, type ChosenAdv, isTierStart, type LevelDefaults, type LevelUpPlan, picksUsed, tierForLevel } from '@/lib/leveling';
import type { CharacterFile } from '@/lib/character-file';
import { StraightCarousel, type StraightCarouselHandle, type StraightItem } from '@/features/create/straight-carousel';

import { TRAIT_ORDER } from '../character';
import type { DomainCardInfo } from './domain-card-info';

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
 * Level Up (#167; rebuilt #203) — full-screen, with the real card carousel (StraightCarousel) for the
 * domain pick (fullscreen-able, no name labels needed) as the ONE carousel. The "extra domain card"
 * advancement just lets you pick TWO cards on it. Everything else (auto effects, the tier Experience
 * via the experience editor, the other advancements) sits in a scroll below. The sheet's own carousel
 * is unloaded while this is open (redesigned-sheet), so it stays smooth.
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
  const insets = useScreenInsets();
  const newLevel = file.level + 1;
  const tier = tierForLevel(newLevel);
  const tierStart = isTierStart(newLevel);
  const exps = file.experiences ?? [];
  const marked = file.traitMarks ?? [];

  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [centerIdx, setCenterIdx] = useState(0);
  const [expTitle, setExpTitle] = useState('');
  const [editingExp, setEditingExp] = useState(false);
  const [takes, setTakes] = useState<ChosenAdv[]>([]);
  const carRef = useRef<StraightCarouselHandle>(null);

  // The new tier Experience the player is writing now (#211): predict the id applyLevelUp will give
  // it so the '+1 to two Experiences' advancement can target it, and count it toward that option's
  // availability. Advancements stay LOCKED until it's written (so they can boost the one just made).
  const pendingExp = tierStart && expTitle.trim() ? { id: `exp-lvl${newLevel}-${exps.length}`, title: expTitle.trim() } : null;
  const expChoices = pendingExp ? [...exps, pendingExp] : exps;
  const expReady = !tierStart || !!expTitle.trim();

  const hasDomainAdv = takes.some((t) => t.key === 'domain');
  const maxDomains = 1 + (hasDomainAdv ? 1 : 0);
  const items: StraightItem[] = domainOptions.map((d) => ({ id: d.id, thumb: d.thumb, source: d.source, label: d.title }));

  const centerId = domainOptions[Math.min(centerIdx, domainOptions.length - 1)]?.id;
  const centeredSelected = !!centerId && selectedDomains.includes(centerId);
  const toggleDomain = () => {
    if (!centerId) return;
    setSelectedDomains((cur) => {
      if (cur.includes(centerId)) return cur.filter((x) => x !== centerId);
      if (cur.length < maxDomains) return [...cur, centerId];
      return maxDomains === 1 ? [centerId] : cur; // single pick replaces; at the 2-cap, block
    });
  };

  const picks = picksUsed(takes);
  const remainingPicks = 2 - picks;
  const takesOfKey = (k: string) => takes.filter((t) => t.key === k).length;
  const canAdd = (key: ReturnType<typeof advOption>['key']) => {
    const opt = advOption(key);
    if (opt.needs === 'exps' && expChoices.length < 2) return false;
    if (remainingPicks < opt.picks) return false;
    return advRemaining(file, key) - takesOfKey(key) * opt.picks >= opt.picks;
  };
  const addTake = (key: ChosenAdv['key']) => setTakes((t) => [...t, { key, traits: [], expIds: [] }]);
  const removeTake = (i: number) =>
    setTakes((t) => {
      const nt = t.filter((_, j) => j !== i);
      if (!nt.some((x) => x.key === 'domain')) setSelectedDomains((d) => d.slice(0, 1)); // dropping the extra → keep one
      return nt;
    });
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

  const takeComplete = (t: ChosenAdv) => {
    const needs = advOption(t.key).needs;
    if (needs === 'traits') return (t.traits ?? []).length === 2;
    if (needs === 'exps') return (t.expIds ?? []).length === 2;
    if (needs === 'domain') return selectedDomains.length === 2; // the 2nd carousel pick fills it
    if (needs === 'multiclass') return !!t.multiclass;
    return true;
  };
  const canConfirm = selectedDomains.length >= 1 && (!hasDomainAdv || selectedDomains.length === 2) && (!tierStart || expTitle.trim().length > 0) && picks === 2 && takes.every(takeComplete);
  const confirm = () => {
    const advs = takes.map((t) => (t.key === 'domain' ? { ...t, domainCardId: selectedDomains[1] } : t));
    const plan: LevelUpPlan = { domainCardId: selectedDomains[0], experienceTitle: tierStart ? expTitle.trim() : undefined, advancements: advs };
    onApply(applyLevelUp(file, plan, defaults));
  };

  const addable = availableAdvancements(file, newLevel).filter((o) => canAdd(o.key));

  // entrance (#201/#203)
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = reduced ? 1 : withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [p, reduced]);
  const panelStyle = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 16 }] }));

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000, backgroundColor: 'rgba(8,10,15,0.97)' }}>
      <Animated.View style={[{ flex: 1, marginTop: insets.top + 6, marginBottom: insets.bottom + 6, paddingHorizontal: 14 }, panelStyle]}>
        {/* header */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 2 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: Rune.goldText, fontSize: 22, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5 }}>Level Up</Text>
            <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.medium }}>{`Level ${file.level} → ${newLevel} · Tier ${tier}`}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={{ padding: 4 }}>
            <Text style={{ color: Rune.muted, fontSize: 18, fontFamily: Body.bold }}>✕</Text>
          </Pressable>
        </View>

        {/* the ONE carousel — the new domain card(s); tap a card to full-screen it (#203) */}
        <Text style={{ color: Rune.bronze, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>{`New domain card · pick ${selectedDomains.length}/${maxDomains}`}</Text>
        <View style={{ flex: 1.15, minHeight: 230 }}>
          {items.length === 0 ? (
            <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.regular, marginTop: 8 }}>No new domain cards available.</Text>
          ) : (
            <StraightCarousel ref={carRef} items={items} selectedIds={selectedDomains} onIndexChange={setCenterIdx} />
          )}
        </View>
        {items.length > 0 ? (
          <RuneButton label={centeredSelected ? 'Selected ✓ — tap to remove' : selectedDomains.length >= maxDomains && maxDomains === 1 ? 'Choose this card' : 'Choose this card'} kind={centeredSelected ? 'secondary' : 'primary'} dense height={40} onPress={toggleDomain} />
        ) : null}

        {/* controls below the carousel */}
        <ScrollView style={{ flex: 1, marginTop: 8 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 9, paddingBottom: 6 }} keyboardShouldPersistTaps="handled">
          {/* auto effects */}
          <ChamferBox chamfer={9} fill="rgba(20,24,31,0.55)" stroke="rgba(218,162,73,0.4)" strokeWidth={1.1} style={{ paddingVertical: 10, paddingHorizontal: 12 }}>
            <Text style={{ color: Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>Automatic</Text>
            {[`Level ${newLevel}`, '+1 to both damage thresholds', 'Gain a domain card', ...(tierStart ? ['New Experience (+2)', '+1 Proficiency', ...(newLevel === 5 || newLevel === 8 ? ['Clear trait marks'] : [])] : [])].map((line) => (
              <Text key={line} style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.regular }}>{`· ${line}`}</Text>
            ))}
          </ChamferBox>

          {/* tier experience — its own editor (#202/#203): long phrase, no description, +2 shown */}
          {tierStart ? (
            <>
              <Text style={{ color: Rune.bronze, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>New Experience (+2)</Text>
              <Pressable onPress={() => setEditingExp(true)} accessibilityRole="button" accessibilityLabel="Edit new experience">
                <ChamferBox chamfer={8} fill="rgba(20,24,31,0.6)" stroke={expTitle.trim() ? Rune.red : 'rgba(218,162,73,0.45)'} strokeWidth={1.2} style={{ minHeight: 44, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 12 }}>
                  <Text style={{ color: expTitle.trim() ? Rune.sheet : Rune.muted, fontSize: 13.5, fontFamily: expTitle.trim() ? Body.bold : Body.regular }}>{expTitle.trim() || 'Tap to write your experience…'}</Text>
                </ChamferBox>
              </Pressable>
            </>
          ) : null}

          {/* advancements — locked until the tier Experience is written (#211), so it can be boosted */}
          <Text style={{ color: Rune.bronze, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 2 }}>{`Choose 2 advancements · ${picks}/2`}</Text>
          {!expReady ? (
            <Text style={{ color: Rune.muted, fontSize: 11.5, fontFamily: Body.regular }}>Write your new Experience above first — then choose your advancements (you can boost the one you just made).</Text>
          ) : null}
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
                {opt.needs === 'domain' ? (
                  <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.regular }}>Pick a 2nd card on the carousel above.</Text>
                ) : null}
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
                    {expChoices.map((e) => {
                      const sel = (t.expIds ?? []).includes(e.id);
                      return <Chip key={e.id} label={e.title} on={sel} disabled={!sel && (t.expIds ?? []).length >= 2} onPress={() => toggleIn(i, 'expIds', e.id, 2)} />;
                    })}
                  </View>
                ) : null}
                {opt.needs === 'multiclass' ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {classOptions.map((c) => <Chip key={c.key} label={c.label} on={t.multiclass === c.key} onPress={() => setField(i, { multiclass: t.multiclass === c.key ? undefined : c.key })} />)}
                  </View>
                ) : null}
              </ChamferBox>
            );
          })}

          {expReady && remainingPicks > 0 ? (
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
        </ScrollView>

        {/* footer */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          <RuneButton label="Cancel" kind="ghost" height={44} style={{ flex: 1 }} onPress={onClose} />
          <RuneButton label="Confirm level" kind="primary" height={44} style={{ flex: 1.6 }} disabled={!canConfirm} onPress={confirm} />
        </View>
      </Animated.View>

      {editingExp ? (
        <CardEditor
          kindLabel="Experience"
          experienceMode
          modifier={2}
          initial={{ title: expTitle, text: '', imageUri: null, color: null, effects: [] }}
          saveLabel="Set experience"
          onSave={(d) => {
            setExpTitle(d.title);
            setEditingExp(false);
          }}
          onCancel={() => setEditingExp(false)}
        />
      ) : null}
    </View>
  );
}
