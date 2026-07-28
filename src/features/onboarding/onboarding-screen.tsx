import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, type SharedValue, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Polygon } from 'react-native-svg';

import { AppScreen } from '@/components/app-screen';
import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { loadOnboarding, saveOnboarding } from '@/lib/onboarding-store';
import { playSfx } from '@/lib/sfx';

/**
 * The guided tour (v0.22.0).
 *
 * The audit scored Help & Documentation 0/4: no onboarding, no tutorial, no tooltip, no coach mark,
 * no help screen — and every explanatory string in the app sat BEHIND the gesture it would teach.
 * The Modifiers panel told you how to equip a card, but only once you had opened a panel you would
 * reach by knowing how to equip a card.
 *
 * So this teaches the things with NO visible affordance, and it teaches them by showing the gesture
 * rather than describing it. It is entirely optional, skippable from the first frame, never nags
 * once dismissed, resumes where you left off, and can be reopened from the menu.
 *
 * Built in the app's own language rather than with a tour library: DESIGN.md's anti-references name
 * generic chrome explicitly, and a stock carousel of dots and pastel cards would read as imported
 * from another product.
 */

interface Page {
  title: string;
  body: string;
  demo: (props: { reduced: boolean }) => React.ReactElement;
}

const GOLD = Rune.goldBright;
const DIM = 'rgba(218,162,73,0.28)';

/** A looping demo container — fixed height so pages don't jump as you page through. */
function Stage({ children }: { children: React.ReactNode }) {
  return <View style={{ height: 190, alignItems: 'center', justifyContent: 'center' }}>{children}</View>;
}

/** Page 1 — what this is, and the one rule that surprises people. */
function DemoSigil({ reduced }: { reduced: boolean }) {
  const p = useSharedValue(reduced ? 1 : 0.4);
  useEffect(() => {
    if (reduced) return;
    p.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, true);
  }, [p, reduced]);
  const st = useAnimatedStyle(() => ({ opacity: p.value }));
  return (
    <Stage>
      <Animated.View style={st}>
        <Svg width={120} height={120} viewBox="0 0 56 56">
          <Polygon points="28,2 50,24 50,32 28,54 6,32 6,24" fill="none" stroke={GOLD} strokeWidth={1.6} strokeLinejoin="miter" />
          <Polygon points="28,16 39,27 39,29 28,40 17,29 17,27" fill={Rune.gold} opacity={0.85} />
        </Svg>
      </Animated.View>
    </Stage>
  );
}

/** Page 2 — the hand fans open. */
function DemoFan({ reduced }: { reduced: boolean }) {
  const t = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    t.value = withRepeat(withSequence(withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }), withDelay(700, withTiming(0, { duration: 500 }))), -1, false);
  }, [t, reduced]);
  return (
    <Stage>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <FanCard key={i} i={i} t={t} />
        ))}
      </View>
    </Stage>
  );
}

function FanCard({ i, t }: { i: number; t: SharedValue<number> }) {
  const spread = (i - 2) * 17;
  const st = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spread * t.value}deg` }, { translateY: -Math.abs(i - 2) * 5 * t.value }],
  }));
  return (
    <Animated.View style={[{ marginHorizontal: -12 }, st]}>
      <ChamferBox chamfer={5} fill="rgba(20,24,31,0.95)" stroke={i === 2 ? GOLD : DIM} strokeWidth={i === 2 ? 1.5 : 1} style={{ width: 42, height: 60 }} />
    </Animated.View>
  );
}

/** Page 3 — hold a card and the gold fill rises; a corner check lands. */
function DemoHoldEquip({ reduced }: { reduced: boolean }) {
  const fill = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    fill.value = withRepeat(withSequence(withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }), withDelay(600, withTiming(0, { duration: 350 }))), -1, false);
  }, [fill, reduced]);
  const rise = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - fill.value) * 88 }] }));
  const tick = useAnimatedStyle(() => ({ opacity: fill.value > 0.95 ? 1 : 0 }));
  return (
    <Stage>
      <View style={{ width: 64, height: 88, overflow: 'hidden' }}>
        <ChamferBox chamfer={6} fill="rgba(20,24,31,0.95)" stroke={GOLD} strokeWidth={1.4} style={{ width: 64, height: 88, overflow: 'hidden' }}>
          <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: 88, backgroundColor: 'rgba(218,162,73,0.42)' }, rise]} />
        </ChamferBox>
      </View>
      <Animated.View style={[{ position: 'absolute', right: 96, top: 42 }, tick]}>
        <Svg width={22} height={22} viewBox="0 0 22 22">
          <Path d="M4 11 L9 16 L18 5" fill="none" stroke={GOLD} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Animated.View>
      <Text style={{ position: 'absolute', bottom: 8, color: Rune.muted, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 1.4, textTransform: 'uppercase' }}>Hold</Text>
    </Stage>
  );
}

/** Page 4 — the two invisible halves of every resource track. */
function DemoZones({ reduced }: { reduced: boolean }) {
  const side = useSharedValue(reduced ? 0 : 0);
  useEffect(() => {
    if (reduced) return;
    side.value = withRepeat(withSequence(withTiming(1, { duration: 1100 }), withDelay(400, withTiming(0, { duration: 1100 })), withDelay(400, withTiming(0, { duration: 1 }))), -1, false);
  }, [side, reduced]);
  const left = useAnimatedStyle(() => ({ opacity: 0.25 + (1 - side.value) * 0.6 }));
  const right = useAnimatedStyle(() => ({ opacity: 0.25 + side.value * 0.6 }));
  const heart = (filled: boolean, key: number) => (
    <Svg key={key} width={26} height={26} viewBox="0 0 24 24">
      <Path d="M12 20 C6 15.5 3 12.5 3 9 A4.2 4.2 0 0 1 12 6.6 A4.2 4.2 0 0 1 21 9 C21 12.5 18 15.5 12 20 Z" fill={filled ? Rune.red : 'none'} stroke={Rune.red} strokeWidth={1.5} />
    </Svg>
  );
  return (
    <Stage>
      <View style={{ flexDirection: 'row', gap: 4 }}>{[0, 1, 2, 3, 4, 5].map((i) => heart(i < 3, i))}</View>
      <View style={{ flexDirection: 'row', marginTop: 14, gap: 6 }}>
        <Animated.View style={left}>
          <ChamferBox chamfer={4} fill="rgba(200,27,24,0.16)" stroke={Rune.red} strokeWidth={1.1} style={{ paddingHorizontal: 12, height: 28, justifyContent: 'center' }}>
            <Text style={{ color: Rune.sheet, fontSize: 10, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>← Heal</Text>
          </ChamferBox>
        </Animated.View>
        <Animated.View style={right}>
          <ChamferBox chamfer={4} fill="rgba(200,27,24,0.16)" stroke={Rune.red} strokeWidth={1.1} style={{ paddingHorizontal: 12, height: 28, justifyContent: 'center' }}>
            <Text style={{ color: Rune.sheet, fontSize: 10, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>Spend →</Text>
          </ChamferBox>
        </Animated.View>
      </View>
    </Stage>
  );
}

/** Page 5 — the cog, and the mode nothing on screen advertises. */
function DemoGear({ reduced }: { reduced: boolean }) {
  const spin = useSharedValue(0);
  const flash = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    spin.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.linear }), -1, false);
    flash.value = withRepeat(withSequence(withDelay(1200, withTiming(1, { duration: 140 })), withTiming(0, { duration: 500 })), -1, false);
  }, [spin, flash, reduced]);
  const rot = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const glow = useAnimatedStyle(() => ({ opacity: flash.value }));
  return (
    <Stage>
      <Animated.View style={rot}>
        <Svg width={78} height={78} viewBox="0 0 40 40">
          <Circle cx={20} cy={20} r={11} fill="none" stroke={GOLD} strokeWidth={1.6} />
          <Circle cx={20} cy={20} r={4} fill="none" stroke={DIM} strokeWidth={1.4} />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
            const r = (a * Math.PI) / 180;
            return <Line key={a} x1={20 + Math.cos(r) * 12} y1={20 + Math.sin(r) * 12} x2={20 + Math.cos(r) * 16} y2={20 + Math.sin(r) * 16} stroke={GOLD} strokeWidth={2.4} strokeLinecap="round" />;
          })}
        </Svg>
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', top: 116 }, glow]}>
        <ChamferBox chamfer={5} fill="rgba(240,240,240,0.14)" stroke="#F2EDE2" strokeWidth={1.3} style={{ paddingHorizontal: 14, height: 26, justifyContent: 'center' }}>
          <Text style={{ color: '#F2EDE2', fontSize: 10, fontFamily: Display.bold, letterSpacing: 2.4, textTransform: 'uppercase' }}>Edit Mode</Text>
        </ChamferBox>
      </Animated.View>
    </Stage>
  );
}

/** Page 6 — the wheel under the portrait. */
function DemoWheel({ reduced }: { reduced: boolean }) {
  const open = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    open.value = withRepeat(withSequence(withTiming(1, { duration: 620, easing: Easing.out(Easing.quad) }), withDelay(1100, withTiming(0, { duration: 380 }))), -1, false);
  }, [open, reduced]);
  const labels = ['State', 'Level Up', 'Rest', 'New Card', 'Cards'];
  return (
    <Stage>
      <View style={{ width: 200, height: 170, alignItems: 'center', justifyContent: 'center' }}>
        {labels.map((l, i) => (
          <WheelPuck key={l} label={l} i={i} open={open} />
        ))}
        <ChamferBox chamfer={6} fill="rgba(20,24,31,0.98)" stroke={GOLD} strokeWidth={1.5} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={18} height={18} viewBox="0 0 18 18">
            <Polygon points="9,1 17,9 9,17 1,9" fill="none" stroke={GOLD} strokeWidth={1.6} />
          </Svg>
        </ChamferBox>
      </View>
    </Stage>
  );
}

function WheelPuck({ label, i, open }: { label: string; i: number; open: SharedValue<number> }) {
  const a = (-90 + (i - 2) * 38) * (Math.PI / 180);
  const st = useAnimatedStyle(() => ({
    opacity: open.value,
    transform: [{ translateX: Math.cos(a) * 74 * open.value }, { translateY: Math.sin(a) * 62 * open.value }, { scale: 0.7 + open.value * 0.3 }],
  }));
  return (
    <Animated.View style={[{ position: 'absolute' }, st]}>
      <ChamferBox chamfer={4} fill="rgba(20,24,31,0.96)" stroke={DIM} strokeWidth={1} style={{ paddingHorizontal: 8, height: 22, justifyContent: 'center' }}>
        <Text style={{ color: GOLD, fontSize: 9, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
      </ChamferBox>
    </Animated.View>
  );
}

const PAGES: Page[] = [
  {
    title: 'Welcome to RuneKeep',
    body: 'Your Daggerheart character, alive on your phone. One thing worth knowing up front: RuneKeep never rolls for you. You roll your real dice, and tell the app what happened.',
    demo: DemoSigil,
  },
  {
    title: 'Your hand of cards',
    body: 'Cards sit along the bottom edge. Tap one to fan the hand open, tap again to read it full screen, and swipe down to put it away. Swipe sideways any time to browse.',
    demo: DemoFan,
  },
  {
    title: 'Hold to equip',
    body: 'Holding a card equips it. A gold fill rises as you hold, and a check lands in the corner when it takes. Equipped cards apply their modifiers to your sheet, the State screen shows you exactly what each one is doing.',
    demo: DemoHoldEquip,
  },
  {
    title: 'Hit Points, Stress, Hope, Armor',
    body: 'Each track is split down the middle. Hold the left side to clear, hold the right side to spend, or double-tap either side to skip the ceremony when things are moving fast.',
    demo: DemoZones,
  },
  {
    title: 'The cogs do two things',
    body: 'Tap the cogs to open and close your hand, and drag them to skim the whole deck at speed. Hold them still and you drop into Edit Mode, where you can select, reorder, move, favourite and delete cards.',
    demo: DemoGear,
  },
  {
    title: 'The wheel under your portrait',
    body: 'Press the emblem below your portrait and drag to a wedge. State shows your modifiers and your whole history. Then Level Up, Rest, New Card, and Cards for everything else.',
    demo: DemoWheel,
  },
];

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(() => Math.min(loadOnboarding().step, PAGES.length - 1));
  const page = PAGES[step];
  const last = step === PAGES.length - 1;

  // Resuming matters: the tour is skippable at any point, so someone who backs out mid-way and comes
  // back should not be made to sit through the pages they already read.
  useEffect(() => {
    saveOnboarding({ done: false, step });
  }, [step]);

  const finish = useCallback(() => {
    saveOnboarding({ done: true, step: 0 });
    onDone();
  }, [onDone]);

  const next = useCallback(() => {
    playSfx('buttonTap');
    if (last) finish();
    else setStep((s) => s + 1);
  }, [last, finish]);

  const Demo = page.demo;
  const dots = useMemo(() => PAGES.map((_, i) => i), []);

  return (
    <AppScreen title="How RuneKeep works" onBack={step === 0 ? undefined : () => setStep((s) => s - 1)}>
      <View style={{ flex: 1, justifyContent: 'space-between', paddingTop: 4 }}>
        <View>
          <Demo reduced={reduced} />
          <Text style={{ color: Rune.goldBright, fontSize: 22, fontFamily: Display.black, letterSpacing: 1, textTransform: 'uppercase', marginTop: 10 }}>{page.title}</Text>
          <Text style={{ color: Rune.muted, fontSize: 14, fontFamily: Body.medium, lineHeight: 21, marginTop: 10 }}>{page.body}</Text>
        </View>

        <View style={{ gap: 16, paddingBottom: 10 }}>
          <View style={{ flexDirection: 'row', gap: 7, justifyContent: 'center' }}>
            {dots.map((i) => (
              <Pressable key={i} onPress={() => setStep(i)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Step ${i + 1} of ${PAGES.length}`}>
                <View style={{ width: 8, height: 8, backgroundColor: i === step ? Rune.goldBright : 'rgba(218,162,73,0.3)', transform: [{ rotate: '45deg' }] }} />
              </Pressable>
            ))}
          </View>
          <RuneButton label={last ? "I'm ready" : 'Next'} kind="primary" height={46} onPress={next} />
          {/* Skippable from the very first frame, and never shown again once dismissed. */}
          <RuneButton label={last ? 'Close' : 'Skip the tour'} kind="ghost" height={38} onPress={finish} />
          <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.regular, textAlign: 'center' }}>You can reopen this any time from the main menu.</Text>
        </View>
      </View>
    </AppScreen>
  );
}
