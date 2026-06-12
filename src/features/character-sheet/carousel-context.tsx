import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { runOnJS, type SharedValue, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { CARD_DECKS, type CardCategory, type CardItem } from './card-data';
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
  /** The live decks. Abilities = base deck + the character's origin cards pinned at the RIGHT end
   *  (subclass, ancestry, community — #100). Inventory never shows them. */
  decks: Record<CardCategory, CardItem[]>;
  category: CardCategory;
  /** Switch deck; animates the fan re-center to the new deck's middle. */
  setCategory: (c: CardCategory) => void;
  toggleCategory: () => void;
  /** JS actions (call from React handlers). They drive the shared values directly. */
  expand: () => void;
  collapse: () => void;
  openCardAt: (index: number) => void;
  closeFullscreen: () => void;
  /**
   * Open one of the three pinned origin cards (0 = subclass, 1 = ancestry, 2 = community). If the
   * Inventory deck is up, the category-switch animation plays FIRST and the card opens only once
   * the new hand has faded in (#100 owner spec). No-op when no origin cards are pinned.
   */
  openOriginCard: (slot: 0 | 1 | 2) => void;
}

const CarouselContext = createContext<CarouselContextValue | null>(null);

export function CarouselProvider({ children, originCards, inventoryCards }: { children: ReactNode; originCards?: CardItem[]; inventoryCards?: CardItem[] }) {
  const decks = useMemo<Record<CardCategory, CardItem[]>>(
    () => ({
      abilities: originCards?.length ? [...CARD_DECKS.abilities, ...originCards] : CARD_DECKS.abilities,
      // the character's weapons + armor ride the inventory deck too (#121)
      inventory: inventoryCards?.length ? [...CARD_DECKS.inventory, ...inventoryCards] : CARD_DECKS.inventory,
    }),
    [originCards, inventoryCards],
  );
  const startMiddle = middleRotation(decks.abilities.length);
  const rotation = useSharedValue(startMiddle);
  const expandProgress = useSharedValue(0);
  const fullscreenProgress = useSharedValue(0);
  const machineState = useSharedValue<ExpandState>('compact');
  const focusIndex = useSharedValue(Math.round(startMiddle / ANGLE_STEP));
  const [category, setCategoryState] = useState<CardCategory>('abilities');
  const deckShift = useSharedValue(0);
  const decksRef = useRef(decks);
  decksRef.current = decks;
  const categoryRef = useRef(category);
  categoryRef.current = category;

  const openCardAt = useCallback(
    (index: number) => {
      const count = decksRef.current[categoryRef.current].length;
      rotation.value = snapRot(index * ANGLE_STEP, count); // center the focused card
      focusIndex.value = Math.min(count - 1, Math.max(0, index));
      machineState.value = 'fullscreen';
      expandProgress.value = withSpring(1, EXPAND_SPRING);
      fullscreenProgress.value = withSpring(1, FS_SPRING);
    },
    [rotation, focusIndex, machineState, expandProgress, fullscreenProgress],
  );

  // #95 C: the swap itself happens while the hand is INVISIBLE, and the fade-IN waits for the new
  // deck to be committed AND painted. Sequence: fade the old deck out in place (deckShift → 1) →
  // swap the deck + teleport the rotation on the JS thread (nobody can see the jump) → after the
  // commit, hold a short grace so the freshly mounted thumbs get their paint frames (expo-image
  // takes 1-2 frames; the continuity rule, #88) → fade the whole new hand in at once. Without the
  // grace the hand fades back in still showing the OLD images and then flash-swaps mid-fade.
  // #100: a pending origin-card open fires only after that fade-in lands — switch first, then show.
  const switching = useRef(false);
  const pendingOpen = useRef<number | null>(null);
  const applyCategory = useCallback(
    (c: CardCategory) => {
      switching.current = true;
      setCategoryState(c);
      rotation.value = middleRotation(decksRef.current[c].length);
    },
    [rotation],
  );

  const finishSwitch = useCallback(() => {
    const idx = pendingOpen.current;
    pendingOpen.current = null;
    if (idx != null) openCardAt(idx);
  }, [openCardAt]);

  useEffect(() => {
    if (!switching.current) return;
    switching.current = false;
    const t = setTimeout(() => {
      deckShift.value = withTiming(0, { duration: 200 }, (finished) => {
        if (finished) runOnJS(finishSwitch)();
      });
    }, 200);
    return () => clearTimeout(t);
  }, [category, deckShift, finishSwitch]);

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

  const closeFullscreen = useCallback(() => {
    machineState.value = 'expanded';
    fullscreenProgress.value = withSpring(0, FS_SPRING);
  }, [machineState, fullscreenProgress]);

  const openOriginCard = useCallback(
    (slot: 0 | 1 | 2) => {
      if (!originCards?.length) return;
      // The badges target the LAST THREE cards (subclass/ancestry/community); any class-feature
      // cards pinned ahead of them (#104) shift the window, not the mapping.
      const idx = decksRef.current.abilities.length - 3 + slot;
      if (categoryRef.current === 'abilities') {
        openCardAt(idx);
        return;
      }
      pendingOpen.current = idx;
      setCategory('abilities');
    },
    [originCards, openCardAt, setCategory],
  );

  const value = useMemo<CarouselContextValue>(
    () => ({
      rotation,
      expandProgress,
      fullscreenProgress,
      machineState,
      focusIndex,
      deckShift,
      decks,
      category,
      setCategory,
      toggleCategory,
      expand,
      collapse,
      openCardAt,
      closeFullscreen,
      openOriginCard,
    }),
    [rotation, expandProgress, fullscreenProgress, machineState, focusIndex, deckShift, decks, category, setCategory, toggleCategory, expand, collapse, openCardAt, closeFullscreen, openOriginCard],
  );

  return <CarouselContext.Provider value={value}>{children}</CarouselContext.Provider>;
}

export function useCarousel() {
  const ctx = useContext(CarouselContext);
  if (!ctx) throw new Error('useCarousel must be used within a CarouselProvider');
  return ctx;
}
