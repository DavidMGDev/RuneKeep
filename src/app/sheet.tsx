import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { PopupDialog } from '@/components/popup-dialog';
import { LoadingScreen } from '@/components/loading-screen';
import { RedesignedSheet } from '@/features/character-sheet/sheet/redesigned-sheet';
import { type CharacterFile } from '@/lib/character-file';
import { getCharacter } from '@/lib/character-store';
import { playSfx } from '@/lib/sfx';

/** The play surface. With an id, loads that CharacterFile; without one, the sample character. */
export default function Sheet() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
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
  // v0.22.0: an id that doesn't resolve used to fall through to the SAMPLE character silently, so a
  // player could spend a session editing a demo without knowing. Say so and send them back.
  if (id && !state.file) {
    return (
      <PopupDialog
        title="Character not found"
        body="That character is no longer on this device. It may have been deleted, or the file it lived in was removed."
        confirmLabel="Back to roster"
        cancelLabel="Back to roster"
        onConfirm={() => router.replace('/characters' as Href)}
        onCancel={() => router.replace('/characters' as Href)}
      />
    );
  }
  return <RedesignedSheet characterFile={state.file ?? undefined} />;
}
