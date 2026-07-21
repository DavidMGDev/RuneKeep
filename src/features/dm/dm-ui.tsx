/** Shared DM-Mode UI atoms (v0.15.0): a desaturated name-input dialog and small chrome helpers. */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, DmRune, Rune } from '@/constants/theme';

/** A modal single-line text prompt (name a party / session / folder / adversary). DM-desaturated by
 *  default; pass `dm={false}` for the gold roster variant. */
export function NameDialog({ title, initial = '', placeholder, confirmLabel = 'Save', dm = true, onConfirm, onCancel }: { title: string; initial?: string; placeholder?: string; confirmLabel?: string; dm?: boolean; onConfirm: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  const p = dm
    ? { line: DmRune.lineStrong, inner: DmRune.line, title: DmRune.ivory, text: DmRune.text, muted: DmRune.muted }
    : { line: 'rgba(218,162,73,0.6)', inner: 'rgba(218,162,73,0.45)', title: Rune.ivory, text: Rune.sheet, muted: Rune.muted };
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 300, alignItems: 'center', justifyContent: 'center' }]}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,8,13,0.82)' }]} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Dismiss" />
      <ChamferBox chamfer={14} fill="rgba(12,15,20,0.98)" stroke={p.line} strokeWidth={1.5} style={{ width: 312, padding: 22 }}>
        <Text style={{ color: p.title, fontSize: 17, fontFamily: Display.black, letterSpacing: 1.2, textTransform: 'uppercase' }}>{title}</Text>
        <ChamferBox chamfer={6} fill="rgba(20,24,30,0.9)" stroke={p.inner} strokeWidth={1.1} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, marginTop: 16 }}>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={p.muted}
            autoFocus
            maxLength={40}
            style={{ color: p.text, fontSize: 16, fontFamily: Body.semibold, paddingVertical: 8 }}
            onSubmitEditing={() => value.trim() && onConfirm(value.trim())}
          />
        </ChamferBox>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
          <RuneButton label="Cancel" kind="ghost" height={42} dm={dm} style={{ flex: 1 }} onPress={onCancel} />
          <RuneButton label={confirmLabel} kind="secondary" height={42} dm={dm} disabled={!value.trim()} style={{ flex: 1 }} onPress={() => onConfirm(value.trim())} />
        </View>
      </ChamferBox>
    </View>
  );
}

/** A small coloured diamond identity chip (party/folder colour). */
export function ColorDiamond({ color, size = 10 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, backgroundColor: color, transform: [{ rotate: '45deg' }] }} />;
}
