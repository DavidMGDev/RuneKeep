import { StyleSheet, View } from 'react-native';

import { Rune } from '@/constants/theme';
import { box } from '@/lib/design';
import { ArtImage } from '@/components/art-image';
import { Art } from '../art';

/** The parchment sheet behind everything (rounded so the gold frame's corners read). */
export function SheetBackground() {
  return <View style={[box(0, 0, 412, 892), { backgroundColor: Rune.sheet, borderRadius: 30 }]} />;
}

// Class-banner geometry as a fraction of the frame (was design px 25.9 / 51.2×74.2 in the 412 box),
// so it stays pinned to the top-left of the FULL-BLEED border however the screen is proportioned.
const BANNER_LEFT = `${(25.9 / 412) * 100}%` as const;
const BANNER_W = `${(51.2 / 412) * 100}%` as const;
const BANNER_ASPECT = 51.2 / 74.2;

/**
 * The gold ornamental border. It is a FULL-BLEED overlay (not inside the design stage): the art is
 * stretched edge-to-edge so its gold line hugs the physical screen, leaving no dark margin for the
 * card hand to float over (owner feedback #1). The card hand is clipped to the design box, so it
 * always sits BEHIND this frame. Only the class banner pokes above the top edge.
 */
export function SheetFrame() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <ArtImage source={Art.longBorder} fit="fill" style={StyleSheet.absoluteFill} />
      {/* Banner hangs from the top-left of the frame, sized relative so it tracks the stretch. */}
      <ArtImage
        source={Art.classBanner}
        fit="contain"
        style={{ position: 'absolute', left: BANNER_LEFT, top: 0, width: BANNER_W, aspectRatio: BANNER_ASPECT } as never}
      />
    </View>
  );
}
