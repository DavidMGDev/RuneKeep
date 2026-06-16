import { type FC } from 'react';
import { View } from 'react-native';
import { type SvgProps } from 'react-native-svg';

import { box } from '@/lib/design';
import ChamferPanel from '../../../../assets/art/new/image.svg';
import HpBar from '../../../../assets/art/new/image-2.svg';
import Octagon from '../../../../assets/art/new/image-6.svg';
import Sunburst from '../../../../assets/art/new/image-7.svg';
import SideL from '../../../../assets/art/new/image-8.svg';
import SideR from '../../../../assets/art/new/image-9.svg';
import ArmorBg from '../../../../assets/art/new/image-11.svg';

export const FrameSvg = { ChamferPanel, HpBar, Octagon, Sunburst, SideL, SideR, ArmorBg };

interface ProvidedFrameProps {
  Svg: FC<SvgProps>;
  left: number;
  top: number;
  w: number;
  h: number;
  /** Stretch to fill (preserveAspectRatio none) — for frames that must match a box. */
  stretch?: boolean;
  opacity?: number;
}

/** Render one of the owner's provided SVG frames at a design-px box. */
export function ProvidedFrame({ Svg, left, top, w, h, stretch = true, opacity }: ProvidedFrameProps) {
  return (
    <View style={[box(left, top, w, h), opacity != null ? { opacity } : null]} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio={stretch ? 'none' : 'xMidYMid meet'} />
    </View>
  );
}
