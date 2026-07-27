import { memo, type ReactNode, useMemo, useState } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

/**
 * A flex-layout chamfered panel: measures itself and draws the 45°-cut outline/fill behind its
 * children. The dp-world sibling of the sheet's design-px `ChamferFrame` — use this on the
 * non-sheet screens where sizes come from flexbox, not the 412x892 stage.
 *
 * PERF (#328): memoized + the polygon points are memoized, so a parent re-render with unchanged props
 * doesn't rebuild/repaint the SVG. The chamfer stays an SVG <Polygon> — a 45° mitered fill/stroke
 * isn't faithfully reproducible with plain Views (border-trick triangles can't draw the diagonal
 * stroke), so converting it would change the look. (Fill-only design-px frames use ChamferFrame's
 * plain-View path; this dp-world box keeps the SVG for its stroked corners.)
 */
/**
 * The 45°-cut octagon for a `w × h` box, inset by half the stroke so the outer half-stroke doesn't
 * land outside the svg (#104). Exported so anything that needs to PAINT the same silhouette (the
 * hold-to-confirm fill) matches the box it sits in instead of squaring off its corners.
 */
export function chamferPoints(w: number, h: number, c: number, strokeWidth = 0): string {
  const i = strokeWidth / 2 + 0.25;
  const r = w - i;
  const b = h - i;
  return `${c + i},${i} ${r - c},${i} ${r},${c + i} ${r},${b - c} ${r - c},${b} ${c + i},${b} ${i},${b - c} ${i},${c + i}`;
}

function ChamferBoxImpl({
  chamfer = 10,
  stroke = 'transparent',
  strokeWidth = 1.4,
  fill = 'transparent',
  style,
  children,
}: {
  chamfer?: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const c = chamfer;
  // The polygon is INSET by half the stroke: drawn on the exact edge, the outer stroke half lands
  // outside the svg and the right/bottom lines vanish on device (#104). Memoized so re-renders that
  // don't change size/chamfer/stroke don't rebuild the (byte-identical) points string.
  const points = useMemo(() => (size ? chamferPoints(size.w, size.h, c, strokeWidth) : ''), [size, c, strokeWidth]);
  return (
    <View style={style} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size && size.w > 2 * c && size.h > 2 * c ? (
        <View style={{ position: 'absolute', left: 0, top: 0, width: size.w, height: size.h }} pointerEvents="none">
          <Svg width={size.w} height={size.h}>
            <Polygon points={points} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="miter" />
          </Svg>
        </View>
      ) : null}
      {children}
    </View>
  );
}

export const ChamferBox = memo(ChamferBoxImpl);
