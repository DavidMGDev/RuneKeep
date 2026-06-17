import { StyleSheet } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { STRIKE_X0, STRIKE_X1, strikeLines } from '@/data/ancestry-trait-regions';

/**
 * The mixed-ancestry CROSS-OUT (#265/#276 item 3): a BLACK strikethrough on each line of the trait the
 * player did NOT take. Like EnabledCorner, it's an overlay drawn at the card's authoring size — NOT
 * baked into the bitmap — so it rides the slot transform and follows the card through every carousel
 * animation. Line positions are the owner-measured per-line marks; no dim, no red.
 */
export function TraitCrossOut({ width, height, catalogId, crossedTrait }: { width: number; height: number; catalogId: string; crossedTrait: 1 | 2 }) {
  const lines = strikeLines(catalogId, crossedTrait);
  if (!lines.length) return null;
  const sw = Math.max(2, height * 0.0055);
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      {lines.map((y, i) => (
        <Line key={i} x1={width * STRIKE_X0} y1={y * height} x2={width * STRIKE_X1} y2={y * height} stroke="#0A0A0A" strokeWidth={sw} strokeLinecap="round" />
      ))}
    </Svg>
  );
}
