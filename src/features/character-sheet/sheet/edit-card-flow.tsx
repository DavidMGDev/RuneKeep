import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CardEditor, type CardDraft } from '@/components/card-editor';
import { ChamferBox } from '@/components/chamfer-box';
import { HoldToConfirm } from '@/components/hold-to-confirm';
import { Body, Rune } from '@/constants/theme';
import { findEditableCard } from '@/features/cards/card-effects';
import { type CharacterFile } from '@/lib/character-file';

import { typePickerGroups } from '../card-types';

/**
 * Edit an existing player-authored card (#264 item 5). Reuses the one CardEditor, pre-filled with the
 * card's current params (type/ribbon, image-or-colour, title, description, effects) — NO "add from
 * catalog" path (that's create-only). A "hold to delete" button (the damage-panel hold-to-confirm) sits
 * in the fields column. Catalog cards aren't editable, so a missing/non-custom id renders nothing.
 */
export function EditCardFlow({
  file,
  cardId,
  customTypes,
  onSave,
  onDelete,
  onCancel,
}: {
  file: CharacterFile;
  cardId: string;
  customTypes: string[];
  onSave: (id: string, draft: CardDraft) => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
}) {
  const found = findEditableCard(file, cardId);
  if (!found) return null;
  const { card, collection } = found;
  const isExp = collection === 'experiences';
  const initial: CardDraft = {
    title: card.title,
    text: card.text ?? '',
    imageUri: card.imageUri ?? null,
    color: card.color ?? null,
    effects: card.effects ?? [],
    typeLabel: card.typeLabel,
  };
  return (
    <CardEditor
      kindLabel={card.typeLabel ?? 'Card'}
      initial={initial}
      typeGroups={isExp ? undefined : typePickerGroups(customTypes)}
      experienceMode={isExp}
      modifier={card.modifier}
      experiences={file.experiences}
      saveLabel="Save changes"
      scrimless
      extraField={<HoldToConfirm label="Hold to delete card" onConfirm={() => onDelete(cardId)} />}
      onSave={(d) => onSave(cardId, d)}
      onCancel={onCancel}
    />
  );
}

/**
 * Hold-to-confirm delete for a CATALOG card from the fullscreen carousel (#264 item 5). Catalog cards
 * can't be edited, so the fullscreen action is a trash button that opens this; confirmation uses the
 * same hold gesture as the damage panel. The occluding scrim (collapsable={false}) stops gesture-handler
 * from reaching the sheet underneath.
 */
export function DeleteCardConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 10001, alignItems: 'center', justifyContent: 'center' }]}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,8,13,0.6)' }]} collapsable={false} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel" />
      <ChamferBox chamfer={14} fill="rgba(11,14,19,0.98)" stroke={Rune.goldEdge} strokeWidth={1.6} style={{ width: 280, padding: 18, gap: 14 }}>
        <Text style={{ color: Rune.goldText, fontSize: 13, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center' }}>Delete this card?</Text>
        <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.regular, textAlign: 'center', lineHeight: 17 }}>This removes the card from your character. Hold the button to confirm.</Text>
        <HoldToConfirm label="Hold to delete" onConfirm={onConfirm} />
        <Pressable onPress={onCancel} accessibilityRole="button" style={{ alignSelf: 'center', paddingVertical: 6 }}>
          <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.bold, textTransform: 'uppercase' }}>Cancel</Text>
        </Pressable>
      </ChamferBox>
    </View>
  );
}
