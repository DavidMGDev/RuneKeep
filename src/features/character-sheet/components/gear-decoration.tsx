import { View } from 'react-native';

import { box } from '@/lib/design';
import { useCarousel } from '../carousel-context';
import { GearStack } from './gear-stack';

const GEAR_W = 500; // larger than the 412 design width — a big submerged mechanism (#48 I)
const GEAR_LEFT = (412 - GEAR_W) / 2;
// No more than ~40% of the stack's height shows above the design bottom (892) — the owner wants
// the gears to read as machinery sunk under the edge, not a medallion floating on the sheet.
const GEAR_TOP = 694;

/**
 * The decorative cog at the sheet's bottom edge — mostly submerged, low opacity, behind the UI
 * border. Spins off the shared carousel rotation, so the cards visibly ride it. The card carousel
 * owns the scroll gesture; the gear is purely visual (pointer-transparent).
 */
export function GearDecoration() {
  const { rotation } = useCarousel();
  return (
    <View style={[box(GEAR_LEFT, GEAR_TOP, GEAR_W, GEAR_W), { opacity: 0.26 }]} pointerEvents="none">
      <GearStack rotation={rotation} size={GEAR_W} />
    </View>
  );
}
