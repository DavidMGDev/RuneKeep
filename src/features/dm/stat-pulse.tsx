/**
 * StatPulse (v0.15.0; reworked v0.18.0/v0.19.0 item 2/4/5) — the DM's compact stat control. The filled
 * sheet-coloured icon and the number are ONE hitbox: TAP opens the keypad; a short HOLD blooms the six-wedge
 * radial (+1/+2/+3 up, −1/−2/−3 down). The wheel's origin is measured on the ICON itself so it centres
 * exactly on the glyph (item 4). When disabled (member vitals before Start) any press fires onBlocked.
 */
import { type ReactNode, useCallback, useRef } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { DmType, Body, Display, DmRune } from '@/constants/theme';
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
  const iconRef = useRef<View>(null);
  const color = STAT_COLOR[kind];

  const onTap = useCallback(() => { if (disabled) onBlocked?.(); else onRequestSet(); }, [disabled, onBlocked, onRequestSet]);
  const beginHold = useCallback(() => {
    if (disabled) { onBlocked?.(); return; }
    // Measure the ICON (not the whole row) so the wheel's origin sits exactly on the glyph (item 4).
    iconRef.current?.measureInWindow((x, y, w, h) => { if (w > 0) radial.open(x + w / 2, y + h / 2, color, onApply); });
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
