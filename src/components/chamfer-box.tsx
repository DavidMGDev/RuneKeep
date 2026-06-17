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
  const points = useMemo(() => {
    if (!size) return '';
    const i = strokeWidth / 2 + 0.25;
    const w = size.w - i;
    const h = size.h - i;
    return `${c + i},${i} ${w - c},${i} ${w},${c + i} ${w},${h - c} ${w - c},${h} ${c + i},${h} ${i},${h - c} ${i},${c + i}`;
  }, [size, c, strokeWidth]);
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
