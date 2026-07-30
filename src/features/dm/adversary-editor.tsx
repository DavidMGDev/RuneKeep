/**
 * Adversary/NPC config (v0.15.0; expanded v0.17.0, items 8/10). Beyond the original name / show-toggles /
 * maxima, every Base-Game stat-block field is now editable so a custom adversary can hold everything a base
 * one does: a portrait image, tier + type, difficulty, standard attack, motives, experience, and a full
 * list of features (passive/action/reaction). Plain inputs — this is prep, not the fast in-play pulse.
 */
import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { ownImage } from '@/lib/owned-image';
import Svg, { Line, Polyline } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { DmType, Body, Display, DmRune } from '@/constants/theme';
import { ADVERSARY_ROLES, type AdversaryFeature, type AdversaryRole, type FeatureKind } from '@/data/adversaries';
import { type Combatant } from '@/lib/session';
import { AdversaryPortrait } from './adversary-detail';
import { DmModal } from './dm-ui';

const FIELD_LABEL = { color: DmRune.muted, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' as const };
const INPUT_FILL = 'rgba(20,24,30,0.9)';
const KINDS: FeatureKind[] = ['Passive', 'Action', 'Reaction'];

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={label} hitSlop={4}>
      <ChamferBox chamfer={5} fill={on ? DmRune.accent : 'transparent'} stroke={on ? 'transparent' : DmRune.line} strokeWidth={1.1} style={{ height: 28, justifyContent: 'center', paddingHorizontal: 10 }}>
        <Text style={{ color: on ? DmRune.ink : DmRune.text, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</Text>
      </ChamferBox>
    </Pressable>
  );
}

function TextField({ label, value, onChange, multiline, placeholder, keyboardType, maxLength }: { label: string; value: string; onChange: (t: string) => void; multiline?: boolean; placeholder?: string; keyboardType?: 'default' | 'number-pad'; maxLength?: number }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={FIELD_LABEL}>{label}</Text>
      <ChamferBox chamfer={5} fill={INPUT_FILL} stroke={DmRune.line} strokeWidth={1.1} style={{ minHeight: multiline ? 60 : 42, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: multiline ? 8 : 0 }}>
        <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={DmRune.muted} multiline={multiline} keyboardType={keyboardType} maxLength={maxLength} style={{ color: DmRune.text, fontSize: multiline ? 13.5 : 15, fontFamily: multiline ? Body.regular : Body.semibold, textAlignVertical: multiline ? 'top' : 'center', paddingVertical: multiline ? 0 : 6, lineHeight: multiline ? 19 : 20, minHeight: multiline ? 44 : undefined }} />
      </ChamferBox>
    </View>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return <TextField label={label} value={String(value)} onChange={(t) => onChange(parseInt(t.replace(/[^0-9]/g, '') || '0', 10))} keyboardType="number-pad" maxLength={3} />;
}

function Toggle({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 }}>
      <ChamferBox chamfer={4} fill={on ? DmRune.accent : 'transparent'} stroke={DmRune.accentDim} strokeWidth={1.2} style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
        {on ? <Svg width={11} height={11} viewBox="0 0 12 12"><Polyline points="2,6 5,9 10,3" fill="none" stroke={DmRune.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg> : null}
      </ChamferBox>
      <Text style={{ color: DmRune.text, fontSize: DmType.body, fontFamily: Body.semibold, letterSpacing: 0.4 }}>{label}</Text>
    </Pressable>
  );
}

function FeatureEditor({ f, onChange, onRemove }: { f: AdversaryFeature; onChange: (f: AdversaryFeature) => void; onRemove: () => void }) {
  return (
    <ChamferBox chamfer={8} fill="rgba(16,20,26,0.8)" stroke={DmRune.line} strokeWidth={1.1} style={{ padding: 10, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ChamferBox chamfer={5} fill={INPUT_FILL} stroke={DmRune.line} strokeWidth={1.1} style={{ flex: 1, minHeight: 42, justifyContent: 'center', paddingHorizontal: 9 }}>
          <TextInput value={f.name} onChangeText={(name) => onChange({ ...f, name })} placeholder="Feature name" placeholderTextColor={DmRune.muted} maxLength={50} style={{ color: DmRune.ivory, fontSize: DmType.body, fontFamily: Body.bold, paddingVertical: 6, lineHeight: 18, textAlignVertical: 'center' }} />
        </ChamferBox>
        <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove feature">
          <Svg width={14} height={14} viewBox="0 0 16 16"><Line x1={3} y1={3} x2={13} y2={13} stroke={DmRune.red} strokeWidth={2} /><Line x1={13} y1={3} x2={3} y2={13} stroke={DmRune.red} strokeWidth={2} /></Svg>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {KINDS.map((k) => <Chip key={k} label={k} on={f.kind === k} onPress={() => onChange({ ...f, kind: k })} />)}
      </View>
      <ChamferBox chamfer={5} fill={INPUT_FILL} stroke={DmRune.line} strokeWidth={1.1} style={{ minHeight: 52, paddingHorizontal: 9, paddingVertical: 7 }}>
        <TextInput value={f.text} onChangeText={(text) => onChange({ ...f, text })} placeholder="What it does…" placeholderTextColor={DmRune.muted} multiline maxLength={600} style={{ color: DmRune.text, fontSize: DmType.body, fontFamily: Body.regular, textAlignVertical: 'top', minHeight: 38 }} />
      </ChamferBox>
    </ChamferBox>
  );
}

export function AdversaryEditor({ initial, onSave, onCancel }: { initial: Combatant; onSave: (c: Combatant) => void; onCancel: () => void }) {
  const [c, setC] = useState<Combatant>(initial);
  const set = (patch: Partial<Combatant>) => setC((prev) => ({ ...prev, ...patch }));
  const setShow = (k: keyof Combatant['show']) => setC((prev) => ({ ...prev, show: { ...prev.show, [k]: !prev.show[k] } }));

  const pickImage = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    // v0.26.0: own the file, or an update clears the cache it came from (see lib/owned-image).
    if (!res.canceled && res.assets[0]) set({ portraitUri: (await ownImage(res.assets[0].uri)) ?? undefined });
  }, []);

  const features = c.features ?? [];
  const setFeature = (i: number, nf: AdversaryFeature) => set({ features: features.map((x, j) => (j === i ? nf : x)) });
  const addFeature = () => set({ features: [...features, { name: '', kind: 'Passive', text: '' }] });
  const removeFeature = (i: number) => set({ features: features.filter((_, j) => j !== i) });

  return (
    <DmModal onClose={onCancel}>
      <ChamferBox chamfer={14} fill="rgba(12,15,20,0.99)" stroke={DmRune.lineStrong} strokeWidth={1.5} style={{ width: 340, maxHeight: 660, padding: 18 }}>
        <Text style={{ color: DmRune.ivory, fontSize: DmType.title, fontFamily: Display.black, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Configure</Text>
        <ScrollView style={{ maxHeight: 500 }} showsVerticalScrollIndicator nestedScrollEnabled keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 13, paddingBottom: 4 }}>
          {/* portrait + name */}
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Pressable onPress={pickImage} accessibilityRole="button" accessibilityLabel="Choose image">
              {c.portraitUri ? (
                <ChamferBox chamfer={7} fill={DmRune.ink} stroke={DmRune.line} strokeWidth={1.3} style={{ width: 56, height: 56, overflow: 'hidden' }}><Image source={{ uri: c.portraitUri }} style={{ width: 56, height: 56 }} resizeMode="cover" /></ChamferBox>
              ) : (
                <AdversaryPortrait size={56} tint={DmRune.line} />
              )}
            </Pressable>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={FIELD_LABEL}>Name</Text>
              <ChamferBox chamfer={5} fill={INPUT_FILL} stroke={DmRune.line} strokeWidth={1.1} style={{ height: 42, justifyContent: 'center', paddingHorizontal: 11 }}>
                <TextInput value={c.name} onChangeText={(name) => set({ name })} maxLength={40} style={{ color: DmRune.text, fontSize: DmType.title, fontFamily: Body.semibold }} />
              </ChamferBox>
              {c.portraitUri ? <Pressable onPress={() => set({ portraitUri: undefined })} hitSlop={6}><Text style={{ color: DmRune.muted, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>Remove image</Text></Pressable> : null}
            </View>
          </View>

          {/* type + tier */}
          <View style={{ gap: 6 }}>
            <Text style={FIELD_LABEL}>Type</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {ADVERSARY_ROLES.map((r) => <Chip key={r} label={r} on={c.role === r} onPress={() => set({ role: c.role === r ? undefined : (r as AdversaryRole) })} />)}
            </View>
          </View>
          <View style={{ gap: 6 }}>
            <Text style={FIELD_LABEL}>Tier</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {([1, 2, 3, 4] as const).map((t) => <Chip key={t} label={`Tier ${t}`} on={c.tier === t} onPress={() => set({ tier: c.tier === t ? undefined : t })} />)}
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <NumField label="Difficulty" value={c.difficulty ?? 0} onChange={(difficulty) => set({ difficulty })} />
            <TextField label="Attack mod" value={c.atkMod ?? ''} onChange={(atkMod) => set({ atkMod })} placeholder="+2" maxLength={4} />
          </View>

          {/* standard attack */}
          <View style={{ gap: 6 }}>
            <Text style={FIELD_LABEL}>Standard attack</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextField label="Name" value={c.attack?.name ?? ''} onChange={(name) => set({ attack: { name, range: c.attack?.range ?? '', damage: c.attack?.damage ?? '' } })} placeholder="Longsword" maxLength={30} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextField label="Range" value={c.attack?.range ?? ''} onChange={(range) => set({ attack: { name: c.attack?.name ?? '', range, damage: c.attack?.damage ?? '' } })} placeholder="Melee" maxLength={16} />
              <TextField label="Damage" value={c.attack?.damage ?? ''} onChange={(damage) => set({ attack: { name: c.attack?.name ?? '', range: c.attack?.range ?? '', damage } })} placeholder="1d8+2 phy" maxLength={20} />
            </View>
          </View>

          <TextField label="Motives & Tactics" value={c.motives ?? ''} onChange={(motives) => set({ motives })} placeholder="Ambush, flee, protect…" maxLength={120} />
          <TextField label="Experience" value={c.experience ?? ''} onChange={(experience) => set({ experience })} placeholder="Tracker +2" maxLength={60} />

          {/* shown tracks */}
          <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: DmRune.line, paddingTop: 12 }}>
            <Text style={FIELD_LABEL}>Show in the encounter row</Text>
            <View style={{ flexDirection: 'row' }}>
              <Toggle label="HP" on={c.show.hp} onPress={() => setShow('hp')} />
              <Toggle label="Stress" on={c.show.stress} onPress={() => setShow('stress')} />
            </View>
            <View style={{ flexDirection: 'row' }}>
              <Toggle label="Thresholds" on={c.show.thresholds} onPress={() => setShow('thresholds')} />
              <Toggle label="Description" on={c.show.description} onPress={() => setShow('description')} />
            </View>
          </View>

          {c.show.hp ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <NumField label="Current HP" value={c.hp ?? 0} onChange={(hp) => set({ hp: Math.min(hp, c.maxHp ?? hp) })} />
              <NumField label="Max HP" value={c.maxHp ?? 0} onChange={(maxHp) => set({ maxHp })} />
            </View>
          ) : null}
          {c.show.stress ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <NumField label="Current Stress" value={c.stress ?? 0} onChange={(stress) => set({ stress: Math.min(stress, c.maxStress ?? stress) })} />
              <NumField label="Max Stress" value={c.maxStress ?? 0} onChange={(maxStress) => set({ maxStress })} />
            </View>
          ) : null}
          {c.show.thresholds ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <NumField label="Major" value={c.thresholds?.major ?? 0} onChange={(major) => set({ thresholds: { major, severe: c.thresholds?.severe ?? 0 } })} />
              <NumField label="Severe" value={c.thresholds?.severe ?? 0} onChange={(severe) => set({ thresholds: { major: c.thresholds?.major ?? 0, severe } })} />
            </View>
          ) : null}
          {c.show.description ? (
            <TextField label="Description" value={c.description ?? ''} onChange={(description) => set({ description })} multiline maxLength={400} />
          ) : null}

          {/* features */}
          <View style={{ gap: 9, borderTopWidth: 1, borderTopColor: DmRune.line, paddingTop: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={FIELD_LABEL}>Features</Text>
              <Pressable onPress={addFeature} hitSlop={8} accessibilityRole="button" accessibilityLabel="Add feature"><Text style={{ color: DmRune.accent, fontSize: DmType.body, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>+ Add</Text></Pressable>
            </View>
            {features.map((f, i) => <FeatureEditor key={i} f={f} onChange={(nf) => setFeature(i, nf)} onRemove={() => removeFeature(i)} />)}
          </View>
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <RuneButton label="Cancel" kind="ghost" height={44} dm style={{ flex: 1 }} onPress={onCancel} />
          <RuneButton label="Save" kind="secondary" height={44} dm style={{ flex: 1 }} onPress={() => onSave({ ...c, features: features.filter((f) => f.name.trim() || f.text.trim()) })} />
        </View>
      </ChamferBox>
    </DmModal>
  );
}
