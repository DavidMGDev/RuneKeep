import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { cancelAnimation, Easing, runOnJS, type SharedValue, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { playSfx } from '@/lib/sfx';

import { CARD_DECKS, type CardCategory, type CardItem } from './card-data';
import type { PlacedToken } from './components/card-tokens';
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
  /** While a category switch is mid-flight (#239/#242 item 3): the pan disables scrolling and the deck
   *  is hidden below-screen, so the player can never grab un-ready / mid-transition cards. */
  switching: SharedValue<number>;
  /** Rise reveal (#242 item 3): 1 = deck at rest; 0 = mounted below-screen + hidden before the rise.
   *  The new deck rises (translateY + fade) from 0→1 as the live, interactive deck — no ghost copy. */
  riseProgress: SharedValue<number>;
  /** The GEAR's own rotation (#239 item 4): mirrors `rotation` during normal use, but on a switch it
   *  EASES to the landed rotation instead of snapping with the hard card jump. */
  gearRotation: SharedValue<number>;
  /** The live decks, keyed by category (built-in + custom, #246). Abilities = base deck + the
   *  character's origin cards pinned at the RIGHT end (subclass, ancestry, community — #100). */
  decks: Record<CardCategory, CardItem[]>;
  /** Label + icon per category key (#246), so the glyph/indicator resolve built-in AND custom names. */
  categoryMeta: Record<string, { label: string; icon?: string; builtin: boolean }>;
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
  // --- card tokens (#244): cosmetic buttons the player drags onto a fullscreen card. ---
  /** Placed tokens per deck-card id (drives both the baked LOD layer and the interactive board). */
  cardTokens: Record<string, PlacedToken[]>;
  /** The custom-colour drawer button's current colour, persisted across all cards. */
  tokenColor: string;
  /** The drawer's horizontal anchor along the top (normalized 0..1). */
  tokenDrawerX: number;
  placeToken: (cardId: string, token: PlacedToken) => void;
  removeToken: (cardId: string, tokenId: string) => void;
  setTokenColor: (color: string) => void;
  moveTokenDrawer: (x: number) => void;
}

const CarouselContext = createContext<CarouselContextValue | null>(null);

export function CarouselProvider({ children, decks: decksProp, categoryMeta, ring = ['abilities', 'inventory'], originIndices, enabledIds, onToggleCard, onShowCardInfo, cardTokens, tokenColor, tokenDrawerX, onPlaceToken, onRemoveToken, onSetTokenColor, onMoveTokenDrawer }: { children: ReactNode; decks?: Record<CardCategory, CardItem[]>; categoryMeta?: Record<string, { label: string; icon?: string; builtin: boolean }>; ring?: CardCategory[]; originIndices?: [number, number, number]; enabledIds?: Set<string>; onToggleCard?: (id: string) => void; onShowCardInfo?: (id: string) => void; cardTokens?: Record<string, PlacedToken[]>; tokenColor?: string; tokenDrawerX?: number; onPlaceToken?: (cardId: string, token: PlacedToken) => void; onRemoveToken?: (cardId: string, tokenId: string) => void; onSetTokenColor?: (color: string) => void; onMoveTokenDrawer?: (x: number) => void }) {
  // A real character supplies its OWN full decks map (built-in + custom categories, #246). The
  // hardcoded CARD_DECKS are only the fallback for the demo sheet; `...CARD_DECKS` also guarantees the
  // four built-in keys always exist (empty) even if a real map omits one.
  const decks = useMemo<Record<CardCategory, CardItem[]>>(
    () => ({ ...CARD_DECKS, ...(decksProp ?? {}) }),
    [decksProp],
  );
  const emptyMeta = useMemo<Record<string, { label: string; icon?: string; builtin: boolean }>>(() => ({}), []);
  const ringRef = useRef(ring);
  ringRef.current = ring;
  const startMiddle = middleRotation(decks.abilities.length);
  const rotation = useSharedValue(startMiddle);
  const expandProgress = useSharedValue(0);
  const fullscreenProgress = useSharedValue(0);
  const machineState = useSharedValue<ExpandState>('compact');
  const focusIndex = useSharedValue(Math.round(startMiddle / ANGLE_STEP));
  const [category, setCategoryState] = useState<CardCategory>('abilities');
  const switching = useSharedValue(0);
  // Rise reveal (#242 item 3): 1 = deck at rest; 0 = mounted BELOW-screen + hidden (pre-rise). The new
  // deck rises (translateY + fade) from 0→1 once it's ready, as the live interactive deck — no ghost.
  const riseProgress = useSharedValue(1);
  const gearRotation = useSharedValue(startMiddle);
  const switchFallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchingRef = useRef(false);
  const arrivalRef = useRef<ArrivalEnd>('end');
  const decksRef = useRef(decks);
  decksRef.current = decks;
  const categoryRef = useRef(category);
  categoryRef.current = category;

  const openCardAt = useCallback(
    (index: number) => {
      const count = decksRef.current[categoryRef.current]?.length ?? 0;
      rotation.value = snapRot(index * ANGLE_STEP, count); // center the focused card
      focusIndex.value = Math.min(count - 1, Math.max(0, index));
      machineState.value = 'fullscreen';
      expandProgress.value = withSpring(1, EXPAND_SPRING);
      fullscreenProgress.value = withSpring(1, FS_SPRING);
      playSfx('cardFullscreenEnter'); // #255: origin-card / programmatic fullscreen open
    },
    [rotation, focusIndex, machineState, expandProgress, fullscreenProgress],
  );

  // #100: a pending origin-card open fires after the deck has swapped — switch first, then show.
  const pendingOpen = useRef<number | null>(null);

  const endSwitch = useCallback(() => {
    switchingRef.current = false;
    if (switchFallback.current) { clearTimeout(switchFallback.current); switchFallback.current = null; }
  }, []);

  /**
   * Category switch (#242 item 3) — NO ghost fan. The new deck is swapped in IMMEDIATELY (so the deck
   * data + the portrait category glyph update at once), positioned BELOW the screen and hidden
   * (riseProgress 0), then given a readiness beat so it fully mounts + paints. Only then does it RISE
   * into place — as the live, interactive deck — while the gear eases to the new rotation, so cards +
   * gear + icon all move together. The deck is fully usable the instant it lands (no frozen copy, no
   * jump). The pan stays disabled only until it has risen.
   */
  const setCategory = useCallback(
    (c: CardCategory, arrival: ArrivalEnd = 'end') => {
      if (c === categoryRef.current || switchingRef.current) return; // ignore re-entrancy mid-switch
      switchingRef.current = true;
      playSfx('transitionStart'); // #255: the deck-switch begins
      arrivalRef.current = arrival;
      switching.value = 1; // pan + grabbing off until the new deck has risen
      setCategoryState(c); // swap NOW — deck data + the portrait glyph change immediately
      const n = decksRef.current[c]?.length ?? 0;
      // Continuation (#188): land on the opposite extreme of the new deck, not its middle.
      const land = arrival === 'start' ? 0 : arrival === 'end' ? maxRotation(n) : middleRotation(n);
      cancelAnimation(rotation);
      rotation.value = land; // position the (hidden, below-screen) new deck at its landing pose
      focusIndex.value = Math.round(land / ANGLE_STEP);
      riseProgress.value = 0; // mount below-screen + invisible while it gets ready
      const idx = pendingOpen.current;
      pendingOpen.current = null;
      if (switchFallback.current) clearTimeout(switchFallback.current);
      // Readiness beat, then rise the LIVE deck up + ease the gear — together.
      setTimeout(() => {
        if (idx != null) {
          // origin-card open path (#100): present it focused once swapped; no rise needed.
          riseProgress.value = 1;
          gearRotation.value = land;
          openCardAt(idx);
          switching.value = 0;
          endSwitch();
          return;
        }
        cancelAnimation(gearRotation);
        gearRotation.value = withTiming(land, { duration: 380, easing: Easing.inOut(Easing.cubic) });
        riseProgress.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) }, (fin) => {
          if (fin) {
            switching.value = 0;
            runOnJS(endSwitch)();
          }
        });
      }, 150);
      // Safety net: never let the carousel stay locked if a timing callback is dropped.
      switchFallback.current = setTimeout(() => {
        switching.value = 0;
        riseProgress.value = 1;
        switchingRef.current = false;
        switchFallback.current = null;
      }, 1700);
    },
    [rotation, focusIndex, gearRotation, riseProgress, switching, openCardAt, endSwitch],
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
    const n = decksRef.current[fallback]?.length ?? 0;
    rotation.value = middleRotation(n);
    focusIndex.value = Math.round(middleRotation(n) / ANGLE_STEP);
  }, [ring, category, rotation, focusIndex]);

  // Carousel loads CENTERED on create + load (#174): the initial rotation is computed from whatever
  // deck length is present at mount, but a real character's decks arrive async (file derivation +
  // forge), so when the live deck finally lands the rotation was left near the FIRST card. While the
  // hand is at rest (compact — before any browse, e.g. under the entry loader) recenter on the new
  // deck's middle whenever its length changes. Guarded to compact so it never yanks a live scroll.
  const liveCount = decks[category]?.length ?? 0;
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
    playSfx('cardFullscreenLeave'); // #255
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
  const emptyTokens = useMemo<Record<string, PlacedToken[]>>(() => ({}), []);
  const noopPlace = useCallback((_cardId: string, _token: PlacedToken) => {}, []);
  const noopRemoveToken = useCallback((_cardId: string, _tokenId: string) => {}, []);
  const noopColor = useCallback((_color: string) => {}, []);
  const noopDrawer = useCallback((_x: number) => {}, []);
  const value = useMemo<CarouselContextValue>(
    () => ({
      rotation,
      expandProgress,
      fullscreenProgress,
      machineState,
      focusIndex,
      switching,
      riseProgress,
      gearRotation,
      decks,
      categoryMeta: categoryMeta ?? emptyMeta,
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
      cardTokens: cardTokens ?? emptyTokens,
      tokenColor: tokenColor ?? '',
      tokenDrawerX: tokenDrawerX ?? 0.5,
      placeToken: onPlaceToken ?? noopPlace,
      removeToken: onRemoveToken ?? noopRemoveToken,
      setTokenColor: onSetTokenColor ?? noopColor,
      moveTokenDrawer: onMoveTokenDrawer ?? noopDrawer,
    }),
    [rotation, expandProgress, fullscreenProgress, machineState, focusIndex, switching, riseProgress, gearRotation, decks, categoryMeta, emptyMeta, category, ring, setCategory, cycleCategory, expand, collapse, openCardAt, closeFullscreen, openOriginCard, enabledIds, emptyEnabled, onToggleCard, noopToggle, onShowCardInfo, noopInfo, cardTokens, emptyTokens, tokenColor, tokenDrawerX, onPlaceToken, noopPlace, onRemoveToken, noopRemoveToken, onSetTokenColor, noopColor, onMoveTokenDrawer, noopDrawer],
  );

  return <CarouselContext.Provider value={value}>{children}</CarouselContext.Provider>;
}

export function useCarousel() {
  const ctx = useContext(CarouselContext);
  if (!ctx) throw new Error('useCarousel must be used within a CarouselProvider');
  return ctx;
}
