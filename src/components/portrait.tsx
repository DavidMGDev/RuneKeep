/**
 * One portrait, everywhere (v0.36.1, owner).
 *
 * Every list in the app framed a portrait in a ChamferBox and then drew a SQUARE image over it. The
 * frame was never visible, so nothing looked wrong until something moved: the party sheet's roster
 * tile dims on press, and dimming the image uncovered four chamfered corners of frame that had been
 * hiding under it the whole time. Square corners are also simply not the app's language, which uses
 * a 45 degree cut on every panel, button and card.
 *
 * So the image is clipped to the same chamfer as its frame, and the two are one shape. Consolidating
 * the five near-identical local copies into this is what makes it a global fix rather than five.
 *
 * The clip is an SVG path, which is the mechanism `ChamferedImage` has used for the creator's
 * portrait well since #136. It needs a per-instance id: two of these on screen with the same
 * `clipPath` id is a collision, and the browser build resolves such an id to whichever came first.
 */
import { useId } from 'react';
import { type ViewStyle, View } from 'react-native';
import Svg, { ClipPath, Defs, Image as SvgImage, Path, Polygon } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';

/** The chamfered rectangle, as a path, for an image of this size. */
export function chamferPath(width: number, height: number, c: number): string {
  return `M ${c} 0 L ${width - c} 0 L ${width} ${c} L ${width} ${height - c} L ${width - c} ${height} L ${c} ${height} L 0 ${height - c} L 0 ${c} Z`;
}

export function Portrait({
  uri,
  size = 46,
  chamfer = 6,
  tint,
  fill,
  glyph,
  style,
}: {
  uri?: string | null;
  size?: number;
  chamfer?: number;
  /** The frame's stroke. */
  tint: string;
  /** The frame's fill, seen behind a portrait that is not there. */
  fill: string;
  /** Drawn when there is no portrait. Falls back to a plain hexagon outline in the tint. */
  glyph?: React.ReactNode;
  style?: ViewStyle;
}) {
  // `useId` gives a value stable across renders and unique per instance, which is exactly what a
  // clip-path id has to be. It contains colons, which are legal in an SVG id but not in a CSS
  // selector, so they are stripped.
  const clip = `rk-portrait-${useId().replace(/:/g, '')}`;
  return (
    <ChamferBox
      chamfer={chamfer}
      fill={fill}
      stroke={tint}
      strokeWidth={1.3}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...style }}>
      {uri ? (
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Defs>
            <ClipPath id={clip}>
              <Path d={chamferPath(size, size, chamfer)} />
            </ClipPath>
          </Defs>
          <SvgImage href={{ uri }} x={0} y={0} width={size} height={size} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
        </Svg>
      ) : (
        glyph ?? (
          <Svg width={size * 0.44} height={size * 0.44} viewBox="0 0 26 26">
            <Polygon points="13,2 23,12 23,14 13,24 3,14 3,12" fill="none" stroke={tint} strokeWidth={1.6} />
          </Svg>
        )
      )}
    </ChamferBox>
  );
}

/** Grey and darken a portrait without touching its shape, for a character who is down. */
export function DownedVeil({ size, chamfer = 6 }: { size: number; chamfer?: number }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Path d={chamferPath(size, size, chamfer)} fill="rgba(11,14,19,0.55)" />
      </Svg>
    </View>
  );
}
