import { Image } from 'expo-image';
import { View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

const U2 = require('../../../../assets/art/gears/raster/U2.png');
const U3 = require('../../../../assets/art/gears/raster/U3.png');

// The U-parts pre-rasterized in a shared union viewBox (so they composite concentrically) on a
// transparent background. Rotating a flat image is GPU-cheap — far smoother on device than animating
// live SVGs. Each layer pivots around its OWN measured centroid (pixel center of mass), so every
// part spins truly in place; they share one direction and differ only in speed.
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
  /** The INNER gear is the live control (#62 D): it brightens to full opacity as the hand expands.
   *  The outer ring is pure decoration and stays at the resting alpha. */
  inner?: boolean;
}

// Only the two INNER rings (#54 C); U3 (smallest) is the interactive one.
const LAYERS: Layer[] = [
  { src: U2, origin: ['50.0%', '47.5%', 0], ratio: 0.62, scale: 0.74 },
  { src: U3, origin: ['50.1%', '48.7%', 0], ratio: 1.45, scale: 0.52, inner: true },
];

/** Resting translucency. Lives on each LAYER (single image child → plain paint alpha) — a
 *  fractional opacity on the shared container forced a saveLayerAlpha per scroll frame (#54 A). */
const GEAR_ALPHA = 0.26;

interface GearStackProps {
  rotation: SharedValue<number>;
  /** Hand expansion (0..1) — drives the inner gear's brightness (#62 D). */
  expandProgress: SharedValue<number>;
  size: number;
}

export function GearStack({ rotation, expandProgress, size }: GearStackProps) {
  const height = size * (VB_H / VB_W);
  return (
    <View style={{ width: size, height }} pointerEvents="none">
      {LAYERS.map((layer, i) => (
        <GearLayer key={i} {...layer} rotation={rotation} expandProgress={expandProgress} size={size} height={height} />
      ))}
    </View>
  );
}

interface GearLayerProps extends Layer {
  rotation: SharedValue<number>;
  expandProgress: SharedValue<number>;
  size: number;
  height: number;
}

function GearLayer({ src, origin, ratio, scale, inner, rotation, expandProgress, size, height }: GearLayerProps) {
  // Rotate + scale + alpha are all composite-only on the hw-textured layer — no texture invalidation.
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * ratio}rad` }, { scale }],
    opacity: inner ? GEAR_ALPHA + (1 - GEAR_ALPHA) * expandProgress.value : GEAR_ALPHA,
  }));
  return (
    <Animated.View
      style={[{ position: 'absolute', left: 0, top: 0, width: size, height, transformOrigin: origin }, style]}
      renderToHardwareTextureAndroid
      shouldRasterizeIOS>
      <Image source={src} style={{ width: '100%', height: '100%' }} contentFit="contain" cachePolicy="memory-disk" transition={0} />
    </Animated.View>
  );
}
