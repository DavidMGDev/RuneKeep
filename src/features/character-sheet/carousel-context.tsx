import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { cancelAnimation, Easing, runOnJS, type SharedValue, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';

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
  /** While a category switch is mid-flight (#239 item 3): the pan disables scrolling and the live deck
   *  is hidden, so the player can never grab un-ready / mid-transition cards. */
  switching: SharedValue<number>;
  /** Live-deck reveal (#239 item 3): 0 while the deck swaps under the ghost, animates to 1 to
   *  cross-reveal the new deck once it's mounted at its final, usable pose. */
  liveReveal: SharedValue<number>;
  /** The GEAR's own rotation (#239 item 4): mirrors `rotation` during normal use, but on a switch it
   *  EASES to the landed rotation instead of snapping with the hard card jump. */
  gearRotation: SharedValue<number>;
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
  const switching = useSharedValue(0);
  const liveReveal = useSharedValue(1);
  const gearRotation = useSharedValue(startMiddle);
  const switchFallback = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // End-of-switch cleanup: drop the ghost + clear the safety net. Idempotent.
  const finishSwitch = useCallback(() => {
    if (switchFallback.current) {
      clearTimeout(switchFallback.current);
      switchFallback.current = null;
    }
    incomingRef.current = null;
    setIncoming(null);
  }, []);

  // Commit the switch once the incoming ghost has fully faded in (#239 items 3 + 4). The ghost is
  // already centered on the EXACT landed pose, so the live deck can swap to it with NO visible motion:
  //  • hide the live deck (liveReveal → 0) while it swaps + jumps to `land`, so the OLD deck never
  //    flashes at the new rotation (the experiences-past-the-last-card bug),
  //  • snap `rotation` straight to `land` (no card ease → no center-tracking churn; the ghost covers),
  //  • EASE only the gear to `land` so the cogs glide to their new rotation instead of snapping,
  //  • after the new deck paints a frame, cross-reveal: live deck fades in while the ghost fades out,
  //    and only THEN clear `switching` — so the player can't grab the deck until it's fully usable.
  const commitSwitch = useCallback(
    (c: CardCategory) => {
      setCategoryState(c);
      const n = decksRef.current[c].length;
      // Continuation (#188): land on the opposite extreme of the new deck, not its middle.
      const land = arrivalRef.current === 'start' ? 0 : arrivalRef.current === 'end' ? maxRotation(n) : middleRotation(n);
      const idx = pendingOpen.current;
      pendingOpen.current = null;
      if (idx != null) {
        // Origin-card open (#100): swap, then fly the card to focus — the focus animation owns the
        // reveal, so no hide/ease here.
        rotation.value = land;
        gearRotation.value = land;
        deckShift.value = 0;
        liveReveal.value = 1;
        openCardAt(idx);
        deckEnter.value = 0;
        switching.value = 0;
        finishSwitch();
        return;
      }
      liveReveal.value = 0;
      rotation.value = land;
      focusIndex.value = Math.round(land / ANGLE_STEP);
      deckShift.value = 0;
      cancelAnimation(gearRotation);
      gearRotation.value = withTiming(land, { duration: 360, easing: Easing.inOut(Easing.cubic) });
      setTimeout(() => {
        liveReveal.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
        deckEnter.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic) }, (fin) => {
          if (fin) {
            switching.value = 0;
            runOnJS(finishSwitch)();
          }
        });
      }, 70);
    },
    [rotation, gearRotation, focusIndex, deckShift, deckEnter, liveReveal, switching, openCardAt, finishSwitch],
  );

  const setCategory = useCallback(
    (c: CardCategory, arrival: ArrivalEnd = 'end') => {
      if (c === categoryRef.current || incomingRef.current) return; // ignore re-entrancy mid-switch
      arrivalRef.current = arrival;
      setIncomingArrival(arrival);
      incomingRef.current = c;
      setIncoming(c); // mount the incoming deck as a ghost fan (hidden) so it paints before it shows
      switching.value = 1; // disable scroll + grabbing while the switch runs (#239 item 3)
      liveReveal.value = 1; // the OLD hand stays visible while it slides out
      deckEnter.value = 0;
      // OLD hand sinks + fades near the bottom
      deckShift.value = withTiming(1, { duration: 260, easing: Easing.in(Easing.cubic) });
      // after a short preload grace (ghost thumbs paint), rise + fade the incoming hand in; commit
      // once it has fully landed. The grace overlaps the old hand's exit tail → minimal empty beat.
      deckEnter.value = withDelay(
        110,
        withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) }, (finished) => {
          if (finished) runOnJS(commitSwitch)(c);
        }),
      );
      // Safety net (#239): if a timing callback is ever dropped, force the switch to finish so the
      // carousel can't lock (the pan stays disabled while switching === 1).
      if (switchFallback.current) clearTimeout(switchFallback.current);
      switchFallback.current = setTimeout(() => {
        switching.value = 0;
        liveReveal.value = 1;
        deckEnter.value = 0;
        switchFallback.current = null;
        incomingRef.current = null;
        setIncoming(null);
      }, 1600);
    },
    [deckShift, deckEnter, switching, liveReveal, commitSwitch],
  );

  const cycleCategory = useCallback(
    (dir: number, arrival: ArrivalEnd = 'end') => {
      setCategory(nextCategory(ringRef.current, categoryRef.current, dir), arrival);
    },
    [setCategory],
  );

  // The ring can change underfoot (#214/#227): hiding the current category in the Cards panel, or
  // loading a non-Druid, can leave `category` outside the active ring. Snap to a valid category and
  // recenter. No machine-state guard (#227): category only ever leaves the ring via the Cards panel,
  // where the carousel is unloaded — so the user is safely on an enabled category when it reloads.
  useEffect(() => {
    if (ring.includes(category)) return;
    const fallback = ring[0] ?? 'abilities';
    setCategoryState(fallback);
    const n = decksRef.current[fallback].length;
    rotation.value = middleRotation(n);
    focusIndex.value = Math.round(middleRotation(n) / ANGLE_STEP);
  }, [ring, category, rotation, focusIndex]);

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
      switching,
      liveReveal,
      gearRotation,
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
    [rotation, expandProgress, fullscreenProgress, machineState, focusIndex, deckShift, deckEnter, switching, liveReveal, gearRotation, incoming, incomingArrival, decks, category, ring, setCategory, cycleCategory, expand, collapse, openCardAt, closeFullscreen, openOriginCard, enabledIds, emptyEnabled, onToggleCard, noopToggle, onShowCardInfo, noopInfo],
  );

  return <CarouselContext.Provider value={value}>{children}</CarouselContext.Provider>;
}

export function useCarousel() {
  const ctx = useContext(CarouselContext);
  if (!ctx) throw new Error('useCarousel must be used within a CarouselProvider');
  return ctx;
}
