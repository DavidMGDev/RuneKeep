import { type ReactNode } from 'react';
import { View } from 'react-native';

import CardDividerSvg from '../../assets/art/cardElements/CardDivider.svg';
import InnerMaskSvg from '../../assets/art/cardElements/InnerMask.svg';

// Source geometry: divider viewBox 1979x151; the inner mask plaque is 1321x192 and, centered on
// the divider (owner: grow ~3px left / ~1px up at source scale), cuts the divider's center
// exactly. Whatever sits inside the mask's bounding box reads as content ON the plaque.
const DIV_AR = 1978.811 / 151.3009;
const MASK_W_FRAC = 1321.3586 / 1978.811;
const MASK_AR = 1321.3586 / 192.1075;

/**
 * The owner's ornamental card divider with its center plaque as a CONTENT SLOT: gold filigree
 * strip, the inner-mask silhouette laid over its center, children centered inside the mask's
 * bounding box. Used as the forged cards' 40/60 seam and as the app's section dividers.
 */
export function DividerPlaque({ width, maskFill = '#FAF8F2', maskScale = 0.525, children }: { width: number; maskFill?: string; maskScale?: number; children?: ReactNode }) {
  const h = width / DIV_AR;
  // maskScale 0.5 (owner-tuned): at full fraction the plaque overwhelmed the divider's center.
  const maskW = width * MASK_W_FRAC * maskScale;
  const maskH = maskW / MASK_AR;
  return (
    <View style={{ width, height: h, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', left: 0, top: 0, width, height: h }} pointerEvents="none">
        <CardDividerSvg width="100%" height="100%" preserveAspectRatio="none" />
      </View>
      <View style={{ width: maskW, height: maskH, marginTop: -maskH * 0.01, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', left: 0, top: 0, width: maskW, height: maskH }} pointerEvents="none">
          <InnerMaskSvg width="100%" height="100%" preserveAspectRatio="none" color={maskFill} />
        </View>
        {/* The mask's plaque BODY sits ~7.6% right of its own bounding box (a thin tail sweeps
            left); content centers on the body, not the box, or the label reads off-plaque. */}
        <View style={{ transform: [{ translateX: maskW * 0.076 }] }}>{children}</View>
      </View>
    </View>
  );
}
