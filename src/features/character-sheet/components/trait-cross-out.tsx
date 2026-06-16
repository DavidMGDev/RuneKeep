import { StyleSheet } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { Rune } from '@/constants/theme';
import { crossOutBand } from '@/features/cards/ancestry-trait-regions';

/**
 * The mixed-ancestry CROSS-OUT (#265): strikes through the trait the player did NOT take on an ancestry
 * card. Like EnabledCorner, it's an overlay drawn at the card's authoring size — NOT baked into the
 * bitmap — so it rides the slot transform and follows the card through every carousel animation. A
 * darkened band + bold red strike-throughs read as "this half is crossed out".
 */
export function TraitCrossOut({ width, height, catalogId, crossedTrait }: { width: number; height: number; catalogId: string; crossedTrait: 1 | 2 }) {
  const { top, bottom } = crossOutBand(catalogId, crossedTrait);
  const y0 = top * height;
  const y1 = bottom * height;
  const x0 = width * 0.1;
  const x1 = width * 0.9;
  const STRIKES = 3;
  const sw = Math.max(2, width * 0.016);
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="rgba(8,10,15,0.5)" rx={width * 0.02} />
      {Array.from({ length: STRIKES }, (_, i) => {
        const y = y0 + ((i + 1) / (STRIKES + 1)) * (y1 - y0);
        return <Line key={i} x1={x0} y1={y} x2={x1} y2={y} stroke={Rune.red} strokeWidth={sw} strokeLinecap="round" opacity={0.92} />;
      })}
    </Svg>
  );
}
