import { createContext, type MutableRefObject, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { cancelAnimation, Easing, runOnJS, type SharedValue, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { playSfx } from '@/lib/sfx';

import { CARD_DECKS, type CardCategory, type CardItem } from './card-data';
import type { PlacedToken } from './components/card-tokens';
import { nextCategory } from './carousel-categories';
import { cardMenuOptions, type CardMenuKind } from './card-menu';
import { ANGLE_STEP, clampMenuAnchor, EXPAND_SPRING, FS_SPRING, maxRotation, middleRotation, snapRot, SNAP_SPRING } from './carousel-geometry';
import { FAVORITES_CATEGORY } from '@/lib/favorites';

/** Which end of the incoming deck a switch lands on (#188): a switch begun from the FIRST card
 *  arrives at the LAST card of the new deck (and vice-versa), so it reads as one continuous deck. */
export type ArrivalEnd = 'start' | 'end';

/** Three states only (see docs/architecture.md › Card carousel › state model): bundled, fanned, or one card focused. */
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
  /** v0.13.0: an open/expand/edit was attempted while the current category's deck is EMPTY — the
   *  sheet shows the "There is nothing here" panel instead (no dim, no expand sfx, no gear grow). */
  onEmptyOpen: () => void;
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
  /** Open the Favorites category from the Favorites button (v0.9.8). When Favorites is enabled it's a
   *  normal ring member; when disabled it's a transient detour — both over-scroll sides return to the
   *  origin category. No-op when there are no favorites. */
  openFavorites: () => void;
  /** While button-opening a DISABLED Favorites, the origin category to return to on EITHER over-scroll
   *  side (v0.9.8). null when Favorites is a normal ring member or not open via the detour. */
  favDetour: CardCategory | null;
  // --- Golden Gear Edit (v0.9.8): hold the gear still to flatten the deck into an editable row. ---
  /** 0 = normal curved hand, 1 = flat edit row. Drives the slot straighten + forced-thumbnail LOD. */
  editMode: SharedValue<number>;
  /** Whether Golden Gear Edit is active (JS) — gates card taps to raise/select and shows the controls bar. */
  editing: boolean;
  /** The selected (raised) card ids in edit mode. */
  raisedIds: Set<string>;
  /** Enter edit mode (gear held still): flatten + shrink the deck to lowest LOD. */
  enterEdit: () => void;
  /** Leave edit mode (v0.11.1): `toCompact` true = tap-gear → close the whole hand to compact; false =
   *  hold-gear → drop back to the expanded arc. Both play the reverse desaturation (gears flash → gold). */
  exitEdit: (toCompact?: boolean) => void;
  /** 0 = normal gold chrome, 1 = fully desaturated (light-gray) edit chrome. Drives the border + gears +
   *  edit UI palette (item 2). */
  desat: SharedValue<number>;
  /** 0..1 white pulse over the gears — the press feedback + the exit flash (item 2 / item 7). */
  gearFlash: SharedValue<number>;
  /** Toggle a card's raised/selected state in edit mode. */
  toggleRaise: (id: string) => void;
  /** Clear the whole edit selection (the "Deselect All" control + after a Duplicate). */
  deselectAll: () => void;
  /** Raise every card in the current deck (v0.25.0). */
  selectAll: () => void;
  /** Spring the row so the given card centers (used to reveal freshly-duplicated cards). No-op if the
   *  id isn't in the current deck. */
  scrollToId: (id: string) => void;
  /** Move N cards along the current deck (v0.26.0, keyboard). */
  stepBy: (n: number) => void;
  /** The index of the card in the MIDDLE of the hand right now, read live off the rotation. */
  centerIndex: () => number;
  /** Persist an in-edit drag-reorder (v0.9.8): move cards to a category at an explicit order. Same
   *  signature as the Cards panel's group reorder, so it inherits the override + order persistence. */
  onReorderCards?: (movedIds: string[], toCat: string, orderedIds: string[]) => void;
  // --- Golden Gear Edit card-hold RADIAL menu (v0.11.0 rework): hold a card to open a MODAL icon wheel. ---
  /** 0 = closed .. 1 = open (fade). */
  cardMenuOpen: SharedValue<number>;
  /** The wheel centre (design px), clamped inside the screen. */
  cardMenuAnchorX: SharedValue<number>;
  cardMenuAnchorY: SharedValue<number>;
  /** The live finger (design px) while spray-selecting (v0.11.1 — like the float menu). */
  cardMenuFingerX: SharedValue<number>;
  cardMenuFingerY: SharedValue<number>;
  /** The wedge the finger points at (−1 = none/cancel). */
  cardMenuHighlight: SharedValue<number>;
  /** Whether NFC send is offered (Android/APK) — drives the option list AND the wheel. */
  nfcAvailable: boolean;
  /** Whether EVERY selected card is already favorited (item 9): flips the Favorite option to Unfavorite. */
  selectionAllFavorited: boolean;
  /** Open the card-hold menu centred at (x,y) design px (clamped to the screen). */
  openCardMenu: (x: number, y: number) => void;
  /** Close it with no action. */
  closeCardMenu: () => void;
  /** Fire option `index` (from the current option list) on the raised selection, then close. */
  selectCardMenu: (index: number) => void;
  /** Ids of cards the player has enabled/equipped (#175) — drives the corner check + toggle state. */
  enabledIds: Set<string>;
  /** Mixed ancestry (#265): deck-card id → which trait (1 = first, 2 = second) is crossed out. Drives
   *  the TraitCrossOut overlay so it rides the card through the carousel animation. */
  crossOuts: Record<string, 1 | 2>;
  /** Toggle a card's enabled state by id (#175): hold the centered/focused card to call this. */
  toggleCard: (id: string) => void;
  /** Open the per-card modifier view (#175): the focused card's "Modifiers" button calls this. */
  showCardInfo: (id: string) => void;
  /**
   * What a card IS, beyond equipped (v0.32.0). All keyed by the card's ref, like `enabledIds`.
   *
   *  - `permanent`   grants something you keep whether or not it is equipped → gold corner, not red.
   *  - `modsOff`     equipped but its modifiers are switched off → grey corner, and the Toggle reads
   *                  as off.
   *  - `numberInput` has a modifier that reads a number the player types → show the "#" button.
   *  - `domain`      a domain card, the only kind that gets the Toggle at all.
   */
  cardStates: { permanent: Set<string>; modsOff: Set<string>; numberInput: Set<string>; domain: Set<string> };
  /** Switch a card's modifiers off/on without unequipping it (v0.32.0). Domain cards only. */
  toggleCardModifiers: (id: string) => void;
  /** Ask for this card's number (v0.32.0) — the sheet opens the keypad. */
  editNumberInput: (id: string) => void;
  // --- card tokens (#244): cosmetic buttons the player drags onto a fullscreen card. ---
  /** Placed tokens per deck-card id (drives both the baked LOD layer and the interactive board). */
  cardTokens: Record<string, PlacedToken[]>;
  /** The custom-colour drawer button's current colour, persisted across all cards. */
  tokenColor: string;
  /** The drawer's horizontal anchor along the top (normalized 0..1). */
  tokenDrawerX: number;
  placeToken: (cardId: string, token: PlacedToken) => void;
  removeToken: (cardId: string, tokenId: string) => void;
  /** Patch one placed token (#293: a die's value cycling on tap). */
  updateToken: (cardId: string, tokenId: string, patch: Partial<PlacedToken>) => void;
  setTokenColor: (color: string) => void;
  moveTokenDrawer: (x: number) => void;
}

const CarouselContext = createContext<CarouselContextValue | null>(null);

export interface CarouselApi {
  /** Center the row on a card by id (spring). Used by the sheet after a Duplicate to reveal the copies. */
  scrollToId: (id: string) => void;
  /** Clear the edit selection. */
  deselectAll: () => void;
  /** v0.13.0: switch category from the sheet (the empty-panel "Change category" chooser). */
  setCategory: (c: CardCategory, arrival?: ArrivalEnd) => void;
}

export function CarouselProvider({ children, decks: decksProp, categoryMeta, ring = ['abilities', 'inventory'], validRing, originIndices, enabledIds, cardStates, crossOuts, onToggleCard, onToggleCardModifiers, onEditNumberInput, onShowCardInfo, onLeaveFullscreen, cardTokens, tokenColor, tokenDrawerX, onPlaceToken, onRemoveToken, onUpdateToken, onSetTokenColor, onMoveTokenDrawer, onReorderCards, onCardAction, nfcAvailable = false, isCardFavorited, onEmptyFavorites, onEmptyOpen, apiRef }: { children: ReactNode; decks?: Record<CardCategory, CardItem[]>; categoryMeta?: Record<string, { label: string; icon?: string; builtin: boolean }>; ring?: CardCategory[]; validRing?: CardCategory[]; originIndices?: [number, number, number]; enabledIds?: Set<string>; cardStates?: CarouselContextValue['cardStates']; crossOuts?: Record<string, 1 | 2>; onToggleCard?: (id: string) => void; onToggleCardModifiers?: (id: string) => void; onEditNumberInput?: (id: string) => void; onShowCardInfo?: (id: string) => void; onLeaveFullscreen?: () => void; cardTokens?: Record<string, PlacedToken[]>; tokenColor?: string; tokenDrawerX?: number; onPlaceToken?: (cardId: string, token: PlacedToken) => void; onRemoveToken?: (cardId: string, tokenId: string) => void; onUpdateToken?: (cardId: string, tokenId: string, patch: Partial<PlacedToken>) => void; onSetTokenColor?: (color: string) => void; onMoveTokenDrawer?: (x: number) => void; onReorderCards?: (movedIds: string[], toCat: string, orderedIds: string[]) => void; onCardAction?: (kind: CardMenuKind, ids: string[]) => void; nfcAvailable?: boolean; isCardFavorited?: (id: string) => boolean; onEmptyFavorites?: () => void; onEmptyOpen?: () => void; apiRef?: MutableRefObject<CarouselApi | null> }) {
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
  const [favDetour, setFavDetour] = useState<CardCategory | null>(null); // v0.9.8: disabled-Favorites detour origin
  const editMode = useSharedValue(0); // v0.9.8: Golden Gear Edit straighten progress (0 arc → 1 flat)
  const [editing, setEditing] = useState(false);
  const [raisedIds, setRaisedIds] = useState<Set<string>>(() => new Set());
  const raisedIdsRef = useRef(raisedIds);
  raisedIdsRef.current = raisedIds;
  // v0.12.1 item 8: a selected card that leaves the deck (deleted) must drop out of the selection, so the
  // "X/Y Cards" count never counts ghosts. Prune to ids still present in the current category's deck.
  const catRef2 = useRef(category);
  catRef2.current = category;
  useEffect(() => {
    const present = new Set((decks[catRef2.current] ?? []).map((c) => c.id));
    setRaisedIds((s) => {
      if (![...s].some((id) => !present.has(id))) return s; // all still present → no change
      return new Set([...s].filter((id) => present.has(id)));
    });
  }, [decks, category]);
  // v0.11.1 card-hold radial menu shared values — spray-select (the pan drives the finger + highlight).
  const cardMenuOpen = useSharedValue(0);
  const cardMenuAnchorX = useSharedValue(206);
  const cardMenuAnchorY = useSharedValue(446);
  const cardMenuFingerX = useSharedValue(206);
  const cardMenuFingerY = useSharedValue(446);
  const cardMenuHighlight = useSharedValue(-1);
  // v0.11.1 desaturation (item 2): the whole edit chrome (border, gears, edit UI) fades gold → light gray.
  const desat = useSharedValue(0);
  const gearFlash = useSharedValue(0);
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
  const favDetourRef = useRef<CardCategory | null>(null);
  favDetourRef.current = favDetour;
  // v0.13.0: latest-callback refs so worklet/JS entry paths always fire the CURRENT handlers without
  // threading them through every dep array.
  const onEmptyFavoritesRef = useRef(onEmptyFavorites);
  onEmptyFavoritesRef.current = onEmptyFavorites;
  const onEmptyOpenRef = useRef(onEmptyOpen);
  onEmptyOpenRef.current = onEmptyOpen;
  /** True when the CURRENT category's deck has no cards (v0.13.0 empty-state gate). */
  const deckEmpty = useCallback(() => !(decksRef.current[categoryRef.current]?.length), []);
  const emptyOpen = useCallback(() => { onEmptyOpenRef.current?.(); }, []);

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
      if (c !== 'favorites') setFavDetour(null); // any navigation away from Favorites ends the detour
      setRaisedIds((s) => (s.size ? new Set() : s)); // v0.9.8: a deck switch clears the edit selection
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
      // v0.9.8: a button-opened (disabled) Favorites is a detour — EITHER over-scroll side returns to origin.
      if (categoryRef.current === 'favorites' && favDetourRef.current) {
        setCategory(favDetourRef.current, arrival);
        return;
      }
      setCategory(nextCategory(ringRef.current, categoryRef.current, dir), arrival);
    },
    [setCategory],
  );

  // The ring can change underfoot (#214/#227): hiding the current category in the Cards panel, or
  // loading a non-Druid, can leave `category` outside the active ring. Snap to a valid category and
  // recenter. #320: guard on `validRing` (available − hidden, EMPTY INCLUDED), NOT the over-scroll
  // `ring` (which drops empty categories) — otherwise editing the ONLY card in a category transiently
  // empties its deck mid-reforge, drops it from `ring`, and yanks the player to another category.
  useEffect(() => {
    // v0.9.8: don't snap out of a button-opened (disabled) Favorites — the detour keeps it valid.
    if ((validRing ?? ring).includes(category) || (category === 'favorites' && favDetourRef.current != null)) return;
    const fallback = ring[0] ?? 'abilities';
    setCategoryState(fallback);
    const n = decksRef.current[fallback]?.length ?? 0;
    rotation.value = middleRotation(n);
    focusIndex.value = Math.round(middleRotation(n) / ANGLE_STEP);
  }, [validRing, ring, category, rotation, focusIndex]);

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
    if (deckEmpty()) { emptyOpen(); return; } // v0.13.0: nothing to fan — show the empty panel instead
    machineState.value = 'expanded';
    expandProgress.value = withSpring(1, EXPAND_SPRING);
  }, [machineState, expandProgress, deckEmpty, emptyOpen]);

  const collapse = useCallback(() => {
    machineState.value = 'compact';
    expandProgress.value = withSpring(0, EXPAND_SPRING);
  }, [machineState, expandProgress]);

  const closeFullscreen = useCallback(() => {
    machineState.value = 'expanded';
    fullscreenProgress.value = withSpring(0, FS_SPRING);
    playSfx('transitionIconFilled'); // #258: nicer leave sound than the old cardFullscreenLeave
    onLeaveFullscreen?.(); // #318: leaving fullscreen ends a domain-cap override streak
  }, [machineState, fullscreenProgress, onLeaveFullscreen]);

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

  // v0.10.7: the Favorites star is now a TOGGLE. Favorites is a hidden mirror (never in the ring), so
  // opening it always remembers the origin category as a detour, and pressing the star again (while in
  // Favorites) returns there. No-op (negative sound) when there are no favorites to show.
  const openFavorites = useCallback(() => {
    if (categoryRef.current === 'favorites') {
      if (favDetourRef.current) setCategory(favDetourRef.current, 'start'); // toggle back to where we came from
      return;
    }
    if (!(decksRef.current.favorites?.length)) { playSfx('floatMenuClose'); onEmptyFavoritesRef.current?.(); return; }
    setFavDetour(categoryRef.current); // remember the origin — every exit path returns here
    setCategory('favorites', 'start');
  }, [setCategory]);

  // v0.11.0 card-hold radial menu (MODAL). Open fades the wheel in at a clamped anchor and stays open
  // (finger stillness never closes it — item 7); select maps the chosen option to an action on the
  // raised selection (the sheet owns the action handlers via onCardAction).
  const openCardMenu = useCallback((x: number, y: number) => {
    const a = clampMenuAnchor(x, y);
    cardMenuAnchorX.value = a.x;
    cardMenuAnchorY.value = a.y;
    cardMenuFingerX.value = a.x;
    cardMenuFingerY.value = a.y;
    cardMenuHighlight.value = -1;
    cardMenuOpen.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
    playSfx('floatMenuOpen');
  }, [cardMenuAnchorX, cardMenuAnchorY, cardMenuFingerX, cardMenuFingerY, cardMenuHighlight, cardMenuOpen]);
  const closeCardMenu = useCallback(() => {
    cardMenuOpen.value = withTiming(0, { duration: 150, easing: Easing.in(Easing.cubic) });
    cardMenuHighlight.value = -1;
    playSfx('floatMenuClose');
  }, [cardMenuOpen, cardMenuHighlight]);
  const selectCardMenu = useCallback((index: number) => {
    const opts = cardMenuOptions(categoryRef.current === FAVORITES_CATEGORY, nfcAvailable);
    const opt = opts[index];
    const ids = [...raisedIdsRef.current];
    cardMenuOpen.value = withTiming(0, { duration: 150, easing: Easing.in(Easing.cubic) });
    cardMenuHighlight.value = -1;
    if (opt && ids.length) onCardAction?.(opt.kind, ids);
    else playSfx('floatMenuClose');
  }, [nfcAvailable, onCardAction, cardMenuOpen, cardMenuHighlight]);

  // v0.9.8 Golden Gear Edit: flatten the (expanded) hand into an editable row. No-op from fullscreen.
  // v0.11.1: the whole chrome desaturates to light gray (item 2) — the gear's press-white settles into
  // the gray as we enter (so gearFlash relaxes as desat rises).
  const enterEdit = useCallback(() => {
    if (machineState.value === 'fullscreen' || switchingRef.current) return;
    if (deckEmpty()) { emptyOpen(); return; } // v0.13.0: nothing to edit — show the empty panel instead
    machineState.value = 'expanded';
    expandProgress.value = withSpring(1, EXPAND_SPRING);
    editMode.value = withTiming(1, { duration: 440, easing: Easing.inOut(Easing.cubic) });
    // v0.11.2 item 4: desat rises FASTER than the white fades, so the gray is fully up before the white
    // clears — the gear never flashes back to gold mid-transition (white → gray, no gold peek).
    desat.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) });
    gearFlash.value = withTiming(0, { duration: 440, easing: Easing.out(Easing.cubic) });
    setEditing(true);
    playSfx('transitionStart');
  }, [editMode, desat, gearFlash, machineState, expandProgress, deckEmpty, emptyOpen]);
  // v0.11.1 item 7: exit either to COMPACT (tap gear → close the hand) or the EXPANDED arc (hold gear).
  // Both run the REVERSE desaturation: the gears flash white then fade back to gold as desat → 0.
  const exitEdit = useCallback((toCompact = false) => {
    editMode.value = withTiming(0, { duration: 360, easing: Easing.inOut(Easing.cubic) });
    desat.value = withTiming(0, { duration: 420, easing: Easing.inOut(Easing.cubic) });
    gearFlash.value = withSequence(
      withTiming(1, { duration: 110, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: 380, easing: Easing.in(Easing.cubic) }),
    );
    if (toCompact) {
      machineState.value = 'compact';
      expandProgress.value = withSpring(0, EXPAND_SPRING);
    }
    setEditing(false);
    setRaisedIds(new Set());
    playSfx('transitionIconFilled');
  }, [editMode, desat, gearFlash, machineState, expandProgress]);
  const toggleRaise = useCallback((id: string) => {
    setRaisedIds((s) => {
      const n = new Set(s);
      if (n.has(id)) { n.delete(id); playSfx('cardDeselect'); } else { n.add(id); playSfx('cardSelect'); }
      return n;
    });
  }, []);
  const deselectAll = useCallback(() => {
    setRaisedIds((s) => (s.size ? new Set() : s));
    playSfx('cardDeselect');
  }, []);
  /** v0.25.0: raise every card in the deck on screen. Equipping a fresh character used to be one hold
   *  per card; with this it is select all, then Equip from the card menu. */
  const selectAll = useCallback(() => {
    const deck = decksRef.current[categoryRef.current] ?? [];
    if (!deck.length) return;
    setRaisedIds(new Set(deck.map((c) => c.id)));
    playSfx('cardSelect');
  }, []);
  // Center the row on a card by id (v0.11.0): spring the rotation so it lands centered. Reads the LIVE
  // deck (decksRef) so it's correct even called right after a Duplicate commits new cards.
  /**
   * v0.26.0: move N cards along the current deck, for the desktop keyboard. The carousel is driven by
   * gestures everywhere else, so there was no way to ask it to advance by a count; `scrollToId` needs
   * an id, and a keyboard only knows "the next one".
   */
  /**
   * Where the last keyboard step was aimed, or -1 when nothing is in flight (v0.28.0).
   *
   * A step used to measure from `rotation.value`, which mid-spring sits BETWEEN two detents, so
   * `Math.round` gave back the card being left rather than the one being travelled to. Two quick
   * presses of the same arrow therefore advanced one card and a bit, not two, and the deck appeared
   * to stagger. Measuring from the last commanded target instead makes a burst of presses land
   * exactly as many cards along as there were presses, retargeting the spring each time.
   */
  const stepTarget = useSharedValue(-1);

  const stepBy = useCallback((n: number) => {
    const d = decksRef.current[categoryRef.current] ?? [];
    if (!d.length || !n) return;
    // Moving is browsing, and browsing a bundled deck should open it (owner, v0.28.0): the keyboard
    // now fans the hand the way picking it up with a thumb does. It also keeps the deck out of the
    // `compact` recentre below, which used to be free to yank a keyboard-driven scroll back to the
    // middle of the deck the moment anything re-rendered.
    if (machineState.value === 'compact') expand();
    const base = stepTarget.value >= 0 ? stepTarget.value : Math.round(rotation.value / ANGLE_STEP);
    const next = Math.max(0, Math.min(d.length - 1, base + n));
    if (next === base) return;
    cancelAnimation(rotation);
    stepTarget.value = next;
    rotation.value = withSpring(snapRot(next * ANGLE_STEP, d.length), SNAP_SPRING, (finished) => {
      'worklet';
      // Only the animation still owning the target may clear it, or a cancelled earlier step would
      // wipe the aim of the one that replaced it. Deliberately NOT gated on `finished`: a drag that
      // interrupts a keyboard step must also drop the aim, or the next press would measure from
      // wherever the keyboard was headed rather than from where the hand actually is.
      void finished;
      if (stepTarget.value === next) stepTarget.value = -1;
    });
    focusIndex.value = next;
    playSfx('carouselScroll');
  }, [rotation, focusIndex, stepTarget, machineState, expand]);

  /** The card actually in the middle of the hand right now, which is what a key press acts on. */
  const centerIndex = useCallback(() => {
    const d = decksRef.current[categoryRef.current] ?? [];
    if (!d.length) return 0;
    return Math.max(0, Math.min(d.length - 1, Math.round(rotation.value / ANGLE_STEP)));
  }, [rotation]);

  const scrollToId = useCallback((id: string) => {
    const d = decksRef.current[categoryRef.current] ?? [];
    const i = d.findIndex((c) => c.id === id);
    if (i < 0) return;
    cancelAnimation(rotation);
    rotation.value = withSpring(snapRot(i * ANGLE_STEP, d.length), SNAP_SPRING);
    focusIndex.value = i;
  }, [rotation, focusIndex]);
  // item 9: whether every selected card is already favorited → the wheel shows Unfavorite (the handler
  // toggles). Uses the sheet-injected resolver so the mirror-sync source of truth stays in one place.
  const selectionAllFavorited = useMemo(
    () => (isCardFavorited && raisedIds.size > 0 ? [...raisedIds].every((id) => isCardFavorited(id)) : false),
    [isCardFavorited, raisedIds],
  );
  // Expose an imperative handle so the sheet (the CarouselProvider's PARENT, it can't read context)
  // can deselect + scroll after mutating the file (the Duplicate "reveal the copies" flow).
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = { scrollToId, deselectAll, setCategory };
    return () => { apiRef.current = null; };
  }, [apiRef, scrollToId, deselectAll, setCategory]);

  const emptyEnabled = useMemo(() => new Set<string>(), []);
  const emptyCrossOuts = useMemo<Record<string, 1 | 2>>(() => ({}), []);
  const noopToggle = useCallback((_id: string) => {}, []);
  // v0.32.0: the demo sheet supplies none of these, so nothing is permanent, muted or asking for a
  // number and no card gets a Toggle — exactly the behaviour before this existed.
  const emptyCardStates = useMemo<CarouselContextValue['cardStates']>(
    () => ({ permanent: new Set<string>(), modsOff: new Set<string>(), numberInput: new Set<string>(), domain: new Set<string>() }),
    [],
  );
  const noopInfo = useCallback((_id: string) => {}, []);
  const emptyTokens = useMemo<Record<string, PlacedToken[]>>(() => ({}), []);
  const noopPlace = useCallback((_cardId: string, _token: PlacedToken) => {}, []);
  const noopRemoveToken = useCallback((_cardId: string, _tokenId: string) => {}, []);
  const noopUpdateToken = useCallback((_cardId: string, _tokenId: string, _patch: Partial<PlacedToken>) => {}, []);
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
      onEmptyOpen: emptyOpen,
      expand,
      collapse,
      openCardAt,
      closeFullscreen,
      openOriginCard,
      openFavorites,
      favDetour,
      editMode,
      editing,
      raisedIds,
      enterEdit,
      exitEdit,
      desat,
      gearFlash,
      toggleRaise,
      deselectAll,
      selectAll,
      stepBy,
      centerIndex,
      scrollToId,
      onReorderCards,
      cardMenuOpen,
      cardMenuAnchorX,
      cardMenuAnchorY,
      cardMenuFingerX,
      cardMenuFingerY,
      cardMenuHighlight,
      nfcAvailable,
      selectionAllFavorited,
      openCardMenu,
      closeCardMenu,
      selectCardMenu,
      enabledIds: enabledIds ?? emptyEnabled,
      cardStates: cardStates ?? emptyCardStates,
      crossOuts: crossOuts ?? emptyCrossOuts,
      toggleCard: onToggleCard ?? noopToggle,
      toggleCardModifiers: onToggleCardModifiers ?? noopToggle,
      editNumberInput: onEditNumberInput ?? noopToggle,
      showCardInfo: onShowCardInfo ?? noopInfo,
      cardTokens: cardTokens ?? emptyTokens,
      tokenColor: tokenColor ?? '',
      tokenDrawerX: tokenDrawerX ?? 0.5,
      placeToken: onPlaceToken ?? noopPlace,
      removeToken: onRemoveToken ?? noopRemoveToken,
      updateToken: onUpdateToken ?? noopUpdateToken,
      setTokenColor: onSetTokenColor ?? noopColor,
      moveTokenDrawer: onMoveTokenDrawer ?? noopDrawer,
    }),
    [rotation, expandProgress, fullscreenProgress, machineState, focusIndex, switching, riseProgress, gearRotation, decks, categoryMeta, emptyMeta, category, ring, setCategory, cycleCategory, emptyOpen, expand, collapse, openCardAt, closeFullscreen, openOriginCard, openFavorites, favDetour, editMode, editing, raisedIds, enterEdit, exitEdit, desat, gearFlash, toggleRaise, deselectAll, selectAll, stepBy, centerIndex, scrollToId, onReorderCards, cardMenuOpen, cardMenuAnchorX, cardMenuAnchorY, cardMenuFingerX, cardMenuFingerY, cardMenuHighlight, nfcAvailable, selectionAllFavorited, openCardMenu, closeCardMenu, selectCardMenu, enabledIds, emptyEnabled, cardStates, emptyCardStates, crossOuts, emptyCrossOuts, onToggleCard, onToggleCardModifiers, onEditNumberInput, noopToggle, onShowCardInfo, noopInfo, cardTokens, emptyTokens, tokenColor, tokenDrawerX, onPlaceToken, noopPlace, onRemoveToken, noopRemoveToken, onUpdateToken, noopUpdateToken, onSetTokenColor, noopColor, onMoveTokenDrawer, noopDrawer],
  );

  return <CarouselContext.Provider value={value}>{children}</CarouselContext.Provider>;
}

export function useCarousel() {
  const ctx = useContext(CarouselContext);
  if (!ctx) throw new Error('useCarousel must be used within a CarouselProvider');
  return ctx;
}
