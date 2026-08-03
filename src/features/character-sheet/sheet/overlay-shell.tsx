import { type ReactNode, useEffect } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { ChamferBox } from '@/components/chamfer-box';
import { Body, Display, Rune } from '@/constants/theme';
import { scaled, useLayout } from '@/hooks/use-layout';
import { playSfx } from '@/lib/sfx';

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
  header,
  footer,
  width = 348,
  scroll = true,
  dismissOnScrim = true,
  mute = false,
  onEndReached,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** Pinned above the scrolling body — used by the State panel for its tab strip. */
  header?: ReactNode;
  footer?: ReactNode;
  width?: number;
  scroll?: boolean;
  /** When false, tapping the dim does NOT close — the user must press the ✕ (#168, owner). */
  dismissOnScrim?: boolean;
  /** v0.13.0: no open/close sounds (the empty-category panel must appear silently, owner item 10). */
  mute?: boolean;
  /**
   * Called as the scroll approaches the bottom, for a panel that pages its content in (v0.34.0).
   *
   * It lives on the shell rather than in each panel because the shell owns the scroll view. The
   * Timeline is the caller that needed it: at a hundred entries it built every row up front, and each
   * row diffs two whole character snapshots to say which cards moved.
   */
  onEndReached?: () => void;
}) {
  const { scale } = useLayout();
  // The body ScrollView is capped to a real pixel height (#233): a flex-shrink ScrollView inside a
  // content-sized ChamferBox collapsed to ~nothing (it has no intrinsic main-axis height), which
  // cropped the Modifiers + Rest panels. Sizing the ChamferBox to its content and the ScrollView to
  // maxHeight = a slice of the screen lets short content show fully and tall content scroll.
  const { height: screenH } = useLayout();
  const scrollMax = Math.round(screenH * 0.6);
  // Entrance (#201): the scrim fades in and the panel rises + scales in instead of popping.
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = reduced ? 1 : withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [p, reduced]);
  // Audio (#255): panel-open on mount, panel-close on the ✕ or an outside-tap dismiss.
  useEffect(() => {
    if (!mute) playSfx('panelOpen');
    // ponytail: mute is fixed for a given mount — no need to react to changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const close = () => {
    if (!mute) playSfx('panelClose');
    onClose();
  };
  const scrimStyle = useAnimatedStyle(() => ({ opacity: p.value }));
  const boxStyle = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 18 }, { scale: 0.95 + 0.05 * p.value }] }));
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
      {/* Transparent tap-catcher only (#239 item 9): the shared SheetDim darkens the screen now, so a
          per-shell dark scrim would double-dim and pop on open/close. This still closes on outside tap. */}
      {/* A catching backdrop (#252): closes on a TRUE outside tap; the box (a real View) catches its
          OWN taps so nothing inside closes the panel or reaches the carousel beneath. No box-none. */}
      {/* #258r3: occluding bg + collapsable so GH's hit-test stops here (a transparent scrim lets
          gestures through to the sheet's stat tracks underneath). SheetDim still provides the visible dim. */}
      <AnimatedPressable collapsable={false} style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,8,13,0.01)' }, scrimStyle]} onPress={dismissOnScrim ? close : undefined} accessibilityElementsHidden={!dismissOnScrim} accessibilityRole={dismissOnScrim ? 'button' : undefined} accessibilityLabel={dismissOnScrim ? 'Close' : undefined} />
      <Animated.View style={boxStyle}>
      <ChamferBox chamfer={16} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: scaled(width, scale), maxWidth: '94%', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text numberOfLines={2} style={{ color: Rune.goldText, fontSize: 22, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</Text>
            {subtitle ? <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.medium, marginTop: 2 }}>{subtitle}</Text> : null}
          </View>
          <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={{ padding: 4 }}>
            <Text style={{ color: Rune.muted, fontSize: 18, fontFamily: Body.bold }}>✕</Text>
          </Pressable>
        </View>
        {header}
        {scroll ? (
          <ScrollView
            style={{ maxHeight: scrollMax }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingBottom: 2 }}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={64}
            onScroll={
              onEndReached
                ? (e) => {
                    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
                    // One screen of slack, so the next page is ready before the current one runs out.
                    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - layoutMeasurement.height) onEndReached();
                  }
                : undefined
            }>
            {children}
          </ScrollView>
        ) : (
          <View style={{ gap: 10 }}>{children}</View>
        )}
        {footer ? <View style={{ marginTop: 14 }}>{footer}</View> : null}
      </ChamferBox>
      </Animated.View>
    </View>
  );
}
