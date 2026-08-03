import { Pressable, ScrollView, Text, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Rune } from '@/constants/theme';
import { tapHaptic } from '@/lib/haptics';
import { playSfx } from '@/lib/sfx';

/**
 * The colour picker (v0.34.3) — one grid, used by the moodboard's background and by a card's art.
 *
 * It exists because "random" was the only way to set either of them, and a random you cannot aim is
 * not a choice: the owner wanted green and got seven greys and a maroon. So the swatches are laid out
 * and tapped, and the dice stay available as a button rather than as the only door.
 *
 * Deliberately a grid and not a hue wheel. A wheel needs a drag, a drag needs a live preview, and the
 * thing being previewed is behind this panel. Forty swatches answer "which colour" in one tap.
 *
 * The app's own furniture, not a system colour dialog: chamfered panel, gold rules, and a ring on the
 * swatch already in use so the current colour is findable rather than remembered.
 */
export function ColorPalette({
  title,
  colors,
  current,
  onPick,
  onRandom,
  onClose,
}: {
  title: string;
  colors: string[];
  /** The colour in use, ringed in the grid. Absent (an image is set instead) simply rings nothing. */
  current?: string | null;
  onPick: (color: string) => void;
  /** Offered as a button when given: the same roll the art gesture does, kept one tap away. */
  onRandom?: () => void;
  onClose: () => void;
}) {
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 10020 }}>
      <Pressable style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,8,13,0.92)' }} onPress={onClose} accessibilityRole="button" accessibilityLabel={`Close ${title.toLowerCase()}`} />
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.goldEdge} strokeWidth={1.5} style={{ width: 310, maxWidth: '92%', paddingHorizontal: 14, paddingVertical: 14 }}>
        <Text style={{ color: Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 }}>{title}</Text>
        <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {colors.map((c) => {
              const on = !!current && c.toLowerCase() === current.toLowerCase();
              return (
                <Pressable
                  key={c}
                  onPress={() => { tapHaptic(); playSfx('cardSelect'); onPick(c); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Colour ${c}`}
                  style={({ pressed }) => ({ width: 45, height: 32, backgroundColor: c, borderWidth: on ? 2 : 1, borderColor: on ? Rune.goldBright : 'rgba(218,162,73,0.35)', opacity: pressed ? 0.6 : 1 })}
                />
              );
            })}
          </View>
        </ScrollView>
        <View style={{ marginTop: 12, gap: 8 }}>
          {onRandom ? <RuneButton label="Surprise me" kind="ghost" dense height={36} onPress={onRandom} muteSfx /> : null}
          <RuneButton label="Done" kind="ghost" height={38} onPress={onClose} />
        </View>
      </ChamferBox>
    </View>
  );
}
