import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import PopupFrame from '../../assets/art/new/Pop-up.svg';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';

/**
 * The app's confirm dialog, seated in the owner's Pop-up frame (sharp corners by design).
 * Used sparingly (modal-as-last-resort): destructive confirms and import errors only.
 */
export function PopupDialog({
  title,
  body,
  confirmLabel,
  destructive,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  body?: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 200, alignItems: 'center', justifyContent: 'center' }]}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,8,13,0.82)' }]} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Dismiss" />
      {/* tap-absorb wrapper (#3): a near-miss inside the panel never falls through to the scrim */}
      <Pressable onPress={() => {}} style={{ width: 320, paddingVertical: 30, paddingHorizontal: 26 }}>
        {/* opaque interior fill (#11) inset inside the frame outline, so the pop-up isn't see-through */}
        <View style={[StyleSheet.absoluteFill, { top: 8, bottom: 8, left: 8, right: 8, backgroundColor: 'rgba(12,15,20,0.98)' }]} pointerEvents="none" />
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <PopupFrame width="100%" height="100%" preserveAspectRatio="none" />
        </View>
        <Text numberOfLines={2} style={{ color: Rune.ivory, fontSize: 19, fontFamily: Display.black, letterSpacing: 1.4, textTransform: 'uppercase' }}>{title}</Text>
        {body ? <Text style={{ color: Rune.muted, fontSize: 13, fontFamily: Body.medium, lineHeight: 19, marginTop: 10 }}>{body}</Text> : null}
        {children}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>
          <RuneButton label="Cancel" kind="ghost" height={42} style={{ flex: 1 }} onPress={onCancel} />
          <RuneButton label={confirmLabel} kind={destructive ? 'primary' : 'secondary'} height={42} style={{ flex: 1 }} onPress={onConfirm} />
        </View>
      </Pressable>
    </View>
  );
}
