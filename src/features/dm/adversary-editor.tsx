/**
 * Adversary/NPC config (v0.15.0, PRD #31-32). Rename, choose which fields display, and set the maxima,
 * thresholds and description. Numeric fields are plain inputs (this is prep, not the fast in-play pulse).
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, DmRune } from '@/constants/theme';
import { type Combatant } from '@/lib/session';

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={{ color: DmRune.muted, fontSize: 9.5, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</Text>
      <ChamferBox chamfer={5} fill="rgba(20,24,30,0.9)" stroke={DmRune.line} strokeWidth={1.1} style={{ height: 40, justifyContent: 'center', paddingHorizontal: 10 }}>
        <TextInput value={String(value)} onChangeText={(t) => onChange(parseInt(t.replace(/[^0-9]/g, '') || '0', 10))} keyboardType="number-pad" maxLength={3} style={{ color: DmRune.text, fontSize: 16, fontFamily: Display.bold }} />
      </ChamferBox>
    </View>
  );
}

function Toggle({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 }}>
      <ChamferBox chamfer={4} fill={on ? DmRune.accent : 'transparent'} stroke={DmRune.accentDim} strokeWidth={1.2} style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
        {on ? <Svg width={11} height={11} viewBox="0 0 12 12"><Polyline points="2,6 5,9 10,3" fill="none" stroke={DmRune.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg> : null}
      </ChamferBox>
      <Text style={{ color: DmRune.text, fontSize: 12.5, fontFamily: Body.semibold, letterSpacing: 0.4 }}>{label}</Text>
    </Pressable>
  );
}

export function AdversaryEditor({ initial, onSave, onCancel }: { initial: Combatant; onSave: (c: Combatant) => void; onCancel: () => void }) {
  const [c, setC] = useState<Combatant>(initial);
  const set = (patch: Partial<Combatant>) => setC((prev) => ({ ...prev, ...patch }));
  const setShow = (k: keyof Combatant['show']) => setC((prev) => ({ ...prev, show: { ...prev.show, [k]: !prev.show[k] } }));

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 300, alignItems: 'center', justifyContent: 'center' }]}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,8,13,0.86)' }]} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Dismiss" />
      <ChamferBox chamfer={14} fill="rgba(12,15,20,0.99)" stroke={DmRune.lineStrong} strokeWidth={1.5} style={{ width: 336, maxHeight: '84%', padding: 20 }}>
        <Text style={{ color: DmRune.ivory, fontSize: 16, fontFamily: Display.black, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>Configure</Text>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
          <View style={{ gap: 4 }}>
            <Text style={{ color: DmRune.muted, fontSize: 9.5, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>Name</Text>
            <ChamferBox chamfer={5} fill="rgba(20,24,30,0.9)" stroke={DmRune.line} strokeWidth={1.1} style={{ height: 42, justifyContent: 'center', paddingHorizontal: 11 }}>
              <TextInput value={c.name} onChangeText={(name) => set({ name })} maxLength={40} style={{ color: DmRune.text, fontSize: 16, fontFamily: Body.semibold }} />
            </ChamferBox>
          </View>

          <View style={{ gap: 10 }}>
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
            <View style={{ gap: 4 }}>
              <Text style={{ color: DmRune.muted, fontSize: 9.5, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>Description</Text>
              <ChamferBox chamfer={5} fill="rgba(20,24,30,0.9)" stroke={DmRune.line} strokeWidth={1.1} style={{ minHeight: 70, paddingHorizontal: 11, paddingVertical: 8 }}>
                <TextInput value={c.description ?? ''} onChangeText={(description) => set({ description })} multiline maxLength={400} style={{ color: DmRune.text, fontSize: 14, fontFamily: Body.regular, textAlignVertical: 'top', minHeight: 54 }} />
              </ChamferBox>
            </View>
          ) : null}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <RuneButton label="Cancel" kind="ghost" height={44} dm style={{ flex: 1 }} onPress={onCancel} />
          <RuneButton label="Save" kind="secondary" height={44} dm style={{ flex: 1 }} onPress={() => onSave(c)} />
        </View>
      </ChamferBox>
    </View>
  );
}
