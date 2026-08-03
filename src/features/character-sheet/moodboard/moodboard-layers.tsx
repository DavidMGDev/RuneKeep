import { Image as ExpoImage } from 'expo-image';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import type { MoodboardItem } from '@/lib/moodboard';
import { playSfx } from '@/lib/sfx';

import type { MoodAction } from './moodboard-radial';

const ROW_ACTIONS: { key: MoodAction; label: string }[] = [
  { key: 'centre', label: 'Centre' },
  { key: 'front', label: 'Front' },
  { key: 'back', label: 'Back' },
  { key: 'copy', label: 'Copy' },
  { key: 'delete', label: 'Delete' },
];

/**
 * Every image on the board, as a list (v0.34.0).
 *
 * This exists so nothing can be lost. An image dragged to an edge, buried under three others, or
 * shrunk to a speck is still a row here with a thumbnail on it, and Centre brings it back to the
 * middle and to the front in one tap. The canvas clamps a centre as well, so this is the second of
 * two guarantees rather than the only one.
 *
 * Newest first, which is top of the stack first, so the order on screen and the order in the list
 * agree when you look from above.
 */
export function MoodboardLayers({ items, onAction, onClose }: { items: MoodboardItem[]; onAction: (id: string, a: MoodAction) => void; onClose: () => void }) {
  const top = [...items].reverse();
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,8,13,0.6)' }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close the image list" />
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.5} style={{ width: 320, maxWidth: '92%', paddingHorizontal: 14, paddingVertical: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={{ color: Rune.goldText, fontSize: 17, fontFamily: Display.black, letterSpacing: 0.6, textTransform: 'uppercase' }}>Images</Text>
          <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.medium }}>{items.length} on the board</Text>
        </View>
        {top.length === 0 ? (
          <Text style={{ color: Rune.muted, fontSize: 12.5, fontFamily: Body.regular, lineHeight: 18 }}>
            Nothing here yet. Unlock the board and use the plus to add your first image.
          </Text>
        ) : (
          <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {top.map((it, i) => (
              <ChamferBox key={it.id} chamfer={8} fill="rgba(14,17,22,0.9)" stroke="rgba(218,162,73,0.35)" strokeWidth={1} style={{ padding: 8, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ExpoImage source={{ uri: it.imageUri }} style={{ width: 44, height: 44, borderRadius: 3 }} contentFit="cover" cachePolicy="memory-disk" recyclingKey={`row-${it.id}`} transition={0} />
                  <Text style={{ flex: 1, color: Rune.sheet, fontSize: 12, fontFamily: Body.bold }}>
                    {i === 0 ? 'Top' : i === top.length - 1 ? 'Bottom' : `Layer ${top.length - i}`}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {ROW_ACTIONS.map((a) => (
                    <Pressable
                      key={a.key}
                      onPress={() => { playSfx('buttonTap'); onAction(it.id, a.key); }}
                      accessibilityRole="button"
                      accessibilityLabel={`${a.label} this image`}>
                      <ChamferBox chamfer={5} fill={a.key === 'delete' ? 'rgba(178,86,78,0.18)' : 'rgba(20,24,31,0.8)'} stroke={a.key === 'delete' ? '#E2705A' : 'rgba(218,162,73,0.4)'} strokeWidth={1} style={{ height: 26, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: a.key === 'delete' ? '#E2705A' : Rune.goldText, fontSize: 10.5, fontFamily: Body.bold, textTransform: 'uppercase', letterSpacing: 0.4 }}>{a.label}</Text>
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
    </View>
  );
}
