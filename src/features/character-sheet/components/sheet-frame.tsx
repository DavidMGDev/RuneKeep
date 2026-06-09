import { View } from 'react-native';

import { box } from '@/lib/design';
import { Art } from '../art';
import { ArtBox } from './primitives';

/** The parchment sheet behind everything (rounded so the gold frame's corners read). */
export function SheetBackground() {
  return <View style={[box(0, 0, 412, 892), { backgroundColor: '#ffffff', borderRadius: 30 }]} />;
}

/** The gold ornamental border (on top of content) + the class emblem hanging from the top edge. */
export function SheetFrame({ onPressClass }: { onPressClass?: () => void }) {
  return (
    <>
      <View style={box(0, 0, 412, 892)} pointerEvents="none">
        <ArtBox left={0} top={0} width={412} height={892} source={Art.longBorder} />
      </View>
      <ArtBox left={25.9} top={0} width={51.2} height={74.2} source={Art.classBanner} pressable pressedScale={1.08} onPress={onPressClass} />
    </>
  );
}
