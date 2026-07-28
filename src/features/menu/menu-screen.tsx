import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Polygon, Polyline } from 'react-native-svg';

import { ArtImage } from '@/components/art-image';
import { AppScreen } from '@/components/app-screen';
import { FitLine } from '@/components/fit-line';
import { ChamferBox } from '@/components/chamfer-box';
import { LoadingScreen } from '@/components/loading-screen';
import { Body, Display, DmRune, Rune } from '@/constants/theme';
import { CATALOG } from '@/data/catalog';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { getDmMode, setDmMode } from '@/lib/dm-mode';
import { listParties } from '@/lib/party-store';
import { showToast } from '@/components/toast';
import { loadOnboarding } from '@/lib/onboarding-store';
import { playSfx, preloadSfx } from '@/lib/sfx';
import { applyStoredMute, setUiMuted } from '@/lib/sfx-prefs';

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

function MenuAction({ label, sub, glyph, onPress, delayIndex, dm, locked }: { label: string; sub: string; glyph: 'characters' | 'cards'; onPress: () => void; delayIndex: number; dm?: boolean; locked?: boolean }) {
  // Web (the verify pipeline) renders the settled state directly — the entrance is native-only.
  const enter = useSharedValue(Platform.OS === 'web' ? 1 : 0);
  const press = useSharedValue(1);
  const reduced = useReducedMotion();
  useEffect(() => {
    enter.value = reduced ? 1 : withSpring(1, { damping: 18, stiffness: 90, mass: 0.9 });
  }, [enter, reduced]);
  const style = useAnimatedStyle(() => ({
    opacity: enter.value * (locked ? 0.42 : 1),
    transform: [{ translateY: (1 - enter.value) * (26 + delayIndex * 14) }, { scale: press.value }],
  }));
  // DM Mode (PRD #2): the same chrome drained of gold into the desaturated Golden-Gear-Edit palette.
  const edge = dm ? DmRune.accentDim : Rune.goldEdge;
  const bright = dm ? DmRune.accent : Rune.goldBright;
  const accent = dm ? DmRune.red : Rune.red;
  const ivory = dm ? DmRune.ivory : Rune.ivory;
  const muted = dm ? DmRune.muted : Rune.muted;
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
        accessibilityLabel={locked ? `${label}, locked` : label}>
        <ChamferBox chamfer={14} fill="rgba(14,17,22,0.92)" stroke={edge} strokeWidth={1.4} style={{ height: 108, justifyContent: 'center', paddingHorizontal: 22 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
            <Svg width={44} height={44} viewBox="0 0 44 44">
              {glyph === 'characters' ? (
                <>
                  {/* helm: chamfered shield silhouette */}
                  <Polygon points="22,3 38,10 38,24 22,41 6,24 6,10" fill="none" stroke={edge} strokeWidth={2} strokeLinejoin="miter" />
                  <Polyline points="14,18 22,26 30,18" fill="none" stroke={accent} strokeWidth={2.6} strokeLinejoin="miter" />
                </>
              ) : (
                <>
                  {/* fanned cards */}
                  <Polygon points="8,12 22,8 26,26 12,30" fill="none" stroke={edge} strokeWidth={2} strokeLinejoin="miter" />
                  <Polygon points="20,10 34,12 32,32 18,30" fill={Rune.ink} stroke={bright} strokeWidth={2} strokeLinejoin="miter" />
                </>
              )}
            </Svg>
            <View style={{ flex: 1, minWidth: 0 }}>
              <FitLine style={{ color: ivory, fontSize: 24, fontFamily: Display.black, letterSpacing: 2, textTransform: 'uppercase' }}>{label}</FitLine>
              <FitLine minScale={0.7} style={{ color: muted, fontSize: 12, fontFamily: Body.medium, letterSpacing: 0.4, marginTop: 3 }}>{locked ? 'Set a party active to unlock' : sub}</FitLine>
            </View>
            <Svg width={16} height={16} viewBox="0 0 16 16">
              <Polyline points="5,2 12,8 5,14" fill="none" stroke={edge} strokeWidth={2.2} strokeLinejoin="miter" />
            </Svg>
          </View>
        </ChamferBox>
      </Pressable>
    </Animated.View>
  );
}

/** The small "DM Mode" / "Player Mode" toggle below the actions (PRD #1). */
function ModeToggle({ dm, onToggle }: { dm: boolean; onToggle: () => void }) {
  const press = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const edge = dm ? DmRune.accent : Rune.goldEdge;
  return (
    <Animated.View style={[anim, { alignSelf: 'center' }]}>
      <Pressable
        onPress={onToggle}
        onPressIn={() => { press.value = withSpring(0.95, { damping: 22, stiffness: 320, mass: 0.6 }); }}
        onPressOut={() => { press.value = withSpring(1, { damping: 22, stiffness: 320, mass: 0.6 }); }}
        accessibilityRole="button"
        accessibilityLabel={dm ? 'Switch to Player Mode' : 'Switch to DM Mode'}>
        <ChamferBox chamfer={8} fill="rgba(14,17,22,0.9)" stroke={edge} strokeWidth={1.3} style={{ height: 38, justifyContent: 'center', paddingHorizontal: 20 }}>
          <Text style={{ color: dm ? DmRune.accent : Rune.goldText, fontSize: 12, fontFamily: Body.bold, letterSpacing: 2.4, textTransform: 'uppercase' }}>{dm ? 'DM Mode · On' : 'DM Mode · Off'}</Text>
        </ChamferBox>
      </Pressable>
    </Animated.View>
  );
}

/** The main-menu UI-sound mute (v0.19.1 item 6): a speaker glyph that gains a slash when muted. */
function MuteToggle({ muted, dm, onToggle }: { muted: boolean; dm: boolean; onToggle: () => void }) {
  const press = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const edge = muted ? (dm ? DmRune.red : Rune.red) : dm ? DmRune.accent : Rune.goldEdge;
  const glyph = muted ? (dm ? DmRune.red : Rune.red) : dm ? DmRune.accent : Rune.goldText;
  return (
    <Animated.View style={anim}>
      <Pressable
        onPress={onToggle}
        onPressIn={() => { press.value = withSpring(0.95, { damping: 22, stiffness: 320, mass: 0.6 }); }}
        onPressOut={() => { press.value = withSpring(1, { damping: 22, stiffness: 320, mass: 0.6 }); }}
        accessibilityRole="button"
        accessibilityLabel={muted ? 'Unmute UI sounds' : 'Mute UI sounds'}
        accessibilityState={{ selected: muted }}>
        <ChamferBox chamfer={8} fill="rgba(14,17,22,0.9)" stroke={edge} strokeWidth={1.3} style={{ height: 38, width: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Polygon points="4,9 8,9 13,4 13,20 8,15 4,15" fill="none" stroke={glyph} strokeWidth={1.8} strokeLinejoin="round" />
            {muted ? (
              <Polyline points="17,9 22,15" fill="none" stroke={glyph} strokeWidth={2} strokeLinecap="round" />
            ) : (
              <Polyline points="16,8 18,12 16,16" fill="none" stroke={glyph} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            )}
            {muted ? <Polyline points="22,9 17,15" fill="none" stroke={glyph} strokeWidth={2} strokeLinecap="round" /> : null}
          </Svg>
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
  // v0.22.0: offered ONCE. `done` is set by finishing or skipping, and nothing re-raises it.
  const [tourChecked, setTourChecked] = useState(false);
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [dm, setDm] = useState(false);
  const [muted, setMuted] = useState(false);
  const [hasEnabledParty, setHasEnabledParty] = useState(false);
  useEffect(() => {
    setMuted(applyStoredMute()); // item 6: honour the persisted UI-sound mute before anything plays
    preloadSfx(); // warm the audio engine + decode latency-sensitive sounds (#255)
    void getDmMode().then(setDm);
    // One frame of intentional loading: lets fonts/thumb decodes land so the menu never flashes
    // half-drawn. Kept short — this screen has no real async data yet.
    const t = setTimeout(() => {
      setReady(true);
      playSfx('appStartup'); // the forge is lit
    }, 350);
    return () => clearTimeout(t);
  }, []);
  // v0.22.0: offer the tour ONCE, after the menu has actually settled — a first-run user shouldn't
  // meet a modal before they have seen the app it describes. Finishing or skipping sets `done`, and
  // nothing raises it again; the "?" button is the only way back in.
  useEffect(() => {
    if (!ready || tourChecked) return;
    setTourChecked(true);
    if (!loadOnboarding().done) router.push('/onboarding' as Href);
  }, [ready, tourChecked, router]);
  // Sessions unlocks only once a party is enabled (PRD #17/#18). Re-checked whenever the menu regains
  // focus (returning from Parties may have just enabled one).
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void listParties().then((all) => { if (live) setHasEnabledParty(all.some((p) => p.enabled)); });
      return () => { live = false; };
    }, []),
  );

  const toggleDm = useCallback(() => {
    playSfx('buttonTap');
    setDm((prev) => {
      const next = !prev;
      void setDmMode(next);
      return next;
    });
  }, []);

  // item 6: the main-menu mute — silences every UI sound until re-enabled here. Tap plays only when
  // UN-muting (a muted app must make no sound on the tap that muted it).
  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      setUiMuted(next);
      if (!next) playSfx('buttonTap');
      return next;
    });
  }, []);

  const rows = useMemo(() => {
    const domains = CATALOG.filter((c) => c.kind === 'domain');
    const pick = (offset: number) => Array.from({ length: 9 }, (_, i) => domains[(offset + i * 23) % domains.length]);
    return [pick(3), pick(60), pick(120)];
  }, []);

  if (!ready) return <LoadingScreen label="Stoking the forge" />;

  return (
    <AppScreen dm={dm}>
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

        {/* actions — labels + destinations swap in DM Mode (PRD #3) */}
        <View style={{ flex: 1, justifyContent: 'flex-end', gap: 16, paddingBottom: 28 }}>
          {dm ? (
            <>
              <MenuAction label="Parties" sub="Build parties from your roster" glyph="characters" dm delayIndex={0} onPress={() => { playSfx('selectCharacter'); router.push('/parties' as Href); }} />
              <MenuAction
                label="Sessions"
                sub="Encounters for an enabled party"
                glyph="cards"
                dm
                locked={!hasEnabledParty}
                delayIndex={1}
                onPress={() => {
                  // v0.22.0: a dead tap on a dimmed card reads as a bug. Say why it's locked.
                  if (!hasEnabledParty) { playSfx('buttonTap'); showToast('Open Parties and set one active to run its sessions.'); return; }
                  playSfx('enterCardViewer');
                  router.push('/sessions' as Href);
                }}
              />
            </>
          ) : (
            <>
              <MenuAction label="Characters" sub="Your roster, play, create, import" glyph="characters" delayIndex={0} onPress={() => { playSfx('selectCharacter'); router.push('/characters'); }} />
              <MenuAction label="Cards" sub="Browse the archive, build homebrew" glyph="cards" delayIndex={1} onPress={() => { playSfx('enterCardViewer'); router.push('/library' as Href); }} />
            </>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <ModeToggle dm={dm} onToggle={toggleDm} />
            <MuteToggle muted={muted} dm={dm} onToggle={toggleMute} />
            {/* v0.22.0: the tour is re-openable, not a one-shot you can never find again. */}
            <Pressable
              onPress={() => { playSfx('buttonTap'); router.push('/onboarding' as Href); }}
              accessibilityRole="button"
              accessibilityLabel="How RuneKeep works">
              <ChamferBox chamfer={8} fill="rgba(14,17,22,0.9)" stroke={dm ? DmRune.line : Rune.goldEdge} strokeWidth={1.3} style={{ width: 44, height: 38, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: dm ? DmRune.accent : Rune.goldText, fontSize: 15, fontFamily: Display.black }}>?</Text>
              </ChamferBox>
            </Pressable>
          </View>
        </View>
      </View>
    </AppScreen>
  );
}
