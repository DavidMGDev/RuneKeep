import Svg, { ClipPath, Defs, Image as SvgImage, Path } from 'react-native-svg';

/**
 * An image clipped to a chamfered (45° cut corners) rectangle (#136) — so an uploaded photo follows
 * the same shape as its ChamferBox frame instead of square corners poking out. Sliced to cover.
 */
export function ChamferedImage({ uri, width, height, chamfer = 10 }: { uri: string; width: number; height: number; chamfer?: number }) {
  const c = chamfer;
  const d = `M ${c} 0 L ${width - c} 0 L ${width} ${c} L ${width} ${height - c} L ${width - c} ${height} L ${c} ${height} L 0 ${height - c} L 0 ${c} Z`;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <ClipPath id="rkChamferClip">
          <Path d={d} />
        </ClipPath>
      </Defs>
      <SvgImage href={{ uri }} x={0} y={0} width={width} height={height} preserveAspectRatio="xMidYMid slice" clipPath="url(#rkChamferClip)" />
    </Svg>
  );
}
