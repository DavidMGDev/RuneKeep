import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { DmRune } from '@/constants/theme';
import { useDesktopPage } from '@/hooks/use-desktop';
import { AdversaryLibrary } from '@/features/dm/adversary-library-screen';
import { loadAdversaries, removeTemplates, saveAdversaries, type SavedAdversary } from '@/lib/adversary-library';

/** Standalone browse of the adversary library (reached from the card archive, item 13). */
export default function AdversaryLibraryRoute() {
  const router = useRouter();
  const desktop = useDesktopPage();
  const [list, setList] = useState<SavedAdversary[]>([]);
  useEffect(() => { void loadAdversaries().then(setList); }, []);
  const del = useCallback((ids: Set<string>) => {
    const next = removeTemplates(list, ids);
    setList(next);
    void saveAdversaries(next);
  }, [list]);
  // Desktop (v0.50.5): a page like the others, with the top bar and its title, and the library as the DM screen shows it.
  if (desktop) {
    return (
      <AppScreen dm title="Adversary library" onBack={() => router.back()} desktopMaxWidth={880}>
        <AdversaryLibrary mode="browse" embedded savedList={list} onDeleteSaved={del} onClose={() => router.back()} />
      </AppScreen>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: DmRune.ink }}>
      <AdversaryLibrary mode="browse" savedList={list} onDeleteSaved={del} onClose={() => router.back()} />
    </View>
  );
}
