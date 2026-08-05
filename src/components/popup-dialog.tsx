import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { scaled, useLayout } from '@/hooks/use-layout';
import { DmRune, Body, Display, Rune } from '@/constants/theme';
import { DimScreen } from '@/lib/screen-dim';

/**
 * The app's confirm dialog. Used sparingly (modal-as-last-resort): destructive confirms and import
 * errors only.
 *
 * v0.27.2: the frame is DRAWN, not stretched.
 *
 * It used to be a single piece of artwork stretched over the panel with `preserveAspectRatio="none"`,
 * with the interior fill as a separate plain View inset a flat 8 dp on every side. Those two have no
 * geometric relationship to each other: the artwork's inner edge sits at a FRACTION of the box (about
 * 1.2% on each side), so on a 320-wide dialog the gold rail landed near 4 dp while the fill started at
 * 8 dp, leaving a transparent moat around the inside of the border that showed the screen behind it.
 * Because the top and bottom fractions multiply by a content-driven height, the gap was a different
 * size on every dialog, and the fill's square corners cut across the frame's chamfers.
 *
 * The stretch made it worse on its own: forcing a near-square asset into a wide box makes the rail
 * thicker on the top and bottom than on the sides, by an amount that depends on how much text the
 * dialog happens to hold.
 *
 * `ChamferBox` draws the outline and the fill as ONE polygon from the measured box, which is the same
 * thing the app's buttons do. They cannot drift apart because they are the same shape.
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
      <DimScreen opacity={0.82} />
      {/* tap-absorb wrapper (#3): a near-miss inside the panel never falls through to the scrim */}
      <Pressable onPress={() => {}} style={{ width: scaled(320, scale), maxWidth: '92%' }}>
        <ChamferBox
          chamfer={14}
          fill={dm ? 'rgba(16,17,19,0.985)' : 'rgba(12,15,20,0.985)'}
          stroke={dm ? DmRune.line : Rune.goldEdge}
          strokeWidth={1.8}
          style={{ paddingVertical: scaled(30, scale), paddingHorizontal: scaled(26, scale) }}>
        <Text numberOfLines={2} style={{ color: dm ? DmRune.ivory : Rune.ivory, fontSize: scaled(19, scale), fontFamily: Display.black, letterSpacing: 1.4, textTransform: 'uppercase' }}>{title}</Text>
        {body ? <Text style={{ color: dm ? DmRune.muted : Rune.muted, fontSize: 13, fontFamily: Body.medium, lineHeight: 19, marginTop: 10 }}>{body}</Text> : null}
        {children}
        {/* v0.35.1 (owner): a dialog whose two buttons say the SAME thing shows ONE. Some dialogs put
            their real choices in `children` and use this row only to get out (the encounter restart
            offered "Cancel" twice, side by side, which reads as a bug because it is one). */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>
          <RuneButton label={cancelLabel} kind={cancelLabel === confirmLabel ? 'secondary' : 'ghost'} height={42} dm={dm} style={{ flex: 1 }} onPress={onCancel} />
          {cancelLabel === confirmLabel ? null : (
            <RuneButton label={confirmLabel} kind={destructive ? 'primary' : 'secondary'} height={42} dm={dm} style={{ flex: 1 }} onPress={onConfirm} />
          )}
        </View>
        </ChamferBox>
      </Pressable>
    </View>
  );
}
