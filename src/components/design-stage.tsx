import { type ReactNode, useEffect, useState } from 'react';
import { type LayoutChangeEvent, type StyleProp, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { computeStageScale, type StageFit } from '@/lib/stage-scale';

interface DesignStageProps {
  /** Width the children are authored at, in design pixels. */
  designWidth: number;
  /** Height the children are authored at, in design pixels. */
  designHeight: number;
  /** `contain` (default) letterboxes within the frame; `cover` fills and clips. */
  fit?: StageFit;
  /**
   * Clip children to the stage frame (default). Pass false when in-stage overlays must reach past
   * the letterbox margins (e.g. a full-screen dim behind a focused card — issue #30 B).
   */
  clip?: boolean;
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
  clip = true,
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

  // Fade in once measured so the unavoidable first (unmeasured) frame doesn't flash bare (H5).
  const ready = size.w > 0 && scale > 0;
  const opacity = useSharedValue(0);
  useEffect(() => {
    if (ready) opacity.value = withTiming(1, { duration: 180 });
  }, [ready, opacity]);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={[{ flex: 1, overflow: clip ? 'hidden' : 'visible' }, style]} onLayout={onLayout}>
      {ready && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: offsetX,
              top: offsetY,
              width: designWidth,
              height: designHeight,
              transform: [{ scale }],
              transformOrigin: [0, 0, 0],
            },
            fade,
          ]}>
          {children}
        </Animated.View>
      )}
    </View>
  );
}
