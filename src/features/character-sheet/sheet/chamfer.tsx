import { memo } from 'react';
import { View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

import { box } from '@/lib/design';

interface ChamferFrameProps {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Corner cut size (45°). */
  chamfer?: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  /** Which corners to chamfer. Defaults to all four. */
  corners?: { tl?: boolean; tr?: boolean; br?: boolean; bl?: boolean };
}

const isNone = (c?: string) => !c || c === 'none' || c === 'transparent';

/**
 * A borderless (fill-only) chamfered octagon drawn with PLAIN VIEWS (#328) — the cheapest primitive,
 * no react-native-svg canvas. Two overlapping rects form the plus-shaped body (covering the straight
 * top/bottom/left/right edges); four border-trick triangles in the FILL colour fill the kept inner
 * half of each 45° corner cut. The 8 vertices are identical to the SVG <Polygon> octagon, the pieces
 * abut on the axis-aligned lines x=c / y=c (no seam), and the corner fills are background-INDEPENDENT
 * (additive, never a bg-coloured knockout) — so it's pixel-faithful over art/gradients/dim veils and
 * scales cleanly with its slot. Used for the many static stress pips / chips / sheet ground that were
 * each a live SVG canvas compositing under the float-menu + expand dims.
 */
function ViewChamferFill({ w, h, c, fill }: { w: number; h: number; c: number; fill: string }) {
  return (
    <>
      {/* plus-shaped body: full-width middle band + full-height middle band (overlap is invisible) */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: c, bottom: c, backgroundColor: fill }} />
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: c, right: c, backgroundColor: fill }} />
      {/* four corner triangles (border trick) filling the inner half of each cut, in the fill colour */}
      <View style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0, borderTopWidth: c, borderTopColor: 'transparent', borderRightWidth: c, borderRightColor: fill }} />
      <View style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderTopWidth: c, borderTopColor: 'transparent', borderLeftWidth: c, borderLeftColor: fill }} />
      <View style={{ position: 'absolute', bottom: 0, left: 0, width: 0, height: 0, borderBottomWidth: c, borderBottomColor: 'transparent', borderRightWidth: c, borderRightColor: fill }} />
      <View style={{ position: 'absolute', bottom: 0, right: 0, width: 0, height: 0, borderBottomWidth: c, borderBottomColor: 'transparent', borderLeftWidth: c, borderLeftColor: fill }} />
    </>
  );
}

/**
 * A crisp, any-size CHAMFERED (45°-cut) panel outline — the project's signature shape (no rounded
 * corners). Provided SVG frames are used where they fit; this fills in for arbitrary wide panels.
 *
 * PERF (#328): a FILL-ONLY, all-four-corner chamfer renders as plain Views (see ViewChamferFill) —
 * no SVG canvas. A STROKED chamfer keeps the SVG: a diagonal mitered hairline isn't View-faithful.
 */
export const ChamferFrame = memo(function ChamferFrame({
  left,
  top,
  width: w,
  height: h,
  chamfer = 11,
  stroke = '#DAA249',
  strokeWidth = 1.4,
  fill = 'none',
  corners,
}: ChamferFrameProps) {
  const c = chamfer;
  const tl = corners?.tl ?? true;
  const tr = corners?.tr ?? true;
  const br = corners?.br ?? true;
  const bl = corners?.bl ?? true;
  // Fill-only + all four corners + room for the cuts → cheap plain-View octagon (pixel-faithful).
  if (!isNone(fill) && (isNone(stroke) || strokeWidth <= 0) && tl && tr && br && bl && w > 2 * c && h > 2 * c) {
    return (
      <View style={box(left, top, w, h)} pointerEvents="none">
        <ViewChamferFill w={w} h={h} c={c} fill={fill} />
      </View>
    );
  }
  const pts: [number, number][] = [];
  // top edge
  pts.push(tl ? [c, 0] : [0, 0]);
  pts.push(tr ? [w - c, 0] : [w, 0]);
  if (tr) pts.push([w, c]);
  // right edge
  pts.push(br ? [w, h - c] : [w, h]);
  if (br) pts.push([w - c, h]);
  // bottom edge
  pts.push(bl ? [c, h] : [0, h]);
  if (bl) pts.push([0, h - c]);
  // left edge back to start
  if (tl) pts.push([0, c]);
  const points = pts.map((p) => p.join(',')).join(' ');

  return (
    <View style={box(left, top, w, h)} pointerEvents="none">
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <Polygon points={points} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="miter" />
      </Svg>
    </View>
  );
});

/** A thin gold hairline divider. PERF (#328): a plain View, not an SVG <Line> (a 0-feather stroke is
 *  a solid rect). The line is painted at `thickness`, centred in the box, so thin lines stay thin. */
export const GoldRule = memo(function GoldRule({ left, top, width, color = 'rgba(218,162,73,0.55)', thickness = 1.4 }: { left: number; top: number; width: number; color?: string; thickness?: number }) {
  const h = Math.max(thickness, 1.5);
  return (
    <View style={box(left, top, width, h)} pointerEvents="none">
      <View style={{ position: 'absolute', left: 0, top: (h - thickness) / 2, width, height: thickness, backgroundColor: color }} />
    </View>
  );
});

/** A vertical gold hairline (separator). PERF (#328): a plain View, not an SVG <Line>. */
export const GoldRuleV = memo(function GoldRuleV({ left, top, height, color = 'rgba(218,162,73,0.45)', thickness = 1.2 }: { left: number; top: number; height: number; color?: string; thickness?: number }) {
  const w = Math.max(thickness, 1.5);
  return (
    <View style={box(left, top, w, height)} pointerEvents="none">
      <View style={{ position: 'absolute', top: 0, left: (w - thickness) / 2, width: thickness, height, backgroundColor: color }} />
    </View>
  );
});
