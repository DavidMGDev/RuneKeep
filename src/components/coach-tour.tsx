import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { createPortal } from 'react-dom';
import Svg, { Line } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { finishTour, saveTourStep, shouldShow, tourStep, type TourId } from '@/lib/onboarding-store';
import { playSfx } from '@/lib/sfx';

/** One tip: the control it points at (an element carrying `coachTarget(name)`), and what to say about it. */
export interface CoachStep {
  target: string;
  title: string;
  body: string;
}

/** Spread onto the View a tip points at. Web only; elsewhere it adds nothing. */
export const coachTarget = (name: string) => ({ dataSet: { coach: name } }) as object;

const PAD = 8; // the spotlight's margin around its target
const CALLOUT_W = 340;
const GAP = 18; // callout to spotlight
const DIM = 'rgba(6,8,13,0.62)';

type Rect = { x: number; y: number; w: number; h: number };

function measure(name: string): Rect | null {
  const el = document.querySelector(`[data-coach="${name}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 };
}

/**
 * Desktop tips that point at the real controls (v0.45.0, owner), in place of a tour page that covers the screen.
 *
 * The page stays live: a light dim with a gold-framed opening over the control being explained, and a short note
 * beside it. Next and Back walk the tips, Close puts them away until the page is opened again (they resume where
 * they stopped), and Skip tips ends them for good. Arrow keys and Enter step through, Esc closes. Shown once per
 * tour; the menu's tips button brings them back, as it does for every other tour.
 */
export function CoachTour({ id, steps, active }: { id: TourId; steps: CoachStep[]; active: boolean }) {
  const [open, setOpen] = useState(() => shouldShow(id));
  const [idx, setIdx] = useState(() => Math.min(steps.length - 1, Math.max(0, tourStep(id))));
  const [rect, setRect] = useState<Rect | null>(null);
  const reduced = useReducedMotion();
  const live = open && active && Platform.OS === 'web' && typeof document !== 'undefined';
  const step = steps[idx];

  // Follow the target: the layout settles after the page opens, and the window can change size under a tip.
  useEffect(() => {
    if (!live || !step) return;
    const update = () => {
      const r = measure(step.target);
      setRect((p) => (r && p && Math.abs(p.x - r.x) < 1 && Math.abs(p.y - r.y) < 1 && Math.abs(p.w - r.w) < 1 && Math.abs(p.h - r.h) < 1 ? p : r));
    };
    update();
    const t = setInterval(update, 400);
    window.addEventListener('resize', update);
    return () => { clearInterval(t); window.removeEventListener('resize', update); };
  }, [live, step]);

  const go = useCallback((n: number) => {
    if (n >= steps.length) { playSfx('buttonTap'); finishTour(id); setOpen(false); return; }
    if (n < 0) return;
    playSfx('buttonTap');
    saveTourStep(id, n);
    setIdx(n);
  }, [id, steps.length]);
  const close = useCallback(() => { playSfx('buttonTap'); setOpen(false); }, []);
  const skip = useCallback(() => { playSfx('buttonTap'); finishTour(id); setOpen(false); }, [id]);

  useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      const k = e.key;
      if (k !== 'Escape' && k !== 'ArrowRight' && k !== 'ArrowLeft' && k !== 'Enter') return;
      // The tip owns these keys while it is up, so the deck under it does not move as well.
      e.preventDefault();
      e.stopImmediatePropagation();
      if (k === 'Escape') close();
      else if (k === 'ArrowLeft') go(idx - 1);
      else go(idx + 1);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [live, idx, go, close]);

  // The gold frame glides from one control to the next.
  const fx = useSharedValue(0), fy = useSharedValue(0), fw = useSharedValue(0), fh = useSharedValue(0);
  const placed = useSharedValue(false);
  useEffect(() => {
    if (!rect) return;
    const t = { duration: reduced || !placed.value ? 0 : 260, easing: Easing.out(Easing.cubic) };
    fx.value = withTiming(rect.x, t); fy.value = withTiming(rect.y, t);
    fw.value = withTiming(rect.w, t); fh.value = withTiming(rect.h, t);
    placed.value = true;
  }, [rect, reduced, fx, fy, fw, fh, placed]);
  const frameStyle = useAnimatedStyle(() => ({ left: fx.value, top: fy.value, width: fw.value, height: fh.value }));
  // The dim is four bands around the opening, so the control itself stays bright and clickable.
  const topBand = useAnimatedStyle(() => ({ left: 0, right: 0, top: 0, height: Math.max(0, fy.value) }));
  const bottomBand = useAnimatedStyle(() => ({ left: 0, right: 0, top: fy.value + fh.value, bottom: 0 }));
  const leftBand = useAnimatedStyle(() => ({ left: 0, width: Math.max(0, fx.value), top: fy.value, height: fh.value }));
  const rightBand = useAnimatedStyle(() => ({ left: fx.value + fw.value, right: 0, top: fy.value, height: fh.value }));

  if (!live || !step || !rect) return null;

  // The note sits beside the opening on whichever side has room: right, then left, then below, then above.
  const vw = window.innerWidth, vh = window.innerHeight;
  const estH = 230;
  let cx: number, cy: number;
  if (rect.x + rect.w + GAP + CALLOUT_W <= vw - 16) { cx = rect.x + rect.w + GAP; cy = rect.y; }
  else if (rect.x - GAP - CALLOUT_W >= 16) { cx = rect.x - GAP - CALLOUT_W; cy = rect.y; }
  else if (rect.y + rect.h + GAP + estH <= vh - 16) { cx = rect.x + rect.w / 2 - CALLOUT_W / 2; cy = rect.y + rect.h + GAP; }
  else { cx = rect.x + rect.w / 2 - CALLOUT_W / 2; cy = rect.y - GAP - estH; }
  cx = Math.min(vw - CALLOUT_W - 16, Math.max(16, cx));
  cy = Math.min(vh - estH - 16, Math.max(16, cy));
  const last = idx === steps.length - 1;

  return createPortal(
    <View pointerEvents="box-none" style={{ position: 'fixed' as never, left: 0, top: 0, right: 0, bottom: 0, zIndex: 20000 }}>
      {[topBand, bottomBand, leftBand, rightBand].map((s, i) => (
        <Animated.View key={i} pointerEvents="none" style={[{ position: 'absolute', backgroundColor: DIM }, s]} />
      ))}
      <Animated.View pointerEvents="none" style={[{ position: 'absolute' }, frameStyle]}>
        <ChamferBox chamfer={10} fill="transparent" stroke={Rune.goldBright} strokeWidth={1.6} style={{ flex: 1 }} />
      </Animated.View>
      <Animated.View key={idx} entering={reduced ? undefined : FadeIn.duration(180)} accessibilityRole={'dialog' as never} accessibilityLabel={`Tip ${idx + 1} of ${steps.length}: ${step.title}`}
        style={{ position: 'absolute', left: cx, top: cy, width: CALLOUT_W }}>
        <ChamferBox chamfer={12} fill="rgba(12,15,20,0.985)" stroke={Rune.goldEdge} strokeWidth={1.4} style={{ paddingTop: 20, paddingHorizontal: 22, paddingBottom: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <Text style={{ flex: 1, color: Rune.ivory, fontSize: 18, fontFamily: Display.black, letterSpacing: 1, textTransform: 'uppercase' }}>{step.title}</Text>
            <CloseX onPress={close} />
          </View>
          <Text style={{ color: Rune.sheet, opacity: 0.86, fontSize: 13.5, fontFamily: Body.medium, lineHeight: 20, marginTop: 10 }}>{step.body}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 }}>
            <Pressable onPress={skip} accessibilityRole="button" accessibilityLabel="Skip all tips" hitSlop={8}>
              {({ hovered }: { hovered?: boolean }) => (
                <Text style={{ color: hovered ? Rune.goldBright : Rune.muted, fontSize: 11.5, fontFamily: Body.bold, letterSpacing: 1.2, textTransform: 'uppercase', textDecorationLine: hovered ? 'underline' : 'none' }}>Skip tips</Text>
              )}
            </Pressable>
            <View style={{ flex: 1 }} />
            <Text style={{ color: Rune.muted, fontSize: 11.5, fontFamily: Body.semibold, marginRight: 4 }}>{idx + 1} of {steps.length}</Text>
            {idx > 0 ? <RuneButton label="Back" kind="ghost" height={34} dense muteSfx onPress={() => go(idx - 1)} /> : null}
            <RuneButton label={last ? 'Got it' : 'Next'} kind="primary" height={34} dense muteSfx style={{ minWidth: 86 }} onPress={() => go(idx + 1)} />
          </View>
        </ChamferBox>
      </Animated.View>
    </View>,
    document.body,
  );
}

function CloseX({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Close tips for now" hitSlop={10} style={{ paddingTop: 3 }}>
      {({ hovered }: { hovered?: boolean }) => (
        <Svg width={14} height={14} viewBox="0 0 14 14">
          <Line x1={2} y1={2} x2={12} y2={12} stroke={hovered ? Rune.goldBright : Rune.goldText} strokeWidth={1.8} strokeLinecap="round" />
          <Line x1={12} y1={2} x2={2} y2={12} stroke={hovered ? Rune.goldBright : Rune.goldText} strokeWidth={1.8} strokeLinecap="round" />
        </Svg>
      )}
    </Pressable>
  );
}
