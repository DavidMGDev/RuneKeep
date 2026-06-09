import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Body, Rune } from '@/constants/theme';
import { ACCENT_OPTIONS, useAccentControls } from './accent';

/**
 * TEMPORARY debug control: a swatch bar to recolor the sheet's accent. Pinned to the TOP (the bottom
 * is the gear + card-carousel zone). Lives outside the scaled DesignStage, at the true screen edge.
 */
export function AccentPicker() {
  const { accent, setAccent } = useAccentControls();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingTop: Math.max(insets.top, 8) + 4 }]}>
      <Text style={styles.label}>ACCENT</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}>
        {ACCENT_OPTIONS.map((option) => {
          const selected = option.color === accent;
          return (
            <Pressable
              key={option.color}
              onPress={() => setAccent(option.color)}
              hitSlop={6}
              style={[styles.swatch, { backgroundColor: option.color }, selected && styles.selected]}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingBottom: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(11,14,19,0.82)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(200,146,58,0.4)',
    zIndex: 1000,
  },
  label: {
    color: Rune.muted,
    fontFamily: Body.bold,
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 6,
  },
  row: {
    gap: 12,
    alignItems: 'center',
    paddingRight: 12,
  },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  selected: {
    borderColor: '#FAF8F2',
    transform: [{ scale: 1.18 }],
  },
});
