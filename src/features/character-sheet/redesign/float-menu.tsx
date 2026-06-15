import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, type SharedValue, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

import { Body, Display, Rune } from '@/constants/theme';
import { box } from '@/lib/design';

import { useCarousel } from '../carousel-context';
import { DeckToggleIcon } from './deck-toggle-icon';

/**
 * The float menu (#161/#162): the deck toggle no longer switches inv/arsenal on its own. PRESS it
 * and a radial wheel blooms over a full-screen dim — modeled on an FPS emote/spray wheel (Fortnite/
 * Valorant). The options are contiguous angular WEDGES around the trigger, not separate buttons:
 * wherever the finger points (past a center dead-zone) selects the wedge it's inside, with NO dead
 * gaps between options. Release on a wedge fires it; release in the dead-zone (or the open top) cancels.
 * A plain tap pins the wheel open so the labels can also be tapped directly. The trigger hugs the
 * upper-left corner, so the wheel is a ~225° arc opening up/right/down (the top-left is the gap).
 * Built with /impeccable craft, product register.
 */

export type PlaceholderKind = 'custom' | 'level' | 'rest' | 'modifiers' | 'cards';
type SlotKind = PlaceholderKind;

interface Slot {
  kind: SlotKind;
  label: string;
  disabled?: boolean;
}

// Trigger centre in DESIGN px (header group box(16,12) + child centre (65,237)).
const T = { x: 81, y: 249 };
const N = 5; // wedge count (#174: the Switch slot moved to the gear, 6 -> 5)
// Slot centre angles (deg, screen coords: 0 = +x right, -90 = straight up, +90 = straight down).
// Settings sits due-NORTH, the class-feature slot due-SOUTH (owner #168); the rest fan down the
// right side in between (the left half is the open cancel gap — the trigger hugs the left edge).
const CENTERS = [-90, -45, 0, 45, 90];
const STEP = 45; // angle between adjacent centres
const HALF = 22.5; // wedge half-width
const ARC_MIN = -112.5; // covered arc = CENTERS[0]-HALF .. CENTERS[last]+HALF
const ARC_MAX = 112.5;
const DEAD = 38; // center dead-zone radius (design px): inside = no selection
const RIN = 40; // wedge inner radius
const ROUT = 205; // wedge outer radius
const RLABEL = 148; // label-puck radius
const PW = 78; // puck width
const PH = 58; // puck height
const SVG_R = 230; // half the wedge SVG canvas (covers C ± SVG_R)
const TAP_SLOP = 12;

const SLOTS: Slot[] = [
  { kind: 'modifiers', label: 'Modifiers' }, // due-NORTH
  { kind: 'custom', label: 'New Card' },
  { kind: 'level', label: 'Level Up' },
  { kind: 'rest', label: 'Rest' },
  { kind: 'cards', label: 'Cards' }, // due-SOUTH (#227) — opens the category-toggle panel
  // Switch (inv/arsenal) is gone (#174): it now lives on the gear over-scroll at the carousel edge.
  // Wild Shape (#214) is NOT here — it's a Druid-only carousel category, not a float-menu slot.
];
const POS = SLOTS.map((_, i) => {
  const a = (CENTERS[i] * Math.PI) / 180;
  const x = Math.min(412 - PW / 2 - 6, Math.max(PW / 2 + 6, T.x + RLABEL * Math.cos(a)));
  const y = T.y + RLABEL * Math.sin(a);
  return { x, y };
});

/** Which wedge the finger is in (-1 = none/cancel). Pure angular hit-test (nearest centre) — no
 *  per-button hitboxes, so there are no dead gaps between options (the spray-wheel feel). */
function pickWedge(fx: number, fy: number): number {
  'worklet';
  const dx = fx - T.x;
  const dy = fy - T.y;
  if (Math.hypot(dx, dy) < DEAD) return -1;
  const a = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (a < ARC_MIN || a > ARC_MAX) return -1; // the open left half
  let i = Math.round((a + 90) / STEP);
  if (i < 0) i = 0;
  if (i >= N) i = N - 1;
  if (SLOTS[i].disabled) return -1;
  return i;
}

interface FloatMenuContextValue {
  open: boolean;
  pinned: boolean;
  progress: SharedValue<number>;
  dragging: SharedValue<number>;
  fingerX: SharedValue<number>;
  fingerY: SharedValue<number>;
  highlight: SharedValue<number>;
  scale: SharedValue<number>;
  openingSV: SharedValue<number>;
  openSV: SharedValue<number>;
  movedSV: SharedValue<number>;
  openMenu: () => void;
  closeMenu: () => void;
  pinMenu: () => void;
  select: (index: number) => void;
}

const FloatMenuContext = createContext<FloatMenuContextValue | null>(null);

function useFloatMenu() {
  const ctx = useContext(FloatMenuContext);
  if (!ctx) throw new Error('useFloatMenu must be used within a FloatMenuProvider');
  return ctx;
}

export function FloatMenuProvider({ children, onOpenInterface }: { children: ReactNode; onOpenInterface: (kind: PlaceholderKind) => void }) {
  const reduced = useReducedMotion();

  const progress = useSharedValue(0);
  const dragging = useSharedValue(0);
  const fingerX = useSharedValue(T.x);
  const fingerY = useSharedValue(T.y);
  const highlight = useSharedValue(-1);
  const scale = useSharedValue(1);
  const openingSV = useSharedValue(0);
  const openSV = useSharedValue(0);
  const movedSV = useSharedValue(0);

  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);

  const openMenu = useCallback(() => {
    setOpen(true);
    setPinned(false);
    openSV.value = 1;
    // Clear fade/bloom in (#201) — a timed ease-out reads as a fade, not a pop.
    if (reduced) progress.value = 1;
    else progress.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) });
  }, [openSV, progress, reduced]);

  // Close with a FADE-OUT (#239 item 9): the menu used to vanish in one frame (POP). The old freeze
  // (#168) came from a lingering *blocking* tap-scrim — that scrim only renders while `pinned`, so we
  // drop `pinned` first; the dim + wedges that remain during the fade are all pointer-transparent, so
  // nothing can strand even if the timing callback is dropped. Reduced motion still closes instantly.
  const closeMenu = useCallback(() => {
    setPinned(false);
    dragging.value = 0;
    highlight.value = -1;
    openingSV.value = 0;
    if (reduced) {
      progress.value = 0;
      openSV.value = 0;
      setOpen(false);
      return;
    }
    progress.value = withTiming(0, { duration: 180, easing: Easing.in(Easing.cubic) }, (fin) => {
      if (fin) {
        openSV.value = 0;
        runOnJS(setOpen)(false);
      }
    });
  }, [openSV, openingSV, dragging, highlight, progress, reduced]);

  const pinMenu = useCallback(() => setPinned(true), []);

  const select = useCallback(
    (index: number) => {
      const slot = SLOTS[index];
      if (!slot || slot.disabled) {
        closeMenu();
        return;
      }
      onOpenInterface(slot.kind);
      closeMenu();
    },
    [onOpenInterface, closeMenu],
  );

  const value = useMemo<FloatMenuContextValue>(
    () => ({ open, pinned, progress, dragging, fingerX, fingerY, highlight, scale, openingSV, openSV, movedSV, openMenu, closeMenu, pinMenu, select }),
    [open, pinned, progress, dragging, fingerX, fingerY, highlight, scale, openingSV, openSV, movedSV, openMenu, closeMenu, pinMenu, select],
  );

  return <FloatMenuContext.Provider value={value}>{children}</FloatMenuContext.Provider>;
}

/** The trigger: the deck-toggle icon, now wrapped in the radial-menu gesture. Always mounted, so its
 *  measured on-screen width gives the DesignStage scale (screen-px drag ÷ scale = design px). */
export function FloatMenuTrigger() {
  const { category } = useCarousel();
  const { scale, fingerX, fingerY, highlight, dragging, openingSV, openSV, movedSV, openMenu, closeMenu, pinMenu, select } = useFloatMenu();
  const ref = useRef<View>(null);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin(() => {
          'worklet';
          movedSV.value = 0;
          dragging.value = 1;
          fingerX.value = T.x;
          fingerY.value = T.y;
          highlight.value = -1;
          if (openSV.value === 0) {
            openingSV.value = 1;
            runOnJS(openMenu)();
          } else {
            openingSV.value = 0;
          }
        })
        .onUpdate((e) => {
          'worklet';
          const s = scale.value > 0 ? scale.value : 1;
          const fx = T.x + e.translationX / s;
          const fy = T.y + e.translationY / s;
          fingerX.value = fx;
          fingerY.value = fy;
          if (Math.hypot(fx - T.x, fy - T.y) > TAP_SLOP) movedSV.value = 1;
          highlight.value = pickWedge(fx, fy);
        })
        .onFinalize(() => {
          'worklet';
          dragging.value = 0;
          if (movedSV.value === 1) {
            if (highlight.value >= 0) runOnJS(select)(highlight.value);
            else runOnJS(closeMenu)();
          } else if (openingSV.value === 1) {
            runOnJS(pinMenu)();
          } else {
            runOnJS(closeMenu)();
          }
          highlight.value = -1;
        }),
    [scale, fingerX, fingerY, highlight, dragging, openingSV, openSV, movedSV, openMenu, closeMenu, pinMenu, select],
  );

  return (
    <GestureDetector gesture={gesture}>
      <View
        ref={ref}
        style={box(55, 223, 52, 52)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`Card deck: ${category}. Opens the actions menu`}
        accessibilityHint="Open the radial menu to switch decks, rest, level up, and more"
        onLayout={() => ref.current?.measureInWindow((_x, _y, w) => { if (w > 0) scale.value = w / 52; })}>
        <DeckToggleIcon category={category} />
      </View>
    </GestureDetector>
  );
}

function MenuIcon({ kind }: { kind: SlotKind }) {
  const g = Rune.goldText;
  const sw = 2.2;
  const common = { stroke: g, strokeWidth: sw, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (kind) {
    case 'custom':
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24">
          <Rect x={5} y={3.5} width={14} height={17} rx={2} {...common} />
          <Line x1={12} y1={8} x2={12} y2={16} {...common} />
          <Line x1={8} y1={12} x2={16} y2={12} {...common} />
        </Svg>
      );
    case 'level':
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24">
          <Polyline points="5,12 12,5 19,12" {...common} />
          <Polyline points="5,18 12,11 19,18" {...common} />
        </Svg>
      );
    case 'rest':
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24">
          <Path d="M20 14.5A8 8 0 1 1 9.5 4 6.2 6.2 0 0 0 20 14.5Z" {...common} />
        </Svg>
      );
    case 'cards':
      // a small stack of cards — the category-toggle panel
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24">
          <Rect x={7} y={5} width={12} height={15} rx={2} {...common} transform="rotate(8 13 12)" />
          <Rect x={5} y={4} width={12} height={15} rx={2} {...common} />
        </Svg>
      );
    case 'modifiers':
      // equalizer/sliders — base stats with adjustments stacked on top
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24">
          <Line x1={5} y1={7} x2={19} y2={7} {...common} />
          <Circle cx={9} cy={7} r={1.6} {...common} fill={g} />
          <Line x1={5} y1={12} x2={19} y2={12} {...common} />
          <Circle cx={15} cy={12} r={1.6} {...common} fill={g} />
          <Line x1={5} y1={17} x2={19} y2={17} {...common} />
          <Circle cx={11} cy={17} r={1.6} {...common} fill={g} />
        </Svg>
      );
    default:
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24">
          <Line x1={7} y1={12} x2={17} y2={12} stroke={Rune.muted} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );
  }
}

/** One annular-sector path (local SVG coords, centre at SVG_R,SVG_R). */
function sectorPath(a0: number, a1: number, ri: number, ro: number): string {
  const p = (r: number, aDeg: number) => {
    const a = (aDeg * Math.PI) / 180;
    return [SVG_R + r * Math.cos(a), SVG_R + r * Math.sin(a)];
  };
  const [x0, y0] = p(ro, a0);
  const [x1, y1] = p(ro, a1);
  const [x2, y2] = p(ri, a1);
  const [x3, y3] = p(ri, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0},${y0} A${ro},${ro} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${ri},${ri} 0 ${large} 0 ${x3},${y3} Z`;
}

function FloatPuck({ index }: { index: number }) {
  const { progress, highlight, pinned, select } = useFloatMenu();
  const slot = SLOTS[index];
  const pos = POS[index];
  const left = pos.x - PW / 2;
  const top = pos.y - PH / 2;

  const entrance = useAnimatedStyle(() => {
    const p = progress.value;
    const on = highlight.value === index ? 1 : 0;
    return {
      opacity: p,
      transform: [{ translateX: (T.x - pos.x) * (1 - p) }, { translateY: (T.y - pos.y) * (1 - p) }, { scale: (0.5 + 0.5 * p) * (1 + 0.08 * on) }],
    };
  });

  return (
    <Animated.View style={[box(left, top, PW, PH), entrance]} pointerEvents={pinned ? 'box-none' : 'none'}>
      <Pressable
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        disabled={!pinned || slot.disabled}
        onPress={pinned && !slot.disabled ? () => select(index) : undefined}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityState={{ disabled: slot.disabled }}
        accessibilityLabel={slot.disabled ? 'Empty slot' : slot.label}>
        <View style={box((PW - 24) / 2, 8, 24, 24)} pointerEvents="none">
          <MenuIcon kind={slot.kind} />
        </View>
        {!slot.disabled ? (
          <Text numberOfLines={1} style={{ position: 'absolute', left: 2, top: 35, width: PW - 4, textAlign: 'center', color: Rune.goldText, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            {slot.label}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/** The dim + wedge ring + connector line + finger dot + fanned labels. Wrapped in ONE high-zIndex
 *  layer so the whole sheet (stat icons AND cards) sits UNDER the dim and can't be touched (#161). */
export function FloatMenuOverlay() {
  const { open, pinned, progress, dragging, fingerX, fingerY, highlight, closeMenu, select } = useFloatMenu();
  const [hl, setHl] = useState(-1);
  useAnimatedReaction(
    () => highlight.value,
    (v, prev) => {
      if (v !== prev) runOnJS(setHl)(v);
    },
  );

  const dim = useAnimatedStyle(() => ({ opacity: progress.value * 0.72 }));
  const ring = useAnimatedStyle(() => ({ opacity: progress.value }));
  const line = useAnimatedStyle(() => {
    const dx = fingerX.value - T.x;
    const dy = fingerY.value - T.y;
    return { width: Math.hypot(dx, dy), opacity: dragging.value, transform: [{ rotateZ: `${Math.atan2(dy, dx)}rad` }] };
  });
  const dot = useAnimatedStyle(() => ({ opacity: dragging.value, transform: [{ translateX: fingerX.value - 7 }, { translateY: fingerY.value - 7 }] }));

  if (!open) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 9999 }]} pointerEvents="box-none">
      {/* full-screen dim (oversized past the unclipped stage → square corners, reaches the edges) */}
      <Animated.View style={[box(-220, -220, 852, 1332), { backgroundColor: '#06080d' }, dim]} pointerEvents="none" />
      {/* tap-scrim: while pinned, a tap anywhere inside a wedge's angular area selects it (#190 —
          the whole wedge is the hitbox, not just the small puck); a tap in the cancel gap closes.
          The scrim sits at design (-220,-220), so design coords = local locationX/Y - 220. */}
      {pinned ? (
        <Pressable
          style={box(-220, -220, 852, 1332)}
          onPress={(e) => {
            const w = pickWedge(e.nativeEvent.locationX - 220, e.nativeEvent.locationY - 220);
            if (w >= 0) select(w);
            else closeMenu();
          }}
          accessibilityRole="button"
          accessibilityLabel="Close menu"
        />
      ) : null}
      {/* the wedge ring: contiguous annular sectors, the selected one lit. The SVG is centred on the
          trigger and overdraws left (off-screen) so the down-left wedge is whole. */}
      <Animated.View style={[box(T.x - SVG_R, T.y - SVG_R, SVG_R * 2, SVG_R * 2), ring]} pointerEvents="none">
        <Svg width={SVG_R * 2} height={SVG_R * 2}>
          {SLOTS.map((slot, i) => {
            const a0 = CENTERS[i] - HALF;
            const a1 = CENTERS[i] + HALF;
            const sel = hl === i;
            return (
              <Path
                key={slot.kind}
                d={sectorPath(a0 + 1.2, a1 - 1.2, RIN, ROUT)}
                fill={sel ? 'rgba(200,27,24,0.5)' : slot.disabled ? 'rgba(147,142,136,0.08)' : 'rgba(20,24,31,0.55)'}
                stroke={sel ? Rune.goldBright : 'rgba(218,162,73,0.5)'}
                strokeWidth={sel ? 2 : 1.2}
                strokeLinejoin="round"
              />
            );
          })}
        </Svg>
      </Animated.View>
      {/* connector line + finger dot (drag feedback) */}
      <Animated.View style={[{ position: 'absolute', left: T.x, top: T.y - 1.5, height: 3, backgroundColor: Rune.goldBright, transformOrigin: 'left center' }, line]} pointerEvents="none" />
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: Rune.goldBright }, dot]} pointerEvents="none" />
      {SLOTS.map((slot, i) => (
        <FloatPuck key={slot.kind} index={i} />
      ))}
    </View>
  );
}

/** Stub interface for any not-yet-built option. Opens an empty on-brand panel; replaced by the real
 *  interface in its own PR (#161). */
export function FloatPlaceholder({ kind, onClose }: { kind: PlaceholderKind; onClose: () => void }) {
  const TITLE: Record<PlaceholderKind, string> = { custom: 'New Card', level: 'Level Up', rest: 'Rest', modifiers: 'Modifiers', cards: 'Cards' };
  const W = 320;
  const H = 220;
  const c = 18;
  const pts = `${c},0 ${W - c},0 ${W},${c} ${W},${H - c} ${W - c},${H} ${c},${H} 0,${H - c} 0,${c}`;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
      <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,8,13,0.82)' }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <View style={{ width: W, height: H }}>
        <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
          <Polyline points={`${pts} ${c},0`} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} strokeLinejoin="miter" />
        </Svg>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
          <Text style={{ color: Rune.goldText, fontSize: 26, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' }}>{TITLE[kind]}</Text>
          <Text style={{ marginTop: 12, color: Rune.muted, fontSize: 13, fontFamily: Body.medium, textAlign: 'center' }}>This interface is coming soon.</Text>
          <Text style={{ marginTop: 22, color: Rune.goldText, fontSize: 12, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>Tap anywhere to close</Text>
        </View>
      </View>
    </View>
  );
}
