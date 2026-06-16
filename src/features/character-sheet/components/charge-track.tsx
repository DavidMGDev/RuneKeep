import { forwardRef, type ReactNode, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, runOnJS, type SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Rune } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { box } from '@/lib/design';
import { playRiser, playSfx, type RiserHandle, type SfxId } from '@/lib/sfx';
import { RISER_START_DELAY_MS, RISER_VOLUME, STAT_SOUND_DELAY_MS } from '@/lib/sfx-config';

/**
 * The generic hold-to-charge ±1 track (#89) — the proven heart interaction (see heart-track.tsx,
 * #88) generalized for stress / hope / armor: only the two BOUNDARY slots ever act; hold ~0.75s
 * (pop + charging shake) to trigger, two touch-DOWNs within ~320ms for the instant path, release
 * early to cancel; every interaction is a detached, self-cleaning animation instance, and nothing
 * unmounts mid-animation (both pre/post visuals mount at touch-down).
 *
 * Flavors: 'stress' = lightning — thin slivers on QUANTIZED jumps with perpendicular jitter and
 * flickering alpha (sharp, abrupt); 'hope' = instant light RAYS + rising twinkling sparks (abrupt
 * but grandiose; losses dim the rays and let the sparks fall); 'armor' = flat metal plates,
 * bursting out on a loss, flying in on a gain.
 *
 * Gestures attach per-boundary-slot (with outward hitSlop), or — `zone` mode, for armor's tiny
 * icons — to two BIG halves split at the barrier after the last filled slot: left of the barrier
 * removes, right of it adds, verticality irrelevant (#89 E).
 */

const HOLD_MS = 825; // 1.5x the #93 length (#94 follow-up) — double-tap exists for speed, the hold is ceremony
const FX_MS = 1425;
const POP_MS = 260; // double-tap feedback: a quick particle-free jump
const CANCEL_MS = 180;
const DOUBLE_MS = 320;
const REDUCED_GROW = 0.4;

export type ChargeFlavor = 'stress' | 'hope' | 'armor';
type Dir = 'up' | 'down';
type Phase = 'hold' | 'fx' | 'out' | 'pop';
interface Anim { id: number; index: number; dir: Dir; phase: Phase }

// ---------- particle fields (deterministic — no Math.random) ----------
// All distances carry the #94 field expansion: the particle AREA is ~2.5x (radius ~1.7x) so the
// effects own a real portion of the screen instead of a small square around the icon.
interface Bolt { ang: number; dist: number; len: number; tone: number; delay: number }
const BOLTS: Bolt[] = Array.from({ length: 10 }, (_, i) => ({
  ang: (i / 10) * Math.PI * 2 + (i % 2) * 0.4,
  dist: 98 + ((i * 31) % 92),
  len: 14 + ((i * 7) % 12),
  tone: i % 4 === 0 ? 1 : 0,
  delay: (i % 3) * 0.05,
}));

interface Ray { ang: number; len: number; w: number; tone: number }
const RAYS: Ray[] = Array.from({ length: 12 }, (_, i) => ({
  ang: (i / 12) * Math.PI * 2 + 0.2,
  len: 51 + ((i * 17) % 58),
  w: i % 2 ? 2 : 3,
  tone: i % 2,
}));

interface Spark { ang: number; dist: number; size: number; tone: number; delay: number }
const SPARKS: Spark[] = Array.from({ length: 9 }, (_, i) => ({
  ang: (i / 9) * Math.PI * 2,
  dist: 44 + ((i * 23) % 68),
  size: 4 + ((i * 11) % 4),
  tone: i % 2,
  delay: (i % 4) * 0.06,
}));

interface Plate { ang: number; dist: number; size: number; spin: number; tone: number; delay: number }
const PLATES: Plate[] = Array.from({ length: 12 }, (_, i) => ({
  ang: (i / 12) * Math.PI * 2 + (i % 3) * 0.25,
  dist: 78 + ((i * 37) % 88),
  size: 4 + ((i * 13) % 4),
  spin: ((i % 5) - 2) * 2.4,
  tone: i % 5 === 0 ? 2 : i % 3 === 0 ? 1 : 0,
  delay: (i % 4) * 0.06,
}));
const INFLOW_DIST = 255;

// ---------- charge-phase motes (#94): the build-up FEEDBACK for non-shaky animations ----------
// Gains: energy converges INTO the icon while it charges. Losses: it seeps out from underneath.
export interface Mote { ang: number; dist: number; w: number; h: number; tone: number; delay: number }
const motesField = (n: number, dist0: number, distMod: number, w: number, h: number): Mote[] =>
  Array.from({ length: n }, (_, i) => ({
    ang: (i / n) * Math.PI * 2 + (i % 3) * 0.3,
    dist: dist0 + ((i * 29) % distMod),
    w,
    h,
    tone: i % 3,
    delay: i / n,
  }));
/** Hearts: thick, slow. Armor: sharp fast slivers. Soft: gentle motes (stress-clear, hope-spend). Hope: lively sparks. */
export const HEART_MOTES = motesField(8, 95, 70, 10, 10);
export const ARMOR_MOTES = motesField(10, 115, 75, 3, 16);
export const SOFT_MOTES = motesField(7, 85, 55, 7, 7);
export const HOPE_MOTES = motesField(9, 105, 65, 6, 6);

/** One charge mote — sweeps once (or `cycles` times) across the hold, gated out at the climax. */
export function ChargeMoteView({ m, inward, cycles, slow, diamond, colors, holdP, fxP }: { m: Mote; inward: boolean; cycles: number; slow: boolean; diamond: boolean; colors: [string, string, string]; holdP: SharedValue<number>; fxP: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const p = (holdP.value * cycles + m.delay) % 1;
    const pe = slow ? 1 - (1 - p) * (1 - p) : p;
    const travel = (inward ? 1 - pe : pe) * m.dist;
    const gone = Math.max(0, 1 - fxP.value * 3);
    return {
      transform: [
        { translateX: Math.cos(m.ang) * travel },
        { translateY: Math.sin(m.ang) * travel * 0.92 },
        { rotate: diamond ? '45deg' : `${m.ang + Math.PI / 2}rad` },
      ],
      // silent through the double-tap window (~first 30% of the hold) — particles only once the
      // user is clearly COMMITTING to the hold (#94 follow-up)
      opacity: Math.sin(p * Math.PI) * 0.9 * gone * Math.min(1, Math.max(0, (holdP.value - 0.28) * 4)),
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: -m.w / 2, top: -m.h / 2, width: m.w, height: m.h },
        { backgroundColor: colors[m.tone] ?? colors[0] },
        style,
      ]}
    />
  );
}

/** Lightning sliver: quantized jumps outward, perpendicular jitter, flickering alpha (#89 C). */
function BoltView({ b, accent, fxP }: { b: Bolt; accent: string; fxP: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, (fxP.value - b.delay) / (1 - b.delay)));
    const q = Math.floor(p * 4) / 4; // ABRUPT: travel in 4 hard steps
    const travel = b.dist * (q + (p - q) * 0.2);
    const jit = (Math.floor(p * 7) % 2 === 0 ? 1 : -1) * 7 * (1 - p);
    const perp = b.ang + Math.PI / 2;
    return {
      transform: [
        { translateX: Math.cos(b.ang) * travel + Math.cos(perp) * jit },
        { translateY: (Math.sin(b.ang) * travel + Math.sin(perp) * jit) * 0.92 },
        { rotate: `${b.ang + Math.PI / 2 + (Math.floor(p * 5) % 2) * 0.35}rad` },
      ],
      opacity: p <= 0 || p >= 1 ? 0 : (Math.floor(p * 9) % 2 === 0 ? 1 : 0.5) * Math.min(1, (1 - p) * 1.6),
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: -1.5, top: -b.len / 2, width: 3, height: b.len },
        { backgroundColor: b.tone === 1 ? Rune.inkText : accent },
        style,
      ]}
    />
  );
}

/** Hope ray: snaps to full length almost instantly, then burns out — grandiose, abrupt (#89 D). */
function RayView({ r, gains, fxP }: { r: Ray; gains: boolean; fxP: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const p = fxP.value;
    const extend = Math.min(1, p / 0.1); // full rays by 10%
    return {
      transform: [{ rotate: `${r.ang + Math.PI / 2}rad` }, { translateY: -(r.len / 2 + 12) }, { scaleY: extend }],
      opacity: p <= 0.02 ? 0 : Math.max(0, 0.95 - p * 1.25) * (gains ? 1 : 0.55),
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: -r.w / 2, top: -r.len / 2, width: r.w, height: r.len },
        { backgroundColor: r.tone ? Rune.goldBright : Rune.gold },
        style,
      ]}
    />
  );
}

/** Hope spark: a twinkling diamond that rises on a gain and falls on a loss (#89 D). */
function SparkView({ s, gains, fxP, idx }: { s: Spark; gains: boolean; fxP: SharedValue<number>; idx: number }) {
  const style = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, (fxP.value - s.delay) / (1 - s.delay)));
    const ease = 1 - (1 - p) * (1 - p);
    return {
      transform: [
        { translateX: Math.cos(s.ang) * 16 * ease },
        { translateY: (gains ? -1 : 1) * (14 + s.dist) * ease },
        { rotate: '45deg' },
      ],
      opacity: p <= 0 || p >= 1 ? 0 : (Math.floor(p * 8 + idx) % 2 === 0 ? 1 : 0.35) * Math.min(1, (1 - p) * 2),
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: -s.size / 2, top: -s.size / 2, width: s.size, height: s.size },
        { backgroundColor: s.tone ? Rune.ivory : Rune.goldBright },
        style,
      ]}
    />
  );
}

/** Smooth shard: the heart-shard motion with a configurable palette — armor metal by default,
 *  warm gold for the soothing stress-clear (#93). */
function PlateView({ pl, inward, fxP, tones }: { pl: Plate; inward: boolean; fxP: SharedValue<number>; tones?: [string, string, string] }) {
  const style = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, (fxP.value - pl.delay) / (1 - pl.delay)));
    const travel = inward ? (1 - p) * (pl.dist + INFLOW_DIST) : Math.pow(p, 0.62) * pl.dist;
    const fade = inward ? Math.min(1, p * 3) * Math.min(1, (1 - p) * 6 + 0.35) : Math.min(1, (1 - p) * 1.9);
    return {
      transform: [
        { translateX: Math.cos(pl.ang) * travel },
        { translateY: Math.sin(pl.ang) * travel * 0.92 },
        { rotate: `${pl.spin * p}rad` },
        { scale: inward ? 0.7 + 0.3 * p : 1 - 0.4 * p },
      ],
      opacity: p <= 0 || p >= 1 ? 0 : fade,
    };
  });
  const palette = tones ?? [Rune.goldEdge, Rune.muted, Rune.inkText];
  const tone = palette[pl.tone] ?? palette[0];
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: -pl.size / 2, top: -pl.size / 2, width: pl.size, height: pl.size * 1.6 }, { backgroundColor: tone }, style]}
    />
  );
}

// ---------- the per-interaction animation instance ----------
interface FxViewProps {
  anim: Anim;
  cx: number;
  cy: number;
  w: number;
  h: number;
  grow: number;
  crossAt: number;
  flavor: ChargeFlavor;
  accent: string;
  reduced: boolean;
  renderPre: ReactNode;
  renderPost: ReactNode;
  onDone: (id: number) => void;
}

function ChargeFxView({ anim, cx, cy, w, h, grow, crossAt, flavor, accent, reduced, renderPre, renderPost, onDone }: FxViewProps) {
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
      holdP.value = 1;
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

  const gains = anim.dir === 'up';
  const g = reduced ? REDUCED_GROW : grow;
  // Double-tap feedback (#94 follow-up): a small particle-free JUMP — the user must see it landed.
  const isPop = anim.phase === 'pop';

  // Hope-spend dissipates instead of vanishing (#93): the expended diamond detaches, keeps
  // growing outward and fades like it's dispersing into the air, while the body settles as empty.
  const dissipatePre = flavor === 'hope' && !gains;

  // Shake belongs ONLY to the violent steps (#94): adding stress, removing armor (and removing
  // hit points, over in heart-track). Everything else charges calmly — the motes carry the energy.
  const shaky = (flavor === 'stress' && gains) || (flavor === 'armor' && !gains);

  const body = useAnimatedStyle(() => {
    const p = fxP.value;
    if (isPop) return { transform: [{ scale: 1 + 0.35 * Math.sin(Math.min(1, p) * Math.PI) }, { rotate: '0rad' }] };
    // Scale peaks at ~75% of the hold (#94: 1.5x slower growth than the #93 double-speed).
    const chargeFast = Math.min(1, holdP.value * 1.333);
    const shake = holdP.value;
    const kick = !reduced && p > 0 && p < 0.22 ? 0.55 * Math.sin((p / 0.22) * Math.PI) : 0;
    const elastic = !reduced && p >= 0.22 ? Math.cos((p - 0.22) * 16) * 0.16 * (1 - p) : 0;
    const wobble = reduced || !shaky ? 0 : Math.sin(shake * 46) * 0.07 * shake * Math.max(0, 1 - p * 5);
    return { transform: [{ scale: 1 + g * chargeFast * (1 - p) + kick + elastic }, { rotate: `${wobble}rad` }] };
  });
  const bodyCrossAt = isPop ? 0 : dissipatePre ? 0.05 : crossAt;
  const preFade = useAnimatedStyle(() => ({ opacity: fxP.value > bodyCrossAt ? 0 : 1 }));
  const postFade = useAnimatedStyle(() => ({ opacity: fxP.value > bodyCrossAt ? 1 : 0 }));
  const dissipate = useAnimatedStyle(() => {
    const p = fxP.value;
    return {
      transform: [{ scale: 1 + g * 0.85 + p * 1.1 }],
      opacity: p <= 0 ? 0 : Math.max(0, 1 - p * 1.2),
    };
  });
  const ring = useAnimatedStyle(() => ({
    transform: [{ rotate: '45deg' }, { scale: 0.2 + fxP.value * 4.4 }],
    opacity: fxP.value <= 0 ? 0 : Math.max(0, 0.9 - fxP.value),
  }));
  const ringColor = flavor === 'hope' ? Rune.goldBright : flavor === 'armor' ? Rune.goldEdge : accent;

  return (
    <View style={[box(cx, cy, 0, 0), { overflow: 'visible' }]} pointerEvents="none">
      <Animated.View style={[{ position: 'absolute', left: -w / 2, top: -h / 2, width: w, height: h }, body]}>
        <Animated.View style={[box(0, 0, w, h), preFade]}>{renderPre}</Animated.View>
        <Animated.View style={[box(0, 0, w, h), postFade]}>{renderPost}</Animated.View>
      </Animated.View>
      {dissipatePre && !isPop ? (
        <Animated.View style={[{ position: 'absolute', left: -w / 2, top: -h / 2, width: w, height: h }, dissipate]} pointerEvents="none">
          {renderPre}
        </Animated.View>
      ) : null}
      {!reduced && !isPop ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={[{ position: 'absolute', left: -22, top: -22, width: 44, height: 44, borderWidth: 1.5, borderColor: ringColor }, ring]}
          />
          {/* charge-phase motes (#94): the calm animations announce themselves with energy
              converging (gains) or seeping out (losses) instead of shaking */}
          {flavor === 'armor' && gains &&
            ARMOR_MOTES.map((m, i) => (
              <ChargeMoteView key={`c${i}`} m={m} inward cycles={2} slow={false} diamond={false} colors={[Rune.goldEdge, Rune.ivory, accent]} holdP={holdP} fxP={fxP} />
            ))}
          {flavor === 'stress' && !gains &&
            SOFT_MOTES.map((m, i) => (
              <ChargeMoteView key={`c${i}`} m={m} inward={false} cycles={1} slow diamond colors={[Rune.goldEdge, Rune.goldBright, accent]} holdP={holdP} fxP={fxP} />
            ))}
          {flavor === 'hope' &&
            (gains ? HOPE_MOTES : SOFT_MOTES).map((m, i) => (
              <ChargeMoteView key={`c${i}`} m={m} inward={gains} cycles={gains ? 1.5 : 1} slow={!gains} diamond colors={[Rune.goldBright, Rune.ivory, Rune.gold]} holdP={holdP} fxP={fxP} />
            ))}
          {flavor === 'stress' &&
            (gains
              ? BOLTS.map((b, i) => <BoltView key={i} b={b} accent={accent} fxP={fxP} />)
              : // clearing stress is SOOTHING (#93): smooth drifting motes, gold-warm, no jitter
                PLATES.map((pl, i) => <PlateView key={i} pl={pl} inward={false} fxP={fxP} tones={[Rune.goldEdge, accent, Rune.goldBright]} />)
              )}
          {flavor === 'hope' && (
            <>
              {(gains ? RAYS : RAYS.slice(0, 8)).map((r, i) => (
                <RayView key={i} r={r} gains={gains} fxP={fxP} />
              ))}
              {SPARKS.map((s, i) => (
                <SparkView key={`s${i}`} s={s} gains={gains} fxP={fxP} idx={i} />
              ))}
            </>
          )}
          {flavor === 'armor' && PLATES.map((pl, i) => <PlateView key={i} pl={pl} inward={gains} fxP={fxP} />)}
        </>
      ) : null}
    </View>
  );
}

// ---------- the track ----------
export interface ChargeTrackProps {
  left: number;
  top: number;
  /** Slot origins, track-local. */
  slots: { x: number; y: number }[];
  w: number;
  h: number;
  upIndex: number;
  downIndex: number;
  onUp: () => void;
  onDown: () => void;
  /** Base visual for slot i (current state — locked, filled, empty…). */
  renderSlot: (index: number) => ReactNode;
  /** Visuals for the animating slot's two phases. */
  renderFilled: () => ReactNode;
  renderEmpty: () => ReactNode;
  flavor: ChargeFlavor;
  accent: string;
  grow?: number;
  crossUpAt?: number;
  crossDownAt?: number;
  /** Extra outward hitSlop on the boundary slots (their "respective sides"). */
  sideSlop?: number;
  /** Zone mode (#89 E): two big halves own the gestures. The barrier sits midway between the
   *  down-slot and the up-slot, and each half acts on whichever boundary slot lives on ITS side —
   *  so a full top row (stress/armor at 6) splits left = add, right = remove, exactly like the
   *  hp-6 hearts rule (#94). */
  zone?: { left: number; top: number; width: number; height: number };
  trackLabel: string;
}

export interface ChargeTrackHandle {
  /** Burst-animate the slots that changed between two active counts (#192): a gain plays the 'up'
   *  fx on the newly-filled slots, a loss plays the 'down' fx on the emptied ones. Visual only —
   *  the caller is responsible for the actual state change. */
  burst: (prevActive: number, nextActive: number) => void;
}

export const ChargeTrack = forwardRef<ChargeTrackHandle, ChargeTrackProps>(function ChargeTrack({ left, top, slots, w, h, upIndex, downIndex, onUp, onDown, renderSlot, renderFilled, renderEmpty, flavor, accent, grow = 2.2, crossUpAt = 0.15, crossDownAt = 0.1, sideSlop = 12, zone, trackLabel }: ChargeTrackProps, ref) {
  const reduced = useReducedMotion();
  const [anims, setAnims] = useState<Anim[]>([]);
  const charging = useRef<Anim | null>(null);
  const lastDown = useRef({ key: '', t: 0 });
  const nextId = useRef(1);

  const onDone = useCallback((id: number) => setAnims((list) => list.filter((a) => a.id !== id)), []);

  // Audio (#255): a flavored riser sounds while a hold charges, fading out at the visual climax where
  // the gain/loss impact lands. Double-tap skips the riser; programmatic bursts (rest/cards) are silent.
  const riser = useRef<RiserHandle | null>(null);
  const riserTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRiser = useCallback((fadeMs?: number) => {
    if (riserTimer.current) { clearTimeout(riserTimer.current); riserTimer.current = null; }
    riser.current?.stop(fadeMs);
    riser.current = null;
  }, []);
  const riserId: SfxId = flavor === 'armor' ? 'riserArmor' : flavor === 'hope' ? 'riserHope' : 'riserStress';
  const impact = useCallback(
    (dir: Dir) => {
      if (dir === 'up') playSfx(flavor === 'armor' ? 'gainArmor' : flavor === 'hope' ? 'gainHope' : 'gainStress');
      else playSfx(flavor === 'armor' ? 'loseArmor' : flavor === 'hope' ? 'loseHope' : 'loseStress');
    },
    [flavor],
  );

  // Programmatic burst (#192): Rest + card unequip animate the slots they change, all at once.
  useImperativeHandle(
    ref,
    () => ({
      burst: (prevActive: number, nextActive: number) => {
        const n = slots.length;
        const add: Anim[] = [];
        const clamp = (i: number) => i >= 0 && i < n;
        if (nextActive > prevActive) {
          for (let i = prevActive; i < nextActive; i++) if (clamp(i)) add.push({ id: nextId.current++, index: i, dir: 'up', phase: 'fx' });
        } else {
          for (let i = nextActive; i < prevActive; i++) if (clamp(i)) add.push({ id: nextId.current++, index: i, dir: 'down', phase: 'fx' });
        }
        if (add.length) setAnims((list) => [...list, ...add]);
      },
    }),
    [slots.length],
  );

  const begin = useCallback(
    (index: number, dir: Dir, step: () => void) => {
      const now = Date.now();
      const key = `${index}:${dir}`;
      const isDouble = lastDown.current.key === key && now - lastDown.current.t < DOUBLE_MS;
      lastDown.current = { key, t: now };
      if (isDouble) {
        stopRiser(120); // a first-tap riser may be mid-charge — fade it out
        if (charging.current) {
          const id = charging.current.id;
          charging.current = null;
          setAnims((list) => list.filter((a) => a.id !== id));
        }
        step();
        impact(dir); // instant path: no riser, just the hit
        // feedback, not ceremony: a quick particle-free jump on the slot (#94 follow-up)
        setAnims((list) => [...list, { id: nextId.current++, index, dir, phase: 'pop' }]);
        return;
      }
      if (charging.current) return;
      const anim: Anim = { id: nextId.current++, index, dir, phase: 'hold' };
      charging.current = anim;
      setAnims((list) => [...list, anim]);
      // #258r2: start the riser only AFTER the tap/double-tap window so a quick tap never blips it
      riserTimer.current = setTimeout(() => {
        riserTimer.current = null;
        riser.current = playRiser(riserId, { volume: RISER_VOLUME[flavor] });
      }, RISER_START_DELAY_MS);
    },
    [stopRiser, impact, riserId, flavor],
  );

  const trigger = useCallback(
    (step: () => void) => {
      const c = charging.current;
      if (!c) return;
      charging.current = null;
      step();
      setAnims((list) => list.map((a) => (a.id === c.id ? { ...a, phase: 'fx' as Phase } : a)));
      // riser tapers to silence and the impact lands at the burst/fill — timing tunable in sfx-config (#258)
      const ms = STAT_SOUND_DELAY_MS[flavor][c.dir === 'up' ? 'gain' : 'lose'];
      stopRiser(Math.max(140, ms));
      setTimeout(() => impact(c.dir), ms);
    },
    [flavor, stopRiser, impact],
  );

  const cancel = useCallback(() => {
    const c = charging.current;
    if (!c) return;
    charging.current = null;
    stopRiser(160); // released early — fade the tension out, no impact
    setAnims((list) => list.map((a) => (a.id === c.id ? { ...a, phase: 'out' as Phase } : a)));
  }, [stopRiser]);

  const gestureFor = (index: number, dir: Dir) => {
    const step = dir === 'up' ? onUp : onDown;
    // Bind the callbacks HERE, in plain JS closures: a function passed as a runOnJS ARGUMENT
    // cannot cross the worklet boundary (it arrives as a bare object → "step is not a function"
    // at the climax, #92). runOnJS may only carry primitives.
    const beginJS = () => begin(index, dir, step);
    const triggerJS = () => trigger(step);
    return Gesture.LongPress()
      .minDuration(HOLD_MS)
      .maxDistance(32)
      .onBegin(() => runOnJS(beginJS)())
      .onStart(() => runOnJS(triggerJS)())
      .onFinalize((_e, ok) => {
        if (!ok) runOnJS(cancel)();
      });
  };

  return (
    // zIndex 10 — under the expand veil (20) and the carousel (30), per the #87 stacking contract.
    <View style={[box(left, top, Math.max(...slots.map((s) => s.x)) + w, Math.max(...slots.map((s) => s.y)) + h), { zIndex: 10, overflow: 'visible' }]}>
      {slots.map((s, i) => {
        const dir: Dir | null = i === upIndex ? 'up' : i === downIndex ? 'down' : null;
        // The animating copy owns the slot the whole time it exists (#276 item 6): hide the static pip
        // the moment an anim starts — INCLUDING the 'hold' charge — so transparent icons (hope/armor)
        // never show a static ghost behind the growing one. The anim mounts in the same commit at
        // scale 1, so there's no blank frame.
        const hidden = anims.some((a) => a.index === i);
        const bodyEl = (
          <View
            style={[box(s.x, s.y, w, h), { opacity: hidden ? 0 : 1 }]}
            accessible
            accessibilityLabel={`${trackLabel} ${i + 1}`}
            accessibilityHint={dir && !zone ? `Hold to ${dir === 'up' ? 'mark' : 'clear'} one. Double tap for no animation.` : undefined}>
            {renderSlot(i)}
          </View>
        );
        if (!dir || zone) return <View key={i}>{bodyEl}</View>;
        return (
          <GestureDetector key={i} gesture={gestureFor(i, dir)}>
            <View
              style={[box(s.x, s.y, w, h), { opacity: hidden ? 0 : 1 }]}
              hitSlop={{ top: 10, bottom: 10, left: dir === 'down' ? sideSlop : 4, right: dir === 'up' ? sideSlop : 4 }}
              accessible
              accessibilityLabel={`${trackLabel} ${i + 1}`}
              accessibilityHint={`Hold to ${dir === 'up' ? 'mark' : 'clear'} one. Double tap for no animation.`}>
              {renderSlot(i)}
            </View>
          </GestureDetector>
        );
      })}
      {zone
        ? (() => {
            const zl = zone.left;
            const zr = zone.left + zone.width;
            const zones: { from: number; to: number; index: number; dir: Dir }[] = [];
            if (upIndex >= 0 && downIndex >= 0) {
              const ux = slots[upIndex].x;
              const dx = slots[downIndex].x;
              const barrier = (Math.min(ux, dx) + w + Math.max(ux, dx)) / 2;
              const first = ux < dx ? { index: upIndex, dir: 'up' as Dir } : { index: downIndex, dir: 'down' as Dir };
              const second = ux < dx ? { index: downIndex, dir: 'down' as Dir } : { index: upIndex, dir: 'up' as Dir };
              zones.push({ from: zl, to: barrier, ...first }, { from: barrier, to: zr, ...second });
            } else if (upIndex >= 0) {
              zones.push({ from: zl, to: zr, index: upIndex, dir: 'up' });
            } else if (downIndex >= 0) {
              zones.push({ from: zl, to: zr, index: downIndex, dir: 'down' });
            }
            return zones.map((z) => (
              <GestureDetector key={`${z.index}-${z.dir}`} gesture={gestureFor(z.index, z.dir)}>
                <View
                  style={box(z.from, zone.top, z.to - z.from, zone.height)}
                  accessible
                  accessibilityLabel={`${z.dir === 'up' ? 'Add' : 'Remove'} ${trackLabel}`}
                  accessibilityHint={`Hold to ${z.dir === 'up' ? 'mark' : 'clear'} one. Double tap for no animation.`}
                />
              </GestureDetector>
            ));
          })()
        : null}
      {anims.map((a) => (
        <ChargeFxView
          key={a.id}
          anim={a}
          cx={slots[a.index].x + w / 2}
          cy={slots[a.index].y + h / 2}
          w={w}
          h={h}
          grow={grow}
          crossAt={a.dir === 'up' ? crossUpAt : crossDownAt}
          flavor={flavor}
          accent={accent}
          reduced={reduced}
          renderPre={a.dir === 'up' ? renderEmpty() : renderFilled()}
          renderPost={a.dir === 'up' ? renderFilled() : renderEmpty()}
          onDone={onDone}
        />
      ))}
    </View>
  );
});
