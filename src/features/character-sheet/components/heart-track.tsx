import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, runOnJS, type SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ArtImage } from '@/components/art-image';
import { Rune } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { box } from '@/lib/design';
import { type HeartAction, heartBoundaries, type PipState, resolveHearts } from '@/lib/pips';
import { Art } from '../art';
import { ChargeMoteView, HEART_MOTES } from './charge-track';

/**
 * The HP heart row (#81): Daggerheart never moves more than ONE point at a time, so only the two
 * BOUNDARY hearts are interactive (see heartBoundaries). Hold one ~0.75s — it pops under your
 * finger and keeps growing, shaking harder as it charges — and at the threshold the step applies
 * with an arcane shard effect (outward for a loss, flying in from off-screen for a gain; gold
 * variants for the golden hearts). Release early to cancel. Two touch-downs on the same heart
 * within ~320ms = the step instantly, no ceremony (#88 — detected manually on DOWN events, never
 * via a Tap recognizer racing the LongPress). Single taps and non-boundary hearts are inert.
 *
 * ONE persistent HeartAnim instance carries hold → explosion → settle (#88): both art states are
 * mounted from touch-down, so nothing ever unmounts/remounts mid-animation — that remount was the
 * old two-frame blank at the climax. Instances are independent and self-cleaning (#86): the row
 * is interactive again the instant a hold fires, so hearts chain in rapid succession.
 *
 * Pure Reanimated (no Skia): transform/opacity-only leaf views mounted ONLY while an animation
 * runs — no rasterized animating layers, no fractional-alpha containers at rest.
 */

const HOLD_MS = 825; // 1.5x the #93 length (#94 follow-up) — double-tap exists for speed, the hold is ceremony
const FX_MS = 1425; // burst + settle after the trigger
const POP_MS = 260; // double-tap feedback: a quick particle-free jump
const CANCEL_MS = 180;
const DOUBLE_MS = 320; // max gap between touch-DOWNs for the instant path
const GROW = 2.9; // +20% (#93) — ~135px at the peak
const REDUCED_GROW = 0.4;

const heartArt = (s: PipState) => (s === 'empty' ? Art.heartDepleted : Art.heart);
const heartTint = (s: PipState, accent: string) => (s === 'golden' ? Rune.goldBright : s === 'active' ? accent : undefined);

/** Post-state of the acted slot, per action. */
const POST: Record<HeartAction, PipState> = { fill: 'active', break: 'empty', goldify: 'golden', degold: 'active' };
const GAINS: Record<HeartAction, boolean> = { fill: true, goldify: true, break: false, degold: false };

// Deterministic shard field (no Math.random — keeps renders pure and replays identical).
// Distances carry the #94 field expansion (~2.5x area, ~1.7x radius) — the burst owns a real
// portion of the screen.
interface Shard { ang: number; dist: number; size: number; spin: number; diamond: boolean; tone: number; delay: number }
const SHARDS: Shard[] = Array.from({ length: 14 }, (_, i) => ({
  ang: (i / 14) * Math.PI * 2 + (i % 3) * 0.23,
  dist: 126 + ((i * 37) % 140),
  size: 5 + ((i * 13) % 5),
  spin: ((i % 5) - 2) * 2.6,
  diamond: i % 3 !== 0,
  tone: i % 7 === 0 ? 2 : i % 3 === 0 ? 1 : 0,
  delay: (i % 4) * 0.07,
}));
const INFLOW_DIST = 290; // extra distance for inbound shards — they start past the sheet edges

// Extra sparkle field for healing INTO a golden heart (#89 A) — small gold/ivory diamonds that
// twinkle as they spiral in, on top of the regular shard inflow.
const GOLD_SPARKS: Shard[] = Array.from({ length: 10 }, (_, i) => ({
  ang: (i / 10) * Math.PI * 2 + 0.45,
  dist: 85 + ((i * 29) % 102),
  size: 4 + ((i * 11) % 4),
  spin: ((i % 3) - 1) * 4.2,
  diamond: true,
  tone: i % 3 === 0 ? 3 : 0, // 3 = ivory twinkle
  delay: (i % 5) * 0.06,
}));

function shardColor(action: HeartAction, tone: number, accent: string): string {
  const gold = action === 'goldify' || action === 'degold';
  if (tone === 3) return Rune.ivory; // golden-heal twinkles
  if (tone === 2) return Rune.inkText; // a few sharp dark slivers — modern contrast
  if (tone === 1) return gold ? Rune.gold : Rune.goldEdge; // arcane gold accents tie to the frame
  return gold ? Rune.goldBright : accent;
}

interface SlotProps {
  index: number;
  x: number;
  pip: number;
  state: PipState;
  accent: string;
  hidden: boolean;
}

const HeartSlot = memo(function HeartSlot({ index, x, pip, state, accent, hidden }: SlotProps) {
  // Hidden = opacity 0, NEVER unmounted: the image stays painted, so when an animation ends and
  // the slot reappears in the same commit there is no decode gap (#88). Gestures live on the
  // ZONES now (#93), not the slots.
  return (
    <View style={[box(x, 0, pip, pip), { opacity: hidden ? 0 : 1 }]} accessible accessibilityLabel={`Hit point heart ${index + 1}, ${state}`}>
      <ArtImage source={heartArt(state)} fit="contain" tint={heartTint(state, accent)} />
    </View>
  );
});

/** One shard of the burst/inflow — a flat chamfer-era sliver, transform/opacity only. */
function ShardView({ shard, action, accent, inward, fxP }: { shard: Shard; action: HeartAction; accent: string; inward: boolean; fxP: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, (fxP.value - shard.delay) / (1 - shard.delay)));
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

type AnimPhase = 'hold' | 'fx' | 'out' | 'pop';
interface Anim { id: number; index: number; action: HeartAction; pre: PipState; phase: AnimPhase }

/**
 * ONE component instance per interaction, alive from touch-down to settle (#88). Both art states
 * mount immediately (post at alpha 0) so the climax never waits on an image; phase changes only
 * retarget shared values — nothing remounts.
 */
function HeartAnim({ anim, x, pip, accent, reduced, onDone }: { anim: Anim; x: number; pip: number; accent: string; reduced: boolean; onDone: (id: number) => void }) {
  const holdP = useSharedValue(0);
  const fxP = useSharedValue(0);
  const done = useCallback(() => onDone(anim.id), [onDone, anim.id]);

  useEffect(() => {
    if (anim.phase === 'pop') {
      fxP.value = withTiming(1, { duration: POP_MS, easing: Easing.out(Easing.quad) }, (finished) => {
        if (finished) runOnJS(done)();
      });
    } else if (anim.phase === 'hold') {
      holdP.value = withTiming(1, { duration: HOLD_MS, easing: Easing.out(Easing.cubic) });
    } else if (anim.phase === 'fx') {
      cancelAnimation(holdP);
      holdP.value = 1; // pin the charge peak; the settle owns the curve from here
      fxP.value = withTiming(1, { duration: FX_MS, easing: Easing.out(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(done)();
      });
    } else {
      cancelAnimation(holdP);
      holdP.value = withTiming(0, { duration: CANCEL_MS }, (finished) => {
        if (finished) runOnJS(done)();
      });
    }
  }, [anim.phase, holdP, fxP, done]);

  const gains = GAINS[anim.action];
  const post = POST[anim.action];
  const gold = anim.action === 'goldify' || anim.action === 'degold';
  // Double-tap feedback (#94 follow-up): a small particle-free JUMP, nothing else.
  const isPop = anim.phase === 'pop';

  // hold: pop + charge — scale peaks at ~75% of the hold (#94: 1.5x slower growth). The SHAKE
  // belongs only to LOSSES (#94: spending hit points stays violent); gains charge calmly while
  // thick slow motes converge instead. fx: +0.55 kick at the climax, then a damped elastic settle.
  const heart = useAnimatedStyle(() => {
    const p = fxP.value;
    if (isPop) return { transform: [{ scale: 1 + 0.35 * Math.sin(Math.min(1, p) * Math.PI) }, { rotate: '0rad' }] };
    const chargeFast = Math.min(1, holdP.value * 1.333);
    const shake = holdP.value;
    const grow = reduced ? REDUCED_GROW : GROW;
    const kick = !reduced && p > 0 && p < 0.22 ? 0.55 * Math.sin((p / 0.22) * Math.PI) : 0;
    const elastic = !reduced && p >= 0.22 ? Math.cos((p - 0.22) * 16) * 0.16 * (1 - p) : 0;
    const wobble = reduced || gains ? 0 : Math.sin(shake * 46) * 0.07 * shake * Math.max(0, 1 - p * 5);
    return {
      transform: [{ scale: 1 + grow * chargeFast * (1 - p) + kick + elastic }, { rotate: `${wobble}rad` }],
    };
  });
  // A plain fill turns as the inflow lands (~55%); GOLDIFY turns AT the climax — golden before
  // any shrink begins (#89 A); losses shatter instantly.
  const crossAt = isPop ? 0 : anim.action === 'fill' ? 0.55 : anim.action === 'goldify' ? 0.15 : 0.1;
  const preFade = useAnimatedStyle(() => ({ opacity: fxP.value > crossAt ? 0 : 1 }));
  const postFade = useAnimatedStyle(() => ({ opacity: fxP.value > crossAt ? 1 : 0 }));
  // the arcane seal: a 45°-rotated square outline blooming out of the heart on trigger
  const ring = useAnimatedStyle(() => ({
    transform: [{ rotate: '45deg' }, { scale: 0.2 + fxP.value * 4.4 }],
    opacity: fxP.value <= 0 ? 0 : Math.max(0, 0.9 - fxP.value),
  }));

  return (
    <View style={[box(x, pip / 2, 0, 0), { overflow: 'visible' }]} pointerEvents="none">
      <Animated.View style={[{ position: 'absolute', left: -pip / 2, top: -pip / 2, width: pip, height: pip }, heart]}>
        <Animated.View style={[box(0, 0, pip, pip), preFade]}>
          <ArtImage source={heartArt(anim.pre)} fit="contain" tint={heartTint(anim.pre, accent)} />
        </Animated.View>
        <Animated.View style={[box(0, 0, pip, pip), postFade]}>
          <ArtImage source={heartArt(post)} fit="contain" tint={heartTint(post, accent)} />
        </Animated.View>
      </Animated.View>
      {!reduced && !isPop ? (
        <>
          {/* gains charge with thick, SLOW motes converging into the heart (#94) — no shake */}
          {gains
            ? HEART_MOTES.map((m, i) => (
                <ChargeMoteView key={`c${i}`} m={m} inward cycles={1} slow diamond={false} colors={[gold ? Rune.goldBright : accent, Rune.goldEdge, gold ? Rune.gold : accent]} holdP={holdP} fxP={fxP} />
              ))
            : null}
          <Animated.View
            pointerEvents="none"
            style={[
              { position: 'absolute', left: -22, top: -22, width: 44, height: 44, borderWidth: 1.5 },
              { borderColor: gold ? Rune.goldBright : accent },
              ring,
            ]}
          />
          {SHARDS.map((shard, i) => (
            <ShardView key={i} shard={shard} action={anim.action} accent={accent} inward={gains} fxP={fxP} />
          ))}
          {/* healing into GOLD is richer (#89 A): a second, later seal ring + twinkling sparks */}
          {anim.action === 'goldify' ? (
            <>
              <Animated.View
                pointerEvents="none"
                style={[{ position: 'absolute', left: -16, top: -16, width: 32, height: 32, borderWidth: 1.5, borderColor: Rune.gold }, ring]}
              />
              {GOLD_SPARKS.map((shard, i) => (
                <ShardView key={`g${i}`} shard={shard} action={anim.action} accent={accent} inward fxP={fxP} />
              ))}
            </>
          ) : null}
        </>
      ) : null}
    </View>
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

  const [anims, setAnims] = useState<Anim[]>([]);
  const charging = useRef<Anim | null>(null);
  const lastDown = useRef({ index: -1, t: 0 });
  const nextId = useRef(1);

  const onDone = useCallback((id: number) => setAnims((list) => list.filter((a) => a.id !== id)), []);

  const onBegin = useCallback(
    (index: number, action: HeartAction) => {
      // Double-tap = two touch-DOWNs on the same heart inside the window (#88). Checked before
      // anything else, so it works no matter what holds/cancels are mid-flight.
      const now = Date.now();
      const isDouble = lastDown.current.index === index && now - lastDown.current.t < DOUBLE_MS;
      lastDown.current = { index, t: now };
      if (isDouble) {
        if (charging.current) {
          const id = charging.current.id;
          charging.current = null;
          setAnims((list) => list.filter((a) => a.id !== id)); // discard the first tap's charge
        }
        onHp(hp + (GAINS[action] ? 1 : -1));
        // feedback, not ceremony: a quick particle-free jump on the heart (#94 follow-up)
        setAnims((list) => [...list, { id: nextId.current++, index, action, pre: resolveHearts(hp, slots).states[index], phase: 'pop' }]);
        return;
      }
      if (charging.current) return; // one finger charges at a time; settling anims don't block
      const anim: Anim = { id: nextId.current++, index, action, pre: resolveHearts(hp, slots).states[index], phase: 'hold' };
      charging.current = anim;
      setAnims((list) => [...list, anim]);
    },
    [hp, slots, onHp],
  );

  const onTrigger = useCallback(() => {
    const c = charging.current;
    if (!c) return;
    charging.current = null;
    onHp(hp + (GAINS[c.action] ? 1 : -1));
    setAnims((list) => list.map((a) => (a.id === c.id ? { ...a, phase: 'fx' as AnimPhase } : a)));
  }, [hp, onHp]);

  const onCancel = useCallback(() => {
    const c = charging.current;
    if (!c) return;
    charging.current = null;
    setAnims((list) => list.map((a) => (a.id === c.id ? { ...a, phase: 'out' as AnimPhase } : a)));
  }, []);

  // ZONES (#93, the armor system the owner loves): two halves split at a barrier own the
  // gestures. The barrier sits midway between the down-slot and the up-slot, and each zone acts
  // on whichever boundary slot lives on ITS side — so at hp 6 (up = heart #1 goldifies, down =
  // heart #6 breaks) the LEFT half goldifies and the RIGHT half breaks, per owner.
  const zoneGesture = (index: number, action: HeartAction) =>
    Gesture.LongPress()
      .minDuration(HOLD_MS)
      .maxDistance(32)
      .onBegin(() => runOnJS(onBegin)(index, action))
      .onStart(() => runOnJS(onTrigger)())
      .onFinalize((_e, success) => {
        if (!success) runOnJS(onCancel)();
      });
  const Z_L = -10;
  const Z_R = width + 10;
  const zones: { from: number; to: number; index: number; action: HeartAction }[] = [];
  if (bounds.up >= 0 && bounds.down >= 0) {
    const upX = bounds.up * step;
    const downX = bounds.down * step;
    const barrier = (Math.min(upX, downX) + pip + Math.max(upX, downX)) / 2;
    const first = upX < downX ? { index: bounds.up, action: bounds.upAction } : { index: bounds.down, action: bounds.downAction };
    const second = upX < downX ? { index: bounds.down, action: bounds.downAction } : { index: bounds.up, action: bounds.upAction };
    zones.push({ from: Z_L, to: barrier, ...first }, { from: barrier, to: Z_R, ...second });
  } else if (bounds.up >= 0) {
    zones.push({ from: Z_L, to: Z_R, index: bounds.up, action: bounds.upAction });
  } else if (bounds.down >= 0) {
    zones.push({ from: Z_L, to: Z_R, index: bounds.down, action: bounds.downAction });
  }

  return (
    // zIndex 10: above the sheet's other body elements so shards fly over them, but BELOW the
    // expand veil (20) and the card carousel (30) — see the #87 stacking contract.
    <View style={[box(left, top, width, pip), { zIndex: 10, overflow: 'visible' }]}>
      {states.map((s, i) => (
        <HeartSlot
          key={i}
          index={i}
          x={i * step}
          pip={pip}
          state={s}
          accent={accent}
          // ONE visible heart per slot: the animating copy owns the slot for its whole life (#88).
          hidden={anims.some((a) => a.index === i)}
        />
      ))}
      {zones.map((z, i) => (
        <GestureDetector key={`${i}-${z.index}-${z.action}`} gesture={zoneGesture(z.index, z.action)}>
          <View
            style={box(z.from, -10, z.to - z.from, pip + 20)}
            accessible
            accessibilityLabel={`${GAINS[z.action] ? 'Restore' : 'Spend'} hit point`}
            accessibilityHint="Hold to confirm. Double tap for no animation."
          />
        </GestureDetector>
      ))}
      {anims.map((a) => (
        <HeartAnim key={a.id} anim={a} x={a.index * step + pip / 2} pip={pip} accent={accent} reduced={reduced} onDone={onDone} />
      ))}
    </View>
  );
}
