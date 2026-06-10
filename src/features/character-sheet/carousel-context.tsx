import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { type SharedValue, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { focusHaptic, tapHaptic } from '@/lib/haptics';
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

  const setCategory = useCallback(
    (c: CardCategory) => {
      // Animate the fan re-centering instead of teleporting (brief carousel-feel note).
      rotation.value = withTiming(middleRotation(CARD_DECKS[c].length), { duration: 260 });
      setCategoryState(c);
    },
    [rotation],
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
      focusHaptic();
    },
    [category, rotation, focusIndex, machineState, expandProgress, fullscreenProgress],
  );

  const closeFullscreen = useCallback(() => {
    machineState.value = 'expanded';
    fullscreenProgress.value = withSpring(0, FS_SPRING);
    tapHaptic();
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
    focusHaptic();
  }, [rotation, focusIndex, machineState, expandProgress, fullscreenProgress]);

  const value = useMemo<CarouselContextValue>(
    () => ({
      rotation,
      expandProgress,
      fullscreenProgress,
      machineState,
      focusIndex,
      category,
      setCategory,
      toggleCategory,
      expand,
      collapse,
      openCardAt,
      closeFullscreen,
      openRandomAbility,
    }),
    [rotation, expandProgress, fullscreenProgress, machineState, focusIndex, category, setCategory, toggleCategory, expand, collapse, openCardAt, closeFullscreen, openRandomAbility],
  );

  return <CarouselContext.Provider value={value}>{children}</CarouselContext.Provider>;
}

export function useCarousel() {
  const ctx = useContext(CarouselContext);
  if (!ctx) throw new Error('useCarousel must be used within a CarouselProvider');
  return ctx;
}
