import { Image } from 'expo-image';
import { View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

const U2 = require('../../../../assets/art/gears/raster/U2.png');
const U3 = require('../../../../assets/art/gears/raster/U3.png');

// The U-parts pre-rasterized in a shared union viewBox (so they composite concentrically) on a
// transparent background. Rotating a flat image is GPU-cheap — far smoother on device than animating
// four 100KB live SVGs. Each layer pivots around its OWN measured centroid (pixel center of mass), so
// every part spins truly in place; they share one direction and differ only in speed.
const VB_W = 1848.7517;
const VB_H = 1830.1721;

interface Layer {
  src: number;
  /**
   * transformOrigin = the part's own centroid (% of the box) → spins around its real axis.
   * ARRAY form [x%, y%, z(px)] — the string form ("52% 47%") crashes RN's native parser
   * ("Transform origin z-position must be a number").
   */
  origin: (string | number)[];
  /** Speed multiplier off the shared rotation. All positive = same direction. */
  ratio: number;
  /** Per-layer size, scaled around the layer's own centroid — DISTINCTLY different per ring so the
   *  mechanism reads as stacked separate gears, not one conglomerate disc (#48 I). */
  scale: number;
}

// Only the two INNER rings survive (#54 C): the owner cut the two outer layers — half the rotating
// texture area per scroll frame, and the layering reads cleaner behind the cards.
const LAYERS: Layer[] = [
  { src: U2, origin: ['50.0%', '47.5%', 0], ratio: 0.62, scale: 0.74 },
  { src: U3, origin: ['50.1%', '48.7%', 0], ratio: 1.45, scale: 0.52 },
];

/** Gear translucency lives ON EACH IMAGE (single-drawable paint alpha). A fractional opacity on
 *  the shared container — over stacked overlapping layers — forced Android into a saveLayerAlpha
 *  of the whole ~500px region EVERY scroll frame (#54 A): the edge-scroll slowdown. */
const GEAR_ALPHA = 0.26;

interface GearStackProps {
  rotation: SharedValue<number>;
  size: number;
}

export function GearStack({ rotation, size }: GearStackProps) {
  const height = size * (VB_H / VB_W);
  return (
    <View style={{ width: size, height }} pointerEvents="none">
      {LAYERS.map((layer, i) => (
        <GearLayer key={i} {...layer} rotation={rotation} size={size} height={height} />
      ))}
    </View>
  );
}

interface GearLayerProps extends Layer {
  rotation: SharedValue<number>;
  size: number;
  height: number;
}

function GearLayer({ src, origin, ratio, scale, rotation, size, height }: GearLayerProps) {
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * ratio}rad` }, { scale }],
  }));
  return (
    <Animated.View
      style={[{ position: 'absolute', left: 0, top: 0, width: size, height, transformOrigin: origin }, style]}
      renderToHardwareTextureAndroid
      shouldRasterizeIOS>
      <Image source={src} style={{ width: '100%', height: '100%', opacity: GEAR_ALPHA }} contentFit="contain" cachePolicy="memory-disk" transition={0} />
    </Animated.View>
  );
}
