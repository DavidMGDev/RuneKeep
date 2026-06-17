import * as ImagePicker from 'expo-image-picker';
import { memo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Path, Rect } from 'react-native-svg';

import { Body, Display, Rune } from '@/constants/theme';
import { DividerPlaque, getPlaqueTheme } from '@/features/create/components/card-divider';
import { FORGED_H, FORGED_W, PlaqueLabel } from '@/features/create/components/forged-card';
import { type CompanionState, RANGES, stepRange } from '@/lib/companion';

import { CompanionIcon } from '../sheet/deck-toggle-icon';

/**
 * The Ranger companion (#318) is a CARD CATEGORY: one live card per facet — name+image, Evasion,
 * Damage die, Range, Stress, and one per Experience — themed in the ranger green palette. Each card is
 * LOCKED by default (a padlock; tap to unlock) so an accidental tap while browsing never changes a
 * value. The numbers are meant to grow at LEVEL-UP (the companion training options); unlocking is the
 * manual escape hatch. The Stress card's CURRENT stress is gameplay, so its boxes are always tappable;
 * only the slot count (max) is lock-gated. Companion cards are non-deletable (handled in the sheet).
 */
export type CompanionFacet = 'name' | 'evasion' | 'damage' | 'range' | 'stress' | 'exp';

/** Stable deck-card id for a companion facet (#318). */
export function companionCardId(facet: CompanionFacet, expIndex?: number): string {
  return facet === 'exp' ? `companion-exp-${expIndex ?? 0}` : `companion-${facet}`;
}

const ART_H = Math.round(FORGED_H * 0.26);
// A green gradient across the facets — the ranger palette.
const FACET_GREEN: Record<CompanionFacet, string> = {
  name: '#2b3a1b', evasion: '#374826', damage: '#43562c', range: '#506333', stress: '#5c7039', exp: '#688040',
};
const FACET_LABEL: Record<CompanionFacet, string> = {
  name: 'Companion', evasion: 'Evasion', damage: 'Damage', range: 'Range', stress: 'Stress', exp: 'Experience',
};
const FACET_HINT: Record<CompanionFacet, string> = {
  name: 'Unlock to rename / set image', evasion: 'Unlock to edit · grows at level up', damage: 'Unlock to edit · grows at level up', range: 'Unlock to edit · grows at level up', stress: 'Tap a box to mark · unlock to add slots', exp: 'Unlock to rename · raised at level up',
};
const BORDER = '#5a6e3e';
const INK = '#2c3a1c';

const Padlock = memo(function Padlock({ locked }: { locked: boolean }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Rect x={5} y={11} width={14} height={9} rx={1.6} fill="#16200d" stroke={Rune.goldBright} strokeWidth={1.8} />
      {locked ? <Path d="M8 11 V8 a4 4 0 0 1 8 0 V11" fill="none" stroke={Rune.goldBright} strokeWidth={1.8} /> : <Path d="M8 11 V8 a4 4 0 0 1 7.6 -1.6" fill="none" stroke={Rune.goldBright} strokeWidth={1.8} />}
      <Rect x={11} y={14} width={2} height={3.4} rx={1} fill={Rune.goldBright} />
    </Svg>
  );
});

function Step({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} disabled={disabled} hitSlop={6} accessibilityRole="button" accessibilityLabel={label === '+' ? 'Increase' : 'Decrease'}>
      <View style={{ width: 30, height: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1.4, borderColor: disabled ? 'rgba(90,108,62,0.35)' : BORDER, backgroundColor: 'rgba(123,160,91,0.18)', opacity: disabled ? 0.4 : 1 }}>
        <Text style={{ color: INK, fontSize: 18, fontFamily: Display.bold, lineHeight: 20 }}>{label}</Text>
      </View>
    </Pressable>
  );
}

function PillButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} style={{ paddingHorizontal: 14, height: 30, justifyContent: 'center', borderWidth: 1.2, borderColor: BORDER, backgroundColor: 'rgba(123,160,91,0.18)' }}>
      <Text style={{ color: INK, fontSize: 12, fontFamily: Body.bold, textTransform: 'uppercase' }}>{label}</Text>
    </Pressable>
  );
}

export function CompanionFacetCard({ facet, expIndex = 0, companion, onChange }: { facet: CompanionFacet; expIndex?: number; companion: CompanionState; onChange: (c: CompanionState) => void }) {
  const [locked, setLocked] = useState(true);
  const theme = getPlaqueTheme('Ability');
  const set = (patch: Partial<CompanionState>) => onChange({ ...companion, ...patch });
  const setExp = (patch: Partial<CompanionState['experiences'][number]>) =>
    set({ experiences: companion.experiences.map((e, j) => (j === expIndex ? { ...e, ...patch } : e)) });
  const exp = companion.experiences[expIndex];

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!res.canceled && res.assets[0]) set({ imageUri: res.assets[0].uri });
  };

  return (
    <View style={{ width: FORGED_W, height: FORGED_H, backgroundColor: Rune.sheet, overflow: 'hidden' }}>
      {/* art band (green) + the lock toggle = the "edit" affordance */}
      <View style={{ height: ART_H, backgroundColor: FACET_GREEN[facet], alignItems: 'center', justifyContent: 'center' }}>
        {facet === 'name' && companion.imageUri ? (
          <Image source={{ uri: companion.imageUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <View style={{ transform: [{ scale: 0.85 }] }}><CompanionIcon /></View>
        )}
        <Pressable onPress={() => setLocked((l) => !l)} hitSlop={8} accessibilityRole="button" accessibilityState={{ checked: !locked }} accessibilityLabel={locked ? 'Unlock to edit this card' : 'Lock this card'} style={{ position: 'absolute', top: 6, right: 6, width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: 'rgba(11,14,19,0.55)' }}>
          <Padlock locked={locked} />
        </Pressable>
      </View>
      {/* plaque */}
      <View style={{ position: 'absolute', top: ART_H - (FORGED_W + 14) / (1978.811 / 151.3009) / 2, left: -7, right: -7, alignItems: 'center' }} pointerEvents="none">
        <DividerPlaque width={FORGED_W + 14} gradientStops={theme.gradientStops} maskFill={theme.solidColor}>
          <PlaqueLabel text={FACET_LABEL[facet]} textColor={theme.textColor} />
        </DividerPlaque>
      </View>
      {/* content */}
      <View style={{ flex: 1, paddingHorizontal: 14, paddingTop: 18, paddingBottom: 12, alignItems: 'center' }}>
        {facet === 'name' ? (
          locked ? (
            <Text numberOfLines={2} style={{ color: Rune.inkText, fontSize: 17, fontFamily: Display.bold, textAlign: 'center', marginTop: 8 }}>{companion.name || 'Unnamed'}</Text>
          ) : (
            <>
              <TextInput value={companion.name} onChangeText={(t) => set({ name: t })} placeholder="Name your companion" placeholderTextColor={Rune.muted} maxLength={24} style={{ color: Rune.inkText, fontSize: 16, fontFamily: Display.bold, textAlign: 'center', padding: 0, alignSelf: 'stretch' }} accessibilityLabel="Companion name" />
              <View style={{ marginTop: 12 }}><PillButton label={companion.imageUri ? 'Change image' : 'Add image'} onPress={pickImage} /></View>
            </>
          )
        ) : facet === 'evasion' ? (
          <>
            <Text style={{ color: Rune.inkText, fontSize: 40, fontFamily: Display.black, marginTop: 6 }}>{companion.evasion}</Text>
            {!locked ? <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}><Step label="–" onPress={() => set({ evasion: Math.max(0, companion.evasion - 1) })} /><Step label="+" onPress={() => set({ evasion: companion.evasion + 1 })} /></View> : null}
          </>
        ) : facet === 'damage' ? (
          <>
            <Text style={{ color: Rune.inkText, fontSize: 38, fontFamily: Display.black, marginTop: 8 }}>d{companion.damageDie}</Text>
            {!locked ? <View style={{ marginTop: 10 }}><PillButton label="Next die" onPress={() => set({ damageDie: companion.damageDie >= 12 ? 6 : companion.damageDie + 2 })} /></View> : null}
          </>
        ) : facet === 'range' ? (
          <>
            <Text style={{ color: Rune.inkText, fontSize: 22, fontFamily: Display.black, marginTop: 14, textAlign: 'center' }}>{companion.range}</Text>
            {!locked ? <View style={{ marginTop: 12 }}><PillButton label="Next range" onPress={() => set({ range: companion.range === RANGES[RANGES.length - 1] ? RANGES[0] : stepRange(companion.range) })} /></View> : null}
          </>
        ) : facet === 'stress' ? (
          <>
            {/* current stress = gameplay → always tappable; the slot count is lock-gated */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center', marginTop: 8 }}>
              {Array.from({ length: companion.stressMax }, (_, i) => (
                <Pressable key={i} onPress={() => set({ stress: i + 1 <= companion.stress ? i : i + 1 })} hitSlop={3} accessibilityRole="button" accessibilityLabel={`Stress ${i + 1}`}>
                  <View style={{ width: 22, height: 18, borderWidth: 1.4, borderColor: '#9a3b2e', backgroundColor: i < companion.stress ? '#C81B18' : 'transparent' }} />
                </Pressable>
              ))}
            </View>
            <Text style={{ color: Rune.inkMuted, fontSize: 10, fontFamily: Body.medium, marginTop: 8 }}>{companion.stress}/{companion.stressMax} marked</Text>
            {!locked ? (
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, alignItems: 'center' }}>
                <Text style={{ color: Rune.inkMuted, fontSize: 9, fontFamily: Body.bold, textTransform: 'uppercase' }}>Slots</Text>
                <Step label="–" onPress={() => set({ stressMax: Math.max(1, companion.stressMax - 1), stress: Math.min(companion.stress, Math.max(1, companion.stressMax - 1)) })} />
                <Step label="+" onPress={() => set({ stressMax: companion.stressMax + 1 })} />
              </View>
            ) : null}
          </>
        ) : (
          <>
            {locked ? (
              <Text numberOfLines={2} style={{ color: Rune.inkText, fontSize: 14, fontFamily: Body.bold, textAlign: 'center', marginTop: 6 }}>{exp?.name || `Experience ${expIndex + 1}`}</Text>
            ) : (
              <TextInput value={exp?.name ?? ''} onChangeText={(t) => setExp({ name: t })} placeholder={`Experience ${expIndex + 1}`} placeholderTextColor={Rune.muted} maxLength={24} style={{ color: Rune.inkText, fontSize: 13, fontFamily: Body.bold, textAlign: 'center', padding: 0, alignSelf: 'stretch' }} accessibilityLabel="Experience name" />
            )}
            <Text style={{ color: Rune.inkText, fontSize: 30, fontFamily: Display.black, marginTop: 8 }}>{(exp?.bonus ?? 0) >= 0 ? `+${exp?.bonus ?? 0}` : `${exp?.bonus}`}</Text>
            {!locked ? <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}><Step label="–" onPress={() => setExp({ bonus: (exp?.bonus ?? 0) - 1 })} /><Step label="+" onPress={() => setExp({ bonus: (exp?.bonus ?? 0) + 1 })} /></View> : null}
          </>
        )}
        <Text style={{ color: Rune.inkMuted, fontSize: 8.5, fontFamily: Body.medium, textAlign: 'center', marginTop: 'auto' }}>{FACET_HINT[facet]}</Text>
      </View>
    </View>
  );
}
