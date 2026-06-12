import Svg, { ClipPath, Defs, Image as SvgImage, Path } from 'react-native-svg';

/**
 * The player's portrait, clipped to the chamfered portrait shape (#135). The path is the owner's
 * assets/art/new/portraitMask.svg (viewBox 1235x2048) used as a clip mask; the image is sliced to
 * cover. The Svg stretches (preserveAspectRatio none) to the frame box, so the clip lines up with
 * the gold portrait frame drawn on top of it (the frame borders the image; the mask keeps the photo
 * inside the silhouette).
 */
const MASK_D =
  'M 523 0 L 1071.58 0 L 1174.13 99.8672 C 1193.16 118.282 1217.07 140.225 1235 159.18 L 1235 1604.18 L 804.343 2028.14 C 773.033 1996.58 741.323 1962.05 710.659 1929.68 L 540.106 1749.76 L 346.497 1948.27 C 314.62 1980.88 281.524 2016.05 248.963 2047.76 C 247.855 2022.55 247.991 1996.48 247.814 1971.19 L 0 1733.46 L 0 1264.4 C 0.895821 1258.93 0.651396 1240.09 0.668063 1233.99 L 0.774892 1173.06 L 0.948075 956.603 L 1.75673 165.722 C 10.2044 157.358 19.3047 148.621 28.1188 140.68 C 78.7238 95.0916 127.354 45.9589 178.355 0.92053 L 417.469 0.715848 L 486.705 0.708553 C 494.934 0.708394 515.683 1.1075 523 0 z';

export function PortraitImage({ uri, width, height }: { uri: string; width: number; height: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 1235 2048" preserveAspectRatio="none">
      <Defs>
        <ClipPath id="rkPortraitClip">
          <Path d={MASK_D} />
        </ClipPath>
      </Defs>
      <SvgImage href={{ uri }} x={0} y={0} width={1235} height={2048} preserveAspectRatio="xMidYMid slice" clipPath="url(#rkPortraitClip)" />
    </Svg>
  );
}
