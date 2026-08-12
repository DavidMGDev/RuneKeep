/**
 * Naming a campaign, a session or an encounter (v0.41.4, owner).
 *
 * ONE dialog for all three, because the owner asked for the same interface at creation and at edit,
 * and because three levels that look alike should be authored alike. It offers exactly what the
 * badge can draw: a picture, a colour, or nothing at all, which is the title's initial.
 *
 * The colour uses the app's own picker rather than a row of swatches. That is the owner's
 * instruction ("using the complex color selector UI we already have in the app") and it is also the
 * right call: a DM choosing the colour of a year-long campaign should get the same control a player
 * gets for a card.
 */
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ScrollView } from 'react-native-gesture-handler';

import { ChamferBox } from '@/components/chamfer-box';
import { ColorPalette } from '@/components/color-palette';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, DmRune, DmType } from '@/constants/theme';
import { type DmIdentity, identityInitial } from '@/lib/dm-identity';
import { ownImage } from '@/lib/owned-image';
import { playSfx } from '@/lib/sfx';
import { IdentityBadge } from './dm-identity-ui';
import { DmModal, DmPress } from './dm-ui';

const LABEL = { color: DmRune.muted, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' as const };
const INPUT_FILL = 'rgba(20,24,30,0.9)';

export function IdentityEditor({
  title,
  initial,
  namePlaceholder,
  confirmLabel = 'Save',
  onSave,
  onCancel,
}: {
  title: string;
  initial: DmIdentity;
  namePlaceholder: string;
  confirmLabel?: string;
  onSave: (id: DmIdentity) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<DmIdentity>(initial);
  const [picking, setPicking] = useState(false);

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    // v0.26.0: own the file, or an update clears the cache it came from (see lib/owned-image).
    if (res.canceled || !res.assets[0]) return;
    const owned = (await ownImage(res.assets[0].uri)) ?? undefined;
    setDraft((d) => ({ ...d, imageUri: owned }));
  };

  /**
   * The picker is NOT wrapped in a modal (v0.42.0, owner: "the color picker UI is so broken that the
   * text starts displaying vertically and no background is visible").
   *
   * `ColorPalette` is already a full-screen modal: it draws its own scrim and centres itself with a
   * root that is `position: absolute` on all four insets. Putting that inside `DmModal` puts it inside
   * an unsized positioned ancestor, so it collapsed to zero width and the fixed-width panel inside it
   * wrapped every line to one character. Every other caller in the app renders it directly, and so
   * does this one now.
   */
  if (picking) {
    return (
      <ColorPalette
        title="Pick a colour"
        current={draft.color}
        allowRandom
        onPick={(color) => { setDraft((d) => ({ ...d, color, imageUri: undefined })); setPicking(false); }}
        onClose={() => setPicking(false)}
      />
    );
  }

  return (
    <DmModal onClose={onCancel}>
      <ChamferBox chamfer={14} fill="rgba(12,15,20,0.99)" stroke={DmRune.lineStrong} strokeWidth={1.5} style={{ width: 340, maxHeight: 620, padding: 18 }}>
        <Text style={{ color: DmRune.ivory, fontSize: DmType.title, fontFamily: Display.black, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>{title}</Text>
        {/* The gesture-handler ScrollView, for the reason documented in `adversary-editor`. */}
        <ScrollView showsVerticalScrollIndicator keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ gap: 13, paddingBottom: 14 }}>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            <IdentityBadge id={draft} size={64} />
            <View style={{ flex: 1, gap: 7 }}>
              <RuneButton label={draft.imageUri ? 'Change image' : 'Add image'} kind="secondary" height={36} dense dm onPress={() => void pickImage()} />
              <RuneButton label="Pick a colour" kind="ghost" height={36} dense dm onPress={() => { playSfx('buttonTap'); setPicking(true); }} />
              {draft.imageUri || draft.color ? (
                <DmPress onPress={() => setDraft((d) => ({ ...d, imageUri: undefined, color: undefined }))} hitSlop={6} accessibilityRole="button" accessibilityLabel="Use the initial instead">
                  <Text style={{ color: DmRune.muted, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 0.7, textTransform: 'uppercase' }}>
                    Use the letter {identityInitial(draft.name)}
                  </Text>
                </DmPress>
              ) : null}
            </View>
          </View>

          <View style={{ gap: 4 }}>
            <Text style={LABEL}>Title</Text>
            <ChamferBox chamfer={5} fill={INPUT_FILL} stroke={DmRune.line} strokeWidth={1.1} style={{ height: 44, justifyContent: 'center', paddingHorizontal: 11 }}>
              <TextInput
                value={draft.name}
                onChangeText={(name) => setDraft((d) => ({ ...d, name }))}
                autoFocus={!initial.name}
                placeholder={namePlaceholder}
                placeholderTextColor={DmRune.muted}
                maxLength={48}
                style={{ color: DmRune.text, fontSize: DmType.title, fontFamily: Body.semibold, padding: 0 }}
                accessibilityLabel="Title"
              />
            </ChamferBox>
          </View>

          <View style={{ gap: 4 }}>
            <Text style={LABEL}>Description</Text>
            <ChamferBox chamfer={5} fill={INPUT_FILL} stroke={DmRune.line} strokeWidth={1.1} style={{ minHeight: 66, paddingHorizontal: 11, paddingVertical: 9 }}>
              <TextInput
                value={draft.description ?? ''}
                onChangeText={(description) => setDraft((d) => ({ ...d, description }))}
                placeholder="Optional. What it is, or when it runs."
                placeholderTextColor={DmRune.muted}
                multiline
                maxLength={240}
                style={{ color: DmRune.text, fontSize: DmType.body, fontFamily: Body.regular, textAlignVertical: 'top', minHeight: 48, lineHeight: 18 }}
                accessibilityLabel="Description"
              />
            </ChamferBox>
          </View>
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <RuneButton label="Cancel" kind="ghost" height={44} dm style={{ flex: 1 }} onPress={onCancel} />
          <RuneButton
            label={confirmLabel}
            kind="secondary"
            height={44}
            dm
            style={{ flex: 1 }}
            onPress={() => onSave({ ...draft, name: draft.name.trim() || namePlaceholder, description: (draft.description ?? '').trim() || undefined })}
          />
        </View>
      </ChamferBox>
    </DmModal>
  );
}
