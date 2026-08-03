import { Image as ExpoImage } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { PopupDialog } from '@/components/popup-dialog';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import type { MoodboardItem } from '@/lib/moodboard';
import { playSfx } from '@/lib/sfx';

import type { MoodAction } from './moodboard-radial';

/**
 * One row of buttons, not two (v0.34.1).
 *
 * "Send to back" is gone: with Front and Centre there is nothing it does that a couple of Fronts on
 * the other images does not, and dropping it is what lets the four fit on a single line. Delete was
 * wrapping onto a row of its own, which read like a separate section rather than one of the choices.
 */
const ROW_ACTIONS: { key: MoodAction; label: string }[] = [
  { key: 'centre', label: 'Centre' },
  { key: 'front', label: 'Front' },
  { key: 'copy', label: 'Copy' },
  { key: 'delete', label: 'Delete' },
];

/**
 * Every image on the board, as a list (v0.34.0).
 *
 * This exists so nothing can be lost. An image dragged to an edge, buried under three others, or
 * shrunk to a speck is still a row here with a thumbnail on it, and Centre brings it back to the
 * middle and to the front in one tap.
 *
 * Newest first, which is top of the stack first, so the order on screen and the order in the list
 * agree when you look from above.
 */
export function MoodboardLayers({
  items,
  usePortrait,
  onAction,
  onTogglePortrait,
  onClose,
}: {
  items: MoodboardItem[];
  /** v0.34.1: whether leaving the board also saves it as the character's portrait. */
  usePortrait: boolean;
  onAction: (id: string, a: MoodAction) => void;
  onTogglePortrait: (on: boolean) => void;
  onClose: () => void;
}) {
  const top = [...items].reverse();
  // Deleting from a list of thumbnails is easy to do by accident, and there is no undo (v0.34.1).
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
      {/* Opaque enough to cover the canvas behind it: at 0.6 the empty-state prompt read straight
          through the panel and was unreadable (v0.34.1). */}
      <Pressable style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,8,13,0.92)' }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close the image list" />
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.5} style={{ width: 320, maxWidth: '92%', paddingHorizontal: 14, paddingVertical: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={{ color: Rune.goldText, fontSize: 17, fontFamily: Display.black, letterSpacing: 0.6, textTransform: 'uppercase' }}>Images</Text>
          <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.medium }}>{items.length} on the board</Text>
        </View>

        {/* v0.34.1: the board can BE the portrait. v0.34.2: drawn as the same switch the character
            sheet's category list uses, because as a bordered box with a thumbnail-sized gap it read
            as another image row rather than as a setting. */}
        <Pressable
          onPress={() => { playSfx('buttonTap'); onTogglePortrait(!usePortrait); }}
          accessibilityRole="switch"
          accessibilityState={{ checked: usePortrait }}
          accessibilityLabel="Use this moodboard as the character portrait"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 })}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: usePortrait ? Rune.goldBright : Rune.sheet, fontSize: 13, fontFamily: Body.bold }}>Use as portrait</Text>
            <Text style={{ color: Rune.muted, fontSize: 10.5, fontFamily: Body.regular, lineHeight: 15 }}>
              Leaving the board saves a picture of it over your portrait.
            </Text>
          </View>
          <View style={{ width: 44, height: 26, borderRadius: 13, padding: 3, backgroundColor: usePortrait ? Rune.gold : 'rgba(80,84,92,0.6)', justifyContent: 'center' }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: Rune.ivory, alignSelf: usePortrait ? 'flex-end' : 'flex-start' }} />
          </View>
        </Pressable>

        {top.length === 0 ? (
          <Text style={{ color: Rune.muted, fontSize: 12.5, fontFamily: Body.regular, lineHeight: 18 }}>
            Nothing here yet. Unlock the board and use the plus to add your first image.
          </Text>
        ) : (
          <ScrollView style={{ maxHeight: 330 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {top.map((it, i) => (
              <ChamferBox key={it.id} chamfer={8} fill="rgba(14,17,22,0.9)" stroke="rgba(218,162,73,0.35)" strokeWidth={1} style={{ padding: 8, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ExpoImage source={{ uri: it.imageUri }} style={{ width: 40, height: 40 }} contentFit="contain" cachePolicy="memory-disk" recyclingKey={`row-${it.id}`} transition={0} />
                  <Text style={{ flex: 1, color: Rune.sheet, fontSize: 12, fontFamily: Body.bold }}>
                    {i === 0 ? 'Top' : i === top.length - 1 ? 'Bottom' : `Layer ${top.length - i}`}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 5 }}>
                  {ROW_ACTIONS.map((a) => (
                    <Pressable
                      key={a.key}
                      style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.6 : 1 })}
                      onPress={() => { playSfx('buttonTap'); if (a.key === 'delete') setConfirm(it.id); else onAction(it.id, a.key); }}
                      accessibilityRole="button"
                      accessibilityLabel={`${a.label} this image`}>
                      <ChamferBox chamfer={5} fill={a.key === 'delete' ? 'rgba(178,86,78,0.18)' : 'rgba(20,24,31,0.8)'} stroke={a.key === 'delete' ? '#E2705A' : 'rgba(218,162,73,0.4)'} strokeWidth={1} style={{ height: 26, alignItems: 'center', justifyContent: 'center' }}>
                        <Text numberOfLines={1} style={{ color: a.key === 'delete' ? '#E2705A' : Rune.goldText, fontSize: 10, fontFamily: Body.bold, textTransform: 'uppercase', letterSpacing: 0.3 }}>{a.label}</Text>
                      </ChamferBox>
                    </Pressable>
                  ))}
                </View>
              </ChamferBox>
            ))}
          </ScrollView>
        )}
        <View style={{ marginTop: 12 }}>
          <RuneButton label="Done" kind="primary" height={40} onPress={onClose} />
        </View>
      </ChamferBox>

      {confirm ? (
        <PopupDialog
          title="Remove this image?"
          body="It falls off the board and is not kept anywhere. You can always add it again from your photos."
          confirmLabel="Remove"
          destructive
          onConfirm={() => { const id = confirm; setConfirm(null); onAction(id, 'delete'); }}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </View>
  );
}
