import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Easing, runOnJS, type SharedValue, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';

import { CARD_DECKS, type CardCategory, type CardItem } from './card-data';
import { nextCategory } from './carousel-categories';
import { ANGLE_STEP, EXPAND_SPRING, FS_SPRING, maxRotation, middleRotation, snapRot } from './carousel-geometry';

/** Which end of the incoming deck a switch lands on (#188): a switch begun from the FIRST card
 *  arrives at the LAST card of the new deck (and vice-versa), so it reads as one continuous deck. */
export type ArrivalEnd = 'start' | 'end';

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
  /** Deck-switch EXIT sweep (#95 C / #174): 0 = deck in place, 1 = old hand slid down + faded out. */
  deckShift: SharedValue<number>;
  /** Deck-switch ENTER progress (#174): 0 = incoming ghost hidden/below, 1 = risen + faded in centered. */
  deckEnter: SharedValue<number>;
  /** The category being switched TO while a swap is mid-flight (#174), else null. CardCarousel renders
   *  its deck as a ghost fan so the new cards paint before they show. */
  incoming: CardCategory | null;
  /** Which end the in-flight switch lands on (#188): the ghost fan centers on this extreme. */
  incomingArrival: ArrivalEnd;
  /** The live decks. Abilities = base deck + the character's origin cards pinned at the RIGHT end
   *  (subclass, ancestry, community — #100). Inventory never shows them. */
  decks: Record<CardCategory, CardItem[]>;
  category: CardCategory;
  /** The active, ordered category RING the over-scroll loops through (#214): abilities + inventory
   *  always, + notes when toggled on, + wildshape for Druids. */
  ring: CardCategory[];
  /** Switch deck; lands at the opposite extreme (#188) — `arrival` = which end of the NEW deck to
   *  show ('end' = last card, the default continuation from the start; 'start' = first card). */
  setCategory: (c: CardCategory, arrival?: ArrivalEnd) => void;
  /** Step `dir` (+1 forward / -1 backward) around the ring with wraparound (#214). Replaces the old
   *  inv↔arsenal binary toggle so 3- and 4-category rings (Notes / Druid Wild Shape) loop. */
  cycleCategory: (dir: number, arrival?: ArrivalEnd) => void;
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
  /** Ids of cards the player has enabled/equipped (#175) — drives the corner check + toggle state. */
  enabledIds: Set<string>;
  /** Toggle a card's enabled state by id (#175): hold the centered/focused card to call this. */
  toggleCard: (id: string) => void;
  /** Open the per-card modifier view (#175): the focused card's "Modifiers" button calls this. */
  showCardInfo: (id: string) => void;
}

const CarouselContext = createContext<CarouselContextValue | null>(null);

export function CarouselProvider({ children, abilitiesCards, inventoryCards, notesCards, wildshapeCards, ring = ['abilities', 'inventory'], originIndices, enabledIds, onToggleCard, onShowCardInfo }: { children: ReactNode; abilitiesCards?: CardItem[]; inventoryCards?: CardItem[]; notesCards?: CardItem[]; wildshapeCards?: CardItem[]; ring?: CardCategory[]; originIndices?: [number, number, number]; enabledIds?: Set<string>; onToggleCard?: (id: string) => void; onShowCardInfo?: (id: string) => void }) {
  // A real character supplies its OWN full decks (only the cards it picked, #121) — no sample/
  // placeholder cards mixed in. The hardcoded CARD_DECKS are only the fallback for the demo sheet.
  const decks = useMemo<Record<CardCategory, CardItem[]>>(
    () => ({
      abilities: abilitiesCards?.length ? abilitiesCards : CARD_DECKS.abilities,
      // a real character supplies its inventory array (even while items forge — may be briefly
      // empty); only the demo sheet (undefined) falls back to the sample deck (#136).
      inventory: inventoryCards ?? CARD_DECKS.inventory,
      // Notes (#214): all-class freeform deck; Wild Shape (#214): Druid Beastform deck. Both
      // character-supplied — empty arrays when absent (the ring simply won't include them).
      notes: notesCards ?? CARD_DECKS.notes,
      wildshape: wildshapeCards ?? CARD_DECKS.wildshape,
    }),
    [abilitiesCards, inventoryCards, notesCards, wildshapeCards],
  );
  const ringRef = useRef(ring);
  ringRef.current = ring;
  const startMiddle = middleRotation(decks.abilities.length);
  const rotation = useSharedValue(startMiddle);
  const expandProgress = useSharedValue(0);
  const fullscreenProgress = useSharedValue(0);
  const machineState = useSharedValue<ExpandState>('compact');
  const focusIndex = useSharedValue(Math.round(startMiddle / ANGLE_STEP));
  const [category, setCategoryState] = useState<CardCategory>('abilities');
  const deckShift = useSharedValue(0);
  const deckEnter = useSharedValue(0);
  const [incoming, setIncoming] = useState<CardCategory | null>(null);
  const [incomingArrival, setIncomingArrival] = useState<ArrivalEnd>('end');
  const arrivalRef = useRef<ArrivalEnd>('end');
  const decksRef = useRef(decks);
  decksRef.current = decks;
  const categoryRef = useRef(category);
  categoryRef.current = category;
  const incomingRef = useRef<CardCategory | null>(null);
  incomingRef.current = incoming;

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

  // Category switch (#174): a smooth vertical SWAP that never fades to empty in place. The incoming
  // deck mounts off-screen as a ghost fan (see CardCarousel) and is given a paint grace; then the
  // OLD hand slides DOWN off the bottom (deckShift → 1, fading only as it nears the edge) while the
  // incoming ghost RISES + fades in centered (deckEnter → 1). When the ghost has fully landed we
  // commit: the live deck becomes the new one at the SAME centered pose the ghost held, so the
  // hand-off is seamless (identical pixels) and the hand never collapses.
  // #100: a pending origin-card open fires only after the commit — switch first, then show.
  const pendingOpen = useRef<number | null>(null);

  const commitSwitch = useCallback(
    (c: CardCategory) => {
      setCategoryState(c);
      const n = decksRef.current[c].length;
      // Continuation (#188): land on the opposite extreme of the new deck, not its middle.
      const land = arrivalRef.current === 'start' ? 0 : arrivalRef.current === 'end' ? maxRotation(n) : middleRotation(n);
      rotation.value = land;
      focusIndex.value = Math.round(land / ANGLE_STEP);
      deckShift.value = 0;
      const idx = pendingOpen.current;
      pendingOpen.current = null;
      if (idx != null) openCardAt(idx);
      // Keep the (fully faded-in, centered) ghost up one more beat so the freshly-mounted LIVE deck
      // paints UNDER it before it drops — the uris are cache-warm from the ghost, so this guards the
      // last 1-frame blank at the hand-off. Both fans are identical + centered, so the overlap is
      // invisible. Drop the ghost after the grace.
      setTimeout(() => {
        deckEnter.value = 0;
        setIncoming(null);
      }, 120);
    },
    [rotation, focusIndex, deckShift, deckEnter, openCardAt],
  );

  const setCategory = useCallback(
    (c: CardCategory, arrival: ArrivalEnd = 'end') => {
      if (c === categoryRef.current || incomingRef.current) return; // ignore re-entrancy mid-switch
      arrivalRef.current = arrival;
      setIncomingArrival(arrival);
      incomingRef.current = c;
      setIncoming(c); // mount the incoming deck as a ghost fan (hidden) so it paints before it shows
      deckEnter.value = 0;
      // OLD hand sinks + fades near the bottom
      deckShift.value = withTiming(1, { duration: 300, easing: Easing.in(Easing.cubic) });
      // after a short preload grace (ghost thumbs paint), rise + fade the incoming hand in; commit
      // once it has fully landed. The grace overlaps the old hand's exit tail → minimal empty beat.
      deckEnter.value = withDelay(
        150,
        withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }, (finished) => {
          if (finished) runOnJS(commitSwitch)(c);
        }),
      );
    },
    [deckShift, deckEnter, commitSwitch],
  );

  const cycleCategory = useCallback(
    (dir: number, arrival: ArrivalEnd = 'end') => {
      setCategory(nextCategory(ringRef.current, categoryRef.current, dir), arrival);
    },
    [setCategory],
  );

  // The ring can change underfoot (#214): toggling Notes off while viewing it, or loading a
  // non-Druid, can leave `category` outside the active ring. Snap back to a valid category (at rest).
  useEffect(() => {
    if (ring.includes(category)) return;
    if (machineState.value !== 'compact') return;
    const fallback = ring[0] ?? 'abilities';
    setCategoryState(fallback);
    const n = decksRef.current[fallback].length;
    rotation.value = middleRotation(n);
    focusIndex.value = Math.round(middleRotation(n) / ANGLE_STEP);
  }, [ring, category, machineState, rotation, focusIndex]);

  // Carousel loads CENTERED on create + load (#174): the initial rotation is computed from whatever
  // deck length is present at mount, but a real character's decks arrive async (file derivation +
  // forge), so when the live deck finally lands the rotation was left near the FIRST card. While the
  // hand is at rest (compact — before any browse, e.g. under the entry loader) recenter on the new
  // deck's middle whenever its length changes. Guarded to compact so it never yanks a live scroll.
  const liveCount = decks[category].length;
  useEffect(() => {
    if (machineState.value !== 'compact') return;
    rotation.value = middleRotation(liveCount);
    focusIndex.value = Math.round(middleRotation(liveCount) / ANGLE_STEP);
  }, [liveCount, category, rotation, focusIndex, machineState]);

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
      // The badges target subclass/ancestry/community by their ACTUAL index now (#136: the arsenal
      // reorder means they're no longer the contiguous last three). Fall back to the old last-three
      // mapping if indices weren't supplied (demo sheet).
      const idx = originIndices ? originIndices[slot] : decksRef.current.abilities.length - 3 + slot;
      if (idx == null || idx < 0) return;
      if (categoryRef.current === 'abilities') {
        openCardAt(idx);
        return;
      }
      pendingOpen.current = idx;
      setCategory('abilities');
    },
    [originIndices, openCardAt, setCategory],
  );

  const emptyEnabled = useMemo(() => new Set<string>(), []);
  const noopToggle = useCallback((_id: string) => {}, []);
  const noopInfo = useCallback((_id: string) => {}, []);
  const value = useMemo<CarouselContextValue>(
    () => ({
      rotation,
      expandProgress,
      fullscreenProgress,
      machineState,
      focusIndex,
      deckShift,
      deckEnter,
      incoming,
      incomingArrival,
      decks,
      category,
      ring,
      setCategory,
      cycleCategory,
      expand,
      collapse,
      openCardAt,
      closeFullscreen,
      openOriginCard,
      enabledIds: enabledIds ?? emptyEnabled,
      toggleCard: onToggleCard ?? noopToggle,
      showCardInfo: onShowCardInfo ?? noopInfo,
    }),
    [rotation, expandProgress, fullscreenProgress, machineState, focusIndex, deckShift, deckEnter, incoming, incomingArrival, decks, category, ring, setCategory, cycleCategory, expand, collapse, openCardAt, closeFullscreen, openOriginCard, enabledIds, emptyEnabled, onToggleCard, noopToggle, onShowCardInfo, noopInfo],
  );

  return <CarouselContext.Provider value={value}>{children}</CarouselContext.Provider>;
}

export function useCarousel() {
  const ctx = useContext(CarouselContext);
  if (!ctx) throw new Error('useCarousel must be used within a CarouselProvider');
  return ctx;
}
