import { StyleSheet } from 'react-native';
import Svg, { Path, Polyline } from 'react-native-svg';

import { Rune } from '@/constants/theme';

/**
 * The ENABLED corner (#175): a pre-baked SVG triangle filling the lower-left corner of a card with a
 * white checkmark, overlaid on any card the player has toggled on. It is an overlay (not baked into
 * the forged card bitmap) because the enabled state is dynamic. Drawn at the card's authoring size so
 * it scales with the slot transform like the card art does.
 */
export function EnabledCorner({ width, height }: { width: number; height: number }) {
  const leg = Math.round(width * 0.32); // triangle leg along each edge from the corner
  const s = leg / 64; // check scales with the triangle
  // Check centroid, biased toward the corner so it sits inside the triangle's mass.
  const cx = leg * 0.34;
  const cy = height - leg * 0.34;
  const check = `${cx - 11 * s},${cy + 1 * s} ${cx - 3 * s},${cy + 9 * s} ${cx + 12 * s},${cy - 9 * s}`;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* the filled corner triangle (heraldic red), with a soft gold hypotenuse edge */}
      <Path d={`M 0 ${height} L ${leg} ${height} L 0 ${height - leg} Z`} fill={Rune.red} />
      <Path d={`M ${leg} ${height} L 0 ${height - leg}`} stroke={Rune.goldEdge} strokeWidth={2.4 * s} strokeLinecap="round" />
      {/* white checkmark */}
      <Polyline points={check} fill="none" stroke={Rune.ivory} strokeWidth={4.4 * s} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
