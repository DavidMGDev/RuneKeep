import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Rune } from '@/constants/theme';

/**
 * What the corner is SAYING, which is not always "equipped" (v0.32.0).
 *
 *  - `on`        the ordinary equipped card: heraldic red.
 *  - `permanent` the card grants something you keep whether it is equipped or not (Vitality). Marking
 *                it in red said "equipped", which is the one thing it is not: the card's own text
 *                tells you to put it in your vault and keep the benefit. Deep bronze, the app's
 *                colour for something granted rather than something worn — and dark enough that the
 *                white check and the gold hypotenuse still read against it, which a brighter gold
 *                would have swallowed.
 *  - `muted`     equipped and counting against your loadout, but its modifiers are switched off
 *                (the domain-card Toggle). The check stays, because the card IS equipped; the colour
 *                goes grey, because nothing of it is being applied.
 */
export type CornerTone = 'on' | 'permanent' | 'muted';

const TONE_FILL: Record<CornerTone, string> = {
  on: Rune.red,
  permanent: Rune.bronze,
  muted: '#6C737E',
};

/**
 * The ENABLED corner (#175 / #239 item 1): a triangle filling the TOP-RIGHT corner of a card with a
 * white checkmark and a soft gold hypotenuse edge, overlaid on any card the player has toggled on.
 * It is an overlay (not baked into the forged card bitmap) because the enabled state is dynamic, and it
 * rides the slot transform so it scales with the card art.
 *
 * PERF (#328): drawn with PLAIN VIEWS (solid-colour composites + a border-trick triangle), NOT an
 * react-native-svg canvas. One <Svg> per enabled card composited per frame under the float-menu dim
 * tanked decorated decks to ~3 FPS, scaling with the enabled-card count (same class of bug the token
 * layer hit in #297). Plain Views are the cheapest primitive — no offscreen saveLayer — so the corner
 * can stay on EVERY slot at near-zero cost. Memoized: shape depends only on width/height/tone.
 */
export const EnabledCorner = memo(function EnabledCorner({ width, height, tone = 'on' }: { width: number; height: number; tone?: CornerTone }) {
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
  /**
   * v0.32.0: the two bars OVERLAP at the vertex instead of stopping on it.
   *
   * The reported "the bottom of the check is cut off" was neither cut nor too big: each bar is a
   * rounded-cap rectangle centred on its own segment, and the two caps meeting at B bulge in
   * different directions, leaving a notch exactly where the check should come to a point. Running
   * each bar half a stroke-width PAST B fills it, which is what a real stroke join does.
   */
  const seg = (x1: number, y1: number, x2: number, y2: number, growStart = 0, growEnd = 0) => {
    const raw = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ux = (x2 - x1) / raw, uy = (y2 - y1) / raw;
    const sx = x1 - ux * growStart, sy = y1 - uy * growStart;
    const ex = x2 + ux * growEnd, ey = y2 + uy * growEnd;
    const len = Math.hypot(ex - sx, ey - sy);
    const mx = (sx + ex) / 2, my = (sy + ey) / 2;
    const deg = (Math.atan2(ey - sy, ex - sx) * 180) / Math.PI;
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
      {/* filled corner triangle via the border trick: right angle at the top-right corner,
          hypotenuse from (width-leg,0) to (width,leg) — identical to the old SVG path. */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 0,
          height: 0,
          borderTopWidth: leg,
          borderTopColor: TONE_FILL[tone],
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
      {/* white checkmark (two bars, overlapping at the vertex) */}
      <View style={seg(ax, ay, bx, by, 0, checkW / 2)} />
      <View style={seg(bx, by, dx, dy, checkW / 2, 0)} />
    </View>
  );
});
