import { Image as ExpoImage } from 'expo-image';
import { memo, useCallback, useEffect, useMemo } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { focusHaptic, tapHaptic } from '@/lib/haptics';
import { clampCentre, ITEM_BASE_W, type CanvasSize, type MoodboardItem } from '@/lib/moodboard';
import { ANGLE_SNAP, ANGLE_TARGETS, CENTRE_SNAP, snapValue } from '@/lib/snap';

/** How long a deleted image takes to fall off the canvas. */
const LEAVE_MS = 900;

export interface ItemGestureResult {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

/**
 * One image on the moodboard (v0.34.0).
 *
 * Everything a gesture touches is a shared value, so dragging never crosses onto the JS thread and
 * never touches React state. The board is written to disk exactly once, when a gesture ENDS, which is
 * also the only moment the parent re-renders. Fifty images cost fifty transforms per frame on the UI
 * thread and nothing else.
 *
 * ONE image view per item, never a thumb/full pair. Pointing two views at one asset is what made the
 * ancestry cards blink in v0.33.0, and there is nothing to gain here either: the picked image is the
 * only version of itself that exists.
 */
export const MoodboardItemView = memo(function MoodboardItemView({
  item,
  canvas,
  locked,
  scaleFactor,
  leaving,
  onCommit,
  onMenu,
  onGrab,
  onRelease,
  reduced,
}: {
  item: MoodboardItem;
  canvas: CanvasSize;
  locked: boolean;
  /** Design px per screen px. Gesture translations arrive in screen px and are divided by this. */
  scaleFactor: number;
  /** True once this item has been deleted: it falls off the canvas, then the parent drops it. */
  leaving: boolean;
  onCommit: (id: string, next: ItemGestureResult) => void;
  onMenu: (id: string, atX: number, atY: number) => void;
  onGrab: () => void;
  onRelease: () => void;
  reduced: boolean;
}) {
  const x = useSharedValue(item.x);
  const y = useSharedValue(item.y);
  const scale = useSharedValue(item.scale);
  const rot = useSharedValue(item.rotation);
  const lifted = useSharedValue(0);
  const fall = useSharedValue(0);
  const appear = useSharedValue(0);

  // Raw, un-snapped values, so a snap can be escaped by continuing to move rather than by fighting
  // a value that keeps being pulled back.
  const rawX = useSharedValue(item.x);
  const rawY = useSharedValue(item.y);
  const rawRot = useSharedValue(item.rotation);
  const heldX = useSharedValue<number | null>(null);
  const heldY = useSharedValue<number | null>(null);
  const heldRot = useSharedValue<number | null>(null);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startRot = useSharedValue(0);

  const w = ITEM_BASE_W;
  const h = ITEM_BASE_W / (item.aspect || 1);

  // Nothing appears at full opacity in a single frame (owner).
  useEffect(() => {
    appear.value = withTiming(1, { duration: reduced ? 0 : 260, easing: Easing.out(Easing.cubic) });
  }, [appear, reduced]);

  const commit = useCallback(() => {
    onCommit(item.id, { x: x.value, y: y.value, scale: scale.value, rotation: rot.value });
    onRelease();
  }, [onCommit, onRelease, item.id, x, y, scale, rot]);

  const openMenu = useCallback(() => onMenu(item.id, x.value, y.value), [onMenu, item.id, x, y]);

  const begin = useCallback(() => {
    lifted.value = withTiming(1, { duration: 140 });
    onGrab();
  }, [lifted, onGrab]);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .enabled(!locked && !leaving)
      .averageTouches(true)
      .onStart(() => {
        'worklet';
        startX.value = x.value;
        startY.value = y.value;
        rawX.value = x.value;
        rawY.value = y.value;
        runOnJS(begin)();
      })
      .onUpdate((e) => {
        'worklet';
        rawX.value = startX.value + e.translationX / scaleFactor;
        rawY.value = startY.value + e.translationY / scaleFactor;
        const sx = snapValue(rawX.value, [canvas.width / 2], CENTRE_SNAP, heldX.value);
        const sy = snapValue(rawY.value, [canvas.height / 2], CENTRE_SNAP, heldY.value);
        if (sx.entered || sy.entered) runOnJS(tapHaptic)();
        heldX.value = sx.target;
        heldY.value = sy.target;
        // Clamped as it moves, not on release, so an image cannot be dragged somewhere it then
        // springs back from. What you see under your finger is where it lands.
        const c = clampCentre(sx.value, sy.value, canvas);
        x.value = c.x;
        y.value = c.y;
      })
      .onEnd(() => {
        'worklet';
        heldX.value = null;
        heldY.value = null;
      })
      .onFinalize(() => {
        'worklet';
        lifted.value = withTiming(0, { duration: 160 });
        runOnJS(commit)();
      });

    const pinch = Gesture.Pinch()
      .enabled(!locked && !leaving)
      .onStart(() => {
        'worklet';
        startScale.value = scale.value;
        runOnJS(begin)();
      })
      .onUpdate((e) => {
        'worklet';
        scale.value = Math.min(6, Math.max(0.25, startScale.value * e.scale));
      })
      .onFinalize(() => {
        'worklet';
        lifted.value = withTiming(0, { duration: 160 });
        runOnJS(commit)();
      });

    const rotate = Gesture.Rotation()
      .enabled(!locked && !leaving)
      .onStart(() => {
        'worklet';
        startRot.value = rot.value;
        rawRot.value = rot.value;
      })
      .onUpdate((e) => {
        'worklet';
        rawRot.value = startRot.value + (e.rotation * 180) / Math.PI;
        const s = snapValue(rawRot.value, ANGLE_TARGETS, ANGLE_SNAP, heldRot.value);
        if (s.entered) runOnJS(focusHaptic)();
        heldRot.value = s.target;
        rot.value = s.value;
      })
      .onFinalize(() => {
        'worklet';
        heldRot.value = null;
        runOnJS(commit)();
      });

    // Two fingers move, resize and turn at once, which is the whole point of a canvas.
    const manipulate = Gesture.Simultaneous(pan, pinch, rotate);

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(280)
      .enabled(!locked && !leaving)
      .onStart(() => {
        'worklet';
        runOnJS(openMenu)();
      });

    return Gesture.Exclusive(doubleTap, manipulate);
  }, [locked, leaving, canvas, scaleFactor, begin, commit, openMenu, x, y, scale, rot, rawX, rawY, rawRot, heldX, heldY, heldRot, startX, startY, startScale, startRot, lifted]);

  /**
   * The departure (owner): the pre-v0.33.1 token fall. Gravity, a little drift, a slow turn and a
   * fade. Explicitly WITHOUT the throw momentum added since, which is a dice affordance.
   */
  useEffect(() => {
    if (!leaving) return;
    fall.value = withTiming(1, { duration: reduced ? 160 : LEAVE_MS, easing: Easing.linear });
  }, [leaving, fall, reduced]);

  const style = useAnimatedStyle(() => {
    const f = fall.value;
    return {
      opacity: appear.value * (f < 0.6 ? 1 : Math.max(0, 1 - (f - 0.6) / 0.4)),
      transform: [
        { translateX: x.value - w / 2 + f * 26 },
        { translateY: y.value - h / 2 + f * f * 900 },
        { rotate: `${rot.value + f * 90}deg` },
        { scale: scale.value * (1 + lifted.value * 0.04) * (1 - 0.25 * f) },
      ],
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: w, height: h }, style]}>
        <ExpoImage
          source={{ uri: item.imageUri }}
          style={{ width: '100%', height: '100%', borderRadius: 3 }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={item.id}
          transition={0}
        />
      </Animated.View>
    </GestureDetector>
  );
});
