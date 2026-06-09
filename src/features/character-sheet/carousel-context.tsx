import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { type SharedValue, useSharedValue } from 'react-native-reanimated';

import { CARD_DECKS, type CardCategory } from './card-data';
import { middleRotation } from './carousel-geometry';

/** Expand state machine (UI-thread string). compact | held | window (1s countdown) | locked. */
export type ExpandState = 'compact' | 'held' | 'window' | 'locked';

interface CarouselContextValue {
  /** Carousel + gear angle (radians). Drives both the gear spin and the card arc. */
  rotation: SharedValue<number>;
  /** 0 = compact (bundled at the gear) .. 1 = expanded (fanned hand). */
  expandProgress: SharedValue<number>;
  /** 0 = in the carousel .. 1 = center card flown to full-screen. */
  fullscreenProgress: SharedValue<number>;
  /** Current expand state (see ExpandState). */
  machineState: SharedValue<ExpandState>;
  /** True once tapped to lock expanded (stays until tapped again). */
  locked: SharedValue<boolean>;
  /** Bumped on every new gesture; invalidates a pending collapse timer. */
  timerGen: SharedValue<number>;
  category: CardCategory;
  /** Switch deck; resets rotation to the new deck's start. */
  setCategory: (c: CardCategory) => void;
  toggleCategory: () => void;
}

const CarouselContext = createContext<CarouselContextValue | null>(null);

export function CarouselProvider({ children }: { children: ReactNode }) {
  const rotation = useSharedValue(middleRotation(CARD_DECKS.abilities.length));
  const expandProgress = useSharedValue(0);
  const fullscreenProgress = useSharedValue(0);
  const machineState = useSharedValue<ExpandState>('compact');
  const locked = useSharedValue(false);
  const timerGen = useSharedValue(0);
  const [category, setCategoryState] = useState<CardCategory>('abilities');

  const setCategory = useCallback(
    (c: CardCategory) => {
      rotation.value = middleRotation(CARD_DECKS[c].length); // rest on the deck's middle (balanced fan)
      setCategoryState(c);
    },
    [rotation],
  );

  const toggleCategory = useCallback(() => {
    setCategory(category === 'abilities' ? 'inventory' : 'abilities');
  }, [category, setCategory]);

  const value = useMemo<CarouselContextValue>(
    () => ({
      rotation,
      expandProgress,
      fullscreenProgress,
      machineState,
      locked,
      timerGen,
      category,
      setCategory,
      toggleCategory,
    }),
    [rotation, expandProgress, fullscreenProgress, machineState, locked, timerGen, category, setCategory, toggleCategory],
  );

  return <CarouselContext.Provider value={value}>{children}</CarouselContext.Provider>;
}

export function useCarousel() {
  const ctx = useContext(CarouselContext);
  if (!ctx) throw new Error('useCarousel must be used within a CarouselProvider');
  return ctx;
}
