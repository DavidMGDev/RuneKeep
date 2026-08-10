/**
 * The dice tray (v0.39.0, owner) — a handful of dice for a table that has none.
 *
 * This is NOT the app rolling for you. It never resolves a check, never applies a result to anything
 * and never writes to a character file. The only thing it reads off a sheet is a trait's modifier,
 * and only in the direction a real table works: you tap Agility, it throws the pair and adds your +2,
 * and what that means is yours to decide.
 *
 * Three panels: a CAROUSEL of dice, a POOL of what you picked up, and a row of Roll, the total and
 * Clear. v0.40.0 makes the three of them a parameter, so the character sheet passes its own design
 * coordinates and DM Mode passes a dark panel of its own, and the two cannot drift apart.
 *
 * The motion is arithmetic rather than layout, which is what makes it cheap and what stops it
 * flickering. Every die is one absolutely positioned box whose CENTRE sits at the panel's origin,
 * moved, scaled and turned by a transform; the grid changing shape is one `withTiming` per die and no
 * re-layout at all, and a die added from the carousel is the same thing starting somewhere else.
 * Nothing ever mounts in the wrong place, because the shared values are seeded before the first frame.
 */
import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, runOnJS, type SharedValue, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Polygon } from 'react-native-svg';

import { Body, Display, DmRune, Rune } from '@/constants/theme';
import { useDetentGuard } from '@/hooks/use-detent';
import { box } from '@/lib/design';
import { playSfx } from '@/lib/sfx';
import { DIE_MAX, type DieType, FEAR_INK, FEAR_PURPLE, HOPE_GOLD, HOPE_INK } from '../components/card-tokens-data';
import { DieButton } from '../components/card-tokens';
import { addDie, type DieVerdict, dieVerdicts, type Duality, dualityVerdict, type PoolDie, poolGrid, poolTotal, removeDie, rollCents, rollValue, sortPool, TRAY_DICE } from '@/lib/dice-pool';
import { ChamferFrame } from './chamfer';
import { FrameSvg } from './frame-svgs';

// ---------------------------------------------------------------------------------- the geometry

export interface TrayBox { left: number; top: number; w: number; h: number }
export interface TrayLayout {
  /** The container the three panels are placed in. */
  width: number;
  height: number;
  carousel: TrayBox;
  pool: TrayBox;
  row: TrayBox;
}

/** The character sheet: the carousel takes the hit points panel's place, the pool the stress panel's. */
export const SHEET_TRAY: TrayLayout = {
  width: 412,
  height: 892,
  carousel: { left: 22, top: 302, w: 368, h: 82 },
  pool: { left: 22, top: 396, w: 368, h: 158 },
  row: { left: 22, top: 560, w: 368, h: 36 },
};

/** How far apart the carousel's dice sit, and how big they are. */
const STRIDE = 78;
const CAROUSEL_DIE = 56;
/** A die is fully lit within this much of the middle and gone by the second number (design px). */
const FADE_IN = 44;
const FADE_OUT = 172;
/** How far off centre a die may be and still be "the one in the middle" when it is tapped. */
const CENTRED = 0.35;
/** Past this much travel the touch is a swipe, and the click the browser fires after it is not a tap. */
const DRAG_SLOP = 6;

/** One die's spin, and how far apart two dice of the same throw are heard. */
const SPIN_MS = 420;
const STAGGER_MS = 88;
/** Every pool die is DRAWN at this size and scaled by a transform, so its SVG never re-renders. */
const DIE_BASE = 110;

/**
 * How much a flick carries (v0.40.0, owner: "i want more momentum preserved in my dice swiping").
 *
 * The release used to add `velocity / STRIDE / 6` to the position and round it, so a flick was worth
 * a fraction of one die and every change of selection had to be dragged more than half a die's width
 * by hand. This is the flick's reach in dice per thousand px/s, and the spring is softer to match,
 * because a throw that carries four dice and then stops dead reads as a jam rather than as momentum.
 */
const FLICK_REACH = 0.17;
const CAROUSEL_SPRING = { damping: 15, stiffness: 120, mass: 0.7 };

// ------------------------------------------------------------------------------------- the trigger

/**
 * The dice panel (v0.40.0, owner) — the Evasion and Armor panel, mirrored.
 *
 * v0.39.0 put a plain triangle in the gap under the portrait, and it read as a shape dropped onto the
 * parchment rather than a piece of the sheet: it sat lower than the panel opposite it and shared none
 * of its language. The owner's answer is exact and it is the right one: the portrait's diamond button
 * falls into a NOTCH in the left end of the Evasion and Armor panel, so the same notch belongs on the
 * other side of that button, and the two panels then read as one band with the button between them.
 *
 * It is drawn by REFLECTING the panel's own artwork rather than by hand-cutting a matching path:
 *
 *  - `MIRROR_AXIS` is the diamond's vertical centre line. A copy of the panel flipped about its own
 *    centre and placed so that its right edge lands as far LEFT of that axis as the real panel's left
 *    edge lands right of it is, by construction, the mirror image. There is no fitting involved and
 *    nothing to re-tune if the artwork is ever replaced.
 *  - It takes the panel's own `top` and `height`, which is what makes the two level. The triangle was
 *    44px lower, which is the "not a triangle that is lower vertically" the owner called out.
 *  - The window is clipped at {@link PANEL_LEFT}, the hit points panel's left edge, which is the
 *    margin the whole upper band was aligned to in v0.40.0.
 */
const ARMOR_PANEL = { left: 105, top: 200, w: 291, h: 95 };
/** The float-menu diamond, whose centre both notches are cut around. */
const DIAMOND = { left: 60, w: 52 };
const MIRROR_AXIS = DIAMOND.left + DIAMOND.w / 2;
/** The sheet's left margin: the hit points panel's left edge (owner, v0.40.0). */
const PANEL_LEFT = 21;
/** Where the mirrored copy's right edge lands: as far left of the axis as the panel's left edge is right of it. */
const MIRROR_RIGHT = MIRROR_AXIS - (ARMOR_PANEL.left - MIRROR_AXIS);
const TRAY_PANEL = { left: PANEL_LEFT, top: ARMOR_PANEL.top, w: MIRROR_RIGHT - PANEL_LEFT, h: ARMOR_PANEL.h };

/**
 * The die on that panel.
 *
 * Placed inside the FILLED part of the mirrored tail, not in the middle of the clip box: the tail
 * tapers, so most of that box is parchment and an icon centred in it would sit half outside the
 * shape, which is what the first attempt did. The largest square that fits entirely within the fill,
 * clear of the diamond, is 21dp at design (21,259); this is that square inset on every side, which is
 * the padding the owner asked for.
 */
const TRAY_ICON = { left: 1, top: 60, size: 19 };

function DiceTrayTrigger({ on, onPress }: { on: boolean; onPress: () => void }) {
  const stroke = on ? Rune.goldBright : 'rgba(226,192,138,0.92)';
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ left: 8, bottom: 6, top: 6, right: 0 }}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={on ? 'Close the dice tray' : 'Open the dice tray'}
      style={({ pressed }) => [box(TRAY_PANEL.left, TRAY_PANEL.top, TRAY_PANEL.w, TRAY_PANEL.h), { overflow: 'hidden', opacity: pressed ? 0.72 : 1 }]}>
      <View
        style={[
          box(MIRROR_RIGHT - ARMOR_PANEL.w - TRAY_PANEL.left, 0, ARMOR_PANEL.w, ARMOR_PANEL.h),
          { transform: [{ scaleX: -1 }] },
        ]}
        pointerEvents="none">
        <FrameSvg.ArmorBg width="100%" height="100%" preserveAspectRatio="none" />
      </View>
      <View style={box(TRAY_ICON.left, TRAY_ICON.top, TRAY_ICON.size, TRAY_ICON.size)} pointerEvents="none">
        {/* A d20 at 19dp: the hexagon and ONE inner facet, and nothing else. The first version drew the
            full three-facet star and at this size the strokes merged into a blob. */}
        <Svg width="100%" height="100%" viewBox="0 0 30 30">
          <Polygon points="15,1.6 26.4,8.3 26.4,21.7 15,28.4 3.6,21.7 3.6,8.3" fill="none" stroke={stroke} strokeWidth={2.6} strokeLinejoin="round" />
          <Polygon points="15,8.4 22,19.6 8,19.6" fill="none" stroke={stroke} strokeWidth={2.2} strokeLinejoin="round" />
        </Svg>
      </View>
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
      style={[{ position: 'absolute', left: '50%', marginLeft: -CAROUSEL_DIE / 2, top: '50%', marginTop: -CAROUSEL_DIE / 2 - 4, width: CAROUSEL_DIE, height: CAROUSEL_DIE }, style]}>
      <Pressable
        onPress={() => onPress(index)}
        accessibilityRole="button"
        accessibilityLabel={type === 'duality' ? 'The duality pair, add both dice to the pool' : `${type}, add it to the pool`}
        style={{ flex: 1 }}>
        <DieButton size={CAROUSEL_DIE} dieType={type} value={DIE_MAX[type]} value2={DIE_MAX[type]} hideNumber />
      </Pressable>
    </Animated.View>
  );
});

// ---------------------------------------------------------------------------------------- the pool

interface Slot { x: number; y: number; cell: number }

/**
 * One die in the pool.
 *
 * It owns where it is, how big it is, how far through a spin, and what its result made it do when it
 * landed. The parent hands it a slot and it animates there, so the grid re-flowing and a die flying
 * in from the carousel are the same code with different starting points.
 *
 * `face` lags the die's value ON PURPOSE. The parent knows every result the moment Roll is pressed,
 * but a die must not show its answer before its own spin has finished, or the last die of a big
 * handful would be readable half a second before it lands.
 */
const PoolDieView = memo(function PoolDieView({ die, slot, from, roll, delay, verdict, reduced, onRemove }: {
  die: PoolDie;
  slot: Slot;
  /** Where it enters from, on its first frame only. Null for a die that is already on the table. */
  from: { x: number; y: number } | null;
  /** Bumped on every throw. Zero means "never thrown". */
  roll: number;
  delay: number;
  /** What this die's result earned it. See `dice-pool`'s `dieVerdicts`. */
  verdict: DieVerdict;
  reduced: boolean;
  onRemove: (id: string) => void;
}) {
  const home = { x: slot.x + slot.cell / 2, y: slot.y + slot.cell / 2 };
  const cx = useSharedValue(from ? from.x : home.x);
  const cy = useSharedValue(from ? from.y : home.y);
  const scale = useSharedValue((from ? slot.cell * 0.55 : slot.cell) / DIE_BASE);
  const turn = useSharedValue(0);
  const swell = useSharedValue(0);
  /** Degrees added to the die's angle by its RESULT: the sway, the jerk, the critical's rattle. */
  const shake = useSharedValue(0);
  /** The critical's white wash, drawn over the face at rising opacity. */
  const flash = useSharedValue(0);
  const [face, setFace] = useState<number | null>(die.value);
  const live = useRef({ value: die.value, verdict });
  live.current = { value: die.value, verdict };

  useEffect(() => {
    const ms = reduced ? 0 : 280;
    const to = { x: slot.x + slot.cell / 2, y: slot.y + slot.cell / 2 };
    cx.value = withTiming(to.x, { duration: ms, easing: Easing.out(Easing.cubic) });
    cy.value = withTiming(to.y, { duration: ms, easing: Easing.out(Easing.cubic) });
    scale.value = withTiming(slot.cell / DIE_BASE, { duration: ms, easing: Easing.out(Easing.cubic) });
  }, [slot.x, slot.y, slot.cell, cx, cy, scale, reduced]);

  /**
   * The throw, and what the result does when it lands (v0.40.0, owner).
   *
   * The token board has said this with its bodies since v0.34.5 and the tray, which is the screen
   * built for rolling, said nothing. The vocabulary is taken from there unchanged so the two read as
   * the same app: Fear JERKS, short and hard and stopping dead; Hope SWAYS, wide and soft and coming
   * to rest; a critical rattles under a white wash. What is new is the breathing the owner asked for
   * on top (a third bigger for Hope, a sharp fifteenth for Fear) and that an ORDINARY die now earns
   * these too: its maximum is a critical and its one is the Fear treatment, which is decided in
   * `dice-pool` rather than here.
   *
   * Keyed on `roll` alone: the die's VALUE changes in the same commit, and depending on both would
   * start the spin twice for one throw. The new face and verdict are read from a ref when the spin
   * is over.
   */
  useEffect(() => {
    if (roll === 0 || reduced) { setFace(live.current.value); return; }
    setFace(null);
    const spin = setTimeout(() => {
      turn.value = withTiming(turn.value + 1, { duration: SPIN_MS, easing: Easing.inOut(Easing.cubic) });
      swell.value = withTiming(1, { duration: SPIN_MS * 0.45, easing: Easing.out(Easing.cubic) }, (done) => {
        if (done) swell.value = withTiming(0, { duration: SPIN_MS * 0.55, easing: Easing.inOut(Easing.cubic) });
      });
    }, delay);
    const land = setTimeout(() => {
      setFace(live.current.value);
      const v = live.current.verdict;
      if (v === 'plain') return;
      if (v === 'critical') {
        flash.value = withSequence(
          withTiming(1, { duration: 260, easing: Easing.out(Easing.back(2)) }),
          withTiming(0.82, { duration: 420, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 320, easing: Easing.in(Easing.cubic) }),
        );
        swell.value = withSequence(
          withTiming(1.9, { duration: 220, easing: Easing.out(Easing.back(2)) }),
          withTiming(0, { duration: 460, easing: Easing.inOut(Easing.sin) }),
        );
        shake.value = withSequence(
          withTiming(9, { duration: 90, easing: Easing.out(Easing.quad) }),
          withTiming(-7, { duration: 85, easing: Easing.inOut(Easing.sin) }),
          withTiming(5, { duration: 80, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 120, easing: Easing.out(Easing.sin) }),
        );
        return;
      }
      if (v === 'hope') {
        // Hope sways: wide, soft, and it comes to rest rather than stopping. It breathes a third
        // bigger on the way (owner), which is what makes a good result felt and not only read.
        shake.value = withSequence(
          withTiming(7, { duration: 190, easing: Easing.inOut(Easing.sin) }),
          withTiming(-5, { duration: 220, easing: Easing.inOut(Easing.sin) }),
          withTiming(2.5, { duration: 200, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 180, easing: Easing.out(Easing.sin) }),
        );
        swell.value = withSequence(
          withTiming(1.5, { duration: 260, easing: Easing.out(Easing.cubic) }),
          withTiming(0, { duration: 400, easing: Easing.inOut(Easing.sin) }),
        );
        return;
      }
      // Fear jerks: short, hard, and it stops dead. Its breath is a sharp fifteenth, over almost
      // before it began, so the two results never read as the same animation at different speeds.
      shake.value = withSequence(
        withTiming(13, { duration: 60, easing: Easing.out(Easing.quad) }),
        withTiming(-11, { duration: 55, easing: Easing.out(Easing.quad) }),
        withTiming(8, { duration: 50, easing: Easing.out(Easing.quad) }),
        withTiming(-5, { duration: 45, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 40, easing: Easing.linear }),
      );
      swell.value = withSequence(
        withTiming(0.75, { duration: 70, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 150, easing: Easing.out(Easing.quad) }),
      );
    }, delay + SPIN_MS * 0.84);
    return () => { clearTimeout(spin); clearTimeout(land); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roll]);

  useEffect(() => () => { cancelAnimation(cx); cancelAnimation(cy); cancelAnimation(scale); cancelAnimation(turn); cancelAnimation(swell); cancelAnimation(shake); cancelAnimation(flash); }, [cx, cy, scale, turn, swell, shake, flash]);

  // The box's own centre sits at the panel's origin, so translating by the slot centre puts it there
  // and the scale and the turn happen about the die itself. `swell` is a fraction of the die's size:
  // 1 is the spin's own 20%, so Hope's 1.5 is 30% and Fear's 0.75 is 15% (owner).
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: cx.value },
      { translateY: cy.value },
      { scale: scale.value * (1 + swell.value * 0.2) },
      { rotate: `${turn.value * 360 + shake.value}deg` },
    ],
  }));
  const washStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.5 }));

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
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: '20%', top: '20%', width: '60%', height: '60%', borderRadius: DIE_BASE, backgroundColor: '#FFFFFF' }, washStyle]} />
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

/**
 * The three panels, and everything they do.
 *
 * Where they are and what colour they are is a parameter, so the character sheet and DM Mode render
 * the same component (v0.40.0, owner: "the DM UI must work exactly the same in its dicerolling
 * mechanics, just its panels are in dark mode instead of light mode").
 */
export function DiceTrayPanels({ layout, dm, hint, handleRef }: {
  layout: TrayLayout;
  dm?: boolean;
  /** The line shown over an empty pool. The sheet mentions traits; DM Mode has none. */
  hint: string;
  handleRef?: { current: DiceTrayHandle | null };
}) {
  const reduced = useReducedMotion();
  const { carousel: CAROUSEL, pool: POOL, row: ROW } = layout;
  const gold = dm ? DmRune.line : Rune.goldEdge;
  const label = dm ? DmRune.muted : Rune.bronze;
  const totalInk = dm ? DmRune.ivory : Rune.inkText;
  const totalHope = dm ? DmRune.accent : Rune.bronze;
  const totalFear = dm ? '#B48CE0' : '#5B2E86';
  const panelFill = dm ? 'rgba(14,17,22,0.92)' : undefined;

  const [pool, setPool] = useState<PoolDie[]>([]);
  const [roll, setRoll] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [modifier, setModifier] = useState<{ label: string; value: number } | null>(null);
  const [verdict, setVerdict] = useState<Duality>(null);
  const [centreLabel, setCentreLabel] = useState<DieType>(TRAY_DICE[Math.floor(TRAY_DICE.length / 2)]);
  /** Dice that have not been laid out yet, so each flies in from the carousel exactly once. */
  const entering = useRef(new Set<string>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = useCallback(() => { for (const t of timers.current) clearTimeout(t); timers.current = []; }, []);
  useEffect(() => () => clearTimers(), [clearTimers]);
  const rollingRef = useRef(false);
  rollingRef.current = rolling;

  // --- the carousel ------------------------------------------------------------------------------
  /** Where the carousel is, as a fractional index. A whole number is a die in the middle. */
  const pos = useSharedValue(Math.floor(TRAY_DICE.length / 2));
  const from = useSharedValue(0);
  /**
   * 1 once this touch has become a DRAG (v0.40.0).
   *
   * A swipe that ends over a die was adding one. On a phone the pan claims the touch and the die's
   * Pressable never fires, but on the web a mouse-down and mouse-up on the same element is a DOM
   * click whatever the gesture handler did with it, so the release at the middle of the carousel read
   * as a tap on whatever had just glided under it. Cleared when the next touch begins, so it is still
   * set when that stray click arrives.
   */
  const dragged = useSharedValue(0);
  const last = TRAY_DICE.length - 1;
  const clampIdx = useCallback((v: number) => Math.max(0, Math.min(last, Math.round(v))), [last]);
  const settleIdx = useCallback((to: number) => { pos.value = withSpring(to, CAROUSEL_SPRING); }, [pos]);
  // The same watchdog the card carousel uses: a tap that lands while the row is still gliding used to
  // leave it parked between two dice (owner, v0.40.0). See `hooks/use-detent`.
  const { arm: armDetent } = useDetentGuard(pos, clampIdx, settleIdx);
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
        .onBegin(() => { cancelAnimation(pos); from.value = pos.value; dragged.value = 0; })
        .onUpdate((e) => {
          if (Math.abs(e.translationX) > DRAG_SLOP) dragged.value = 1;
          pos.value = Math.max(-0.4, Math.min(last + 0.4, from.value - e.translationX / STRIDE));
        })
        .onEnd((e) => {
          const v = -e.velocityX / STRIDE;
          const to = Math.max(0, Math.min(last, Math.round(pos.value + v * FLICK_REACH)));
          pos.value = withSpring(to, { ...CAROUSEL_SPRING, velocity: v });
        })
        .onFinalize(() => { runOnJS(armDetent)(); }),
    [pos, from, last, armDetent, dragged],
  );
  // Only fires when the die in the middle actually changes, so the label costs nothing to scroll past.
  useAnimatedReaction(
    () => Math.max(0, Math.min(last, Math.round(pos.value))),
    (i, prev) => { if (i !== prev) runOnJS(setCentreLabel)(TRAY_DICE[i]); },
    [last],
  );

  const add = useCallback((type: DieType) => {
    setPool((p) => {
      const next = addDie(p, type, () => nextId());
      for (const d of next.slice(p.length)) entering.current.add(d.id);
      return next;
    });
    setTotal(null);
    setVerdict(null);
    setModifier(null); // a trait's modifier belongs to the pair it was thrown with, not to a new pool
    playSfx('placeToken', { cents: 140 });
  }, []);

  const tapCarousel = useCallback((index: number) => {
    if (rollingRef.current || dragged.value === 1) return;
    // Not in the middle: bring it there. In the middle: pick it up. The owner's rule, and it is what
    // stops a swipe that happens to end on a die from adding one.
    if (Math.abs(pos.value - index) > CENTRED) {
      pos.value = withSpring(index, CAROUSEL_SPRING);
      playSfx('carouselScroll');
      return;
    }
    add(TRAY_DICE[index]);
  }, [pos, add, dragged]);

  // --- the pool ----------------------------------------------------------------------------------
  const ordered = useMemo(() => sortPool(pool), [pool]);
  const grid = useMemo(() => poolGrid(ordered.length, POOL.w, POOL.h, { gap: 9, max: 106 }), [ordered.length, POOL.w, POOL.h]);
  const verdicts = useMemo(() => dieVerdicts(ordered), [ordered]);
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
    setRolling(true);
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
    /**
     * The tray is inert until the last die has come to rest (v0.40.0, owner).
     *
     * A second throw over the top of the first restarted every die's turn from wherever the
     * interrupted one had got to, so dice finished at whatever angle they happened to be at: numbers
     * upside down and faces on the tilt. The whole tray goes quiet for the length of a throw rather
     * than only the Roll button, because a die added mid-flight would be left out of the total as
     * well, which is the "numeric bugs" half of the same complaint. The extra beat past the settle is
     * the result animations, which are the longest thing in a throw.
     */
    timers.current.push(setTimeout(() => setRolling(false), settle + (reduced ? 0 : 1000)));
  }, [clearTimers, reduced]);

  const clear = useCallback(() => {
    if (rollingRef.current) return;
    clearTimers();
    entering.current.clear();
    setPool([]);
    setTotal(null);
    setModifier(null);
    setVerdict(null);
    playSfx('tokenRemove');
  }, [clearTimers]);

  const remove = useCallback((id: string) => {
    if (rollingRef.current) return;
    // A half of a duality pair takes its partner with it: they are added and removed together.
    setPool((p) => removeDie(p, id));
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
  const localHandle = useRef<DiceTrayHandle | null>(null);
  useImperativeHandle(handleRef ?? localHandle, () => ({
    rollDuality: (l: string, value: number) => {
      if (rollingRef.current) return;
      entering.current.clear();
      const pairId = nextId();
      throwPool(
        [
          { id: nextId(), type: 'd12', value: null, side: 'hope', pairId },
          { id: nextId(), type: 'd12', value: null, side: 'fear', pairId },
        ],
        { label: l, value },
      );
    },
  }), [throwPool]);

  const totalColor = verdict === 'fear' ? totalFear : verdict ? totalHope : totalInk;
  const note = verdict === 'critical' ? 'Critical' : verdict === 'hope' ? 'With Hope' : verdict === 'fear' ? 'With Fear' : modifier ? modifier.label : null;

  return (
    <>
      {/* the carousel */}
      <ChamferFrame left={CAROUSEL.left} top={CAROUSEL.top} width={CAROUSEL.w} height={CAROUSEL.h} chamfer={12} stroke={gold} strokeWidth={1.4} fill={panelFill} />
      <GestureDetector gesture={pan}>
        <View style={[box(CAROUSEL.left, CAROUSEL.top, CAROUSEL.w, CAROUSEL.h), { overflow: 'hidden' }]}>
          {TRAY_DICE.map((t, i) => (
            <CarouselDie key={t} type={t} index={i} pos={pos} onPress={tapCarousel} />
          ))}
          <Text
            pointerEvents="none"
            style={{ position: 'absolute', left: 0, right: 0, bottom: 5, textAlign: 'center', color: label, fontSize: 9, fontFamily: Body.bold, letterSpacing: 1.6, textTransform: 'uppercase' }}>
            {centreLabel === 'duality' ? 'Hope & Fear' : centreLabel}
          </Text>
        </View>
      </GestureDetector>

      {/* the pool */}
      <ChamferFrame left={POOL.left} top={POOL.top} width={POOL.w} height={POOL.h} chamfer={12} stroke={gold} strokeWidth={1.4} fill={panelFill} />
      <View style={[box(POOL.left, POOL.top, POOL.w, POOL.h), { overflow: 'hidden' }]}>
        {ordered.length === 0 ? (
          <Text style={{ position: 'absolute', left: 18, right: 18, top: POOL.h / 2 - 18, textAlign: 'center', color: dm ? DmRune.muted : Rune.inkText, fontSize: 11.5, fontFamily: Body.medium, lineHeight: 17 }}>
            {hint}
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
            verdict={verdicts[d.id] ?? 'plain'}
            reduced={reduced}
            onRemove={remove}
          />
        ))}
      </View>

      {/* Roll, the total, Clear */}
      <View style={[box(ROW.left, ROW.top, ROW.w, ROW.h), { flexDirection: 'row', alignItems: 'center' }]}>
        <TrayButton label="Roll" primary dm={dm} h={ROW.h} disabled={ordered.length === 0 || rolling} onPress={() => throwPool(pool, modifier)} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
          {note ? (
            <Text numberOfLines={1} style={{ color: verdict === 'fear' ? totalFear : label, fontSize: 8.5, fontFamily: Body.bold, letterSpacing: 1.1, textTransform: 'uppercase' }}>
              {note}{modifier ? ` ${modifier.value >= 0 ? '+' : ''}${modifier.value}` : ''}
            </Text>
          ) : null}
          <Text numberOfLines={1} style={{ color: totalColor, fontSize: total == null ? 16 : 25, lineHeight: total == null ? 22 : 29, fontFamily: Display.black, fontVariant: ['tabular-nums'] }}>
            {total ?? '·'}
          </Text>
        </View>
        <TrayButton label="Clear" dm={dm} h={ROW.h} disabled={ordered.length === 0 || rolling} onPress={clear} />
      </View>
    </>
  );
}

/** The sheet's tray: the mirrored panel that opens it, and the three panels fading in over the vitals. */
export function DiceTray({ up, onToggle, handleRef }: { up: boolean; onToggle: () => void; handleRef: { current: DiceTrayHandle | null } }) {
  const reduced = useReducedMotion();
  const fade = useSharedValue(0);
  useEffect(() => {
    fade.value = reduced ? (up ? 1 : 0) : withTiming(up ? 1 : 0, { duration: 240, easing: Easing.out(Easing.cubic) });
  }, [up, fade, reduced]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  return (
    <>
      <DiceTrayTrigger on={up} onPress={onToggle} />
      <Animated.View style={[box(0, 0, SHEET_TRAY.width, SHEET_TRAY.height), fadeStyle]} pointerEvents={up ? 'box-none' : 'none'}>
        <DiceTrayPanels layout={SHEET_TRAY} hint={'Tap a die above to pick it up.\nTap a trait to throw the duality pair with it.'} handleRef={handleRef} />
      </Animated.View>
    </>
  );
}

/** The tray's own button: chamfered, sized for the strip it sits in, in whichever palette it is. */
function TrayButton({ label, primary, dm, h, disabled, onPress }: { label: string; primary?: boolean; dm?: boolean; h: number; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => { if (disabled) return; playSfx('buttonTap'); onPress(); }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={label}
      style={({ pressed }) => ({ width: 96, height: h, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 })}>
      <ChamferFrame
        left={0}
        top={0}
        width={96}
        height={h}
        chamfer={8}
        stroke={dm ? DmRune.line : Rune.goldEdge}
        strokeWidth={1.4}
        fill={primary ? (dm ? 'rgba(150,60,56,0.94)' : 'rgba(150,32,32,0.94)') : 'rgba(14,17,22,0.94)'}
      />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
        <Text style={{ color: primary ? (dm ? DmRune.ivory : Rune.sheet) : dm ? DmRune.accent : Rune.goldText, fontSize: 12, fontFamily: Body.bold, letterSpacing: 1.2, textTransform: 'uppercase' }}>{label}</Text>
      </View>
    </Pressable>
  );
}
