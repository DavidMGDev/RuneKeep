import { useEffect } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { ClipPath, Defs, Image as SvgImage, Path, Rect } from 'react-native-svg';

const AnimatedImage = Animated.createAnimatedComponent(SvgImage);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const VW = 1235;
const VH = 2048;

/** assets/art/new/portraitMask.svg — the chamfered portrait silhouette, used as a clip mask. */
const MASK_D =
  'M 523 0 L 1071.58 0 L 1174.13 99.8672 C 1193.16 118.282 1217.07 140.225 1235 159.18 L 1235 1604.18 L 804.343 2028.14 C 773.033 1996.58 741.323 1962.05 710.659 1929.68 L 540.106 1749.76 L 346.497 1948.27 C 314.62 1980.88 281.524 2016.05 248.963 2047.76 C 247.855 2022.55 247.991 1996.48 247.814 1971.19 L 0 1733.46 L 0 1264.4 C 0.895821 1258.93 0.651396 1240.09 0.668063 1233.99 L 0.774892 1173.06 L 0.948075 956.603 L 1.75673 165.722 C 10.2044 157.358 19.3047 148.621 28.1188 140.68 C 78.7238 95.0916 127.354 45.9589 178.355 0.92053 L 417.469 0.715848 L 486.705 0.708553 C 494.934 0.708394 515.683 1.1075 523 0 z';

export interface PortraitTransform {
  scale: number;
  x: number;
  y: number;
}
export const PORTRAIT_DEFAULT_TRANSFORM: PortraitTransform = { scale: 1, x: 0, y: 0 };

/**
 * The player's portrait, clipped to the chamfered mask (#135) and interactive like Canva/PowerPoint
 * (#155): DRAG to slide the image, PINCH to zoom (1-4x) — the image always covers the mask (clamped,
 * never a gap, no crop dialog). HOLD: after ~1s the mask fills bottom-to-top, and at ~3s it prompts
 * to replace the photo. Transform persists via onTransform.
 */
export function PortraitImage({
  uri,
  width,
  height,
  transform,
  onTransform,
  onReplace,
}: {
  uri: string;
  width: number;
  height: number;
  transform?: PortraitTransform;
  onTransform?: (t: PortraitTransform) => void;
  onReplace?: () => void;
}) {
  const scale = useSharedValue(transform?.scale ?? 1);
  const ox = useSharedValue(transform?.x ?? 0);
  const oy = useSharedValue(transform?.y ?? 0);
  const fill = useSharedValue(0);
  const startOx = useSharedValue(0);
  const startOy = useSharedValue(0);
  const startScale = useSharedValue(1);
  const vwPerPx = useSharedValue(VW / width);
  const vhPerPx = useSharedValue(VH / height);
  const fired = useSharedValue(false);

  // reset to the (new) transform when the photo is replaced
  useEffect(() => {
    scale.value = transform?.scale ?? 1;
    ox.value = transform?.x ?? 0;
    oy.value = transform?.y ?? 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  const persist = () => onTransform?.({ scale: scale.value, x: ox.value, y: oy.value });
  const fireReplace = () => onReplace?.();

  const clamp = () => {
    'worklet';
    const bw = VW * scale.value;
    const bh = VH * scale.value;
    ox.value = Math.min(0, Math.max(VW - bw, ox.value));
    oy.value = Math.min(0, Math.max(VH - bh, oy.value));
  };

  const pan = Gesture.Pan()
    .minDistance(3)
    .averageTouches(true)
    .onBegin(() => {
      startOx.value = ox.value;
      startOy.value = oy.value;
    })
    .onUpdate((e) => {
      ox.value = startOx.value + e.translationX * vwPerPx.value;
      oy.value = startOy.value + e.translationY * vhPerPx.value;
      clamp();
    })
    .onEnd(() => runOnJS(persist)());

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      startScale.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.min(4, Math.max(1, startScale.value * e.scale));
      clamp();
    })
    .onEnd(() => runOnJS(persist)());

  // hold: fill starts at 1s, completes (replace prompt) at 3s; release before = cancel
  const hold = Gesture.LongPress()
    .minDuration(1000)
    .maxDistance(16)
    .onStart(() => {
      fired.value = false;
      fill.value = withTiming(1, { duration: 2000, easing: Easing.linear }, (done) => {
        if (done && !fired.value) {
          fired.value = true;
          runOnJS(fireReplace)();
        }
      });
    })
    .onFinalize(() => {
      cancelAnimation(fill);
      fill.value = withTiming(0, { duration: 220 });
    });

  const gesture = Gesture.Simultaneous(pinch, Gesture.Exclusive(hold, pan));

  const imgProps = useAnimatedProps(() => ({ x: ox.value, y: oy.value, width: VW * scale.value, height: VH * scale.value }));
  const fillProps = useAnimatedProps(() => ({ y: VH * (1 - fill.value), height: VH * fill.value }));

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={{ width, height }}
        onLayout={(e) => {
          vwPerPx.value = VW / e.nativeEvent.layout.width;
          vhPerPx.value = VH / e.nativeEvent.layout.height;
        }}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none">
          <Defs>
            <ClipPath id="rkPortraitClip">
              <Path d={MASK_D} />
            </ClipPath>
          </Defs>
          <AnimatedImage href={{ uri }} animatedProps={imgProps} preserveAspectRatio="xMidYMid slice" clipPath="url(#rkPortraitClip)" />
          <AnimatedRect x={0} width={VW} fill="rgba(231,198,104,0.55)" animatedProps={fillProps} clipPath="url(#rkPortraitClip)" />
        </Svg>
      </View>
    </GestureDetector>
  );
}
