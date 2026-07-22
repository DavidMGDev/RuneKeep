/** Shared DM-Mode UI atoms (v0.15.0/v0.16.0): an animated tap-absorbing modal, a name-input dialog, and
 *  small chrome helpers. */
import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown, LinearTransition } from 'react-native-reanimated';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, DmRune, Rune } from '@/constants/theme';

/**
 * A centered modal (v0.16.0, PRD #3/#16): the scrim closes on press, but an inner Pressable ABSORBS taps
 * inside the panel so a near-miss never closes it. Content fades/springs in, animates its size with
 * `LinearTransition`, and fades out. Reused by every DM dialog + panel.
 */
export function DmModal({ onClose, children, contentStyle }: { onClose: () => void; children: ReactNode; contentStyle?: object }) {
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 300, alignItems: 'center', justifyContent: 'center' }]}>
      <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)} style={StyleSheet.absoluteFill}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,8,13,0.86)' }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Dismiss" />
      </Animated.View>
      <Animated.View entering={FadeInDown.springify().damping(20).stiffness(180)} exiting={FadeOutDown.duration(140)} layout={LinearTransition.springify().damping(22)} style={contentStyle}>
        {/* absorb inside taps — only the scrim (or a real button) acts */}
        <Pressable onPress={() => {}} accessibilityElementsHidden>
          {children}
        </Pressable>
      </Animated.View>
    </View>
  );
}

/** A modal single-line text prompt (name a party / session / folder / adversary). DM-desaturated by
 *  default; pass `dm={false}` for the gold roster variant. */
export function NameDialog({ title, initial = '', placeholder, confirmLabel = 'Save', dm = true, onConfirm, onCancel }: { title: string; initial?: string; placeholder?: string; confirmLabel?: string; dm?: boolean; onConfirm: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  const p = dm
    ? { line: DmRune.lineStrong, inner: DmRune.line, title: DmRune.ivory, text: DmRune.text, muted: DmRune.muted }
    : { line: 'rgba(218,162,73,0.6)', inner: 'rgba(218,162,73,0.45)', title: Rune.ivory, text: Rune.sheet, muted: Rune.muted };
  return (
    <DmModal onClose={onCancel}>
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
    </DmModal>
  );
}

/** A small coloured diamond identity chip (party/folder colour). */
export function ColorDiamond({ color, size = 10 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, backgroundColor: color, transform: [{ rotate: '45deg' }] }} />;
}
