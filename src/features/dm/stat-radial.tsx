/**
 * Stat radial (v0.18.0 item 2; v0.19.0 trimmed) — the hold-to-edit wheel for DM stat pulses. A tap on a
 * stat's icon+number opens the keypad (handled by StatPulse); a short HOLD blooms this six-wedge wheel —
 * three up (+1/+2/+3), three down (−1/−2/−3). Drag the finger onto a wedge and release to fire; release in
 * the left/right gap, the centre dead-zone, or past the ring cancels. One shared host renders the wheel so
 * it never clips inside a scroll or panel; a StatPulse drives the finger from its own pan.
 *
 * ## v0.36: the transform around the SVG, which is the last difference left
 *
 * Fifth attempt. The four before it each removed something genuinely wrong (a gesture rebuilt
 * mid-gesture, an `AnimatedPath` with no animated props, an SVG mounted and unmounted inside a live
 * hold, both `useAnimatedReaction`s) and the app kept dying on the same phone, so what is left is not
 * a JavaScript fault at all: every callback here is guarded and every guard has stayed silent.
 *
 * One structural difference from the character sheet's float menu survived all four passes. That
 * component holds the same kind of wheel, on the same phones, and has never crashed, and it animates
 * **opacity only** on the view that contains its `<Svg>`. This one animated a TRANSFORM on that view:
 * a translate to the anchor plus a bloom scale, recomputed every frame by a worklet. Committing a
 * transform to a view whose children are react-native-svg nodes is a known Fabric failure, and it is
 * invisible to an error boundary because it does not happen in JavaScript.
 *
 * So the wheel is POSITIONED ONCE, in JavaScript, in the same callback that already sets its colour
 * and raises it, and from then on only its opacity animates. The bloom scale is gone rather than
 * moved: it was the only reason the container needed a transform, and a 180ms fade reads as a bloom
 * on its own. The connector line and the finger dot keep their transforms, because they are plain
 * Views and always have been.
 *
 * If it STILL crashes after this, the fault is native and a logcat is the only way forward.
 */
import { Component, createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, type SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { showToast } from '@/components/toast';
import { WHEEL_ENABLED } from './wheel-enabled';
import { DmType, Display, DmRune } from '@/constants/theme';
import { useFrame, windowToFrameX, windowToFrameY } from '@/hooks/use-layout';
import { RADIAL_WEDGES as WEDGES, WEDGE_HALF, WEDGE_RICON, WEDGE_RIN, WEDGE_ROUT } from './radial-wedges';
import { playSfx } from '@/lib/sfx';
import { useScreenDim } from '@/lib/screen-dim';

// The wheel's geometry lives in `radial-wedges` so it can be unit-tested (this module imports the
// theme, which Jest cannot load). Re-exported so existing call sites are unchanged.
export { pickWedge, RADIAL_WEDGES } from './radial-wedges';
const HALF = WEDGE_HALF;
const RIN = WEDGE_RIN;
const ROUT = WEDGE_ROUT;
const RICON = WEDGE_RICON;

/**
 * Run something that must never take the app down, and SAY so if it fails (v0.35.3).
 *
 * Three releases of "it still crashes" with nothing to go on. A guarded callback turns a JavaScript
 * fault here into a message naming it; if the app dies with no message, the fault is not JavaScript.
 */
function guard<T extends unknown[]>(what: string, fn: (...args: T) => void): (...args: T) => void {
  return (...args: T) => {
    try {
      fn(...args);
    } catch (e) {
      showToast(`Stat wheel (${what}): ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };
}

interface RadialCtx {
  progress: SharedValue<number>;
  anchorX: SharedValue<number>;
  anchorY: SharedValue<number>;
  fingerX: SharedValue<number>;
  fingerY: SharedValue<number>;
  active: SharedValue<number>; // 1 while a hold is live
  /**
   * The wedge under the finger, LAST REPORTED BY THE UI THREAD (v0.35.3). A shared value rather than a
   * second source of truth: the pan compares against it and only crosses the bridge when it changes.
   */
  lastWedge: SharedValue<number>;
  /** The host overlay's own origin, in FRAME space (v0.35). `measureInWindow` reports window pixels
   *  and everything else here is frame dp, so it is converted before it is stored. */
  hostX: SharedValue<number>;
  hostY: SharedValue<number>;
  open: (ax: number, ay: number, color: string, onApply: (delta: number) => void, touch?: { x: number; y: number }) => void;
  /** The finger has entered wedge `i` (-1 = the cancel gap). Called from the pan, on the JS thread. */
  setWedge: (i: number) => void;
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
  const active = useSharedValue(0);
  const lastWedge = useSharedValue(-1);
  const hostX = useSharedValue(0);
  const hostY = useSharedValue(0);

  const [color, setColor] = useState<string>(DmRune.accent);
  const [shown, setShown] = useState(false);
  const [hl, setHl] = useState(-1);
  /**
   * Where the wheel's top-left corner sits, as a PLAIN NUMBER PAIR (v0.36).
   *
   * This used to be a worklet reading `anchor - host - ROUT` every frame and writing it as a
   * transform. It only ever changes when the wheel opens, so it is React state now and the SVG's
   * container carries no transform at all.
   */
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const wedgeRef = useRef(-1);
  const applyRef = useRef<((d: number) => void) | null>(null);
  /** The host's measured origin in frame dp, on the JS side, so `pos` can be worked out here. */
  const hostPos = useRef({ x: 0, y: 0 });

  const open = useCallback(guard('open', (ax: number, ay: number, c: string, onApply: (d: number) => void, touch?: { x: number; y: number }) => {
    applyRef.current = onApply;
    // Place it from the last known origin immediately, then correct it when the fresh measure lands
    // (the host may have moved since layout: a scroll, a rotation, a panel). The correction arrives
    // inside the 180ms fade, so nothing is ever seen in the wrong place.
    setPos({ x: ax - hostPos.current.x - ROUT, y: ay - hostPos.current.y - ROUT });
    measureRef.current((hx, hy) => setPos({ x: ax - hx - ROUT, y: ay - hy - ROUT }));
    anchorX.value = ax; anchorY.value = ay;
    // v0.23.0: seed the cursor at the REAL touch point, not the anchor. Seeding it to the glyph
    // centre made the dot appear a finger-width away from the thumb until the first drag update.
    fingerX.value = touch?.x ?? ax; fingerY.value = touch?.y ?? ay;
    lastWedge.value = -1;
    wedgeRef.current = -1;
    active.value = 1;
    setHl(-1);
    setColor(c);
    setShown(true);
    progress.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) });
    playSfx('floatMenuOpen');
  }), [anchorX, anchorY, fingerX, fingerY, lastWedge, active, progress]);

  const close = useCallback(() => {
    active.value = 0;
    progress.value = withTiming(0, { duration: 150, easing: Easing.in(Easing.cubic) });
    lastWedge.value = -1;
    wedgeRef.current = -1;
    setHl(-1);
    setShown(false);
  }, [active, progress, lastWedge]);

  /** The finger moved into another wedge. On the JS thread, where a state setter and the audio engine
   *  both belong; the pan only calls it when the index actually changes. */
  const setWedge = useCallback(guard('highlight', (i: number) => {
    if (wedgeRef.current === i) return;
    wedgeRef.current = i;
    setHl(i);
    if (i >= 0) playSfx('floatMenuHighlight');
  }), []);

  const commit = useCallback(guard('commit', () => {
    const i = wedgeRef.current;
    if (i >= 0 && i < WEDGES.length && applyRef.current) {
      const w = WEDGES[i];
      applyRef.current(w.delta);
      playSfx('numpadPress', { cents: w.delta > 0 ? 300 : -200, vary: false });
    } else {
      playSfx('floatMenuClose');
    }
    applyRef.current = null;
    close();
  }), [close]);

  const cancel = useCallback(() => { applyRef.current = null; close(); }, [close]);

  const frameRef = useRef<View>(null);
  const frame = useFrame();
  const measureFrame = useCallback((then?: (x: number, y: number) => void) => {
    frameRef.current?.measureInWindow((x, y) => {
      const fx = windowToFrameX(x, frame);
      const fy = windowToFrameY(y, frame);
      hostX.value = fx; hostY.value = fy;
      hostPos.current = { x: fx, y: fy };
      then?.(fx, fy);
    });
  }, [hostX, hostY, frame]);
  // `open` is built once and must not be rebuilt when the frame changes, so it reaches the measure
  // through a ref rather than closing over it.
  const measureRef = useRef(measureFrame);
  measureRef.current = measureFrame;
  const value = useMemo<RadialCtx>(
    () => ({ progress, anchorX, anchorY, fingerX, fingerY, active, lastWedge, hostX, hostY, open, setWedge, commit, cancel }),
    [progress, anchorX, anchorY, fingerX, fingerY, active, lastWedge, hostX, hostY, open, setWedge, commit, cancel],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* A persistent, always-mounted full-screen sensor: its measured origin is the frame the
          absolute-fill wheel actually renders in, so subtracting it reconciles the measured anchor
          (item 4). Zero-cost — no paint, never interactive. */}
      <View ref={frameRef} pointerEvents="none" style={StyleSheet.absoluteFill} collapsable={false} onLayout={() => measureFrame()} />
      {/* v0.36.2 (owner): NOT DRAWN ON NATIVE. Five releases failed to stop this crashing an Android
          phone, every JavaScript guard stayed silent throughout, and the owner's call is to take it
          off the platform rather than attempt a sixth theory. Nothing here is mounted there, so
          there is no SVG, no worklet and no wheel to crash. `StatPulse` opens the keypad instead,
          which has its own plus and minus and the same clamps. */}
      {WHEEL_ENABLED ? (
        <RadialBoundary>
          <StatRadialHost color={color} shown={shown} hl={hl} pos={pos} />
        </RadialBoundary>
      ) : null}
    </Ctx.Provider>
  );
}

/** Anything that throws while DRAWING the wheel is named rather than fatal (v0.35.3). */
class RadialBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    showToast(`Stat wheel could not draw: ${error.message}`, 'error');
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function sector(cx: number, cy: number, a0: number, a1: number, ri: number, ro: number): string {
  const p = (r: number, aDeg: number) => { const a = (aDeg * Math.PI) / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const [x0, y0] = p(ro, a0); const [x1, y1] = p(ro, a1); const [x2, y2] = p(ri, a1); const [x3, y3] = p(ri, a0);
  return `M${x0},${y0} A${ro},${ro} 0 0 1 ${x1},${y1} L${x2},${y2} A${ri},${ri} 0 0 0 ${x3},${y3} Z`;
}

function StatRadialHost({ color, shown, hl, pos }: { color: string; shown: boolean; hl: number; pos: { x: number; y: number } }) {
  const { progress, anchorX, anchorY, fingerX, fingerY, hostX, hostY } = useStatRadial();

  // Anchor and finger are in frame space; so is the host's own origin (v0.35). Nothing here reads
  // React state on the UI thread and nothing writes it: these are the only worklets left.
  const dim = useAnimatedStyle(() => ({ opacity: progress.value * 0.34 }));
  /** v0.36: OPACITY ONLY. See the note at the top of this file — the wheel's position is `pos`,
   *  written once in JavaScript, so nothing commits a transform to the view holding the `<Svg>`. */
  const wheel = useAnimatedStyle(() => ({ opacity: progress.value }));
  const line = useAnimatedStyle(() => {
    const dx = fingerX.value - anchorX.value; const dy = fingerY.value - anchorY.value;
    return { width: Math.min(ROUT, Math.hypot(dx, dy)), opacity: progress.value, transform: [{ translateX: anchorX.value - hostX.value }, { translateY: anchorY.value - hostY.value - 1.5 }, { rotateZ: `${Math.atan2(dy, dx)}rad` }] };
  });
  const dot = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ translateX: fingerX.value - hostX.value - 7 }, { translateY: fingerY.value - hostY.value - 7 }] }));

  // v0.24.1: declare it so the tablet margins darken with the screen (lib/screen-dim).
  useScreenDim(shown ? 0.34 : 0);
  /**
   * ALWAYS MOUNTED, opacity-driven (v0.35.1, owner).
   *
   * This used to return null until the hold began, so the whole wheel, an `<Svg>` included, was
   * MOUNTED in the middle of a live gesture and UNMOUNTED again while its parent was still animating
   * out. Six paths behind `pointerEvents: none` at zero opacity cost nothing to leave up.
   */
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 9000 }]} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#06080d' }, dim]} />
      <Animated.View style={[{ position: 'absolute', left: pos.x, top: pos.y, width: ROUT * 2, height: ROUT * 2 }, wheel]}>
        <Svg width={ROUT * 2} height={ROUT * 2}>
          {WEDGES.map((w, i) => {
            const sel = hl === i;
            return (
              <Path
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
        {WEDGES.map((w, i) => {
          const a = (w.center * Math.PI) / 180;
          const x = ROUT + RICON * Math.cos(a); const y = ROUT + RICON * Math.sin(a);
          const sel = hl === i;
          return (
            <View key={i} style={{ position: 'absolute', left: x - 18, top: y - 12, width: 36, height: 24, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: sel ? DmRune.ink : DmRune.ivory, fontSize: DmType.title, fontFamily: Display.black, letterSpacing: 0.3 }}>{w.delta > 0 ? `+${w.delta}` : w.delta}</Text>
            </View>
          );
        })}
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, height: 3, backgroundColor: color, transformOrigin: 'left center' }, line]} />
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: color }, dot]} />
    </View>
  );
}
