import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, type SharedValue, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

import { Body, Display, Rune } from '@/constants/theme';
import { box } from '@/lib/design';

import { useCarousel } from '../carousel-context';
import { DeckToggleIcon } from './deck-toggle-icon';
import { ChamferFrame } from './chamfer';

/**
 * The float menu (#161): the deck toggle no longer switches inv/arsenal on its own. PRESS it and a
 * radial menu blooms over a full-screen dim — Canva/PowerPoint pie style. From the press you can
 * either DRAG toward an option (a line follows your finger; the nearest option highlights; release
 * on it fires, release back near the button cancels) OR just tap to PIN it open and then tap an
 * option. The button sits in the upper-left corner, so the options fan into the open right/down arc
 * rather than a full compass rose (owner pick). Built with /impeccable craft, product register.
 */

export type PlaceholderKind = 'custom' | 'level' | 'rest' | 'settings';
type SlotKind = 'switch' | PlaceholderKind | 'classfeat';

interface Slot {
  kind: SlotKind;
  label: string;
  angle: number; // degrees, screen coords (0 = +x right, +90 = down)
  disabled?: boolean;
}

// Trigger centre in DESIGN px (header group box(16,12) + child centre (65,237)).
const T = { x: 81, y: 249 };
const R = 150; // puck-ring radius (design px)
const PW = 88; // puck width
const PH = 66; // puck height
const TAP_SLOP = 12; // movement under this on release = a tap (pin), not a drag-select
const DEAD = 46; // no option highlights while the finger is within this of the trigger (cancel zone)
const PICK = 60; // highlight an option when the finger is within this of its centre

// Fanned into the open arc (the trigger hugs the left edge, so a due-west arm won't fit). Switch is
// due-right (a quick flick-right + release does the old toggle); the disabled class-feature slot
// (druid wild shape etc., #161 — left empty on purpose) tucks at the bottom.
const SLOTS: Slot[] = [
  { kind: 'settings', label: 'Settings', angle: -55 },
  { kind: 'custom', label: 'New Card', angle: -25 },
  { kind: 'switch', label: 'Switch', angle: 5 },
  { kind: 'level', label: 'Level Up', angle: 35 },
  { kind: 'rest', label: 'Rest', angle: 65 },
  { kind: 'classfeat', label: '—', angle: 95, disabled: true },
];
const POS = SLOTS.map((s) => ({ x: T.x + R * Math.cos((s.angle * Math.PI) / 180), y: T.y + R * Math.sin((s.angle * Math.PI) / 180) }));

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
  const { toggleCategory } = useCarousel();
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
    if (reduced) progress.value = 1;
    else progress.value = withSpring(1, { damping: 16, stiffness: 210, mass: 0.7 });
  }, [openSV, progress, reduced]);

  const closeMenu = useCallback(() => {
    setPinned(false);
    openSV.value = 0;
    openingSV.value = 0;
    dragging.value = 0;
    highlight.value = -1;
    if (reduced) {
      progress.value = 0;
      setOpen(false);
    } else {
      progress.value = withTiming(0, { duration: 160 }, (finished) => {
        if (finished) runOnJS(setOpen)(false);
      });
    }
  }, [openSV, openingSV, dragging, highlight, progress, reduced]);

  const pinMenu = useCallback(() => {
    setPinned(true);
  }, []);

  const select = useCallback(
    (index: number) => {
      const slot = SLOTS[index];
      if (!slot || slot.disabled) {
        closeMenu();
        return;
      }
      if (slot.kind === 'switch') toggleCategory();
      else onOpenInterface(slot.kind as PlaceholderKind); // disabled (classfeat) already returned above
      closeMenu();
    },
    [toggleCategory, onOpenInterface, closeMenu],
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
          const dT = Math.hypot(fx - T.x, fy - T.y);
          if (dT > TAP_SLOP) movedSV.value = 1;
          let best = -1;
          let bd = PICK;
          for (let i = 0; i < POS.length; i++) {
            if (SLOTS[i].disabled) continue;
            const d = Math.hypot(fx - POS[i].x, fy - POS[i].y);
            if (d < bd) {
              bd = d;
              best = i;
            }
          }
          if (dT < DEAD) best = -1;
          highlight.value = best;
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
    case 'switch':
      return (
        <Svg width={26} height={26} viewBox="0 0 24 24">
          <Polyline points="4,8 18,8" {...common} />
          <Polyline points="15,5 18,8 15,11" {...common} />
          <Polyline points="20,16 6,16" {...common} />
          <Polyline points="9,13 6,16 9,19" {...common} />
        </Svg>
      );
    case 'custom':
      return (
        <Svg width={26} height={26} viewBox="0 0 24 24">
          <Rect x={5} y={3.5} width={14} height={17} rx={2} {...common} />
          <Line x1={12} y1={8} x2={12} y2={16} {...common} />
          <Line x1={8} y1={12} x2={16} y2={12} {...common} />
        </Svg>
      );
    case 'level':
      return (
        <Svg width={26} height={26} viewBox="0 0 24 24">
          <Polyline points="5,12 12,5 19,12" {...common} />
          <Polyline points="5,18 12,11 19,18" {...common} />
        </Svg>
      );
    case 'rest':
      return (
        <Svg width={26} height={26} viewBox="0 0 24 24">
          <Path d="M20 14.5A8 8 0 1 1 9.5 4 6.2 6.2 0 0 0 20 14.5Z" {...common} />
        </Svg>
      );
    case 'settings':
      return (
        <Svg width={26} height={26} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={3.2} {...common} />
          <Path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" {...common} />
        </Svg>
      );
    default:
      return (
        <Svg width={26} height={26} viewBox="0 0 24 24">
          <Line x1={7} y1={12} x2={17} y2={12} stroke={Rune.muted} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );
  }
}

function FloatPuck({ index }: { index: number }) {
  const { progress, highlight, pinned, select } = useFloatMenu();
  const slot = SLOTS[index];
  const pos = POS[index];
  const left = pos.x - PW / 2;
  const top = pos.y - PH / 2;

  const entrance = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: p,
      transform: [{ translateX: (T.x - pos.x) * (1 - p) }, { translateY: (T.y - pos.y) * (1 - p) }, { scale: 0.5 + 0.5 * p }],
    };
  });
  const inner = useAnimatedStyle(() => ({ transform: [{ scale: highlight.value === index ? 1.08 : 1 }] }));
  const red = useAnimatedStyle(() => ({ opacity: highlight.value === index ? 1 : 0 }));

  const labelColor = slot.disabled ? Rune.muted : Rune.goldText;

  return (
    <Animated.View style={[box(left, top, PW, PH), entrance]} pointerEvents={pinned ? 'box-none' : 'none'}>
      <Pressable
        style={{ flex: 1 }}
        disabled={!pinned || slot.disabled}
        onPress={pinned && !slot.disabled ? () => select(index) : undefined}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityState={{ disabled: slot.disabled }}
        accessibilityLabel={slot.disabled ? 'Empty slot' : slot.label}>
        <Animated.View style={[{ flex: 1 }, inner]}>
          <ChamferFrame left={0} top={0} width={PW} height={PH} chamfer={12} fill={Rune.panel} stroke={slot.disabled ? Rune.muted : Rune.goldEdge} strokeWidth={1.6} />
          <Animated.View style={[box(0, 0, PW, PH), red]} pointerEvents="none">
            <ChamferFrame left={0} top={0} width={PW} height={PH} chamfer={12} fill={Rune.red} stroke="transparent" strokeWidth={0} />
          </Animated.View>
          <View style={box((PW - 26) / 2, 9, 26, 26)} pointerEvents="none">
            <MenuIcon kind={slot.kind} />
          </View>
          {!slot.disabled ? (
            <Text numberOfLines={1} style={{ position: 'absolute', left: 3, top: 38, width: PW - 6, textAlign: 'center', color: labelColor, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>
              {slot.label}
            </Text>
          ) : null}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/** The dim + connector line + finger dot + fanned pucks. Rendered ABOVE the carousel, inside the
 *  DesignStage (design-px coords). Mounts only while the menu is open (animates in/out via progress). */
export function FloatMenuOverlay() {
  const { open, pinned, progress, dragging, fingerX, fingerY, closeMenu } = useFloatMenu();

  const dim = useAnimatedStyle(() => ({ opacity: progress.value * 0.72 }));
  const line = useAnimatedStyle(() => {
    const dx = fingerX.value - T.x;
    const dy = fingerY.value - T.y;
    return { width: Math.hypot(dx, dy), opacity: dragging.value, transform: [{ rotateZ: `${Math.atan2(dy, dx)}rad` }] };
  });
  const dot = useAnimatedStyle(() => ({ opacity: dragging.value, transform: [{ translateX: fingerX.value - 7 }, { translateY: fingerY.value - 7 }] }));

  if (!open) return null;
  return (
    <>
      {/* full-screen dim, oversized past the (unclipped) stage so it reaches the physical edges with
          square corners — one unified color, matching ExpandVeil (#161 / #30 B). */}
      <Animated.View style={[box(-220, -220, 852, 1332), { backgroundColor: '#06080d' }, dim]} pointerEvents="none" />
      {pinned ? <Pressable style={box(-220, -220, 852, 1332)} onPress={closeMenu} accessibilityRole="button" accessibilityLabel="Close menu" /> : null}
      {/* connector line from the trigger to the finger (drag mode only) */}
      <Animated.View style={[{ position: 'absolute', left: T.x, top: T.y - 1.5, height: 3, backgroundColor: Rune.goldBright, transformOrigin: 'left center' }, line]} pointerEvents="none" />
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: Rune.goldBright }, dot]} pointerEvents="none" />
      {SLOTS.map((slot, i) => (
        <FloatPuck key={slot.kind} index={i} />
      ))}
    </>
  );
}

/** Stub interface for the not-yet-built options (Rest / Level Up / New Card / Settings). Opens an
 *  empty on-brand panel; each gets its real interface in a later PR (#161). */
export function FloatPlaceholder({ kind, onClose }: { kind: PlaceholderKind; onClose: () => void }) {
  const TITLE: Record<PlaceholderKind, string> = { custom: 'New Card', level: 'Level Up', rest: 'Rest', settings: 'Settings' };
  const W = 320;
  const H = 220;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,8,13,0.82)' }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <View style={{ width: W, height: H }}>
        <ChamferFrame left={0} top={0} width={W} height={H} chamfer={18} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.6} />
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
          <Text style={{ color: Rune.goldText, fontSize: 26, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' }}>{TITLE[kind]}</Text>
          <Text style={{ marginTop: 12, color: Rune.muted, fontSize: 13, fontFamily: Body.medium, textAlign: 'center' }}>This interface is coming soon.</Text>
          <Text style={{ marginTop: 22, color: Rune.goldText, fontSize: 12, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>Tap anywhere to close</Text>
        </View>
      </View>
    </View>
  );
}
