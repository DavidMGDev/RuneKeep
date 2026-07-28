/** Shared DM-Mode UI atoms (v0.15.0/v0.16.0): an animated tap-absorbing modal, a name-input dialog, and
 *  small chrome helpers. */
import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, FadeOutDown } from 'react-native-reanimated';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import Svg, { Line } from 'react-native-svg';

import { Body, Display, DmGap, DmRune, DmType, Rune } from '@/constants/theme';
import { DimScreen } from '@/lib/screen-dim';
import { useAndroidBack } from './use-android-back';

/**
 * A centered modal (v0.16.0, PRD #3/#16): the scrim closes on press, but an inner View ABSORBS taps inside
 * the panel so a near-miss never closes it. Content fades/springs in and fades out. v0.19.0: dropped the
 * `LinearTransition` size animation — it fought internal ScrollViews and cost FPS while scrolling (items
 * 1/2). The tap-absorb is a plain View with a start-responder (no Pressable) so a child ScrollView keeps
 * the move-responder and scrolls freely.
 */
export function DmModal({ onClose, children, contentStyle }: { onClose: () => void; children: ReactNode; contentStyle?: object }) {
  // Android hardware back closes the modal instead of popping the screen (item 3).
  useAndroidBack(() => { onClose(); return true; });
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 300, alignItems: 'center', justifyContent: 'center' }]}>
      <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)} style={StyleSheet.absoluteFill}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,8,13,0.86)' }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Dismiss" />
        <DimScreen opacity={0.86} />
      </Animated.View>
      {/* item 4: short, smooth, non-elastic — no spring bounce. */}
      <Animated.View entering={FadeInDown.duration(150).easing(Easing.out(Easing.cubic))} exiting={FadeOutDown.duration(120).easing(Easing.in(Easing.cubic))} style={contentStyle}>
        {/* absorb inside taps: claim the START responder so empty areas don't fall through to the scrim,
            but never the MOVE responder — a child ScrollView takes that and scrolls (items 1/2). */}
        <View onStartShouldSetResponder={() => true}>
          {children}
        </View>
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
        <Text style={{ color: p.title, fontSize: DmType.panel, fontFamily: Display.black, letterSpacing: 1.2, textTransform: 'uppercase' }}>{title}</Text>
        <ChamferBox chamfer={6} fill="rgba(20,24,30,0.9)" stroke={p.inner} strokeWidth={1.1} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, marginTop: 16 }}>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={p.muted}
            autoFocus
            maxLength={40}
            style={{ color: p.text, fontSize: DmType.title, fontFamily: Body.semibold, paddingVertical: 8 }}
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

/**
 * The DM empty-state poster (v0.22.0).
 *
 * Five of the six DM empty states were a single grey sentence floating in a void, while the parties
 * screen already had a real composition — the same one the roster uses, which the owner likes. This
 * extracts it so every DM screen teaches instead of shrugging: a tappable chamfered tile, a headline,
 * two lines of body, and one primary action.
 *
 * `PRODUCT.md` 5 asks for designed states everywhere; that was honoured on the player side and
 * abandoned on the DM side.
 */
export function DmEmpty({ glyph, title, body, actionLabel, onAction }: { glyph?: ReactNode; title: string; body: string; actionLabel?: string; onAction?: () => void }) {
  const tile = (
    <ChamferBox chamfer={18} fill="rgba(14,17,22,0.9)" stroke={DmRune.accent} strokeWidth={1.8} style={{ width: 150, height: 150, alignItems: 'center', justifyContent: 'center' }}>
      {glyph ?? (
        <Svg width={58} height={58} viewBox="0 0 64 64">
          <Line x1={32} y1={12} x2={32} y2={52} stroke={DmRune.accent} strokeWidth={4} />
          <Line x1={12} y1={32} x2={52} y2={32} stroke={DmRune.accent} strokeWidth={4} />
        </Svg>
      )}
    </ChamferBox>
  );
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: DmGap.section, paddingBottom: 50 }}>
      {onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" accessibilityLabel={actionLabel ?? title}>
          {tile}
        </Pressable>
      ) : (
        tile
      )}
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Text style={{ color: DmRune.ivory, fontSize: DmType.title, fontFamily: Display.black, letterSpacing: 1.5, textTransform: 'uppercase' }}>{title}</Text>
        <Text style={{ color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.medium, textAlign: 'center', lineHeight: 19, maxWidth: 260 }}>{body}</Text>
      </View>
      {actionLabel && onAction ? <RuneButton label={actionLabel} kind="primary" height={42} dm onPress={onAction} style={{ minWidth: 200 }} /> : null}
    </View>
  );
}
