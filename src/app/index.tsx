import { StyleSheet, Text, View } from 'react-native';

import { Rune } from '@/constants/theme';

/**
 * Placeholder home. Replaced by the responsive character sheet on its feature branch.
 */
export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.wordmark}>RuneKeep</Text>
      <Text style={styles.tag}>a Daggerheart companion</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Rune.ink,
    gap: 8,
  },
  wordmark: {
    color: Rune.goldBright,
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: 4,
  },
  tag: {
    color: Rune.muted,
    fontSize: 13,
    letterSpacing: 1,
  },
});
