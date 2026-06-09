import { type ReactNode, useState } from 'react';
import { type LayoutChangeEvent, type StyleProp, View, type ViewStyle } from 'react-native';

import { computeStageScale, type StageFit } from '@/lib/stage-scale';

interface DesignStageProps {
  /** Width the children are authored at, in design pixels. */
  designWidth: number;
  /** Height the children are authored at, in design pixels. */
  designHeight: number;
  /** `contain` (default) letterboxes within the frame; `cover` fills and clips. */
  fit?: StageFit;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/**
 * Renders children authored in a fixed design coordinate space, uniformly scaled to fit the
 * available area and centered (see docs/adr/0001). Children use absolute design-px positioning;
 * the single `scale` transform keeps everything proportional — non-panel art never stretches.
 */
export function DesignStage({
  designWidth,
  designHeight,
  fit = 'contain',
  style,
  children,
}: DesignStageProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  };

  const { scale, offsetX, offsetY } = computeStageScale({
    availW: size.w,
    availH: size.h,
    designW: designWidth,
    designH: designHeight,
    fit,
  });

  return (
    <View style={[{ flex: 1, overflow: 'hidden' }, style]} onLayout={onLayout}>
      {size.w > 0 && scale > 0 && (
        <View
          style={{
            position: 'absolute',
            left: offsetX,
            top: offsetY,
            width: designWidth,
            height: designHeight,
            transform: [{ scale }],
            transformOrigin: [0, 0, 0],
          }}>
          {children}
        </View>
      )}
    </View>
  );
}
