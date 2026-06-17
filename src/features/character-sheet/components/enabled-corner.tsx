import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Rune } from '@/constants/theme';

/**
 * The ENABLED corner (#175 / #239 item 1): a red triangle filling the TOP-RIGHT corner of a card with
 * a white checkmark and a soft gold hypotenuse edge, overlaid on any card the player has toggled on.
 * It is an overlay (not baked into the forged card bitmap) because the enabled state is dynamic, and it
 * rides the slot transform so it scales with the card art.
 *
 * PERF (#328): drawn with PLAIN VIEWS (solid-colour composites + a border-trick triangle), NOT an
 * react-native-svg canvas. One <Svg> per enabled card composited per frame under the float-menu dim
 * tanked decorated decks to ~3 FPS, scaling with the enabled-card count (same class of bug the token
 * layer hit in #297). Plain Views are the cheapest primitive — no offscreen saveLayer — so the corner
 * can stay on EVERY slot at near-zero cost. Geometry matches the old SVG exactly (same leg, edge, and
 * checkmark points), so it is pixel-faithful. Memoized: shape depends only on width/height.
 */
export const EnabledCorner = memo(function EnabledCorner({ width, height }: { width: number; height: number }) {
  const leg = Math.round(width * 0.21); // triangle leg (#201: ~35% smaller than the old 0.32)
  const s = (leg / 64) * 0.7; // check scale (matches the old proportional size)
  // Check centroid, biased toward the top-right corner so it sits inside the smaller triangle's mass.
  const cx = width - leg * 0.34;
  const cy = leg * 0.34;
  // Old SVG polyline points (kept verbatim) — A→B→C form the checkmark.
  const ax = cx - 9 * s, ay = cy + 0.5 * s;
  const bx = cx - 2.5 * s, by = cy + 7 * s;
  const dx = cx + 10 * s, dy = cy - 7.5 * s;
  const checkW = 4.2 * s; // stroke width
  // One bar per segment: width = segment length, rotated to the segment angle about its centre.
  const seg = (x1: number, y1: number, x2: number, y2: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const deg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    return {
      position: 'absolute' as const,
      left: mx - len / 2,
      top: my - checkW / 2,
      width: len,
      height: checkW,
      borderRadius: checkW / 2, // round caps, like the SVG strokeLinecap="round"
      backgroundColor: Rune.ivory,
      transform: [{ rotate: `${deg}deg` }],
    };
  };
  // Gold hypotenuse edge: a thin bar along (width-leg,0)→(width,leg), a 45° diagonal.
  const edgeW = 2.2 * s;
  const hyp = leg * Math.SQRT2;
  const emx = width - leg / 2, emy = leg / 2;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* filled corner triangle (heraldic red) via the border trick: right angle at the top-right
          corner, hypotenuse from (width-leg,0) to (width,leg) — identical to the old SVG path. */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 0,
          height: 0,
          borderTopWidth: leg,
          borderTopColor: Rune.red,
          borderLeftWidth: leg,
          borderLeftColor: 'transparent',
        }}
      />
      {/* soft gold hypotenuse edge */}
      <View
        style={{
          position: 'absolute',
          left: emx - hyp / 2,
          top: emy - edgeW / 2,
          width: hyp,
          height: edgeW,
          borderRadius: edgeW / 2,
          backgroundColor: Rune.goldEdge,
          transform: [{ rotate: '45deg' }],
        }}
      />
      {/* white checkmark (two bars) */}
      <View style={seg(ax, ay, bx, by)} />
      <View style={seg(bx, by, dx, dy)} />
    </View>
  );
});
