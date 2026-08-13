/**
 * DICE ON A CARD (v0.42.5, owner).
 *
 * "Use the existing dice framework... It must have a checkbox for toggling the same system the
 * character sheet's tally up system that adds up all the results of the rolled dice together and
 * displays them with animations. All dice animations must still be here, it must work very very
 * similar to the dice tray system from the character sheet, just that when its one dice it is small,
 * when it is multiple it displays several."
 *
 * The tray itself is not mounted here, and could not be: it owns a pool, a carousel, a drag, presets
 * and a whole panel. What is shared is the part that matters, the die FACES (`DieButton`,
 * `DieNumber`) and the roll's shape: a spin at a rising rate, the number cross-fading while it spins,
 * a settle, and the total counting up after the last die lands. Same components, same sounds, same
 * timings, so a die on a card and a die in the tray are visibly the same object.
 *
 * What the element HOLDS is `lib/card-dice`, which is pure. This draws the answer and makes the noise.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import { ChamferBox } from '@/components/chamfer-box';
import { Body, Display, Rune } from '@/constants/theme';
import { DieButton, DieNumber } from '@/features/character-sheet/components/card-tokens';
import { type DieType } from '@/features/character-sheet/components/card-tokens-data';
import { diceTotal, dieSides, type RolledDie } from '@/lib/card-dice';
import { playSfx } from '@/lib/sfx';

/** The tray's own timings, so a card's roll and a tray roll are the same gesture. */
const SPIN_MS = 420;
const STAGGER_MS = 88;
const TICK_MS = 52;

/** How big one die draws, by how many are on the card. A single die is a token; nine are a handful. */
const dieSize = (n: number, size: 'small' | 'medium' | 'large'): number => {
  const base = size === 'large' ? 52 : size === 'small' ? 30 : 40;
  if (n <= 1) return base;
  if (n <= 4) return Math.round(base * 0.82);
  if (n <= 9) return Math.round(base * 0.66);
  return Math.round(base * 0.52);
};

/**
 * ONE die, spinning then settling.
 *
 * The number cross-fades through random faces while the die spins, which is the tray's trick: it
 * reads as a die tumbling rather than as a number that changed. `delay` staggers a handful so they
 * land one after another instead of all at once.
 */
const RollingDie = memo(function RollingDie({ type, size, value, rolling, delay, onSettled }: {
  type: DieType;
  size: number;
  value: number | null;
  rolling: boolean;
  delay: number;
  onSettled?: () => void;
}) {
  const spin = useSharedValue(0);
  const swell = useSharedValue(1);
  const reduced = useReducedMotion();
  const [face, setFace] = useState(1);

  useEffect(() => {
    if (!rolling) return;
    if (reduced) { onSettled?.(); return; }
    spin.value = 0;
    swell.value = 1;
    spin.value = withDelay(delay, withTiming(1, { duration: SPIN_MS, easing: Easing.out(Easing.cubic) }, (done) => { if (done && onSettled) runOnJS(onSettled)(); }));
    swell.value = withDelay(delay, withSequence(withTiming(1.16, { duration: SPIN_MS * 0.45 }), withTiming(1, { duration: SPIN_MS * 0.55, easing: Easing.out(Easing.quad) })));
    // The tumbling faces. Cleared the moment the die settles, so nothing keeps ticking off screen.
    const sides = dieSides(type);
    const t = setInterval(() => setFace(1 + Math.floor(Math.random() * sides)), TICK_MS);
    const stop = setTimeout(() => clearInterval(t), delay + SPIN_MS);
    return () => { clearInterval(t); clearTimeout(stop); cancelAnimation(spin); cancelAnimation(swell); };
  }, [rolling, delay, type, reduced, spin, swell, onSettled]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 540}deg` }, { scale: swell.value }],
  }));

  const shown = rolling && !reduced ? face : (value ?? 1);
  return (
    <Animated.View style={[{ width: size, height: size }, style]}>
      <DieButton size={size} dieType={type} value={shown} hideNumber />
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        <DieNumber size={size} dieType={type} value={shown} />
      </View>
    </Animated.View>
  );
});

export function CardDiceControl({ dice, tally, rollMode, size, locked, onRolled }: {
  dice: RolledDie[];
  tally?: boolean;
  rollMode?: 'tap' | 'button';
  size?: 'small' | 'medium' | 'large';
  /** A locked element is read only: the dice are shown and cannot be thrown. */
  locked?: boolean;
  /** Told what came up, for anything that wants to log it. */
  onRolled?: (values: number[]) => void;
}) {
  const [values, setValues] = useState<number[]>([]);
  const [rolling, setRolling] = useState(false);
  const landed = useRef(0);
  /** The per-die sound timers, cleared on unmount so a card put away makes no noise. */
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current = []; }, []);
  const s = size ?? 'medium';
  const px = dieSize(dice.length, s);

  const roll = useCallback(() => {
    if (locked || rolling || !dice.length) return;
    const next = dice.map((d) => 1 + Math.floor(Math.random() * dieSides(d.type)));
    landed.current = 0;
    setValues(next);
    setRolling(true);
    /**
     * The SOUND belongs to the SPIN, not the landing (v0.41.3's finding, kept).
     *
     * And the pitch is a SERIES, not a function of each die: computed across the whole throw so it
     * only ever climbs, which is what makes a handful read as one roll rather than as several. The
     * tray uses `placeToken` with cents for exactly this, so a card's dice sound like the tray's.
     */
    const step = next.length > 1 ? 360 / (next.length - 1) : 0;
    next.forEach((_, i) => {
      timers.current.push(setTimeout(() => playSfx('placeToken', { cents: -120 + i * step }), i * STAGGER_MS));
    });
    onRolled?.(next);
  }, [dice, locked, rolling, onRolled]);

  /** Each die reports in; the last one ends the roll, which is what lets the total appear after them. */
  const settled = useCallback(() => {
    landed.current += 1;
    if (landed.current >= dice.length) setRolling(false);
  }, [dice.length]);

  if (!dice.length) {
    return (
      <Text style={{ color: Rune.inkMuted, fontSize: 10, fontFamily: Body.italic }}>No dice yet</Text>
    );
  }

  const grid = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 5, maxWidth: 240 }}>
      {dice.map((d, i) => (
        <RollingDie key={d.id} type={d.type} size={px} value={values[i] ?? null} rolling={rolling} delay={i * STAGGER_MS} onSettled={settled} />
      ))}
    </View>
  );

  const total = values.length ? diceTotal(values) : null;
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      {/* TAP TO ROLL, or a button under them. The owner's choice, per element. */}
      {rollMode === 'button' ? grid : (
        <Pressable onPress={roll} disabled={locked} accessibilityRole="button" accessibilityLabel={`Roll ${dice.length} dice`}>
          {grid}
        </Pressable>
      )}

      {/* The TALLY, the tray's own: the sum, after the last die has landed. */}
      {tally && total != null && !rolling ? (
        <Text style={{ color: Rune.inkText, fontSize: px * 0.5, lineHeight: px * 0.6, fontFamily: Display.black, fontVariant: ['tabular-nums'] }}>{total}</Text>
      ) : null}

      {rollMode === 'button' ? (
        <Pressable onPress={roll} disabled={locked || rolling} accessibilityRole="button" accessibilityLabel="Roll these dice">
          <ChamferBox chamfer={5} fill="rgba(218,162,73,0.16)" stroke={Rune.goldEdge} strokeWidth={1.2} style={{ minWidth: 76, height: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, opacity: locked ? 0.4 : 1 }}>
            <Text style={{ color: Rune.goldText, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 1 }}>ROLL</Text>
          </ChamferBox>
        </Pressable>
      ) : null}
    </View>
  );
}
