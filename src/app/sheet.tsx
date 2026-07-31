import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { PopupDialog } from '@/components/popup-dialog';
import { LoadingScreen } from '@/components/loading-screen';
import { RedesignedSheet } from '@/features/character-sheet/sheet/redesigned-sheet';
import { type CharacterFile } from '@/lib/character-file';
import { getCharacter } from '@/lib/character-store';
import { shouldShow } from '@/lib/onboarding-store';
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

  // v0.23.0: teach the sheet's gestures once there is a character to try them on, rather than on
  // first launch before the player has one.
  // v0.28.0: the "already offered" mark is a REF flipped INSIDE the timer, not state set before it.
  // As state it was also a dependency of this effect, so setting it re-ran the effect, and the first
  // run's cleanup cleared the pending timer before it could ever fire. The tour was scheduled and
  // then cancelled, every time. The creator's tour sets no state, which is why only this one looked
  // broken.
  const tourPushed = useRef(false);
  useEffect(() => {
    if (!state.loaded || !state.file || tourPushed.current) return;
    // The sheet's id has to travel with the return address, or dismissing the tour would come back
    // to a sheet with no character.
    // Deferred for the same reason as the creator's tour: two history entries in one tick collapse
    // in Firefox, and going back then overshoots the screen the tour is about.
    const t = setTimeout(() => {
      tourPushed.current = true; // only once it has actually been offered
      if (shouldShow('sheet')) router.push('/onboarding?tour=sheet' as Href);
    }, 0);
    return () => clearTimeout(t);
  }, [state.loaded, state.file, router]);

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
