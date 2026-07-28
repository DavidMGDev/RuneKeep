import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import PopupFrame from '../../assets/art/new/Pop-up.svg';
import PopupFrameDm from '../../assets/art/new/Pop-up-dm.svg';
import { RuneButton } from '@/components/rune-button';
import { scaled, useLayout } from '@/hooks/use-layout';
import { DmRune, Body, Display, Rune } from '@/constants/theme';

/**
 * The app's confirm dialog, seated in the owner's Pop-up frame (sharp corners by design).
 * Used sparingly (modal-as-last-resort): destructive confirms and import errors only.
 */
export function PopupDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive,
  dm,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  body?: string;
  confirmLabel: string;
  /** Override when "Cancel" understates what the other branch does (e.g. "Start fresh"). */
  cancelLabel?: string;
  destructive?: boolean;
  /** Desaturated frame + buttons for DM Mode. */
  dm?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const { scale } = useLayout();
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 200, alignItems: 'center', justifyContent: 'center' }]}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,8,13,0.82)' }]} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Dismiss" />
      {/* tap-absorb wrapper (#3): a near-miss inside the panel never falls through to the scrim */}
      <Pressable onPress={() => {}} style={{ width: scaled(320, scale), maxWidth: '92%', paddingVertical: scaled(30, scale), paddingHorizontal: scaled(26, scale) }}>
        {/* opaque interior fill (#11) inset inside the frame outline, so the pop-up isn't see-through */}
        <View style={[StyleSheet.absoluteFill, { top: 8, bottom: 8, left: 8, right: 8, backgroundColor: 'rgba(12,15,20,0.98)' }]} pointerEvents="none" />
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {dm ? <PopupFrameDm width="100%" height="100%" preserveAspectRatio="none" /> : <PopupFrame width="100%" height="100%" preserveAspectRatio="none" />}
        </View>
        <Text numberOfLines={2} style={{ color: dm ? DmRune.ivory : Rune.ivory, fontSize: scaled(19, scale), fontFamily: Display.black, letterSpacing: 1.4, textTransform: 'uppercase' }}>{title}</Text>
        {body ? <Text style={{ color: dm ? DmRune.muted : Rune.muted, fontSize: 13, fontFamily: Body.medium, lineHeight: 19, marginTop: 10 }}>{body}</Text> : null}
        {children}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>
          <RuneButton label={cancelLabel} kind="ghost" height={42} dm={dm} style={{ flex: 1 }} onPress={onCancel} />
          <RuneButton label={confirmLabel} kind={destructive ? 'primary' : 'secondary'} height={42} dm={dm} style={{ flex: 1 }} onPress={onConfirm} />
        </View>
      </Pressable>
    </View>
  );
}
