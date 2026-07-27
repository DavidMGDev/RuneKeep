import { type ReactNode } from 'react';
import { Platform, Pressable, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline } from 'react-native-svg';

import FullUi from '../../assets/art/new/FullUI.svg';
import { Body, Display, DmRune, Rune } from '@/constants/theme';

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
  /** Lift the content ABOVE the border frame (create: the gear must ride in front of it). */
  contentAboveFrame?: boolean;
  /** DM Mode (v0.15.0): desaturate the header text/back into the DM palette. */
  dm?: boolean;
  children: ReactNode;
}

/**
 * The non-sheet screen scaffold: ink ground, the FullUI gold border full-bleed, content inset
 * within it. Plain flex (dp), NOT DesignStage — these screens scroll and adapt (DESIGN.md).
 * The sheet keeps its own ornamental border; everything else lives in this frame.
 */
export function AppScreen({ title, onBack, headerRight, contentAboveFrame, dm, children }: AppScreenProps) {
  const { top, bottom } = useScreenInsets();
  const titleColor = dm ? DmRune.ivory : Rune.ivory;
  const backStroke = dm ? DmRune.accent : Rune.goldEdge;
  return (
    // height/width 100% + overflow hidden belt-and-braces: on web the router wrapper sizes to
    // content — tall content collapsed the flex chain (menu) and a wide min-content child pushed
    // the whole page past the viewport (create). Clamp the screen to the viewport; inner layout
    // distributes from there. Harmless on native.
    <View style={{ flex: 1, height: '100%' as never, width: '100%' as never, maxWidth: '100%' as never, overflow: 'hidden', backgroundColor: Rune.ink }}>
      <View style={{ flex: 1, marginTop: top, marginBottom: bottom }}>
        {/* content inset inside the frame's gold line (frame edge ≈ 10dp + breathing room) */}
        <View style={{ flex: 1, paddingHorizontal: 18, paddingTop: title ? 8 : 0, paddingBottom: 14, zIndex: contentAboveFrame ? 2 : 0 }}>
          {title ? (
            // The header FOLLOWS the border's top band (owner #102): back pinned in the left
            // corner, the right control in the right corner, and a smaller CENTERED title between
            // them — nothing tall enough to clash with the frame's notches.
            <View style={{ height: 36, marginTop: 12, marginBottom: 8, justifyContent: 'center' }}>
              {/* v0.22.0: the title sits BETWEEN the two 44dp corner slots rather than being clamped to
                  a flat 55% of the full width. The old clamp was measured against the whole header, so
                  a title at exactly 55% could print under a wide right-hand control — and 207dp only
                  bought ~17 uppercase characters, which an auto-named session ("SESSION 27/07/2026")
                  already overran on day one. Now it gets ~288dp and shrinks to 80% before ellipsizing. */}
              <View style={{ position: 'absolute', left: 44, right: 44, top: 0, bottom: 0, justifyContent: 'center' }} pointerEvents="none">
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  maxFontSizeMultiplier={1.2}
                  style={{ textAlign: 'center', color: titleColor, fontSize: 15, fontFamily: Display.black, letterSpacing: 2, textTransform: 'uppercase' }}>
                  {title}
                </Text>
              </View>
              {onBack ? (
                <Pressable
                  onPress={onBack}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                  style={({ pressed }) => ({ position: 'absolute', left: 0, top: 0, bottom: 0, width: 34, alignItems: 'flex-start', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
                  <Svg width={16} height={16} viewBox="0 0 18 18">
                    <Polyline points="12,2 5,9 12,16" fill="none" stroke={backStroke} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </Pressable>
              ) : null}
              {headerRight ? (
                <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, justifyContent: 'center' }}>{headerRight}</View>
              ) : null}
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

/** Tiny tracked-gold section label used across the dark screens. `dm` desaturates it (v0.15.0). */
export function SectionLabel({ children, style, dm }: { children: ReactNode; style?: object; dm?: boolean }) {
  return (
    <Text style={[{ color: dm ? DmRune.accent : Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 2, textTransform: 'uppercase' }, style]}>{children}</Text>
  );
}
