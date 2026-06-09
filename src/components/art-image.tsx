import { Image, type ImageContentFit, type ImageStyle } from 'expo-image';
import { type StyleProp } from 'react-native';

interface ArtImageProps {
  /** A `require(...)`d PNG/asset. */
  source: number;
  /**
   * `contain` (default) preserves aspect ratio — use for icons, emblems, banners so they never
   * distort. `fill` allows stretch — only for panel backgrounds / outlines (see ADR 0001).
   */
  fit?: ImageContentFit;
  style?: StyleProp<ImageStyle>;
  /** Hint expo-image how to scale; defaults tuned for crisp downscaled art. */
  recyclingKey?: string;
  /** Recolor the (non-transparent) art to a single color — used to retint solid red pips. */
  tint?: string;
}

/** Thin expo-image wrapper that fills its parent box and defaults to a non-distorting fit. */
export function ArtImage({ source, fit = 'contain', style, recyclingKey, tint }: ArtImageProps) {
  return (
    <Image
      source={source}
      contentFit={fit}
      tintColor={tint}
      style={[{ width: '100%', height: '100%' }, style]}
      recyclingKey={recyclingKey}
      // Cache decoded art (source PNGs are oversized) so re-renders don't re-decode.
      cachePolicy="memory-disk"
      // Local bundled art; no fade keeps the composition snappy.
      transition={0}
    />
  );
}
