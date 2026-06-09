import { usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Body, Rune } from '@/constants/theme';

const VARIANTS: { path: string; label: string }[] = [
  { path: '/', label: 'Original' },
  { path: '/revised', label: 'Revised' },
  { path: '/forge', label: 'Forge' },
];

/**
 * TEMPORARY dev control: a collapsible top-left handle to switch between the three sheet layouts
 * (original, revised, from-scratch "forge"). Outside the scaled stage; box-none so it doesn't block.
 */
export function VariantSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const current = VARIANTS.find((v) => v.path === pathname)?.label ?? 'Original';

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 6) + 4 }]} pointerEvents="box-none">
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.handle} hitSlop={8}>
        <Text style={styles.label}>◆ {current}</Text>
        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.panel}>
          {VARIANTS.map((v) => {
            const active = v.label === current;
            return (
              <Pressable
                key={v.path}
                onPress={() => {
                  setOpen(false);
                  router.replace(v.path as never);
                }}
                style={[styles.item, active && styles.itemActive]}>
                <Text style={[styles.itemLabel, active && styles.itemLabelActive]}>{v.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, alignItems: 'flex-start', paddingHorizontal: 10, zIndex: 1000 },
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
  label: { color: Rune.goldText, fontFamily: Body.bold, fontSize: 11, letterSpacing: 1 },
  chevron: { color: Rune.muted, fontSize: 9 },
  panel: {
    marginTop: 6,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(11,14,19,0.92)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(200,146,58,0.4)',
  },
  item: { paddingVertical: 9, paddingHorizontal: 16 },
  itemActive: { backgroundColor: 'rgba(200,146,58,0.18)' },
  itemLabel: { color: Rune.muted, fontFamily: Body.medium, fontSize: 13 },
  itemLabelActive: { color: Rune.ivory, fontFamily: Body.bold },
});
