import { useEffect, useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedProps, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { ClipPath, Defs, Image as SvgImage, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

const AnimatedImage = Animated.createAnimatedComponent(SvgImage);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const VW = 1235;
const VH = 2048;
const SHINE_BAND = Math.round(VH * 0.42); // a soft light streak that sweeps the portrait on tap

/** assets/art/new/portraitMask.svg — the chamfered portrait silhouette, used as a clip mask. */
const MASK_D =
  'M 523 0 L 1071.58 0 L 1174.13 99.8672 C 1193.16 118.282 1217.07 140.225 1235 159.18 L 1235 1604.18 L 804.343 2028.14 C 773.033 1996.58 741.323 1962.05 710.659 1929.68 L 540.106 1749.76 L 346.497 1948.27 C 314.62 1980.88 281.524 2016.05 248.963 2047.76 C 247.855 2022.55 247.991 1996.48 247.814 1971.19 L 0 1733.46 L 0 1264.4 C 0.895821 1258.93 0.651396 1240.09 0.668063 1233.99 L 0.774892 1173.06 L 0.948075 956.603 L 1.75673 165.722 C 10.2044 157.358 19.3047 148.621 28.1188 140.68 C 78.7238 95.0916 127.354 45.9589 178.355 0.92053 L 417.469 0.715848 L 486.705 0.708553 C 494.934 0.708394 515.683 1.1075 523 0 z';

/**
 * The "no photo yet" portrait button. A plain tap opens the picker; it also gives a quick white flash
 * so the tap visibly registers (owner v0.9.8 — the picker alone felt unresponsive). Mirrors the shine
 * the set-photo PortraitImage gives, kept as a cheap flash since the placeholder is about to be replaced.
 */
export function PortraitTapButton({ onPress, onOpenBoard, children, accessibilityLabel, style }: { onPress?: () => void; onOpenBoard?: () => void; children?: ReactNode; accessibilityLabel?: string; style?: StyleProp<ViewStyle> }) {
  const flash = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const trigger = () => {
    flash.value = withSequence(withTiming(0.4, { duration: 90 }), withTiming(0, { duration: 280 }));
    onPress?.();
  };
  /**
   * v0.34.0: the moodboard is reachable from the EMPTY portrait too.
   *
   * The gesture lives on the portrait, and a character with no photo yet has a placeholder here
   * instead. Gating a whole feature on having picked a picture would be an arbitrary lock on the one
   * screen most likely to want it: a character you have not finished imagining.
   *
   * The flash still fires on touch, so the single tap that opens the picker is answered immediately
   * even though it now waits out the double-tap window before it resolves.
   */
  const gesture = useMemo(() => {
    const flashNow = () => { flash.value = withSequence(withTiming(0.4, { duration: 90 }), withTiming(0, { duration: 280 })); };
    const two = Gesture.Tap().numberOfTaps(2).maxDuration(260).maxDistance(20).onStart(() => { 'worklet'; if (onOpenBoard) runOnJS(onOpenBoard)(); });
    const one = Gesture.Tap()
      .maxDuration(260)
      .maxDistance(16)
      .onTouchesDown(() => { 'worklet'; runOnJS(flashNow)(); })
      .onEnd(() => { 'worklet'; if (onPress) runOnJS(onPress)(); });
    return Gesture.Exclusive(two, one);
  }, [flash, onOpenBoard, onPress]);

  if (!onOpenBoard) {
    return (
      <Pressable style={style} onPress={trigger} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
        {children}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#ffffff' }, flashStyle]} />
      </Pressable>
    );
  }
  return (
    <GestureDetector gesture={gesture}>
      <View style={style} accessible accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityHint="Double tap to open the moodboard">
        {children}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#ffffff' }, flashStyle]} />
      </View>
    </GestureDetector>
  );
}

export interface PortraitTransform {
  scale: number;
  x: number;
  y: number;
}
export const PORTRAIT_DEFAULT_TRANSFORM: PortraitTransform = { scale: 1, x: 0, y: 0 };

/**
 * The player's portrait, clipped to the chamfered mask (#135) and interactive like Canva/PowerPoint
 * (#155): DRAG to slide the image, PINCH to zoom (1-4x) — the image always covers the mask (clamped,
 * never a gap, no crop dialog). TAP: a quick top-to-bottom shine sweeps the portrait so a tap clearly
 * registers (owner v0.9.8). HOLD: feedback now starts at ~0.5s and the gold "shine" fills bottom-to-top
 * twice as fast (~1s) before prompting to replace — the old 3s flow felt like nothing was happening.
 * Transform persists via onTransform.
 */
export function PortraitImage({
  uri,
  width,
  height,
  transform,
  onTransform,
  onReplace,
  onOpenBoard,
}: {
  uri: string;
  width: number;
  height: number;
  transform?: PortraitTransform;
  onTransform?: (t: PortraitTransform) => void;
  onReplace?: () => void;
  /** v0.34.0: a double tap opens this character's moodboard. */
  onOpenBoard?: () => void;
}) {
  const scale = useSharedValue(transform?.scale ?? 1);
  const ox = useSharedValue(transform?.x ?? 0);
  const oy = useSharedValue(transform?.y ?? 0);
  const fill = useSharedValue(0);
  const shine = useSharedValue(0); // 0 = band parked above the top, 1 = parked below the bottom (both invisible)
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

  /**
   * Tap feedback, on TOUCH rather than on release (v0.34.0).
   *
   * The shine used to start in `onStart`, which for a tap means when the gesture RESOLVES. Adding a
   * double tap this release would have made that worse still, because a single tap then has to wait
   * out the double-tap window before it can resolve at all. Firing on touch-down decouples the two:
   * the portrait answers the instant it is touched, and which gesture it turns out to be is decided
   * afterwards. The sweep is quicker too, because feedback that outlasts the interaction reads as an
   * animation rather than as a response.
   */
  const tap = Gesture.Tap()
    .maxDuration(260)
    .maxDistance(16)
    .onTouchesDown(() => {
      'worklet';
      shine.value = 0;
      shine.value = withTiming(1, { duration: 300, easing: Easing.inOut(Easing.quad) });
    });

  /**
   * The MOODBOARD (v0.34.0): two taps on the portrait open the character's canvas.
   *
   * Resolved ahead of the single tap so the two can never both fire. The shine still lands on the
   * first touch, so a double tap feels answered from its first contact.
   */
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(260)
    .maxDistance(20)
    .onStart(() => {
      'worklet';
      if (onOpenBoard) runOnJS(onOpenBoard)();
    });

  /**
   * Hold to replace (v0.34.0: feedback is immediate).
   *
   * It used to show nothing for the first half second and then take another second, so the first half
   * of every hold was indistinguishable from the app ignoring you. The gold now starts climbing
   * almost at once and completes sooner; the total is close to what it was, but you can see it
   * working from the beginning, which is the part that was missing.
   */
  const hold = Gesture.LongPress()
    .minDuration(140)
    .maxDistance(16)
    .onStart(() => {
      fired.value = false;
      fill.value = withTiming(1, { duration: 900, easing: Easing.linear }, (done) => {
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

  const gesture = Gesture.Simultaneous(pinch, Gesture.Exclusive(doubleTap, hold, pan, tap));

  const imgProps = useAnimatedProps(() => ({ x: ox.value, y: oy.value, width: VW * scale.value, height: VH * scale.value }));
  const fillProps = useAnimatedProps(() => ({ y: VH * (1 - fill.value), height: VH * fill.value }));
  const shineProps = useAnimatedProps(() => ({ y: -SHINE_BAND + shine.value * (VH + SHINE_BAND) }));

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
            <LinearGradient id="rkPortraitShine" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#ffffff" stopOpacity="0" />
              <Stop offset="0.5" stopColor="#ffffff" stopOpacity="0.42" />
              <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <AnimatedImage href={{ uri }} animatedProps={imgProps} preserveAspectRatio="xMidYMid slice" clipPath="url(#rkPortraitClip)" />
          <AnimatedRect x={0} width={VW} fill="rgba(231,198,104,0.55)" animatedProps={fillProps} clipPath="url(#rkPortraitClip)" />
          <AnimatedRect x={0} width={VW} height={SHINE_BAND} fill="url(#rkPortraitShine)" animatedProps={shineProps} clipPath="url(#rkPortraitClip)" />
        </Svg>
      </View>
    </GestureDetector>
  );
}
