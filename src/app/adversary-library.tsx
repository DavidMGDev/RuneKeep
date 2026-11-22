import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

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
  return (
    <View style={{ flex: 1, backgroundColor: DmRune.ink }}>
      <View style={desktop ? { flex: 1, width: '100%', maxWidth: 820, alignSelf: 'center' } : { flex: 1 }}>
        <AdversaryLibrary mode="browse" savedList={list} onDeleteSaved={del} onClose={() => router.back()} />
      </View>
    </View>
  );
}
