/**
 * REPOSITION, ZOOM AND CROP an uploaded picture (v0.42.6, owner).
 *
 * "For all portraits in the app i wish for simple library for cropping functionality to be available
 * when uploading. On both web and native i want when I upload a portrait I wish to be able to
 * reposition / zoom / crop the image that I upload."
 *
 * ## Why this is not a library
 *
 * Every cropping package for React Native is either native-only, web-only, or a bridge that needs a
 * config plugin and a rebuild. This app already ships the two things a cropper actually needs:
 * `expo-image-manipulator` (already a dependency, used by `ownImage`) does the crop, and
 * gesture-handler plus Reanimated do the pan and the pinch. What was missing was the frame, and a
 * frame is fifty lines.
 *
 * ## What comes out
 *
 * A NEW FILE, cropped to what the frame showed. Not a transform stored beside the original: a
 * transform has to be re-applied by every reader, and this app draws portraits in a dozen places
 * (the sheet, the roster, the DM's cast, an encounter row) that would each have to honour it. One
 * cropped file is understood by all of them and by every export.
 *
 * The frame's SHAPE is the caller's, because a character portrait is a tall rectangle and a campaign's
 * emblem is a square, and cropping to the wrong one is the thing this exists to prevent.
 */
import { useCallback, useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Gap, Rune } from '@/constants/theme';
import { DimScreen } from '@/lib/screen-dim';
import { playSfx } from '@/lib/sfx';

/** How far in a picture may be pushed. Past this it is pixels rather than a portrait. */
const MAX_ZOOM = 6;

export interface CropResult {
  uri: string;
  width: number;
  height: number;
}

/**
 * Crop `uri` to the region the frame is showing.
 *
 * The maths is the inverse of the preview's: the frame is `frameW × frameH` and the picture is drawn
 * at `scale` with the top-left at (`tx`, `ty`), so the visible region in SOURCE pixels is the frame
 * mapped back through both. Clamped to the image, because a rounding error that asks for a pixel
 * outside it throws on Android rather than returning a slightly smaller picture.
 */
export async function cropToFrame(
  uri: string,
  src: { width: number; height: number },
  view: { frameW: number; frameH: number; scale: number; tx: number; ty: number; baseScale: number },
): Promise<CropResult> {
  const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
  const total = view.baseScale * view.scale;
  const originX = Math.max(0, Math.min(src.width - 1, -view.tx / total));
  const originY = Math.max(0, Math.min(src.height - 1, -view.ty / total));
  const width = Math.max(1, Math.min(src.width - originX, view.frameW / total));
  const height = Math.max(1, Math.min(src.height - originY, view.frameH / total));
  const out = await manipulateAsync(
    uri,
    [{ crop: { originX: Math.round(originX), originY: Math.round(originY), width: Math.round(width), height: Math.round(height) } }],
    { compress: 0.92, format: SaveFormat.JPEG },
  );
  return { uri: out.uri, width: out.width, height: out.height };
}

export function ImageCropper({ uri, aspect = 3 / 4, title = 'Position your picture', onDone, onCancel }: {
  uri: string;
  /** width / height of the frame. A portrait is 3:4; an emblem is 1. */
  aspect?: number;
  title?: string;
  onDone: (result: CropResult) => void;
  onCancel: () => void;
}) {
  const [src, setSrc] = useState<{ width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);

  // The frame, in design px. Wide enough to judge a face by, short enough to leave room for the buttons.
  const frameW = 260;
  const frameH = Math.round(frameW / aspect);

  useEffect(() => {
    let live = true;
    Image.getSize(uri, (width, height) => { if (live) setSrc({ width, height }); }, () => { if (live) setSrc({ width: frameW, height: frameH }); });
    return () => { live = false; };
  }, [uri, frameW, frameH]);

  /** The scale at which the picture just COVERS the frame. Everything else is relative to it. */
  const baseScale = src ? Math.max(frameW / src.width, frameH / src.height) : 1;

  const scale = useSharedValue(1);
  const start = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  /** Centre it the moment the size is known, so it opens showing the middle of the picture. */
  useEffect(() => {
    if (!src) return;
    scale.value = 1;
    tx.value = (frameW - src.width * baseScale) / 2;
    ty.value = (frameH - src.height * baseScale) / 2;
  }, [src, baseScale, frameW, frameH, scale, tx, ty]);

  /**
   * Keep the picture covering the frame.
   *
   * A drag that pulled its edge inside would crop in blank, so the offsets are clamped to the slack
   * the current zoom leaves. Run on the worklet thread after every gesture, which is what makes the
   * snap-back feel like part of the drag rather than a correction afterwards.
   */
  const clamp = useCallback(() => {
    'worklet';
    if (!src) return;
    const w = src.width * baseScale * scale.value;
    const h = src.height * baseScale * scale.value;
    const minX = Math.min(0, frameW - w);
    const minY = Math.min(0, frameH - h);
    tx.value = withTiming(Math.max(minX, Math.min(0, tx.value)), { duration: 120 });
    ty.value = withTiming(Math.max(minY, Math.min(0, ty.value)), { duration: 120 });
  }, [src, baseScale, frameW, frameH, scale, tx, ty]);

  const pan = Gesture.Pan()
    .onStart(() => { startX.value = tx.value; startY.value = ty.value; })
    .onUpdate((e) => { tx.value = startX.value + e.translationX; ty.value = startY.value + e.translationY; })
    .onEnd(clamp);

  const pinch = Gesture.Pinch()
    .onStart(() => { start.value = scale.value; })
    .onUpdate((e) => { scale.value = Math.max(1, Math.min(MAX_ZOOM, start.value * e.scale)); })
    .onEnd(clamp);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
    transformOrigin: 'top left',
  }));

  const done = useCallback(() => {
    if (!src || busy) return;
    setBusy(true);
    playSfx('buttonTap');
    void cropToFrame(uri, src, { frameW, frameH, scale: scale.value, tx: tx.value, ty: ty.value, baseScale })
      .then(onDone)
      // A crop that fails hands back the picture as it came, which is what the app did before this
      // existed. Losing somebody's upload to a rounding error would be a poor trade for a feature.
      .catch(() => onDone({ uri, width: src.width, height: src.height }))
      .finally(() => setBusy(false));
  }, [uri, src, busy, frameW, frameH, baseScale, scale, tx, ty, onDone]);

  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 10005, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,8,13,0.94)' }} />
      <DimScreen opacity={0.94} />
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} style={{ paddingHorizontal: 16, paddingVertical: 16, gap: Gap.intra, alignItems: 'center' }}>
        <Text style={{ color: Rune.goldText, fontSize: 16, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</Text>
        <Text style={{ color: Rune.muted, fontSize: 10.5, fontFamily: Body.regular, textAlign: 'center', maxWidth: frameW }}>
          Drag to move it, pinch to zoom. What the frame shows is what is kept.
        </Text>

        <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
          {/* The frame. Everything outside it is clipped, so the box IS the crop. */}
          <View style={{ width: frameW, height: frameH, overflow: 'hidden', backgroundColor: '#000', borderWidth: 1, borderColor: Rune.goldEdge }}>
            {src ? (
              <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: src.width * baseScale, height: src.height * baseScale }, style]}>
                <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              </Animated.View>
            ) : null}
          </View>
        </GestureDetector>

        <View style={{ flexDirection: 'row', gap: 8, width: frameW }}>
          <RuneButton label="Cancel" kind="ghost" height={42} style={{ flex: 1 }} onPress={onCancel} />
          <RuneButton label={busy ? 'Cropping' : 'Use this'} kind="primary" height={42} style={{ flex: 1 }} disabled={busy} onPress={done} />
        </View>
      </ChamferBox>
    </View>
  );
}
