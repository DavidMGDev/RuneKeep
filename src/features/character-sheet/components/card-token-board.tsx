/**
 * The interactive token surface (#244, redesigned #293). Shown over a FULLSCREEN card (carousel or the
 * origin-card preview). Closed, it's one centred "open" button; open, it reveals three aligned top
 * panels — the card action (edit/delete, left), the draggable token sources (centre), and the die
 * source (right). There is no close button: the drawer closes when the card leaves fullscreen and this
 * board unmounts. Gestures on already-placed tokens: HOLD to drop with a gravity fall; TAP to eyedrop a
 * token's colour (drawer open) or cycle a die's number. Placed tokens can't be moved (#244 item 8).
 * Everything off the interactive bits is `box-none` so the card still closes by tapping the veil /
 * swiping.
 *
 * Coordinate model: the board fills its parent. `cardRect` is the focused card's rect in that same
 * parent space, and `scale` converts a gesture's screen-px translation into parent-px (the carousel
 * board lives inside the scaled DesignStage; the origin preview is screen-space, scale 1).
 */
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, runOnJS, type SharedValue, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Rune } from '@/constants/theme';
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
  DIE_MAX,
  DieButton,
  DieNumber,
  type DieType,
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

const newTokenId = () => `tk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** A token mid-fall: the build-up grow + a tiny spark pop, then it drops off the card under gravity. */
const SPARKS = Array.from({ length: 7 }, (_, i) => ({ ang: (i / 7) * Math.PI * 2 + (i % 2) * 0.5, dist: 22 + ((i * 13) % 20) }));

const FallingToken = memo(function FallingToken({ token, size, left, top, dir, reduced, onDone }: { token: PlacedToken; size: number; left: number; top: number; /** v0.32.0: a thrown die's swipe vector. Absent = the original drop, straight down under gravity. */ dir?: { x: number; y: number }; reduced: boolean; onDone: (id: string) => void }) {
  const grow = useSharedValue(0);
  const fall = useSharedValue(0);
  const done = useCallback(() => onDone(token.id), [onDone, token.id]);
  const h = hashStr(token.id);
  const h2 = hashStr(`${token.id}~`);
  const driftX = (h - 0.5) * 2 * size * 1.7;
  const spin = (h2 - 0.5) * 2; // turns
  // A THROW keeps the swipe's direction and travels far enough to clear any screen, with a little
  // gravity sag on the way so it arcs rather than sliding. Same easing and fade as the drop, because
  // the owner liked how that one felt and this is the same object leaving by a different door.
  const throwLen = dir ? Math.hypot(dir.x, dir.y) || 1 : 1;
  const throwX = dir ? (dir.x / throwLen) * size * 16 : 0;
  const throwY = dir ? (dir.y / throwLen) * size * 16 : 0;

  useEffect(() => {
    // A thrown die is already big and already spinning in the player's hand — no build-up.
    if (dir) {
      grow.value = 1;
      fall.value = withTiming(1, { duration: reduced ? 160 : 620, easing: Easing.out(Easing.quad) }, (ff) => { if (ff) runOnJS(done)(); });
      return;
    }
    grow.value = withTiming(1, { duration: reduced ? 110 : 440, easing: Easing.out(Easing.cubic) }, (f) => {
      if (f) fall.value = withTiming(1, { duration: reduced ? 150 : 760, easing: Easing.in(Easing.quad) }, (ff) => { if (ff) runOnJS(done)(); });
    });
  }, [grow, fall, reduced, done, dir]);

  const style = useAnimatedStyle(() => {
    const g = grow.value;
    const f = fall.value;
    const fadeOut = f < 0.72 ? 1 : Math.max(0, 1 - (f - 0.72) / 0.28);
    return {
      opacity: fadeOut,
      transform: [
        { translateX: dir ? throwX * f : driftX * f },
        { translateY: dir ? throwY * f + f * f * (size * 2.2) : f * f * (size * 9) }, // gravity accel — well past the card edge
        { scale: 1 + (reduced ? 0.18 : 0.55) * g - 0.25 * f },
        { rotate: `${spin * f * 360}deg` }, // RN transforms accept deg/rad only — NEVER 'turn' (crashes)
      ],
    };
  });

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left, top, width: size, height: size }}>
      {!reduced && !dir ? SPARKS.map((s, i) => <SparkBit key={i} ang={s.ang} dist={s.dist} center={size / 2} grow={grow} />) : null}
      <Animated.View style={[StyleSheet.absoluteFill, style]}>
        <TokenGlyph size={size} token={token} />
      </Animated.View>
    </View>
  );
});

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

/** Hold this long on a die before it starts rolling. Short enough to feel immediate, long enough that
 *  a swipe across the card that happens to begin on a die is still a swipe. */
const ROLL_HOLD_MS = 340;
/** The roll itself: grow, cross-fade the number, settle back. */
const ROLL_MS = 560;
/** How far the finger must travel DURING a roll to throw the die. Deliberately not twitchy: the owner
 *  asked for intentional, and an accidental throw destroys the token. */
const THROW_SLOP = 30;

/**
 * A placed, interactive token.
 *
 *  - a plain token: HOLD → drop it off the card; TAP (drawer open) → eyedrop its colour.
 *  - a DIE (v0.32.0): HOLD → ROLL it in place; keep holding and SWIPE → throw it off the screen.
 *    TAP still steps its number by one, which is the way to set a die to a result you rolled yourself.
 *
 * The die's hold used to delete it, which was the wrong verb for the object: a die you are holding is
 * one you are about to roll. Deleting it is now the throw, where the gesture says so.
 */
const PlacedTokenView = memo(function PlacedTokenView({ token, size, left, top, drawerOpen, onBeginDrop, onEyedrop, onCycleDie, onRoll, onThrow, reduced }: { token: PlacedToken; size: number; left: number; top: number; drawerOpen: boolean; onBeginDrop: (t: PlacedToken) => void; onEyedrop: (color: string) => void; onCycleDie: (t: PlacedToken) => void; onRoll: (t: PlacedToken) => number; onThrow: (t: PlacedToken, dx: number, dy: number) => void; reduced: boolean }) {
  const press = useSharedValue(0);
  const fill = tokenFill(token); // computed on JS — NEVER call tokenFill() inside a worklet (crashes)
  const isDie = token.kind === 'die';
  const dieType = token.dieType ?? 'd6';
  const shownValue = token.dieValue ?? DIE_MAX[dieType];

  // --- the roll (dice only) -------------------------------------------------
  const arm = useSharedValue(0); // 0..1 hold progress; reaching 1 starts the roll
  const rolling = useSharedValue(0); // 1 while the roll animation owns this token
  const rollP = useSharedValue(0); // 0..1 through the roll
  const thrown = useSharedValue(0); // 1 once a throw has been fired, so it only fires once
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const [rollTo, setRollTo] = useState<number | null>(null); // the face being rolled to
  const beginRoll = useCallback(() => {
    setRollTo(onRoll(token));
    rollP.value = 0;
    rollP.value = withTiming(1, { duration: reduced ? 160 : ROLL_MS, easing: Easing.inOut(Easing.cubic) }, (f) => {
      'worklet';
      if (f && thrown.value === 0) { rolling.value = 0; runOnJS(setRollTo)(null); }
    });
  }, [onRoll, token, rollP, rolling, thrown, reduced]);
  const fireThrow = useCallback((dx: number, dy: number) => onThrow(token, dx, dy), [onThrow, token]);

  /**
   * MANUAL activation, which is the whole reason this is a Pan and not a LongPress.
   *
   * Until the hold completes the gesture stays un-activated, so a swipe that merely started on a die
   * still reaches the card behind and closes it, exactly as before. The moment the roll begins it
   * activates and takes the touch, which is what stops an accidental swipe-down from unfocusing the
   * card while the die is still under the finger.
   */
  const diePan = useMemo(
    () =>
      Gesture.Pan()
        .manualActivation(true)
        .onTouchesDown((e) => {
          'worklet';
          arm.value = 0;
          thrown.value = 0;
          startX.value = e.allTouches[0]?.absoluteX ?? 0;
          startY.value = e.allTouches[0]?.absoluteY ?? 0;
          press.value = withTiming(1, { duration: ROLL_HOLD_MS });
          arm.value = withTiming(1, { duration: ROLL_HOLD_MS }, (f) => {
            'worklet';
            if (!f) return;
            rolling.value = 1;
            runOnJS(beginRoll)();
          });
        })
        .onTouchesMove((e, state) => {
          'worklet';
          if (rolling.value === 1) { state.activate(); return; } // the roll owns the finger now
          const t = e.allTouches[0];
          if (!t) return;
          // Moved before the hold completed: this is a swipe, not a roll. Fail, so the card behind
          // still gets it and swiping across a die closes the card exactly as it always did.
          if (Math.hypot(t.absoluteX - startX.value, t.absoluteY - startY.value) > 14) {
            cancelAnimation(arm);
            arm.value = 0;
            state.fail();
          }
        })
        .onUpdate((e) => {
          'worklet';
          if (rolling.value !== 1 || thrown.value === 1) return;
          if (Math.hypot(e.translationX, e.translationY) < THROW_SLOP) return;
          thrown.value = 1;
          runOnJS(fireThrow)(e.translationX, e.translationY);
        })
        .onFinalize(() => {
          'worklet';
          cancelAnimation(arm);
          arm.value = 0;
          press.value = withTiming(0, { duration: 160 });
        }),
    [arm, press, rolling, thrown, startX, startY, beginRoll, fireThrow],
  );

  const hold = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(420)
        .maxDistance(16)
        .onBegin(() => {
          'worklet';
          press.value = withTiming(1, { duration: 300 });
        })
        .onStart(() => {
          'worklet';
          runOnJS(onBeginDrop)(token);
        })
        .onFinalize(() => {
          'worklet';
          press.value = withTiming(0, { duration: 160 });
        }),
    [press, onBeginDrop, token],
  );
  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(260)
        .onEnd(() => {
          'worklet';
          // #293: tapping a placed DIE cycles its number; a regular token eyedrops its colour (drawer open).
          if (isDie) runOnJS(onCycleDie)(token);
          else if (drawerOpen) runOnJS(onEyedrop)(fill);
        }),
    [drawerOpen, onEyedrop, fill, isDie, onCycleDie, token],
  );
  const gesture = useMemo(() => (isDie ? Gesture.Race(diePan, tap) : Gesture.Race(hold, tap)), [isDie, diePan, hold, tap]);

  // The die swells as it is held and through the first half of the roll, then settles back — the
  // same build-up language as a token about to drop, ending in a landing rather than a fall.
  const style = useAnimatedStyle(() => {
    const swell = rolling.value === 1 ? Math.sin(rollP.value * Math.PI) : press.value;
    return { transform: [{ scale: 1 + swell * 0.26 }] };
  });
  // Old number out over the first half, new number in over the second. The swap point is the top of
  // the swell, so the value changes at the moment the die is biggest.
  const oldNum = useAnimatedStyle(() => ({ opacity: rollTo == null ? 1 : Math.max(0, 1 - rollP.value * 2.4) }));
  const newNum = useAnimatedStyle(() => ({ opacity: rollTo == null ? 0 : Math.max(0, (rollP.value - 0.5) * 2.4) }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ position: 'absolute', left, top, width: size, height: size }, style]}>
        {isDie && rollTo != null ? (
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
 * A drawer source: DRAG it onto the card to place a copy; (colour button only) TAP to cycle colour.
 * `localX/localY` position it WITHIN the tray; `homeX/homeY` are its absolute board-space centre, used
 * to test the drop against the card rect.
 */
const DraggableSource = memo(function DraggableSource({ token, localX, localY, homeX, homeY, scale, base = DRAWER_TOKEN, onPlace, onCycle }: { token: TokenDesc; localX: number; localY: number; homeX: number; homeY: number; scale: number; base?: number; onPlace: (desc: TokenDesc, cx: number, cy: number) => void; onCycle?: () => void }) {
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
  const gesture = useMemo(() => (onCycle ? Gesture.Exclusive(pan, tap) : pan), [pan, tap, onCycle]);
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
  const openP = useSharedValue(0);
  // `dir` (v0.32.0) is a thrown die's swipe vector; without one the token just drops under gravity.
  const [falling, setFalling] = useState<{ token: PlacedToken; left: number; top: number; dir?: { x: number; y: number } }[]>([]);

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
      if (desc.kind === 'die') { const dt = desc.dieType ?? dieType; tok.dieType = dt; tok.dieValue = 1; }
      onPlace(tok);
      focusHaptic();
      playSfx('placeToken'); // #255
    },
    [cardRect, cardBase, drawerColor, dieType, onPlace],
  );

  const beginDrop = useCallback(
    (t: PlacedToken) => {
      const size = cardBase * placedKindScale(t.kind);
      const left = cardRect.left + t.x * cardRect.width - size / 2;
      const top = cardRect.top + t.y * cardRect.height - size / 2;
      setFalling((list) => [...list, { token: t, left, top }]);
      onRemove(t.id);
      tapHaptic();
      playSfx('tokenRemove'); // #255
    },
    [cardRect, cardBase, onRemove],
  );
  const fallingDone = useCallback((id: string) => setFalling((list) => list.filter((f) => f.token.id !== id)), []);
  /**
   * Roll a placed die (v0.32.0): pick the face, store it, and hand it back so the animation can
   * cross-fade to it. Stored immediately rather than at the end of the animation, so a die thrown
   * mid-roll still leaves the right number behind on any other copy of the card.
   */
  const rollDie = useCallback(
    (t: PlacedToken) => {
      const dt = t.dieType ?? 'd6';
      const to = 1 + Math.floor(Math.random() * DIE_MAX[dt]);
      onUpdate?.(t.id, { dieValue: to });
      focusHaptic();
      playSfx('placeToken');
      return to;
    },
    [onUpdate],
  );
  /** Throw a rolling die off the screen in the direction of the swipe, and take it off the card. */
  const throwDie = useCallback(
    (t: PlacedToken, dx: number, dy: number) => {
      const size = cardBase * placedKindScale(t.kind);
      const left = cardRect.left + t.x * cardRect.width - size / 2;
      const top = cardRect.top + t.y * cardRect.height - size / 2;
      setFalling((list) => [...list, { token: t, left, top, dir: { x: dx, y: dy } }]);
      onRemove(t.id);
      tapHaptic();
      playSfx('tokenRemove');
    },
    [cardRect, cardBase, onRemove],
  );
  const eyedrop = useCallback((color: string) => { onSetDrawerColor(color); tapHaptic(); playSfx('tokenCopyColor'); }, [onSetDrawerColor]);
  const cycleColor = useCallback(() => { onSetDrawerColor(randomTokenColor(drawerColor)); playSfx('tokenCopyColor'); }, [onSetDrawerColor, drawerColor]);
  // #293: tap the source die → next size; tap a placed die → next value.
  const cycleDieType = useCallback(() => { setDieType((d) => nextDieType(d)); playSfx('tokenCopyColor'); }, []);
  const cycleDie = useCallback(
    (t: PlacedToken) => {
      if (!t.dieType || !onUpdate) return;
      onUpdate(t.id, { dieValue: nextDieValue(t.dieType, t.dieValue ?? DIE_MAX[t.dieType]) });
      tapHaptic();
      playSfx('numpadPress');
    },
    [onUpdate],
  );

  const fallingIds = useMemo(() => new Set(falling.map((f) => f.token.id)), [falling]);
  const shown = tokens.filter((t) => !fallingIds.has(t.id));

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
            onBeginDrop={beginDrop}
            onEyedrop={eyedrop}
            onCycleDie={cycleDie}
            onRoll={rollDie}
            onThrow={throwDie}
            reduced={reduced}
          />
        );
      })}
      {/* tokens dropping off the card, and dice thrown off it */}
      {falling.map((f) => (
        <FallingToken key={f.token.id} token={f.token} size={cardBase * placedKindScale(f.token.kind)} left={f.left} top={f.top} dir={f.dir} reduced={reduced} onDone={fallingDone} />
      ))}

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
              return <DraggableSource token={{ kind: 'die', dieType, dieValue: DIE_MAX[dieType] }} localX={lx} localY={ly} homeX={rightX + lx} homeY={drawerTop + ly} scale={scale} base={SIDE_GLYPH} onPlace={place} onCycle={cycleDieType} />;
            })()}
          </View>
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
