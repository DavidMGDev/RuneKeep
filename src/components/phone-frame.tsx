import { type ReactNode, useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { ArtImage } from '@/components/art-image';
import { Rune } from '@/constants/theme';
import { CATALOG } from '@/data/catalog';
import { DESIGN_H, DESIGN_W, FrameContext, TABLET_MIN_SW } from '@/hooks/use-layout';
import { useDimLevel } from '@/lib/screen-dim';

/**
 * The tablet frame (v0.24.0).
 *
 * A tablet does not get a tablet layout. It gets the phone layout, drawn into a phone-shaped viewport
 * that is uniformly magnified to the height of the display and centred, with the leftover width used
 * as a decorated margin.
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
 * The scale is `min(w/412, h/892)`, so the viewport fills the display's height and keeps a phone's
 * proportions. Its height in layout dp is whatever that leaves, which is how a shorter or taller
 * tablet still gets a full-height frame instead of letterboxing top and bottom.
 *
 * Phones return the children untouched, with no context and no extra views.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= TABLET_MIN_SW;
  const dim = useDimLevel();

  const frame = useMemo(() => {
    const scale = Math.min(width / DESIGN_W, height / DESIGN_H);
    return { width: DESIGN_W, height: height / scale, scale, offsetX: Math.max(0, (width - DESIGN_W * scale) / 2) };
  }, [width, height]);

  if (!isTablet) return <>{children}</>;

  const shownW = frame.width * frame.scale;
  const margin = frame.offsetX;

  return (
    <View style={{ flex: 1, backgroundColor: Rune.ink, alignItems: 'center', overflow: 'hidden' }}>
      <Margins width={width} height={height} />
      <View style={{ width: shownW, height, overflow: 'hidden' }}>
        <View style={{ width: frame.width, height: frame.height, transform: [{ scale: frame.scale }], transformOrigin: [0, 0, 0] }}>
          <FrameContext.Provider value={frame}>{children}</FrameContext.Provider>
        </View>
      </View>
      {/* The margins dim with the app, so an open dialog darkens the whole display rather than a
          brightly-lit strip either side of a darkened phone. Painted outside the clip, hence the
          registry in lib/screen-dim rather than the scrims reaching out here themselves. */}
      {dim > 0 && margin > 0 ? (
        <>
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: margin, backgroundColor: `rgba(6,8,13,${dim})` }} />
          <View pointerEvents="none" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: margin, backgroundColor: `rgba(6,8,13,${dim})` }} />
        </>
      ) : null}
    </View>
  );
}

const DECOR_W = 150;
const DECOR_H = Math.round(DECOR_W * (263 / 188));

/**
 * The margins, so they read as deliberate rather than empty: a scatter of card faces at the edge of
 * visibility. Deterministic (index arithmetic, no randomness) so it never reshuffles on a re-render,
 * static (no animation) so it costs nothing to keep on screen, and drawn full-width because the
 * viewport paints over the middle anyway.
 */
function Margins({ width, height }: { width: number; height: number }) {
  const decor = useMemo(() => {
    const domains = CATALOG.filter((c) => c.kind === 'domain');
    if (!domains.length) return [];
    const cols = Math.max(2, Math.ceil(width / DECOR_W));
    const rows = Math.max(2, Math.ceil(height / (DECOR_H * 0.8)));
    const out: { key: string; thumb: number; x: number; y: number; rot: string }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        out.push({
          key: `${r}-${c}`,
          thumb: domains[(i * 29) % domains.length].thumb,
          // The half-column stagger and the alternating tilt stop it reading as a grid.
          x: c * DECOR_W + (r % 2 ? DECOR_W * 0.5 : 0) - DECOR_W * 0.35,
          y: r * DECOR_H * 0.8 - DECOR_H * 0.2,
          rot: `${((i % 5) - 2) * 3}deg`,
        });
      }
    }
    return out;
  }, [width, height]);

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height, opacity: 0.05 }}>
      {decor.map((d) => (
        <View key={d.key} style={{ position: 'absolute', left: d.x, top: d.y, width: DECOR_W, height: DECOR_H, transform: [{ rotate: d.rot }] }}>
          <ArtImage source={d.thumb} fit="contain" />
        </View>
      ))}
    </View>
  );
}
