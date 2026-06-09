import { type FC } from 'react';
import { View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { type SvgProps } from 'react-native-svg';

import U1 from '../../../../assets/art/gears/U1-MainDash.svg';
import U2 from '../../../../assets/art/gears/U2-Outspike.svg';
import U3 from '../../../../assets/art/gears/U3-InnerSymbols.svg';
import U4 from '../../../../assets/art/gears/U4-Innercardinal.svg';

/**
 * Union viewBox covering all four U-parts so they composite CONCENTRICALLY (each part's own viewBox
 * differs slightly; forcing a shared one aligns them on one axis). Each layer then rotates around the
 * shared box center via a CSS transform — cheap on the New Arch (the SVG content is static).
 */
const VIEWBOX = '83.38 57.19 1848.75 1830.17';
const VB_W = 1848.75;
const VB_H = 1830.17;

interface Layer {
  Svg: FC<SvgProps>;
  /** Gear ratio off the shared rotation: >1 faster, <0 counter-rotates (a real gear train). */
  ratio: number;
}

// Paint order: U1 (main dash) at the bottom → U4 (inner cardinal) on top.
const LAYERS: Layer[] = [
  { Svg: U1, ratio: 1.0 },
  { Svg: U2, ratio: -0.55 },
  { Svg: U3, ratio: 1.7 },
  { Svg: U4, ratio: 0.32 },
];

interface GearStackProps {
  rotation: SharedValue<number>;
  /** On-screen width (design px). Height follows the union aspect. */
  size: number;
}

export function GearStack({ rotation, size }: GearStackProps) {
  const height = size * (VB_H / VB_W);
  return (
    <View style={{ width: size, height }} pointerEvents="none">
      {LAYERS.map((layer, i) => (
        <GearLayer key={i} Svg={layer.Svg} ratio={layer.ratio} rotation={rotation} size={size} height={height} />
      ))}
    </View>
  );
}

interface GearLayerProps extends Layer {
  rotation: SharedValue<number>;
  size: number;
  height: number;
}

function GearLayer({ Svg, ratio, rotation, size, height }: GearLayerProps) {
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * ratio}rad` }],
  }));
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size, height }, style]}>
      <Svg width={size} height={height} viewBox={VIEWBOX} preserveAspectRatio="xMidYMid meet" />
    </Animated.View>
  );
}
