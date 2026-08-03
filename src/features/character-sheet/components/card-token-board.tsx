/**
 * The interactive token surface (#244, redesigned #293). Shown over a FULLSCREEN card (carousel or the
 * origin-card preview). Closed, it's one centred "open" button; open, it reveals three aligned top
 * panels — the card action (edit/delete, left), the draggable token sources (centre), and the die
 * source (right). There is no close button: the drawer closes when the card leaves fullscreen and this
 * board unmounts. Gestures on already-placed tokens: HOLD to send it off the card (a die ROLLS
 * instead), keep holding and SWIPE to throw it, TAP to eyedrop a token's colour (drawer open) or step
 * a die's number. Placed tokens can't be moved (#244 item 8).
 * Everything off the interactive bits is `box-none` so the card still closes by tapping the veil /
 * swiping.
 *
 * Coordinate model: the board fills its parent. `cardRect` is the focused card's rect in that same
 * parent space, and `scale` converts a gesture's screen-px translation into parent-px (the carousel
 * board lives inside the scaled DesignStage; the origin preview is screen-space, scale 1).
 */
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, runOnJS, type SharedValue, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Body, Rune } from '@/constants/theme';
import { useStageScale } from '@/components/design-stage';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { box } from '@/lib/design';
import { focusHaptic, tapHaptic } from '@/lib/haptics';
import { playSfx } from '@/lib/sfx';
import { useCarousel } from '../carousel-context';
import { DeleteCardConfirm } from '../sheet/edit-card-flow';
import { catalogIdOf } from '@/features/cards/card-effects';
import { isWildshapeId } from '@/data/wildshape-data';
import { CARD_H, CARD_W, FS_CENTER_Y, FS_FOCUS_SCALE, OX } from '../carousel-geometry';
import {
  DEFAULT_TOKEN_KINDS,
  DIE_BOX,
  DIE_MAX,
  DIE_TYPES,
  DieButton,
  DieNumber,
  type DieType,
  DualityDieFace,
  DualityNumber,
  dualityGeometry,
  hashStr,
  kindScale,
  nextDieType,
  nextDieValue,
  placedKindScale,
  type PlacedToken,
  randomTokenColor,
  TOKEN_COLORS,
  TOKEN_FRAC,
  TokenGlyph,
  type TokenKind,
  tokenFill,
} from './card-tokens';

/** A drawer source / placement descriptor (#293): the kind + (colour or die) it will place. */
type TokenDesc = { kind: TokenKind; color?: string; dieType?: DieType; dieValue?: number };

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Drawer layout (parent-px) — three aligned panels in the top band (#293): edit/delete (left),
// the token sources (centre), the die (right). All share the same top + height. The side panels
// (action + die) EXPAND horizontally to fill the row and carry a bigger, square glyph (#297).
const DRAWER_TOKEN = 40; // each centre source token
const GAP = 8;
const PAD = 8;
const PANEL_H = 60; // a touch taller so the action/die glyphs read bigger (#297)
const CENTER_W = PAD * 2 + 4 * DRAWER_TOKEN + 3 * GAP; // wood/bone/iron/colour
const SIDE = 6; // gap from the screen edge
const SIDE_GLYPH = 48; // the edit/delete icon + the die source — bigger than a centre token (#297)
const OPEN_W = 66; // the closed "open drawer" button
const OPEN_H = 42;
const DRAWER_TOP = 6;
/** The dice dropdown: four to a row, so eight dice are two tidy rows under the source (v0.34.4). */
const DIE_MENU_W = 4 * 46 + 3 * 4 + 12;

const newTokenId = () => `tk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** The little pop of sparks as a token lets go of the card. */
const SPARKS = Array.from({ length: 7 }, (_, i) => ({ ang: (i / 7) * Math.PI * 2 + (i % 2) * 0.5, dist: 22 + ((i * 13) % 20) }));

/** One spark of the build-up pop — driven by the LAST half of the grow, gone before the fall begins. */
function SparkBit({ ang, dist, center, grow }: { ang: number; dist: number; center: number; grow: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const p = Math.max(0, (grow.value - 0.5) / 0.5);
    const travel = p * dist;
    return {
      transform: [{ translateX: Math.cos(ang) * travel }, { translateY: Math.sin(ang) * travel }, { scale: 0.5 + p }],
      opacity: p <= 0 || p >= 1 ? 0 : Math.min(1, p * 2) * (1 - p),
    };
  });
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: center - 2, top: center - 2, width: 4, height: 4, borderRadius: 2, backgroundColor: Rune.goldBright }, style]} />;
}

/** Hold this long before a token acts: a die starts rolling, anything else starts leaving. Short
 *  enough to feel immediate, long enough that a swipe which merely begins on a token is still a swipe. */
const HOLD_MS = 340;
/** The roll: keeps growing, cross-fades the number, settles back to its resting size. */
const ROLL_MS = 620;
/** A token leaving the card, whether it falls or is thrown. v0.32.1: the throw used to cover sixteen
 *  token-widths in 620ms, which is about four frames of screen time. */
const LEAVE_MS = 1150;
/** How far the finger must travel to THROW. Deliberately not twitchy: the owner asked for intentional,
 *  and a throw destroys the token. */
const THROW_SLOP = 30;
/** Peak swell, as a fraction of the token's size, at the top of a hold or a roll. */
const SWELL = 0.26;
/** A roll turns the die exactly once (v0.33.0). More reads as a spinner; less does not read as a roll. */
const ROLL_TURNS = 1;
/**
 * How far behind the first duality die the second one rolls (owner, v0.34.4).
 *
 * The die the finger was ON goes first, because that is the one you pressed, and the other follows
 * this far behind. 50ms was too subtle to read as two dice (owner, v0.34.5): at 300ms you see the
 * second one go, which is the whole point of them being two dice and not one glyph.
 */
const DUALITY_LAG_MS = 300;

/**
 * A placed, interactive token.
 *
 *  - ANY token: HOLD and it swells, then leaves the card, falling under gravity. Keep holding and
 *    SWIPE and it is thrown that way instead. The swipe does not interrupt anything: it adds a
 *    direction to wherever the token already is, so holding and holding-then-swiping are one motion
 *    with two endings (v0.32.1).
 *  - a DIE: HOLD and it ROLLS in place instead of leaving, because a die you are holding is one you
 *    are about to roll. Only a swipe takes it off the card. TAP still steps its number by one, which
 *    is how you set a die to a result you rolled yourself.
 *
 * The whole leave animation lives HERE rather than in a separate falling layer, which is what makes
 * mid-flight steering possible at all: the gesture and the thing it steers are the same view. The
 * token comes off the card when the animation ENDS, not when it starts.
 */
const PlacedTokenView = memo(function PlacedTokenView({ token, size, left, top, drawerOpen, coordScale, onEyedrop, onCycleDie, onRoll, onRolled, onLeave, reduced }: { token: PlacedToken; size: number; left: number; top: number; drawerOpen: boolean; /** Design px per gesture px for e.x/e.y: the stage scale on web, 1 on a phone. */ coordScale: number; onEyedrop: (color: string) => void; onCycleDie: (t: PlacedToken, side?: 'hope' | 'fear') => void; onRoll: (t: PlacedToken) => { value: number; value2?: number }; /** v0.34.5: the roll LANDED; store the faces now that nothing is animating. */ onRolled: (t: PlacedToken, value: number, value2?: number) => void; /** Called once the token has finished leaving: take it off the card. */ onLeave: (t: PlacedToken) => void; reduced: boolean }) {
  const fill = tokenFill(token); // computed on JS — NEVER call tokenFill() inside a worklet (crashes)
  const isDie = token.kind === 'die';
  const dieType = token.dieType ?? 'd6';
  const isPair = dieType === 'duality';
  const shownValue = token.dieValue ?? DIE_MAX[dieType];
  const shownValue2 = token.dieValue2 ?? DIE_MAX.duality;

  /**
   * ONE swell value for the hold AND the roll (v0.32.1).
   *
   * They used to be two: the hold grew `press` to 1, then the roll switched the style over to a sine
   * of its own progress, which starts at 0. So the die snapped back to its resting size at the exact
   * moment the roll sound played, and then grew a second time. Worse, when the roll ended the style
   * fell back to `press`, still 1, so a die held past the end of its roll jumped to full size and
   * stayed there until release. One value, animated continuously, has neither problem.
   */
  const swell = useSharedValue(0);
  /**
   * Rotation, in TURNS, only ever added to (v0.33.0).
   *
   * Never assigned an absolute value and never reset, which is the whole trick: roll a die three
   * times and it spins on from wherever it stopped rather than snapping back to zero to start the
   * next one, and a throw mid-roll carries the angle it was at into the flight.
   */
  const turn = useSharedValue(0);
  const rollP = useSharedValue(0); // 0..1 through the roll (drives the number cross-fade)
  const phase = useSharedValue(0); // 0 = idle/holding, 1 = rolling, 2 = leaving
  const leave = useSharedValue(0); // 0..1 through the fall or throw
  const thrownAt = useSharedValue(2); // the `leave` value the swipe landed at; > 1 = never thrown
  const dirX = useSharedValue(0);
  const dirY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  /** Drives the spark pop as the token lets go. Its own value because `swell` is parked at 1 through
   *  a leave, and SparkBit reads a 0..1 sweep. */
  const pop = useSharedValue(0);
  const [rollTo, setRollTo] = useState<number | null>(null); // the face being rolled to
  /**
   * The duality pair's own animation (v0.34.4).
   *
   * Each die gets its own turn, its own swell, its own roll progress and its own shake, because the
   * owner asked for two dice that behave as one token and animate as two objects. Nothing here is
   * touched unless the token IS a pair, and shared values are cheap enough that branching on the
   * token type to declare them would only buy a hooks-order bug.
   */
  const turnH = useSharedValue(0);
  const turnF = useSharedValue(0);
  const swellH = useSharedValue(0);
  const swellF = useSharedValue(0);
  const rollH = useSharedValue(0);
  const rollF = useSharedValue(0);
  const shakeH = useSharedValue(0);
  const shakeF = useSharedValue(0);
  /** Which half the finger came down on: the one that rolls first. */
  const heldFear = useSharedValue(false);
  const [pairTo, setPairTo] = useState<{ value: number; value2: number } | null>(null);
  /**
   * The critical (owner, v0.34.5): both dice showing the same face.
   *
   * 0 at rest, 1 at the height of it. It drives an extra swell, a shake on BOTH dice and a white
   * wash over each face, and while it is running `phase` stays at 3 so a new hold cannot start a roll
   * underneath it. That guard is the whole reason it is a phase and not just an animation: without it
   * the finger that is still down from the roll would begin the next one over the top of the
   * flourish.
   */
  const crit = useSharedValue(0);

  const done = useCallback(() => onLeave(token), [onLeave, token]);
  /** Store a landed roll. Called from the animation's completion, so it never runs mid-motion. */
  const landed = useCallback((value: number) => onRolled(token, value), [onRolled, token]);
  const landedPair = useCallback((value: number, value2: number) => onRolled(token, value, value2), [onRolled, token]);

  // Per-token randomness, from its id, so the same token always tumbles the same way.
  const h = hashStr(token.id);
  const h2 = hashStr(`${token.id}~`);
  const driftX = (h - 0.5) * 2 * size * 1.2;
  const spin = (h2 - 0.5) * 2; // turns over one flight

  /**
   * Roll the PAIR (v0.34.4): both dice, the held one first, the other {@link DUALITY_LAG_MS} behind.
   *
   * Each die owns its swell, its turn and its number cross-fade, so nothing about this is shared
   * except the moment it starts. When both have settled the HIGHER one shakes: Fear jerks, in short
   * hard swings, and Hope sways, wider and slower. A tie shakes neither, because a tie has no winner.
   */
  const beginPairRoll = useCallback(() => {
    const res = onRoll(token);
    const hope = res.value;
    const fear = res.value2 ?? res.value;
    setPairTo({ value: hope, value2: fear });
    const fearFirst = heldFear.value;
    const lag = reduced ? 0 : DUALITY_LAG_MS;
    const spin = (turn: typeof turnH, swell: typeof swellH, roll: typeof rollH, delay: number, last: boolean) => {
      roll.value = 0;
      swell.value = withDelay(delay, withSequence(
        withTiming(1.35, { duration: reduced ? 60 : ROLL_MS * 0.34, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: reduced ? 100 : ROLL_MS * 0.66, easing: Easing.inOut(Easing.cubic) }),
      ));
      if (!reduced) turn.value = withDelay(delay, withTiming(turn.value + ROLL_TURNS, { duration: ROLL_MS, easing: Easing.out(Easing.cubic) }));
      roll.value = withDelay(delay, withTiming(1, { duration: reduced ? 160 : ROLL_MS, easing: Easing.inOut(Easing.cubic) }, (f) => {
        'worklet';
        // Only the die that lands LAST clears the phase, or the first one would end the roll early.
        // Phase 3 is the critical flourish, which owns the token until IT finishes; the faces are
        // stored either way, the moment the dice stop.
        if (!f || !last) return;
        runOnJS(landedPair)(hope, fear);
        if (phase.value === 1) { phase.value = 0; runOnJS(setPairTo)(null); }
      }));
    };
    spin(turnH, swellH, rollH, fearFirst ? lag : 0, fearFirst);
    spin(turnF, swellF, rollF, fearFirst ? 0 : lag, !fearFirst);
    const settled = ROLL_MS + lag;
    if (hope === fear) {
      // A critical. Both dice, together, and nothing may interrupt it.
      phase.value = 3;
      crit.value = withDelay(settled, withSequence(
        withTiming(1, { duration: reduced ? 80 : 260, easing: Easing.out(Easing.back(2)) }),
        withTiming(0.82, { duration: reduced ? 40 : 420, easing: Easing.inOut(Easing.sin) }),
        // NOT gated on `finished`: phase 3 makes the token inert on purpose, so the one thing that
        // clears it must run even if this animation is ever cut short. A stuck flourish would be a
        // die that can never be rolled or removed again.
        withTiming(0, { duration: reduced ? 80 : 320, easing: Easing.in(Easing.cubic) }, () => {
          'worklet';
          if (phase.value === 3) { phase.value = 0; runOnJS(setPairTo)(null); }
        }),
      ));
      if (reduced) return;
      const rattle = (dir: number) =>
        withDelay(settled, withSequence(
          withTiming(9 * dir, { duration: 90, easing: Easing.out(Easing.quad) }),
          withTiming(-7 * dir, { duration: 85, easing: Easing.inOut(Easing.sin) }),
          withTiming(5 * dir, { duration: 80, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 120, easing: Easing.out(Easing.sin) }),
        ));
      shakeH.value = rattle(1);
      shakeF.value = rattle(-1); // opposite ways, so they read as two dice and not one object
      return;
    }
    if (reduced) return;
    if (hope > fear) {
      // Hope sways: wide, soft, and it comes to rest rather than stopping.
      shakeH.value = withDelay(settled, withSequence(
        withTiming(7, { duration: 190, easing: Easing.inOut(Easing.sin) }),
        withTiming(-5, { duration: 220, easing: Easing.inOut(Easing.sin) }),
        withTiming(2.5, { duration: 200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 180, easing: Easing.out(Easing.sin) }),
      ));
    } else {
      // Fear jerks: short, hard, and it stops dead.
      shakeF.value = withDelay(settled, withSequence(
        withTiming(13, { duration: 60, easing: Easing.out(Easing.quad) }),
        withTiming(-11, { duration: 55, easing: Easing.out(Easing.quad) }),
        withTiming(8, { duration: 50, easing: Easing.out(Easing.quad) }),
        withTiming(-5, { duration: 45, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 40, easing: Easing.linear }),
      ));
    }
  }, [onRoll, token, heldFear, reduced, turnH, turnF, swellH, swellF, rollH, rollF, shakeH, shakeF, phase, crit, landedPair]);

  /** Grow on from wherever the hold got to, spin once, cross-fade the number, settle back. */
  const beginRoll = useCallback(() => {
    if (isPair) { beginPairRoll(); return; }
    const to = onRoll(token).value;
    setRollTo(to);
    rollP.value = 0;
    // Continuous: `swell` is already at 1 from the hold, so it carries on up and then comes back down.
    swell.value = withSequence(
      withTiming(1.35, { duration: reduced ? 60 : ROLL_MS * 0.34, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: reduced ? 100 : ROLL_MS * 0.66, easing: Easing.inOut(Easing.cubic) }),
    );
    // One turn, thrown fast and eased to a stop. `out(cubic)` is the snap: most of the rotation is
    // spent in the first third and the last few degrees crawl in, which is what a die settling does.
    if (!reduced) turn.value = withTiming(turn.value + ROLL_TURNS, { duration: ROLL_MS, easing: Easing.out(Easing.cubic) });
    rollP.value = withTiming(1, { duration: reduced ? 160 : ROLL_MS, easing: Easing.inOut(Easing.cubic) }, (f) => {
      'worklet';
      // Settled, and the finger may still be down. Back to idle at RESTING size, not at full swell.
      if (f && phase.value === 1) { phase.value = 0; runOnJS(landed)(to); runOnJS(setRollTo)(null); }
    });
  }, [onRoll, token, rollP, swell, turn, phase, reduced, isPair, beginPairRoll, landed]);

  /**
   * Start leaving the card. `dx`/`dy` (a swipe) throw it that way; without them it simply drops.
   *
   * `spinning` is how fast the token is already turning, in turns per millisecond, at this instant.
   * A die swiped away mid-roll keeps exactly the speed it had (owner, v0.33.0), so the throw looks
   * like the roll continuing off the card rather than a second, unrelated animation.
   */
  const beginLeave = useCallback((dx: number, dy: number, spinning = 0) => {
    phase.value = 2;
    const len = Math.hypot(dx, dy);
    dirX.value = len ? dx / len : 0;
    dirY.value = len ? dy / len : 0;
    thrownAt.value = len ? 0 : 2;
    pop.value = 0;
    pop.value = withTiming(1, { duration: reduced ? 120 : 420 });
    tapHaptic();
    playSfx('tokenRemove'); // #255
    const flight = reduced ? 200 : LEAVE_MS;
    // Carry the current spin at a CONSTANT rate: nothing is slowing it down once it is off the card.
    // A token that was not already spinning gets its own random tumble instead.
    if (!reduced) turn.value = withTiming(turn.value + (spinning > 0 ? spinning * flight : spin), { duration: flight, easing: Easing.linear });
    // Linear, so `leave` is proportional to TIME. The fall is f² (gravity) and the throw is f
    // (constant velocity) only if f is a clock; an eased f made both of them lie.
    leave.value = withTiming(1, { duration: flight, easing: Easing.linear }, (f) => {
      'worklet';
      if (f) runOnJS(done)();
    });
  }, [phase, dirX, dirY, thrownAt, leave, pop, turn, spin, reduced, done]);

  /** Steer a leave that is already running, from a swipe mid-flight. Adds direction to where the
   *  token IS rather than restarting it, which is what keeps hold and hold-then-swipe one motion. */
  const steer = useCallback((dx: number, dy: number) => {
    const len = Math.hypot(dx, dy) || 1;
    dirX.value = dx / len;
    dirY.value = dy / len;
    thrownAt.value = leave.value;
  }, [dirX, dirY, thrownAt, leave]);

  /**
   * MANUAL activation, which is the whole reason this is a Pan and not a LongPress.
   *
   * Until the hold completes the gesture stays un-activated, so a swipe that merely started on a
   * token still reaches the card behind and closes it. The moment it acts it activates and takes the
   * touch, which is what stops an accidental swipe-down from unfocusing the card mid-roll.
   */
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .manualActivation(true)
        .onTouchesDown((e) => {
          'worklet';
          if (phase.value === 2 || phase.value === 3) return; // leaving, or mid-critical
          startX.value = e.allTouches[0]?.absoluteX ?? 0;
          startY.value = e.allTouches[0]?.absoluteY ?? 0;
          // Which duality die is under the finger, so that one rolls first (owner). `x` is view-local
          // and arrives in CSS px on web, which is what `coordScale` divides out.
          heldFear.value = ((e.allTouches[0]?.x ?? 0) / coordScale) > size / 2;
          swell.value = withTiming(1, { duration: HOLD_MS }, (f) => {
            'worklet';
            if (!f || phase.value !== 0) return;
            if (isDie) { phase.value = 1; runOnJS(beginRoll)(); }
            else { phase.value = 2; runOnJS(beginLeave)(0, 0); }
          });
        })
        .onTouchesMove((e, state) => {
          'worklet';
          if (phase.value !== 0) { state.activate(); return; } // we own the finger now
          const t = e.allTouches[0];
          if (!t) return;
          // Moved before the hold completed: this is a swipe, not a hold. Fail, so the card behind
          // still gets it and swiping across a token closes the card exactly as it always did.
          if (Math.hypot(t.absoluteX - startX.value, t.absoluteY - startY.value) > 14) {
            cancelAnimation(swell);
            swell.value = withTiming(0, { duration: 160 });
            state.fail();
          }
        })
        .onUpdate((e) => {
          'worklet';
          if (Math.hypot(e.translationX, e.translationY) < THROW_SLOP) return;
          // A die is only ever removed by a throw; anything else is already leaving and gets steered.
          if (phase.value === 1) {
            /**
             * Claim the phase HERE, on the UI thread, not inside `beginLeave` (v0.33.0).
             *
             * `runOnJS` is a hop, and `onUpdate` runs every frame the finger moves, so the frames in
             * between all saw phase 1 and all queued another throw. The token only left once, but the
             * haptic and the removal sound fired for each of them, which is the stutter the owner
             * heard when swiping a die away. One assignment closes the window.
             */
            phase.value = 2;
            // The roll's angular speed right now: d/dp[1-(1-p)^3] = 3(1-p)^2, over ROLL_MS.
            const p = rollP.value;
            runOnJS(beginLeave)(e.translationX, e.translationY, (ROLL_TURNS * 3 * (1 - p) * (1 - p)) / ROLL_MS);
            // `leave.value > 0`: the fall is actually running. Without it, a swipe in the same frame
            // the hold completed would steer a leave that had not started, and the throw it set up
            // would be overwritten a moment later by the leave's own defaults.
          } else if (phase.value === 2 && thrownAt.value > 1 && leave.value > 0) {
            thrownAt.value = leave.value; // same reason: one steer, not one per frame
            runOnJS(steer)(e.translationX, e.translationY);
          }
        })
        .onFinalize(() => {
          'worklet';
          // A roll or a leave in flight keeps its animation; only an unfinished HOLD relaxes.
          if (phase.value !== 0) return;
          cancelAnimation(swell);
          swell.value = withTiming(0, { duration: 160 });
        }),
    [swell, phase, thrownAt, leave, rollP, startX, startY, isDie, beginRoll, beginLeave, steer, heldFear, coordScale, size],
  );

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(260)
        .onEnd((e) => {
          'worklet';
          if (phase.value === 2 || phase.value === 3) return;
          // #293: tapping a placed DIE cycles its number; a regular token eyedrops its colour (drawer open).
          // v0.34.4: on a pair, the half you tapped is the half that steps.
          // v0.34.5: a PAIR ignores taps entirely. Stepping one die of a pair by hand reads as the
          // pair having rolled again, which is the owner's "they keep rolling by just tapping them".
          // The pair is rolled by holding it, and by nothing else.
          if (isPair) return;
          if (isDie) runOnJS(onCycleDie)(token);
          else if (drawerOpen) runOnJS(onEyedrop)(fill);
        }),
    [drawerOpen, onEyedrop, fill, isDie, isPair, onCycleDie, token, phase],
  );
  const gesture = useMemo(() => Gesture.Race(pan, tap), [pan, tap]);

  /**
   * The flight (v0.33.0).
   *
   * Gravity is ALWAYS `f² · 7`, whether the token was thrown or not, and the swipe only ever ADDS a
   * constant-velocity term from the instant it happened. That is the fix for the owner's "harsh
   * redirect": the old version swapped the gravity constant from 7 to 1.8 the moment a throw
   * registered, so a token halfway down its fall jumped upward onto a different curve mid-flight. A
   * throw is momentum on top of the fall now, and the two terms never disagree about where the token
   * already is.
   */
  const style = useAnimatedStyle(() => {
    const f = leave.value;
    // The impulse counts only from the moment of the swipe, so a token steered late carries on from
    // where it already was instead of jumping onto a new path.
    const kick = Math.max(0, f - Math.min(thrownAt.value, 1));
    return {
      opacity: f < 0.66 ? 1 : Math.max(0, 1 - (f - 0.66) / 0.34),
      transform: [
        { translateX: driftX * f + dirX.value * kick * size * 7 },
        { translateY: f * f * size * 7 + dirY.value * kick * size * 7 },
        { scale: 1 + swell.value * SWELL - 0.3 * f },
        { rotate: `${turn.value * 360}deg` }, // RN transforms accept deg/rad only — NEVER 'turn' (crashes)
      ],
    };
  });
  // Old number out over the first half, new number in over the second. The swap point is the top of
  // the swell, so the value changes at the moment the die is biggest.
  const oldNum = useAnimatedStyle(() => ({ opacity: rollTo == null ? 1 : Math.max(0, 1 - rollP.value * 2.4) }));
  const newNum = useAnimatedStyle(() => ({ opacity: rollTo == null ? 0 : Math.max(0, (rollP.value - 0.5) * 2.4) }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ position: 'absolute', left, top, width: size, height: size }, style]}>
        {!reduced ? SPARKS.map((s, i) => <SparkBit key={i} ang={s.ang} dist={s.dist} center={size / 2} grow={pop} />) : null}
        {isPair ? (
          <DualityPair size={size} hope={shownValue} fear={shownValue2} rolled={pairTo} turnH={turnH} turnF={turnF} swellH={swellH} swellF={swellF} rollH={rollH} rollF={rollF} shakeH={shakeH} shakeF={shakeF} crit={crit} />
        ) : isDie && rollTo != null ? (
          <>
            <DieButton size={size} dieType={dieType} value={shownValue} hideNumber />
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, oldNum]}>
              <DieNumber size={size} dieType={dieType} value={shownValue} />
            </Animated.View>
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, newNum]}>
              <DieNumber size={size} dieType={dieType} value={rollTo} />
            </Animated.View>
          </>
        ) : (
          <TokenGlyph size={size} token={token} />
        )}
      </Animated.View>
    </GestureDetector>
  );
});

/**
 * The Hope and Fear pair, drawn and animated as two objects inside one token (v0.34.4).
 *
 * Each die rotates about ITS OWN centre, not the token's, which is the whole reason this is not one
 * glyph with one transform: two dice sharing a pivot orbit each other, and dice do not orbit. The
 * pivot is moved into place, the rotation and swell applied, and the pivot moved back, which is the
 * standard way to turn a child about an off-centre point in React Native.
 *
 * `shake` is added to the same rotation rather than being a transform of its own, so the winner's
 * flourish continues from exactly where its roll stopped.
 */
function DualityPair({ size, hope, fear, rolled, turnH, turnF, swellH, swellF, rollH, rollF, shakeH, shakeF, crit }: {
  size: number;
  hope: number;
  fear: number;
  /** The faces being rolled TO, or null when the pair is at rest. */
  rolled: { value: number; value2: number } | null;
  turnH: SharedValue<number>; turnF: SharedValue<number>;
  swellH: SharedValue<number>; swellF: SharedValue<number>;
  rollH: SharedValue<number>; rollF: SharedValue<number>;
  shakeH: SharedValue<number>; shakeF: SharedValue<number>;
  /** 0 at rest, 1 at the height of a critical: both dice grow and wash white. */
  crit: SharedValue<number>;
}) {
  const geo = dualityGeometry();
  /**
   * The pivots, resolved to PLAIN NUMBERS before any worklet sees them (v0.34.5).
   *
   * This was a `const off = (v) => …` called from inside `useAnimatedStyle`, and a worklet that
   * reaches an ordinary function is fatal on Android: placing a duality token closed the app the
   * instant it landed. It ran fine in a browser, where worklets execute on the JS thread anyway,
   * which is exactly how it got shipped. This is the THIRD time this fault has landed (v0.34.1
   * `clampCentre`, v0.34.2 `delta`), so the rule is worth stating plainly: a worklet may capture
   * numbers and shared values, and nothing else.
   */
  const hopeX = ((geo.hope.cx - DIE_BOX / 2) / DIE_BOX) * size;
  const hopeY = ((geo.hope.cy - DIE_BOX / 2) / DIE_BOX) * size;
  const fearX = ((geo.fear.cx - DIE_BOX / 2) / DIE_BOX) * size;
  const fearY = ((geo.fear.cy - DIE_BOX / 2) / DIE_BOX) * size;
  // Written out twice rather than through a helper: two `useAnimatedStyle` calls from a shared
  // closure is a hooks-rule violation waiting to be edited into a real one.
  const hopeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: hopeX },
      { translateY: hopeY },
      { rotate: `${turnH.value * 360 + shakeH.value}deg` },
      { scale: 1 + swellH.value * SWELL + crit.value * 0.22 },
      { translateX: -hopeX },
      { translateY: -hopeY },
    ],
  }));
  const fearStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: fearX },
      { translateY: fearY },
      { rotate: `${turnF.value * 360 + shakeF.value}deg` },
      { scale: 1 + swellF.value * SWELL + crit.value * 0.22 },
      { translateX: -fearX },
      { translateY: -fearY },
    ],
  }));
  const oldH = useAnimatedStyle(() => ({ opacity: rolled == null ? 1 : Math.max(0, 1 - rollH.value * 2.4) }));
  const newH = useAnimatedStyle(() => ({ opacity: rolled == null ? 0 : Math.max(0, (rollH.value - 0.5) * 2.4) }));
  const oldF = useAnimatedStyle(() => ({ opacity: rolled == null ? 1 : Math.max(0, 1 - rollF.value * 2.4) }));
  const newF = useAnimatedStyle(() => ({ opacity: rolled == null ? 0 : Math.max(0, (rollF.value - 0.5) * 2.4) }));
  /** The white wash. Drawn over each face rather than recolouring it, so nothing has to re-render. */
  const critStyle = useAnimatedStyle(() => ({ opacity: crit.value * 0.85 }));
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, hopeStyle]}>
        <DualityDieFace size={size} side="hope" />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, critStyle]}><DualityDieFace size={size} side="hope" white /></Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, oldH]}><DualityNumber size={size} side="hope" value={hope} /></Animated.View>
        {rolled ? <Animated.View style={[StyleSheet.absoluteFill, newH]}><DualityNumber size={size} side="hope" value={rolled.value} /></Animated.View> : null}
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, fearStyle]}>
        <DualityDieFace size={size} side="fear" />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, critStyle]}><DualityDieFace size={size} side="fear" white /></Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, oldF]}><DualityNumber size={size} side="fear" value={fear} /></Animated.View>
        {rolled ? <Animated.View style={[StyleSheet.absoluteFill, newF]}><DualityNumber size={size} side="fear" value={rolled.value2} /></Animated.View> : null}
      </Animated.View>
    </View>
  );
}

/**
 * A drawer source: DRAG it onto the card to place a copy; (colour button only) TAP to cycle colour.
 * `localX/localY` position it WITHIN the tray; `homeX/homeY` are its absolute board-space centre, used
 * to test the drop against the card rect.
 */
const DraggableSource = memo(function DraggableSource({ token, localX, localY, homeX, homeY, scale, base = DRAWER_TOKEN, onPlace, onCycle, onHold }: { token: TokenDesc; localX: number; localY: number; homeX: number; homeY: number; scale: number; base?: number; onPlace: (desc: TokenDesc, cx: number, cy: number) => void; onCycle?: () => void; /** v0.34.4: hold the die source to see every die at once and pick one. */ onHold?: () => void }) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const drag = useSharedValue(0);
  const size = base * kindScale(token.kind);
  const drop = useCallback((cx: number, cy: number) => onPlace(token, cx, cy), [onPlace, token]);
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(6)
        .onBegin(() => { 'worklet'; drag.value = 1; })
        .onUpdate((e) => { 'worklet'; tx.value = e.translationX / scale; ty.value = e.translationY / scale; })
        .onEnd(() => {
          'worklet';
          runOnJS(drop)(homeX + tx.value, homeY + ty.value);
          tx.value = withTiming(0, { duration: 200 });
          ty.value = withTiming(0, { duration: 200 });
          drag.value = 0;
        })
        .onFinalize(() => { 'worklet'; if (drag.value === 1) { tx.value = withTiming(0, { duration: 200 }); ty.value = withTiming(0, { duration: 200 }); drag.value = 0; } }),
    [tx, ty, drag, scale, drop, homeX, homeY],
  );
  const tap = useMemo(
    () => Gesture.Tap().maxDuration(260).onEnd(() => { 'worklet'; if (onCycle) runOnJS(onCycle)(); }),
    [onCycle],
  );
  /**
   * v0.34.4: the die source also answers a HOLD, which opens the list of every die.
   *
   * `Race(pan, Exclusive(hold, tap))` and not `Exclusive(pan, hold, tap)`: the tap has to wait for the
   * hold to fail, which it does the instant the finger lifts, so a quick tap still cycles with no
   * delay. Putting the pan in the same Exclusive would make the drag wait for both.
   */
  const hold = useMemo(
    () => Gesture.LongPress().minDuration(320).maxDistance(12).onStart(() => { 'worklet'; if (onHold) runOnJS(onHold)(); }),
    [onHold],
  );
  const gesture = useMemo(() => {
    if (onHold && onCycle) return Gesture.Race(pan, Gesture.Exclusive(hold, tap));
    return onCycle ? Gesture.Exclusive(pan, tap) : pan;
  }, [pan, tap, hold, onCycle, onHold]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: 1 + drag.value * 0.18 }],
    zIndex: drag.value > 0 ? 50 : 1,
  }));
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ position: 'absolute', left: localX - size / 2, top: localY - size / 2, width: size, height: size }, style]}>
        <TokenGlyph size={size} token={token} />
      </Animated.View>
    </GestureDetector>
  );
});

export interface TokenBoardProps {
  cardRect: Rect;
  width: number;
  height: number;
  tokens: PlacedToken[];
  drawerColor: string;
  scale: number;
  onPlace: (t: PlacedToken) => void;
  onRemove: (id: string) => void;
  /** Update a placed token in place (#293): used to cycle a die's value. */
  onUpdate?: (id: string, patch: Partial<PlacedToken>) => void;
  onSetDrawerColor: (color: string) => void;
  /** Top offset for the drawer (#248 item 7): screen-space hosts pass the safe-area inset so it clears
   *  the status bar / screen border, matching the in-stage board's inset. Defaults to 6. */
  drawerTop?: number;
  /** Card actions (#293) shown in the drawer's left panel when open: edit a custom card / delete a
   *  catalog card. `canAct` is false for beastform (no panel); `editable` picks the pencil vs the trash. */
  onEditCard?: () => void;
  onRequestDelete?: () => void;
  canAct?: boolean;
  editable?: boolean;
}

/** The reusable token surface — fills its parent; pass the focused card's `cardRect` in parent space. */
export function TokenBoard({ cardRect, width, tokens, drawerColor, scale, onPlace, onRemove, onUpdate, onSetDrawerColor, drawerTop = DRAWER_TOP, onEditCard, onRequestDelete, canAct = false, editable = false }: TokenBoardProps) {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [dieType, setDieType] = useState<DieType>('d20'); // the source die's current size (#293)
  /** v0.34.4: holding the die source drops down every die at once, so eight is not eight taps. */
  const [dieMenu, setDieMenu] = useState(false);
  const openP = useSharedValue(0);

  useEffect(() => {
    openP.value = withTiming(open ? 1 : 0, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [open, openP]);

  const cardBase = cardRect.width * TOKEN_FRAC; // base diameter; per-kind scale applied per token

  const place = useCallback(
    (desc: TokenDesc, cx: number, cy: number) => {
      // Only land if the drop is over the card (a little slop). Else it just springs back.
      const m = cardBase * 0.5;
      if (cx < cardRect.left - m || cx > cardRect.left + cardRect.width + m || cy < cardRect.top - m || cy > cardRect.top + cardRect.height + m) return;
      const x = Math.max(0, Math.min(1, (cx - cardRect.left) / cardRect.width));
      const y = Math.max(0, Math.min(1, (cy - cardRect.top) / cardRect.height));
      const tok: PlacedToken = { id: newTokenId(), kind: desc.kind, x, y };
      if (desc.kind === 'color') tok.color = drawerColor;
      // #297: a placed die starts at its LOWEST value (1), even though the source shows the maximum.
      if (desc.kind === 'die') { const dt = desc.dieType ?? dieType; tok.dieType = dt; tok.dieValue = 1; if (dt === 'duality') tok.dieValue2 = 1; }
      onPlace(tok);
      focusHaptic();
      playSfx('placeToken'); // #255
    },
    [cardRect, cardBase, drawerColor, dieType, onPlace],
  );

  /** A token has finished its leave animation. NOW it comes off the card (v0.32.1): removing it at
   *  the START meant the animation had to live in a separate layer, which is what made steering a
   *  throw mid-flight impossible. */
  const leaveDone = useCallback((t: PlacedToken) => onRemove(t.id), [onRemove]);
  /**
   * Roll a placed die (v0.32.0): pick the face, store it, and hand it back so the animation can
   * cross-fade to it. Stored immediately rather than at the end of the animation, so a die thrown
   * mid-roll still leaves the right number behind on any other copy of the card.
   */
  /**
   * Pick the faces a roll is heading for. It does NOT write them (v0.34.5).
   *
   * Writing here put a whole-character save and a sheet re-render into the MIDDLE of the roll, which
   * on the web is the freeze the owner described: the die stopped in mid-air about two thirds through
   * and then jumped to its final face with nothing in between. The value is committed by
   * `commitRoll` once the animation has landed, which is also the only moment anything else needs it.
   */
  const rollDie = useCallback((t: PlacedToken) => {
    const dt = t.dieType ?? 'd6';
    const to = 1 + Math.floor(Math.random() * DIE_MAX[dt]);
    const to2 = dt === 'duality' ? 1 + Math.floor(Math.random() * DIE_MAX.duality) : undefined;
    focusHaptic();
    playSfx('placeToken');
    return { value: to, value2: to2 };
  }, []);
  /** The roll has landed: store what it landed on. ONE write per roll, after the motion. */
  const commitRoll = useCallback(
    (t: PlacedToken, value: number, value2?: number) => {
      onUpdate?.(t.id, value2 == null ? { dieValue: value } : { dieValue: value, dieValue2: value2 });
    },
    [onUpdate],
  );
  const eyedrop = useCallback((color: string) => { onSetDrawerColor(color); tapHaptic(); playSfx('tokenCopyColor'); }, [onSetDrawerColor]);
  const cycleColor = useCallback(() => { onSetDrawerColor(randomTokenColor(drawerColor)); playSfx('tokenCopyColor'); }, [onSetDrawerColor, drawerColor]);
  // #293: tap the source die → next size; tap a placed die → next value.
  const cycleDieType = useCallback(() => { setDieType((d) => nextDieType(d)); playSfx('tokenCopyColor'); }, []);
  const openDieMenu = useCallback(() => { setDieMenu(true); focusHaptic(); playSfx('panelOpen'); }, []);
  const cycleDie = useCallback(
    (t: PlacedToken, side?: 'hope' | 'fear') => {
      if (!t.dieType || !onUpdate) return;
      if (side === 'fear') onUpdate(t.id, { dieValue2: nextDieValue('duality', t.dieValue2 ?? DIE_MAX.duality) });
      else onUpdate(t.id, { dieValue: nextDieValue(t.dieType, t.dieValue ?? DIE_MAX[t.dieType]) });
      tapHaptic();
      playSfx('numpadPress');
    },
    [onUpdate],
  );
  const shown = tokens;

  // Three aligned panels in the top band (#293/#297): action (left), token sources (centre), die
  // (right). The side panels EXPAND to fill the row width on each side of the fixed centre panel.
  const sideW = Math.max(SIDE_GLYPH + PAD * 2, (width - 2 * SIDE - CENTER_W - 2 * GAP) / 2);
  const leftX = SIDE;
  const rightX = width - SIDE - sideW;
  const centerX = (width - CENTER_W) / 2;
  const ly = PANEL_H / 2;
  const openStyle = useAnimatedStyle(() => ({ opacity: 1 - openP.value }));
  const panelStyle = useAnimatedStyle(() => ({ opacity: openP.value, transform: [{ translateY: (1 - openP.value) * -8 }] }));
  const panelBox = (x: number, w: number) => ({ position: 'absolute' as const, left: x, top: drawerTop, width: w, height: PANEL_H, backgroundColor: 'rgba(14,17,22,0.94)', borderRadius: 12, borderWidth: 1.4, borderColor: Rune.goldEdge });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* placed tokens (interactive) */}
      {shown.map((t) => {
        const size = cardBase * placedKindScale(t.kind);
        return (
          <PlacedTokenView
            key={t.id}
            token={t}
            size={size}
            left={cardRect.left + t.x * cardRect.width - size / 2}
            top={cardRect.top + t.y * cardRect.height - size / 2}
            drawerOpen={open}
            coordScale={Platform.OS === 'web' ? scale || 1 : 1}
            onEyedrop={eyedrop}
            onCycleDie={cycleDie}
            onRoll={rollDie}
            onRolled={commitRoll}
            onLeave={leaveDone}
            reduced={reduced}
          />
        );
      })}

      {/* CLOSED: one obvious "open drawer" button, centred at the top. No close — the drawer closes when
          you leave fullscreen (this whole board unmounts). */}
      {!open ? (
        <Animated.View style={[{ position: 'absolute', left: (width - OPEN_W) / 2, top: drawerTop, width: OPEN_W, height: OPEN_H }, openStyle]}>
          <Pressable onPress={() => { setOpen(true); playSfx('panelOpen'); }} accessibilityRole="button" accessibilityLabel="Open the token drawer" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: 'rgba(14,17,22,0.94)', borderRadius: 12, borderWidth: 1.6, borderColor: Rune.goldEdge }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: Rune.goldBright }} />
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: Rune.goldBright }} />
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: Rune.goldBright }} />
          </Pressable>
        </Animated.View>
      ) : null}

      {/* OPEN: three aligned panels (action · token sources · die). The container is box-none so taps
          outside the panels still reach the card / focus veil; each panel View absorbs its own taps. */}
      {open ? (
        <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, panelStyle]}>
          {/* LEFT: a SINGLE outlined panel IS the action button — no inner box, icon centred (#297). */}
          {canAct ? (
            <Pressable
              onPress={() => (editable ? onEditCard?.() : onRequestDelete?.())}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={editable ? 'Edit card' : 'Delete card'}
              style={[panelBox(leftX, sideW), { alignItems: 'center', justifyContent: 'center' }]}>
              <ActionIcon kind={editable ? 'edit' : 'delete'} size={Math.round(SIDE_GLYPH * 0.64)} />
            </Pressable>
          ) : null}
          <View style={panelBox(centerX, CENTER_W)}>
            {DEFAULT_TOKEN_KINDS.map((kind, i) => {
              const lx = PAD + i * (DRAWER_TOKEN + GAP) + DRAWER_TOKEN / 2;
              return <DraggableSource key={kind} token={{ kind }} localX={lx} localY={ly} homeX={centerX + lx} homeY={drawerTop + ly} scale={scale} onPlace={place} />;
            })}
            {(() => {
              const lx = PAD + 3 * (DRAWER_TOKEN + GAP) + DRAWER_TOKEN / 2;
              return <DraggableSource token={{ kind: 'color', color: drawerColor }} localX={lx} localY={ly} homeX={centerX + lx} homeY={drawerTop + ly} scale={scale} onPlace={place} onCycle={cycleColor} />;
            })()}
          </View>
          {/* RIGHT: the die source, a bigger glyph centred in the wide panel (#297). */}
          <View style={panelBox(rightX, sideW)}>
            {(() => {
              const lx = sideW / 2;
              return <DraggableSource token={{ kind: 'die', dieType, dieValue: DIE_MAX[dieType] }} localX={lx} localY={ly} homeX={rightX + lx} homeY={drawerTop + ly} scale={scale} base={SIDE_GLYPH} onPlace={place} onCycle={cycleDieType} onHold={openDieMenu} />;
            })()}
          </View>
          {/* The dropdown (v0.34.4): every die, tap one to arm the source with it. It hangs under the
              die panel and closes on any tap outside, so it never has to be dismissed on purpose. */}
          {dieMenu ? (
            <>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setDieMenu(false)} accessibilityRole="button" accessibilityLabel="Close the dice list" />
              <View style={{ position: 'absolute', left: Math.max(SIDE, rightX + sideW - DIE_MENU_W), top: drawerTop + PANEL_H + 6, width: DIE_MENU_W, backgroundColor: 'rgba(14,17,22,0.97)', borderRadius: 12, borderWidth: 1.4, borderColor: Rune.goldEdge, paddingVertical: 8, paddingHorizontal: 6, flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
                {DIE_TYPES.map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => { setDieType(t); setDieMenu(false); tapHaptic(); playSfx('cardSelect'); }}
                    accessibilityRole="button"
                    accessibilityLabel={t === 'duality' ? 'Hope and Fear dice' : t}
                    style={({ pressed }) => ({ width: 46, alignItems: 'center', paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: t === dieType ? Rune.goldBright : 'transparent', opacity: pressed ? 0.6 : 1 })}>
                    <TokenGlyph size={34} token={{ kind: 'die', dieType: t, dieValue: DIE_MAX[t], dieValue2: DIE_MAX.duality }} />
                    <Text style={{ color: t === dieType ? Rune.goldBright : Rune.goldText, fontSize: 8.5, fontFamily: Body.bold, letterSpacing: 0.3, marginTop: 2 }}>{t === 'duality' ? 'HOPE' : t.toUpperCase()}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

/** The fullscreen card action GLYPH (#264 item 5 / #297): pencil to edit a custom card, trash to
 *  delete a catalog card. Just the icon — the surrounding panel is the single outline, so there's no
 *  box-in-a-box. The parent Pressable owns the tap; this is centred inside it. */
function ActionIcon({ kind, size }: { kind: 'edit' | 'delete'; size: number }) {
  const color = kind === 'edit' ? Rune.goldText : '#E2705A';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" pointerEvents="none">
      {kind === 'edit' ? (
        <>
          <Path d="M4 20 L4.5 15.5 L15 5 L19 9 L8.5 19.5 Z" fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
          <Path d="M13 7 L17 11" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        </>
      ) : (
        <>
          <Path d="M5 7 H19" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
          <Path d="M9.5 7 V5.2 H14.5 V7" fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
          <Path d="M6.5 7 L7.4 19.5 H16.6 L17.5 7" fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
        </>
      )}
    </Svg>
  );
}

/**
 * The carousel's token board (#244): reads the focus state + the stage scale, computes the focused
 * card's design-space rect, and renders the surface inside DesignStage. Mounted only while a card is
 * focused (fades with `fullscreenProgress`); everything else (LOD tokens on the deck) is the baked
 * layer inside the slots.
 *
 * Also hosts the top-left fullscreen card action (#264 item 5): pencil (edit) for player-authored cards,
 * trash (delete) for catalog cards. It collapses fullscreen first, then asks the sheet to open the
 * editor / delete confirmation, so the carousel never desyncs while a card is edited/removed.
 */
export function CarouselTokenBoard({ onEditCard, onDeleteCard, editableIds }: { onEditCard?: (id: string) => void; onDeleteCard?: (id: string) => void; editableIds?: Set<string> } = {}) {
  const { fullscreenProgress, focusIndex, switching, decks, category, cardTokens, tokenColor, placeToken, removeToken, updateToken, setTokenColor, closeFullscreen } = useCarousel();
  const scale = useStageScale();
  const [st, setSt] = useState<{ active: boolean; idx: number }>({ active: false, idx: 0 });
  const lastActive = useSharedValue(0);
  const lastIdx = useSharedValue(-1);
  // Mount whenever a card is even slightly focused (so the board FADES in with fullscreenProgress
  // instead of popping at a 0.5 threshold) and stays mounted through the close fade. A switch unmounts
  // it. `machineState` isn't checked: it flips to 'expanded' the instant a close starts, which would
  // pop the board out before the card finishes shrinking.
  useDerivedValue(() => {
    const active = fullscreenProgress.value > 0.02 && switching.value !== 1 ? 1 : 0;
    const idx = Math.round(focusIndex.value);
    if (active !== lastActive.value || idx !== lastIdx.value) {
      lastActive.value = active;
      lastIdx.value = idx;
      runOnJS(setSt)({ active: active === 1, idx });
    }
  });
  // Settle-gate the board fade (#250): wait until the focused card has fully STOPPED moving before the
  // tokens appear. Arm a delayed fade once fullscreenProgress crosses ~1 (the spring has essentially
  // arrived); the 380ms delay lets any settle/overshoot finish. If progress drops (closing), cancel +
  // hide immediately. Better late than mid-flight (owner: "I don't care if late").
  const ready = useSharedValue(0);
  const arming = useSharedValue(0);
  useAnimatedReaction(
    () => fullscreenProgress.value,
    (v) => {
      if (v > 0.99 && arming.value === 0) {
        arming.value = 1;
        ready.value = withDelay(380, withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) }));
      } else if (v <= 0.99 && arming.value === 1) {
        arming.value = 0;
        cancelAnimation(ready);
        ready.value = 0;
      }
    },
  );
  const fade = useAnimatedStyle(() => ({ opacity: ready.value }));
  // #276 item 4: deleting a catalog card from fullscreen must NOT exit fullscreen until it's actually
  // deleted — the confirm lives here (inside the carousel) so it can collapse only on confirm.
  const [confirmDelete, setConfirmDelete] = useState(false);

  const deck = decks[category];
  const card = st.active ? deck[Math.min(deck.length - 1, Math.max(0, st.idx))] : null;
  const id = card?.id ?? null;
  // v0.9.8: tokens are keyed by the card's REF so every copy (incl. favorites) shares one board. The
  // first instance has ref === id, so single cards are unchanged.
  const tokenKey = card?.ref ?? id;

  const cardRect = useMemo<Rect>(() => {
    const w = CARD_W * FS_FOCUS_SCALE;
    const h = CARD_H * FS_FOCUS_SCALE;
    return { left: OX - w / 2, top: FS_CENTER_Y - h / 2, width: w, height: h };
  }, []);

  const onPlace = useCallback((t: PlacedToken) => { if (tokenKey) placeToken(tokenKey, t); }, [tokenKey, placeToken]);
  const onRemove = useCallback((tid: string) => { if (tokenKey) removeToken(tokenKey, tid); }, [tokenKey, removeToken]);
  const onUpdate = useCallback((tid: string, patch: Partial<PlacedToken>) => { if (tokenKey) updateToken(tokenKey, tid, patch); }, [tokenKey, updateToken]);

  if (!id) return null;
  // Beastform cards can't be edited or deleted (#279) — no fullscreen action shown in the drawer.
  const editable = editableIds?.has(id) ?? false;
  const canAct = Boolean(editable ? onEditCard : onDeleteCard) && !isWildshapeId(catalogIdOf(id));
  return (
    <Animated.View pointerEvents="box-none" style={[box(0, 0, 412, 892), { zIndex: 3600 }, fade]}>
      <TokenBoard
        cardRect={cardRect}
        width={412}
        height={892}
        tokens={cardTokens[tokenKey ?? id] ?? cardTokens[id] ?? []}
        drawerColor={tokenColor || TOKEN_COLORS[0]}
        scale={scale}
        onPlace={onPlace}
        onRemove={onRemove}
        onUpdate={onUpdate}
        onSetDrawerColor={setTokenColor}
        canAct={canAct}
        editable={editable}
        onEditCard={onEditCard ? () => onEditCard(id) : undefined}
        onRequestDelete={() => setConfirmDelete(true)}
      />
      {confirmDelete ? (
        <DeleteCardConfirm
          onConfirm={() => {
            setConfirmDelete(false);
            closeFullscreen();
            onDeleteCard?.(id);
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
    </Animated.View>
  );
}
