import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Body, Rune } from '@/constants/theme';
import { ACCENT_OPTIONS, useAccentControls } from './accent';

/**
 * TEMPORARY debug control: a collapsible swatch panel to recolor the sheet's accent. Sits top-right
 * as a small handle (showing the current color) that expands to the swatch row, so it stays out of
 * the way. Outside the scaled DesignStage; `box-none` so the collapsed handle doesn't block the sheet.
 */
export function AccentPicker() {
  const { accent, setAccent } = useAccentControls();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 6) + 4 }]} pointerEvents="box-none">
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.handle} hitSlop={8}>
        <View style={[styles.dot, { backgroundColor: accent }]} />
        <Text style={styles.handleLabel}>ACCENT</Text>
        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
      </Pressable>

      {open ? (
        <View style={styles.panel}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
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
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    zIndex: 1000,
  },
  handle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(11,14,19,0.86)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(200,146,58,0.5)',
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  handleLabel: { color: Rune.muted, fontFamily: Body.bold, fontSize: 10, letterSpacing: 1.5 },
  chevron: { color: Rune.muted, fontSize: 9 },
  panel: {
    marginTop: 6,
    maxWidth: 320,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(11,14,19,0.92)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(200,146,58,0.4)',
  },
  row: { gap: 12, alignItems: 'center', paddingRight: 4 },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  selected: { borderColor: '#FAF8F2', transform: [{ scale: 1.18 }] },
});
