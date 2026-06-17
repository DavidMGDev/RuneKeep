import { Pressable, Text, TextInput, View } from 'react-native';

import { Body, Display, Rune } from '@/constants/theme';
import { DividerPlaque, getPlaqueTheme } from '@/features/create/components/card-divider';
import { FORGED_H, FORGED_W, PlaqueLabel } from '@/features/create/components/forged-card';
import { type CompanionState, COMPANION_OPTIONS, RANGES, stepRange } from '@/lib/companion';

import { CompanionIcon } from '../sheet/deck-toggle-icon';

/**
 * The live Ranger Companion card (#311) — a Beastbound ranger's companion sheet AS a card, like the
 * Gold card. Fully interactive: name, Evasion, the Stress track ("companion stress card"), damage die
 * + range, Experiences, and the training options taken at level-up. Edits flow up via `onChange`, so
 * duplicated (linked) copies stay in sync. Mirrors GoldCard's layout language.
 */
const ART_H = Math.round(FORGED_H * 0.26);
const ACCENT = '#7BA05B'; // companion green, flat (no gradient)

function Step({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} disabled={disabled} hitSlop={6} accessibilityRole="button" accessibilityLabel={label === '+' ? 'Increase' : 'Decrease'}>
      <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1.2, borderColor: disabled ? 'rgba(90,68,22,0.3)' : '#5a6e3e', backgroundColor: 'rgba(123,160,91,0.16)', opacity: disabled ? 0.4 : 1 }}>
        <Text style={{ color: '#39481f', fontSize: 14, fontFamily: Display.bold, lineHeight: 16 }}>{label}</Text>
      </View>
    </Pressable>
  );
}

function StatStepper({ label, value, onDelta, min = 0 }: { label: string; value: number; onDelta: (d: number) => void; min?: number }) {
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Text style={{ color: Rune.inkMuted, fontSize: 7, fontFamily: Body.bold, letterSpacing: 0.3, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ color: Rune.inkText, fontSize: 16, fontFamily: Display.black }}>{value}</Text>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <Step label="–" onPress={() => onDelta(-1)} disabled={value <= min} />
        <Step label="+" onPress={() => onDelta(1)} />
      </View>
    </View>
  );
}

/** A tappable button: cycles a value (damage die / range). */
function Cycle({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${label}: ${value}, tap to change`} style={{ alignItems: 'center', gap: 2 }}>
      <Text style={{ color: Rune.inkMuted, fontSize: 7, fontFamily: Body.bold, letterSpacing: 0.3, textTransform: 'uppercase' }}>{label}</Text>
      <View style={{ paddingHorizontal: 8, height: 24, justifyContent: 'center', borderWidth: 1.2, borderColor: '#5a6e3e', backgroundColor: 'rgba(123,160,91,0.16)' }}>
        <Text style={{ color: Rune.inkText, fontSize: 12.5, fontFamily: Display.bold }}>{value}</Text>
      </View>
    </Pressable>
  );
}

export function CompanionCard({ companion, onChange }: { companion: CompanionState; onChange: (c: CompanionState) => void }) {
  const theme = getPlaqueTheme('Ability');
  const set = (patch: Partial<CompanionState>) => onChange({ ...companion, ...patch });
  const setExp = (i: number, patch: Partial<CompanionState['experiences'][number]>) =>
    set({ experiences: companion.experiences.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  // Tap a stress box: tapping a filled box clears down to it; an empty one fills up to it.
  const tapStress = (i: number) => set({ stress: i + 1 <= companion.stress ? i : i + 1 });
  const optionsTaken = COMPANION_OPTIONS.filter((o) => (companion.options[o.key] ?? 0) > 0);

  return (
    <View style={{ width: FORGED_W, height: FORGED_H, backgroundColor: Rune.sheet, overflow: 'hidden' }}>
      <View style={{ height: ART_H, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ transform: [{ scale: 0.9 }] }}><CompanionIcon /></View>
      </View>
      <View style={{ position: 'absolute', top: ART_H - (FORGED_W + 14) / (1978.811 / 151.3009) / 2, left: -7, right: -7, alignItems: 'center' }} pointerEvents="none">
        <DividerPlaque width={FORGED_W + 14} gradientStops={theme.gradientStops} maskFill={theme.solidColor}>
          <PlaqueLabel text="Companion" textColor={theme.textColor} />
        </DividerPlaque>
      </View>
      <View style={{ flex: 1, paddingHorizontal: 12, paddingTop: 16, paddingBottom: 10 }}>
        <TextInput
          value={companion.name}
          onChangeText={(t) => set({ name: t })}
          placeholder="Name your companion"
          placeholderTextColor={Rune.muted}
          selectionColor={ACCENT}
          maxLength={24}
          style={{ color: Rune.inkText, fontSize: 14, fontFamily: Display.bold, letterSpacing: 0.3, textAlign: 'center', padding: 0, marginBottom: 6 }}
          accessibilityLabel="Companion name"
        />
        {/* stats strip */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start', marginBottom: 6 }}>
          <StatStepper label="Evasion" value={companion.evasion} onDelta={(d) => set({ evasion: Math.max(0, companion.evasion + d) })} />
          <Cycle label="Damage" value={`d${companion.damageDie}`} onPress={() => set({ damageDie: companion.damageDie >= 12 ? 6 : companion.damageDie + 2 })} />
          <Cycle label="Range" value={companion.range} onPress={() => set({ range: companion.range === RANGES[RANGES.length - 1] ? RANGES[0] : stepRange(companion.range) })} />
        </View>
        {/* stress track */}
        <Text style={{ color: Rune.inkMuted, fontSize: 7, fontFamily: Body.bold, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 2 }}>Stress</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {Array.from({ length: companion.stressMax }, (_, i) => (
            <Pressable key={i} onPress={() => tapStress(i)} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Stress ${i + 1}`}>
              <View style={{ width: 18, height: 14, borderWidth: 1.3, borderColor: '#9a3b2e', backgroundColor: i < companion.stress ? '#C81B18' : 'transparent' }} />
            </Pressable>
          ))}
        </View>
        {/* experiences */}
        <Text style={{ color: Rune.inkMuted, fontSize: 7, fontFamily: Body.bold, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 2 }}>Experiences</Text>
        {companion.experiences.map((e, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <TextInput value={e.name} onChangeText={(t) => setExp(i, { name: t })} placeholder={`Experience ${i + 1}`} placeholderTextColor={Rune.muted} selectionColor={ACCENT} maxLength={22} style={{ flex: 1, color: Rune.inkText, fontSize: 11, fontFamily: Body.semibold, padding: 0 }} accessibilityLabel={`Experience ${i + 1} name`} />
            <Text style={{ color: Rune.inkText, fontSize: 12, fontFamily: Display.bold, width: 22, textAlign: 'right' }}>{e.bonus >= 0 ? `+${e.bonus}` : e.bonus}</Text>
            <Step label="–" onPress={() => setExp(i, { bonus: e.bonus - 1 })} />
            <Step label="+" onPress={() => setExp(i, { bonus: e.bonus + 1 })} />
          </View>
        ))}
        {/* training options taken (set at level-up) */}
        {optionsTaken.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 'auto' }}>
            {optionsTaken.map((o) => (
              <View key={o.key} style={{ paddingHorizontal: 6, paddingVertical: 2, backgroundColor: 'rgba(123,160,91,0.2)', borderWidth: 1, borderColor: '#5a6e3e' }}>
                <Text style={{ color: '#39481f', fontSize: 8.5, fontFamily: Body.bold }}>{o.label}{(companion.options[o.key] ?? 0) > 1 ? ` ×${companion.options[o.key]}` : ''}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}
