/**
 * The interactive token surface (#244). Shown over a FULLSCREEN card (carousel or the origin-card
 * preview). It owns the drawer (a tab you tap to open + drag to reposition), the draggable source
 * tokens, and the gestures on already-placed tokens (HOLD to drop with a gravity fall; TAP with the
 * drawer open to eyedrop its colour into the custom-colour button). Placed tokens themselves can't be
 * moved (#244 item 8). Everything off the interactive bits is `box-none` so the card still closes by
 * tapping the veil / swiping.
 *
 * Coordinate model: the board fills its parent. `cardRect` is the focused card's rect in that same
 * parent space, and `scale` converts a gesture's screen-px translation into parent-px (the carousel
 * board lives inside the scaled DesignStage; the origin preview is screen-space, scale 1).
 */
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, runOnJS, type SharedValue, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { Rune } from '@/constants/theme';
import { useStageScale } from '@/components/design-stage';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { box } from '@/lib/design';
import { focusHaptic, tapHaptic } from '@/lib/haptics';
import { useCarousel } from '../carousel-context';
import { CARD_H, CARD_W, FS_CENTER_Y, FS_FOCUS_SCALE, OX } from '../carousel-geometry';
import {
  DEFAULT_TOKEN_KINDS,
  hashStr,
  kindScale,
  type PlacedToken,
  randomTokenColor,
  TOKEN_COLORS,
  TOKEN_FRAC,
  TokenButton,
  type TokenKind,
  tokenFill,
} from './card-tokens';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Drawer layout (parent-px). Four sources: three default buttons + the custom-colour button.
const DRAWER_TOKEN = 44;
const GAP = 12;
const PAD = 12;
const SOURCES = 4;
const TRAY_W = PAD * 2 + SOURCES * DRAWER_TOKEN + (SOURCES - 1) * GAP;
const TRAY_H = PAD * 2 + DRAWER_TOKEN;
const TAB_W = 70;
const TAB_H = 22;
const DRAWER_TOP = 6;

const newTokenId = () => `tk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** A token mid-fall: the build-up grow + a tiny spark pop, then it drops off the card under gravity. */
const SPARKS = Array.from({ length: 7 }, (_, i) => ({ ang: (i / 7) * Math.PI * 2 + (i % 2) * 0.5, dist: 22 + ((i * 13) % 20) }));

const FallingToken = memo(function FallingToken({ token, size, left, top, reduced, onDone }: { token: PlacedToken; size: number; left: number; top: number; reduced: boolean; onDone: (id: string) => void }) {
  const grow = useSharedValue(0);
  const fall = useSharedValue(0);
  const done = useCallback(() => onDone(token.id), [onDone, token.id]);
  const h = hashStr(token.id);
  const h2 = hashStr(`${token.id}~`);
  const driftX = (h - 0.5) * 2 * size * 1.7;
  const spin = (h2 - 0.5) * 2; // turns

  useEffect(() => {
    grow.value = withTiming(1, { duration: reduced ? 110 : 440, easing: Easing.out(Easing.cubic) }, (f) => {
      if (f) fall.value = withTiming(1, { duration: reduced ? 150 : 760, easing: Easing.in(Easing.quad) }, (ff) => { if (ff) runOnJS(done)(); });
    });
  }, [grow, fall, reduced, done]);

  const style = useAnimatedStyle(() => {
    const g = grow.value;
    const f = fall.value;
    const fadeOut = f < 0.72 ? 1 : Math.max(0, 1 - (f - 0.72) / 0.28);
    return {
      opacity: fadeOut,
      transform: [
        { translateX: driftX * f },
        { translateY: f * f * (size * 9) }, // gravity accel — well past the card edge
        { scale: 1 + (reduced ? 0.18 : 0.55) * g - 0.25 * f },
        { rotate: `${spin * f * 360}deg` }, // RN transforms accept deg/rad only — NEVER 'turn' (crashes)
      ],
    };
  });

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left, top, width: size, height: size }}>
      {!reduced ? SPARKS.map((s, i) => <SparkBit key={i} ang={s.ang} dist={s.dist} center={size / 2} grow={grow} />) : null}
      <Animated.View style={[StyleSheet.absoluteFill, style]}>
        <TokenButton size={size} fill={tokenFill(token)} />
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

/** A placed, interactive token: HOLD → drop (off the card), TAP (drawer open) → eyedrop its colour. */
const PlacedTokenView = memo(function PlacedTokenView({ token, size, left, top, drawerOpen, onBeginDrop, onEyedrop }: { token: PlacedToken; size: number; left: number; top: number; drawerOpen: boolean; onBeginDrop: (t: PlacedToken) => void; onEyedrop: (color: string) => void }) {
  const press = useSharedValue(0);
  const fill = tokenFill(token); // computed on JS — NEVER call tokenFill() inside a worklet (crashes)
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
          if (drawerOpen) runOnJS(onEyedrop)(fill);
        }),
    [drawerOpen, onEyedrop, fill],
  );
  const gesture = useMemo(() => Gesture.Race(hold, tap), [hold, tap]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + press.value * 0.12 }] }));
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ position: 'absolute', left, top, width: size, height: size }, style]}>
        <TokenButton size={size} fill={fill} />
      </Animated.View>
    </GestureDetector>
  );
});

/**
 * A drawer source: DRAG it onto the card to place a copy; (colour button only) TAP to cycle colour.
 * `localX/localY` position it WITHIN the tray; `homeX/homeY` are its absolute board-space centre, used
 * to test the drop against the card rect.
 */
const DraggableSource = memo(function DraggableSource({ kind, fill, localX, localY, homeX, homeY, scale, onPlace, onCycle }: { kind: TokenKind; fill: string; localX: number; localY: number; homeX: number; homeY: number; scale: number; onPlace: (kind: TokenKind, cx: number, cy: number) => void; onCycle?: () => void }) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const drag = useSharedValue(0);
  const size = DRAWER_TOKEN * kindScale(kind);
  const drop = useCallback((cx: number, cy: number) => onPlace(kind, cx, cy), [onPlace, kind]);
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
        <TokenButton size={size} fill={fill} />
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
  drawerX: number; // normalized 0..1 anchor
  scale: number;
  onPlace: (t: PlacedToken) => void;
  onRemove: (id: string) => void;
  onSetDrawerColor: (color: string) => void;
  onMoveDrawer: (x: number) => void;
  /** Top offset for the drawer tab (#248 item 7): screen-space hosts pass the safe-area inset so the
   *  tab clears the status bar / screen border, matching the in-stage board's inset. Defaults to 6. */
  drawerTop?: number;
}

/** The reusable token surface — fills its parent; pass the focused card's `cardRect` in parent space. */
export function TokenBoard({ cardRect, width, height, tokens, drawerColor, drawerX, scale, onPlace, onRemove, onSetDrawerColor, onMoveDrawer, drawerTop = DRAWER_TOP }: TokenBoardProps) {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const openP = useSharedValue(0);
  const [falling, setFalling] = useState<{ token: PlacedToken; left: number; top: number }[]>([]);

  useEffect(() => {
    openP.value = withTiming(open ? 1 : 0, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [open, openP]);

  const cardBase = cardRect.width * TOKEN_FRAC; // base diameter; per-kind scale applied per token
  const drawerLeft = Math.max(0, Math.min(width - TRAY_W, drawerX * (width - TRAY_W)));
  const trayTop = drawerTop + TAB_H;

  const place = useCallback(
    (kind: TokenKind, cx: number, cy: number) => {
      // Only land if the drop is over the card (a little slop). Else it just springs back.
      const m = cardBase * 0.5;
      if (cx < cardRect.left - m || cx > cardRect.left + cardRect.width + m || cy < cardRect.top - m || cy > cardRect.top + cardRect.height + m) return;
      const x = Math.max(0, Math.min(1, (cx - cardRect.left) / cardRect.width));
      const y = Math.max(0, Math.min(1, (cy - cardRect.top) / cardRect.height));
      onPlace({ id: newTokenId(), kind, color: kind === 'color' ? drawerColor : undefined, x, y });
      focusHaptic();
    },
    [cardRect, cardBase, drawerColor, onPlace],
  );

  const beginDrop = useCallback(
    (t: PlacedToken) => {
      const size = cardBase * kindScale(t.kind);
      const left = cardRect.left + t.x * cardRect.width - size / 2;
      const top = cardRect.top + t.y * cardRect.height - size / 2;
      setFalling((list) => [...list, { token: t, left, top }]);
      onRemove(t.id);
      tapHaptic();
    },
    [cardRect, cardBase, onRemove],
  );
  const fallingDone = useCallback((id: string) => setFalling((list) => list.filter((f) => f.token.id !== id)), []);
  const eyedrop = useCallback((color: string) => { onSetDrawerColor(color); tapHaptic(); }, [onSetDrawerColor]);
  const cycleColor = useCallback(() => onSetDrawerColor(randomTokenColor(drawerColor)), [onSetDrawerColor, drawerColor]);

  // Drag the tab to reposition the whole drawer along the top; tap to open/close.
  const tabTx = useSharedValue(0);
  const tabPan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(8)
        .onUpdate((e) => { 'worklet'; tabTx.value = e.translationX / scale; })
        .onEnd((e) => {
          'worklet';
          const nx = (drawerLeft + e.translationX / scale) / Math.max(1, width - TRAY_W);
          runOnJS(onMoveDrawer)(Math.max(0, Math.min(1, nx)));
          tabTx.value = 0;
        })
        .onFinalize(() => { 'worklet'; tabTx.value = 0; }),
    [tabTx, scale, drawerLeft, width, onMoveDrawer],
  );
  const tabTap = useMemo(() => Gesture.Tap().maxDuration(260).onEnd(() => { 'worklet'; runOnJS(setOpen)(!open); }), [open]);
  const tabGesture = useMemo(() => Gesture.Exclusive(tabPan, tabTap), [tabPan, tabTap]);
  const tabStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tabTx.value }] }));
  const trayStyle = useAnimatedStyle(() => ({ opacity: openP.value, transform: [{ translateX: tabTx.value }, { translateY: (1 - openP.value) * -10 }] }));

  const fallingIds = useMemo(() => new Set(falling.map((f) => f.token.id)), [falling]);
  const shown = tokens.filter((t) => !fallingIds.has(t.id));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* placed tokens (interactive) */}
      {shown.map((t) => {
        const size = cardBase * kindScale(t.kind);
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
          />
        );
      })}
      {/* tokens dropping off the card */}
      {falling.map((f) => (
        <FallingToken key={f.token.id} token={f.token} size={cardBase * kindScale(f.token.kind)} left={f.left} top={f.top} reduced={reduced} onDone={fallingDone} />
      ))}

      {/* the drawer tray (sources) — drops below the tab when open */}
      <Animated.View
        pointerEvents={open ? 'box-none' : 'none'}
        style={[{ position: 'absolute', left: drawerLeft, top: trayTop, width: TRAY_W, height: TRAY_H }, trayStyle]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(14,17,22,0.94)', borderRadius: 12, borderWidth: 1.4, borderColor: Rune.goldEdge }]} pointerEvents="none" />
        {DEFAULT_TOKEN_KINDS.map((kind, i) => {
          const lx = PAD + i * (DRAWER_TOKEN + GAP) + DRAWER_TOKEN / 2;
          const ly = PAD + DRAWER_TOKEN / 2;
          return <DraggableSource key={kind} kind={kind} fill={tokenFill({ kind })} localX={lx} localY={ly} homeX={drawerLeft + lx} homeY={trayTop + ly} scale={scale} onPlace={place} />;
        })}
        {(() => {
          const lx = PAD + 3 * (DRAWER_TOKEN + GAP) + DRAWER_TOKEN / 2;
          const ly = PAD + DRAWER_TOKEN / 2;
          return <DraggableSource kind="color" fill={drawerColor} localX={lx} localY={ly} homeX={drawerLeft + lx} homeY={trayTop + ly} scale={scale} onPlace={place} onCycle={cycleColor} />;
        })()}
      </Animated.View>

      {/* the tab — always shown; tap to open, drag to reposition */}
      <GestureDetector gesture={tabGesture}>
        <Animated.View style={[{ position: 'absolute', left: drawerLeft + TRAY_W / 2 - TAB_W / 2, top: drawerTop, width: TAB_W, height: TAB_H, backgroundColor: 'rgba(14,17,22,0.94)', borderRadius: 8, borderWidth: 1.4, borderColor: Rune.goldEdge, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 }, tabStyle]} accessible accessibilityRole="button" accessibilityLabel="Token drawer. Tap to open, drag to move">
          <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: Rune.goldBright }} />
          <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: Rune.goldBright }} />
          <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: Rune.goldBright }} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/**
 * The carousel's token board (#244): reads the focus state + the stage scale, computes the focused
 * card's design-space rect, and renders the surface inside DesignStage. Mounted only while a card is
 * focused (fades with `fullscreenProgress`); everything else (LOD tokens on the deck) is the baked
 * layer inside the slots.
 */
export function CarouselTokenBoard() {
  const { fullscreenProgress, focusIndex, switching, decks, category, cardTokens, tokenColor, tokenDrawerX, placeToken, removeToken, setTokenColor, moveTokenDrawer } = useCarousel();
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

  const deck = decks[category];
  const card = st.active ? deck[Math.min(deck.length - 1, Math.max(0, st.idx))] : null;
  const id = card?.id ?? null;

  const cardRect = useMemo<Rect>(() => {
    const w = CARD_W * FS_FOCUS_SCALE;
    const h = CARD_H * FS_FOCUS_SCALE;
    return { left: OX - w / 2, top: FS_CENTER_Y - h / 2, width: w, height: h };
  }, []);

  const onPlace = useCallback((t: PlacedToken) => { if (id) placeToken(id, t); }, [id, placeToken]);
  const onRemove = useCallback((tid: string) => { if (id) removeToken(id, tid); }, [id, removeToken]);

  if (!id) return null;
  return (
    <Animated.View pointerEvents="box-none" style={[box(0, 0, 412, 892), { zIndex: 3600 }, fade]}>
      <TokenBoard
        cardRect={cardRect}
        width={412}
        height={892}
        tokens={cardTokens[id] ?? []}
        drawerColor={tokenColor || TOKEN_COLORS[0]}
        drawerX={tokenDrawerX ?? 0.5}
        scale={scale}
        onPlace={onPlace}
        onRemove={onRemove}
        onSetDrawerColor={setTokenColor}
        onMoveDrawer={moveTokenDrawer}
      />
    </Animated.View>
  );
}
