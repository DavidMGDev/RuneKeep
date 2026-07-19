import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { applyPickedOption, EffectPicker, EffectsField, FormulaVarPicker, matchOption, toEditableEffects } from '@/components/effects-editor';
import { Body, Display, Rune } from '@/constants/theme';
import { effectsForCardId, sourceLabelForCardId } from '@/features/cards/card-effects';
import { type CardEffect, TARGET_LABEL, tierForLevel } from '@/lib/modifiers';
import type { CharacterFile } from '@/lib/character-file';

import type { Character } from '../character';
import { FullScreenPanel } from './full-screen-panel';

/** Resolve an effect's signed amount as it applies to this character right now (tier/dynamic/formula). */
function resolvedDelta(e: CardEffect, character: Character, level: number): number {
  if (e.dynamic === 'proficiency') return character.proficiency;
  if (e.dynamic === 'halfAgility') return Math.floor((character.traits.agility ?? 0) / 2);
  if (e.dynamic === 'strengthPlus3') return (character.traits.strength ?? 0) + 3;
  if (e.dynamic === 'formula' && e.formula) {
    const base =
      e.formula.variable === 'level' ? level
      : e.formula.variable === 'tier' ? tierForLevel(level)
      : e.formula.variable === 'proficiency' ? character.proficiency
      : character.traits[e.formula.variable] ?? 0;
    const div = e.formula.divide && e.formula.divide !== 0 ? e.formula.divide : 1;
    return Math.ceil((base * (e.formula.multiply ?? 1)) / div) + (e.formula.plus ?? 0); // #325: + flat constant
  }
  if (e.byTier) return e.byTier[tierForLevel(level) - 1] ?? 0;
  return e.delta ?? 0;
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

function PencilIcon() {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      <Path d="M4 20 L4.5 15.5 L15 5 L19 9 L8.5 19.5 Z" fill="none" stroke={Rune.goldText} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M13 7 L17 11" stroke={Rune.goldText} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * Per-card modifier view (#175/#252/#278) — FULL-SCREEN, opaque. READS the card's effects at a glance
 * (resolved values) and, via the pencil, EDITS them with the same "Effects when enabled" editor as the
 * card dialog (formulas included). Saving routes to the card's own effects (custom) or a per-card
 * override (catalog) so the panel and the card editor stay in sync. Beastform cards aren't editable.
 */
export function CardModifiersSheet({
  cardId,
  file,
  character,
  enabled,
  canEdit = false,
  onToggle,
  onSaveEffects,
  onClose,
}: {
  cardId: string;
  file: CharacterFile;
  character: Character;
  enabled: boolean;
  canEdit?: boolean;
  onToggle: (id: string) => void;
  onSaveEffects?: (id: string, effects: CardEffect[]) => void;
  onClose: () => void;
}) {
  const effects = effectsForCardId(cardId, file);
  const label = sourceLabelForCardId(cardId, file);
  const [editing, setEditing] = useState(false);
  // #325: load the card's effects as EDITABLE shapes (legacy dynamics → formulas) so complex cards like
  // Bare Bones (Strength+3, per-tier thresholds) actually show + change in the editor.
  const [draft, setDraft] = useState<CardEffect[]>(() => toEditableEffects(effects));
  const [pick, setPick] = useState<number | null>(null);
  const [pickVar, setPickVar] = useState<number | null>(null);

  const startEdit = () => { setDraft(toEditableEffects(effectsForCardId(cardId, file))); setEditing(true); };
  const save = () => { onSaveEffects?.(cardId, draft); setEditing(false); };
  // live "= N" preview for the dynamic shapes (formula / per-tier) at the current character.
  const previewFn = (e: CardEffect) => (e.dynamic === 'formula' || e.byTier ? resolvedDelta(e, character, character.level) : null);

  return (
    <FullScreenPanel
      title={label}
      subtitle={editing ? 'Editing modifiers' : enabled ? 'Equipped — applying to your sheet' : 'Not equipped'}
      onClose={onClose}
      footer={
        editing ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <RuneButton label="Cancel" kind="ghost" height={46} style={{ flex: 1 }} onPress={() => setEditing(false)} />
            <RuneButton label="Save modifiers" kind="primary" height={46} style={{ flex: 1.4 }} onPress={save} />
          </View>
        ) : (
          <RuneButton label={enabled ? 'Disable card' : 'Enable card'} kind={enabled ? 'ghost' : 'primary'} height={46} onPress={() => { onToggle(cardId); onClose(); }} />
        )
      }>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 6 }}>
        {editing ? (
          <EffectsField effects={draft} onChange={setDraft} onRequestPick={setPick} onRequestPickVar={setPickVar} preview={previewFn} experiences={file.experiences} />
        ) : (
          <>
            {canEdit && onSaveEffects ? (
              <Pressable onPress={startEdit} accessibilityRole="button" accessibilityLabel="Edit modifiers" style={{ alignSelf: 'flex-end' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6, borderWidth: 1, borderColor: Rune.goldEdge, backgroundColor: 'rgba(20,24,31,0.6)' }}>
                  <PencilIcon />
                  <Text style={{ color: Rune.goldText, fontSize: 12, fontFamily: Body.bold, letterSpacing: 0.4, textTransform: 'uppercase' }}>Edit modifiers</Text>
                </View>
              </Pressable>
            ) : null}
            {effects.length === 0 ? (
              <Text style={{ color: Rune.muted, fontSize: 13, fontFamily: Body.regular, lineHeight: 19 }}>
                This card has no stat modifiers. {canEdit ? 'Tap Edit modifiers to add one.' : 'Enabling it just marks it as part of your loadout.'}
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
          </>
        )}
      </ScrollView>
      {pick != null && draft[pick] ? (
        <EffectPicker
          current={matchOption(draft[pick], file.experiences)}
          experiences={file.experiences}
          onPick={(o) => {
            setDraft((d) => d.map((e, j) => (j === pick ? applyPickedOption(e, o) : e)));
            setPick(null);
          }}
          onClose={() => setPick(null)}
        />
      ) : null}
      {pickVar != null && draft[pickVar] ? (
        <FormulaVarPicker
          current={draft[pickVar].formula?.variable}
          onPick={(variable) => {
            setDraft((d) => d.map((e, j) => (j === pickVar ? { ...e, formula: { ...(e.formula ?? { variable }), variable } } : e)));
            setPickVar(null);
          }}
          onClose={() => setPickVar(null)}
        />
      ) : null}
    </FullScreenPanel>
  );
}
