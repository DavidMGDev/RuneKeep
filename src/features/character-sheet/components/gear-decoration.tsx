import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { box } from '@/lib/design';
import { useCarousel } from '../carousel-context';
import { GearStack } from './gear-stack';

const GEAR_W = 500; // larger than the 412 design width — a big submerged mechanism (#48 I)
const GEAR_LEFT = (412 - GEAR_W) / 2;
const GEAR_TOP = 714; // the half-point stays well below the design bottom (892)

/**
 * The cogs at the sheet's bottom edge — STATIC pose (owner #62 D: no more scaling/moving; the old
 * expanded pose is the permanent one). They spin off the shared carousel rotation, and the inner
 * gear brightens to full opacity as the hand expands — it is the grind-scroll control (the
 * touchable pad lives in the carousel, this layer is pointer-transparent art).
 *
 * Rendered INSIDE the carousel container so it can interleave with the card stack: under every
 * card normally (zIndex 0 vs slots ~1000), but ABOVE the fullscreen dim (2000) and still under the
 * focused card (3000) while a card is focused — the gears sit on top of every card-related dimming
 * layer, never on top of a card.
 */
export function GearDecoration() {
  const { rotation, expandProgress, fullscreenProgress } = useCarousel();
  const layer = useAnimatedStyle(() => ({ zIndex: fullscreenProgress.value > 0.02 ? 2500 : 0 }));
  return (
    <Animated.View style={[box(GEAR_LEFT, GEAR_TOP, GEAR_W, GEAR_W), layer]} pointerEvents="none">
      <GearStack rotation={rotation} expandProgress={expandProgress} size={GEAR_W} />
    </Animated.View>
  );
}
