/**
 * StatPulse (v0.15.0, PRD #8/#38-41) — the DM's compact heartbeat stat control.
 *
 * Interaction (as specified by the owner; a deliberate reading of item 8):
 *  - TAP the icon  → toggle the mode (increase ↔ decrease). No value change; the +/− badge + colour flip.
 *  - HOLD the icon → a heartbeat: after a short arm it reaches an activation point and applies one step,
 *    dwells, then keeps returning to that activation point (one step per beat) while held — ACCELERATING,
 *    with a per-beat tick whose pitch RISES with the count, so the DM can hear how many steps landed
 *    without watching the number.
 *  - TAP the number → the app's keypad to set an exact value (empty = no change; handled by the parent).
 *
 * The beat loop is JS-timer driven (not a worklet) — it's a slow ~2–8 Hz cadence, not a 60fps animation;
 * only the per-beat POP is Reanimated. A whole press→release hold is ONE logical change (onHoldStart /
 * onHoldEnd bracket it) so the encounter log records one entry per hold, not one per beat (PRD #46).
 *
 * ponytail: timer-driven beats, not a worklet loop — fine at this cadence; revisit only if it ever needs
 * frame-accurate sync with the pop.
 */
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { Body, Display, DmRune } from '@/constants/theme';
import { playSfx } from '@/lib/sfx';
import { StatGlyph, type StatGlyphKind } from './stat-glyphs';

const ARM_MS = 230; // press held past this = a HOLD (a heartbeat), shorter = a mode-toggle TAP
const FIRST_BEAT_MS = 210; // dwell after arming before the first step lands
const MIN_INTERVAL = 130;
const START_INTERVAL = 460;
const ACCEL = 0.82; // each beat's interval shrinks toward MIN_INTERVAL

export function StatPulse({
  kind,
  value,
  max,
  disabled,
  compact,
  onStep,
  onRequestSet,
  onHoldStart,
  onHoldEnd,
}: {
  kind: StatGlyphKind;
  value: number;
  max: number;
  disabled?: boolean;
  compact?: boolean;
  onStep: (dir: 1 | -1) => void;
  onRequestSet: () => void;
  onHoldStart?: () => void;
  onHoldEnd?: () => void;
}): ReactNode {
  const [mode, setMode] = useState<1 | -1>(-1); // decrease is the common DM action (dealing damage)
  const scale = useSharedValue(1);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holding = useRef(false);
  const beatCount = useRef(0);
  const interval = useRef(START_INTERVAL);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const clearTimers = useCallback(() => {
    if (armTimer.current) { clearTimeout(armTimer.current); armTimer.current = null; }
    if (beatTimer.current) { clearTimeout(beatTimer.current); beatTimer.current = null; }
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const pop = useCallback(() => {
    scale.value = withSequence(withTiming(1.32, { duration: 90 }), withTiming(1, { duration: 150 }));
  }, [scale]);

  const beat = useCallback(() => {
    onStep(modeRef.current);
    pop();
    // rising pitch per beat = the audible step counter (PRD #40); capped so it never shrieks
    playSfx('numpadPress', { cents: Math.min(beatCount.current * 55, 900), vary: false });
    beatCount.current += 1;
    interval.current = Math.max(MIN_INTERVAL, interval.current * ACCEL);
    beatTimer.current = setTimeout(beat, interval.current);
  }, [onStep, pop]);

  const startHold = useCallback(() => {
    holding.current = true;
    beatCount.current = 0;
    interval.current = START_INTERVAL;
    onHoldStart?.();
    beatTimer.current = setTimeout(beat, FIRST_BEAT_MS);
  }, [beat, onHoldStart]);

  const onPressIn = useCallback(() => {
    if (disabled) return;
    armTimer.current = setTimeout(() => { armTimer.current = null; startHold(); }, ARM_MS);
  }, [disabled, startHold]);

  const onPressOut = useCallback(() => {
    if (disabled) return;
    const wasArming = armTimer.current !== null;
    clearTimers();
    if (holding.current) {
      holding.current = false;
      onHoldEnd?.();
    } else if (wasArming) {
      // released before the hold armed → a TAP: toggle mode
      setMode((m) => (m === 1 ? -1 : 1));
      playSfx('buttonTap', { vary: true });
      scale.value = withSequence(withTiming(0.86, { duration: 70 }), withTiming(1, { duration: 130 }));
    }
  }, [disabled, clearTimers, onHoldEnd, scale]);

  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const up = mode === 1;
  const iconColor = disabled ? DmRune.muted : up ? DmRune.accent : DmRune.red;
  const glyphSize = compact ? 16 : 20;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 5 : 7 }}>
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        accessibilityRole="adjustable"
        accessibilityLabel={`${kind}, ${value} of ${max}, mode ${up ? 'increase' : 'decrease'}. Tap to toggle, hold to change.`}
        hitSlop={6}>
        <Animated.View style={[anim, { alignItems: 'center', justifyContent: 'center' }]}>
          <StatGlyph kind={kind} color={iconColor} size={glyphSize} />
          {!disabled ? (
            <Text style={{ position: 'absolute', top: -6, right: -8, color: iconColor, fontSize: 11, fontFamily: Display.black }}>{up ? '+' : '−'}</Text>
          ) : null}
        </Animated.View>
      </Pressable>
      <Pressable onPress={disabled ? undefined : onRequestSet} disabled={disabled} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Set ${kind}`}>
        <Text style={{ color: DmRune.ivory, fontSize: compact ? 13 : 15, fontFamily: Display.black, letterSpacing: 0.4 }}>
          {value}
          <Text style={{ color: DmRune.muted, fontSize: compact ? 10 : 11, fontFamily: Body.bold }}>/{max}</Text>
        </Text>
      </Pressable>
    </View>
  );
}
