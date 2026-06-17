import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { LoadingScreen } from '@/components/loading-screen';
import { RedesignedSheet } from '@/features/character-sheet/sheet/redesigned-sheet';
import { type CharacterFile } from '@/lib/character-file';
import { getCharacter } from '@/lib/character-store';
import { playSfx } from '@/lib/sfx';

/** The play surface. With an id, loads that CharacterFile; without one, the sample character. */
export default function Sheet() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [state, setState] = useState<{ loaded: boolean; file: CharacterFile | null }>({ loaded: !id, file: null });

  useEffect(() => {
    if (!id) return;
    let live = true;
    getCharacter(id).then((file) => {
      if (live) setState({ loaded: true, file });
    });
    return () => {
      live = false;
    };
  }, [id]);

  useEffect(() => {
    if (state.loaded) playSfx('sheetEnter'); // #255: the sheet is open
  }, [state.loaded]);

  if (!state.loaded) return <LoadingScreen label="Unrolling the sheet" />;
  return <RedesignedSheet characterFile={state.file ?? undefined} />;
}
