import { type ReactNode } from 'react';
import { Platform, Pressable, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline } from 'react-native-svg';

import FullUi from '../../assets/art/new/FullUI.svg';
import { Body, Display, Rune } from '@/constants/theme';

/** Same Android floors as the sheet (#54/#59): the owner's A54 reports 0 for both insets. */
export function useScreenInsets() {
  const insets = useSafeAreaInsets();
  const detected = Math.max(insets.top, Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) : 0);
  const top = Platform.OS === 'android' && detected < 24 ? 32 : detected;
  const bottom = Platform.OS === 'android' && insets.bottom < 16 ? 48 : insets.bottom;
  return { top, bottom };
}

interface AppScreenProps {
  /** Screen heading, drawn inside the frame's top band. Omit for fully custom headers (menu). */
  title?: string;
  onBack?: () => void;
  /** Right-side header slot (e.g. the gallery's filter toggle, create's CTA). */
  headerRight?: ReactNode;
  children: ReactNode;
}

/**
 * The non-sheet screen scaffold: ink ground, the FullUI gold border full-bleed, content inset
 * within it. Plain flex (dp), NOT DesignStage — these screens scroll and adapt (DESIGN.md).
 * The sheet keeps its own ornamental border; everything else lives in this frame.
 */
export function AppScreen({ title, onBack, headerRight, children }: AppScreenProps) {
  const { top, bottom } = useScreenInsets();
  return (
    // height/width 100% + overflow hidden belt-and-braces: on web the router wrapper sizes to
    // content — tall content collapsed the flex chain (menu) and a wide min-content child pushed
    // the whole page past the viewport (create). Clamp the screen to the viewport; inner layout
    // distributes from there. Harmless on native.
    <View style={{ flex: 1, height: '100%' as never, width: '100%' as never, maxWidth: '100%' as never, overflow: 'hidden', backgroundColor: Rune.ink }}>
      <View style={{ flex: 1, marginTop: top, marginBottom: bottom }}>
        {/* content inset inside the frame's gold line (frame edge ≈ 10dp + breathing room) */}
        <View style={{ flex: 1, paddingHorizontal: 18, paddingTop: title ? 10 : 0, paddingBottom: 14 }}>
          {title ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', height: 48, marginBottom: 6 }}>
              {onBack ? (
                <Pressable
                  onPress={onBack}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                  style={({ pressed }) => ({ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
                  <Svg width={18} height={18} viewBox="0 0 18 18">
                    <Polyline points="12,2 5,9 12,16" fill="none" stroke={Rune.goldEdge} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </Pressable>
              ) : null}
              <Text
                numberOfLines={1}
                style={{ flex: 1, color: Rune.ivory, fontSize: 22, fontFamily: Display.black, letterSpacing: 1.5, textTransform: 'uppercase', marginLeft: onBack ? 6 : 2 }}>
                {title}
              </Text>
              {headerRight}
            </View>
          ) : null}
          {children}
        </View>
        {/* Full-bleed sharp gold frame ON TOP of content (sharp 0-radius corners by design). */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <FullUi width="100%" height="100%" preserveAspectRatio="none" />
        </View>
      </View>
      {/* painted inset bars, same belt-and-braces as the sheet */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: top, backgroundColor: Rune.ink }} />
      <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: bottom, backgroundColor: Rune.ink }} />
    </View>
  );
}

/** Tiny tracked-gold section label used across the dark screens. */
export function SectionLabel({ children, style }: { children: ReactNode; style?: object }) {
  return (
    <Text style={[{ color: Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 2, textTransform: 'uppercase' }, style]}>{children}</Text>
  );
}
