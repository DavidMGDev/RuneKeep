import { type ReactNode, useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { ChamferBox } from '@/components/chamfer-box';
import { OverlayHost } from '@/components/overlay-host';
import { useScreenInsets } from '@/components/app-screen';
import { Body, Display, Rune } from '@/constants/theme';
import { useLayout } from '@/hooks/use-layout';
import { playSfx } from '@/lib/sfx';
import { DimScreen, useScreenDim } from '@/lib/screen-dim';

/**
 * The shared FULL-SCREEN interface shell (#252) — the Level Up pattern, generalised. An OPAQUE
 * backdrop (the sheet behind is neither seen nor touchable; the carousel is unloaded while it's open),
 * a chamfered SVG border that everything stays inside (overflow hidden — content never escapes past
 * the border), and a button-only close. There is NO tap-outside-to-close and NOTHING can be tapped
 * through. Used by Card Management, New Card, and the catalog browser. /impeccable, product register.
 */
export function FullScreenPanel({ title, subtitle, onClose, footer, headerExtra, children }: { title: string; subtitle?: string; onClose: () => void; footer?: ReactNode; headerExtra?: ReactNode; children: ReactNode }) {
  const insets = useScreenInsets();
  const { maxContent } = useLayout();
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = reduced ? 1 : withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [p, reduced]);
  // Audio (#255): one panel-open on mount covers every full-screen interface; close fires on the ✕.
  useEffect(() => {
    playSfx('panelOpen');
  }, []);
  const close = () => {
    playSfx('panelClose');
    onClose();
  };
  const bgStyle = useAnimatedStyle(() => ({ opacity: p.value }));
  const panelStyle = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 16 }] }));

  // v0.24.1: declare it so the tablet margins darken with the screen (lib/screen-dim).
  useScreenDim(0.985);
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000 }}>
      {/* v0.39.0: anything inside this panel that asks to be an OVERLAY is drawn here, as a child of
          the full-screen view, rather than wherever it was written. A dialog written inside one of
          the panel's scrolling columns would otherwise be positioned against the scroll CONTENT and
          land off the top of the screen (see components/overlay-host). */}
      <OverlayHost>
      {/* opaque catching backdrop — no onPress (button-only close), but a touch target so nothing
          behind can ever be tapped through. */}
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,10,15,0.985)' }, bgStyle]} />
      <Animated.View style={[{ flex: 1, width: '100%', maxWidth: maxContent, alignSelf: 'center', marginTop: insets.top + 6, marginBottom: insets.bottom + 6, paddingHorizontal: 8 }, panelStyle]}>
        <ChamferBox chamfer={18} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ flex: 1, overflow: 'hidden', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text numberOfLines={2} style={{ color: Rune.goldText, fontSize: 21, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</Text>
              {subtitle ? <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.medium, marginTop: 2 }}>{subtitle}</Text> : null}
            </View>
            {headerExtra}
            <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={{ padding: 4 }}>
              <Text style={{ color: Rune.muted, fontSize: 18, fontFamily: Body.bold }}>✕</Text>
            </Pressable>
          </View>
          <View style={{ flex: 1 }}>{children}</View>
          {footer ? <View style={{ marginTop: 10 }}>{footer}</View> : null}
        </ChamferBox>
      </Animated.View>
      </OverlayHost>
    </View>
  );
}

/**
 * A small centered dialog (#252) — for secondary prompts over a panel or the sheet. A backdrop
 * Pressable closes on a TRUE outside tap; a plain catching View holds the box so taps inside it are
 * dropped (never close, never click through) and inner ScrollViews/buttons keep working. `scrimOpacity`
 * 0 = transparent (rely on the shared SheetDim when over the sheet); >0 = its own dim over a panel.
 */
export function CenterDialog({ onClose, children, zIndex = 10003, scrimOpacity = 0.55, dismissOnScrim = true }: { onClose: () => void; children: ReactNode; zIndex?: number; scrimOpacity?: number; dismissOnScrim?: boolean }) {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex }}>
      <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: scrimOpacity > 0 ? `rgba(6,8,13,${scrimOpacity})` : 'transparent' }} onPress={dismissOnScrim ? onClose : undefined} accessibilityRole={dismissOnScrim ? 'button' : undefined} accessibilityLabel={dismissOnScrim ? 'Close' : undefined} />
      {/* v0.32.0: declare the dim so the tablet frame's margins darken with it (lib/screen-dim),
          instead of the dialog sitting on a dark screen between two lit strips. */}
      <DimScreen opacity={scrimOpacity} />
      {/* v0.32.0: the content SWALLOWS touches. A plain View is not a touch responder and neither is
          a Text inside it, so a tap on a label fell straight through to the scrim behind and closed
          the dialog. Reading an option was enough to dismiss the question. */}
      <View onStartShouldSetResponder={() => true} onResponderRelease={() => {}}>{children}</View>
    </View>
  );
}
