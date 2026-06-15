import { type ReactNode, useEffect } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { ChamferBox } from '@/components/chamfer-box';
import { Body, Display, Rune } from '@/constants/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
  dismissOnScrim = true,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  scroll?: boolean;
  /** When false, tapping the dim does NOT close — the user must press the ✕ (#168, owner). */
  dismissOnScrim?: boolean;
}) {
  // The body ScrollView is capped to a real pixel height (#233): a flex-shrink ScrollView inside a
  // content-sized ChamferBox collapsed to ~nothing (it has no intrinsic main-axis height), which
  // cropped the Modifiers + Rest panels. Sizing the ChamferBox to its content and the ScrollView to
  // maxHeight = a slice of the screen lets short content show fully and tall content scroll.
  const { height: screenH } = useWindowDimensions();
  const scrollMax = Math.round(screenH * 0.6);
  // Entrance (#201): the scrim fades in and the panel rises + scales in instead of popping.
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = reduced ? 1 : withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [p, reduced]);
  const scrimStyle = useAnimatedStyle(() => ({ opacity: p.value }));
  const boxStyle = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 18 }, { scale: 0.95 + 0.05 * p.value }] }));
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
      {/* Transparent tap-catcher only (#239 item 9): the shared SheetDim darkens the screen now, so a
          per-shell dark scrim would double-dim and pop on open/close. This still closes on outside tap. */}
      <AnimatedPressable style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, scrimStyle]} onPress={dismissOnScrim ? onClose : undefined} accessibilityElementsHidden={!dismissOnScrim} accessibilityRole={dismissOnScrim ? 'button' : undefined} accessibilityLabel={dismissOnScrim ? 'Close' : undefined} />
      {/* box-none centering layer (#250): taps NOT on the box fall through to the scrim (close); taps on
          the box are dropped by its non-responder background (no close) while the ScrollView/buttons
          still work. Replaces the onStartShouldSetResponder barrier that broke scrolling. */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={boxStyle}>
      <ChamferBox chamfer={16} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 16 }}>
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
          <ScrollView style={{ maxHeight: scrollMax }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 2 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          <View style={{ gap: 10 }}>{children}</View>
        )}
        {footer ? <View style={{ marginTop: 14 }}>{footer}</View> : null}
      </ChamferBox>
      </Animated.View>
      </View>
    </View>
  );
}
