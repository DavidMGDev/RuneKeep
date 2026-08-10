/**
 * The dice tray (v0.39.0, owner) — the sheet, with its vitals folded away and dice in their place.
 *
 * This is NOT the app rolling for you. It never resolves a check, never applies a result to anything
 * and never writes to the character file. It is a handful of dice for a table that has none, and the
 * only thing it knows how to do is throw them and add them up. The one place it reads the character
 * at all is the trait row, and only in the direction a real table works: you tap Agility, it throws
 * the pair and adds your +2, and what that means is yours to decide.
 *
 * Three pieces, laid over the three panels that fade out behind them:
 *
 *  - the CAROUSEL where hit points were: every die the tray offers, one centred, the rest fading out
 *    before they reach the panel's edges. Tapping the centred one adds it; tapping any other brings
 *    it to the middle first, so a die is never added by a mis-tap.
 *  - the POOL, from the top of the stress panel to half way down hope: what you have picked up, always
 *    sorted by size and always as big as it can be (`lib/dice-pool` decides both).
 *  - the ROW under it: Roll, the total, Clear.
 *
 * The motion is arithmetic rather than layout, which is what makes it cheap and what stops it
 * flickering. Every die is one absolutely positioned box whose CENTRE sits at the origin, moved,
 * scaled and turned by a transform; the grid changing shape is one `withTiming` per die and no
 * re-layout at all, and a die added from the carousel is the same thing starting somewhere else.
 * Nothing ever mounts in the wrong place, because the shared values are seeded before the first frame.
 */
import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, runOnJS, type SharedValue, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Polygon } from 'react-native-svg';

import { Body, Display, Rune } from '@/constants/theme';
import { box } from '@/lib/design';
import { playSfx } from '@/lib/sfx';
import { DIE_MAX, type DieType, FEAR_INK, FEAR_PURPLE, HOPE_GOLD, HOPE_INK } from '../components/card-tokens-data';
import { DieButton } from '../components/card-tokens';
import { type Duality, dualityVerdict, type PoolDie, poolGrid, poolTotal, rollCents, rollValue, sortPool, TRAY_DICE } from '@/lib/dice-pool';
import { ChamferFrame } from './chamfer';

// ---------------------------------------------------------------------------------- the geometry

/** The carousel takes the hit points panel's place, and the pool the stress panel's. */
const CAROUSEL = { left: 22, top: 302, w: 368, h: 82 };
const POOL = { left: 22, top: 396, w: 368, h: 158 };
/** Roll, the total and Clear, in the strip under the pool, finishing where hope used to. */
const ROW = { left: 22, top: 560, w: 368, h: 36 };

const GOLD = Rune.goldEdge;
const INK = 'rgba(14,17,22,0.94)';
/**
 * The total's three colours, on PARCHMENT.
 *
 * The owner's rule is "purple if fear was highest and gold if hope was highest", and the trap is that
 * the sheet's gold (`goldText`, `goldBright`) is meant for dark panels: on parchment it is almost
 * invisible, which is exactly how the first build printed the total in white on white. `bronze` is
 * the app's own deep gold for this surface, and the purple is darkened to match its weight.
 */
const TOTAL_INK = Rune.inkText;
const TOTAL_HOPE = Rune.bronze;
const TOTAL_FEAR = '#5B2E86';

/** How far apart the carousel's dice sit, and how big they are. */
const STRIDE = 78;
const CAROUSEL_DIE = 56;
/** A die is fully lit within this much of the middle and gone by the second number (design px). */
const FADE_IN = 44;
const FADE_OUT = 172;
/** How far off centre a die may be and still be "the one in the middle" when it is tapped. */
const CENTRED = 0.35;

/** One die's spin, and how far apart two dice of the same throw are heard. */
const SPIN_MS = 420;
const STAGGER_MS = 88;
/** Every pool die is DRAWN at this size and scaled by a transform, so its SVG never re-renders. */
const DIE_BASE = 110;

// ------------------------------------------------------------------------------------- the trigger

/**
 * The button (owner's sketch): a triangle in the gap between the portrait's float-menu diamond and
 * the left edge of the hit points panel.
 *
 * A right angle at the bottom left, so its hypotenuse runs alongside the diamond's lower-left facet
 * and it reads as a piece cut to fit the space rather than a shape dropped into it. Gold on ink like
 * every other control on this half of the sheet; the owner's blue marked the spot, it was not a
 * colour proposal. The touch box stops short of the diamond's on the right, because the diamond is
 * the busiest control on the sheet and must not lose a single tap to this.
 */
const TRI = { left: 24, top: 244, w: 46, h: 46 };

function DiceTrayTrigger({ on, onPress }: { on: boolean; onPress: () => void }) {
  const stroke = on ? '#141821' : Rune.goldBright;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ left: 10, bottom: 10, top: 4, right: 0 }}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={on ? 'Close the dice tray' : 'Open the dice tray'}
      style={({ pressed }) => [box(TRI.left, TRI.top, TRI.w, TRI.h), { opacity: pressed ? 0.66 : 1 }]}>
      <Svg width={TRI.w} height={TRI.h} viewBox="0 0 46 46">
        <Polygon points="2,2 2,44 44,44" fill={on ? Rune.goldBright : '#141821'} stroke={GOLD} strokeWidth={1.8} strokeLinejoin="round" />
        {/* a die, sized to sit inside the roomy bottom-left half of the triangle */}
        <Polygon points="11,25 20,25 24,32.5 20,40 11,40 7,32.5" fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
        <Polygon points="11,25 15.5,32.5 20,25" fill="none" stroke={stroke} strokeWidth={1.3} strokeLinejoin="round" />
      </Svg>
    </Pressable>
  );
}

// ------------------------------------------------------------------------------------ the carousel

const CarouselDie = memo(function CarouselDie({ type, index, pos, onPress }: { type: DieType; index: number; pos: SharedValue<number>; onPress: (index: number) => void }) {
  const style = useAnimatedStyle(() => {
    const dx = (index - pos.value) * STRIDE;
    const d = Math.abs(dx);
    const fade = d <= FADE_IN ? 1 : d >= FADE_OUT ? 0 : 1 - (d - FADE_IN) / (FADE_OUT - FADE_IN);
    return { opacity: fade, transform: [{ translateX: dx }, { scale: 0.7 + 0.3 * fade }] };
  });
  return (
    <Animated.View
      style={[{ position: 'absolute', left: (CAROUSEL.w - CAROUSEL_DIE) / 2, top: (CAROUSEL.h - CAROUSEL_DIE) / 2 - 4, width: CAROUSEL_DIE, height: CAROUSEL_DIE }, style]}>
      <Pressable onPress={() => onPress(index)} accessibilityRole="button" accessibilityLabel={`${type}, add it to the pool`} style={{ flex: 1 }}>
        <DieButton size={CAROUSEL_DIE} dieType={type} value={DIE_MAX[type]} hideNumber />
      </Pressable>
    </Animated.View>
  );
});

// ---------------------------------------------------------------------------------------- the pool

interface Slot { x: number; y: number; cell: number }

/**
 * One die in the pool.
 *
 * It owns where it is, how big it is and how far through a spin, and nothing else. The parent hands it
 * a slot and it animates there, so the grid re-flowing and a die flying in from the carousel are the
 * same code with different starting points.
 *
 * `face` lags the die's value ON PURPOSE. The parent knows every result the moment Roll is pressed,
 * but a die must not show its answer before its own spin has finished, or the last die of a big
 * handful would be readable half a second before it lands.
 */
const PoolDieView = memo(function PoolDieView({ die, slot, from, roll, delay, reduced, onRemove }: {
  die: PoolDie;
  slot: Slot;
  /** Where it enters from, on its first frame only. Null for a die that is already on the table. */
  from: { x: number; y: number } | null;
  /** Bumped on every throw. Zero means "never thrown". */
  roll: number;
  delay: number;
  reduced: boolean;
  onRemove: (id: string) => void;
}) {
  const centre = (s: Slot) => ({ x: s.x + s.cell / 2, y: s.y + s.cell / 2 });
  const home = centre(slot);
  const cx = useSharedValue(from ? from.x : home.x);
  const cy = useSharedValue(from ? from.y : home.y);
  const scale = useSharedValue((from ? slot.cell * 0.55 : slot.cell) / DIE_BASE);
  const turn = useSharedValue(0);
  const swell = useSharedValue(0);
  const [face, setFace] = useState<number | null>(die.value);
  const value = useRef(die.value);
  value.current = die.value;

  useEffect(() => {
    const ms = reduced ? 0 : 280;
    const to = { x: slot.x + slot.cell / 2, y: slot.y + slot.cell / 2 };
    cx.value = withTiming(to.x, { duration: ms, easing: Easing.out(Easing.cubic) });
    cy.value = withTiming(to.y, { duration: ms, easing: Easing.out(Easing.cubic) });
    scale.value = withTiming(slot.cell / DIE_BASE, { duration: ms, easing: Easing.out(Easing.cubic) });
  }, [slot.x, slot.y, slot.cell, cx, cy, scale, reduced]);

  /**
   * The throw.
   *
   * Keyed on `roll` alone: the die's VALUE changes in the same commit, and depending on both would
   * start the spin twice for one throw. The new face is read out of a ref when the spin is over.
   */
  useEffect(() => {
    if (roll === 0) { setFace(value.current); return; }
    if (reduced) { setFace(value.current); return; }
    setFace(null);
    const t = setTimeout(() => {
      turn.value = withTiming(turn.value + 1, { duration: SPIN_MS, easing: Easing.inOut(Easing.cubic) });
      swell.value = withTiming(1, { duration: SPIN_MS * 0.45, easing: Easing.out(Easing.cubic) }, (done) => {
        if (done) swell.value = withTiming(0, { duration: SPIN_MS * 0.55, easing: Easing.inOut(Easing.cubic) });
      });
    }, delay);
    const show = setTimeout(() => setFace(value.current), delay + SPIN_MS * 0.84);
    return () => { clearTimeout(t); clearTimeout(show); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roll]);

  useEffect(() => () => { cancelAnimation(cx); cancelAnimation(cy); cancelAnimation(scale); cancelAnimation(turn); cancelAnimation(swell); }, [cx, cy, scale, turn, swell]);

  // The box's own centre sits at the panel's origin, so translating by the slot centre puts it there
  // and the scale and the turn happen about the die itself.
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: cx.value },
      { translateY: cy.value },
      { scale: scale.value * (1 + swell.value * 0.2) },
      { rotate: `${turn.value * 360}deg` },
    ],
  }));

  const hope = die.side === 'hope';
  const fear = die.side === 'fear';
  return (
    <Animated.View style={[{ position: 'absolute', left: -DIE_BASE / 2, top: -DIE_BASE / 2, width: DIE_BASE, height: DIE_BASE }, style]}>
      <Pressable
        onPress={() => onRemove(die.id)}
        accessibilityRole="button"
        accessibilityLabel={`${die.side ?? die.type}${face == null ? '' : `, showing ${face}`}. Tap to take it out.`}
        style={{ flex: 1 }}>
        <DieButton
          size={DIE_BASE}
          dieType={die.type}
          value={face ?? DIE_MAX[die.type]}
          hideNumber={face == null}
          fill={hope ? HOPE_GOLD : fear ? FEAR_PURPLE : undefined}
          ink={hope ? HOPE_INK : fear ? FEAR_INK : undefined}
        />
      </Pressable>
    </Animated.View>
  );
});

// ---------------------------------------------------------------------------------------- the tray

export interface DiceTrayHandle {
  /** Clear the pool, throw the duality pair, and add this trait's modifier to the total. */
  rollDuality: (label: string, modifier: number) => void;
}

let seq = 0;
const nextId = () => `dp-${++seq}`;

export function DiceTray({ up, onToggle, handleRef }: { up: boolean; onToggle: () => void; handleRef: { current: DiceTrayHandle | null } }) {
  const reduced = useReducedMotion();
  const [pool, setPool] = useState<PoolDie[]>([]);
  const [roll, setRoll] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [modifier, setModifier] = useState<{ label: string; value: number } | null>(null);
  const [verdict, setVerdict] = useState<Duality>(null);
  const [centreLabel, setCentreLabel] = useState<DieType>(TRAY_DICE[Math.floor(TRAY_DICE.length / 2)]);
  /** Dice that have not been laid out yet, so each flies in from the carousel exactly once. */
  const entering = useRef(new Set<string>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = useCallback(() => { for (const t of timers.current) clearTimeout(t); timers.current = []; }, []);
  useEffect(() => () => clearTimers(), [clearTimers]);

  const fade = useSharedValue(0);
  useEffect(() => {
    fade.value = reduced ? (up ? 1 : 0) : withTiming(up ? 1 : 0, { duration: 240, easing: Easing.out(Easing.cubic) });
  }, [up, fade, reduced]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  // --- the carousel ------------------------------------------------------------------------------
  /** Where the carousel is, as a fractional index. A whole number is a die in the middle. */
  const pos = useSharedValue(Math.floor(TRAY_DICE.length / 2));
  const from = useSharedValue(0);
  const last = TRAY_DICE.length - 1;
  /**
   * Built ONCE, and never rebuilt.
   *
   * Four releases have been spent on gestures that were rebuilt mid-gesture and latched (the
   * creator's grind, the stat wheel, the cards gallery twice). This one closes over shared values and
   * one constant, so nothing in its dependency list can change under a finger that is already down.
   */
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => { cancelAnimation(pos); from.value = pos.value; })
        .onUpdate((e) => { pos.value = Math.max(-0.4, Math.min(last + 0.4, from.value - e.translationX / STRIDE)); })
        .onEnd((e) => {
          const drift = -e.velocityX / STRIDE / 6;
          pos.value = withSpring(Math.max(0, Math.min(last, Math.round(pos.value + drift))), { damping: 18, stiffness: 170, mass: 0.6 });
        }),
    [pos, from, last],
  );
  // Only fires when the die in the middle actually changes, so the label costs nothing to scroll past.
  useAnimatedReaction(
    () => Math.max(0, Math.min(last, Math.round(pos.value))),
    (i, prev) => { if (i !== prev) runOnJS(setCentreLabel)(TRAY_DICE[i]); },
    [last],
  );

  const addDie = useCallback((type: DieType) => {
    const id = nextId();
    entering.current.add(id);
    setPool((p) => [...p, { id, type, value: null }]);
    setTotal(null);
    setVerdict(null);
    setModifier(null); // a trait's modifier belongs to the pair it was thrown with, not to a new pool
    playSfx('placeToken', { cents: 140 });
  }, []);

  const tapCarousel = useCallback((index: number) => {
    // Not in the middle: bring it there. In the middle: pick it up. The owner's rule, and it is what
    // stops a swipe that happens to end on a die from adding one.
    if (Math.abs(pos.value - index) > CENTRED) {
      pos.value = withSpring(index, { damping: 18, stiffness: 170, mass: 0.6 });
      playSfx('carouselScroll');
      return;
    }
    addDie(TRAY_DICE[index]);
  }, [pos, addDie]);

  // --- the pool ----------------------------------------------------------------------------------
  const ordered = useMemo(() => sortPool(pool), [pool]);
  const grid = useMemo(() => poolGrid(ordered.length, POOL.w, POOL.h, { gap: 9, max: 106 }), [ordered.length]);
  // Cleared after the commit that mounted them: the entry point is a first-frame decision only.
  useEffect(() => { entering.current.clear(); }, [pool]);

  const throwPool = useCallback((dice: PoolDie[], mod: { label: string; value: number } | null) => {
    if (dice.length === 0) return;
    clearTimers();
    const thrown = dice.map((d) => ({ ...d, value: rollValue(d.type) }));
    const order = sortPool(thrown);
    setPool(thrown);
    setModifier(mod);
    setTotal(null);
    setVerdict(null);
    setRoll((n) => n + 1);
    order.forEach((_, i) => {
      timers.current.push(setTimeout(() => playSfx('placeToken', { cents: rollCents(order, i) }), reduced ? 0 : i * STAGGER_MS));
    });
    const settle = reduced ? 0 : (order.length - 1) * STAGGER_MS + SPIN_MS * 0.84;
    timers.current.push(
      setTimeout(() => {
        const v = dualityVerdict(order);
        setVerdict(v);
        setTotal(poolTotal(order, mod?.value ?? 0));
        if (v === 'critical') playSfx('gainGoldenHp');
        else if (v === 'hope') playSfx('gainHope');
        else if (v === 'fear') playSfx('loseHope', { cents: -200 });
        else playSfx('transitionIconFilled');
      }, settle),
    );
  }, [clearTimers, reduced]);

  const clear = useCallback(() => {
    clearTimers();
    entering.current.clear();
    setPool([]);
    setTotal(null);
    setModifier(null);
    setVerdict(null);
    playSfx('tokenRemove');
  }, [clearTimers]);

  const removeDie = useCallback((id: string) => {
    setPool((p) => p.filter((d) => d.id !== id));
    setTotal(null);
    setVerdict(null);
    playSfx('tokenRemove');
  }, []);

  /**
   * A trait, tapped while the tray is open.
   *
   * It clears whatever was in the pool and throws the pair, because a duality roll is its own thing
   * and mixing it with four leftover d6 would be neither one nor the other. The trait's modifier rides
   * the total, and that is the only thing this whole feature reads off the character sheet.
   */
  useImperativeHandle(handleRef, () => ({
    rollDuality: (label: string, value: number) => {
      entering.current.clear();
      throwPool(
        [
          { id: nextId(), type: 'd12', value: null, side: 'hope' },
          { id: nextId(), type: 'd12', value: null, side: 'fear' },
        ],
        { label, value },
      );
    },
  }), [throwPool]);

  const totalColor = verdict === 'fear' ? TOTAL_FEAR : verdict ? TOTAL_HOPE : TOTAL_INK;
  const note = verdict === 'critical' ? 'Critical' : verdict === 'hope' ? 'With Hope' : verdict === 'fear' ? 'With Fear' : modifier ? modifier.label : null;

  return (
    <>
      <DiceTrayTrigger on={up} onPress={onToggle} />
      <Animated.View style={[box(0, 0, 412, 892), fadeStyle]} pointerEvents={up ? 'box-none' : 'none'}>
        {/* the carousel */}
        <ChamferFrame left={CAROUSEL.left} top={CAROUSEL.top} width={CAROUSEL.w} height={CAROUSEL.h} chamfer={12} stroke={GOLD} strokeWidth={1.4} />
        <GestureDetector gesture={pan}>
          <View style={[box(CAROUSEL.left, CAROUSEL.top, CAROUSEL.w, CAROUSEL.h), { overflow: 'hidden' }]}>
            {TRAY_DICE.map((t, i) => (
              <CarouselDie key={t} type={t} index={i} pos={pos} onPress={tapCarousel} />
            ))}
            <Text
              pointerEvents="none"
              style={{ position: 'absolute', left: 0, right: 0, bottom: 5, textAlign: 'center', color: Rune.bronze, fontSize: 9, fontFamily: Body.bold, letterSpacing: 1.6, textTransform: 'uppercase' }}>
              {centreLabel}
            </Text>
          </View>
        </GestureDetector>

        {/* the pool */}
        <ChamferFrame left={POOL.left} top={POOL.top} width={POOL.w} height={POOL.h} chamfer={12} stroke={GOLD} strokeWidth={1.4} />
        <View style={[box(POOL.left, POOL.top, POOL.w, POOL.h), { overflow: 'hidden' }]}>
          {ordered.length === 0 ? (
            <Text style={{ position: 'absolute', left: 18, right: 18, top: POOL.h / 2 - 18, textAlign: 'center', color: Rune.inkText, fontSize: 11.5, fontFamily: Body.medium, lineHeight: 17 }}>
              Tap a die above to pick it up.{'\n'}Tap a trait to throw the duality pair with it.
            </Text>
          ) : null}
          {ordered.map((d, i) => (
            <PoolDieView
              key={d.id}
              die={d}
              slot={{ ...grid.slots[i], cell: grid.cell }}
              from={entering.current.has(d.id) ? { x: POOL.w / 2, y: CAROUSEL.top + CAROUSEL.h / 2 - POOL.top } : null}
              roll={roll}
              delay={i * STAGGER_MS}
              reduced={reduced}
              onRemove={removeDie}
            />
          ))}
        </View>

        {/* Roll, the total, Clear */}
        <View style={[box(ROW.left, ROW.top, ROW.w, ROW.h), { flexDirection: 'row', alignItems: 'center' }]}>
          <TrayButton label="Roll" primary disabled={ordered.length === 0} onPress={() => throwPool(pool, modifier)} />
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
            {note ? (
              <Text numberOfLines={1} style={{ color: verdict === 'fear' ? TOTAL_FEAR : Rune.bronze, fontSize: 8.5, fontFamily: Body.bold, letterSpacing: 1.1, textTransform: 'uppercase' }}>
                {note}{modifier ? ` ${modifier.value >= 0 ? '+' : ''}${modifier.value}` : ''}
              </Text>
            ) : null}
            <Text numberOfLines={1} style={{ color: totalColor, fontSize: total == null ? 16 : 25, lineHeight: total == null ? 22 : 29, fontFamily: Display.black, fontVariant: ['tabular-nums'] }}>
              {total ?? '·'}
            </Text>
          </View>
          <TrayButton label="Clear" disabled={ordered.length === 0} onPress={clear} />
        </View>
      </Animated.View>
    </>
  );
}

/** The tray's own button: the sheet's chamfered gold, sized for the strip it sits in. */
function TrayButton({ label, primary, disabled, onPress }: { label: string; primary?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => { if (disabled) return; playSfx('buttonTap'); onPress(); }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={label}
      style={({ pressed }) => ({ width: 96, height: ROW.h, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 })}>
      <ChamferFrame left={0} top={0} width={96} height={ROW.h} chamfer={8} stroke={GOLD} strokeWidth={1.4} fill={primary ? 'rgba(150,32,32,0.94)' : INK} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
        <Text style={{ color: primary ? Rune.sheet : Rune.goldText, fontSize: 12, fontFamily: Body.bold, letterSpacing: 1.2, textTransform: 'uppercase' }}>{label}</Text>
      </View>
    </Pressable>
  );
}
