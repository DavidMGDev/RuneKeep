import { View } from 'react-native';
import Svg, { Line, Polygon } from 'react-native-svg';

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

/**
 * A crisp, any-size CHAMFERED (45°-cut) panel outline — the project's signature shape (no rounded
 * corners). Provided SVG frames are used where they fit; this fills in for arbitrary wide panels.
 */
export function ChamferFrame({
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
      <Svg width={w} height={h}>
        <Polygon points={points} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="miter" />
      </Svg>
    </View>
  );
}

/** A thin gold hairline divider. */
export function GoldRule({ left, top, width, color = 'rgba(218,162,73,0.55)' }: { left: number; top: number; width: number; color?: string }) {
  return (
    <View style={box(left, top, width, 1.4)} pointerEvents="none">
      <Svg width={width} height={1.4}>
        <Line x1={0} y1={0.7} x2={width} y2={0.7} stroke={color} strokeWidth={1.4} />
      </Svg>
    </View>
  );
}
