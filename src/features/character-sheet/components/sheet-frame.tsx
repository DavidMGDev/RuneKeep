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
export function SheetFrame({ onPressClass }: { onPressClass?: () => void }) {
  return (
    <>
      <View style={box(0, 0, 412, 892)} pointerEvents="none">
        <ArtBox left={0} top={0} width={412} height={892} source={Art.longBorder} fit="fill" />
      </View>
      <ArtBox left={25.9} top={0} width={51.2} height={74.2} source={Art.classBanner} pressable pressedScale={1.08} onPress={onPressClass} />
    </>
  );
}
