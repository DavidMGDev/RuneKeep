import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Dimensions, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Polygon, Polyline } from 'react-native-svg';

import { ArtImage } from '@/components/art-image';
import { AppScreen } from '@/components/app-screen';
import { FitLine } from '@/components/fit-line';
import { ChamferBox } from '@/components/chamfer-box';
import { LoadingScreen } from '@/components/loading-screen';
import { Body, Display, Rune } from '@/constants/theme';
import { CATALOG } from '@/features/cards/catalog';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { playSfx, preloadSfx } from '@/lib/sfx';

const THUMB_W = 76;
const THUMB_H = Math.round(THUMB_W * (263 / 188));

/**
 * One ambient row of LOD thumbs drifting sideways forever. Pure transform animation on a single
 * row container (no per-card work), thumbs only (~9KB each) — decorative cost ≈ one full card.
 */
function DriftRow({ y, cards, duration, reverse, opacity }: { y: number; cards: { thumb: number; id: string }[]; duration: number; reverse?: boolean; opacity: number }) {
  const screenW = Dimensions.get('window').width;
  const gap = 14;
  const span = cards.length * (THUMB_W + gap);
  const x = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    x.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false);
  }, [x, duration, reduced]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: (reverse ? 1 : -1) * x.value * span }],
  }));
  // Two copies back-to-back so the loop wraps seamlessly; row total stays comfortably > screen.
  const strip = [...cards, ...cards];
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: y, height: THUMB_H, opacity }} pointerEvents="none">
      <Animated.View style={[{ flexDirection: 'row', gap, position: 'absolute', left: reverse ? -span + screenW : 0 }, style]}>
        {strip.map((c, i) => (
          <View key={`${c.id}-${i}`} style={{ width: THUMB_W, height: THUMB_H, transform: [{ rotate: i % 2 ? '2.5deg' : '-2deg' }] }}>
            <ArtImage source={c.thumb} fit="contain" />
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

function MenuAction({ label, sub, glyph, onPress, delayIndex }: { label: string; sub: string; glyph: 'characters' | 'cards'; onPress: () => void; delayIndex: number }) {
  // Web (the verify pipeline) renders the settled state directly — the entrance is native-only.
  const enter = useSharedValue(Platform.OS === 'web' ? 1 : 0);
  const press = useSharedValue(1);
  const reduced = useReducedMotion();
  useEffect(() => {
    enter.value = reduced ? 1 : withSpring(1, { damping: 18, stiffness: 90, mass: 0.9 });
  }, [enter, reduced]);
  const style = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * (26 + delayIndex * 14) }, { scale: press.value }],
  }));
  return (
    <Animated.View style={style}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          press.value = withSpring(0.97, { damping: 22, stiffness: 320, mass: 0.6 });
        }}
        onPressOut={() => {
          press.value = withSpring(1, { damping: 22, stiffness: 320, mass: 0.6 });
        }}
        accessibilityRole="button"
        accessibilityLabel={label}>
        <ChamferBox chamfer={14} fill="rgba(14,17,22,0.92)" stroke={Rune.goldEdge} strokeWidth={1.4} style={{ height: 108, justifyContent: 'center', paddingHorizontal: 22 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
            <Svg width={44} height={44} viewBox="0 0 44 44">
              {glyph === 'characters' ? (
                <>
                  {/* helm: chamfered shield silhouette */}
                  <Polygon points="22,3 38,10 38,24 22,41 6,24 6,10" fill="none" stroke={Rune.goldEdge} strokeWidth={2} strokeLinejoin="miter" />
                  <Polyline points="14,18 22,26 30,18" fill="none" stroke={Rune.red} strokeWidth={2.6} strokeLinejoin="miter" />
                </>
              ) : (
                <>
                  {/* fanned cards */}
                  <Polygon points="8,12 22,8 26,26 12,30" fill="none" stroke={Rune.goldEdge} strokeWidth={2} strokeLinejoin="miter" />
                  <Polygon points="20,10 34,12 32,32 18,30" fill={Rune.ink} stroke={Rune.goldBright} strokeWidth={2} strokeLinejoin="miter" />
                </>
              )}
            </Svg>
            <View style={{ flex: 1, minWidth: 0 }}>
              <FitLine style={{ color: Rune.ivory, fontSize: 24, fontFamily: Display.black, letterSpacing: 2, textTransform: 'uppercase' }}>{label}</FitLine>
              <FitLine minScale={0.7} style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.medium, letterSpacing: 0.4, marginTop: 3 }}>{sub}</FitLine>
            </View>
            <Svg width={16} height={16} viewBox="0 0 16 16">
              <Polyline points="5,2 12,8 5,14" fill="none" stroke={Rune.goldEdge} strokeWidth={2.2} strokeLinejoin="miter" />
            </Svg>
          </View>
        </ChamferBox>
      </Pressable>
    </Animated.View>
  );
}

/**
 * The main menu: the keep's gate. Title, two deliberate actions, and the card library itself
 * drifting dimly in the background (LOD thumbs only — the art is the spectacle, the chrome
 * stays out of the way).
 */
export function MenuScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    preloadSfx(); // warm the audio engine + decode latency-sensitive sounds (#255)
    // One frame of intentional loading: lets fonts/thumb decodes land so the menu never flashes
    // half-drawn. Kept short — this screen has no real async data yet.
    const t = setTimeout(() => {
      setReady(true);
      playSfx('appStartup'); // the forge is lit
    }, 350);
    return () => clearTimeout(t);
  }, []);

  const rows = useMemo(() => {
    const domains = CATALOG.filter((c) => c.kind === 'domain');
    const pick = (offset: number) => Array.from({ length: 9 }, (_, i) => domains[(offset + i * 23) % domains.length]);
    return [pick(3), pick(60), pick(120)];
  }, []);

  if (!ready) return <LoadingScreen label="Stoking the forge" />;

  return (
    <AppScreen>
      <View style={{ flex: 1 }}>
        {/* ambient deck, dim, behind everything — rows fill the gap BETWEEN the title and the
            actions (owner #102: never behind the title; the bottom row's spot is approved). */}
        <View style={StyleSheet.absoluteFill}>
          <DriftRow y={228} cards={rows[0]} duration={90000} opacity={0.2} />
          <DriftRow y={396} cards={rows[1]} duration={120000} reverse opacity={0.15} />
          <DriftRow y={560} cards={rows[2]} duration={105000} opacity={0.1} />
        </View>

        {/* title block */}
        <View style={{ alignItems: 'center', marginTop: 76 }}>
          <Text style={{ color: Rune.goldText, fontSize: 12, fontFamily: Body.bold, letterSpacing: 6, textTransform: 'uppercase' }}>Daggerheart companion</Text>
          <Text style={{ color: Rune.ivory, fontSize: 40, fontFamily: Display.black, letterSpacing: 2, textTransform: 'uppercase', marginTop: 8 }}>RuneKeep</Text>
          <Svg width={220} height={14} viewBox="0 0 220 14">
            <Polyline points="0,7 92,7 110,1 128,13 146,7 220,7" fill="none" stroke={Rune.goldEdge} strokeWidth={1.4} strokeLinejoin="miter" />
          </Svg>
        </View>

        {/* actions */}
        <View style={{ flex: 1, justifyContent: 'flex-end', gap: 16, paddingBottom: 40 }}>
          <MenuAction label="Characters" sub="Your roster — play, create, import" glyph="characters" delayIndex={0} onPress={() => { playSfx('selectCharacter'); router.push('/characters'); }} />
          <MenuAction label="Cards" sub="Browse the full card library" glyph="cards" delayIndex={1} onPress={() => { playSfx('enterCardViewer'); router.push('/gallery'); }} />
        </View>
      </View>
    </AppScreen>
  );
}
