import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Rune } from '@/constants/theme';
import { ForgedCard } from '@/features/create/forged-card';

export interface CardDraft {
  title: string;
  text: string;
  imageUri: string | null;
}

/**
 * The CARD EDITOR (#107) — the one dialog for authoring a custom card anywhere in the app
 * (creation experiences today; sheet-side card authoring later — import it, pass kindLabel and
 * onSave). Dims everything beneath; live preview in the exact forged-card format (same size,
 * same plaque, same footer as every other RuneKeep card); image, title, body are the player's.
 */
export function CardEditor({
  kindLabel,
  initial,
  onSave,
  onCancel,
}: {
  kindLabel: string;
  initial?: CardDraft;
  onSave: (draft: CardDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<CardDraft>(initial ?? { title: '', text: '', imageUri: null });

  const pickImage = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.85 });
    if (!res.canceled && res.assets[0]) setDraft((d) => ({ ...d, imageUri: res.assets[0].uri }));
  }, []);

  const canSave = draft.title.trim().length > 0;

  return (
    <View style={{ position: 'absolute', top: -80, bottom: -80, left: -60, right: -60, zIndex: 800 }}>
      <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,8,13,0.92)' }} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Discard and close" />
      <ScrollView contentContainerStyle={{ alignItems: 'center', paddingTop: 110, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {/* live preview — the real card, the real size */}
        <ForgedCard title={draft.title.trim() || 'Untitled'} kindLabel={kindLabel} body={draft.text} accentDeep={Rune.panel} imageUri={draft.imageUri} />
        {/* fields */}
        <View style={{ width: 320, marginTop: 16, gap: 9 }}>
          <RuneButton label={draft.imageUri ? 'Change image' : 'Add image'} kind="ghost" height={36} onPress={pickImage} />
          <ChamferBox chamfer={8} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ height: 46, justifyContent: 'center', paddingHorizontal: 13 }}>
            <TextInput
              value={draft.title}
              onChangeText={(title) => setDraft((d) => ({ ...d, title }))}
              placeholder="Title"
              placeholderTextColor={Rune.muted}
              selectionColor={Rune.goldBright}
              maxLength={36}
              style={{ color: Rune.sheet, fontSize: 15, fontFamily: Body.semibold, padding: 0 }}
              accessibilityLabel="Card title"
            />
          </ChamferBox>
          <ChamferBox chamfer={8} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ height: 92, paddingHorizontal: 13, paddingVertical: 9 }}>
            <TextInput
              value={draft.text}
              onChangeText={(text) => setDraft((d) => ({ ...d, text }))}
              placeholder="Describe it — what it means, when it helps."
              placeholderTextColor={Rune.muted}
              selectionColor={Rune.goldBright}
              multiline
              maxLength={280}
              style={{ color: Rune.sheet, fontSize: 13, lineHeight: 18, fontFamily: Body.regular, padding: 0, flex: 1, textAlignVertical: 'top' }}
              accessibilityLabel="Card text"
            />
          </ChamferBox>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <RuneButton label="Cancel" kind="ghost" height={42} style={{ flex: 1 }} onPress={onCancel} />
            <RuneButton label="Save card" kind="primary" height={42} style={{ flex: 1.4 }} disabled={!canSave} onPress={() => onSave({ ...draft, title: draft.title.trim() })} />
          </View>
          <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.medium, textAlign: 'center' }}>Same format as every RuneKeep card.</Text>
        </View>
      </ScrollView>
    </View>
  );
}
