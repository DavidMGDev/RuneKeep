/**
 * StatPulse (v0.15.0; reworked v0.18.0/v0.19.0 item 2/4/5) — the DM's compact stat control. The filled
 * sheet-coloured icon and the number are ONE hitbox: TAP opens the keypad; a short HOLD blooms the six-wedge
 * radial (+1/+2/+3 up, −1/−2/−3 down). The wheel's origin is measured on the ICON itself so it centres
 * exactly on the glyph (item 4). When disabled (member vitals before Start) any press fires onBlocked.
 *
 * ## v0.35.2: built like the float menu, because the float menu works
 *
 * This crashed the app on Android for three releases. Two attempts removed real problems (a gesture
 * rebuilt mid-gesture, an SVG tree mounted and unmounted inside a live hold) and it still crashed, so
 * the third attempt stops guessing at the difference and REMOVES the difference.
 *
 * The character sheet's float menu is the same thing on the same platform: it holds a radial wheel
 * open on a drag, plays the same sounds through the same reactions, and has never crashed. Three
 * things it does that this did not:
 *
 *  1. ONE `Gesture.Pan`. No `Gesture.Exclusive`, no second handler racing it, and nothing asking
 *     Android's pan handler to activate itself after a long press. Tap versus hold is decided here, in
 *     JS, from a timer and a movement flag, the way the float menu decides tap versus drag from a slop.
 *  2. Its worklets capture SHARED VALUES and plain functions, never a context OBJECT holding a mixture
 *     of shared values and closures. This one captured the whole radial context and read
 *     `radial.commit` off it on the UI thread.
 *  3. It measures at layout, not inside the gesture.
 *
 * All three are now true here. Manual activation is what keeps the list underneath scrollable, which
 * is the job `activateAfterLongPress` was doing: the pan claims nothing until the wheel is really open.
 */
import { type ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

import { DmType, Body, Display, DmRune } from '@/constants/theme';
import { useFrame, windowToFrameX, windowToFrameY } from '@/hooks/use-layout';
import { StatGlyph, STAT_COLOR, type StatGlyphKind } from './stat-glyphs';
import { pickWedge } from './radial-wedges';
import { useStatRadial } from './stat-radial';

/** How long the finger has to stay put before the wheel blooms. */
const HOLD_MS = 170;
/** Movement past this (in window px) is a scroll, not a tap. */
const TAP_SLOP = 8;

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

  // Only shared values and plain functions cross into a worklet, never the context object itself.
  const { active, anchorX, anchorY, fingerX, fingerY, lastWedge } = radial;
  const openWheel = radial.open;
  const commitWheel = radial.commit;
  const setWedge = radial.setWedge;

  /** The callbacks, behind a ref, so the gesture below is built once and never replaced (v0.35). */
  const cb = useRef({ disabled, onApply, onRequestSet, onBlocked });
  cb.current = { disabled, onApply, onRequestSet, onBlocked };

  /** Where the icon sits, measured at LAYOUT. Measuring inside the gesture is one of the things the
   *  working float menu does not do. */
  const anchor = useRef({ x: 0, y: 0 });
  const measure = useCallback(() => {
    iconRef.current?.measureInWindow((x, y, w, h) => {
      if (w > 0) anchor.current = { x: windowToFrameX(x + w / 2, frame), y: windowToFrameY(y + h / 2, frame) };
    });
  }, [frame]);

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHold = useCallback(() => { if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; } }, []);
  useEffect(() => clearHold, [clearHold]);

  const applyLatest = useCallback((d: number) => { cb.current.onApply(d); }, []);

  /** Touch down: start the clock. Nothing is claimed yet, so the list can still scroll. */
  const armHold = useCallback((tx: number, ty: number) => {
    clearHold();
    if (cb.current.disabled) return;
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      measure();
      openWheel(anchor.current.x, anchor.current.y, color, applyLatest, { x: tx, y: ty });
    }, HOLD_MS);
  }, [clearHold, measure, openWheel, color, applyLatest]);

  /** Touch up. The wheel is open (apply), it was a tap (keypad), or it was a scroll (nothing). */
  const endTouch = useCallback((moved: boolean, wheelOpen: boolean) => {
    clearHold();
    if (wheelOpen) { commitWheel(); return; }
    if (moved) return;
    const c = cb.current;
    if (c.disabled) c.onBlocked?.();
    else c.onRequestSet();
  }, [clearHold, commitWheel]);

  // Where the finger went down, and whether it has wandered. Both live on the UI thread because the
  // decision they feed (claim the touch, or let the list scroll) is made there.
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const movedSV = useSharedValue(0);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        // MANUAL activation: the pan claims nothing until the wheel is open, so a finger that lands on
        // a stat and drags is still a list scroll. This is what `activateAfterLongPress` was for, done
        // here instead of inside Android's pan handler.
        .manualActivation(true)
        .onBegin((e) => {
          'worklet';
          startX.value = e.absoluteX;
          startY.value = e.absoluteY;
          movedSV.value = 0;
          runOnJS(armHold)(windowToFrameX(e.absoluteX, frame), windowToFrameY(e.absoluteY, frame));
        })
        .onTouchesMove((e, manager) => {
          'worklet';
          const t = e.allTouches[0];
          if (!t) return;
          if (active.value === 1) { manager.activate(); return; }
          if (Math.hypot(t.absoluteX - startX.value, t.absoluteY - startY.value) > TAP_SLOP) {
            movedSV.value = 1;
            runOnJS(clearHold)(); // wandered off before the wheel bloomed: this was a scroll
            manager.fail();
          }
        })
        .onUpdate((e) => {
          'worklet';
          if (active.value !== 1) return;
          fingerX.value = windowToFrameX(e.absoluteX, frame);
          fingerY.value = windowToFrameY(e.absoluteY, frame);
          // v0.35.3: the wedge is REPORTED to the JS side, and only when it changes. Deciding it here
          // and reacting to it there through `useAnimatedReaction` was the last piece of UI-thread
          // machinery this had that the float menu does not.
          const w = pickWedge(fingerX.value - anchorX.value, fingerY.value - anchorY.value);
          if (w !== lastWedge.value) {
            lastWedge.value = w;
            runOnJS(setWedge)(w);
          }
        })
        .onFinalize(() => {
          'worklet';
          runOnJS(endTouch)(movedSV.value === 1, active.value === 1);
        }),
    [armHold, clearHold, endTouch, setWedge, active, anchorX, anchorY, fingerX, fingerY, lastWedge, frame, startX, startY, movedSV],
  );

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }} hitSlop={10} accessibilityRole="adjustable" accessibilityLabel={`${kind}, ${value} of ${max}. Tap to set, hold to adjust.`}>
        <View ref={iconRef} collapsable={false} onLayout={measure} style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
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
