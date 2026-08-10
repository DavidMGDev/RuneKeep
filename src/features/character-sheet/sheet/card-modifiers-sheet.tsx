import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Path, Polyline } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { applyPickedOption, EffectPicker, EffectsField, FormulaVarPicker, matchOption, toEditableEffects } from '@/components/effects-editor';
import { Body, Display, Rune } from '@/constants/theme';
import { effectsForCardId, sourceLabelForCardId , contentIdOf } from '@/features/cards/card-effects';
import { copyRoleOf } from '@/lib/card-copies';

import { groupEffects, groupKey, isGroupOpen, setGroupOpen } from '@/lib/modifier-groups';
import { type CardEffect, TARGET_LABEL, tierForLevel } from '@/lib/modifiers';
import { type CharacterFile, numberInputFor } from '@/lib/character-file';

import type { Character } from '../character';
import { FullScreenPanel } from './full-screen-panel';

/** Resolve an effect's signed amount as it applies to this character right now (tier/dynamic/formula).
 *  v0.32.0: `stress` reads the marked Stress and `input` the number typed on THIS card, so the panel
 *  previews the same figure the engine applies. */
function resolvedDelta(e: CardEffect, character: Character, level: number, numberInput = 0): number {
  if (e.dynamic === 'proficiency') return character.proficiency;
  if (e.dynamic === 'halfAgility') return Math.ceil((character.traits.agility ?? 0) / 2); // rounds up, like the engine (v0.34.5)
  if (e.dynamic === 'strengthPlus3') return (character.traits.strength ?? 0) + 3;
  if (e.dynamic === 'formula' && e.formula) {
    const f = e.formula;
    const base =
      f.variable === 'level' ? level
      : f.variable === 'tier' ? tierForLevel(level)
      : f.variable === 'proficiency' ? character.proficiency
      : f.variable === 'spellcast' ? (character.spellcastTrait ? character.traits[character.spellcastTrait] ?? 0 : 0)
      : f.variable === 'stress' ? character.stress.active
      : f.variable === 'input' ? numberInput
      // v0.41.0: the two roll bonuses are not on the sheet, so this preview shows what the character
      // currently has for them, which `Character` carries alongside the sheet's own numbers.
      : f.variable === 'attackRoll' ? character.attackRoll ?? 0
      : f.variable === 'spellcastRoll' ? character.spellcastRoll ?? 0
      : character.traits[f.variable] ?? 0;
    const div = f.divide && f.divide !== 0 ? f.divide : 1;
    const scaled = (base * (f.multiply ?? 1)) / div;
    return (f.floor ? Math.floor(scaled) : Math.ceil(scaled)) + (f.plus ?? 0); // #325: + flat constant
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
  onCollapseGroups,
  onClose,
}: {
  cardId: string;
  file: CharacterFile;
  character: Character;
  enabled: boolean;
  canEdit?: boolean;
  onToggle: (id: string) => void;
  onSaveEffects?: (id: string, effects: CardEffect[]) => void;
  /** v0.35: remember which of this card's modifier groups are folded shut. */
  onCollapseGroups?: (keys: string[]) => void;
  onClose: () => void;
}) {
  const effects = effectsForCardId(cardId, file);
  const label = sourceLabelForCardId(cardId, file);
  // v0.32.0: the number this card was given, so an `input` formula previews the figure the engine
  // is really applying rather than a 0 the player has already replaced.
  const numberInput = numberInputFor(file, cardId);
  /** v0.34.8: whether this instance is the original card or one of its mirrors. */
  const mirror = copyRoleOf(file, cardId);
  const [editing, setEditing] = useState(false);
  // #325: load the card's effects as EDITABLE shapes (legacy dynamics → formulas) so complex cards like
  // Bare Bones (Strength+3, per-tier thresholds) actually show + change in the editor.
  const [draft, setDraft] = useState<CardEffect[]>(() => toEditableEffects(effects));
  const [pick, setPick] = useState<number | null>(null);
  const [pickVar, setPickVar] = useState<number | null>(null);
  /**
   * v0.35: modifier GROUPS.
   *
   * A player can open and close them, move a modifier between them and delete one (all in the editor
   * below). Creating a group and switching one on or off are the DM's, which is why `EffectsField`
   * here is not in `dm` mode. Which groups are shut lives on the character file, keyed per card, so
   * a folded group is still folded tomorrow.
   */
  const cardRef = contentIdOf(cardId, file);
  const shut = (file.collapsedModifierGroups ?? []).filter((k) => k.startsWith(`${cardRef}|`)).map((k) => k.slice(cardRef.length + 1));
  const setShut = useCallback((names: string[]) => {
    const others = (file.collapsedModifierGroups ?? []).filter((k) => !k.startsWith(`${cardRef}|`));
    onCollapseGroups?.([...others, ...names.map((n) => groupKey(cardRef, n))]);
  }, [file.collapsedModifierGroups, cardRef, onCollapseGroups]);
  const toggleGroup = (name: string) => onCollapseGroups?.(setGroupOpen(file.collapsedModifierGroups, cardRef, name, !isGroupOpen(file.collapsedModifierGroups, cardRef, name)));

  const startEdit = () => { setDraft(toEditableEffects(effectsForCardId(cardId, file))); setEditing(true); };
  const save = () => { onSaveEffects?.(cardId, draft); setEditing(false); };
  // live "= N" preview for the dynamic shapes (formula / per-tier) at the current character.
  const previewFn = (e: CardEffect) => (e.dynamic === 'formula' || e.byTier ? resolvedDelta(e, character, character.level, numberInput) : null);

  return (
    <FullScreenPanel
      title={label}
      subtitle={editing ? 'Editing modifiers' : enabled ? 'Equipped, applying to your sheet' : 'Not equipped'}
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
          <EffectsField effects={draft} onChange={setDraft} onRequestPick={setPick} onRequestPickVar={setPickVar} preview={previewFn} experiences={file.experiences} collapsed={shut} onCollapsedChange={setShut} />
        ) : (
          <>
            {/* v0.34.8 (owner): say which of the copies this is. They share one equip, one token board
                and one set of modifiers, so a player toggling what looks like a spare card needs to
                know the card in the other deck is going with it. */}
            {mirror.role !== 'single' ? (
              <ChamferBox chamfer={8} fill="rgba(160,124,60,0.14)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ paddingVertical: 10, paddingHorizontal: 13, gap: 3 }}>
                <Text style={{ color: Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.7, textTransform: 'uppercase' }}>
                  {mirror.role === 'original' ? 'The original' : 'A copy'}
                </Text>
                <Text style={{ color: Rune.muted, fontSize: 11.5, fontFamily: Body.regular, lineHeight: 16 }}>
                  {`This card is in ${mirror.total} places. They are all the same card, so equipping, editing or marking one does it to every one of them, and the modifier counts once.`}
                </Text>
              </ChamferBox>
            ) : null}
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
              groupEffects(effects).map((band) => {
                const rows = band.rows.map((r) => {
                  const e = r.effect;
                  const v = resolvedDelta(e, character, character.level, numberInput);
                  return (
                    <ChamferBox key={r.index} chamfer={8} fill="rgba(20,24,31,0.6)" stroke="rgba(218,162,73,0.45)" strokeWidth={1.2} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 13, gap: 10, opacity: e.off ? 0.45 : 1 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: Rune.sheet, fontSize: 14, fontFamily: Body.bold }}>{TARGET_LABEL[e.target]}</Text>
                        {e.note ? <Text style={{ color: Rune.muted, fontSize: 10.5, fontFamily: Body.regular, marginTop: 1 }}>{e.note}</Text> : null}
                        {/* v0.35: a modifier a DM has switched off still shows, greyed, so a number
                            that is not being applied is visible rather than simply missing. */}
                        {e.off ? <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.italic, marginTop: 1 }}>Switched off by your DM</Text> : null}
                      </View>
                      <Text style={{ color: e.off ? Rune.muted : v >= 0 ? Rune.goldBright : '#E2705A', fontSize: 22, fontFamily: Display.black }}>{signed(v)}</Text>
                    </ChamferBox>
                  );
                });
                if (band.name === null) return rows;
                const open = isGroupOpen(file.collapsedModifierGroups, cardRef, band.name);
                return (
                  <View key={band.name} style={{ borderWidth: 1, borderColor: 'rgba(218,162,73,0.45)', borderRadius: 7, padding: 7, gap: 8, backgroundColor: 'rgba(14,17,22,0.4)' }}>
                    <Pressable onPress={() => toggleGroup(band.name!)} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${band.name}, ${band.rows.length} modifiers`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Svg width={11} height={11} viewBox="0 0 16 16" style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
                        <Polyline points="5,3 11,8 5,13" fill="none" stroke={Rune.goldText} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                      <Text numberOfLines={1} style={{ flex: 1, color: Rune.goldText, fontSize: 12.5, fontFamily: Body.bold, letterSpacing: 0.4, textTransform: 'uppercase' }}>{band.name}</Text>
                      <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.bold }}>{band.rows.length}</Text>
                    </Pressable>
                    {open ? rows : null}
                  </View>
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
