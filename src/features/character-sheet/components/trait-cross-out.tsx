import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { STRIKE_X0, STRIKE_X1, strikeLines } from '@/data/ancestry-trait-regions';

/**
 * The mixed-ancestry CROSS-OUT (#265/#276 item 3): a BLACK strikethrough on each line of the trait the
 * player did NOT take. Like EnabledCorner, it's an overlay drawn at the card's authoring size — NOT
 * baked into the bitmap — so it rides the slot transform and follows the card through every carousel
 * animation. Line positions are the owner-measured per-line marks; no dim, no red.
 *
 * PERF (#328): drawn with PLAIN VIEWS (solid-colour bars), NOT an react-native-svg canvas — same reason
 * as EnabledCorner (one composited SVG per overlaid card under the float-menu dim tanked framerate).
 * The strikes are horizontal lines, so a rounded-cap <View> bar per line is pixel-faithful to the old
 * SVG <Line> (same x-range, y, stroke width, round caps). Memoized on its props.
 */
export const TraitCrossOut = memo(function TraitCrossOut({ width, height, catalogId, crossedTrait }: { width: number; height: number; catalogId: string; crossedTrait: 1 | 2 }) {
  const lines = strikeLines(catalogId, crossedTrait);
  if (!lines.length) return null;
  const sw = Math.max(2, height * 0.0055);
  const left = width * STRIKE_X0;
  const w = width * (STRIKE_X1 - STRIKE_X0);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {lines.map((y, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left,
            top: y * height - sw / 2,
            width: w,
            height: sw,
            borderRadius: sw / 2, // round caps, like the SVG strokeLinecap="round"
            backgroundColor: '#0A0A0A',
          }}
        />
      ))}
    </View>
  );
});
