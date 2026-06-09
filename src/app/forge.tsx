import { StyleSheet, Text, View } from 'react-native';

import { VariantSwitcher } from '@/components/variant-switcher';
import { Body, Rune } from '@/constants/theme';

// Placeholder until the from-scratch "Forge" layout lands (next PR).
export default function Forge() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Forge layout — coming next</Text>
      <VariantSwitcher />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Rune.ink, alignItems: 'center', justifyContent: 'center' },
  text: { color: Rune.muted, fontFamily: Body.medium, fontSize: 14 },
});
