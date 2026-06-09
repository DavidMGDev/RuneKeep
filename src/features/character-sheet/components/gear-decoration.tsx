import { View } from 'react-native';

import { box } from '@/lib/design';
import { useCarousel } from '../carousel-context';
import { GearStack } from './gear-stack';

const GEAR_W = 384; // almost the full 412 design width
const GEAR_LEFT = (412 - GEAR_W) / 2;
const GEAR_TOP = 776; // only the top ~30% peeks above the design bottom (892)

/**
 * The decorative cog at the sheet's bottom edge — mostly submerged, top ~30% peeking, low opacity,
 * behind the UI border. Spins off the shared carousel rotation, so the cards visibly ride it. The
 * card carousel owns the scroll gesture; the gear is purely visual (pointer-transparent).
 */
export function GearDecoration() {
  const { rotation } = useCarousel();
  return (
    <View style={[box(GEAR_LEFT, GEAR_TOP, GEAR_W, GEAR_W), { opacity: 0.26 }]} pointerEvents="none">
      <GearStack rotation={rotation} size={GEAR_W} />
    </View>
  );
}
