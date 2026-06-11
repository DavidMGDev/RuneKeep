import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { box } from '@/lib/design';
import { useCarousel } from '../carousel-context';
import { GearStack } from './gear-stack';

const GEAR_W = 500; // larger than the 412 design width — a big submerged mechanism (#48 I)
const GEAR_LEFT = (412 - GEAR_W) / 2;
// The EXPANDED pose: nudged lower again per owner (#54 C) — the stack's half-point stays well
// below the design bottom (892) so it always reads as machinery sunk under the edge.
const GEAR_TOP = 714;
// Compact pose: 30% smaller and sunk this much further. Expanding the hand raises + scales the
// gears up into the full pose, riding the same spring as the cards (expandProgress).
const COMPACT_SCALE = 0.7;
const COMPACT_SINK = 55;

/**
 * The decorative cogs at the sheet's bottom edge — mostly submerged, behind the trait banners and
 * the UI border. They spin off the shared carousel rotation (the cards visibly ride them) and
 * breathe with the hand: small + low when compact, rising into the full pose on expand (#54 C).
 * The card carousel owns the scroll gesture; the gears are purely visual (pointer-transparent).
 */
export function GearDecoration() {
  const { rotation, expandProgress } = useCarousel();
  const pose = useAnimatedStyle(() => {
    const p = expandProgress.value;
    return {
      transform: [
        { translateY: COMPACT_SINK * (1 - p) },
        { scale: COMPACT_SCALE + (1 - COMPACT_SCALE) * p },
      ],
    };
  });
  return (
    <Animated.View style={[box(GEAR_LEFT, GEAR_TOP, GEAR_W, GEAR_W), pose]} pointerEvents="none">
      <GearStack rotation={rotation} size={GEAR_W} />
    </Animated.View>
  );
}
