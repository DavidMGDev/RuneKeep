/**
 * A desktop dialog over everything (v0.50.0, owner: moving a card and its modifiers were a sidebar, "it should blur
 * the entire screen and give me the options with bigger controls"). The port, the table and any panel beside them go
 * dim and soft behind it. Escape and a click on the dim ask `onClose`, which may refuse while work is unsaved.
 */
import { type ReactNode, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ChamferBox } from '@/components/chamfer-box';
import { DesktopPortal } from '@/components/desktop-portal';
import { Body, Display, Rune } from '@/constants/theme';
import { useDesktop } from '@/hooks/use-desktop';
import { useDialogKeys } from '@/hooks/use-dialog-keys';
import { playSfx } from '@/lib/sfx';

const MARGIN = 28;
const VEIL = { backgroundColor: 'rgba(6,8,13,0.7)', backdropFilter: 'blur(9px)', WebkitBackdropFilter: 'blur(9px)', cursor: 'default' } as object;

interface DeskDialogProps {
  title: string;
  subtitle?: string;
  width: number;
  /** Left out, it is as tall as what is in it. */
  height?: number;
  /** The button that should have the focus when it opens. */
  initialLabel?: string;
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

export function DeskDialog(p: DeskDialogProps) {
  return (
    <DesktopPortal to="modal" priority="dialog" onDismiss={p.onClose}>
      <DeskDialogBody {...p} />
    </DesktopPortal>
  );
}

function DeskDialogBody({ title, subtitle, width, height, initialLabel, footer, onClose, children }: DeskDialogProps) {
  const win = useWindowDimensions();
  const root = useRef<View>(null);
  // Beside a table Escape is the layer's and this is for the focus. A page has no layers, so there it is both.
  const layered = !!useDesktop();
  useDialogKeys(root, { enabled: true, initialLabel, onEscape: layered ? undefined : onClose });
  useEffect(() => { playSfx('panelOpen', { volume: 0.6 }); }, []);
  const h = height === undefined ? undefined : Math.min(height, win.height - MARGIN * 2);
  return (
    <Animated.View entering={FadeIn.duration(150)} style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      <Pressable onPress={onClose} tabIndex={-1} accessibilityLabel="Dismiss" style={[StyleSheet.absoluteFill, VEIL]} />
      <View ref={root} role="dialog" aria-label={title}>
        <ChamferBox chamfer={18} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6}
          style={{ width: Math.min(width, win.width - MARGIN * 2), height: h, maxHeight: win.height - MARGIN * 2, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, minHeight: 78, paddingHorizontal: 28, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(218,162,73,0.3)' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={1} style={{ color: Rune.ivory, fontSize: 26, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.6 }}>{title}</Text>
              {subtitle ? <Text numberOfLines={1} style={{ color: Rune.muted, fontSize: 13.5, fontFamily: Body.medium }}>{subtitle}</Text> : null}
            </View>
            <Pressable onPress={() => { playSfx('panelClose', { volume: 0.6 }); onClose(); }} accessibilityRole="button" accessibilityLabel="Close">
              {({ hovered }: { hovered?: boolean }) => (
                <ChamferBox chamfer={7} fill={hovered ? 'rgba(224,181,99,0.12)' : 'transparent'} stroke={hovered ? Rune.goldBright : Rune.goldEdge} strokeWidth={1.2} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: Rune.goldText, fontSize: 17, fontFamily: Body.bold }}>✕</Text>
                </ChamferBox>
              )}
            </Pressable>
          </View>
          <View style={{ flexShrink: 1, flexGrow: h === undefined ? 0 : 1, minHeight: 0 }}>{children}</View>
          {footer ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 28, paddingVertical: 14, borderTopWidth: 1, borderTopColor: 'rgba(218,162,73,0.3)' }}>{footer}</View> : null}
        </ChamferBox>
      </View>
    </Animated.View>
  );
}
