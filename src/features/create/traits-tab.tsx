import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ArtImage } from '@/components/art-image';
import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { Art } from '@/features/character-sheet/art';
import { formatModifier, TRAIT_ORDER, type TraitKey } from '@/features/character-sheet/character';
import { playSfx } from '@/lib/sfx';
import { TRAIT_POOL } from './create-constants';

/**
 * Trait distribution (#107, rulebook step 3): the pool chips (+2, +1, +1, 0, 0, −1) arm on tap;
 * tapping a trait banner places the armed value (swapping any previous value back to the pool);
 * tapping an assigned banner with nothing armed clears it. The banners are the sheet's own.
 */
export function TraitsTab({ traits, onTraits }: { traits: Partial<Record<TraitKey, number>>; onTraits: (t: Partial<Record<TraitKey, number>>) => void }) {
  const [armed, setArmed] = useState<number | null>(null);

  const assignedValues = TRAIT_ORDER.map((t) => traits[t.key]).filter((v): v is number => v !== undefined);
  const pool: number[] = [...TRAIT_POOL];
  for (const v of assignedValues) {
    const i = pool.indexOf(v);
    if (i >= 0) pool.splice(i, 1);
  }
  const assignedCount = assignedValues.length;

  const placeOn = (key: TraitKey) => {
    // #258r2: creation traits play ONLY the assignment chime (the numpad tap sound belongs to the
    // sheet's trait buttons, not here).
    const next = { ...traits };
    if (armed !== null) {
      next[key] = armed;
      setArmed(null);
      playSfx('cardSelect'); // assigning the armed modifier
    } else if (next[key] !== undefined) {
      delete next[key];
      playSfx('cardDeselect'); // clearing an assignment
    } else {
      return;
    }
    onTraits(next);
  };

  // v0.10.2 (Feature 2): roll the whole spread — shuffle the fixed pool (+2,+1,+1,0,0,−1) onto the traits.
  const randomize = () => {
    const p = [...TRAIT_POOL];
    const next: Partial<Record<TraitKey, number>> = {};
    for (const t of TRAIT_ORDER) next[t.key] = p.splice(Math.floor(Math.random() * p.length), 1)[0];
    setArmed(null);
    playSfx('cardSelect');
    onTraits(next);
  };

  return (
    <View style={{ flex: 1, paddingTop: 8 }}>
      {/* the pool */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, minHeight: 40, alignItems: 'center' }}>
        {pool.length ? (
          pool.map((v, i) => {
            const isArmed = armed === v && pool.indexOf(v) === i; // arm ONE instance of a duplicate
            return (
              <Pressable
                key={`${v}-${i}`}
                onPress={() => { playSfx(isArmed ? 'floatMenuClose' : 'buttonTap'); setArmed(isArmed ? null : v); }}
                accessibilityRole="button"
                accessibilityState={{ selected: isArmed }}
                accessibilityLabel={`Modifier ${formatModifier(v)}${isArmed ? ', armed. Tap a trait to place it' : ''}`}>
                <ChamferBox
                  chamfer={8}
                  fill={isArmed ? Rune.red : 'rgba(14,17,22,0.95)'}
                  stroke={isArmed ? 'transparent' : 'rgba(218,162,73,0.55)'}
                  strokeWidth={1.3}
                  style={{ width: 44, height: 38, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: isArmed ? Rune.ivory : Rune.goldText, fontSize: 16, fontFamily: Display.black }}>{formatModifier(v)}</Text>
                </ChamferBox>
              </Pressable>
            );
          })
        ) : (
          <Text style={{ color: Rune.goldBright, fontSize: 11, fontFamily: Body.bold, letterSpacing: 1.4, textTransform: 'uppercase' }}>All modifiers placed</Text>
        )}
      </View>
      <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.medium, textAlign: 'center', marginTop: 2 }}>
        {armed !== null ? `Tap a trait to place ${formatModifier(armed)}` : pool.length ? 'Tap a modifier, then a trait — tap a trait to clear it' : `${assignedCount}/6 set`}
      </Text>
      <View style={{ alignItems: 'center', marginTop: 6 }}>
        <RuneButton label="Random" kind="ghost" dense height={30} muteSfx onPress={randomize} accessibilityLabel="Random traits" />
      </View>
      {/* the banners — the sheet's own art */}
      <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignContent: 'center', columnGap: 14, rowGap: 6 }}>
        {TRAIT_ORDER.map((t) => {
          const v = traits[t.key];
          return (
            <Pressable
              key={t.key}
              onPress={() => placeOn(t.key)}
              accessibilityRole="button"
              accessibilityLabel={`${t.label}, ${v !== undefined ? formatModifier(v) : 'unassigned'}`}
              style={{ width: 92, height: 150 }}>
              <View style={{ position: 'absolute', left: 6, top: 16, width: 80, height: 128, opacity: v !== undefined ? 1 : 0.55 }}>
                <ArtImage source={Art.traitBanner} fit="fill" />
              </View>
              <View style={{ position: 'absolute', left: 22, top: 0, width: 48, height: 50 }}>
                <ArtImage source={t.icon} fit="contain" />
              </View>
              <Text style={{ position: 'absolute', top: 56, left: 0, right: 0, textAlign: 'center', color: Rune.goldText, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                {t.label.slice(0, 3)}
              </Text>
              <Text
                style={{
                  position: 'absolute',
                  top: 76,
                  left: 0,
                  right: 0,
                  textAlign: 'center',
                  color: v !== undefined ? (v < 0 ? '#E2705A' : Rune.ivory) : 'rgba(147,142,136,0.7)',
                  fontSize: v !== undefined ? 24 : 18,
                  fontFamily: Display.black,
                }}>
                {v !== undefined ? formatModifier(v) : '·'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
