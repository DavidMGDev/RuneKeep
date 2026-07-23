/**
 * StatPulse (v0.15.0; reworked v0.18.0 item 2) — the DM's compact stat control. The filled sheet-coloured
 * icon and the number are ONE hitbox: TAP opens the keypad for an exact value; a short HOLD blooms the
 * six-wedge radial (+1/+2/+3 up, −1/−2/−3 down) — drag onto a wedge, release to apply. No more +/−
 * direction; the wheel carries both. When disabled (member vitals before Start) any press fires onBlocked.
 */
import { type ReactNode, useCallback, useRef } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { Body, Display, DmRune } from '@/constants/theme';
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
  const ref = useRef<View>(null);
  const color = STAT_COLOR[kind];

  const onTap = useCallback(() => { if (disabled) onBlocked?.(); else onRequestSet(); }, [disabled, onBlocked, onRequestSet]);
  const beginHold = useCallback(() => {
    if (disabled) { onBlocked?.(); return; }
    ref.current?.measureInWindow((x, y, w, h) => { if (w > 0) radial.open(x + w / 2, y + h / 2, color, onApply); });
  }, [disabled, onBlocked, radial, color, onApply]);

  const gesture = Gesture.Exclusive(
    Gesture.Pan()
      .activateAfterLongPress(150)
      .onStart(() => { 'worklet'; runOnJS(beginHold)(); })
      .onUpdate((e) => {
        'worklet';
        if (radial.active.value !== 1) return;
        radial.fingerX.value = e.absoluteX;
        radial.fingerY.value = e.absoluteY;
        radial.highlight.value = pickWedge(e.absoluteX - radial.anchorX.value, e.absoluteY - radial.anchorY.value);
      })
      .onFinalize(() => { 'worklet'; if (radial.active.value === 1) runOnJS(radial.commit)(); }),
    Gesture.Tap().maxDuration(260).onEnd(() => { 'worklet'; runOnJS(onTap)(); }),
  );

  return (
    <GestureDetector gesture={gesture}>
      <View ref={ref} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} hitSlop={8} accessibilityRole="adjustable" accessibilityLabel={`${kind}, ${value} of ${max}. Tap to set, hold to adjust.`}>
        <StatGlyph kind={kind} color={disabled ? DmRune.muted : color} size={24} filled={!disabled} />
        <Text style={{ color: DmRune.ivory, fontSize: 21, fontFamily: Display.black, letterSpacing: 0.3 }}>
          {value}
          <Text style={{ color: DmRune.muted, fontSize: 12, fontFamily: Body.bold }}>/{max}</Text>
        </Text>
      </View>
    </GestureDetector>
  );
}
