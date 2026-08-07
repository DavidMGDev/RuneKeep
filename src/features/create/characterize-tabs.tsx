/**
 * The two characterize-only steps that are not carousels (v0.36, owner).
 *
 * Both are deliberately their own file rather than a mode inside the existing tabs. `TraitsTab` is a
 * POOL: six fixed modifiers, armed and placed, one each. An adversary has no pool, so sharing that
 * component would have meant a second set of rules threaded through every branch of it, for a screen
 * only the DM ever sees.
 */
import { useCallback, useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ArtImage } from '@/components/art-image';
import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { Art } from '@/features/character-sheet/art';
import { formatModifier, TRAIT_ORDER, type TraitKey } from '@/features/character-sheet/character';
import { clampLevel, LEVEL_MAX, LEVEL_MIN } from '@/lib/characterize';
import { playSfx } from '@/lib/sfx';
import { TRAIT_POOL } from './create-constants';

/**
 * HOLD to lower (v0.36.2, owner: "double-tap to lower the values of traits is ass").
 *
 * A double tap is invisible, easy to miss and easy to fire by accident, and there is no way to hold
 * one down. A hold is none of those: it announces itself after a beat, and keeping it down keeps
 * counting, one a second, so getting from +3 to -2 is one gesture rather than ten taps.
 */
const HOLD_MS = 380;
const REPEAT_MS = 1000;
/** How far a characterized trait may be pushed. Wide, because a stat block is not a starting hero. */
const TRAIT_MIN = -5;
const TRAIT_MAX = 12;

/**
 * Traits for a characterized adversary: a counter per trait, not a pool.
 *
 * Everything starts at zero unless the stat block already carried traits, which is the case when the
 * DM is characterizing something that was characterized before. Tap raises by one, a double tap
 * lowers by one, and Reset puts every trait back to what was inherited rather than to zero, because
 * Reset should mean undo.
 */
export function CharacterizeTraitsTab({
  traits,
  initial,
  onTraits,
  footer,
}: {
  traits: Partial<Record<TraitKey, number>>;
  /** What Reset restores: the inherited traits, or all zeroes. */
  initial: Partial<Record<TraitKey, number>>;
  onTraits: (t: Partial<Record<TraitKey, number>>) => void;
  footer?: React.ReactNode;
}) {
  /** The live hold: its timers, and whether it has already lowered anything (so the release is not
   *  also read as a tap). */
  const hold = useRef<{ start: ReturnType<typeof setTimeout> | null; repeat: ReturnType<typeof setInterval> | null; fired: boolean }>({ start: null, repeat: null, fired: false });
  const stopHold = useCallback(() => {
    if (hold.current.start) clearTimeout(hold.current.start);
    if (hold.current.repeat) clearInterval(hold.current.repeat);
    hold.current.start = null;
    hold.current.repeat = null;
  }, []);
  useEffect(() => stopHold, [stopHold]);

  /** Reads the CURRENT traits through a ref, so a repeating hold does not step from a stale value. */
  const live = useRef(traits);
  live.current = traits;
  const bump = useCallback(
    (key: TraitKey, by: number) => {
      const cur = live.current[key] ?? 0;
      const next = Math.max(TRAIT_MIN, Math.min(TRAIT_MAX, cur + by));
      if (next === cur) return;
      playSfx(by > 0 ? 'cardSelect' : 'cardDeselect');
      const out = { ...live.current, [key]: next };
      live.current = out;
      onTraits(out);
    },
    [onTraits],
  );

  const startHold = useCallback(
    (key: TraitKey) => {
      stopHold();
      hold.current.fired = false;
      hold.current.start = setTimeout(() => {
        hold.current.fired = true;
        bump(key, -1);
        hold.current.repeat = setInterval(() => bump(key, -1), REPEAT_MS);
      }, HOLD_MS);
    },
    [bump, stopHold],
  );

  /** A release that never became a hold is a TAP, and a tap raises. */
  const endHold = useCallback(
    (key: TraitKey) => {
      const wasHold = hold.current.fired;
      stopHold();
      hold.current.fired = false;
      if (!wasHold) bump(key, 1);
    },
    [bump, stopHold],
  );

  const randomize = useCallback(() => {
    const p = [...TRAIT_POOL];
    const next: Partial<Record<TraitKey, number>> = {};
    for (const t of TRAIT_ORDER) next[t.key] = p.splice(Math.floor(Math.random() * p.length), 1)[0];
    playSfx('cardSelect');
    onTraits(next);
  }, [onTraits]);

  const reset = useCallback(() => {
    playSfx('cardDeselect');
    onTraits({ ...initial });
  }, [initial, onTraits]);

  return (
    <View style={{ flex: 1, paddingTop: 8 }}>
      <Text style={{ color: Rune.muted, fontSize: 10.5, fontFamily: Body.medium, textAlign: 'center', lineHeight: 15 }}>
        Tap a trait to raise it. Hold to lower it, and keep holding to keep going.
      </Text>
      <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignContent: 'center', columnGap: 14, rowGap: 6 }}>
        {TRAIT_ORDER.map((t) => {
          const v = traits[t.key] ?? 0;
          return (
            <Pressable
              key={t.key}
              onPressIn={() => startHold(t.key)}
              onPressOut={() => endHold(t.key)}
              accessibilityRole="adjustable"
              accessibilityLabel={`${t.label}, ${formatModifier(v)}. Tap to raise, hold to lower.`}
              style={{ width: 92, height: 150 }}>
              <View style={{ position: 'absolute', left: 6, top: 16, width: 80, height: 128, opacity: v !== 0 ? 1 : 0.55 }}>
                <ArtImage source={Art.traitBanner} fit="fill" />
              </View>
              <View style={{ position: 'absolute', left: 22, top: 0, width: 48, height: 50 }}>
                <ArtImage source={t.icon} fit="contain" />
              </View>
              <Text style={{ position: 'absolute', top: 56, left: 0, right: 0, textAlign: 'center', color: Rune.goldText, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                {t.label.slice(0, 3)}
              </Text>
              <Text style={{ position: 'absolute', top: 76, left: 0, right: 0, textAlign: 'center', color: v < 0 ? '#E2705A' : Rune.ivory, fontSize: 24, fontFamily: Display.black }}>
                {formatModifier(v)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <RuneButton label="Random" kind="ghost" dense height={30} muteSfx onPress={randomize} accessibilityLabel="Random traits" />
        <RuneButton label="Reset" kind="ghost" dense height={30} muteSfx onPress={reset} accessibilityLabel="Reset traits" />
        {footer}
      </View>
    </View>
  );
}

/**
 * The Level step: a stepper, a Random and a Reset.
 *
 * The level arrives already worked out from the stat block's tier and difficulty (see
 * `levelForStatBlock`), so the common case needs no thought at all and Reset means "put back what
 * the stat block implied". A level brings only what a level brings on its own here: Proficiency and
 * the per-level damage threshold bonuses. No advancements, because those are choices and the DM has
 * not made them.
 */
export function LevelTab({ level, derived, onLevel, footer }: { level: number; derived: number; onLevel: (n: number) => void; footer?: React.ReactNode }) {
  const step = (by: number) => {
    const next = clampLevel(level + by);
    if (next === level) return;
    playSfx(by > 0 ? 'cardSelect' : 'cardDeselect');
    onLevel(next);
  };
  const Nudge = ({ label, by }: { label: string; by: number }) => (
    <Pressable
      onPress={() => step(by)}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={by > 0 ? 'Raise level' : 'Lower level'}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      <ChamferBox chamfer={8} fill="rgba(14,17,22,0.95)" stroke="rgba(218,162,73,0.55)" strokeWidth={1.3} style={{ width: 54, height: 54, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: Rune.goldText, fontSize: 26, fontFamily: Display.black }}>{label}</Text>
      </ChamferBox>
    </Pressable>
  );
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingBottom: 20 }}>
      <Text style={{ color: Rune.muted, fontSize: 10.5, fontFamily: Body.medium, textAlign: 'center', lineHeight: 16, maxWidth: 280 }}>
        Worked out from the tier and difficulty. It brings Proficiency and the damage threshold bonuses, nothing else: no
        trait increases, no subclass card and no domain cards.
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
        <Nudge label="−" by={-1} />
        <View style={{ alignItems: 'center', minWidth: 92 }}>
          <Text style={{ color: Rune.goldBright, fontSize: 11, fontFamily: Body.bold, letterSpacing: 1.6, textTransform: 'uppercase' }}>Level</Text>
          <Text style={{ color: Rune.ivory, fontSize: 58, lineHeight: 66, fontFamily: Display.black }}>{level}</Text>
        </View>
        <Nudge label="+" by={1} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <RuneButton
          label="Random"
          kind="ghost"
          dense
          height={30}
          muteSfx
          onPress={() => { playSfx('cardSelect'); onLevel(LEVEL_MIN + Math.floor(Math.random() * (LEVEL_MAX - LEVEL_MIN + 1))); }}
          accessibilityLabel="Random level"
        />
        <RuneButton label="Reset" kind="ghost" dense height={30} muteSfx onPress={() => { playSfx('cardDeselect'); onLevel(derived); }} accessibilityLabel={`Reset to level ${derived}`} />
        {footer}
      </View>
    </View>
  );
}
