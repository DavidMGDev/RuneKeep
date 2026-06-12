import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { runOnJS, type SharedValue, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { CARD_DECKS, type CardCategory } from './card-data';
import { ANGLE_STEP, EXPAND_SPRING, FS_SPRING, middleRotation, snapRot } from './carousel-geometry';

/** Three states only (see docs/ui-fix-brief §2): the hand is bundled, fanned, or one card is focused. */
export type ExpandState = 'compact' | 'expanded' | 'fullscreen';

interface CarouselContextValue {
  /** Carousel + gear angle (radians). Drives both the gear spin and the card arc. */
  rotation: SharedValue<number>;
  /** 0 = compact (bundled at the gear) .. 1 = expanded (fanned hand). */
  expandProgress: SharedValue<number>;
  /** 0 = in the carousel .. 1 = focused card flown to full-screen. */
  fullscreenProgress: SharedValue<number>;
  /** Current state (see ExpandState). */
  machineState: SharedValue<ExpandState>;
  /** Which card index is currently flown full-screen (so badges/taps can open a specific card). */
  focusIndex: SharedValue<number>;
  /** Deck-switch sweep (#95 C): 0 = deck in place, 1 = swept down + faded out (mid category swap). */
  deckShift: SharedValue<number>;
  category: CardCategory;
  /** Switch deck; animates the fan re-center to the new deck's middle. */
  setCategory: (c: CardCategory) => void;
  toggleCategory: () => void;
  /** JS actions (call from React handlers). They drive the shared values directly. */
  expand: () => void;
  collapse: () => void;
  openCardAt: (index: number) => void;
  closeFullscreen: () => void;
  /** D4: origin badges open a random Arsenal/abilities card full-screen. */
  openRandomAbility: () => void;
}

const CarouselContext = createContext<CarouselContextValue | null>(null);

export function CarouselProvider({ children }: { children: ReactNode }) {
  const startMiddle = middleRotation(CARD_DECKS.abilities.length);
  const rotation = useSharedValue(startMiddle);
  const expandProgress = useSharedValue(0);
  const fullscreenProgress = useSharedValue(0);
  const machineState = useSharedValue<ExpandState>('compact');
  const focusIndex = useSharedValue(Math.round(startMiddle / ANGLE_STEP));
  const [category, setCategoryState] = useState<CardCategory>('abilities');
  const deckShift = useSharedValue(0);

  // #95 C: the swap itself happens while the hand is INVISIBLE, and the fade-IN waits for the new
  // deck to be committed AND painted. Sequence: fade the old deck out in place (deckShift → 1) →
  // swap the deck + teleport the rotation on the JS thread (nobody can see the jump) → after the
  // commit, hold a short grace so the freshly mounted thumbs get their paint frames (expo-image
  // takes 1-2 frames; the continuity rule, #88) → fade the whole new hand in at once. Without the
  // grace the hand fades back in still showing the OLD images and then flash-swaps mid-fade.
  const switching = useRef(false);
  const applyCategory = useCallback(
    (c: CardCategory) => {
      switching.current = true;
      setCategoryState(c);
      rotation.value = middleRotation(CARD_DECKS[c].length);
    },
    [rotation],
  );

  useEffect(() => {
    if (!switching.current) return;
    switching.current = false;
    const t = setTimeout(() => {
      deckShift.value = withTiming(0, { duration: 200 });
    }, 200);
    return () => clearTimeout(t);
  }, [category, deckShift]);

  const setCategory = useCallback(
    (c: CardCategory) => {
      if (c === category) return;
      deckShift.value = withTiming(1, { duration: 130 }, (finished) => {
        if (finished) runOnJS(applyCategory)(c);
      });
    },
    [category, deckShift, applyCategory],
  );

  const toggleCategory = useCallback(() => {
    setCategory(category === 'abilities' ? 'inventory' : 'abilities');
  }, [category, setCategory]);

  const expand = useCallback(() => {
    machineState.value = 'expanded';
    expandProgress.value = withSpring(1, EXPAND_SPRING);
  }, [machineState, expandProgress]);

  const collapse = useCallback(() => {
    machineState.value = 'compact';
    expandProgress.value = withSpring(0, EXPAND_SPRING);
  }, [machineState, expandProgress]);

  const openCardAt = useCallback(
    (index: number) => {
      const count = CARD_DECKS[category].length;
      rotation.value = snapRot(index * ANGLE_STEP, count); // center the focused card
      focusIndex.value = Math.min(count - 1, Math.max(0, index));
      machineState.value = 'fullscreen';
      expandProgress.value = withSpring(1, EXPAND_SPRING);
      fullscreenProgress.value = withSpring(1, FS_SPRING);
    },
    [category, rotation, focusIndex, machineState, expandProgress, fullscreenProgress],
  );

  const closeFullscreen = useCallback(() => {
    machineState.value = 'expanded';
    fullscreenProgress.value = withSpring(0, FS_SPRING);
  }, [machineState, fullscreenProgress]);

  const openRandomAbility = useCallback(() => {
    const deck = CARD_DECKS.abilities;
    const idx = Math.floor(Math.random() * deck.length);
    setCategoryState('abilities');
    rotation.value = snapRot(idx * ANGLE_STEP, deck.length);
    focusIndex.value = idx;
    machineState.value = 'fullscreen';
    expandProgress.value = withSpring(1, EXPAND_SPRING);
    fullscreenProgress.value = withSpring(1, FS_SPRING);
  }, [rotation, focusIndex, machineState, expandProgress, fullscreenProgress]);

  const value = useMemo<CarouselContextValue>(
    () => ({
      rotation,
      expandProgress,
      fullscreenProgress,
      machineState,
      focusIndex,
      deckShift,
      category,
      setCategory,
      toggleCategory,
      expand,
      collapse,
      openCardAt,
      closeFullscreen,
      openRandomAbility,
    }),
    [rotation, expandProgress, fullscreenProgress, machineState, focusIndex, deckShift, category, setCategory, toggleCategory, expand, collapse, openCardAt, closeFullscreen, openRandomAbility],
  );

  return <CarouselContext.Provider value={value}>{children}</CarouselContext.Provider>;
}

export function useCarousel() {
  const ctx = useContext(CarouselContext);
  if (!ctx) throw new Error('useCarousel must be used within a CarouselProvider');
  return ctx;
}
