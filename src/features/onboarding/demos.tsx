import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, type SharedValue, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Path, Polygon } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { Body, Display, Rune } from '@/constants/theme';
import { ArsenalIcon } from '@/features/character-sheet/sheet/deck-toggle-icon';
import { playSfx } from '@/lib/sfx';

/**
 * Interactive onboarding demos (v0.23.0).
 *
 * v0.22.0's demos were looping animations you watched. These are things you do: the hand really
 * fans, the hold really fills, the hearts really change. A page can also REQUIRE its gesture before
 * Next unlocks, which is the only way to be sure someone has felt a hold rather than read about one.
 *
 * Everything is drawn in the app's own language: blank dark cards with dim gold edges, the real
 * circle-control art from the sheet, and the real Arsenal glyph. Nothing rotates.
 */

const GOLD = Rune.goldBright;
const DIM = 'rgba(218,162,73,0.32)';
const DEMO_H = 210;

/** Fixed-height stage so paging never makes the text jump. */
export function Stage({ children }: { children: React.ReactNode }) {
  return <View style={{ height: DEMO_H, alignItems: 'center', justifyContent: 'center' }}>{children}</View>;
}

/** A prompt under a demo, telling the player what to try. */
function Prompt({ text, done }: { text: string; done?: boolean }) {
  return (
    <Text style={{ position: 'absolute', bottom: 0, color: done ? GOLD : Rune.muted, fontSize: 11, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>
      {done ? 'Nice' : text}
    </Text>
  );
}

/** A blank card in the app's language: dark fill, dim gold edge. */
function BlankCard({ w = 46, h = 66, bright, chamfer = 5 }: { w?: number; h?: number; bright?: boolean; chamfer?: number }) {
  return <ChamferBox chamfer={chamfer} fill="rgba(20,24,31,0.95)" stroke={bright ? GOLD : DIM} strokeWidth={bright ? 1.6 : 1} style={{ width: w, height: h }} />;
}

// --------------------------------------------------------------------------------------------------
// 1. The hand: tap to fan open, tap the middle card to read it, tap again to put it back.
// --------------------------------------------------------------------------------------------------

export function HandDemo({ onDid }: { onDid?: () => void }) {
  const [state, setState] = useState<'closed' | 'open' | 'focused'>('closed');
  const t = useSharedValue(0);
  const f = useSharedValue(0);

  useEffect(() => {
    t.value = withTiming(state === 'closed' ? 0 : 1, { duration: 320, easing: Easing.out(Easing.quad) });
    f.value = withTiming(state === 'focused' ? 1 : 0, { duration: 300, easing: Easing.out(Easing.quad) });
  }, [state, t, f]);

  const advance = useCallback(() => {
    playSfx('buttonTap');
    setState((s) => {
      const next = s === 'closed' ? 'open' : s === 'open' ? 'focused' : 'open';
      if (next === 'focused') onDid?.();
      return next;
    });
  }, [onDid]);

  return (
    <Stage>
      <Pressable onPress={advance} accessibilityRole="button" accessibilityLabel="Try the hand of cards" style={{ width: 240, height: 150, alignItems: 'center', justifyContent: 'flex-end' }}>
        {[-2, -1, 0, 1, 2].map((i) => (
          <FanCard key={i} i={i} t={t} f={f} />
        ))}
      </Pressable>
      <Prompt text={state === 'closed' ? 'Tap the cards' : state === 'open' ? 'Tap the middle one' : 'Tap to put it back'} done={state === 'focused'} />
    </Stage>
  );
}

function FanCard({ i, t, f }: { i: number; t: SharedValue<number>; f: SharedValue<number> }) {
  const centre = i === 0;
  const style = useAnimatedStyle(() => {
    const spread = i * 34 * t.value;
    const lift = -Math.abs(i) * 6 * t.value;
    const rot = i * 8 * t.value;
    const scale = centre ? 1 + 0.75 * f.value : 1 - 0.35 * f.value;
    const fade = centre ? 1 : 1 - 0.8 * f.value;
    return {
      opacity: fade,
      transform: [{ translateX: spread }, { translateY: lift - 30 * f.value * (centre ? 1 : 0) }, { rotate: `${rot}deg` }, { scale }],
    };
  });
  return (
    <Animated.View style={[{ position: 'absolute', bottom: 10 }, style]}>
      <BlankCard bright={centre} />
    </Animated.View>
  );
}

// --------------------------------------------------------------------------------------------------
// 2. Hold to equip. This page is GATED: Next stays disabled until the hold completes.
// --------------------------------------------------------------------------------------------------

export function EquipDemo({ onDid, did }: { onDid: () => void; did: boolean }) {
  const fill = useSharedValue(did ? 1 : 0);
  const HOLD = 760;

  const complete = useCallback(() => {
    playSfx('cardSelect');
    onDid();
  }, [onDid]);

  const hold = Gesture.LongPress()
    .minDuration(HOLD)
    .maxDistance(30)
    .onBegin(() => {
      'worklet';
      fill.value = withTiming(1, { duration: HOLD, easing: Easing.out(Easing.cubic) });
    })
    .onStart(() => {
      'worklet';
      runOnJS(complete)();
    })
    .onFinalize((_e, ok) => {
      'worklet';
      if (!ok && !did) fill.value = withTiming(0, { duration: 180 });
    });

  const rise = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - fill.value) * 96 }] }));
  const tick = useAnimatedStyle(() => ({ opacity: fill.value > 0.98 ? 1 : 0 }));

  return (
    <Stage>
      <GestureDetector gesture={hold}>
        <View style={{ width: 72, height: 96 }}>
          <ChamferBox chamfer={6} fill="rgba(20,24,31,0.95)" stroke={GOLD} strokeWidth={1.5} style={{ width: 72, height: 96, overflow: 'hidden' }}>
            <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: 96, backgroundColor: 'rgba(218,162,73,0.45)' }, rise]} />
          </ChamferBox>
          <Animated.View style={[{ position: 'absolute', right: -6, top: -6 }, tick]}>
            <Svg width={24} height={24} viewBox="0 0 22 22">
              <Path d="M4 11 L9 16 L18 5" fill="none" stroke={GOLD} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Animated.View>
        </View>
      </GestureDetector>
      <Prompt text="Press and hold the card" done={did} />
    </Stage>
  );
}

// --------------------------------------------------------------------------------------------------
// 3. The tracks. Real hearts, and you actually change them.
// --------------------------------------------------------------------------------------------------

export function HeartsDemo({ onDid }: { onDid?: () => void }) {
  const [hp, setHp] = useState(4);
  const [touched, setTouched] = useState(false);
  const MAX = 6;

  const change = (delta: number) => {
    const next = Math.max(0, Math.min(MAX, hp + delta));
    if (next === hp) return;
    playSfx(delta > 0 ? 'cardSelect' : 'cardDeselect');
    setHp(next);
    if (!touched) {
      setTouched(true);
      onDid?.();
    }
  };

  return (
    <Stage>
      <View style={{ flexDirection: 'row', gap: 5 }}>
        {Array.from({ length: MAX }, (_, i) => (
          <Heart key={i} filled={i < hp} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 16 }}>
        <Pressable onPress={() => change(1)} accessibilityRole="button" accessibilityLabel="Clear a Hit Point" style={{ width: 104, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>This side clears</Text>
        </Pressable>
        <View style={{ width: 1, backgroundColor: DIM }} />
        <Pressable onPress={() => change(-1)} accessibilityRole="button" accessibilityLabel="Mark a Hit Point" style={{ width: 104, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>This side marks</Text>
        </Pressable>
      </View>
      <Prompt text="Tap either side of the row" done={touched} />
    </Stage>
  );
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24">
      <Path
        d="M12 20 C6 15.5 3 12.5 3 9 A4.2 4.2 0 0 1 12 6.6 A4.2 4.2 0 0 1 21 9 C21 12.5 18 15.5 12 20 Z"
        fill={filled ? Rune.red : 'none'}
        stroke={Rune.red}
        strokeWidth={1.6}
      />
    </Svg>
  );
}

// --------------------------------------------------------------------------------------------------
// 4. The circle controls. The sheet's own art, small, and STILL.
// --------------------------------------------------------------------------------------------------

const CIRCLE = require('../../../assets/art/gears/raster/U2.webp');

export function CircleDemo() {
  const flash = useSharedValue(0);
  useEffect(() => {
    flash.value = withRepeat(withSequence(withDelay(1400, withTiming(1, { duration: 160 })), withTiming(0, { duration: 620 })), -1, false);
  }, [flash]);
  const glow = useAnimatedStyle(() => ({ opacity: flash.value }));
  return (
    <Stage>
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        {/* cards sit in front of the circles, exactly as they do on the sheet */}
        <View style={{ flexDirection: 'row', gap: -10, marginBottom: -22, zIndex: 2 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ marginHorizontal: -8 }}>
              <BlankCard w={38} h={54} bright={i === 1} />
            </View>
          ))}
        </View>
        <Image source={CIRCLE} style={{ width: 132, height: 66 }} contentFit="contain" />
        <Animated.View style={[{ position: 'absolute', bottom: -6 }, glow]}>
          <ChamferBox chamfer={5} fill="rgba(240,240,240,0.14)" stroke="#F2EDE2" strokeWidth={1.3} style={{ paddingHorizontal: 14, height: 26, justifyContent: 'center' }}>
            <Text style={{ color: '#F2EDE2', fontSize: 10, fontFamily: Display.bold, letterSpacing: 2.4, textTransform: 'uppercase' }}>Edit mode</Text>
          </ChamferBox>
        </Animated.View>
      </View>
    </Stage>
  );
}

// --------------------------------------------------------------------------------------------------
// 5. The wheel under your portrait, opened from the real Arsenal glyph.
// --------------------------------------------------------------------------------------------------

const WEDGES = ['State', 'Level Up', 'Rest', 'New Card', 'Cards'];

export function WheelDemo({ onDid }: { onDid?: () => void }) {
  const [open, setOpen] = useState(false);
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(open ? 1 : 0, { duration: 420, easing: Easing.out(Easing.quad) });
  }, [open, p]);
  return (
    <Stage>
      <View style={{ width: 250, height: 160, alignItems: 'center', justifyContent: 'center' }}>
        {WEDGES.map((l, i) => (
          <WheelPuck key={l} label={l} i={i} p={p} />
        ))}
        <Pressable
          onPress={() => {
            playSfx('buttonTap');
            setOpen((o) => !o);
            if (!open) onDid?.();
          }}
          accessibilityRole="button"
          accessibilityLabel="Open the wheel">
          <ChamferBox chamfer={7} fill="rgba(20,24,31,0.98)" stroke={GOLD} strokeWidth={1.6} style={{ width: 58, height: 58, alignItems: 'center', justifyContent: 'center' }}>
            <ArsenalIcon />
          </ChamferBox>
        </Pressable>
      </View>
      <Prompt text="Press the emblem" done={open} />
    </Stage>
  );
}

function WheelPuck({ label, i, p }: { label: string; i: number; p: SharedValue<number> }) {
  const a = (-90 + (i - 2) * 40) * (Math.PI / 180);
  const st = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateX: Math.cos(a) * 86 * p.value }, { translateY: Math.sin(a) * 64 * p.value }, { scale: 0.7 + p.value * 0.3 }],
  }));
  return (
    <Animated.View style={[{ position: 'absolute' }, st]}>
      <ChamferBox chamfer={4} fill="rgba(20,24,31,0.96)" stroke={DIM} strokeWidth={1} style={{ paddingHorizontal: 8, height: 22, justifyContent: 'center' }}>
        <Text style={{ color: GOLD, fontSize: 9, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
      </ChamferBox>
    </Animated.View>
  );
}

// --------------------------------------------------------------------------------------------------
// 6. Welcome: cards are the whole idea.
// --------------------------------------------------------------------------------------------------

export function WelcomeDemo() {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) });
  }, [p]);
  const st = useAnimatedStyle(() => ({ opacity: p.value }));
  return (
    <Stage>
      <Animated.View style={[{ flexDirection: 'row', alignItems: 'center' }, st]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ marginHorizontal: -10, transform: [{ rotate: `${(i - 1) * 9}deg` }, { translateY: Math.abs(i - 1) * 6 }] }}>
            <BlankCard w={62} h={88} bright={i === 1} chamfer={6} />
          </View>
        ))}
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', top: 22 }, st]}>
        <Svg width={26} height={26} viewBox="0 0 56 56">
          <Polygon points="28,2 50,24 50,32 28,54 6,32 6,24" fill="none" stroke={GOLD} strokeWidth={2.4} strokeLinejoin="miter" />
        </Svg>
      </Animated.View>
    </Stage>
  );
}
