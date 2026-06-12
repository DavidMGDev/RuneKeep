import { memo, useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, type SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ArtImage } from '@/components/art-image';
import { Rune } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { box } from '@/lib/design';
import { type HeartAction, heartBoundaries, type PipState, resolveHearts } from '@/lib/pips';
import { Art } from '../art';

/**
 * The HP heart row (#81): Daggerheart never moves more than ONE point at a time, so only the two
 * BOUNDARY hearts are interactive (see heartBoundaries). Hold one ~0.75s — it grows past your
 * finger, shaking harder as it charges — and at the threshold the step applies with an arcane
 * shard burst (outward for a loss, flying in from off-screen for a gain; gold variants for the
 * golden hearts). Release early to cancel. Double-tap = the same step instantly, no ceremony.
 * Single taps and every non-boundary heart are inert.
 *
 * Pure Reanimated (no Skia): ~14 transform/opacity-only leaf views mounted ONLY while an effect
 * runs — obeys every device perf rule (no rasterized animating layers, no fractional-alpha
 * containers at rest, nothing mounted when idle).
 */

const HOLD_MS = 750; // build-up; the gesture triggers here
const FX_MS = 950; // burst + settle after the trigger
const CANCEL_MS = 180;
const GROW = 1.35; // overlay grows to 1 + GROW ≈ 2.35x (35px heart → ~82px, past a fingertip)

const heartArt = (s: PipState) => (s === 'empty' ? Art.heartDepleted : Art.heart);
const heartTint = (s: PipState, accent: string) => (s === 'golden' ? Rune.goldBright : s === 'active' ? accent : undefined);

/** Post-state of the acted slot, per action. */
const POST: Record<HeartAction, PipState> = { fill: 'active', break: 'empty', goldify: 'golden', degold: 'active' };
const GAINS: Record<HeartAction, boolean> = { fill: true, goldify: true, break: false, degold: false };

// Deterministic shard field (no Math.random — keeps renders pure and replays identical). Angles
// jittered off a uniform fan; distances/sizes/spins off small prime cycles.
interface Shard { ang: number; dist: number; size: number; spin: number; diamond: boolean; tone: number; delay: number }
const SHARDS: Shard[] = Array.from({ length: 14 }, (_, i) => ({
  ang: (i / 14) * Math.PI * 2 + (i % 3) * 0.23,
  dist: 62 + ((i * 37) % 68),
  size: 5 + ((i * 13) % 5),
  spin: ((i % 5) - 2) * 2.6,
  diamond: i % 3 !== 0,
  tone: i % 7 === 0 ? 2 : i % 3 === 0 ? 1 : 0,
  delay: (i % 4) * 0.07,
}));
const INFLOW_DIST = 150; // extra distance for inbound shards — they start past the sheet edges

function shardColor(action: HeartAction, tone: number, accent: string): string {
  const gold = action === 'goldify' || action === 'degold';
  if (tone === 2) return Rune.inkText; // a few sharp dark slivers — modern contrast
  if (tone === 1) return gold ? Rune.gold : Rune.goldEdge; // arcane gold accents tie to the frame
  return gold ? Rune.goldBright : accent;
}

interface FxState { index: number; action: HeartAction; pre: PipState }

interface SlotProps {
  index: number;
  x: number;
  pip: number;
  state: PipState;
  action: HeartAction | null;
  accent: string;
  hidden: boolean;
  onBegin: (index: number, action: HeartAction) => void;
  onTrigger: () => void;
  onCancel: () => void;
  onInstant: (action: HeartAction) => void;
}

const HeartSlot = memo(function HeartSlot({ index, x, pip, state, action, accent, hidden, onBegin, onTrigger, onCancel, onInstant }: SlotProps) {
  const body = (
    <View style={[box(x, 0, pip, pip), { opacity: hidden ? 0 : 1 }]}
      accessible
      accessibilityLabel={`Hit point heart ${index + 1}, ${state}`}
      accessibilityHint={action ? `Hold to ${GAINS[action] ? 'restore' : 'spend'} one hit point. Double tap for no animation.` : undefined}>
      <ArtImage source={heartArt(state)} fit="contain" tint={heartTint(state, accent)} />
    </View>
  );
  if (!action) return body;
  const hold = Gesture.LongPress()
    .minDuration(HOLD_MS)
    .maxDistance(28)
    .onBegin(() => runOnJS(onBegin)(index, action))
    .onStart(() => runOnJS(onTrigger)())
    .onFinalize((_e, success) => {
      if (!success) runOnJS(onCancel)();
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => runOnJS(onInstant)(action));
  return <GestureDetector gesture={Gesture.Exclusive(doubleTap, hold)}>{body}</GestureDetector>;
});

/** One shard of the burst/inflow — a flat chamfer-era sliver, transform/opacity only. */
function ShardView({ shard, action, accent, inward, fxP }: { shard: Shard; action: HeartAction; accent: string; inward: boolean; fxP: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, (fxP.value - shard.delay) / (1 - shard.delay)));
    // outward: fly from the heart; inward: arrive INTO it from past the screen edge.
    const travel = inward ? (1 - p) * (shard.dist + INFLOW_DIST) : Math.pow(p, 0.62) * shard.dist;
    const fade = inward ? Math.min(1, p * 3) * Math.min(1, (1 - p) * 6 + 0.35) : Math.min(1, (1 - p) * 1.9);
    return {
      transform: [
        { translateX: Math.cos(shard.ang) * travel },
        { translateY: Math.sin(shard.ang) * travel * 0.92 },
        { rotate: `${(shard.diamond ? 0.785 : 0) + shard.spin * p}rad` },
        { scale: inward ? 0.7 + 0.3 * p : 1 - 0.4 * p },
      ],
      opacity: p <= 0 || p >= 1 ? 0 : fade,
    };
  });
  const s = shard.size;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: -s / 2, top: -s / 2, width: s, height: shard.diamond ? s : s * 1.9 },
        { backgroundColor: shardColor(action, shard.tone, accent) },
        style,
      ]}
    />
  );
}

interface HeartTrackProps {
  left: number;
  top: number;
  width: number;
  pip: number;
  hp: number;
  slots?: number;
  accent: string;
  onHp: (n: number) => void;
}

export function HeartTrack({ left, top, width, pip, hp, slots = 6, accent, onHp }: HeartTrackProps) {
  const reduced = useReducedMotion();
  const { states } = resolveHearts(hp, slots);
  const bounds = heartBoundaries(hp, slots);
  const step = (width - pip) / (slots - 1);

  const [fx, setFx] = useState<FxState | null>(null);
  const triggered = useRef(false);
  const holdP = useSharedValue(0);
  const fxP = useSharedValue(0);

  const clearFx = useCallback(() => {
    triggered.current = false;
    setFx(null);
  }, []);

  const onBegin = useCallback(
    (index: number, action: HeartAction) => {
      if (fx) return;
      triggered.current = false;
      setFx({ index, action, pre: resolveHearts(hp, slots).states[index] });
      holdP.value = 0;
      fxP.value = 0;
      holdP.value = withTiming(1, { duration: HOLD_MS, easing: Easing.in(Easing.cubic) });
    },
    [fx, hp, slots, holdP, fxP],
  );

  const onTrigger = useCallback(() => {
    if (!fx || triggered.current) return;
    triggered.current = true;
    onHp(hp + (GAINS[fx.action] ? 1 : -1));
    fxP.value = withTiming(1, { duration: FX_MS, easing: Easing.out(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(clearFx)();
    });
  }, [fx, hp, onHp, fxP, clearFx]);

  const onCancel = useCallback(() => {
    if (triggered.current) return; // the effect is running its course
    holdP.value = withTiming(0, { duration: CANCEL_MS }, (finished) => {
      if (finished) runOnJS(clearFx)();
    });
  }, [holdP, clearFx]);

  const onInstant = useCallback(
    (action: HeartAction) => {
      if (fx) return;
      onHp(hp + (GAINS[action] ? 1 : -1));
    },
    [fx, hp, onHp],
  );

  // ---- overlay (the held heart, grown past the finger, shaking as it charges) ----
  const grow = useAnimatedStyle(() => {
    const charge = holdP.value * (1 - fxP.value);
    const wobble = reduced ? 0 : Math.sin(holdP.value * 46) * 0.07 * charge;
    return {
      transform: [{ scale: 1 + (reduced ? 0.25 : GROW) * charge }, { rotate: `${wobble}rad` }],
    };
  });
  // pre → post art crossfade: a gain fills as the inflow lands (~55%); a loss shatters instantly.
  const preFade = useAnimatedStyle(() => ({
    opacity: fx && GAINS[fx.action] ? (fxP.value > 0.55 ? 0 : 1) : fxP.value > 0.1 ? 0 : 1,
  }));
  const postFade = useAnimatedStyle(() => ({
    opacity: fx && GAINS[fx.action] ? (fxP.value > 0.55 ? 1 : 0) : fxP.value > 0.1 ? 1 : 0,
  }));
  // the arcane seal: a 45°-rotated square outline blooming out of the heart on trigger
  const ring = useAnimatedStyle(() => {
    const p = fxP.value;
    return {
      transform: [{ rotate: '45deg' }, { scale: 0.2 + p * 2.2 }],
      opacity: p <= 0 ? 0 : Math.max(0, 0.9 - p),
    };
  });

  const fxX = fx ? fx.index * step + pip / 2 : 0;
  const post = fx ? POST[fx.action] : 'empty';
  const inward = fx ? GAINS[fx.action] : false;

  return (
    <View style={[box(left, top, width, pip), { zIndex: 1500 }]}>
      {states.map((s, i) => (
        <HeartSlot
          key={i}
          index={i}
          x={i * step}
          pip={pip}
          state={s}
          action={i === bounds.up ? bounds.upAction : i === bounds.down ? bounds.downAction : null}
          accent={accent}
          hidden={fx?.index === i}
          onBegin={onBegin}
          onTrigger={onTrigger}
          onCancel={onCancel}
          onInstant={onInstant}
        />
      ))}
      {fx ? (
        <View style={[box(fxX, pip / 2, 0, 0), { overflow: 'visible' }]} pointerEvents="none">
          {/* the held heart, above everything, pre/post crossfade inside the grown frame */}
          <Animated.View style={[{ position: 'absolute', left: -pip / 2, top: -pip / 2, width: pip, height: pip }, grow]}>
            <Animated.View style={[box(0, 0, pip, pip), preFade]}>
              <ArtImage source={heartArt(fx.pre)} fit="contain" tint={heartTint(fx.pre, accent)} />
            </Animated.View>
            <Animated.View style={[box(0, 0, pip, pip), postFade]}>
              <ArtImage source={heartArt(post)} fit="contain" tint={heartTint(post, accent)} />
            </Animated.View>
          </Animated.View>
          {!reduced ? (
            <>
              <Animated.View
                pointerEvents="none"
                style={[
                  { position: 'absolute', left: -22, top: -22, width: 44, height: 44, borderWidth: 1.5 },
                  { borderColor: fx.action === 'goldify' || fx.action === 'degold' ? Rune.goldBright : accent },
                  ring,
                ]}
              />
              {SHARDS.map((shard, i) => (
                <ShardView key={i} shard={shard} action={fx.action} accent={accent} inward={inward} fxP={fxP} />
              ))}
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
