import { type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { Body, Display, Rune } from '@/constants/theme';

/**
 * The shared full-screen modal shell for the float-menu interfaces (#165+): Rest, Level Up, Settings.
 * A dim scrim (tap to close) + a centered chamfered ink panel with a title, an optional scrolling
 * body, and an optional footer. Top-level overlay (dp space), above the sheet + its border.
 */
export function OverlayShell({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 348,
  scroll = true,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  scroll?: boolean;
}) {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 9000 }}>
      <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,8,13,0.86)' }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <ChamferBox chamfer={16} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width, maxHeight: '86%', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={{ color: Rune.goldText, fontSize: 22, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</Text>
            {subtitle ? <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.medium, marginTop: 2 }}>{subtitle}</Text> : null}
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={{ padding: 4 }}>
            <Text style={{ color: Rune.muted, fontSize: 18, fontFamily: Body.bold }}>✕</Text>
          </Pressable>
        </View>
        {scroll ? (
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 2 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          <View style={{ gap: 10 }}>{children}</View>
        )}
        {footer ? <View style={{ marginTop: 14 }}>{footer}</View> : null}
      </ChamferBox>
    </View>
  );
}
