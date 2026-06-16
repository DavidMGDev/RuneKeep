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
import { DeleteCardConfirm } from '../redesign/edit-card-flow';
import { catalogIdOf } from '@/features/cards/card-effects';
import { isWildshapeId } from '@/lib/wildshape-data';
import { CARD_H, CARD_W, FS_CENTER_Y, FS_FOCUS_SCALE, OX } from '../carousel-geometry';
import {
  DEFAULT_TOKEN_KINDS,
  DIE_MAX,
  type DieType,
  hashStr,
  kindScale,
  nextDieType,
  nextDieValue,
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
// the token sources (centre), the die (right). All share the same top + height.
const DRAWER_TOKEN = 40; // each source / action button
const GAP = 8;
const PAD = 8;
const PANEL_H = PAD * 2 + DRAWER_TOKEN; // 56
const LEFT_W = PAD * 2 + DRAWER_TOKEN; // the contextual action button (edit OR delete)
const CENTER_W = PAD * 2 + 4 * DRAWER_TOKEN + 3 * GAP; // wood/bone/iron/colour
const RIGHT_W = PAD * 2 + DRAWER_TOKEN; // the die
const SIDE = 6; // gap from the screen edge
const OPEN_W = 66; // the closed "open drawer" button
const OPEN_H = 42;
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

/** A placed, interactive token: HOLD → drop (off the card), TAP (drawer open) → eyedrop its colour. */
const PlacedTokenView = memo(function PlacedTokenView({ token, size, left, top, drawerOpen, onBeginDrop, onEyedrop, onCycleDie }: { token: PlacedToken; size: number; left: number; top: number; drawerOpen: boolean; onBeginDrop: (t: PlacedToken) => void; onEyedrop: (color: string) => void; onCycleDie: (t: PlacedToken) => void }) {
  const press = useSharedValue(0);
  const fill = tokenFill(token); // computed on JS — NEVER call tokenFill() inside a worklet (crashes)
  const isDie = token.kind === 'die';
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
  const gesture = useMemo(() => Gesture.Race(hold, tap), [hold, tap]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + press.value * 0.12 }] }));
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ position: 'absolute', left, top, width: size, height: size }, style]}>
        <TokenGlyph size={size} token={token} />
      </Animated.View>
    </GestureDetector>
  );
});

/**
 * A drawer source: DRAG it onto the card to place a copy; (colour button only) TAP to cycle colour.
 * `localX/localY` position it WITHIN the tray; `homeX/homeY` are its absolute board-space centre, used
 * to test the drop against the card rect.
 */
const DraggableSource = memo(function DraggableSource({ token, localX, localY, homeX, homeY, scale, onPlace, onCycle }: { token: TokenDesc; localX: number; localY: number; homeX: number; homeY: number; scale: number; onPlace: (desc: TokenDesc, cx: number, cy: number) => void; onCycle?: () => void }) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const drag = useSharedValue(0);
  const size = DRAWER_TOKEN * kindScale(token.kind);
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
  const [falling, setFalling] = useState<{ token: PlacedToken; left: number; top: number }[]>([]);

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
      if (desc.kind === 'die') { const dt = desc.dieType ?? dieType; tok.dieType = dt; tok.dieValue = DIE_MAX[dt]; }
      onPlace(tok);
      focusHaptic();
      playSfx('placeToken'); // #255
    },
    [cardRect, cardBase, drawerColor, dieType, onPlace],
  );

  const beginDrop = useCallback(
    (t: PlacedToken) => {
      const size = cardBase * kindScale(t.kind);
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

  // Three aligned panels in the top band (#293): action (left), token sources (centre), die (right).
  const leftX = SIDE;
  const rightX = width - SIDE - RIGHT_W;
  const centerX = (width - CENTER_W) / 2;
  const ly = PAD + DRAWER_TOKEN / 2;
  const openStyle = useAnimatedStyle(() => ({ opacity: 1 - openP.value }));
  const panelStyle = useAnimatedStyle(() => ({ opacity: openP.value, transform: [{ translateY: (1 - openP.value) * -8 }] }));
  const panelBox = (x: number, w: number) => ({ position: 'absolute' as const, left: x, top: drawerTop, width: w, height: PANEL_H, backgroundColor: 'rgba(14,17,22,0.94)', borderRadius: 12, borderWidth: 1.4, borderColor: Rune.goldEdge });

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
            onCycleDie={cycleDie}
          />
        );
      })}
      {/* tokens dropping off the card */}
      {falling.map((f) => (
        <FallingToken key={f.token.id} token={f.token} size={cardBase * kindScale(f.token.kind)} left={f.left} top={f.top} reduced={reduced} onDone={fallingDone} />
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
          {canAct ? (
            <View style={panelBox(leftX, LEFT_W)}>
              <View style={{ position: 'absolute', left: PAD, top: PAD }}>
                <CardActionButton kind={editable ? 'edit' : 'delete'} onPress={() => (editable ? onEditCard?.() : onRequestDelete?.())} />
              </View>
            </View>
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
          <View style={panelBox(rightX, RIGHT_W)}>
            {(() => {
              const lx = PAD + DRAWER_TOKEN / 2;
              return <DraggableSource token={{ kind: 'die', dieType, dieValue: DIE_MAX[dieType] }} localX={lx} localY={ly} homeX={rightX + lx} homeY={drawerTop + ly} scale={scale} onPlace={place} onCycle={cycleDieType} />;
            })()}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Top-left fullscreen card action (#264 item 5): pencil to edit a custom card, trash to delete a
 *  catalog card. Sits in the same faded layer as the token drawer tab, so it appears with it. */
function CardActionButton({ kind, onPress }: { kind: 'edit' | 'delete'; onPress: () => void }) {
  const color = kind === 'edit' ? Rune.goldText : '#E2705A';
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={kind === 'edit' ? 'Edit card' : 'Delete card'}
      style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(14,17,22,0.94)', borderWidth: 1.4, borderColor: Rune.goldEdge, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={20} height={20} viewBox="0 0 24 24">
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
    </Pressable>
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

  const cardRect = useMemo<Rect>(() => {
    const w = CARD_W * FS_FOCUS_SCALE;
    const h = CARD_H * FS_FOCUS_SCALE;
    return { left: OX - w / 2, top: FS_CENTER_Y - h / 2, width: w, height: h };
  }, []);

  const onPlace = useCallback((t: PlacedToken) => { if (id) placeToken(id, t); }, [id, placeToken]);
  const onRemove = useCallback((tid: string) => { if (id) removeToken(id, tid); }, [id, removeToken]);
  const onUpdate = useCallback((tid: string, patch: Partial<PlacedToken>) => { if (id) updateToken(id, tid, patch); }, [id, updateToken]);

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
        tokens={cardTokens[id] ?? []}
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
