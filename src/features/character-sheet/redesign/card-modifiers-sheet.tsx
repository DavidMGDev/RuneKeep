import { ScrollView, Text, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { effectsForCardId, sourceLabelForCardId } from '@/features/cards/card-effects';
import { type CardEffect, TARGET_LABEL, tierForLevel } from '@/lib/modifiers';
import type { CharacterFile } from '@/lib/character-file';

import type { Character } from '../character';
import { FullScreenPanel } from './full-screen-panel';

/** Resolve an effect's signed amount as it applies to this character right now (tier/dynamic aware). */
function resolvedDelta(e: CardEffect, character: Character, level: number): number {
  if (e.dynamic === 'proficiency') return character.proficiency;
  if (e.dynamic === 'halfAgility') return Math.floor((character.traits.agility ?? 0) / 2);
  if (e.dynamic === 'strengthPlus3') return (character.traits.strength ?? 0) + 3;
  if (e.byTier) return e.byTier[tierForLevel(level) - 1] ?? 0;
  return e.delta ?? 0;
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * Per-card modifier view (#175/#252) — a FULL-SCREEN interface (opaque, SVG-bordered) so it can never
 * be tapped through to the carousel and closes only via the Back/✕ or the Enable/Disable button. Shows
 * exactly what this card applies to the sheet when enabled.
 */
export function CardModifiersSheet({
  cardId,
  file,
  character,
  enabled,
  onToggle,
  onClose,
}: {
  cardId: string;
  file: CharacterFile;
  character: Character;
  enabled: boolean;
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const effects = effectsForCardId(cardId, file);
  const label = sourceLabelForCardId(cardId, file);
  return (
    <FullScreenPanel
      title={label}
      subtitle={enabled ? 'Equipped — applying to your sheet' : 'Not equipped'}
      onClose={onClose}
      footer={<RuneButton label={enabled ? 'Disable card' : 'Enable card'} kind={enabled ? 'ghost' : 'primary'} height={46} onPress={() => { onToggle(cardId); onClose(); }} />}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 6 }}>
        {effects.length === 0 ? (
          <Text style={{ color: Rune.muted, fontSize: 13, fontFamily: Body.regular, lineHeight: 19 }}>
            This card has no stat modifiers. Enabling it just marks it as part of your loadout.
          </Text>
        ) : (
          effects.map((e, i) => {
            const v = resolvedDelta(e, character, character.level);
            return (
              <ChamferBox key={i} chamfer={8} fill="rgba(20,24,31,0.6)" stroke="rgba(218,162,73,0.45)" strokeWidth={1.2} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 13, gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: Rune.sheet, fontSize: 14, fontFamily: Body.bold }}>{TARGET_LABEL[e.target]}</Text>
                  {e.note ? <Text style={{ color: Rune.muted, fontSize: 10.5, fontFamily: Body.regular, marginTop: 1 }}>{e.note}</Text> : null}
                </View>
                <Text style={{ color: v >= 0 ? Rune.goldBright : '#E2705A', fontSize: 22, fontFamily: Display.black }}>{signed(v)}</Text>
              </ChamferBox>
            );
          })
        )}
      </ScrollView>
    </FullScreenPanel>
  );
}
