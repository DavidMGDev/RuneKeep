import { type ReactNode, useMemo } from 'react';
import { Platform, StatusBar as RNStatusBar, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Rune } from '@/constants/theme';
import { DESIGN_H, DESIGN_W, FrameContext, TABLET_MIN_SW } from '@/hooks/use-layout';
import { useDimLevel, useEdgeColor } from '@/lib/screen-dim';

/**
 * The tablet frame (v0.24.0, margins reworked v0.24.1).
 *
 * A tablet does not get a tablet layout. It gets the phone layout, drawn into a phone-shaped viewport
 * that is uniformly magnified to the height of the display and centred, with the leftover width to
 * either side.
 *
 * Three things follow from that, all of which were the owner's complaints about v0.23.0:
 *
 *  - **The border is a border again.** Every screen paints its frame art at the edge of its own box,
 *    which is now the edge of the phone viewport rather than the edge of a 10" display.
 *  - **Nothing renders outside it.** The viewport clips, so the character sheet's carousel stops
 *    spilling its off-screen cards across the margins.
 *  - **The layout is the phone layout, exactly.** The viewport is 412dp wide, so `useLayout()` reports
 *    a phone and every tablet branch added in v0.23.0 turns itself off. Six trait dials go back to
 *    two rows of three.
 *
 * ## The margins
 *
 * v0.24.0 decorated them with faint card art. That was wrong twice: it drew attention to the very
 * thing it was there to make unremarkable, and it could not follow what the screen was doing, so the
 * character sheet's parchment column sat between two dark strips and every dialog lit them up.
 *
 * They are a plain continuation of the screen now. Whatever colour a screen paints at its horizontal
 * edge, it declares (`lib/screen-dim`), and the margins paint the same, under the same dim, behind the
 * same status and navigation bars. Nothing is sampled, because React Native cannot read back a
 * rendered pixel cheaply; the screen is asked instead.
 *
 * Phones return the children untouched, with no context and no extra views.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= TABLET_MIN_SW;
  const dim = useDimLevel();
  // Ink is the app's own background, and what every screen but the character sheet paints to its edges.
  const edge = useEdgeColor() ?? Rune.ink;
  const insets = useSafeAreaInsets();

  const frame = useMemo(() => {
    const scale = Math.min(width / DESIGN_W, height / DESIGN_H);
    return { width: DESIGN_W, height: height / scale, scale, offsetX: Math.max(0, (width - DESIGN_W * scale) / 2) };
  }, [width, height]);

  if (!isTablet) return <>{children}</>;

  const shownW = frame.width * frame.scale;
  const margin = frame.offsetX;

  // The same floors the screens use (#54/#59), in PHYSICAL dp: the bars painted here sit outside the
  // magnified column, so they must not be divided by the frame scale the way a screen's own are.
  const detected = Math.max(insets.top, Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) : 0);
  const topBar = Platform.OS === 'android' && detected < 24 ? 32 : detected;
  const bottomBar = Platform.OS === 'android' && insets.bottom < 16 ? 48 : insets.bottom;

  return (
    <View style={{ flex: 1, backgroundColor: edge, alignItems: 'center', overflow: 'hidden' }}>
      <View style={{ width: shownW, height, overflow: 'hidden' }}>
        <View style={{ width: frame.width, height: frame.height, transform: [{ scale: frame.scale }], transformOrigin: [0, 0, 0] }}>
          <FrameContext.Provider value={frame}>{children}</FrameContext.Provider>
        </View>
      </View>
      {margin > 0 ? (
        <>
          <MarginStrip side="left" width={margin} topBar={topBar} bottomBar={bottomBar} dim={dim} />
          <MarginStrip side="right" width={margin} topBar={topBar} bottomBar={bottomBar} dim={dim} />
        </>
      ) : null}
    </View>
  );
}

/**
 * One margin, stacked in the same order a screen stacks its own edge: the base colour (inherited from
 * the frame's background), the ink status and navigation bands, then the dim. Confined to the margin
 * rather than drawn across the display, so a full-screen overlay inside the column still owns its own
 * status-bar strip.
 */
function MarginStrip({ side, width, topBar, bottomBar, dim }: { side: 'left' | 'right'; width: number; topBar: number; bottomBar: number; dim: number }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, width, [side]: 0 }}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: topBar, backgroundColor: Rune.ink }} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: bottomBar, backgroundColor: Rune.ink }} />
      {dim > 0 ? <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: `rgba(6,8,13,${dim})` }} /> : null}
    </View>
  );
}
