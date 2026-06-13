import { useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { type CharacterFile, type ModTarget, modSum, proficiencyForLevel, type StatModifier } from '@/lib/character-file';

import { type Character, SAMPLE_CHARACTER, TRAIT_ORDER, type TraitKey } from '../character';
import { NumberKeypad } from './number-keypad';
import { OverlayShell } from './overlay-shell';

type Cat = 'identity' | 'vitals' | 'traits' | 'vault';
interface KpConfig {
  title: string;
  initial: number;
  min: number;
  max: number;
  allowNegative?: boolean;
  onConfirm: (v: number) => void;
}

export interface DomainCardInfo {
  id: string;
  title: string;
  thumb: { uri: string } | number;
  domain?: string;
  level?: number;
}

function CatIcon({ cat, active }: { cat: Cat; active: boolean }) {
  const c = active ? Rune.ivory : Rune.muted;
  const p = { stroke: c, strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      {cat === 'identity' && (
        <>
          <Circle cx={12} cy={8} r={3.5} {...p} />
          <Path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" {...p} />
        </>
      )}
      {cat === 'vitals' && <Path d="M12 20S4 14.5 4 9.2A4 4 0 0 1 12 7a4 4 0 0 1 8 2.2C20 14.5 12 20 12 20Z" {...p} />}
      {cat === 'traits' && <Polyline points="12,3 14.6,8.6 20.5,9.3 16,13.3 17.4,19 12,16 6.6,19 8,13.3 3.5,9.3 9.4,8.6" {...p} />}
      {cat === 'vault' && (
        <>
          <Rect x={4} y={6} width={16} height={13} rx={1.5} {...p} />
          <Line x1={4} y1={10} x2={20} y2={10} {...p} />
          <Rect x={10} y={11.5} width={4} height={3} rx={0.5} {...p} />
        </>
      )}
    </Svg>
  );
}

/** A label + value row that opens the keypad on tap (or stays grayed when locked). */
function FieldRow({ label, value, hint, onEdit, locked }: { label: string; value: string; hint?: string; onEdit?: () => void; locked?: boolean }) {
  return (
    <Pressable onPress={locked ? undefined : onEdit} disabled={locked} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} accessibilityState={{ disabled: locked }}>
      <ChamferBox chamfer={9} fill="rgba(20,24,31,0.6)" stroke={locked ? 'rgba(147,142,136,0.4)' : 'rgba(218,162,73,0.45)'} strokeWidth={1.2} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, paddingHorizontal: 13, opacity: locked ? 0.55 : 1 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: locked ? Rune.muted : Rune.sheet, fontSize: 13.5, fontFamily: Body.bold }}>{label}</Text>
          {hint ? <Text style={{ color: Rune.muted, fontSize: 10.5, fontFamily: Body.regular, marginTop: 1 }}>{hint}</Text> : null}
        </View>
        <Text style={{ color: locked ? Rune.muted : Rune.goldBright, fontSize: 20, fontFamily: Display.black, marginLeft: 10 }}>{value}</Text>
      </ChamferBox>
    </Pressable>
  );
}

/**
 * Settings (#166): edit all the character's data through one panel (everything except subclass and
 * ancestry). Category icons switch what you edit. Numbers use the keypad; traits/evasion carry a
 * reversible MODIFIER history (e.g. armor's −1 Evasion). Hope is fixed at 6 (shown grayed). The Vault
 * enables/disables up to 5 active domain cards. Persists to the file; live tracks update immediately.
 */
export function SettingsPanel({
  file,
  character,
  defaults,
  domainPool,
  onPatchFile,
  setCharacter,
  onClose,
}: {
  file: CharacterFile;
  character: Character;
  defaults: { evasion: number; maxHp: number; armorMax: number };
  domainPool: DomainCardInfo[];
  onPatchFile: (patch: Partial<CharacterFile>) => void;
  setCharacter: (updater: (c: Character) => Character) => void;
  onClose: () => void;
}) {
  const [cat, setCat] = useState<Cat>('identity');
  const [kp, setKp] = useState<KpConfig | null>(null);
  const [modTarget, setModTarget] = useState<ModTarget>('evasion');
  const [modDelta, setModDelta] = useState(-1);
  const [modLabel, setModLabel] = useState('');

  const mods = file.modifiers ?? [];
  const baseTraits = file.traits ?? SAMPLE_CHARACTER.traits;
  const stressMax = file.stressMax ?? 6;
  const armorMax = file.armorScoreMax ?? defaults.armorMax;
  const maxHp = file.maxHp ?? defaults.maxHp;
  const evasionBase = file.evasionBase ?? defaults.evasion;
  const activeDomains = file.activeDomainCardIds ?? domainPool.slice(0, 5).map((d) => d.id);

  const netTraits = (nextMods: StatModifier[]): Record<TraitKey, number> =>
    Object.fromEntries(TRAIT_ORDER.map((t) => [t.key, (baseTraits[t.key] ?? 0) + (file.traitBonuses?.[t.key] ?? 0) + modSum(nextMods, t.key)])) as Record<TraitKey, number>;

  // ---- edits ----
  const editLevel = (v: number) => {
    onPatchFile({ level: v });
    setCharacter((c) => ({ ...c, level: v, proficiency: proficiencyForLevel(v) + (file.proficiencyBonus ?? 0) }));
  };
  const editMaxHp = (v: number) => {
    onPatchFile({ maxHp: v });
    setCharacter((c) => ({ ...c, maxHp: v, hp: Math.min(c.hp, v) }));
  };
  const editStressMax = (v: number) => {
    onPatchFile({ stressMax: v });
    setCharacter((c) => ({ ...c, stress: { ...c.stress, locked: Math.max(0, 12 - v), active: Math.min(c.stress.active, v) } }));
  };
  const editArmorMax = (v: number) => {
    onPatchFile({ armorScoreMax: v });
    setCharacter((c) => ({ ...c, armorScore: v, armor: { ...c.armor, locked: Math.max(0, 12 - v), active: Math.min(c.armor.active, v) } }));
  };
  const editEvasionBase = (v: number) => {
    onPatchFile({ evasionBase: v });
    setCharacter((c) => ({ ...c, evasion: v + modSum(mods, 'evasion') }));
  };
  const editBaseTrait = (k: TraitKey, v: number) => {
    const nt = { ...baseTraits, [k]: v };
    onPatchFile({ traits: nt });
    setCharacter((c) => ({ ...c, traits: { ...c.traits, [k]: v + (file.traitBonuses?.[k] ?? 0) + modSum(mods, k) } }));
  };
  const recompute = (nextMods: StatModifier[]) => setCharacter((c) => ({ ...c, evasion: evasionBase + modSum(nextMods, 'evasion'), traits: netTraits(nextMods) }));
  const addModifier = () => {
    if (modDelta === 0) return;
    const label = modLabel.trim() || (modTarget === 'evasion' ? 'Evasion' : TRAIT_ORDER.find((t) => t.key === modTarget)?.label || 'Modifier');
    const next = [...mods, { id: `mod-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, target: modTarget, delta: modDelta, label }];
    onPatchFile({ modifiers: next });
    recompute(next);
    setModLabel('');
  };
  const removeModifier = (id: string) => {
    const next = mods.filter((m) => m.id !== id);
    onPatchFile({ modifiers: next });
    recompute(next);
  };
  const setName = (t: string) => {
    onPatchFile({ name: t });
    setCharacter((c) => ({ ...c, name: t }));
  };
  const toggleVault = (id: string) => {
    const has = activeDomains.includes(id);
    if (!has && activeDomains.length >= 5) return;
    onPatchFile({ activeDomainCardIds: has ? activeDomains.filter((x) => x !== id) : [...activeDomains, id] });
  };

  const open = (cfg: KpConfig) => setKp(cfg);
  const targetLabel = (t: ModTarget) => (t === 'evasion' ? 'Evasion' : TRAIT_ORDER.find((x) => x.key === t)?.label ?? t);
  const modTargets: ModTarget[] = ['evasion', ...TRAIT_ORDER.map((t) => t.key)];

  const catBar = (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {(['identity', 'vitals', 'traits', 'vault'] as Cat[]).map((c) => (
        <Pressable key={c} onPress={() => setCat(c)} accessibilityRole="button" accessibilityLabel={c} accessibilityState={{ selected: cat === c }} style={{ flex: 1 }}>
          <ChamferBox chamfer={8} fill={cat === c ? Rune.red : 'rgba(20,24,31,0.7)'} stroke={cat === c ? 'transparent' : 'rgba(218,162,73,0.4)'} strokeWidth={1.2} style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <CatIcon cat={c} active={cat === c} />
          </ChamferBox>
        </Pressable>
      ))}
    </View>
  );

  return (
    <>
      <OverlayShell title="Settings" subtitle="Edit your character — all but subclass & ancestry" onClose={onClose} footer={catBar} dismissOnScrim={false}>
        {cat === 'identity' && (
          <>
            <Text style={{ color: Rune.bronze, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>Name</Text>
            <ChamferBox chamfer={8} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ height: 46, justifyContent: 'center', paddingHorizontal: 13 }}>
              <TextInput value={file.name} onChangeText={setName} placeholder="Name" placeholderTextColor={Rune.muted} selectionColor={Rune.goldBright} maxLength={28} style={{ color: Rune.sheet, fontSize: 16, fontFamily: Body.semibold, padding: 0 }} accessibilityLabel="Character name" />
            </ChamferBox>
            <FieldRow label="Level" value={String(file.level)} hint={`Proficiency ${proficiencyForLevel(file.level) + (file.proficiencyBonus ?? 0)}`} onEdit={() => open({ title: 'Level', initial: file.level, min: 1, max: 10, onConfirm: editLevel })} />
          </>
        )}

        {cat === 'vitals' && (
          <>
            <FieldRow label="Max Hit Points" value={String(maxHp)} onEdit={() => open({ title: 'Max HP', initial: maxHp, min: 1, max: 12, onConfirm: editMaxHp })} />
            <FieldRow label="Max Stress" value={String(stressMax)} onEdit={() => open({ title: 'Max Stress', initial: stressMax, min: 1, max: 12, onConfirm: editStressMax })} />
            <FieldRow label="Max Armor" value={String(armorMax)} hint="Total armor slots" onEdit={() => open({ title: 'Max Armor', initial: armorMax, min: 0, max: 12, onConfirm: editArmorMax })} />
            <FieldRow label="Hope" value="6" hint="Hope is always 6 — adjust it by holding the track on the sheet" locked />
          </>
        )}

        {cat === 'traits' && (
          <>
            <FieldRow label="Evasion" value={String(character.evasion)} hint={`Base ${evasionBase}${character.evasion !== evasionBase ? ' + modifiers' : ''}`} onEdit={() => open({ title: 'Evasion (base)', initial: evasionBase, min: 0, max: 30, onConfirm: editEvasionBase })} />
            {TRAIT_ORDER.map((t) => {
              const base = baseTraits[t.key] ?? 0;
              const net = base + (file.traitBonuses?.[t.key] ?? 0) + modSum(mods, t.key);
              return <FieldRow key={t.key} label={t.label} value={net >= 0 ? `+${net}` : `${net}`} hint={`Base ${base >= 0 ? `+${base}` : base}`} onEdit={() => open({ title: t.label, initial: base, min: -5, max: 10, allowNegative: true, onConfirm: (v) => editBaseTrait(t.key, v) })} />;
            })}

            {/* modifier history */}
            <Text style={{ color: Rune.bronze, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 6 }}>Modifiers</Text>
            {mods.length === 0 ? <Text style={{ color: Rune.muted, fontSize: 11.5, fontFamily: Body.regular }}>None. Add one for a temporary effect (e.g. armor’s −1 Evasion).</Text> : null}
            {mods.map((m) => (
              <ChamferBox key={m.id} chamfer={7} fill="rgba(20,24,31,0.6)" stroke="rgba(218,162,73,0.4)" strokeWidth={1} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 11 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: Rune.sheet, fontSize: 13, fontFamily: Body.bold }}>{m.label}</Text>
                  <Text style={{ color: Rune.muted, fontSize: 10.5, fontFamily: Body.regular }}>{`${targetLabel(m.target)} ${m.delta >= 0 ? `+${m.delta}` : m.delta}`}</Text>
                </View>
                <Pressable onPress={() => removeModifier(m.id)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${m.label}`} style={{ padding: 4 }}>
                  <Text style={{ color: '#E2705A', fontSize: 16, fontFamily: Body.bold }}>✕</Text>
                </Pressable>
              </ChamferBox>
            ))}

            {/* add-modifier form */}
            <View style={{ gap: 7, marginTop: 2 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {modTargets.map((t) => (
                  <Pressable key={t} onPress={() => setModTarget(t)} accessibilityRole="button" accessibilityLabel={targetLabel(t)} accessibilityState={{ selected: modTarget === t }}>
                    <ChamferBox chamfer={6} fill={modTarget === t ? Rune.red : 'rgba(20,24,31,0.7)'} stroke={modTarget === t ? 'transparent' : 'rgba(218,162,73,0.4)'} strokeWidth={1} style={{ paddingHorizontal: 9, paddingVertical: 5 }}>
                      <Text style={{ color: modTarget === t ? Rune.ivory : Rune.muted, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 0.4, textTransform: 'uppercase' }}>{targetLabel(t)}</Text>
                    </ChamferBox>
                  </Pressable>
                ))}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable onPress={() => setModDelta((d) => Math.max(-5, d - 1))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Decrease modifier">
                  <ChamferBox chamfer={6} fill="rgba(20,24,31,0.7)" stroke="rgba(218,162,73,0.4)" strokeWidth={1} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: Rune.sheet, fontSize: 20, fontFamily: Display.bold }}>−</Text>
                  </ChamferBox>
                </Pressable>
                <Text style={{ color: Rune.goldBright, fontSize: 20, fontFamily: Display.black, width: 46, textAlign: 'center' }}>{modDelta >= 0 ? `+${modDelta}` : modDelta}</Text>
                <Pressable onPress={() => setModDelta((d) => Math.min(5, d + 1))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Increase modifier">
                  <ChamferBox chamfer={6} fill="rgba(20,24,31,0.7)" stroke="rgba(218,162,73,0.4)" strokeWidth={1} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: Rune.sheet, fontSize: 20, fontFamily: Display.bold }}>+</Text>
                  </ChamferBox>
                </Pressable>
                <ChamferBox chamfer={7} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.1} style={{ flex: 1, height: 38, justifyContent: 'center', paddingHorizontal: 11 }}>
                  <TextInput value={modLabel} onChangeText={setModLabel} placeholder="Label (optional)" placeholderTextColor={Rune.muted} selectionColor={Rune.goldBright} maxLength={22} style={{ color: Rune.sheet, fontSize: 12.5, fontFamily: Body.regular, padding: 0 }} accessibilityLabel="Modifier label" />
                </ChamferBox>
              </View>
              <RuneButton label="Add modifier" kind="secondary" dense height={38} onPress={addModifier} />
            </View>
          </>
        )}

        {cat === 'vault' && (
          <>
            <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.medium }}>{`Active ${activeDomains.length}/5 · the rest stay in the vault`}</Text>
            {domainPool.length === 0 ? <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.regular }}>No domain cards.</Text> : null}
            {domainPool.map((d) => {
              const on = activeDomains.includes(d.id);
              const full = !on && activeDomains.length >= 5;
              return (
                <Pressable key={d.id} onPress={() => toggleVault(d.id)} disabled={full} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: full }} accessibilityLabel={d.title}>
                  <ChamferBox chamfer={8} fill={on ? 'rgba(200,27,24,0.16)' : 'rgba(20,24,31,0.6)'} stroke={on ? Rune.red : 'rgba(218,162,73,0.4)'} strokeWidth={1.2} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, opacity: full ? 0.45 : 1 }}>
                    <Image source={d.thumb} style={{ width: 30, height: 42, borderRadius: 2, backgroundColor: '#000' }} contentFit="cover" />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text numberOfLines={1} style={{ color: Rune.sheet, fontSize: 13, fontFamily: Body.bold }}>{d.title}</Text>
                      {d.domain || d.level != null ? <Text style={{ color: Rune.muted, fontSize: 10.5, fontFamily: Body.regular }}>{[d.domain, d.level != null ? `Lvl ${d.level}` : null].filter(Boolean).join(' · ')}</Text> : null}
                    </View>
                    <View style={{ width: 22, height: 22, borderRadius: 3, borderWidth: 1.6, borderColor: on ? Rune.red : Rune.muted, backgroundColor: on ? Rune.red : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {on ? <Text style={{ color: Rune.ivory, fontSize: 13, fontFamily: Body.bold }}>✓</Text> : null}
                    </View>
                  </ChamferBox>
                </Pressable>
              );
            })}
          </>
        )}
      </OverlayShell>
      {kp ? <NumberKeypad title={kp.title} initial={kp.initial} min={kp.min} max={kp.max} allowNegative={kp.allowNegative} onConfirm={kp.onConfirm} onClose={() => setKp(null)} /> : null}
    </>
  );
}
