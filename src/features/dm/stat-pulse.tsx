/**
 * StatPulse (v0.15.0; reworked v0.16.0, PRD #4/#6/#7/#13) — the DM's compact stat control.
 *
 * v0.16.0 changes from device testing:
 *  - Direction is GLOBAL now, not per-stat: a single corner `DirectionToggle` sets raise/lower for the
 *    whole screen, so the icons carry no ± and keep their sheet colour.
 *  - Icons are FILLED and GROW well above the fingertip while held, so you can see them under your finger.
 *  - TAP the icon = one step in the current global direction; HOLD = a repeating, accelerating heartbeat
 *    with a rising-pitch tick; TAP the number = the keypad for an exact value.
 *  - When disabled (member vitals before the encounter starts), a press fires `onBlocked` (a toast).
 *
 * The beat loop is JS-timer driven (~2–8 Hz), only the per-beat pop is Reanimated. A whole press→release
 * hold is ONE logical change (onHoldStart/onHoldEnd bracket it) so the log records one entry per hold.
 */
import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { Body, Display, DmRune } from '@/constants/theme';
import { playSfx } from '@/lib/sfx';
import { StatGlyph, STAT_COLOR, type StatGlyphKind } from './stat-glyphs';

const ARM_MS = 230; // press held past this = a HOLD; shorter = a single-step TAP
const FIRST_BEAT_MS = 200;
const MIN_INTERVAL = 130;
const START_INTERVAL = 460;
const ACCEL = 0.82;
const HOLD_GROW = 2.35; // icon swells well past the fingertip while held (PRD #4)

/** The screen-corner raise/lower control (PRD #4): one global direction for every StatPulse on screen. */
export function DirectionToggle({ dir, onChange }: { dir: 1 | -1; onChange: (d: 1 | -1) => void }) {
  const btn = (d: 1 | -1) => {
    const on = dir === d;
    return (
      <Pressable onPress={() => { onChange(d); playSfx('buttonTap', { vary: true }); }} accessibilityRole="button" accessibilityLabel={d === 1 ? 'Increase mode' : 'Decrease mode'} hitSlop={6}>
        <ChamferBox chamfer={7} fill={on ? (d === 1 ? DmRune.accent : DmRune.red) : 'rgba(14,17,22,0.9)'} stroke={on ? 'transparent' : DmRune.line} strokeWidth={1.3} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={20} height={20} viewBox="0 0 20 20">
            <Line x1={4} y1={10} x2={16} y2={10} stroke={on ? DmRune.ink : DmRune.accentDim} strokeWidth={2.6} strokeLinecap="round" />
            {d === 1 ? <Line x1={10} y1={4} x2={10} y2={16} stroke={on ? DmRune.ink : DmRune.accentDim} strokeWidth={2.6} strokeLinecap="round" /> : null}
          </Svg>
        </ChamferBox>
      </Pressable>
    );
  };
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {btn(1)}
      {btn(-1)}
    </View>
  );
}

export function StatPulse({
  kind,
  value,
  max,
  dir,
  disabled,
  onStep,
  onRequestSet,
  onBlocked,
  onHoldStart,
  onHoldEnd,
}: {
  kind: StatGlyphKind;
  value: number;
  max: number;
  dir: 1 | -1;
  disabled?: boolean;
  onStep: (dir: 1 | -1) => void;
  onRequestSet: () => void;
  onBlocked?: () => void;
  onHoldStart?: () => void;
  onHoldEnd?: () => void;
}): ReactNode {
  const scale = useSharedValue(1);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holding = useRef(false);
  const beatCount = useRef(0);
  const interval = useRef(START_INTERVAL);
  const dirRef = useRef(dir);
  dirRef.current = dir;

  const clearTimers = useCallback(() => {
    if (armTimer.current) { clearTimeout(armTimer.current); armTimer.current = null; }
    if (beatTimer.current) { clearTimeout(beatTimer.current); beatTimer.current = null; }
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const beat = useCallback(() => {
    onStep(dirRef.current);
    scale.value = withSequence(withTiming(HOLD_GROW * 1.12, { duration: 80 }), withTiming(HOLD_GROW, { duration: 130 }));
    playSfx('numpadPress', { cents: Math.min(beatCount.current * 55, 900), vary: false });
    beatCount.current += 1;
    interval.current = Math.max(MIN_INTERVAL, interval.current * ACCEL);
    beatTimer.current = setTimeout(beat, interval.current);
  }, [onStep, scale]);

  const startHold = useCallback(() => {
    holding.current = true;
    beatCount.current = 0;
    interval.current = START_INTERVAL;
    scale.value = withTiming(HOLD_GROW, { duration: 150 }); // swell above the finger
    onHoldStart?.();
    beatTimer.current = setTimeout(beat, FIRST_BEAT_MS);
  }, [beat, onHoldStart, scale]);

  const onPressIn = useCallback(() => {
    if (disabled) { onBlocked?.(); return; }
    armTimer.current = setTimeout(() => { armTimer.current = null; startHold(); }, ARM_MS);
  }, [disabled, onBlocked, startHold]);

  const onPressOut = useCallback(() => {
    if (disabled) return;
    const wasArming = armTimer.current !== null;
    clearTimers();
    if (holding.current) {
      holding.current = false;
      scale.value = withTiming(1, { duration: 180 });
      onHoldEnd?.();
    } else if (wasArming) {
      // released before the hold armed → a single step in the current direction
      onStep(dirRef.current);
      playSfx('numpadPress', { vary: true });
      scale.value = withSequence(withTiming(1.45, { duration: 90 }), withTiming(1, { duration: 150 }));
    }
  }, [disabled, clearTimers, onStep, onHoldEnd, scale]);

  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const color = STAT_COLOR[kind];

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="adjustable"
        accessibilityLabel={`${kind}, ${value} of ${max}. Tap to ${dir === 1 ? 'raise' : 'lower'}, hold to change fast.`}
        hitSlop={8}>
        {/* the growing icon needs headroom to expand over neighbours: a fixed box, glyph scales within */}
        <View style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={anim}>
            <StatGlyph kind={kind} color={disabled ? DmRune.muted : color} size={24} filled={!disabled} />
          </Animated.View>
        </View>
      </Pressable>
      <Pressable onPress={disabled ? onBlocked : onRequestSet} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Set ${kind}`}>
        <Text style={{ color: DmRune.ivory, fontSize: 21, fontFamily: Display.black, letterSpacing: 0.3 }}>
          {value}
          <Text style={{ color: DmRune.muted, fontSize: 12, fontFamily: Body.bold }}>/{max}</Text>
        </Text>
      </Pressable>
    </View>
  );
}
