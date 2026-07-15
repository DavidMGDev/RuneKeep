import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { Rune } from '@/constants/theme';
import { box } from '@/lib/design';
import { ArtImage } from '@/components/art-image';
import { Art } from '../art';
import { useCarousel } from '../carousel-context';

// v0.11.1: grayscale twin of the gold border, crossfaded in for the Edit Mode desaturation (item 2).
const BORDER_GRAY = require('../../../../assets/art/longborder-gray.webp');

/** The parchment sheet behind everything (rounded so the gold frame's corners read). */
export function SheetBackground() {
  return <View style={[box(0, 0, 412, 892), { backgroundColor: Rune.sheet, borderRadius: 30 }]} />;
}

/**
 * The gold ornamental border. It is a FULL-BLEED overlay (not inside the design stage): the art is
 * stretched edge-to-edge so its gold line hugs the safe area, leaving no dark margin for the
 * card hand to float over (owner feedback #1). The card hand is clipped to the design box, so it
 * always sits BEHIND this frame. It never invades the status bar (#43 A) — the inset strip above
 * is painted by the root's ink background.
 *
 * While a card is focused the border dims WITH the veil (#95 A): the frame draws above the dim (it
 * is outside the stage), so without this it stayed full-bright and boxed the focused card in. The
 * alpha mirrors the veil's 0.82 dim and lands back at exactly 1 at rest (integer-alpha rule); the
 * frame is a single image leaf, so the transient fractional alpha never forces a saveLayer.
 */
export function SheetFrame() {
  const { fullscreenProgress, desat } = useCarousel();
  const dim = useAnimatedStyle(() => ({ opacity: 1 - fullscreenProgress.value * 0.82 }));
  // v0.11.1 item 2: the gold border fades to its desaturated (light-gray) twin while editing.
  const gray = useAnimatedStyle(() => ({ opacity: desat.value }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, dim]} pointerEvents="none">
      <ArtImage source={Art.longBorder} fit="fill" style={StyleSheet.absoluteFill} />
      <Animated.View style={[StyleSheet.absoluteFill, gray]} pointerEvents="none">
        <Image source={BORDER_GRAY} style={StyleSheet.absoluteFill} contentFit="fill" cachePolicy="memory-disk" transition={0} />
      </Animated.View>
    </Animated.View>
  );
}
