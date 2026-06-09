import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';

import { box } from '@/lib/design';
import { GearStack } from './gear-stack';

const GEAR_W = 384; // almost the full 412 design width
const GEAR_LEFT = (412 - GEAR_W) / 2;
const GEAR_TOP = 776; // only the top ~30% peeks above the design bottom (892)

/**
 * The decorative cog at the sheet's bottom edge — mostly submerged, top ~30% peeking, low opacity.
 * A horizontal drag on it spins the parts independently. (Temporary self-owned rotation; PR5's card
 * carousel will share this value so the cards ride the gear.)
 */
export function GearDecoration() {
  const rotation = useSharedValue(0);
  const start = useSharedValue(0);

  const spin = Gesture.Pan()
    .onBegin(() => {
      start.value = rotation.value;
    })
    .onUpdate((e) => {
      rotation.value = start.value - e.translationX * 0.004;
    });

  return (
    <View style={[box(GEAR_LEFT, GEAR_TOP, GEAR_W, GEAR_W), { opacity: 0.38 }]}>
      <GestureDetector gesture={spin}>
        <View style={{ width: GEAR_W, height: GEAR_W }}>
          <GearStack rotation={rotation} size={GEAR_W} />
        </View>
      </GestureDetector>
    </View>
  );
}
