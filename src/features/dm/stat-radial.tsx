/**
 * Stat radial (v0.18.0 item 2; v0.19.0 trimmed) — the hold-to-edit wheel for DM stat pulses. A tap on a
 * stat's icon+number opens the keypad (handled by StatPulse); a short HOLD blooms this six-wedge wheel —
 * three up (+1/+2/+3), three down (−1/−2/−3). Drag the finger onto a wedge and release to fire; release in
 * the left/right gap, the centre dead-zone, or past the ring cancels. One shared host renders the wheel in
 * WINDOW coordinates so it never clips inside a scroll or panel; a StatPulse drives the finger + highlight
 * shared values from its own pan. v0.19.0: particles dropped for a smoother, higher-FPS bloom (item 5).
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, runOnJS, type SharedValue, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Display, DmRune } from '@/constants/theme';
import { playSfx } from '@/lib/sfx';

// Six wedges. Top three read +1 +2 +3 left→right; bottom three read −1 −2 −3 left→right. The left and
// right sides (around ±0° and ±180°) are the cancel gaps.
export const RADIAL_WEDGES = [
  { center: -128, delta: 1 }, { center: -90, delta: 2 }, { center: -52, delta: 3 },
  { center: 128, delta: -1 }, { center: 90, delta: -2 }, { center: 52, delta: -3 },
];
const HALF = 19; // wedge half-width (deg)
const DEAD = 24; // centre dead-zone radius (window px)
const RIN = 32;
const ROUT = 96;
const RICON = 64;

/** Which wedge the finger points at (-1 = cancel). Pure angular + radial hit-test (worklet-safe). */
export function pickWedge(dx: number, dy: number): number {
  'worklet';
  const dist = Math.hypot(dx, dy);
  if (dist < DEAD || dist > ROUT + 26) return -1;
  const a = (Math.atan2(dy, dx) * 180) / Math.PI;
  for (let i = 0; i < RADIAL_WEDGES.length; i++) {
    let d = a - RADIAL_WEDGES[i].center;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    if (Math.abs(d) <= HALF) return i;
  }
  return -1;
}

interface RadialCtx {
  progress: SharedValue<number>;
  anchorX: SharedValue<number>;
  anchorY: SharedValue<number>;
  fingerX: SharedValue<number>;
  fingerY: SharedValue<number>;
  highlight: SharedValue<number>;
  active: SharedValue<number>; // 1 while a hold is live
  open: (ax: number, ay: number, color: string, onApply: (delta: number) => void) => void;
  commit: () => void;
  cancel: () => void;
}

const Ctx = createContext<RadialCtx | null>(null);
export function useStatRadial() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStatRadial must be used within a StatRadialProvider');
  return c;
}

export function StatRadialProvider({ children }: { children: React.ReactNode }) {
  const progress = useSharedValue(0);
  const anchorX = useSharedValue(0);
  const anchorY = useSharedValue(0);
  const fingerX = useSharedValue(0);
  const fingerY = useSharedValue(0);
  const highlight = useSharedValue(-1);
  const active = useSharedValue(0);

  const [color, setColor] = useState<string>(DmRune.accent);
  const applyRef = useRef<((d: number) => void) | null>(null);

  const open = useCallback((ax: number, ay: number, c: string, onApply: (d: number) => void) => {
    applyRef.current = onApply;
    anchorX.value = ax; anchorY.value = ay; fingerX.value = ax; fingerY.value = ay;
    highlight.value = -1; active.value = 1;
    setColor(c);
    progress.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) });
    playSfx('floatMenuOpen');
  }, [anchorX, anchorY, fingerX, fingerY, highlight, active, progress]);

  const close = useCallback(() => {
    active.value = 0;
    progress.value = withTiming(0, { duration: 150, easing: Easing.in(Easing.cubic) });
    highlight.value = -1;
  }, [active, progress, highlight]);

  const commit = useCallback(() => {
    const i = Math.round(highlight.value);
    if (i >= 0 && i < RADIAL_WEDGES.length && applyRef.current) {
      const w = RADIAL_WEDGES[i];
      applyRef.current(w.delta);
      playSfx('numpadPress', { cents: w.delta > 0 ? 300 : -200, vary: false });
    } else {
      playSfx('floatMenuClose');
    }
    applyRef.current = null;
    close();
  }, [highlight, close]);

  const cancel = useCallback(() => { applyRef.current = null; close(); }, [close]);

  const value = useMemo<RadialCtx>(() => ({ progress, anchorX, anchorY, fingerX, fingerY, highlight, active, open, commit, cancel }), [progress, anchorX, anchorY, fingerX, fingerY, highlight, active, open, commit, cancel]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <StatRadialHost color={color} />
    </Ctx.Provider>
  );
}

function sector(cx: number, cy: number, a0: number, a1: number, ri: number, ro: number): string {
  const p = (r: number, aDeg: number) => { const a = (aDeg * Math.PI) / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const [x0, y0] = p(ro, a0); const [x1, y1] = p(ro, a1); const [x2, y2] = p(ri, a1); const [x3, y3] = p(ri, a0);
  return `M${x0},${y0} A${ro},${ro} 0 0 1 ${x1},${y1} L${x2},${y2} A${ri},${ri} 0 0 0 ${x3},${y3} Z`;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

function StatRadialHost({ color }: { color: string }) {
  const { progress, anchorX, anchorY, fingerX, fingerY, highlight } = useStatRadial();
  const [hl, setHl] = useState(-1);
  const [shown, setShown] = useState(false);
  useAnimatedReaction(() => progress.value > 0.001, (v, prev) => { if (v !== prev) runOnJS(setShown)(v); });
  useAnimatedReaction(() => Math.round(highlight.value), (v, prev) => {
    if (v !== prev) { runOnJS(setHl)(v); if (v >= 0) runOnJS(playSfx)('floatMenuHighlight'); }
  });

  const dim = useAnimatedStyle(() => ({ opacity: progress.value * 0.34 }));
  const wheel = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateX: anchorX.value - ROUT }, { translateY: anchorY.value - ROUT }, { scale: 0.72 + 0.28 * progress.value }],
  }));
  const line = useAnimatedStyle(() => {
    const dx = fingerX.value - anchorX.value; const dy = fingerY.value - anchorY.value;
    return { width: Math.min(ROUT, Math.hypot(dx, dy)), opacity: progress.value, transform: [{ translateX: anchorX.value }, { translateY: anchorY.value - 1.5 }, { rotateZ: `${Math.atan2(dy, dx)}rad` }] };
  });
  const dot = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ translateX: fingerX.value - 7 }, { translateY: fingerY.value - 7 }] }));

  if (!shown) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 9000 }]} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#06080d' }, dim]} />
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: ROUT * 2, height: ROUT * 2 }, wheel]}>
        <Svg width={ROUT * 2} height={ROUT * 2}>
          {RADIAL_WEDGES.map((w, i) => {
            const sel = hl === i;
            return (
              <AnimatedPath
                key={i}
                d={sector(ROUT, ROUT, w.center - HALF + 2, w.center + HALF - 2, RIN, ROUT)}
                fill={sel ? color : 'rgba(20,24,31,0.82)'}
                stroke={sel ? DmRune.ivory : 'rgba(196,200,208,0.5)'}
                strokeWidth={sel ? 2.4 : 1.2}
                strokeLinejoin="round"
                opacity={sel ? 0.95 : 0.9}
              />
            );
          })}
        </Svg>
        {RADIAL_WEDGES.map((w, i) => {
          const a = (w.center * Math.PI) / 180;
          const x = ROUT + RICON * Math.cos(a); const y = ROUT + RICON * Math.sin(a);
          const sel = hl === i;
          return (
            <View key={i} style={{ position: 'absolute', left: x - 18, top: y - 12, width: 36, height: 24, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: sel ? DmRune.ink : DmRune.ivory, fontSize: 16, fontFamily: Display.black, letterSpacing: 0.3 }}>{w.delta > 0 ? `+${w.delta}` : w.delta}</Text>
            </View>
          );
        })}
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, height: 3, backgroundColor: color, transformOrigin: 'left center' }, line]} />
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: color }, dot]} />
    </View>
  );
}
