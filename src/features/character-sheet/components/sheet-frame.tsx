import { View } from 'react-native';

import { Rune } from '@/constants/theme';
import { box } from '@/lib/design';
import { Art } from '../art';
import { ArtBox } from './primitives';

/** The parchment sheet behind everything (rounded so the gold frame's corners read). */
export function SheetBackground() {
  return <View style={[box(0, 0, 412, 892), { backgroundColor: Rune.sheet, borderRadius: 30 }]} />;
}

/**
 * The gold ornamental border (on top of content) + the class emblem hanging from the top edge.
 * The frame is `fill`: its art is authored to span the full sheet, so it must stretch to the box —
 * `contain` would letterbox it (its native aspect differs) and pull it off the sheet edges.
 */
export function SheetFrame() {
  // zIndex keeps the gold border ABOVE the card hand (C5): compact cards tuck under the bottom edge
  // instead of painting over the frame, while the centered expanded cards stay clear of the filigree.
  // The class emblem is decorative — it carried a dead onPress, so it is now a plain image (A2).
  return (
    <View style={[box(0, 0, 412, 892), { zIndex: 2000 }]} pointerEvents="none">
      <ArtBox left={0} top={0} width={412} height={892} source={Art.longBorder} fit="fill" />
      <ArtBox left={25.9} top={0} width={51.2} height={74.2} source={Art.classBanner} />
    </View>
  );
}
