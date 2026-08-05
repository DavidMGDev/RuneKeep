/**
 * StatPulse (v0.15.0; reworked v0.18.0/v0.19.0 item 2/4/5) — the DM's compact stat control. The filled
 * sheet-coloured icon and the number are ONE hitbox: TAP opens the keypad; a short HOLD blooms the six-wedge
 * radial (+1/+2/+3 up, −1/−2/−3 down). The wheel's origin is measured on the ICON itself so it centres
 * exactly on the glyph (item 4). When disabled (member vitals before Start) any press fires onBlocked.
 */
import { type ReactNode, useCallback, useMemo, useRef } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { DmType, Body, Display, DmRune } from '@/constants/theme';
import { useFrame, windowToFrameX, windowToFrameY } from '@/hooks/use-layout';
import { StatGlyph, STAT_COLOR, type StatGlyphKind } from './stat-glyphs';
import { pickWedge, useStatRadial } from './stat-radial';

export function StatPulse({
  kind,
  value,
  max,
  disabled,
  onApply,
  onRequestSet,
  onBlocked,
}: {
  kind: StatGlyphKind;
  value: number;
  max: number;
  disabled?: boolean;
  onApply: (delta: number) => void;
  onRequestSet: () => void;
  onBlocked?: () => void;
}): ReactNode {
  const radial = useStatRadial();
  const frame = useFrame();
  const iconRef = useRef<View>(null);
  const color = STAT_COLOR[kind];

  /**
   * The callbacks, behind a ref (v0.35).
   *
   * Every one of these arrives as a fresh arrow function on each render of the panel above (the
   * member list rebuilds `onApply` inline), so the gesture below used to be a NEW gesture object on
   * every render. A stat change re-renders the list, so the gesture was replaced WHILE its own hold
   * was still running, which is the failure this codebase has already been bitten by twice (the
   * v0.27.3 creator lock-up) and the most likely cause of the Android crash on hold. Reading through a
   * ref lets the gesture be built once and still call the current callbacks.
   */
  const cb = useRef({ disabled, onApply, onRequestSet, onBlocked });
  cb.current = { disabled, onApply, onRequestSet, onBlocked };

  const onTap = useCallback(() => { const c = cb.current; if (c.disabled) c.onBlocked?.(); else c.onRequestSet(); }, []);
  const applyLatest = useCallback((d: number) => { cb.current.onApply(d); }, []);
  const beginHold = useCallback((tx: number, ty: number) => {
    const { disabled, onBlocked } = cb.current;
    if (disabled) { onBlocked?.(); return; }
    // Measure the ICON (not the whole row) so the wheel's origin sits exactly on the glyph (item 4).
    // The touch point rides along so the cursor starts under the thumb rather than on the glyph.
    // v0.24.0: measureInWindow and absoluteX are both WINDOW coords; the wheel is drawn inside
    // the frame, so both the anchor and the touch point come back to frame space together.
    iconRef.current?.measureInWindow((x, y, w, h) => {
      if (w > 0) radial.open(windowToFrameX(x + w / 2, frame), windowToFrameY(y + h / 2, frame), color, applyLatest, { x: windowToFrameX(tx, frame), y: windowToFrameY(ty, frame) });
    });
  }, [radial, color, applyLatest, frame]);

  const gesture = useMemo(
    () =>
      Gesture.Exclusive(
        Gesture.Pan()
          .activateAfterLongPress(150)
          .onStart((e) => { 'worklet'; runOnJS(beginHold)(e.absoluteX, e.absoluteY); })
          .onUpdate((e) => {
            'worklet';
            if (radial.active.value !== 1) return;
            radial.fingerX.value = windowToFrameX(e.absoluteX, frame);
            radial.fingerY.value = windowToFrameY(e.absoluteY, frame);
            radial.highlight.value = pickWedge(radial.fingerX.value - radial.anchorX.value, radial.fingerY.value - radial.anchorY.value);
          })
          .onFinalize(() => { 'worklet'; if (radial.active.value === 1) runOnJS(radial.commit)(); }),
        Gesture.Tap().maxDuration(260).onEnd(() => { 'worklet'; runOnJS(onTap)(); }),
      ),
    [beginHold, onTap, radial, frame],
  );

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }} hitSlop={10} accessibilityRole="adjustable" accessibilityLabel={`${kind}, ${value} of ${max}. Tap to set, hold to adjust.`}>
        <View ref={iconRef} collapsable={false} style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
          <StatGlyph kind={kind} color={disabled ? DmRune.muted : color} size={24} filled={!disabled} />
        </View>
        {/* `title`, not `hero`: four of these sit in a row inside a panel whose NAME should dominate.
            The audit's finding was that stat numbers read as loud as the adversary's name; promoting
            them to the hero step would invert the hierarchy rather than fix it. The filled glyph
            beside each one carries the visual weight instead. */}
        <Text style={{ color: DmRune.ivory, fontSize: DmType.title, fontFamily: Display.black, letterSpacing: 0.2, includeFontPadding: false }}>
          {value}
          <Text style={{ color: DmRune.muted, fontSize: DmType.micro, fontFamily: Body.bold }}> /{max}</Text>
        </Text>
      </View>
    </GestureDetector>
  );
}
