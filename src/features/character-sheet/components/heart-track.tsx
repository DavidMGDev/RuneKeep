import { memo, useCallback, useEffect, useRef, useState } from 'react';
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
 * BOUNDARY hearts are interactive (see heartBoundaries). Hold one ~0.75s — it pops under your
 * finger and keeps growing, shaking harder as it charges — and at the threshold the step applies
 * with an arcane shard effect (outward for a loss, flying in from off-screen for a gain; gold
 * variants for the golden hearts). Release early to cancel. Double-tap = the same step instantly.
 * Single taps and every non-boundary heart are inert.
 *
 * Effects are INDEPENDENT instances (#86): the moment a hold triggers, its effect detaches and
 * settles on its own ~0.95s clock while the row is immediately interactive again — three hearts
 * can be healed or broken in rapid succession, each trailing its own shards.
 *
 * Pure Reanimated (no Skia): transform/opacity-only leaf views mounted ONLY while effects run —
 * obeys every device perf rule (no rasterized animating layers, no fractional-alpha containers
 * at rest, nothing mounted when idle).
 */

const HOLD_MS = 750; // build-up; the gesture triggers here
const FX_MS = 950; // burst + settle after the trigger
const CANCEL_MS = 180;
// The hold runs on an ease-OUT curve, so most of this lands in the first ~150ms: the heart POPS
// to ~2x the instant the finger lands (you feel that you have it), then climbs to ~3.4x (~120px)
// by the trigger (#85/#86 — 20% bigger per owner).
const GROW = 2.4;
const REDUCED_GROW = 0.4;

const heartArt = (s: PipState) => (s === 'empty' ? Art.heartDepleted : Art.heart);
const heartTint = (s: PipState, accent: string) => (s === 'golden' ? Rune.goldBright : s === 'active' ? accent : undefined);

/** Post-state of the acted slot, per action. */
const POST: Record<HeartAction, PipState> = { fill: 'active', break: 'empty', goldify: 'golden', degold: 'active' };
const GAINS: Record<HeartAction, boolean> = { fill: true, goldify: true, break: false, degold: false };

// Deterministic shard field (no Math.random — keeps renders pure and replays identical). Angles
// jittered off a uniform fan; distances/sizes/spins off small prime cycles. Distances carry the
// +20% of #86.
interface Shard { ang: number; dist: number; size: number; spin: number; diamond: boolean; tone: number; delay: number }
const SHARDS: Shard[] = Array.from({ length: 14 }, (_, i) => ({
  ang: (i / 14) * Math.PI * 2 + (i % 3) * 0.23,
  dist: 74 + ((i * 37) % 82),
  size: 5 + ((i * 13) % 5),
  spin: ((i % 5) - 2) * 2.6,
  diamond: i % 3 !== 0,
  tone: i % 7 === 0 ? 2 : i % 3 === 0 ? 1 : 0,
  delay: (i % 4) * 0.07,
}));
const INFLOW_DIST = 170; // extra distance for inbound shards — they start past the sheet edges

function shardColor(action: HeartAction, tone: number, accent: string): string {
  const gold = action === 'goldify' || action === 'degold';
  if (tone === 2) return Rune.inkText; // a few sharp dark slivers — modern contrast
  if (tone === 1) return gold ? Rune.gold : Rune.goldEdge; // arcane gold accents tie to the frame
  return gold ? Rune.goldBright : accent;
}

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

interface FxInstance { id: number; index: number; action: HeartAction; pre: PipState }

/** One detached, self-cleaning effect (#86): owns its progress, settles the grown heart from the
 *  hold's peak back into the row, crossfades pre→post art, and fires its shards. */
function HeartFxView({ inst, x, pip, accent, reduced, onDone }: { inst: FxInstance; x: number; pip: number; accent: string; reduced: boolean; onDone: (id: number) => void }) {
  const p = useSharedValue(0);
  const done = useCallback(() => onDone(inst.id), [onDone, inst.id]);
  useEffect(() => {
    p.value = withTiming(1, { duration: FX_MS, easing: Easing.out(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(done)();
    });
  }, [p, done]);

  const gains = GAINS[inst.action];
  const post = POST[inst.action];
  const gold = inst.action === 'goldify' || inst.action === 'degold';

  const settle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (reduced ? REDUCED_GROW : GROW) * (1 - p.value) }],
  }));
  // a gain fills as the inflow lands (~55%); a loss shatters instantly.
  const preFade = useAnimatedStyle(() => ({ opacity: gains ? (p.value > 0.55 ? 0 : 1) : p.value > 0.1 ? 0 : 1 }));
  const postFade = useAnimatedStyle(() => ({ opacity: gains ? (p.value > 0.55 ? 1 : 0) : p.value > 0.1 ? 1 : 0 }));
  // the arcane seal: a 45°-rotated square outline blooming out of the heart on trigger
  const ring = useAnimatedStyle(() => ({
    transform: [{ rotate: '45deg' }, { scale: 0.2 + p.value * 2.6 }],
    opacity: p.value <= 0 ? 0 : Math.max(0, 0.9 - p.value),
  }));

  return (
    <View style={[box(x, pip / 2, 0, 0), { overflow: 'visible' }]} pointerEvents="none">
      <Animated.View style={[{ position: 'absolute', left: -pip / 2, top: -pip / 2, width: pip, height: pip }, settle]}>
        <Animated.View style={[box(0, 0, pip, pip), preFade]}>
          <ArtImage source={heartArt(inst.pre)} fit="contain" tint={heartTint(inst.pre, accent)} />
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
              { borderColor: gold ? Rune.goldBright : accent },
              ring,
            ]}
          />
          {SHARDS.map((shard, i) => (
            <ShardView key={i} shard={shard} action={inst.action} accent={accent} inward={gains} fxP={p} />
          ))}
        </>
      ) : null}
    </View>
  );
}

interface HoldState { index: number; action: HeartAction; pre: PipState }

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

  const [hold, setHold] = useState<HoldState | null>(null);
  const [effects, setEffects] = useState<FxInstance[]>([]);
  const triggered = useRef(false);
  const nextId = useRef(1);
  const holdP = useSharedValue(0);

  const clearHold = useCallback(() => {
    triggered.current = false;
    setHold(null);
  }, []);

  const onBegin = useCallback(
    (index: number, action: HeartAction) => {
      if (hold) return; // one finger charges at a time; settling effects don't block (#86)
      triggered.current = false;
      setHold({ index, action, pre: resolveHearts(hp, slots).states[index] });
      holdP.value = 0;
      holdP.value = withTiming(1, { duration: HOLD_MS, easing: Easing.out(Easing.cubic) });
    },
    [hold, hp, slots, holdP],
  );

  const onTrigger = useCallback(() => {
    if (!hold || triggered.current) return;
    triggered.current = true;
    onHp(hp + (GAINS[hold.action] ? 1 : -1));
    // Detach: the effect lives its own life; the row is interactive again right away (#86).
    setEffects((list) => [...list, { id: nextId.current++, index: hold.index, action: hold.action, pre: hold.pre }]);
    holdP.value = 0;
    clearHold();
  }, [hold, hp, onHp, holdP, clearHold]);

  const onCancel = useCallback(() => {
    if (triggered.current) return; // already detached into an effect
    holdP.value = withTiming(0, { duration: CANCEL_MS }, (finished) => {
      if (finished) runOnJS(clearHold)();
    });
  }, [holdP, clearHold]);

  const onInstant = useCallback(
    (action: HeartAction) => {
      // The FIRST tap of a double-tap starts a hold; a pending UNTRIGGERED hold is ours to
      // discard (#85). Only a hold that already fired blocks the instant path.
      if (triggered.current) return;
      holdP.value = 0;
      setHold(null);
      onHp(hp + (GAINS[action] ? 1 : -1));
    },
    [hp, onHp, holdP],
  );

  const onDone = useCallback((id: number) => setEffects((list) => list.filter((e) => e.id !== id)), []);

  // ---- the held heart, grown past the finger, shaking as it charges ----
  const grow = useAnimatedStyle(() => {
    const charge = holdP.value;
    const wobble = reduced ? 0 : Math.sin(holdP.value * 46) * 0.07 * charge;
    return {
      transform: [{ scale: 1 + (reduced ? REDUCED_GROW : GROW) * charge }, { rotate: `${wobble}rad` }],
    };
  });

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
          hidden={hold?.index === i || effects.some((e) => e.index === i)}
          onBegin={onBegin}
          onTrigger={onTrigger}
          onCancel={onCancel}
          onInstant={onInstant}
        />
      ))}
      {hold ? (
        <View style={[box(hold.index * step + pip / 2, pip / 2, 0, 0), { overflow: 'visible' }]} pointerEvents="none">
          <Animated.View style={[{ position: 'absolute', left: -pip / 2, top: -pip / 2, width: pip, height: pip }, grow]}>
            <ArtImage source={heartArt(hold.pre)} fit="contain" tint={heartTint(hold.pre, accent)} />
          </Animated.View>
        </View>
      ) : null}
      {effects.map((inst) => (
        <HeartFxView key={inst.id} inst={inst} x={inst.index * step + pip / 2} pip={pip} accent={accent} reduced={reduced} onDone={onDone} />
      ))}
    </View>
  );
}
