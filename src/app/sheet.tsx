import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { PopupDialog } from '@/components/popup-dialog';
import { CoachTour, type CoachStep } from '@/components/coach-tour';
import { useDesktop } from '@/hooks/use-desktop';
import { Rune } from '@/constants/theme';
import { LoadingScreen } from '@/components/loading-screen';
import { RedesignedSheet } from '@/features/character-sheet/sheet/redesigned-sheet';
import { type CharacterFile } from '@/lib/character-file';
import { getCharacter, saveCharacter } from '@/lib/character-store';
import { listExpansions } from '@/lib/library-store';
import { withClassCards } from '@/lib/played-class';
import { shouldShow } from '@/lib/onboarding-store';
import { playSfx } from '@/lib/sfx';

/** The desktop sheet's first-time tips, each pointing at the part it explains. */
const SHEET_TIPS: CoachStep[] = [
  { target: 'sheet-table', title: 'Your table', body: 'Everything right of the sheet is a table. Your hand sits in the tray along the bottom: scroll or drag through it, click a card to bring it to the middle, and click the middle card to take a copy and lay it on the felt. Right click any card for everything else.' },
  { target: 'sheet-decks', title: 'Dice are buttons', body: 'The big die holds your decks: click it to pick one, or press Q and E. Rest, Level up, State, Roll, Cards, Sort and Characters are dice too. Click one to use it, drag to throw it. The gear in the lower left shapes your hand.' },
  { target: 'sheet-vitals', title: 'Hit Points and Stress', body: 'Each row is split down the middle: click one side to clear a box, the other to mark one. Hope and Armor work the same way.' },
  { target: 'sheet-traits', title: 'Traits roll', body: 'Click a trait to throw the Hope and Fear dice with it. The total lands over the table.' },
  { target: 'sheet-portrait', title: 'Your portrait', body: "Click to add or change the picture. The button under it opens this character's moodboard." },
];

/** The play surface. With an id, loads that CharacterFile; without one, the sample character. */
export default function Sheet() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const desktop = !!useDesktop();
  const [state, setState] = useState<{ loaded: boolean; file: CharacterFile | null }>({ loaded: !id, file: null });

  useEffect(() => {
    if (!id) return;
    let live = true;
    /**
     * v0.43.4 (playtest): a homebrew character is made whole from the packs on this device before the
     * sheet sees it. See `withClassCards`. Best effort: a pack that will not load leaves it as it was.
     */
    getCharacter(id)
      .then(async (file) => {
        if (!file) return file;
        const packs = await listExpansions().catch(() => []);
        const whole = withClassCards(file, packs.flatMap((e) => e.cards));
        if (whole !== file) await saveCharacter(whole);
        return whole;
      })
      .then((file) => {
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
    // Desktop teaches with tips on the sheet itself (CoachTour below), not a tour page over it.
    if (!state.loaded || !state.file || tourPushed.current || desktop) return;
    // The sheet's id has to travel with the return address, or dismissing the tour would come back
    // to a sheet with no character.
    // Deferred for the same reason as the creator's tour: two history entries in one tick collapse
    // in Firefox, and going back then overshoots the screen the tour is about.
    const t = setTimeout(() => {
      tourPushed.current = true; // only once it has actually been offered
      if (shouldShow('sheet')) router.push('/onboarding?tour=sheet' as Href);
    }, 0);
    return () => clearTimeout(t);
  }, [state.loaded, state.file, router, desktop]);

  /**
   * Cover the hand-back from the tour (v0.29.0).
   *
   * The sheet is mounted the whole time the tour is over it, so dismissing the tour is a hard cut
   * from a dark full-screen overlay to bright parchment, with a white frame in between on the web
   * while the route swaps. It reads as a flash rather than as arriving somewhere. This holds an ink
   * cover over the sheet for a moment when focus comes back and fades it out, so the brightness
   * arrives instead of hitting. It only ever runs after the tour has actually been offered, so a
   * normal open from the roster is untouched.
   */
  const cover = useSharedValue(0);
  const coverStyle = useAnimatedStyle(() => ({ opacity: cover.value }));
  useFocusEffect(
    useCallback(() => {
      if (!tourPushed.current) return;
      cover.value = 1;
      cover.value = withTiming(0, { duration: 420, easing: Easing.out(Easing.quad) });
    }, [cover]),
  );

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
  return (
    <View style={{ flex: 1 }}>
      <RedesignedSheet characterFile={state.file ?? undefined} />
      {desktop ? <CoachTour id="sheet" steps={SHEET_TIPS} active /> : null}
      {/* Above everything, untouchable, and transparent except for the moment after the tour hands
          back. See `cover` above. */}
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: Rune.ink, zIndex: 100000 }, coverStyle]} />
    </View>
  );
}
