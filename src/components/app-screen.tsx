import { DESKTOP_PAGE_PAD, useDesktopPage } from '@/hooks/use-desktop';
import { DesktopTopBar } from '@/components/desktop-top-bar';
import { createSideLayers, PageSideContext } from '@/components/desktop-portal';
import { useScreenFocus } from '@/hooks/use-screen-focus';
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline } from 'react-native-svg';

import FullUi from '../../assets/art/new/FullUI.svg';
import { Body, Display, DmRune, Rune } from '@/constants/theme';
import { scaled, useFrame, useLayout } from '@/hooks/use-layout';
import { useScreenEdge } from '@/lib/screen-dim';

/** Same Android floors as the sheet (#54/#59): the owner's A54 reports 0 for both insets. */
export function useScreenInsets() {
  const insets = useSafeAreaInsets();
  // v0.24.0: inside the tablet frame the whole tree is magnified, so a 24dp status bar would be
  // painted 34dp tall. Insets are physical, so divide them back out and they land where they are.
  const { scale } = useFrame();
  const detected = Math.max(insets.top, Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) : 0);
  const top = Platform.OS === 'android' && detected < 24 ? 32 : detected;
  const bottom = Platform.OS === 'android' && insets.bottom < 16 ? 48 : insets.bottom;
  return { top: top / scale, bottom: bottom / scale };
}

interface AppScreenProps {
  /** Web: the header leaves the Tab order and stops taking input (a dialog of the screen's own is up). */
  inertHeader?: boolean;
  /** Desktop pages: keep the content (not the header bar) at most this wide, centred. For forms and editors. */
  desktopMaxWidth?: number;
  /** Desktop pages: runs before the header menu leaves this page; call `go` to leave (after a confirm, say). */
  navGuard?: (go: () => void) => void;
  /** Desktop pages: the header menu replaces this page instead of stacking on it (a page that must not linger). */
  navReplace?: boolean;
  /** Desktop pages: no header menu (a tour is not a place to navigate from). */
  hideNav?: boolean;
  /** Desktop pages: px from the content's left edge to where the pop-up sidebar opens (past the left column). */
  sideAnchor?: number;
  /** Screen heading, drawn inside the frame's top band. Omit for fully custom headers (menu). */
  title?: string;
  onBack?: () => void;
  /** Right-side header slot (e.g. the gallery's filter toggle, create's CTA). */
  headerRight?: ReactNode;
  /** Lift the content ABOVE the border frame (create: the gear must ride in front of it). */
  contentAboveFrame?: boolean;
  /** DM Mode (v0.15.0): desaturate the header text/back into the DM palette. */
  dm?: boolean;
  /**
   * A dialog that must cover the WHOLE screen, border and all (v0.33.0).
   *
   * `children` are inset inside the gold frame, and the frame art is painted over them, so a dialog
   * rendered among them can only scrim the inset column: the dim reads as a grey rectangle laid on
   * the screen, with the border still bright around it. Anything in this slot is drawn last, over
   * everything including the frame and the status bands, so its scrim covers the display.
   */
  overlay?: ReactNode;
  /** Inside the DM screen (v0.50.2): no frame, title or back of its own. The screen round it has those. */
  bare?: boolean;
  children: ReactNode;
}

/**
 * The non-sheet screen scaffold: ink ground, the FullUI gold border full-bleed, content inset
 * within it. Plain flex (dp), NOT DesignStage — these screens scroll and adapt (DESIGN.md).
 * The sheet keeps its own ornamental border; everything else lives in this frame.
 */
export function AppScreen({ title, onBack, headerRight, contentAboveFrame, dm, overlay, inertHeader, desktopMaxWidth, navGuard, navReplace, hideNav, sideAnchor = 0, bare, children }: AppScreenProps) {
  const { top, bottom } = useScreenInsets();
  // v0.24.1: what the tablet margins copy. Every AppScreen paints ink to its left and right edges.
  useScreenEdge(Rune.ink);
  const titleColor = dm ? DmRune.ivory : Rune.ivory;
  const backStroke = dm ? DmRune.accent : Rune.goldEdge;
  const { scale, maxContent } = useLayout();
  // Desktop pages (v0.45.0): the frame art is stretched across a whole window there, so content keeps further in.
  const desktopPage = useDesktopPage();
  const headerRef = useRef<View>(null);
  const contentRef = useRef<View>(null);
  // Desktop pages (v0.45.0): pop-ups open in a sidebar past the page's left column instead of dimming the screen.
  const [sideHost, setSideHost] = useState<HTMLElement | null>(null);
  const [openPanels, setOpenPanels] = useState(0);
  const [layers] = useState(() => createSideLayers(setOpenPanels));
  const [barBottom, setBarBottom] = useState(110);
  const { width: winW, height: winH } = useLayout();
  const sideLeft = DESKTOP_PAGE_PAD + sideAnchor;
  const sideW = Math.min(PAGE_SIDE_W, Math.max(320, winW - sideLeft - DESKTOP_PAGE_PAD));
  const pageSide = useMemo(
    () => (desktopPage ? { host: sideHost, layers, frame: { width: sideW, height: winH - barBottom - 14, scale: 1, offsetX: sideLeft, offsetY: barBottom } } : null),
    [desktopPage, sideHost, layers, sideW, winH, barBottom, sideLeft],
  );
  // While the sidebar is open the page behind it is out of reach: no clicks (the catcher) and no Tab either.
  useLayoutEffect(() => {
    const el = contentRef.current as unknown as HTMLElement | null;
    if (!desktopPage || !el?.setAttribute) return;
    if (openPanels) el.setAttribute('inert', ''); else el.removeAttribute('inert');
  }, [desktopPage, openPanels]);
  // Escape closes the sidebar's top panel (a dialog that handles Escape itself has already claimed the key).
  const front = useScreenFocus();
  useEffect(() => {
    if (!desktopPage || !openPanels || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing || !front()) return;
      if (layers.dismissTop() !== 'none') e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [desktopPage, openPanels, layers, front]);
  useLayoutEffect(() => {
    const el = headerRef.current as unknown as HTMLElement | null;
    if (!el?.setAttribute) return;
    if (inertHeader) el.setAttribute('inert', ''); else el.removeAttribute('inert');
  }, [inertHeader]);
  if (bare) {
    return (
      <View style={{ flex: 1, overflow: 'hidden', backgroundColor: Rune.ink }}>
        <View style={{ flex: 1, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 }}>{children}</View>
        {overlay}
      </View>
    );
  }
  return (
    // height/width 100% + overflow hidden belt-and-braces: on web the router wrapper sizes to
    // content — tall content collapsed the flex chain (menu) and a wide min-content child pushed
    // the whole page past the viewport (create). Clamp the screen to the viewport; inner layout
    // distributes from there. Harmless on native.
    <View style={{ flex: 1, height: '100%' as never, width: '100%' as never, maxWidth: '100%' as never, overflow: 'hidden', backgroundColor: Rune.ink }}>
      <View style={{ flex: 1, marginTop: top, marginBottom: bottom }}>
        {/* content inset inside the frame's gold line (frame edge ≈ 10dp + breathing room).
            v0.23.0 TABLET: the column keeps a phone-like measure and centres, rather than stretching.
            `maxContent` is Infinity on phones and `alignSelf: center` is a no-op at full width, so
            phone layout is byte-identical. This one wrapper is what makes every non-sheet screen
            read the same on a tablet: rows stop being 760dp wide for a five-character name, buttons
            stop spanning the display, and prose keeps a sane measure. */}
        <View ref={contentRef} style={{ flex: 1, width: '100%', maxWidth: maxContent, alignSelf: 'center', paddingHorizontal: desktopPage ? DESKTOP_PAGE_PAD : scaled(18, scale), paddingTop: desktopPage ? 26 : title ? 8 : 0, paddingBottom: 14, zIndex: contentAboveFrame ? 2 : 0 }}>
          {desktopPage && title ? (
            // Desktop pages (v0.45.0): a header bar instead of the phone's header under the frame's top band.
            <View onLayout={(e) => setBarBottom(Math.round(e.nativeEvent.layout.y + e.nativeEvent.layout.height + 6))}>
              <DesktopTopBar ref={headerRef} title={title} onBack={onBack} right={headerRight} navGuard={navGuard} navReplace={navReplace} hideNav={hideNav} />
            </View>
          ) : title ? (
            // The header FOLLOWS the border's top band (owner #102): back pinned in the left
            // corner, the right control in the right corner, and a smaller CENTERED title between
            // them — nothing tall enough to clash with the frame's notches.
            // v0.24.0: the frame art is drawn OVER the content, and its top band dips to ~2.7% of the
            // frame height (~24dp), which was clipping the top of titles like "Making a hero" and
            // "Card Archive". 22dp of margin clears the band with room to spare at any frame height.
            <View ref={headerRef} style={{ height: scaled(36, scale), marginTop: 22, marginBottom: 8, justifyContent: 'center' }}>
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
                  style={{ textAlign: 'center', color: titleColor, fontSize: scaled(15, scale), fontFamily: Display.black, letterSpacing: 2, textTransform: 'uppercase' }}>
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
                  <Svg width={scaled(16, scale)} height={scaled(16, scale)} viewBox="0 0 18 18">
                    <Polyline points="12,2 5,9 12,16" fill="none" stroke={backStroke} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </Pressable>
              ) : null}
              {headerRight ? (
                <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, justifyContent: 'center' }}>{headerRight}</View>
              ) : null}
            </View>
          ) : null}
          <PageSideContext.Provider value={pageSide}>
            {desktopPage && desktopMaxWidth ? <View style={{ flex: 1, width: '100%', maxWidth: desktopMaxWidth, alignSelf: 'center' }}>{children}</View> : children}
          </PageSideContext.Provider>
        </View>
        {/* Full-bleed sharp gold frame ON TOP of content (sharp 0-radius corners by design). Not on a desktop
            page: stretched across a window it is a phone's border on a monitor. */}
        {desktopPage ? null : <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* v0.42.4 (owner): ONE frame. The grey DM border went with the grey DM palette; every
              screen wears the app's own gold edge now. The `dm` prop survives everywhere else because
              it still means "this is a DM screen", it just no longer means "draw it in greys". */}
          <FullUi width="100%" height="100%" preserveAspectRatio="none" />
        </View>}
      </View>
      {/* painted inset bars, same belt-and-braces as the sheet */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: top, backgroundColor: Rune.ink }} />
      <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: bottom, backgroundColor: Rune.ink }} />
      {/* Desktop pages: a click outside the open sidebar closes its top panel, and the sidebar slot itself. */}
      {desktopPage && openPanels ? (
        <Pressable style={[StyleSheet.absoluteFill, { zIndex: 499 }]} onPress={() => layers.dismissTop()} accessibilityRole="button" accessibilityLabel="Close the panel" {...({ tabIndex: -1 } as object)} />
      ) : null}
      {desktopPage ? (
        <View ref={setSideHost as never} pointerEvents="box-none" style={{ position: 'absolute', left: sideLeft, top: barBottom, width: sideW, bottom: 14, zIndex: 500 }} />
      ) : null}
      {/* Last, so a dialog's scrim covers the frame art and the inset bands rather than sitting in a
          rectangle inside them (v0.33.0). */}
      <PageSideContext.Provider value={pageSide}>{overlay}</PageSideContext.Provider>
    </View>
  );
}

/** A desktop page's pop-up sidebar width, in px. */
const PAGE_SIDE_W = 480;

/** Tiny tracked-gold section label used across the dark screens. `dm` desaturates it (v0.15.0). */
export function SectionLabel({ children, style, dm }: { children: ReactNode; style?: object; dm?: boolean }) {
  return (
    <Text style={[{ color: dm ? DmRune.accent : Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 2, textTransform: 'uppercase' }, style]}>{children}</Text>
  );
}
