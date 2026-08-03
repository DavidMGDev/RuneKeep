import { Image as ExpoImage } from 'expo-image';
import { memo, useCallback, useEffect, useMemo } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { focusHaptic } from '@/lib/haptics';
import { EDGE_MARGIN, ITEM_BASE_W, type CanvasSize, type MoodboardItem } from '@/lib/moodboard';
import { ANGLE_SNAP, ANGLE_TARGETS, snapValue } from '@/lib/snap';

/** How long a deleted image takes to fall off the canvas. */
const LEAVE_MS = 900;

export interface ItemGestureResult {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

/**
 * One image on the moodboard (v0.34.0, reworked v0.34.1).
 *
 * Everything a gesture touches is a shared value, so dragging never crosses onto the JS thread and
 * never touches React state. The board is written to disk exactly once, when a gesture ENDS, which is
 * also the only moment the parent re-renders.
 *
 * ONE image view per item, never a thumb/full pair. Pointing two views at one asset is what made the
 * ancestry cards blink in v0.33.0, and there is nothing to gain here either.
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

  /**
   * The RAW angle, un-snapped, and the snap the gesture is currently holding.
   *
   * `escaped` is the owner's rule (v0.34.1): once a snap has been deliberately turned out of, this
   * gesture stops snapping altogether. Turning back towards a right angle after escaping it means you
   * want that angle and not the snap, and re-grabbing would be the app arguing with you. Releasing and
   * starting again clears it, which is how you ask for the snap back.
   */
  const rawRot = useSharedValue(item.rotation);
  const heldRot = useSharedValue<number | null>(null);
  const escaped = useSharedValue(false);
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

  // The model is the source of truth after a layer move, a centre or a restore.
  useEffect(() => {
    x.value = item.x;
    y.value = item.y;
    scale.value = item.scale;
    rot.value = item.rotation;
  }, [item.x, item.y, item.scale, item.rotation, x, y, scale, rot]);

  const commit = useCallback(() => {
    onCommit(item.id, { x: x.value, y: y.value, scale: scale.value, rotation: rot.value });
    onRelease();
  }, [onCommit, onRelease, item.id, x, y, scale, rot]);

  const openMenu = useCallback(() => onMenu(item.id, x.value, y.value), [onMenu, item.id, x, y]);
  const grabbed = useCallback(() => onGrab(), [onGrab]);

  const gesture = useMemo(() => {
    /**
     * v0.34.1: the pan is NOT exclusive with the double tap any more.
     *
     * `Gesture.Exclusive(doubleTap, pan)` makes the pan wait for the double tap to fail, which takes
     * the whole double-tap window before the image can move. That is the "big delay between when I
     * grab an image and when it starts moving". They are already mutually exclusive by their own
     * thresholds: a pan needs movement, a tap needs none.
     */
    const pan = Gesture.Pan()
      .enabled(!locked && !leaving)
      .minDistance(2)
      .averageTouches(true)
      .onStart(() => {
        'worklet';
        startX.value = x.value;
        startY.value = y.value;
        lifted.value = withTiming(1, { duration: 120 });
        runOnJS(grabbed)();
      })
      .onUpdate((e) => {
        'worklet';
        // Clamped INLINE. A plain imported function cannot be called from the UI thread, and calling
        // one is what crashed the app the first time an image was dragged on a phone (v0.34.1).
        // No position snapping at all: the owner asked for right angles only.
        const nx = startX.value + e.translationX / scaleFactor;
        const ny = startY.value + e.translationY / scaleFactor;
        x.value = Math.min(canvas.width - EDGE_MARGIN, Math.max(EDGE_MARGIN, nx));
        y.value = Math.min(canvas.height - EDGE_MARGIN, Math.max(EDGE_MARGIN, ny));
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
        runOnJS(grabbed)();
      })
      .onUpdate((e) => {
        'worklet';
        scale.value = Math.min(6, Math.max(0.25, startScale.value * e.scale));
      })
      .onFinalize(() => {
        'worklet';
        runOnJS(commit)();
      });

    const rotate = Gesture.Rotation()
      .enabled(!locked && !leaving)
      .onStart(() => {
        'worklet';
        startRot.value = rot.value;
        rawRot.value = rot.value;
        heldRot.value = null;
        escaped.value = false; // a fresh grip is a fresh chance to snap
      })
      .onUpdate((e) => {
        'worklet';
        rawRot.value = startRot.value + (e.rotation * 180) / Math.PI;
        if (escaped.value) {
          rot.value = rawRot.value;
          return;
        }
        const s = snapValue(rawRot.value, ANGLE_TARGETS, ANGLE_SNAP, heldRot.value);
        // Held a snap and then left it: done snapping until this gesture ends.
        if (heldRot.value != null && s.target == null) escaped.value = true;
        if (s.entered) runOnJS(focusHaptic)();
        heldRot.value = s.target;
        rot.value = s.value;
      })
      .onFinalize(() => {
        'worklet';
        heldRot.value = null;
        escaped.value = false;
        runOnJS(commit)();
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(300)
      .maxDistance(18)
      .enabled(!locked && !leaving)
      .onStart(() => {
        'worklet';
        runOnJS(openMenu)();
      });

    // Two fingers move, resize and turn at once, which is the whole point of a canvas.
    return Gesture.Simultaneous(pan, pinch, rotate, doubleTap);
  }, [locked, leaving, canvas, scaleFactor, grabbed, commit, openMenu, x, y, scale, rot, rawRot, heldRot, escaped, startX, startY, startScale, startRot, lifted]);

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
          style={{ width: '100%', height: '100%' }}
          contentFit="contain"
          cachePolicy="memory-disk"
          recyclingKey={item.id}
          transition={0}
        />
      </Animated.View>
    </GestureDetector>
  );
});
