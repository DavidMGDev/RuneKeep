import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { ChamferBox } from '@/components/chamfer-box';
import { Body, Display, Rune } from '@/constants/theme';
import { TARGET_LABEL } from '@/lib/modifiers';

import type { Character } from '../character';

/** One stat-change toast (#233): a labelled signed delta, e.g. +1 Finesse. */
export interface StatToast {
  id: number;
  label: string;
  delta: number;
}

const TRAIT_KEYS = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'] as const;

/**
 * Diff two derived characters and produce one toast per stat that changed (#233) — used when a card
 * is enabled/disabled to show exactly what moved (post-cap, so it reflects the real applied delta).
 */
export function diffStatToasts(prev: Character, next: Character, startId: number): StatToast[] {
  const out: { label: string; delta: number }[] = [];
  for (const k of TRAIT_KEYS) {
    const d = (next.traits[k] ?? 0) - (prev.traits[k] ?? 0);
    if (d) out.push({ label: TARGET_LABEL[k], delta: d });
  }
  const pair = (label: string, a: number, b: number) => {
    if (b - a !== 0) out.push({ label, delta: b - a });
  };
  pair(TARGET_LABEL.evasion, prev.evasion, next.evasion);
  pair(TARGET_LABEL.proficiency, prev.proficiency, next.proficiency);
  pair(TARGET_LABEL.armorScore, prev.armorScore, next.armorScore);
  pair(TARGET_LABEL.maxHp, prev.maxHp, next.maxHp);
  pair(TARGET_LABEL.stressMax, prev.stress.total - (prev.stress.locked ?? 0), next.stress.total - (next.stress.locked ?? 0));
  pair(TARGET_LABEL.hopeMax, prev.hope.total, next.hope.total);
  pair(TARGET_LABEL.majorThreshold, prev.damageThresholds.major, next.damageThresholds.major);
  pair(TARGET_LABEL.severeThreshold, prev.damageThresholds.severe, next.damageThresholds.severe);
  return out.map((o, i) => ({ id: startId + i, ...o }));
}

function ToastPill({ toast, onExpire }: { toast: StatToast; onExpire: (id: number) => void }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = reduced ? 1 : withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
    const t = setTimeout(() => {
      p.value = withTiming(0, { duration: 260, easing: Easing.in(Easing.cubic) }, (f) => {
        if (f) runOnJS(onExpire)(toast.id);
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [p, reduced, toast.id, onExpire]);
  const style = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * -10 }] }));
  const gain = toast.delta >= 0;
  return (
    <Animated.View style={style}>
      <ChamferBox chamfer={7} fill="rgba(12,15,20,0.96)" stroke={gain ? Rune.goldEdge : '#7A3A32'} strokeWidth={1.2} style={{ paddingHorizontal: 13, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: gain ? Rune.goldBright : '#E2705A', fontSize: 15, fontFamily: Display.black }}>{gain ? `+${toast.delta}` : `${toast.delta}`}</Text>
        <Text style={{ color: Rune.sheet, fontSize: 12.5, fontFamily: Body.bold, letterSpacing: 0.3 }}>{toast.label}</Text>
      </ChamferBox>
    </Animated.View>
  );
}

/**
 * Stacked stat-change toasts (#233), pinned just below the top UI border. Layer-wise it renders under
 * the gold SheetFrame border; position-wise it sits at the top of the sheet. Each pill slides in,
 * holds, fades, and self-expires.
 */
export function StatToastHost({ toasts, onExpire }: { toasts: StatToast[]; onExpire: (id: number) => void }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 40, left: 0, right: 0, alignItems: 'center', zIndex: 50, gap: 6 }}>
      {toasts.map((t) => (
        <ToastPill key={t.id} toast={t} onExpire={onExpire} />
      ))}
    </View>
  );
}
