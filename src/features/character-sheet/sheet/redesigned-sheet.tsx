// ponytail: this screen stays large (~1.6k) on purpose — it's the sheet orchestrator, coupled by
// design (refs-to-avoid-rerender, the beastform state machine, per-frame carousel wiring). Pure
// helpers were extracted to sheet-utils.ts; splitting the orchestrator further fragments cohesion and
// risks animation regressions needing on-device verification (see SPEC.md). A deliberate exception.
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, Platform, Pressable, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Animated, { Easing, FadeIn, runOnJS, useAnimatedStyle, useDerivedValue, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccentProvider, useAccentTint } from '../components/accent';
import { ArtImage } from '@/components/art-image';
import { DesignStage } from '@/components/design-stage';
import { useLayout } from '@/hooks/use-layout';
import { computeStageScale } from '@/lib/stage-scale';
import { PressableArt } from '@/components/pressable-art';
import { Body, Display, Rune } from '@/constants/theme';
import { box, SHEET_DESIGN_HEIGHT, SHEET_DESIGN_WIDTH } from '@/lib/design';
import { type PipState, resolveHearts, resolvePips } from '@/lib/pips';
import { type CharacterFile, type CustomCardDef, numberInputFor, toSheetCharacter } from '@/lib/character-file';
import { CATALOG, cardById } from '@/data/catalog';
import { CLASSES, classInfo } from '@/constants/identity';
import { classExpansion } from '@/lib/expansions';
import { CLASS_CARDS } from '@/features/create/components/class-cards';
import { CLASS_DATA, featurePages } from '@/data/class-data';
import { armorById, weaponById } from '@/data/equipment-data';
import { lootById } from '@/data/loot-data';
import { applyWildshapeCost, isWildshapeId, WILDSHAPES, wildshapeById } from '@/data/wildshape-data';
import { hasMartialForm, isMartialStanceId, MARTIAL_FOCUS_CARD_ID } from '@/data/martial-form-data';
import { type CardEffect, tierForLevel } from '@/lib/modifiers';
import { restMoveLimit } from '@/lib/rest';
import { playSfx } from '@/lib/sfx';
import { cardHasEffects, cardToLibraryCard, cardTakesNumberInput, catalogIdOf, contentIdOf, editableCardIds, effectsForCardId, findEditableCard, heldCardIds, isPermanentCard, refOf, sourceLabelForCardId, usesFormulaVariable } from '@/features/cards/card-effects';
import { applyPromotions, resolveCopyDeletions } from '@/lib/card-copies';
import { imageForPrint, type PdfCard } from '@/lib/card-pdf';
import { equipNoticeFor } from '@/data/card-notices';
import { showToast } from '@/components/toast';
import { NumberKeypad } from './number-keypad';
import { GoldCard } from '@/features/create/components/gold-card';
import { CompanionFacetCard, companionCardId, type CompanionFacet } from '../components/companion-card';
import { isClassTrackerId, SummonerTrackerCard, SUMMONER_TRACKER_ID, WarlockTrackerCard, WARLOCK_TRACKER_ID } from '../components/class-tracker-card';
import { MartialFocusCard } from '../components/martial-focus-card';
import { companionOf, companionPicksPerLevel, hasCompanion } from '@/lib/companion';
import { addFavorite, FAVORITES_CATEGORY, hasFavorites as fileHasFavorites, isFavorited, orphanedFavoriteIds, removeFavoriteByRef, removeFavoriteCopies } from '@/lib/favorites';
import { RuneLoader } from '@/components/rune-loader';
import { ChamferBox } from '@/components/chamfer-box';
import { LoadingScreen } from '@/components/loading-screen';
import { RuneButton } from '@/components/rune-button';
import { CenterDialog } from './full-screen-panel';
import { SortPanel } from './sort-panel';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';
import { CategoryIconSvg } from './category-icons';
import { type Expansion, type LibraryCard } from '@/lib/library';
import { libraryCardById } from '@/lib/library-embed';
import { type MoodboardItem, readMoodboard } from '@/lib/moodboard';
import { MOODBOARD_BG, MoodboardScreen } from '../moodboard/moodboard-screen';
import { cardChoiceFor } from '@/data/card-choices';
import { embedCardImageForNfc } from '@/lib/image-embed';
import {  nfcModulesPresent } from '@/lib/nfc';
import type { RkpContent } from '@/lib/rkp';
import { NfcSendModal } from '@/features/share/nfc-modal';
import { NfcReceiveCeremony, SheetNfcReceiver } from './nfc-receive-ceremony';
import { CardChoiceDialog } from './card-choice-dialog';
import { useKeyboardControl } from './use-keyboard-control';
import { useForgedSnapshots } from '@/features/create/components/forged-snapshots';
import { buildDeckJobs } from './deck-jobs';
import { PrintableImage, PrintStage, type PrintStageHandle } from '@/features/create/components/print-stage';
import { usePrintJob } from '@/features/share/print-job';
import { Art } from '../art';
import { armorTrackLayout, chipWidth, trackBounds, washBands } from './sheet-utils';
import { type CarouselApi, CarouselProvider, useCarousel } from '../carousel-context';
import { activeRing, availableCategories, categoryLabel } from '../carousel-categories';
import { OverlayHost } from '@/components/overlay-host';
import { OverlayShell } from './overlay-shell';
import { BUILTIN_CATEGORIES, type CardCategory, type CardItem, dedupeIds, isBuiltinCategory, printFaces } from '../card-data';
import { isExperienceType } from '../card-types';
import { type Character, SAMPLE_CHARACTER } from '../character';
import { FillText, SheetText } from '../components/primitives';
import { CardCarousel } from '../components/card-carousel';
import { CarouselTokenBoard } from '../components/card-token-board';
import type { PlacedToken } from '../components/card-tokens';
import { ChargeTrack, type ChargeTrackHandle } from '../components/charge-track';
import { HeartTrack, type HeartTrackHandle } from '../components/heart-track';
import { SheetFrame } from '../components/sheet-frame';
import { TraitBanners } from '../components/trait-banners';
import { DiceTray, type DiceTrayHandle } from './dice-tray';
import { DicePresetSlots } from './dice-preset-slots';
import { type DicePreset, modifierValue, slotsOf, writeSlot } from '@/lib/dice-presets';
import { ChamferFrame, GoldRule, GoldRuleV } from './chamfer';
import { FrameSvg, ProvidedFrame } from './frame-svgs';
import * as ImagePicker from 'expo-image-picker';

import { ownImage } from '@/lib/owned-image';
import { compactHistory, emptyHistory, type CharacterHistory, readHistory, record, recoverableCards, type RecordIntent, restoreCard, rewind as rewindHistory, stripHistory } from '@/lib/character-history';
import { saveCharacter } from '@/lib/character-store';
import { DamagePanel } from './damage-panel';
import { FloatMenuOverlay, FloatMenuProvider, FloatMenuTrigger, FloatPlaceholder, useFloatMenu, type PlaceholderKind } from './float-menu';
import { type CardDraft, randomCardColor } from '@/components/card-editor';
import { useScreenDim, useScreenEdge } from '@/lib/screen-dim';
import { type CardTarget, NewCardFlow } from './new-card-flow';
import { EditCardFlow } from './edit-card-flow';
import { LevelUpPanel } from './level-up-panel';
import { RestPanel } from './rest-panel';
import type { DomainCardInfo } from './domain-card-info';
import { StatePanel } from './state-panel';
import { CardDestination } from './card-destination';
import { CardManagementPanel, Confirm, MoveSheet } from './card-management-panel';
import { type CardMenuKind } from '../card-menu';
import { diffStatToasts, type StatToast, StatToastHost } from './stat-toasts';
import { CardModifiersSheet } from './card-modifiers-sheet';
import { PortraitImage, PortraitTapButton, type PortraitTransform } from './portrait-image';

// A generic require for the GOLD card's never-drawn source/thumb (it renders its live node). The old
// temp item image was deleted (#248 item 4) — cards with no art now fall back to their panel colour.
const GENERIC_CARD_ART = require('../../../../assets/images/icon.png') as number;

// All sheet colors come from the Rune palette (no raw hex, per AGENTS / H3).
const SHEET = Rune.sheet;
const INK = Rune.inkText;
const RED = Rune.red;
const GOLDD = Rune.goldEdge;
const IVORY = Rune.sheet;
const BRONZE = Rune.bronze; // deep gold labels on parchment (AA at small sizes, L3)

const armorArt = (s: PipState) => (s === 'depleted' ? Art.armorDepleted : s === 'locked' ? Art.armorLocked : Art.armorIcon);
// R3: push locked pips clearly grey so they read apart from the red 'depleted' art at the smallest size.
const lockedGray = (s: PipState) => (s === 'locked' ? '#6E6A64' : undefined);

/** #311: Beastform belongs to Druids AND anyone who multiclassed into Druid (they gain the class
 *  feature). Used to gate the wildshape deck + the Beastform category for both. */
const hasBeastform = (f: { className: string; multiclassName?: string }) => f.className === 'druid' || f.multiclassName === 'druid';

/**
 * A stress pip (#70 C → #77): a 44x22 CHAMFERED shape (45° cuts like the domain chips — never
 * rounded), the SAME size for every state. The marked pip adds a FLAT thin under-line spanning
 * only the straight middle of the bottom edge — the chamfered corner spans are excluded.
 */
/** Cosmetic decoration: stick-on tokens, and the moodboard. Nothing that builds a deck reads any
 *  of it (v0.33.1, moodboard v0.34.0). */
const TOKEN_FIELDS = new Set(['cardTokens', 'tokenColor', 'tokenDrawerX', 'moodboard', 'moodboardAsPortrait', 'moodboardColor']);

/** Whether `next` differs from `prev` in the token fields and nowhere else. */
function onlyTokensChanged(prev: CharacterFile | null | undefined, next: CharacterFile | null | undefined): boolean {
  if (!prev || !next) return false;
  const a = prev as unknown as Record<string, unknown>;
  const b = next as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let touched = false;
  for (const k of keys) {
    if (a[k] === b[k]) continue;
    if (!TOKEN_FIELDS.has(k)) return false;
    touched = true;
  }
  return touched;
}

function StressPip({ state, red }: { state: PipState; red: string }) {
  // The FILLED shapes give the chamfer polygon a SAME-COLOUR stroke so it renders as one seamless SVG
  // shape. The plain-View chamfer (#328) left hairline seams where its corner triangles abut the body
  // (owner) — and the outlined pips below are already SVG, so this adds no worst-case canvas.
  if (state === 'locked') {
    return <ChamferFrame left={0} top={0} width={44} height={22} chamfer={5} fill={Rune.muted} stroke={Rune.muted} strokeWidth={2} />;
  }
  if (state === 'active') {
    return (
      <>
        <ChamferFrame left={0} top={0} width={44} height={22} chamfer={5} fill={red} stroke={red} strokeWidth={2} />
        {/* flat thin under-line — center span only, corners excluded */}
        <View style={[box(5, 25, 34, 1), { backgroundColor: red }]} pointerEvents="none" />
      </>
    );
  }
  // Sheet-colored fill, not transparent (#93): a grown/shaking available pip must read as a solid
  // shape, not an empty frame with the background showing through.
  return <ChamferFrame left={0} top={0} width={44} height={22} chamfer={5} fill={IVORY} stroke={red} strokeWidth={2} />;
}

/** Hope's THIN gold line stopping at the last filled diamond — the diamonds themselves live in a
 *  ChargeTrack now (#89 D). */
/**
 * An UNFILLED Hope rhombus (v0.32.1): the gold outline over an opaque parchment core.
 *
 * The art is a hollow diamond, so an empty slot was see-through. That was invisible at rest, because
 * what is behind it is the parchment anyway, and obvious the moment one grew: holding a slot to gain
 * Hope scales it up over the gold rule that runs behind the track, and the rule showed straight
 * through the middle of it. Filling the core with the sheet's own parchment is the cheapest fix that
 * survives the scale, and it matches what an unfilled Stress pip has always done.
 *
 * The core is a square rotated 45° and inset 17%, which lands just inside the outline's inner edge:
 * any smaller leaves a visible transparent ring, any larger pokes out at the corners.
 */
function HopeEmpty() {
  return (
    <View style={{ flex: 1 }}>
      <View pointerEvents="none" style={{ position: 'absolute', left: '17%', top: '17%', right: '17%', bottom: '17%', backgroundColor: SHEET, transform: [{ rotate: '45deg' }] }} />
      <ArtImage source={Art.hopeDepleted} fit="contain" />
    </View>
  );
}

function HopeRule({ left, top, width, count, active, pip }: { left: number; top: number; width: number; count: number; active: number; pip: number }) {
  const step = (width - pip) / (count - 1);
  const lastFilled = Math.max(0, Math.min(count, active) - 1);
  const lineW = lastFilled * step;
  if (lineW <= 0) return null;
  return <GoldRule left={left + pip / 2} top={top + pip / 2 - 0.5} width={lineW} color="rgba(200,146,58,0.55)" thickness={1} />;
}

/** A domain name in its own small chamfered red chip (#37) — the project's flat, 45°-cut signature. */
function DomainChip({ left, top, label }: { left: number; top: number; label: string }) {
  const w = chipWidth(label);
  return (
    <>
      <ChamferFrame left={left} top={top} width={w} height={20} chamfer={5} fill={RED} stroke="transparent" strokeWidth={0} />
      <SheetText left={left} top={top} width={w} height={20} color={IVORY} size={10} family={Body.bold} align="center" uppercase letterSpacing={0.6} numberOfLines={1}>
        {label}
      </SheetText>
    </>
  );
}

/** An octagon badge (image-6), stretched a touch wider than tall so the origin strip reads as a
 *  deliberate band next to the big bio text (#48 D): tappable → opens the associated card (D4). */
function OctaBadge({ left, top, w, h, icon, glyph, label, onPress, a11y, active }: { left: number; top: number; w: number; h: number; icon?: number; glyph?: React.ReactNode; label: string; onPress?: () => void; a11y?: string; active?: boolean }) {
  return (
    <>
      <PressableArt style={box(left, top, w, h)} pressedScale={1.12} onPress={onPress} accessibilityLabel={a11y ?? `${label}, open card`}>
        {/* v0.11.1 item 8: a proper CHAMFERED-RECTANGLE frame (not the octagon) with a thin gold outline.
            Its fill IS the button, so the TOGGLED-ON state (Favorites showing) fills the whole shape —
            no more small inner rectangle. */}
        <ChamferBox
          chamfer={9}
          stroke={active ? Rune.goldBright : Rune.goldEdge}
          strokeWidth={1.4}
          fill={active ? 'rgba(218,162,73,0.32)' : 'transparent'}
          style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: w * 0.62, height: h * 0.62, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
            {glyph ? glyph : icon != null ? <ArtImage source={icon} fit="contain" /> : null}
          </View>
        </ChamferBox>
      </PressableArt>
      <SheetText left={left - 12} top={top + h + 2} width={w + 24} height={12} color={BRONZE} size={8} family={Body.bold} align="center" uppercase numberOfLines={1}>
        {label}
      </SheetText>
    </>
  );
}

// v0.9.8 action-badge glyphs (replace the origin badges): a card-with-plus and a shield-with-plus.
/**
 * The hit points panel's corner control (v0.40.0, owner).
 *
 * It was a circled "i", which named the wrong thing: the control opens the damage calculator, and a
 * lower-case i opens an explainer. A sword says what the number it asks for is, and it is the one
 * glyph on the sheet that can be read at 14dp.
 *
 * Drawn to sit INSIDE the red corner it is painted on, so nothing of it reaches the parchment: the
 * blade runs corner to corner along the diagonal the red triangle already has, which is why it fits
 * a shape that has only half a square to work with.
 */
function ThresholdSword() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 16 16">
      {/* blade, point to the top right along the corner's diagonal */}
      <Polyline points="3.4,12.6 12.4,3.6" fill="none" stroke={IVORY} strokeWidth={2.1} strokeLinecap="round" />
      <Polyline points="12.9,3.1 13.6,2.4 13.1,5.2 10.3,5.7" fill="none" stroke={IVORY} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {/* crossguard, square to the blade */}
      <Polyline points="2.2,8.4 6.9,13.1" fill="none" stroke={IVORY} strokeWidth={1.5} strokeLinecap="round" />
      {/* pommel */}
      <Circle cx={2.2} cy={13.4} r={1.25} fill="none" stroke={IVORY} strokeWidth={1.4} />
    </Svg>
  );
}

function AddCardGlyph() {
  // v0.11.2 item 2: a plain, wider card that's a touch TALLER (was reading too square) + a centered plus.
  return (
    <Svg width={26} height={30} viewBox="0 0 24 28">
      <Path d="M5 3 H19 V25 H5 Z" fill="none" stroke={BRONZE} strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M12 9 V19 M8 14 H16" stroke={BRONZE} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}
function AddGearGlyph() {
  // v0.11.2 item 2: scaled to match the (taller) Add Card glyph.
  return (
    <Svg width={26} height={30} viewBox="0 0 24 28">
      <Path d="M12 3.5 L19 6.5 V13 C19 19 15.5 22.5 12 24.5 C8.5 22.5 5 19 5 13 V6.5 Z" fill="none" stroke={BRONZE} strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M12 10 V17 M8.5 13.5 H15.5" stroke={BRONZE} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/** The Favorites star badge (v0.9.8): opens the Favorites category via the carousel context (a normal
 *  ring member when enabled, a transient detour when disabled). Lives in the slot freed by removing the
 *  Community origin badge. */
function FavoritesBadge({ left, top, w, h }: { left: number; top: number; w: number; h: number }) {
  const { openFavorites, category } = useCarousel();
  const active = category === 'favorites'; // v0.10.7: the star shows TOGGLED while the hidden mirror is up
  return <OctaBadge left={left} top={top} w={w} h={h} active={active} glyph={<CategoryIconSvg iconKey="star" size={30} />} label="Favorites" onPress={openFavorites} a11y={active ? 'Favorites showing. Return to your cards' : 'Show favorites'} />;
}

type TrackKey = 'stress' | 'armor' | 'hope';

/** Hit points, stress and hope, fading together as the dice tray takes their place (v0.39.0). */
function VitalsGroup({ hidden, children }: { hidden: boolean; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const fade = useSharedValue(1);
  useEffect(() => {
    fade.value = reduced ? (hidden ? 0 : 1) : withTiming(hidden ? 0 : 1, { duration: 240, easing: Easing.out(Easing.cubic) });
  }, [hidden, fade, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: fade.value }));
  return (
    <Animated.View style={[box(0, 0, SHEET_DESIGN_WIDTH, SHEET_DESIGN_HEIGHT), style]} pointerEvents={hidden ? 'none' : 'box-none'}>
      {children}
    </Animated.View>
  );
}

function RedesignedBody({ character, onHp, onTrack, onInfo, heartRef, stressRef, armorRef, hopeRef, onPortraitTransform, onPortraitReplace, onOpenBoard, onAddCard, onAddGear, onFavoritesBlocked, diceUp }: { character: Character; onHp: (n: number) => void; onTrack: (key: TrackKey, active: number) => void; onInfo: () => void; heartRef: React.Ref<HeartTrackHandle>; stressRef: React.Ref<ChargeTrackHandle>; armorRef: React.Ref<ChargeTrackHandle>; hopeRef: React.Ref<ChargeTrackHandle>; onPortraitTransform: (t: PortraitTransform) => void; onPortraitReplace: () => void; onOpenBoard: () => void; onAddCard: () => void; onAddGear: () => void; onFavoritesBlocked: () => void; /** v0.39.0: the dice tray has taken the three vitals panels' places. */ diceUp: boolean }) {
  const tint = useAccentTint();
  // v0.10.7: the hidden Favorites mirror can't take new cards — Add Card / Add Gear toast instead of
  // authoring a copy into the mirror. `category` comes from the carousel (this body is inside it).
  const { category: liveCategory } = useCarousel();
  const guardFav = (fn: () => void) => () => { if (liveCategory === 'favorites') { onFavoritesBlocked(); return; } fn(); };

  // Every resource now uses the boundary-only ±1 hold/double-tap model (#81 hearts, #89 the rest).
  // Only the hearts the character can ever fill are drawn (#107): maxHp 4 → four hearts, no
  // ghost fifth/sixth; above 6 the fixed six slots carry golden overflow as before.
  const heartSlotCount = Math.min(character.heartSlots, Math.max(1, character.maxHp));
  const hp = resolveHearts(character.hp, heartSlotCount); // hearts + readout derived from HP (§1A)
  const stress = resolvePips({ total: character.stress.total, active: character.stress.active, locked: character.stress.locked, depletedRemainder: true });
  const armor = resolvePips({ total: character.armor.total, active: character.armor.active, locked: character.armor.locked, depletedRemainder: true });
  const hope = resolvePips({ total: character.hope.total, active: character.hope.active, depletedRemainder: true });
  // v0.32.1: the shields size and lay themselves out from how many the character actually has.
  const armorRow = armorTrackLayout(character.armor.total - (character.armor.locked ?? 0));
  // v0.13.0 SCARS: the rightmost `scars` Hope slots are dead — greyed, disconnected, never markable.
  // Flat count from the modifier engine (one per enabled "Add Scar" card); acts like trailing locked slots.
  const scars = Math.max(0, Math.min(character.hope.total, character.scars ?? 0));

  return (
    <>
      {/* Parchment ground — CHAMFERED (45° cut) corners, not rounded, matching the gold frame and
          the project signature; this also kills the ivory corner seam (C7). */}
      <ChamferFrame left={0} top={0} width={412} height={892} chamfer={18} fill={SHEET} stroke="transparent" strokeWidth={0} />

      {/* Defense panel ART (image-11: pointy left ribbon, no baked dividers — #30 H). Drawn BEFORE
          the portrait so its tail tucks UNDER the portrait diamond instead of occluding it; the
          panel's texts/pips live in the defenses section below. */}
      {/* Stretched 5px DOWN only so it stands level with the portrait frame (#48 C). */}
      {/* v0.40.0: the panel gives up the portrait's five px from its LEFT. Its right edge is the one
          every other element on this band is aligned to, so it does not move; the art simply gets
          shorter. Its texts and shields stay exactly where they were (owner). */}
      <ProvidedFrame Svg={FrameSvg.ArmorBg} left={105} top={200} w={291} h={95} />

      {/* ---------- header: portrait + deck toggle, ONE locked group (#43 G) ----------
          Sized to the midpoint of the last two iterations (163x295 grew over the defense panel;
          138x270 was too small). The toggle's position scales WITH the frame so the pair never
          drifts apart. No press bounce on either, per owner — plain Pressables. The toggle sits
          ON TOP (bigger symbol + generous hitSlop); the portrait keeps its full-frame hitbox
          underneath. */}
      {/**
        * v0.40.0 (owner): x=21, not 16.
        *
        * The portrait's frame and the hit points panel are the two strongest vertical edges on the
        * sheet and they did not line up: the frame's box began at 16 and the panel's at 21, so the
        * portrait hung five design px into the margin. Everything to the RIGHT of it moves with it
        * (the bio column, the badges, the float-menu diamond) and anything whose right edge already
        * sits on the panel's right edge at 396 keeps that edge and loses the five from its width,
        * because that edge was correct and is what the whole upper band is measured against.
        */}
      <View style={box(21, 12, 150, 282)}>
        {/* the player's photo, clipped to the portrait mask, UNDER the gold frame (#135). When set
            it's INTERACTIVE (drag/pinch/hold-to-replace, #155); when not, a tap-to-add Pressable. */}
        {character.portraitUri ? (
          <View style={box(0, 3, 148, 222)}>
            <PortraitImage uri={character.portraitUri} width={148} height={222} transform={character.portraitTransform} onTransform={onPortraitTransform} onReplace={onPortraitReplace} onOpenBoard={onOpenBoard} />
          </View>
        ) : (
          <PortraitTapButton style={StyleSheet.absoluteFill} onPress={onPortraitReplace} onOpenBoard={onOpenBoard} accessibilityLabel="Character portrait. Add a photo">
            <ArtImage source={Art.portraitPlaceholder} fit="contain" style={{ position: 'absolute', left: 41, top: 48, width: 67, height: 100 } as never} />
          </PortraitTapButton>
        )}
        {/* gold frame ON TOP, but pointer-events none so the photo's drag/pinch gestures pass through */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <ArtImage source={Art.portraitFrame} fit="fill" />
        </View>
        {!character.portraitUri ? (
          <SheetText left={0} top={155} width={150} height={15} color={BRONZE} size={12} family={Body.bold} align="center" uppercase letterSpacing={0.6} numberOfLines={1}>
            + Tap to add
          </SheetText>
        ) : null}
      </View>

      {/* ---------- top-right bio column: name → domain chips → lvl/prof → origin strip ----------
          The whole column starts at x176, close to the portrait (the 190 gap read as dead space,
          #48 D), and spans to the defense panel's right edge (396). */}
      {/* Name stretches to the panel's right edge; sits ABOVE the frame layer (C2). */}
      <View style={{ zIndex: 2100 }}>
        {/* FILL the box (#214): the largest font that fits — a SHORT one-word name grows up to fill
            the row, a LONG name shrinks + wraps to ≤2 lines (no more one tiny line). Glyphs are only
            sized, never stretched; a touch of letter-spacing for openness. */}
        <FillText left={181} top={12} width={215} height={58} color={INK} family={Display.black} align="left" vAlign="center" uppercase letterSpacing={0.3} maxLines={2} minSize={15} maxSize={60}>{character.name}</FillText>
      </View>
      {/* Domains as two separate chamfered chips (no ×) under the name (#37). v0.11.2: pulled up toward
          the name so name → domains → lvl read as one tight group, freeing negative space before the badges. */}
      <DomainChip left={181} top={71} label={character.domains[0]} />
      <DomainChip left={181 + chipWidth(character.domains[0]) + 8} top={71} label={character.domains[1]} />
      {/* Level/class + proficiency lines between the chips and the badges — nudged 3px up for
          clear air above the origin strip (#54 E). */}
      {/* One size smaller + a taller box than the glyphs need (#95 B): native line metrics ran
          taller than web's and the 17px box clipped the descender band off "LVL 4 SORCERER". */}
      {/* level/class + proficiency on ONE line now (#128): "Prof" abbreviation, no arrow, middot
          separator — the freed vertical space goes to the (taller, squarer) origin badges below. */}
      <SheetText left={181} top={95} width={219} height={18} color={INK} size={12} family={Body.bold} align="left" uppercase letterSpacing={0.4} numberOfLines={1} fit minScale={0.85}>
        Lvl {character.level} {character.className} · Prof {character.proficiency}
      </SheetText>

      {/* Origin strip (#48 D, per /impeccable): three stretched octagons, fitted labels beneath,
          thin gold rules in the gaps. Shrunk down-and-left (48x40 at an 78px pitch, #54 E) so the
          COMMUNITY octagon and its label stay inside the panel's right edge (396) on NATIVE glyph
          widths, not just web. */}
      {/* #100: each badge opens ITS pinned origin card (last three of the abilities hand); if the
          Inventory deck is up, the switch animation plays first, then the card flies up. */}
      {/* taller, squarer badges (#128): they rise into the space the proficiency line used to take */}
      {/* #248 item 10: badges + their dividers nudged 4px DOWN for clear air under the level/prof line. */}
      {/* v0.9.8: the Ancestry/Community/Subclass origin badges are replaced — same three slots — by the
          card-management actions: Add Card (author for the current category), Add Gear (catalog), and
          Favorites (star). The two dividers stay so the trio still reads as one banded group. */}
      <OctaBadge left={181} top={126} w={48} h={48} glyph={<AddCardGlyph />} label="Add Card" onPress={guardFav(onAddCard)} a11y="Add a card to the current category" />
      <OctaBadge left={259} top={126} w={48} h={48} glyph={<AddGearGlyph />} label="Add Gear" onPress={guardFav(onAddGear)} a11y="Add gear from the catalog" />
      <FavoritesBadge left={337} top={126} w={48} h={48} />
      <GoldRuleV left={244} top={134} height={32} color="rgba(200,146,58,0.5)" thickness={1.6} />
      <GoldRuleV left={322} top={134} height={32} color="rgba(200,146,58,0.5)" thickness={1.6} />

      {/* ---------- Evasion + Armor — image-11 ribbon panel (#30 H) ----------
          Art is drawn earlier (under the portrait diamond); content sits clear of the left tail.
          No armor-score number — shields only, per owner. */}
      {/* Contents nudged 3px into the taller panel and CENTERED as a band (#48 C): titles level,
          and the evasion numeral's vertical center matches the shield rows' center — the two
          halves read as one piece. */}
      {/* v0.41.0 (owner): the panel stays, its CONTENTS change. Evasion and the shields are no use
          mid-throw, so while the dice are out they give way to the three roll presets, which line up
          with the badges above them. Same fade as the vitals, so the whole band changes together. */}
      <VitalsGroup hidden={diceUp}>
      <SheetText left={158} top={213} width={84} height={15} color={Rune.goldText} size={11} family={Body.bold} align="center" uppercase letterSpacing={0.8}>Evasion</SheetText>
      <SheetText left={158} top={231} width={84} height={44} color={IVORY} size={38} family={Display.black} align="center" tabularNums>{character.evasion}</SheetText>
      {/* the ONE separator — between Evasion and Armor, clear of the shields */}
      <GoldRuleV left={250} top={217} height={64} />
      <SheetText left={262} top={213} width={100} height={15} color={Rune.goldText} size={11} family={Body.bold} align="left" uppercase letterSpacing={0.8}>Armor</SheetText>
      {/* Armor (#89 E): zone mode — the shields are too small to hunt, so two big halves split at
          the barrier after the LAST filled shield own the gestures: left of it clears, right of it
          marks, verticality irrelevant. Each shield still charges/animates individually. */}
      {/* v0.32.1: at five armor or fewer the shields are a single, bigger row of exactly the ones you
          have. Twelve small shields for a character with three was a wall of grey with the live ones
          lost in it. See armorTrackLayout. */}
      <ChargeTrack
        ref={armorRef}
        left={262}
        top={234}
        slots={armorRow.slots}
        w={armorRow.size}
        h={armorRow.size}
        upIndex={trackBounds(character.armor).up}
        downIndex={trackBounds(character.armor).down}
        onUp={() => onTrack('armor', character.armor.active + 1)}
        onDown={() => onTrack('armor', character.armor.active - 1)}
        renderSlot={(i) => <ArtImage source={armorArt(armor[i] ?? 'locked')} fit="contain" tint={lockedGray(armor[i] ?? 'locked')} />}
        renderFilled={() => <ArtImage source={armorArt('active')} fit="contain" />}
        renderEmpty={() => <ArtImage source={armorArt('depleted')} fit="contain" />}
        flavor="armor"
        accent={tint ?? RED}
        grow={4.2}
        crossUpAt={0.45}
        zone={{ left: -10, top: -8, width: 142, height: 56 }}
        trackLabel="Armor"
      />
      </VitalsGroup>

      {/* v0.39.0: hit points, stress and hope are ONE fading group, because the dice tray takes all
          three of their places at once. The wrapper spans the whole design and is transparent, so
          every child keeps the exact coordinates it was authored at; `box-none` means the wrapper
          itself catches nothing and its children go on catching everything, right up until the tray
          switches the whole group off. */}
      <VitalsGroup hidden={diceUp}>
      {/* ---------- HP — hearts fit inside the frame, spaced ----------
          Panel raised 5px: the gap to the portrait/armor band above shrinks ~30% (#37). */}
      {/* Left edge pulled in 3px — the frame overshot the sheet's left rhythm (#43 I). */}
      <ProvidedFrame Svg={FrameSvg.HpBar} left={21} top={301} w={373} h={84} />
      {/* Info button: SMALL, fully inside the red corner (the old 17px ring bled onto the parchment
          and half-vanished, #43 I); slightly thicker ring so it still reads. Generous hitSlop keeps
          it easy to hit. Opens the HP explainer overlay (NOT the carousel's random-card path). */}
      <PressableArt style={box(26, 304, 14, 14)} pressedScale={1.2} hitSlop={16} onPress={onInfo} accessibilityLabel="Damage thresholds" accessibilityHint="Opens the damage calculator">
        <ThresholdSword />
      </PressableArt>
      {/* Label raised a touch + one size smaller (#48 E); it and the readout share ONE left column
          (#43 I/K): the numbers sit directly under HIT POINTS and never grow past its width. */}
      <SheetText left={48} top={315} width={140} height={15} color={INK} size={12} family={Body.bold} align="left" uppercase letterSpacing={1.2}>Hit Points</SheetText>
      {/* One tight cluster, BOTTOM-aligned with the heart row's bottom edge (368) per owner (#48 E)
          — red current, smaller ink "/ max"; the current numeral steps down a size at double digits
          so 12/12 still fits under the label (#30 I/#43 I). */}
      <View style={[box(48, 330, 92, 38), { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-start', overflow: 'hidden' }]} pointerEvents="none">
        {/* v0.22.0: a third step at 3 digits. The box is 92 wide and can't grow — x=140 is HeartTrack —
            and maxHp has no clamp, so homebrew stacking reaches 100+ and used to clip silently. */}
        <Text numberOfLines={1} style={{ fontSize: hp.current >= 100 ? 20 : hp.current >= 10 ? 28 : 32, color: tint ?? RED, fontFamily: Display.black, fontVariant: ['tabular-nums'] }}>{hp.current}</Text>
        <Text numberOfLines={1} style={{ marginLeft: 5, fontSize: character.maxHp >= 100 ? 14 : 24, color: INK, fontFamily: Display.bold, fontVariant: ['tabular-nums'] }}>/ {character.maxHp}</Text>
      </View>
      {/* Hearts sit 10px further left (#30 I); states + readout both derive from HP (D1/§1A). */}
      <HeartTrack ref={heartRef} left={140} top={333} width={235} pip={35} hp={character.hp} slots={heartSlotCount} maxHp={character.maxHp} accent={tint ?? RED} onHp={onHp} />

      {/* ---------- Stress — inset frame, two rows spread across the panel ----------
          Panel 20px shorter with the pips trimmed to match (34->26 tall) — flatter, more
          rectangular marks per owner (#43 J); 44 wide with hope-equal 12px gaps (#37). */}
      <ChamferFrame left={22} top={396} width={368} height={108} chamfer={12} stroke={GOLDD} strokeWidth={1.4} />
      {/* Label shares the pips' left edge (44) and gets clear air above them (#48 F). */}
      <SheetText left={44} top={404} width={120} height={16} color={INK} size={13} family={Body.bold} align="left" uppercase letterSpacing={1.2}>Stress</SheetText>
      {/* Chamfered shapes, not SVG art (#67 D → #70 C): red fill + echo line = marked, red
          chamfered outline = available, gray chamfered fill = locked. Same boxes as before. */}
      {/* Stress (#89 C): hold-to-charge boundaries with the lightning flavor — quantized jumps,
          jitter, flicker. Boundary pips reach further on their outward side (sideSlop). */}
      <ChargeTrack
        ref={stressRef}
        left={44}
        top={432}
        slots={stress.map((_, i) => ({ x: (i % 6) * 56, y: Math.floor(i / 6) * 34 }))}
        w={44}
        h={26}
        upIndex={trackBounds(character.stress).up}
        downIndex={trackBounds(character.stress).down}
        onUp={() => onTrack('stress', character.stress.active + 1)}
        onDown={() => onTrack('stress', character.stress.active - 1)}
        renderSlot={(i) => <StressPip state={stress[i]} red={tint ?? RED} />}
        renderFilled={() => <StressPip state="active" red={tint ?? RED} />}
        renderEmpty={() => <StressPip state="depleted" red={tint ?? RED} />}
        flavor="stress"
        accent={tint ?? RED}
        grow={2.65}
        crossUpAt={0.12}
        zone={{ left: -10, top: -10, width: 344, height: 80 }}
        trackLabel="Stress"
      />

      {/* ---------- Hope — aligned with Stress (which is now shorter), thin connecting line ---------- */}
      <ChamferFrame left={22} top={512} width={368} height={84} chamfer={12} stroke={GOLDD} strokeWidth={1.4} />
      <SheetText left={44} top={518} width={120} height={16} color={INK} size={13} family={Body.bold} align="left" uppercase letterSpacing={1.2}>Hope</SheetText>
      <HopeRule left={44} top={544} width={324} count={character.hope.total} active={character.hope.active} pip={44} />
      {/* Hope (#89 D): abrupt but grandiose — instant rays of light + rising twinkling sparks on a
          gain; dimmer rays, falling sparks on a spend. */}
      <ChargeTrack
        ref={hopeRef}
        left={44}
        top={544}
        slots={hope.map((_, i) => ({ x: i * 56, y: 0 }))}
        w={44}
        h={44}
        upIndex={trackBounds(character.hope).up}
        downIndex={trackBounds(character.hope).down}
        onUp={() => onTrack('hope', character.hope.active + 1)}
        onDown={() => onTrack('hope', character.hope.active - 1)}
        renderSlot={(i) =>
          i >= character.hope.total - scars ? (
            // a scarred slot: permanently tainted grey silhouette, dimmed, no gold rule reaches it
            <ArtImage source={Art.hopeDepleted} fit="contain" tint="#6E6E72" style={{ opacity: 0.45 }} />
          ) : hope[i] === 'active' ? (
            <ArtImage source={Art.hope} fit="contain" />
          ) : (
            <HopeEmpty />
          )
        }
        renderFilled={() => <ArtImage source={Art.hope} fit="contain" />}
        renderEmpty={() => <HopeEmpty />}
        flavor="hope"
        accent={Rune.goldBright}
        grow={3.0}
        crossUpAt={0.15}
        crossDownAt={0.12}
        zone={{ left: -10, top: -6, width: 344, height: 56 }}
        trackLabel="Hope"
      />
      </VitalsGroup>

      {/* The deck-toggle trigger (now opens the radial float menu, #161). Lives at the same screen
          spot the old toggle did (header group 16,12 + child 39,211 → absolute 55,223); kept here in
          the body so it paints below the carousel, with its overlay mounted above the carousel. */}
      <FloatMenuTrigger />
    </>
  );
}

interface BackGuardState {
  leaveConfirm: boolean;
  editCardId: string | null;
  cardInfoId: string | null;
  damageOpen: boolean;
  floatKind: PlaceholderKind | null;
  onCloseLeave: () => void;
  onCloseEdit: () => void;
  onCloseCardInfo: () => void;
  onCloseDamage: () => void;
  onCloseFloat: () => void;
  onLeave: () => void;
}

/**
 * Device-back guard (#108/#297): the hardware back button CLOSES the topmost open panel/overlay rather
 * than navigating away (backing out mid-fullscreen used to leak a veil that froze the next screen).
 * Only when EVERYTHING is closed does it raise a leave confirmation. Lives inside the carousel + float
 * menu providers so it can reach both machine states. Latest props are read from a ref so the listener
 * subscribes once (no churn from inline closers).
 */
function SheetBackGuard(props: BackGuardState) {
  const { machineState, closeFullscreen, collapse, editing, exitEdit } = useCarousel();
  const { open: menuOpen, closeMenu } = useFloatMenu();
  const ref = useRef(props);
  ref.current = props;
  const menuOpenRef = useRef(menuOpen);
  menuOpenRef.current = menuOpen;
  const editingRef = useRef(editing);
  editingRef.current = editing;
  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        const p = ref.current;
        // Close the topmost overlay first (most-recently-opened wins), THEN carousel states, THEN leave.
        if (p.leaveConfirm) { p.onCloseLeave(); return true; }
        if (p.editCardId) { p.onCloseEdit(); return true; }
        if (p.cardInfoId) { p.onCloseCardInfo(); return true; }
        if (p.damageOpen) { p.onCloseDamage(); return true; }
        if (p.floatKind) { p.onCloseFloat(); return true; }
        if (menuOpenRef.current) { closeMenu(); return true; }
        // v0.11.2 item 5: Golden Gear Edit is ONE cohesive mode — Back exits ALL of it (dim + banner + row
        // + selection) in a single press, before the plain expanded/collapse states.
        if (editingRef.current) { exitEdit(true); return true; }
        if (machineState.value === 'fullscreen') { closeFullscreen(); return true; }
        if (machineState.value === 'expanded') { collapse(); return true; }
        p.onLeave(); // nothing open → confirm before leaving (never an accidental exit)
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      /**
       * The same guard for a BROWSER's back button (v0.29.1).
       *
       * `BackHandler` is Android's hardware key and nothing else, so on the web the back button, the
       * back gesture and Alt+Left all sailed straight out of the sheet: no confirm, and any open
       * overlay abandoned rather than closed.
       *
       * A page cannot veto a back navigation, so the standard shape is to push one spare history
       * entry on arrival and let the first back consume it. `popstate` then fires with the sheet
       * still mounted, we run exactly the same handler the hardware key runs, and push the spare
       * entry again so the next press is caught too. When the handler decides it is genuinely time
       * to leave it raises the confirm, and the Leave button navigates properly.
       */
      let popGuard: (() => void) | undefined;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.history.pushState({ rkSheet: true }, '');
        const onPop = () => {
          onBack();
          // Re-arm. The entry we just consumed has to be replaced or the next back leaves for real.
          window.history.pushState({ rkSheet: true }, '');
        };
        window.addEventListener('popstate', onPop);
        popGuard = () => window.removeEventListener('popstate', onPop);
      }
      return () => {
        sub.remove();
        popGuard?.();
      };
    }, [machineState, closeFullscreen, collapse, closeMenu, exitEdit]),
  );
  return null;
}

/** Leave-to-character-selection confirmation (#297): reuses the centred chamfer dialog so the device
 *  back button never drops the player out of the sheet by accident. */
function LeaveConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <CenterDialog onClose={onCancel} zIndex={10006}>
      <ChamferBox chamfer={14} fill={Rune.panel} stroke={Rune.red} strokeWidth={1.6} style={{ width: 300, paddingHorizontal: 16, paddingVertical: 16 }}>
        <Text style={{ color: Rune.ivory, fontSize: 16, fontFamily: Display.black, textTransform: 'uppercase', letterSpacing: 0.4 }}>Leave character?</Text>
        <Text style={{ color: Rune.muted, fontSize: 12.5, fontFamily: Body.regular, lineHeight: 18, marginTop: 8 }}>Return to character selection. Your character is saved.</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <RuneButton label="Cancel" kind="ghost" height={42} style={{ flex: 1 }} onPress={onCancel} />
          <RuneButton label="Leave" kind="primary" height={42} style={{ flex: 1 }} onPress={onConfirm} />
        </View>
      </ChamferBox>
    </CenterDialog>
  );
}

/** v0.11.1 items 3 + 6: the Golden Gear Edit heading — a full-bleed DESATURATED banner (only top + bottom
 *  rules; the left/right edges run under the screen border) holding "Edit Mode" + a live "X / Y Cards"
 *  count, with a subtle Deselect All below. Sits mid-screen (the row now rides low at the grind height). */
/** Gap between the steps of a bulk equip/unequip. See `onBulkEquip` for why it is this long. */
const BULK_STEP_MS = 130;

const EDIT_GRAY = '#C4C8D0';
const EDIT_GRAY_DIM = '#9AA0AA';
function EditHud({ file }: { file?: CharacterFile }) {
  const { editing, editMode, raisedIds, decks, category, deselectAll, selectAll } = useCarousel();
  const total = decks[category]?.length ?? 0;
  const sel = raisedIds.size;
  const fade = useAnimatedStyle(() => ({ opacity: editMode.value }));
  // v0.38: the sort panel. Held here rather than in the sheet because it is edit mode's own control,
  // and closing edit mode has to take it with it.
  const [sortOpen, setSortOpen] = useState(false);
  useEffect(() => { if (!editing) setSortOpen(false); }, [editing]);
  if (!editing) return null;
  return (
    <>
    {sortOpen ? <SortPanel file={file} onClose={() => setSortOpen(false)} /> : null}
    <Animated.View pointerEvents="box-none" style={[box(0, 224, 412, 150), { zIndex: 40, alignItems: 'center' }, fade]}>
      {/* full-bleed banner: fill + top/bottom rules only (the side edges sit off-screen under the border) */}
      <View style={{ width: 452, height: 84, backgroundColor: 'rgba(24,28,35,0.9)', borderTopWidth: 1.4, borderBottomWidth: 1.4, borderColor: EDIT_GRAY_DIM, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
        <Text style={{ color: EDIT_GRAY, fontSize: 23, fontFamily: Body.bold, letterSpacing: 4, textTransform: 'uppercase' }}>Edit Mode</Text>
        <Text style={{ marginTop: 5, color: EDIT_GRAY_DIM, fontSize: 12.5, fontFamily: Body.bold, letterSpacing: 1.6, textTransform: 'uppercase' }}>
          {sel > 0 ? `${sel} / ${total} Cards` : `${total} Cards`}
        </Text>
      </View>
      {/* v0.25.0: one control, two jobs. With nothing selected it offers Select All, which is the
          fast path for equipping a new character (select all, then Equip from the card menu); with a
          selection it becomes Deselect All, as before. It never disappears, so the space below the
          banner stops jumping. */}
      {total > 0 ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <Pressable
            onPress={sel > 0 ? deselectAll : selectAll}
            accessibilityRole="button"
            accessibilityLabel={sel > 0 ? 'Deselect all cards' : 'Select all cards'}
            hitSlop={8}
            style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 5, borderRadius: 8, borderWidth: 1.2, borderColor: pressed ? EDIT_GRAY : EDIT_GRAY_DIM, backgroundColor: pressed ? 'rgba(60,66,74,0.9)' : 'rgba(20,24,30,0.7)' })}>
            <Text style={{ color: EDIT_GRAY, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>{sel > 0 ? 'Deselect All' : 'Select All'}</Text>
          </Pressable>
          {/* v0.38 (owner): beside the one that was already there. Dim until there is something to sort,
              rather than absent, so the row does not move as cards are picked. */}
          <Pressable
            onPress={() => { if (sel >= 2) { playSfx('buttonTap'); setSortOpen(true); } }}
            disabled={sel < 2}
            accessibilityRole="button"
            accessibilityLabel="Sort the selected cards"
            accessibilityState={{ disabled: sel < 2 }}
            hitSlop={8}
            style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 5, borderRadius: 8, borderWidth: 1.2, borderColor: sel < 2 ? 'rgba(154,160,170,0.35)' : pressed ? EDIT_GRAY : EDIT_GRAY_DIM, backgroundColor: sel < 2 ? 'rgba(20,24,30,0.4)' : pressed ? 'rgba(60,66,74,0.9)' : 'rgba(20,24,30,0.7)', opacity: sel < 2 ? 0.5 : 1 })}>
            <Text style={{ color: sel < 2 ? EDIT_GRAY_DIM : EDIT_GRAY, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>Sort Selected</Text>
          </Pressable>
        </View>
      ) : null}
    </Animated.View>
    </>
  );
}

function ExpandVeil() {
  const { expandProgress, collapse, editMode, editing } = useCarousel();
  const [blocking, setBlocking] = useState(false);
  const wasBlocking = useSharedValue(false);
  useDerivedValue(() => {
    const b = expandProgress.value > 0.25;
    if (b !== wasBlocking.value) {
      wasBlocking.value = b;
      runOnJS(setBlocking)(b);
    }
  });
  // v0.11.0 item 3: Golden Gear Edit darkens the backdrop ~40% more than before (0.62 → ~0.92) so the
  // curved row + the breathing selection read against a deep dim.
  const style = useAnimatedStyle(() => ({ opacity: Math.min(0.94, expandProgress.value * 0.62 + editMode.value * 0.3) }));
  // When expanded the veil swallows taps on the dimmed sheet (AC2.8) and a tap dismisses the hand;
  // when compact it is inert so the controls underneath stay live. The box is oversized far past the
  // stage (which no longer clips) so the dim reaches the physical screen edges — status-bar area and
  // letterbox margins included — with square corners (#30 B). v0.10.7: in EDIT mode a tap-off must NOT
  // close (owner found it too twitchy) — only a gear tap exits — but the veil still blocks sheet taps.
  return (
    // zIndex 20: above the hearts layer (10), below the carousel (30) — see #87 stacking.
    <Pressable style={[box(-120, -160, 652, 1212), { zIndex: 20 }]} pointerEvents={blocking ? 'auto' : 'none'} onPress={editing ? undefined : collapse}>
      <Animated.View style={[box(0, 0, 652, 1212), { backgroundColor: '#06080d' }, style]} pointerEvents="none" />
    </Pressable>
  );
}

/**
 * ONE shared dim for every sheet overlay (#239 item 9). Driven by "is any sheet overlay open"; it
 * fades both directions. Because it persists across overlays, switching from one panel to another
 * (e.g. New Card → gear catalog) or float-menu → panel keeps the screen dark the whole time — no
 * bright flashbang between scrims. The individual overlays now carry only a transparent tap-catcher.
 * Sits above the sheet (zIndex 9500) but below the overlay panels (10000).
 */
function SheetDim({ up }: { up: boolean }) {
  // v0.24.0: the tablet frame clips, so the margins either side cannot see this. Declare it and
  // PhoneFrame paints the same darkness out there, instead of leaving two bright strips.
  useScreenDim(up ? 0.84 : 0);
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(up ? 1 : 0, { duration: up ? 200 : 220, easing: up ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic) });
  }, [up, p]);
  const style = useAnimatedStyle(() => ({ opacity: p.value * 0.84 }));
  // Oversized so it covers the unclipped stage spill, the status/nav bars, and the letterbox margins.
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -240, bottom: -240, left: -240, right: -240, backgroundColor: '#06080d', zIndex: 9500 }, style]} />;
}

/**
 * The single redesigned sheet (style from the AELIANA mockup): chamfered/flat, red + gold; restored
 * interlocking portrait + dark defense panel; gold level/proficiency banner; octagon origin badges;
 * big resource icons; armor shown as its 12 icons. Accent locked to red (picker UI removed).
 */
export function RedesignedSheet({ character: initial, characterFile }: { character?: Character; characterFile?: CharacterFile }) {
  // The sheet now OWNS character state so the resource tracks can actually be spent/restored (A1).
  // With a CharacterFile it derives the runtime Character from it (#100); resources stay local.
  const [character, setCharacter] = useState(() => initial ?? (characterFile ? toSheetCharacter(characterFile) : SAMPLE_CHARACTER));
  // The character FILE is held in state too (#164): editing it (custom cards, settings, level-up)
  // re-derives the decks live and persists. Runtime resource state (`character`) stays separate so
  // in-play HP/Stress/Hope aren't reset by a file edit.
  const [file, setFile] = useState(characterFile);
  const fileRef = useRef(file);
  fileRef.current = file;
  /**
   * The file as the DECKS see it (v0.33.1): the same object, unless something other than the
   * cosmetic token fields changed.
   *
   * Building the carousel is the expensive thing the sheet does. It rebuilds every forged-card job,
   * every deck and every card element, and it is memoized on the whole `file`, so dropping a token or
   * tapping a die invalidated it and rebuilt the lot. On a phone the deck is bitmaps by then and it
   * mostly gets away with it. In a browser NOTHING is ever forged, so those elements are live cards:
   * svg canvases plus auto-sizing text, dozens of them, re-rendered for a decoration that is drawn by
   * a different layer entirely. That is the rest of the second the owner waited after dropping a
   * token.
   *
   * A shallow reference compare is enough because every writer builds `{ ...f, patch }`, so a
   * token-only change leaves every other value reference-identical. Anything else at all, and the new
   * file is adopted.
   */
  const deckFileRef = useRef(file);
  if (file !== deckFileRef.current && !onlyTokensChanged(deckFileRef.current, file)) deckFileRef.current = file;
  const deckFile = deckFileRef.current;
  // In-play resource persistence (v0.9.7): HP/Stress/Hope/Armor + gold live in the runtime `character`
  // and historically reset to full/default on every load. A ref holds the live values; EVERY disk write
  // STAMPS them onto the file (kept OUT of `file` state so a pip change never re-derives the carousel).
  const liveResRef = useRef<{ hp: number; stress: number; hope: number; armor: number; gold: Character['gold'] }>({ hp: 0, stress: 0, hope: 0, armor: 0, gold: { handfuls: 1, bags: 0, chest: 0 } });
  liveResRef.current = { hp: character.hp, stress: character.stress.active, hope: character.hope.active, armor: character.armor.active, gold: character.gold };
  // Held in a ref (not useCallback) so the many save call-sites don't each need it as a dependency —
  // it only reads refs, so it's safe to treat as stable.
  const saveFileRef = useRef<(next: CharacterFile) => void>(() => {});
  /** `commitFile`, reachable from handlers declared above it (restoring a card can change stats). */
  const commitFileRef = useRef<(next: CharacterFile) => void>(() => {});
  // v0.22.0 — STATE HISTORY. This closure is the single choke point every in-play mutation passes
  // through (creation and import are the only other write entry points), which is what makes "no
  // action is exempt" tractable rather than a 40-site audit.
  const historyRef = useRef<CharacterHistory>(emptyHistory());
  const lastSavedRef = useRef<CharacterFile | null>(null);
  // One-shot intent for changes a diff cannot identify: a rest only moves resources, so it is
  // indistinguishable from a tap on the HP track; a bulk equip arrives as N staggered writes and
  // has to collapse by intent rather than by timing.
  const intentRef = useRef<RecordIntent>({});
  const [historyRev, setHistoryRev] = useState(0);
  saveFileRef.current = (next) => {
    const r = liveResRef.current;
    const stamped: CharacterFile = { ...next, resources: { hp: r.hp, stress: r.stress, hope: r.hope, armor: r.armor }, gold: r.gold };
    const snapshot = stripHistory(stamped);
    const intent = intentRef.current;
    intentRef.current = {};
    historyRef.current = record(historyRef.current, lastSavedRef.current, snapshot, intent);
    lastSavedRef.current = snapshot;
    // Deliberately NO setState here. `mutateFile` calls this from inside a `setFile` updater, which
    // React runs during the render phase, so scheduling an update here would be a render-phase
    // update on another component. The panel reads `historyRef.current` when it mounts (always
    // fresh) and `rewindTo` — a plain callback — is the only path that needs to re-render it.
    void saveCharacter({ ...stamped, history: historyRef.current });
  };
  /** Tag the NEXT save with an explicit intent. */
  const withIntent = useCallback((intent: RecordIntent) => {
    intentRef.current = intent;
  }, []);
  const historySeeded = useRef(false);
  if (!historySeeded.current && characterFile) {
    historySeeded.current = true;
    historyRef.current = readHistory(characterFile.history);
    lastSavedRef.current = stripHistory(characterFile);
    // A character made before v0.22.0 has no history; seed one so its timeline starts somewhere
    // meaningful rather than with whatever it happens to do next.
    if (historyRef.current.entries.length === 0) {
      historyRef.current = record(historyRef.current, null, stripHistory(characterFile));
    }
  }

  /**
   * Restore the character to an earlier point. This does NOT create a history entry — it moves the
   * viewing position and persists; the next real change is what truncates the discarded future.
   * Character-scoped by construction: party vitals, the card library and DM encounters are not
   * touched, and `repairs` carries anything the snapshot couldn't legally restore.
   */
  /**
   * Throw the timeline down to its milestones (owner, v0.34.6).
   *
   * Written through the SAME save the rewind uses, and as a system write: compacting is not itself a
   * moment in the character's story, and recording it would put back the first of the entries it was
   * asked to remove.
   */
  const compactTimeline = useCallback(() => {
    const live = fileRef.current;
    if (!live) return;
    historyRef.current = compactHistory(historyRef.current);
    intentRef.current = { system: true };
    saveFileRef.current(live);
    noticeRef.current?.('Timeline compacted');
  }, []);
  const rewindTo = useCallback((index: number): string[] => {
    const live = fileRef.current;
    if (!live) return [];
    const r = rewindHistory(historyRef.current, index, live);
    historyRef.current = r.history;
    const d = toSheetCharacter(r.file);
    // Remember the restored state in the SAME shape a save produces (v0.27.3): stamped with live
    // resources and gold. Without the stamp the very next automatic save looks like a real edit to
    // the no-op guard in `record`, and truncates the future the player was only browsing.
    lastSavedRef.current = stripHistory({ ...r.file, resources: { hp: d.hp, stress: d.stress.active, hope: d.hope.active, armor: d.armor.active }, gold: d.gold });
    setFile(r.file);
    setCharacter(d);
    void saveCharacter({ ...r.file, history: r.history });
    setHistoryRev((n) => n + 1);
    return r.repairs;
  }, []);

  // v0.22.0 card trash. Derived from history rather than stored, so it cannot drift out of
  // agreement with the character the way a parallel `trashedCards` array would.
  // `historyRev` is deliberately a dependency: history lives in a ref (so the save closure can write
  // it without scheduling a render-phase update), and this bump is what tells the memo it moved.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const trashRecords = useMemo(() => (file ? recoverableCards(historyRef.current, file) : []), [file, historyRev]);
  const noticeRef = useRef<((t: string) => void) | null>(null);
  /**
   * The trash list, with SYSTEM cards named (v0.34.0).
   *
   * A tombstoned catalog card carries no title of its own, because the history model has no catalog
   * to look one up in. It does here.
   */
  const trashList = useMemo(
    () => trashRecords.map((r) => ({ id: r.id, title: (r.collection ? r.title : sourceLabelForCardId(r.id, file!)) || r.title, at: r.at })),
    [trashRecords, file],
  );
  /** The card waiting on a destination before it goes back. */
  const [restoreAsk, setRestoreAsk] = useState<{ id: string; title: string } | null>(null);
  const onRestoreCard = useCallback(
    (id: string) => {
      const rec = trashRecords.find((r) => r.id === id);
      if (!rec) return;
      // Ask FIRST (v0.34.0). Deleting a card drops its category with it, so a restore with no answer
      // put the card wherever its kind defaults to, which is rarely where it was.
      setRestoreAsk({ id, title: trashList.find((t) => t.id === id)?.title ?? rec.title });
    },
    [trashRecords, trashList],
  );
  const doRestore = useCallback(
    (id: string, category: CardCategory) => {
      const cur = fileRef.current;
      const rec = trashRecords.find((r) => r.id === id);
      if (!cur || !rec) return;
      const title = trashList.find((t) => t.id === id)?.title ?? rec.title;
      const next = restoreCard(cur, rec, category);
      withIntent({ kind: 'cards', label: `Restored ${title}` });
      commitFileRef.current(next);
      noticeRef.current?.(`${title} restored`);
    },
    [trashRecords, trashList, withIntent],
  );

  const mutateFile = useCallback((patch: Partial<CharacterFile>) => {
    setFile((f) => {
      if (!f) return f;
      const next = { ...f, ...patch };
      saveFileRef.current(next);
      return next;
    });
  }, []);
  // Persist resource-only changes (HP/Stress/Hope/Armor/Gold) on a debounce so a gold hold / rapid taps
  // coalesce into ONE disk write; flush on app-background + unmount so nothing is lost (v0.9.7).
  const resSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!fileRef.current) return;
    if (resSaveTimer.current) clearTimeout(resSaveTimer.current);
    resSaveTimer.current = setTimeout(() => { if (fileRef.current) saveFileRef.current(fileRef.current); }, 450);
  }, [character.hp, character.stress.active, character.hope.active, character.armor.active, character.gold]);
  useEffect(() => {
    const flush = () => { if (resSaveTimer.current) { clearTimeout(resSaveTimer.current); resSaveTimer.current = null; } if (fileRef.current) saveFileRef.current(fileRef.current); };
    const sub = AppState.addEventListener('change', (s) => { if (s !== 'active') flush(); });
    return () => { sub.remove(); flush(); };
  }, []);
  // Default note (#248 item 4): a brand-new character (notes never touched) is seeded with ONE real,
  // deletable note with a random colour. Guarded on `notes === undefined`, so deleting it (→ []) never
  // re-seeds. Replaces the old synthetic placeholder that used the now-deleted temp item image.
  //
  // v0.29.1: seeded ONCE, from the file as it arrived, and tagged as the app's own write.
  //
  // Reacting to `file` is what broke rewind twice. The creator never writes `notes`, so every
  // character's "was created" snapshot has none. Rewinding to it set `notes` back to undefined, this
  // effect fired again, and THAT write recorded a "Changed cards" entry which truncated the future
  // the panel had just promised was safe to browse. The v0.27.3 no-op guard could never catch it,
  // because the write is real: it even randomises the colour, so it is not idempotent.
  const noteSeeded = useRef(false);
  useEffect(() => {
    if (noteSeeded.current || !file) return;
    noteSeeded.current = true;
    if (file.notes !== undefined) return;
    withIntent({ system: true }); // the app's doing, not the player's: never a timeline entry
    mutateFile({ notes: [{ id: 'note-welcome', title: '', text: 'Use the button below the character portrait to open the cards menu, there you can delete this note and add new ones.', imageUri: null, color: randomCardColor() }] });
  }, [file, mutateFile, withIntent]);
  // Pre-render this character's forged cards on device (#104) so the carousel treats them like any
  // scanned card (uri-based two-LOD pair). The class feature pages become ONE multi-page card in
  // the hand (#108); the experiences are individual cards. Both appear once their bitmaps capture.
  const { featJobs, classJob, mcClassJob, mcFeatJobs, expJobs, weaponJobs, armorJob, invJobs, customCardJobs, acqWeaponJobs, acqArmorJobs, acqLootJobs, acqClassJobs, notesJobs, libJobs, wildshapeFaceJobs, martialJobs } = useMemo(() => buildDeckJobs(deckFile), [deckFile]);
  const allJobs = useMemo(
    () => [...expJobs, ...(classJob ? [classJob] : []), ...(mcClassJob ? [mcClassJob] : []), ...mcFeatJobs, ...featJobs, ...weaponJobs, ...(armorJob ? [armorJob] : []), ...invJobs, ...customCardJobs, ...acqWeaponJobs, ...acqArmorJobs, ...acqLootJobs, ...acqClassJobs, ...notesJobs, ...wildshapeFaceJobs, ...martialJobs],
    [expJobs, classJob, mcClassJob, mcFeatJobs, featJobs, weaponJobs, armorJob, invJobs, customCardJobs, acqWeaponJobs, acqArmorJobs, acqLootJobs, acqClassJobs, notesJobs, wildshapeFaceJobs, martialJobs],
  );
  const { sources: featureSources, stage: forgeStage } = useForgedSnapshots(allJobs);

  // Entry loader (#150): cover the WHOLE sheet until every forged card is captured (so nothing is
  // seen popping in one-by-one), then fade in. A hard fallback guarantees it can't hang.
  /**
   * v0.27.4: the veil no longer waits for the forge, on any platform.
   *
   * It used to hold until EVERY card the character owns had been captured to a bitmap. On web that
   * is nothing at all, which is why the browser opens a sheet promptly. On a phone it is dozens of
   * captures, and since a release invalidates the whole cache it happened again after every update,
   * so the same character opened in a couple of seconds in a browser and took the full seven and a
   * half second fallback on the device it was built for. That is most of what "the web app is faster
   * than the native app" means.
   *
   * There is nothing to wait for. A card that has not been forged yet renders as the live component,
   * which is what the bitmap is a picture OF, so the swap is invisible when it lands. The veil's real
   * job (#168) is to stop the sheet being seen assembling, and that is what the minimum display and
   * the paint grace below do. Forging continues behind the sheet, one card at a time, as it always
   * did.
   */
  const [sheetReady, setSheetReady] = useState(false);
  const [loaderUp, setLoaderUp] = useState(true);
  // The loader was lifting before the body + cards had actually painted (#168): allForged goes true
  // instantly when there's little to forge, so the veil dropped while pieces were still popping in.
  // Hold it for a MIN display, then add a generous paint grace AFTER everything forges so the whole
  // sheet (carousel cards included) is on screen before the fade. Hard fallback so it can't hang.
  const [minDone, setMinDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinDone(true), 1500);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (sheetReady) return;
    if (minDone) {
      const t = setTimeout(() => setSheetReady(true), 1800); // ~1.5s+ of overhead so nothing pops in after the veil lifts
      return () => clearTimeout(t);
    }
  }, [minDone, sheetReady]);
  useEffect(() => {
    const t = setTimeout(() => setSheetReady(true), 7500);
    return () => clearTimeout(t);
  }, []);

  // Pinned at the RIGHT end of the abilities hand: experiences, then the ONE multi-page class
  // feature card, then subclass, ancestry, community in that order (#100/#108). The origin trio
  // stays LAST so the badges (which target the last three) keep pointing at them.
  const { decks: carouselDecks, categoryMeta, originIndices } = useMemo(() => {
    // v0.33.1: the deck-facing view of the file. Reference-identical to `file` unless something
    // other than the cosmetic token fields changed, so a placed token cannot rebuild the whole deck.
    const file = deckFile;
    const none = { decks: undefined as Record<string, CardItem[]> | undefined, categoryMeta: undefined as Record<string, { label: string; icon?: string; builtin: boolean }> | undefined, originIndices: undefined as [number, number, number] | undefined };
    if (!file) return none;
    // v0.10.3: an embedded homebrew card forges into a CardItem in its own structural slot (so origin
    // badges + ordering keep working). `libItem` returns the forged image once ready, else a live node so
    // the card is never momentarily missing. A file with no libraryCards never calls it — identical to before.
    const libItem = (id: string): CardItem | undefined => {
      const j = libJobs.find((x) => x.id === id);
      if (!j) return undefined;
      const src = featureSources[j.key];
      return src ? { id, source: src.full, thumb: src.thumb } : { id, source: GENERIC_CARD_ART, thumb: GENERIC_CARD_ART, live: j.node };
    };
    const catItem = (id: string): CardItem | undefined => {
      const c = cardById(id);
      return c ? { id: c.id, source: c.source, thumb: c.thumb } : undefined;
    };
    /**
     * A forged job as a card, using its bitmap when there is one and the LIVE component when there
     * is not.
     *
     * v0.27.0: the fallback is the whole point. This used to drop any job whose bitmap was missing,
     * which on a phone meant a card appeared a moment late, and in a BROWSER meant it never appeared
     * at all: nothing is ever forged there, so experiences, the class feature card, weapons, armor
     * and the entire starting inventory were silently absent from a hero made in a browser. The
     * embedded-homebrew path above already fell back this way; now every category does, through one
     * helper, so a new one cannot be added without inheriting it.
     */
    const forgedItem = (j: { key: string; node: ReactNode; id?: string }): CardItem => {
      const src = featureSources[j.key];
      const id = j.id ?? j.key;
      return src ? { id, source: src.full, thumb: src.thumb } : { id, source: GENERIC_CARD_ART, thumb: GENERIC_CARD_ART, live: j.node };
    };
    const forgedItems = (jobs: { key: string; node: ReactNode; id?: string }[]) => jobs.map(forgedItem);
    const ids = [file.subclassCardId, file.ancestryCardId, file.communityCardId];
    /**
     * An EMPTY origin id is a step that was SKIPPED, not a broken file (v0.36).
     *
     * Characterize lets the DM skip every step but Class, so a characterized adversary can genuinely
     * have no subclass, no ancestry and no community. This used to bail the whole deck to empty on
     * any missing structural card, which would have left the one kind of character whose cards are
     * the entire point looking at an empty hand.
     *
     * The corrupt-file guard it replaces is kept exactly: an id that IS set and resolves to nothing
     * still bails, because that is a file referring to content the app cannot find.
     */
    const structItems = ids.map((id) => (id ? (catItem(id) ?? libItem(id)) : null));
    if (ids.some((id, i) => id && !structItems[i])) return none;
    // the actual cards the player PICKED at creation (#121: no more sample/placeholder cards) — the
    // two domain cards lead the abilities hand.
    // EVERY owned domain card rides the deck (owner, v0.10.0): the ≤5 cap governs only which are
    // ENABLED/equipped (see the enabledCardIds cap below), never which are visible. Earlier the deck
    // was filtered to the active set (#166 vault), which silently dropped cards gained from level 3+.
    const domainItems = file.domainCardIds
      .map((id) => {
        const c = cardById(id);
        if (c) return { level: c.level ?? 0, domain: c.domain ?? '', item: { id: c.id, source: c.source, thumb: c.thumb } as CardItem };
        const it = libItem(id); // v0.10.3: a custom domain card resolves + sorts by its authored level/domain
        if (!it) return null;
        const lc = file.libraryCards?.find((x) => x.id === id);
        return { level: lc?.level ?? 0, domain: lc?.domain ?? '', item: it };
      })
      .filter((x): x is { level: number; domain: string; item: CardItem } => !!x)
      .sort((a, b) => a.level - b.level || a.domain.localeCompare(b.domain)) // by level (then domain) (#157)
      .map((x) => x.item);
    const expItems = forgedItems(expJobs);
    // Faces in STABLE order [class, ...features] — an un-forged face keeps its slot and renders its
    // live node (no .filter that dropped pages and shifted indices, the #110 missing-page bug).
    const faceJobs = classJob ? [classJob, ...featJobs] : featJobs;
    const faces = faceJobs.map((j) => {
      const src = featureSources[j.key];
      return src ? { source: src.full, thumb: src.thumb } : { custom: j.node };
    });
    /**
     * The cover of a multi-page card: the first forged face if there is one, else the live first page.
     *
     * v0.27.0: this used to REQUIRE a forged face and return nothing without one, so the class
     * feature card did not exist at all in a browser.
     */
    const coverOf = (id: string, pages: { source?: { uri: string }; thumb?: { uri: string }; custom?: ReactNode }[]): CardItem[] => {
      if (pages.length < 2) return [];
      const forged = pages.find((f) => f.source) as { source: { uri: string }; thumb: { uri: string } } | undefined;
      return forged
        ? [{ id, source: forged.source, thumb: forged.thumb, faces: pages }]
        : [{ id, source: GENERIC_CARD_ART, thumb: GENERIC_CARD_ART, live: pages[0].custom, faces: pages }];
    };
    const featItem = coverOf(`features-${file.className}`, faces);
    // Multiclass (#311): the additional class's feature card (multi-page), assembled exactly like the
    // primary's, plus the chosen subclass FOUNDATION card. Both ride the arsenal next to the originals.
    const mcFaceJobs = mcClassJob ? [mcClassJob, ...mcFeatJobs] : mcFeatJobs;
    const mcFaces = mcFaceJobs.map((j) => { const src = featureSources[j.key]; return src ? { source: src.full, thumb: src.thumb } : { custom: j.node }; });
    const mcFeatItem = file.multiclassName ? coverOf(`mc-features-${file.multiclassName}`, mcFaces) : [];
    const mcSubclass = file.multiclassSubclassCardId ? cardById(file.multiclassSubclassCardId) : null;
    const mcSubclassItem = mcSubclass ? [{ id: mcSubclass.id, source: mcSubclass.source, thumb: mcSubclass.thumb }] : [];
    // Equipment (#121): weapons ride BOTH the abilities hand and inventory; armor is inventory only.
    const weaponItems = forgedItems(weaponJobs);
    const armorItems = armorJob ? forgedItems([armorJob]) : [];
    const [subclassC, ancestryC, communityC] = structItems as [CardItem | null, CardItem | null, CardItem | null];
    // Arsenal order (#157, owner): domains (by level) → ancestry → community → subclass → class
    // feature card → weapons → experiences. The origin badges target subclass/ancestry/community by
    // their actual index (no longer the contiguous last three).
    // Player-authored cards (#164) ride whichever deck(s) their target names.
    const arsenalCustom = forgedItems(customCardJobs.filter((j) => j.target !== 'inventory'));
    const invCustom = forgedItems(customCardJobs.filter((j) => j.target !== 'arsenal'));
    // Acquired gear/loot (#180): weapons ride arsenal + inventory; armor + loot are inventory.
    const acqWeaponItems = forgedItems(acqWeaponJobs);
    const acqArmorItems = forgedItems(acqArmorJobs);
    const acqLootItems = forgedItems(acqLootJobs);
    // Acquired class cards (#328): one MULTI-PAGE item per acquired copy (class card + each feature
    // page), assembled like the primary/multiclass class-feature card — not one card per page. Faces
    // are the forged class face + each forged feature page (live node until forged). Duplicates share
    // the forged bitmaps; dedupeIds gives each copy its own instance id below.
    const acqClassItems: CardItem[] = (file.acquiredCardIds ?? [])
      .filter((id) => id.startsWith('class-') && CLASS_CARDS.some((c) => c.key === id.slice(6)))
      .map((id): CardItem | null => {
        const k = id.slice(6);
        const faceKeys = [`acqclass-${k}`, ...featurePages(k as typeof file.className).map((p) => `acqfeat-${k}-${p.pageIndex}`)];
        const faces = faceKeys.map((key) => {
          const src = featureSources[key];
          return src ? { source: src.full, thumb: src.thumb } : { custom: acqClassJobs.find((j) => j.key === key)?.node };
        });
        const first = faces.find((f) => 'source' in f && f.source) as { source: { uri: string }; thumb: { uri: string } } | undefined;
        // v0.27.0: a single-page acquired class card still needs a card, and in a browser NONE of
        // these are forged, so requiring a bitmap dropped every acquired class outright.
        if (!first) return { id, source: GENERIC_CARD_ART, thumb: GENERIC_CARD_ART, live: faces[0]?.custom, faces: faces.length > 1 ? faces : undefined };
        return { id, source: first.source, thumb: first.thumb, faces: faces.length > 1 ? faces : undefined };
      })
      .filter((c): c is CardItem => c !== null);
    // Mixed ancestry (#306): the SECOND ancestry card sits RIGHT AFTER the first so the pair reads
    // together. It arrives via acquiredCardIds (with a cardCategory→abilities override), which the
    // acquired-catalog pass below appended at the very END — so the two cards landed far apart. Place
    // it explicitly here; the acquired pass skips ids already present, so it isn't double-added.
    const secondAncestryC = file.mixedAncestry ? (catItem(file.mixedAncestry.second) ?? libItem(file.mixedAncestry.second)) : undefined;
    const secondAncestryItem = secondAncestryC && secondAncestryC.id !== ancestryC?.id ? [secondAncestryC] : [];
    // Class tracker (v0.19.1 item 7): one live Arsenal card for the Summoner (Summon Entity + circles) or
    // the Warlock (Patron / Spheres / Favor). Never deletable or duplicatable (guards below); movable like
    // any card via a category override. Source/thumb are placeholders — the live node renders.
    const trackerSubclass = file.subclassCardId?.includes('theurgy') ? 'theurgy' as const : file.subclassCardId?.includes('necromancy') ? 'necromancy' as const : undefined;
    const classTrackerItems: CardItem[] = file.className === 'summoner'
      ? [{ id: SUMMONER_TRACKER_ID, source: GENERIC_CARD_ART, thumb: GENERIC_CARD_ART, interactive: true, live: <SummonerTrackerCard state={file.classTracker} subclass={trackerSubclass} level={file.level} onChange={(patch) => mutateFile({ classTracker: { ...file.classTracker, ...patch } })} /> }]
      : file.className === 'warlock'
      ? [{ id: WARLOCK_TRACKER_ID, source: GENERIC_CARD_ART, thumb: GENERIC_CARD_ART, interactive: true, live: <WarlockTrackerCard state={file.classTracker} level={file.level} onChange={(patch) => mutateFile({ classTracker: { ...file.classTracker, ...patch } })} /> }]
      : [];
    const abilities = [...domainItems, ...(ancestryC ? [ancestryC] : []), ...secondAncestryItem, ...(communityC ? [communityC] : []), ...(subclassC ? [subclassC] : []), ...mcSubclassItem, ...featItem, ...mcFeatItem, ...weaponItems, ...acqWeaponItems, ...acqClassItems, ...expItems, ...arsenalCustom, ...classTrackerItems];
    // inventory = ONLY the player's stuff (#136: never the sample deck) — kit + chosen + custom +
    // gold + weapons + armor. Returned as an array (even while forging) so it NEVER falls back.
    const invItems = forgedItems(invJobs);
    // the GOLD card is LIVE + interactive (#136): its +/- adjusts character.gold in place. dummy
    // source/thumb are never drawn (the live node renders instead).
    const goldItem = { id: 'gold', source: GENERIC_CARD_ART, thumb: GENERIC_CARD_ART, live: <GoldCard gold={character.gold} onChange={(g) => setCharacter((c) => ({ ...c, gold: g }))} />, interactive: true };
    // #328: STARTING weapons ride both abilities + inventory (by design). ACQUIRED weapons do NOT —
    // they're placed in abilities (above) and routed to the player's chosen category by the override
    // pass, so a catalog weapon no longer duplicates into both Arsenal and Inventory.
    // v0.10.3: embedded homebrew cards NOT bound to a structural/domain slot (weapon/armor/inventory/
    // generic added via ADD GEAR) ride the inventory deck.
    const structuralLibIds = new Set<string>([file.subclassCardId, file.ancestryCardId, file.communityCardId, ...(file.mixedAncestry ? [file.mixedAncestry.second] : []), ...file.domainCardIds]);
    const acquiredSet = new Set(file.acquiredCardIds ?? []);
    const looseLibItems = (file.libraryCards ?? [])
      .filter((lc) => {
        if (structuralLibIds.has(lc.id)) return false;
        // v0.10.5: a custom subclass specialization/mastery card is embedded at creation but only shows
        // once the subclass-upgrade advancement acquires it.
        if (lc.contentType === 'subclass' && (lc.tier ?? 1) > 1) return acquiredSet.has(lc.id);
        return true;
      })
      .map((lc) => libItem(lc.id))
      .filter((x): x is CardItem => !!x);
    // v0.36.3 (owner): a CHARACTERIZED character carries no purse. Gold is a player's running
    // total; an adversary turned into a character has none and never will unless someone gives it
    // one, and a permanent 0 gold card is one more thing in a deck that is meant to be lean.
    const inv = [...invItems, ...(file.characterized ? [] : [goldItem]), ...weaponItems, ...armorItems, ...acqArmorItems, ...acqLootItems, ...invCustom, ...looseLibItems];
    // Acquired CATALOG cards (#248 item 5): domain/ancestry/community/subclass picked from the catalog
    // browser, added as their real card image (no forging). Skip ids already in a deck (e.g. an owned
    // domain card) so there's never a duplicate id.
    const existingIds = new Set<string>([...abilities, ...inv].map((i) => i.id));
    const acqCatalogItems: CardItem[] = (file.acquiredCardIds ?? [])
      .map((id) => cardById(id))
      .filter((c): c is NonNullable<typeof c> => !!c && !existingIds.has(c.id))
      .map((c) => ({ id: c.id, source: c.source, thumb: c.thumb }));
    const invFull = [...inv, ...acqCatalogItems];
    // Notes (#214/#248 item 4): just the player's note cards (forged from file.notes). A brand-new
    // character is SEEDED with one real, deletable default note (see the seed effect) — no synthetic
    // placeholder card and never the deleted temp item image.
    const notesItems = forgedItems(notesJobs);
    const notesCards: CardItem[] = notesItems;
    // Beastform (#227): assemble each form's two forged faces into ONE multi-face flip card (id =
    // the form id, so enabling/toggling still targets it). Mirrors the class-feature card assembly.
    const wsTier = tierForLevel(file.level);
    const wildshapeCards: CardItem[] = hasBeastform(file)
      ? WILDSHAPES.filter((w) => w.tier <= wsTier).map((w): CardItem | null => {
          const faces = [`ws-${w.id}-0`, `ws-${w.id}-1`].map((k) => {
            const src = featureSources[k];
            return src ? { source: src.full, thumb: src.thumb } : { custom: wildshapeFaceJobs.find((j) => j.key === k)?.node };
          });
          const first = faces.find((f) => 'source' in f && f.source) as { source: { uri: string }; thumb: { uri: string } } | undefined;
          if (!first) return null;
          return { id: w.id, source: first.source, thumb: first.thumb, faces };
        }).filter((c): c is CardItem => c !== null)
      : [];
    // Card management (#246): assemble the full category→deck MAP and apply per-card category overrides
    // (a card moved to another built-in or custom category), then build custom-category decks. With no
    // custom categories + no overrides this yields the exact four built-in decks as before (additive).
    const customCats = file.customCategories ?? [];
    const override = file.cardCategory ?? {};
    const removed = new Set(file.removedCardIds ?? []); // universal delete (#248 item 5)
    // Companion (#311/#318): the Beastbound companion is a CARD CATEGORY — one live, lockable card per
    // facet (name+image, Evasion, Damage, Range, Stress, one per Experience). Only for a Beastbound
    // character (primary OR via multiclass). Edits persist to file.companion; cards are duplicatable +
    // movable but never fully deletable (guards below). Like gold, the source/thumb are never drawn.
    const companionState = companionOf(file);
    const mkCompanion = (facet: CompanionFacet, expIndex?: number): CardItem => ({
      id: companionCardId(facet, expIndex),
      source: GENERIC_CARD_ART,
      thumb: GENERIC_CARD_ART,
      live: <CompanionFacetCard facet={facet} expIndex={expIndex} companion={companionState} onChange={(c) => mutateFile({ companion: c })} />,
      interactive: true,
    });
    const companionCards: CardItem[] = hasCompanion(file)
      ? [mkCompanion('name'), mkCompanion('evasion'), mkCompanion('damage'), mkCompanion('range'), mkCompanion('stress'), ...companionState.experiences.map((_, i) => mkCompanion('exp', i))]
      : [];
    // Martial Form (#357): the live Focus token card leads, then every stance of the character's tier
    // or lower (forged; live-node fallback until its bitmap lands — the gold-card convention).
    const martialformCards: CardItem[] = hasMartialForm(file)
      ? [
          {
            id: MARTIAL_FOCUS_CARD_ID,
            source: GENERIC_CARD_ART,
            thumb: GENERIC_CARD_ART,
            live: <MartialFocusCard focus={file.martialFocus ?? 0} onChange={(n) => mutateFile({ martialFocus: n })} />,
            interactive: true,
          },
          ...martialJobs.map((j): CardItem => {
            const src = featureSources[j.key];
            return src ? { id: j.key, source: src.full, thumb: src.thumb } : { id: j.key, source: GENERIC_CARD_ART, thumb: GENERIC_CARD_ART, live: j.node };
          }),
        ]
      : [];
    const base: Record<string, CardItem[]> = { abilities, inventory: invFull, wildshape: wildshapeCards, companion: companionCards, martialform: martialformCards, notes: notesCards };
    const validKeys = new Set<string>([...BUILTIN_CATEGORIES, FAVORITES_CATEGORY, ...customCats.map((c) => c.id)]);
    // #306/#311: archive + companion start as empty target decks (cards land via category override).
    // v0.9.8: favorites is a target deck too (favorite copies route here via their override).
    const decks: Record<string, CardItem[]> = { abilities: [], inventory: [], wildshape: [], companion: [], martialform: [], notes: [], archive: [], favorites: [] };
    for (const c of customCats) decks[c.id] = [];
    // Unique instance ids (#269): a catalog card the player holds twice (e.g. equipped AND acquired)
    // would otherwise share one id, so selecting/dragging/tokening one hit both. The first copy keeps
    // its catalog id (back-compat with saved tokens/category/enable), repeats get `id#2`. Assigned
    // across ALL base decks in order so it's stable; content still resolves via catalogIdOf.
    const flat: { cat: string; item: CardItem }[] = [];
    for (const cat of Object.keys(base)) for (const item of base[cat]) flat.push({ cat, item });
    const instanceIds = dedupeIds(flat.map((f) => f.item.id));
    for (let i = 0; i < flat.length; i++) {
      const { cat, item } = flat[i];
      const iid = instanceIds[i];
      const it: CardItem = { ...item, id: iid, ref: catalogIdOf(iid) }; // #277: ref = underlying card
      if (removed.has(it.id)) continue; // deleted from the gallery → filtered out of every deck
      // (v0.9.7) Fall back to the catalog-id (ref) override: a duplicate instance gets a `#2` id, but the
      // acquire override is keyed by the catalog id — without this, the 2nd+ copy of an acquired weapon
      // missed its override and stayed in the default deck. Instance overrides (a manual move) still win.
      const ov = override[it.id] ?? override[catalogIdOf(it.id)];
      // Beastform cards are locked to the wildshape deck (#279): ignore any category override that would
      // move a wildshape out, and never let a non-wildshape card override INTO the wildshape deck.
      // Martial Form cards (#357) lock to their deck the same way (stances + the Focus card).
      const isWs = isWildshapeId(catalogIdOf(it.id));
      const isMf = isMartialStanceId(catalogIdOf(it.id)) || catalogIdOf(it.id) === MARTIAL_FOCUS_CARD_ID;
      // v0.36: a CHARACTERIZED character has one deck. A stat block has no inventory, no vault and no
      // notes, so handing one five categories to unpick is work the DM did not ask for. An explicit
      // move still wins (`ov`), and the live structural decks are not a category anyone chose.
      const home = file.arsenalOnly && cat !== 'companion' ? 'abilities' : cat;
      const target = isWs ? 'wildshape' : isMf ? 'martialform' : ov && validKeys.has(ov) && ov !== 'wildshape' && ov !== 'martialform' ? ov : home;
      (decks[target] ??= []).push(it);
    }
    // Card copies (#277): extra instances of an existing card, built from a template primary so they
    // render identically. Own id (position/tokens), shared ref (enable + effects apply once). Routed by
    // their own category override, defaulting to the source card's category. Beastform can't be copied.
    // v0.34.8: keyed by the instance's own SYNC KEY, not by its catalog id. A copy points at one
    // specific instance now (`pot`, not "whichever potion"), so looking the template up by catalog id
    // would hand a copy of the second potion the first one's card.
    const templateByRef = new Map<string, { item: CardItem; cat: string }>();
    for (let i = 0; i < flat.length; i++) {
      const r = instanceIds[i];
      if (!templateByRef.has(r)) templateByRef.set(r, { item: flat[i].item, cat: flat[i].cat });
    }
    for (const copy of file.cardCopies ?? []) {
      if (removed.has(copy.id) || isWildshapeId(copy.ref) || isMartialStanceId(copy.ref) || copy.ref === MARTIAL_FOCUS_CARD_ID) continue; // #279/#357: special decks can't be copied
      const t = templateByRef.get(copy.ref);
      if (!t) continue;
      const it: CardItem = { ...t.item, id: copy.id, ref: copy.ref };
      const ov = override[copy.id] ?? override[copy.ref];
      const target = ov && validKeys.has(ov) && ov !== 'wildshape' ? ov : t.cat;
      (decks[target] ??= []).push(it);
    }
    // Drag-drop order (#252): sort each category by the player's explicit card order; ids not listed
    // keep their natural order after the listed ones (Hermes sort is stable).
    const cardOrderMap = file.cardOrder ?? {};
    for (const k of Object.keys(decks)) {
      const ord = cardOrderMap[k];
      if (ord?.length) {
        const rank = new Map(ord.map((id, i) => [id, i]));
        decks[k].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
      }
    }
    const categoryMeta: Record<string, { label: string; icon?: string; builtin: boolean }> = {
      abilities: { label: 'Arsenal', builtin: true },
      inventory: { label: 'Inventory', builtin: true },
      wildshape: { label: 'Beastform', builtin: true },
      companion: { label: 'Companion', builtin: true },
      martialform: { label: 'Martial Form', builtin: true }, // #357: Martial Artist Brawler
      notes: { label: 'Notes', builtin: true },
      archive: { label: 'Vault', builtin: true }, // v0.34.8 (owner): renamed from Archive
      favorites: { label: 'Favorites', icon: 'star', builtin: true }, // v0.9.8: special, un-deletable; star glyph
    };
    for (const c of customCats) categoryMeta[c.id] = { label: c.label, icon: c.icon, builtin: false };
    // Origin badges (#100) target the FINAL abilities deck (a card may have been moved out → -1, which
    // the legacy openOriginCard guards; the badges themselves use the standalone preview now).
    const fa = decks.abilities;
    // -1 for a skipped origin, which is what findIndex already returns for a card that is not there.
    const originIndices: [number, number, number] = [fa.findIndex((x) => x.id === subclassC?.id), fa.findIndex((x) => x.id === ancestryC?.id), fa.findIndex((x) => x.id === communityC?.id)];
    return { decks, categoryMeta, originIndices };
  }, [deckFile, character.gold, mutateFile, expJobs, classJob, mcClassJob, mcFeatJobs, featJobs, weaponJobs, armorJob, invJobs, customCardJobs, acqWeaponJobs, acqArmorJobs, acqLootJobs, acqClassJobs, notesJobs, libJobs, wildshapeFaceJobs, martialJobs, featureSources]);
  const [damageOpen, setDamageOpen] = useState(false); // damage-threshold keypad (#128, was the info card)
  const [floatKind, setFloatKind] = useState<PlaceholderKind | null>(null); // radial-menu interface (#161)
  const [nfcSend, setNfcSend] = useState<{ content: RkpContent; label: string; ids: string[] } | null>(null); // v0.10.1 NFC tap-to-share
  const [cardInfoId, setCardInfoId] = useState<string | null>(null); // per-card modifier view (#175)
  const [editCardId, setEditCardId] = useState<string | null>(null); // edit a player-authored card (#264 item 5)
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  // Covers the hand-off to the character list while the route changes (v0.29.1).
  const [leaving, setLeaving] = useState(false); // #297: device-back leave confirmation
  // v0.13.0: empty-category panel — 'root' = "There is nothing here", 'cats' = the category chooser.
  const [emptyPanel, setEmptyPanel] = useState<'root' | 'cats' | null>(null);
  // v0.13.2 (#359): a card received over NFC, awaiting the confirmation + landing ceremony.
  const [incoming, setIncoming] = useState<LibraryCard | null>(null);
  const router = useRouter();
  const [toasts, setToasts] = useState<StatToast[]>([]); // stat-change toasts on card toggle (#233)
  const toastId = useRef(1);
  // Emit a toast per changed stat, capped to the newest 5 on screen (#239 item 2: FIFO — oldest drop
  // first so they never stack endlessly). Shared by card toggle (#233) and level-up confirm (#239).
  const pushToasts = useCallback((prev: Character, next: Character) => {
    const fresh = diffStatToasts(prev, next, toastId.current);
    if (!fresh.length) return;
    toastId.current += fresh.length;
    setToasts((list) => [...list, ...fresh].slice(-5));
  }, []);
  // #318: a plain notice toast (no numeric delta), e.g. the domain-card cap warning.
  const pushNotice = useCallback((label: string) => {
    const id = toastId.current++;
    setToasts((list) => [...list, { id, label, delta: 0, notice: true }].slice(-5));
  }, []);
  noticeRef.current = pushNotice; // the trash restore fires before this is declared
  // #318: consecutive attempts to enable a 6th domain card without leaving fullscreen. 3 in a row
  // overrides the cap (a debug escape hatch); reset on any other toggle or on leaving fullscreen.
  const domainOverrideRef = useRef(0);
  // Level Up (#167): the domain cards available to gain (≤ the NEXT level, in this class's domains,
  // not already owned), the multiclass options, and the class-derived stat defaults.
  const levelData = useMemo(() => {
    type ClassOpt = { key: string; label: string; domains: string[]; subclasses: { id: string; label: string }[] };
    if (!file) return { domainOptions: [] as DomainCardInfo[], classOptions: [] as ClassOpt[], defaults: { maxHp: 6, stressMax: 6, evasion: 10 } };
    const cls = classInfo(file.className);
    const owned = new Set(file.domainCardIds);
    const targetLevel = file.level + 1;
    // #311: multiclass domain access — cards from the additional domain unlock at HALF the (target)
    // level, rounded up. Original domains stay at full level. Owned domains are excluded from the picker.
    const ownedDomains = new Set<string>([...cls.domains, ...(file.multiclassDomain ? [file.multiclassDomain] : [])]);
    const halfLevel = Math.ceil(targetLevel / 2);
    const mcDomain = file.multiclassDomain;
    const domainOptions: DomainCardInfo[] = CATALOG.filter((c) => {
      if (c.kind !== 'domain' || !c.domain || owned.has(c.id)) return false;
      if (cls.domains.includes(c.domain) && (c.level ?? 0) <= targetLevel) return true;
      if (mcDomain && c.domain === mcDomain && (c.level ?? 0) <= halfLevel) return true; // #311
      return false;
    }).map((c) => ({ id: c.id, title: c.label, thumb: c.thumb as DomainCardInfo['thumb'], source: c.source as DomainCardInfo['source'], domain: c.domain, level: c.level }));
    const data = CLASS_DATA[file.className];
    // #311: each multiclassable class with the domains it can grant (those the character lacks) + its
    // subclass FOUNDATION cards (one of which the player picks to gain that subclass's foundation feature).
    // v0.12.2: only multiclass into classes from THIS character's enabled expansions (base always).
    const charExp = new Set(file.enabledExpansionIds ?? []);
    const classOptions: ClassOpt[] = CLASSES.filter((c) => c.key !== file.className && (!classExpansion(c.key) || charExp.has(classExpansion(c.key)!))).map((c) => ({
      key: c.key,
      label: c.label,
      domains: classInfo(c.key).domains.filter((d) => !ownedDomains.has(d)),
      subclasses: CATALOG.filter((s) => s.kind === 'subclass' && s.tier === 1 && s.className === c.key).map((s) => ({ id: s.id, label: s.label.replace(/ Foundation$/, '') })),
    }));
    return { domainOptions, classOptions, defaults: { maxHp: data.startingHp, stressMax: 6, evasion: data.startingEvasion } };
  }, [file]);
  const onInfo = useCallback(() => setDamageOpen(true), []);
  const heartRef = useRef<HeartTrackHandle>(null);
  const stressRef = useRef<ChargeTrackHandle>(null);
  const armorRef = useRef<ChargeTrackHandle>(null);
  const hopeRef = useRef<ChargeTrackHandle>(null);
  const onApplyDamage = useCallback((hpLoss: number) => heartRef.current?.applyDamage(hpLoss), []);
  // Latest runtime character, for handlers that must read it without re-subscribing (toggle/rest).
  const characterRef = useRef(character);
  characterRef.current = character;
  // Burst-animate every resource track that changed (#192): used by Rest + equip/unequip so the
  // hearts / stress / armor / hope icons all animate at once, like the damage panel.
  const burstResources = useCallback((prev: Character, next: Character) => {
    heartRef.current?.burst(prev.hp, next.hp);
    stressRef.current?.burst(prev.stress.active, next.stress.active);
    armorRef.current?.burst(prev.armor.active, next.armor.active);
    hopeRef.current?.burst(prev.hope.active, next.hope.active);
  }, []);

  // Confirming Level Up (#239 items 6 + 7): re-derive build stats, keep in-play resource positions
  // (clamped to the new maxes), and CELEBRATE the result — a gained Max HP slot fills with its heart
  // animation and every stat change pops a toast.
  const onApplyLevelUp = useCallback(
    (next: CharacterFile, steps: string[] = []) => {
      withIntent({ kind: 'level', label: `Levelled up to ${next.level}`, steps });
      setFile(next);
      saveFileRef.current(next);
      const c = characterRef.current;
      const d = toSheetCharacter(next);
      const hpGain = Math.max(0, d.maxHp - c.maxHp); // follow the gain so the new heart animates filling
      const result: Character = {
        ...d,
        hp: Math.min(d.maxHp, c.hp + hpGain),
        stress: { ...d.stress, active: Math.min(c.stress.active, d.stress.total - (d.stress.locked ?? 0)) },
        armor: { ...d.armor, active: Math.min(c.armor.active, d.armor.total - (d.armor.locked ?? 0)) },
        hope: { ...d.hope, active: Math.min(c.hope.active, d.hope.total - (d.hope.locked ?? 0)) },
        gold: c.gold,
        portraitUri: c.portraitUri,
        portraitTransform: c.portraitTransform,
      };
      pushToasts(c, result); // toast the stat changes this level brought (item 7)
      setCharacter(result);
      setFloatKind(null);
      // Burst AFTER the panel closes + the HeartTrack re-mounts with the new slot count (item 6): the
      // track's imperative handle is rebuilt when maxHp grows, so a synchronous burst would target the
      // OLD slot count and miss the new heart. A short defer lets the new slot exist before it fills.
      setTimeout(() => burstResources(c, result), 90);
    },
    [pushToasts, burstResources],
  );

  // Portrait edits (#155) persist to the character FILE (via the file state, #164) and update the
  // runtime character.
  const onPortraitTransform = useCallback((t: PortraitTransform) => {
    setCharacter((c) => ({ ...c, portraitTransform: t }));
    mutateFile({ portraitTransform: t });
  }, [mutateFile]);
  const onPortraitReplace = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 }); // no forced crop (#155)
    if (res.canceled || !res.assets[0]) return;
    // v0.26.0: own it before storing the path — the picker's URI points into a cache an update clears.
    const portraitUri = await ownImage(res.assets[0].uri);
    const reset = { scale: 1, x: 0, y: 0 };
    setCharacter((c) => ({ ...c, portraitUri, portraitTransform: reset }));
    mutateFile({ portraitUri, portraitTransform: reset });
  }, [mutateFile]);
  // New Card (#164/#214/#246): append a player-authored card into a target CATEGORY (built-in or
  // custom). Notes land in the Notes deck; inventory in inventoryCustom; everything else is an Arsenal
  // custom card. A custom category also gets a card→category override so the card lives there.
  const onAddCustomCard = useCallback((draft: CardDraft, categoryKey: CardCategory) => {
    const id = `cc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const baseCard = {
      id,
      title: draft.title,
      text: draft.text,
      imageUri: draft.imageUri,
      color: draft.color,
      effects: draft.effects,
      typeLabel: draft.typeLabel,
      fullImage: draft.fullImage, // v0.34.8: a card that IS its picture
    };
    playSfx('customCardCreate'); // #255: the card is created + added
    setFile((f) => {
      if (!f) return f;
      let next: CharacterFile;
      // v0.14.0: the Experience type authors a REAL Experience, not a custom card — so level-up
      // advancements and experience-targeting effects (the Honing Relic) can find it. It starts at the
      // same +2 a creation/tier-start Experience does.
      if (isExperienceType(draft.typeLabel)) {
        next = { ...f, experiences: [...(f.experiences ?? []), { ...baseCard, text: '', modifier: 2 }] };
        saveFileRef.current(next);
        return next;
      }
      if (categoryKey === 'notes') {
        next = { ...f, notes: [...(f.notes ?? []), baseCard] };
      } else {
        const target: CardTarget = categoryKey === 'inventory' ? 'inventory' : 'arsenal';
        const card: CustomCardDef = { ...baseCard, target };
        next = { ...f, customCards: [...(f.customCards ?? []), card] };
      }
      if (!isBuiltinCategory(categoryKey)) {
        next = { ...next, cardCategory: { ...(next.cardCategory ?? {}), [id]: categoryKey } };
      }
      saveFileRef.current(next);
      return next;
    });
    setFloatKind(null);
    setNewCardCat(null);
  }, []);
  // Acquired system gear/loot (#180): adding an id forges it into the decks (re-derives from file).
  const acquiredIds = useMemo(() => new Set(file?.acquiredCardIds ?? []), [file]);
  const onAcquireCard = useCallback((id: string, category?: CardCategory) => {
    const f = fileRef.current;
    if (!f) return;
    // (v0.9.7) Audit + error-handle the gear add. Validate the id resolves to a real card — an unknown
    // id would forge to nothing and silently vanish. Tell the player via the toast system instead.
    const known = !!cardById(id) || !!weaponById(id) || !!armorById(id) || !!lootById(id) || (id.startsWith('class-') && CLASS_CARDS.some((c) => c.key === id.slice(6)));
    if (!known) { pushNotice("Couldn't add that card"); return; }
    // A weapon/armor already held as STARTING equipment is dropped by the deck builder (it can't be
    // forged twice), so it would never appear — say so rather than silently no-op.
    const startEquip = new Set([f.weaponPrimaryId, f.weaponSecondaryId, f.armorId].filter(Boolean) as string[]);
    if (startEquip.has(id)) { pushNotice('Already equipped, not added'); return; }
    // Route the card to the category the player picked (the Cards-panel per-category Add button, or the
    // current carousel category from the float menu) via a cardCategory override; the deck builder's
    // override pass places it there (#328). Beastform is locked to its own deck — never override into it.
    const valid = !!category && category !== 'wildshape' && category !== 'martialform' && (isBuiltinCategory(category) || (f.customCategories ?? []).some((c) => c.id === category));
    setFile((cur) => {
      if (!cur) return cur;
      // #269: acquiredCardIds is a multiset — each copy becomes a unique deck instance (catalogIdOf maps back).
      const override = valid ? { cardCategory: { ...(cur.cardCategory ?? {}), [id]: category! } } : {};
      const next = { ...cur, acquiredCardIds: [...(cur.acquiredCardIds ?? []), id], ...override };
      saveFileRef.current(next);
      return next;
    });
    // Confirm WHERE it landed so the player can see the routing worked (the reported "weapons sometimes
    // go to the wrong category" pain — now it's visible).
    pushNotice(valid ? `Added to ${categoryLabel(category!, f.customCategories ?? [])}` : 'Card added');
  }, [pushNotice]);
  // v0.10.3 (B4): add a LOOSE homebrew card from ADD GEAR → embed a self-contained copy on the file (so
  // it survives the expansion being disabled/deleted) with a fresh instance id, enabling armor/effect
  // cards so their stats apply. The deck builder places it in inventory (looseLibItems).
  const onAcquireCustom = useCallback((card: LibraryCard, category?: CardCategory) => {
    const f = fileRef.current;
    if (!f) return;
    const inst: LibraryCard = { ...card, id: `lc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` };
    const enable = (inst.effects?.length ?? 0) > 0 || inst.contentType === 'armor';
    const valid = !!category && category !== 'wildshape' && category !== 'martialform' && (isBuiltinCategory(category) || (f.customCategories ?? []).some((c) => c.id === category));
    setFile((cur) => {
      if (!cur) return cur;
      const override = valid ? { cardCategory: { ...(cur.cardCategory ?? {}), [inst.id]: category! } } : {};
      const next = { ...cur, libraryCards: [...(cur.libraryCards ?? []), inst], ...(enable ? { enabledCardIds: [...(cur.enabledCardIds ?? []), inst.id] } : {}), ...override };
      saveFileRef.current(next);
      return next;
    });
    pushNotice(`Added ${inst.title || 'card'}`);
  }, [pushNotice]);
  // v0.13.2 (#359): commit a card received over NFC. A catalog-reference card (system scans travel as a
  // tiny `catalogId`, never bytes) is acquired as its REAL catalog card (true art); a homebrew card is
  // embedded as a self-contained copy. Both land in the category the ceremony chose.
  const onNfcCard = useCallback((card: LibraryCard) => setIncoming(card), []);
  const onNfcReject = useCallback((msg: string) => pushNotice(msg), [pushNotice]);
  const commitReceived = useCallback((card: LibraryCard, category: CardCategory) => {
    // v0.14.1: loot/consumables share by reference too, so they land as REAL loot (own card, working
    // modifiers) instead of a flattened inventory note. onAcquireCard already accepts a loot id.
    if (card.catalogId && (cardById(card.catalogId) || lootById(card.catalogId))) onAcquireCard(card.catalogId, category);
    else onAcquireCustom(card, category);
  }, [onAcquireCard, onAcquireCustom]);
  // Hidden categories (#227, Cards panel): which categories the player toggled off. Back-compat:
  // a legacy save with showNotes === false maps to notes hidden.
  const hidden = useMemo<CardCategory[]>(
    () => file?.hiddenCategories ?? (file?.showNotes === false ? ['notes'] : []),
    [file?.hiddenCategories, file?.showNotes],
  );
  // Custom categories (#246) the player has created.
  const customCategories = useMemo(() => file?.customCategories ?? [], [file]);
  // The active category ring (#214/#227/#246/#250): available categories (built-in + custom) reordered
  // by `categoryOrder`, minus hidden, minus EMPTY ones — an over-scroll never lands on a category with
  // no cards (#250 item 3), so the player can't get trapped. Falls back to any non-empty category.
  // #320: the EMPTY-INCLUDED ring (available − hidden). The carousel uses this to decide whether the
  // current category is still valid (so a transiently-empty category — e.g. its only card mid-reforge
  // after an edit — doesn't yank the player away). The over-scroll `ring` below drops empty categories.
  const validRing = useMemo(() => {
    const isDruid = file?.className === 'druid' || file?.multiclassName === 'druid'; // #311: incl. multiclass
    const companion = hasCompanion({ subclassCardId: file?.subclassCardId ?? '', multiclassSubclassCardId: file?.multiclassSubclassCardId }); // #311
    const favorites = !!file && fileHasFavorites(file); // v0.9.8: in the ring only once there's a favorite
    const martial = hasMartialForm({ subclassCardId: file?.subclassCardId ?? '', multiclassSubclassCardId: file?.multiclassSubclassCardId }); // #357
    return activeRing({ isDruid, hasCompanion: companion, hasMartialForm: martial, hasFavorites: favorites, hidden, custom: customCategories, order: file?.categoryOrder });
  }, [file, hidden, customCategories]);
  const ring = useMemo(() => {
    if (!carouselDecks) return validRing; // demo sheet (no file) — no per-deck counts, use the ring as-is
    const nonEmpty = validRing.filter((k) => (carouselDecks?.[k]?.length ?? 0) > 0);
    return nonEmpty.length ? nonEmpty : ['abilities'];
  }, [validRing, carouselDecks]);
  // v0.9.8 Golden Gear Edit — categories the Move control can target: every real category except the
  // locked Beastform deck and Favorites (favoriting is the star action, never a move).
  const moveTargets = useMemo(
    () => (file ? availableCategories({ isDruid: hasBeastform(file), hasCompanion: hasCompanion(file), hasMartialForm: hasMartialForm(file), hasFavorites: fileHasFavorites(file), custom: customCategories }).filter((k) => k !== 'favorites' && k !== 'wildshape' && k !== 'martialform') : []),
    [file, customCategories],
  );
  // Re-derive the runtime character from a new file, keeping in-play resource positions (clamped to the
  // new maxes). Used by edits that can change stats (e.g. deleting an enabled card).
  const commitFile = useCallback((next: CharacterFile) => {
    setFile(next);
    saveFileRef.current(next);
    const c = characterRef.current;
    const d = toSheetCharacter(next);
    const result: Character = {
      ...d,
      hp: Math.min(d.maxHp, c.hp),
      stress: { ...d.stress, active: Math.min(c.stress.active, d.stress.total - (d.stress.locked ?? 0)) },
      armor: { ...d.armor, active: Math.min(c.armor.active, d.armor.total - (d.armor.locked ?? 0)) },
      hope: { ...d.hope, active: Math.min(c.hope.active, d.hope.total - (d.hope.locked ?? 0)) },
      gold: c.gold,
      portraitUri: c.portraitUri,
      portraitTransform: c.portraitTransform,
    };
    burstResources(c, result); // v0.13.1: effect edits that scar filled hope play the deplete fx
    setCharacter(result);
  }, [burstResources]);
  commitFileRef.current = commitFile;
  // Cards panel (#227/#246): toggle a category on/off (≥1 must stay enabled). Works for built-in AND
  // custom categories (the available set includes both).
  const onToggleCategory = useCallback((c: CardCategory) => {
    setFile((f) => {
      if (!f) return f;
      const available = availableCategories({ isDruid: hasBeastform(f), hasCompanion: hasCompanion(f), hasMartialForm: hasMartialForm(f), hasFavorites: fileHasFavorites(f), custom: f.customCategories ?? [] });
      const cur = new Set<CardCategory>(f.hiddenCategories ?? (f.showNotes === false ? ['notes'] : []));
      if (cur.has(c)) cur.delete(c);
      else {
        if (available.filter((x) => !cur.has(x)).length <= 1) return f; // never hide the last one
        cur.add(c);
      }
      const next = { ...f, hiddenCategories: [...cur] };
      saveFileRef.current(next);
      return next;
    });
  }, []);
  // Create a custom category (#246): a fresh id, the given label + icon, appended to the order.
  const onCreateCategory = useCallback((label: string, icon: string) => {
    const id = `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    setFile((f) => {
      if (!f) return f;
      const cat = { id, label: label.trim() || 'New Category', icon };
      const order = f.categoryOrder ?? activeRing({ isDruid: hasBeastform(f), hasCompanion: hasCompanion(f), hasMartialForm: hasMartialForm(f), custom: f.customCategories ?? [] });
      const next = { ...f, customCategories: [...(f.customCategories ?? []), cat], categoryOrder: [...order, id] };
      saveFileRef.current(next);
      return next;
    });
  }, []);
  // Rename / re-icon a custom category (#246).
  const onUpdateCategory = useCallback((id: string, patch: { label?: string; icon?: string }) => {
    mutateFile({ customCategories: (file?.customCategories ?? []).map((c) => (c.id === id ? { ...c, ...patch, label: (patch.label ?? c.label).trim() || c.label } : c)) });
  }, [file, mutateFile]);
  // Delete a custom category (#246): drop it, un-hide it, remove from the order, and revert any cards
  // it held back to their default category (clear their overrides).
  const onDeleteCategory = useCallback((id: string) => {
    setFile((f) => {
      if (!f) return f;
      const cardCategory = { ...(f.cardCategory ?? {}) };
      for (const k of Object.keys(cardCategory)) if (cardCategory[k] === id) delete cardCategory[k];
      const next = {
        ...f,
        customCategories: (f.customCategories ?? []).filter((c) => c.id !== id),
        categoryOrder: (f.categoryOrder ?? []).filter((k) => k !== id),
        hiddenCategories: (f.hiddenCategories ?? []).filter((k) => k !== id),
        cardCategory,
      };
      saveFileRef.current(next);
      return next;
    });
  }, []);
  // Reorder the ring (#246): persist the explicit category order.
  const onReorderCategories = useCallback((order: string[]) => mutateFile({ categoryOrder: order }), [mutateFile]);
  // Move a card to a different category (#246): a per-card override (built-in or custom key).
  // Move one or more cards to a category (#246/#248): per-card override (built-in or custom key).
  const onMoveCards = useCallback((ids: string[], categoryKey: string) => {
    setFile((f) => {
      if (!f) return f;
      const map = { ...(f.cardCategory ?? {}) };
      for (const id of ids) map[id] = categoryKey;
      const next = { ...f, cardCategory: map };
      saveFileRef.current(next);
      return next;
    });
  }, []);
  // File several cards into `toCat` with an explicit order (#311). v0.37: the Cards panel's Move is
  // the only caller left (the gallery drag that used to raise it is gone), which is why the
  // single-card variant went with it. Re-file each moved id, write the target's order, and drop them
  // all from every other category's explicit order.
  // v0.11.0: imperative handle into the carousel (it's a CHILD of CarouselProvider, the sheet can't read
  // context). Used after a Duplicate to deselect + scroll the row onto the fresh copies.
  const carouselApiRef = useRef<CarouselApi | null>(null);
  const onReorderCards = useCallback((movedIds: string[], toCat: string, orderedIds: string[]) => {
    setFile((f) => {
      if (!f) return f;
      const moved = new Set(movedIds);
      const cardCategory = { ...(f.cardCategory ?? {}) };
      for (const id of movedIds) cardCategory[id] = toCat;
      const cardOrder = { ...(f.cardOrder ?? {}) };
      for (const k of Object.keys(cardOrder)) if (k !== toCat) cardOrder[k] = cardOrder[k].filter((x) => !moved.has(x));
      cardOrder[toCat] = orderedIds;
      const next = { ...f, cardCategory, cardOrder };
      saveFileRef.current(next);
      return next;
    });
  }, []);
  // Delete ANY cards (#248 item 5): strip authored/acquired/domain entries + enabled/override/tokens,
  // and add every id to `removedCardIds` so SYSTEM cards (origins, class feature, equipment, gold) drop
  // from the decks too — everything is deletable. Re-derives stats (a deleted card may have been enabled).
  const onDeleteCards = useCallback((rawIds0: string[]) => {
    if (!file || rawIds0.length === 0) return;
    // Non-deletable cards: Beastform (#279), the live Gold card (#306), and the live Companion facet
    // cards (#318 — name/evasion/damage/range/stress/exp; companion-* ids) are dropped from the request
    // so no path (incl. a bulk delete) can ever remove them. Companion copies (cp-… ids) stay deletable.
    const rawIds = rawIds0.filter((id) => { const cid = catalogIdOf(id); return !isWildshapeId(cid) && cid !== 'gold' && !cid.startsWith('companion') && !isMartialStanceId(cid) && cid !== MARTIAL_FOCUS_CARD_ID && !isClassTrackerId(cid); });
    if (rawIds.length === 0) return;
    // HARD safeguard (#252): never delete the last card overall. Count the cards actually in the live
    // decks; if this deletion would remove them all, keep one. This is the data-layer guard (the UI
    // disable alone wasn't enough — the owner reached an empty state).
    const liveIds = new Set(Object.values(carouselDecks ?? {}).flat().map((c) => c.id));
    const present = rawIds.filter((id) => liveIds.has(id));
    let ids = rawIds;
    if (liveIds.size > 0 && present.length >= liveIds.size) {
      const keep = present[present.length - 1]; // keep the last selected so one card always remains
      ids = rawIds.filter((id) => id !== keep);
    }
    if (ids.length === 0) return;
    /**
     * Copies first (v0.34.8, owner). An original with a copy left standing is not deleted at all: the
     * card survives and moves into that copy's slot, and the copy is what disappears. Only the last
     * instance of a card is a real delete, so a card can never leave a copy behind with nothing to
     * render, and can never reach the trash while it is still on screen somewhere.
     */
    const promo = resolveCopyDeletions(file, ids);
    ids = [...promo.deleteIds, ...promo.consumedCopyIds];
    if (ids.length === 0 && promo.promotedRefs.length === 0) return;
    const del = new Set(ids);
    // v0.9.8: cascade — deleting the last real (non-favorite) source of a card also removes its
    // favorite duplicate(s), so the Favorites category never shows dead cards.
    const deckCardsAll = Object.values(carouselDecks ?? {}).flat();
    for (const fid of orphanedFavoriteIds(file, deckCardsAll, del)) del.add(fid);
    const promoted = applyPromotions(file, promo.promotedRefs, promo.consumedCopyIds);
    const cardCategory = { ...promoted.cardCategory };
    const cardOrder = { ...promoted.cardOrder };
    const cardTokens = { ...(file.cardTokens ?? {}) };
    for (const id of del) { delete cardCategory[id]; delete cardTokens[id]; }
    for (const k of Object.keys(cardOrder)) cardOrder[k] = cardOrder[k].filter((x) => !del.has(x));
    // #269 duplicate-aware: an instance id may be a suffixed copy. For an ACQUIRED catalog card, drop
    // exactly ONE matching copy from the multiset (not every copy); cards with no acquired entry
    // (equipped weapon/armor, domain, origin) are hidden by their instance id via removedCardIds.
    const acquired = [...(file.acquiredCardIds ?? [])];
    const copyIds = new Set((file.cardCopies ?? []).map((c) => c.id));
    const hide: string[] = [];
    for (const iid of ids) {
      if (copyIds.has(iid)) continue; // a copy (#277) → just removed from cardCopies below
      const cid = catalogIdOf(iid);
      const ai = acquired.indexOf(cid);
      if (ai >= 0) acquired.splice(ai, 1);
      else hide.push(iid);
    }
    // #277: enabledCardIds holds REFS — keep a ref enabled only while some card with that ref survives
    // (so deleting one of several copies keeps the shared equip; deleting the last drops it).
    const remainingRefs = new Set(deckCardsAll.filter((c) => !del.has(c.id)).map((c) => c.ref ?? catalogIdOf(c.id)));
    // ref-keyed tokens (v0.9.8): a card's token board lives under its ref now (shared across copies), so
    // drop it only when NO instance of that ref survives the delete.
    for (const r of new Set(deckCardsAll.filter((c) => del.has(c.id)).map((c) => c.ref ?? catalogIdOf(c.id)))) {
      if (!remainingRefs.has(r)) delete cardTokens[r];
    }
    const next: CharacterFile = {
      ...file,
      customCards: (file.customCards ?? []).filter((c) => !del.has(c.id)),
      inventoryCustom: (file.inventoryCustom ?? []).filter((c) => !del.has(c.id)),
      notes: (file.notes ?? []).filter((c) => !del.has(c.id)),
      experiences: (file.experiences ?? []).filter((c) => !del.has(c.id)),
      cardCopies: (file.cardCopies ?? []).filter((c) => !del.has(c.id)),
      acquiredCardIds: acquired,
      domainCardIds: file.domainCardIds.filter((x) => !del.has(x)),
      activeDomainCardIds: file.activeDomainCardIds?.filter((x) => !del.has(x)),
      enabledCardIds: (file.enabledCardIds ?? []).filter((r) => remainingRefs.has(r)),
      removedCardIds: [...new Set([...(file.removedCardIds ?? []), ...hide])],
      cardCategory,
      cardOrder,
      cardTokens,
    };
    commitFile(next);
  }, [file, commitFile, carouselDecks]);
  // Duplicate selected cards (#277): each copy is a new instance referencing the same underlying card
  // (shared enable + single effect), placed in the source card's category. Beastform can't be copied.
  // v0.19.1 item 8: `targetCat` powers the move panel's "Copy instead of move" — the copies land in the
  // chosen category (appended) rather than beside their originals.
  const onDuplicateCards = useCallback((ids: string[], targetCat?: string) => {
    if (!file || !ids.length) return;
    const decksNow = carouselDecks ?? {};
    // The edit selection lives in ONE category — copies go there, right after the last selected card.
    const cat = Object.keys(decksNow).find((k) => decksNow[k].some((c) => ids.includes(c.id)));
    const copies = [...(file.cardCopies ?? [])];
    const cardCategory = { ...(file.cardCategory ?? {}) };
    const newIds: string[] = [];
    let made = 0;
    for (const id of ids) {
      const ref = refOf(id, file);
      if (isWildshapeId(ref) || isClassTrackerId(ref)) continue; // #279: beastform + class trackers aren't duplicatable (item 7)
      const newId = `cp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}-${made++}`;
      copies.push({ id: newId, ref });
      const srcCat = cat ?? Object.keys(decksNow).find((k) => decksNow[k].some((c) => c.id === id));
      const destCat = targetCat ?? srcCat;
      if (destCat) cardCategory[newId] = destCat;
      newIds.push(newId);
    }
    if (!newIds.length) { playSfx('floatMenuClose'); return; } // nothing copyable (e.g. only beastform selected)
    // Order the copies: into a copy-target category → appended at its end; otherwise right after the LAST
    // selected card so they land beside their originals (item 7).
    let cardOrder = file.cardOrder;
    const destForOrder = targetCat ?? cat;
    if (destForOrder) {
      const deckIds = (decksNow[destForOrder] ?? []).map((c) => c.id);
      let at = deckIds.length;
      if (!targetCat) {
        const positions = ids.map((id) => deckIds.indexOf(id)).filter((i) => i >= 0);
        at = positions.length ? Math.max(...positions) + 1 : deckIds.length;
      }
      cardOrder = { ...(file.cardOrder ?? {}), [destForOrder]: [...deckIds.slice(0, at), ...newIds, ...deckIds.slice(at)] };
    }
    playSfx('customCardCreate');
    commitFile({ ...file, cardCopies: copies, cardCategory, ...(cardOrder ? { cardOrder } : {}) });
    // Deselect + reveal the fresh copies once the deck re-derives (item 7: "scrolling to the copies").
    const lastNew = newIds[newIds.length - 1];
    carouselApiRef.current?.deselectAll();
    setTimeout(() => carouselApiRef.current?.scrollToId(lastNew), 0);
  }, [file, commitFile, carouselDecks]);
  // Send the selected card(s) over NFC (v0.10.7 — single OR multiple). One card → a `card` payload with
  // its image inlined (best-effort, if it fits the NFC ceiling); several → an ephemeral one-off
  // Expansion bundling them (images skipped — N photos won't fit). Each card is converted to a portable
  // LibraryCard (homebrew cards travel whole; authored keep title/body/art/effects; catalog → generic).
  const onSendNfc = useCallback((ids0: string[]) => {
    // #357: Martial Form cards never travel (the wildshape/companion rule — bundled class content).
    const ids = ids0.filter((id) => { const cid = catalogIdOf(id); return !isMartialStanceId(cid) && cid !== MARTIAL_FOCUS_CARD_ID; });
    if (!file || !ids.length) return;
    const makeId = (srcId: string) => `lc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}-${srcId.slice(-4)}`;
    playSfx('buttonTap');
    if (ids.length === 1) {
      // v0.23.0: compress the art down until it fits the tag rather than dropping it, which is what
      // the old sync inliner did for any photo over the budget.
      void embedCardImageForNfc(cardToLibraryCard(file, ids[0], makeId)).then((card) => {
        setNfcSend({ content: { kind: 'card', payload: card }, label: card.title || 'card', ids });
      });
      return;
    }
    const cards = ids.map((id) => cardToLibraryCard(file, id, makeId));
    const exp: Expansion = {
      id: `nfc-${Date.now().toString(36)}`,
      name: `${file.name || 'Hero'}'s cards`,
      author: file.name || '',
      description: `${cards.length} cards from ${file.name || 'a hero'}`,
      version: 1,
      createdAt: new Date().toISOString(),
      cards,
    };
    setNfcSend({ content: { kind: 'expansion', payload: exp }, label: `${cards.length} cards`, ids });
  }, [file]);
  /**
   * The selected cards, onto paper (v0.34.8; rebuilt v0.35, watched v0.35.1).
   *
   * Every card on the page is a 750 x 1050 bitmap, which is a printed card at 300 DPI exactly. Where
   * the carousel already has one, it goes straight on the page. Where it does not, the card is
   * CAPTURED now (`PrintStage`) rather than printed as the placeholder the carousel shows in its
   * place, which is what made every app-drawn card come out as the app icon.
   *
   * A multi-page card contributes one printed card PER FACE, in order, so a class card's features
   * reach the table instead of stopping at its cover.
   *
   * v0.35.1: it runs inside a print JOB, so the wait has a card-by-card count and a way out.
   */
  const printRef = useRef<PrintStageHandle>(null);
  const printJob = usePrintJob(pushNotice);
  const onPrintCards = useCallback((ids: string[]) => {
    const byId = new Map(Object.values(carouselDecks ?? {}).flat().map((c) => [c.id, c]));
    printJob.run({
      total: ids.length,
      subject: file?.name || 'RuneKeep',
      build: async (step, cancelled) => {
        const cards: PdfCard[] = [];
        for (const id of ids) {
          if (cancelled()) return [];
          const item = byId.get(id);
          const authored = findEditableCard(file ?? undefined, contentIdOf(id, file ?? undefined))?.card;
          const lib = file ? libraryCardById(file, contentIdOf(id, file)) : undefined;
          // A whole-card image prints from the ORIGINAL file rather than a capture of it: printing a
          // re-render of a picture we still have is a worse page and a much bigger document.
          const own = (authored?.fullImage && authored.imageUri) || (lib?.fullImage && lib.imageUri) || null;
          const base = {
            title: sourceLabelForCardId(id, file ?? undefined),
            typeLabel: authored?.typeLabel ?? lib?.typeLabel ?? 'Card',
            body: authored?.text ?? lib?.text ?? '',
            color: authored?.color ?? lib?.color ?? null,
            art: authored?.imageUri ?? lib?.imageUri ?? null,
          };
          if (own) { cards.push({ ...base, image: await imageForPrint({ uri: own }) }); step(); continue; }
          for (const face of printFaces(item)) {
            if (cancelled()) return [];
            // Bytes if the picture has any; otherwise DRAW it. A bundled card is a packaged Android
            // resource with nothing to read, which is why they printed as bare text (v0.35.2).
            let image = face.image ? await imageForPrint(face.image) : null;
            if (!image && face.image) image = (await printRef.current?.capture(<PrintableImage source={face.image} />)) ?? null;
            if (!image && face.node) image = (await printRef.current?.capture(face.node)) ?? null;
            cards.push({ ...base, image });
          }
          step();
        }
        return cards;
      },
    });
  }, [carouselDecks, file, printJob]);
  // Favorite selected cards (v0.9.8): add a favorite DUPLICATE for each eligible source. Skips cards that
  // are already a favorite copy or already favorited. Un-favoriting is just deleting the copy in Favorites.
  const onFavoriteCards = useCallback((ids: string[]) => {
    if (!file || !ids.length) return;
    const favCat = file.cardCategory ?? {};
    const sources = ids.filter((id) => favCat[id] !== FAVORITES_CATEGORY); // never act on a favorite copy here
    if (!sources.length) { playSfx('floatMenuClose'); return; }
    // item 9: if EVERY selected card is already favorited, this button un-favorites them all; a PARTIAL
    // selection favorites only the ones that aren't yet favorited.
    if (sources.every((id) => isFavorited(file, id))) {
      let f = file;
      for (const id of sources) f = removeFavoriteByRef(f, id);
      if (f === file) { playSfx('floatMenuClose'); return; }
      playSfx('cardDeselect');
      commitFile(f);
      pushNotice(sources.length === 1 ? 'Removed from Favorites' : `Removed ${sources.length} from Favorites`);
      return;
    }
    let f = file;
    let added = 0;
    for (const id of sources) {
      const before = f;
      f = addFavorite(f, id);
      if (f !== before) added++;
    }
    if (!added) { playSfx('floatMenuClose'); pushNotice('Already in Favorites'); return; }
    playSfx('customCardCreate');
    commitFile(f);
    pushNotice(added === 1 ? 'Added to Favorites' : `Added ${added} to Favorites`);
  }, [file, commitFile, pushNotice]);
  // v0.10.7: un-favorite from the hidden mirror (the only card-menu action there). Drops the copies by
  // their own ids — never touches the source (tokens/enable are ref-keyed + shared).
  const onUnfavorite = useCallback((ids: string[]) => {
    if (!file || !ids.length) return;
    const next = removeFavoriteCopies(file, ids);
    if (next === file) { playSfx('floatMenuClose'); return; }
    playSfx('cardDeselect');
    commitFile(next);
    pushNotice(ids.length === 1 ? 'Removed from Favorites' : `Removed ${ids.length} from Favorites`);
  }, [file, commitFile, pushNotice]);
  const onFavoritesBlocked = useCallback(() => { playSfx('floatMenuClose'); pushNotice("Can't add cards to favorites"); }, [pushNotice]);
  // item 9: resolver the carousel uses to know if the whole selection is already favorited (→ Unfavorite).
  const isCardFavoritedFn = useCallback((id: string) => (file ? isFavorited(file, id) : false), [file]);
  // v0.10.7 Golden Gear Edit card-hold radial → action. Move/Delete open their confirm sheets; the rest
  // fire immediately (the handlers already guard gold/companion/beastform + keep-one). Operates on the
  // raised selection the carousel passes in.
  const [moveReq, setMoveReq] = useState<string[] | null>(null);
  const [deleteReq, setDeleteReq] = useState<string[] | null>(null);
  /**
   * The prompts a toggle can raise, as QUEUES (v0.31.0).
   *
   * A bulk toggle is N toggles, and any of them can want to ask something: a spent consumable asks
   * whether to bin the card, an unanswered card asks which benefit it grants. Held as one id each,
   * every question but the last was overwritten before it was ever seen, so unequipping four potions
   * offered to discard one. The head of the queue is what shows; answering it uncovers the next.
   */
  /** v0.32.0: the card whose number the "#" button is asking for, or null. */
  const [numberCardId, setNumberCardId] = useState<string | null>(null);
  const [depletedIds, setDepletedIds] = useState<string[]>([]);
  const [choiceReqs, setChoiceReqs] = useState<string[]>([]);
  const depletedId = depletedIds[0] ?? null;
  const choiceReq = choiceReqs[0] ?? null;
  const queueDepleted = useCallback((id: string) => setDepletedIds((q) => [...q, id]), []);
  const nextDepleted = useCallback(() => setDepletedIds((q) => q.slice(1)), []);
  // Never queue the same card twice: a bulk equip that is blocked on one card's question would
  // otherwise ask it again on every later attempt.
  const queueChoice = useCallback((id: string) => setChoiceReqs((q) => (q.includes(id) ? q : [...q, id])), []);
  const nextChoice = useCallback(() => setChoiceReqs((q) => q.slice(1)), []);
  // Editable (player-authored) card ids (#264 item 5): the gallery + fullscreen action offer EDIT only
  // for these; everything else (catalog) is delete-only.
  const editableIds = useMemo(() => editableCardIds(file), [file]);
  // Mixed ancestry (#265): the FIRST card keeps trait 1 (so its trait 2 is crossed out), the SECOND
  // keeps trait 2 (its trait 1 crossed out). Maps each ancestry card id → the trait struck through.
  const crossOuts = useMemo<Record<string, 1 | 2>>(() => {
    const m = file?.mixedAncestry;
    if (!m) return {};
    return { [m.first]: 2, [m.second]: 1 };
  }, [file?.mixedAncestry]);
  // Save edits to a player-authored card in place, preserving its id + collection (and a custom card's
  // `target`). commitFile re-derives the sheet so effect edits take immediate effect.
  const onSaveEditedCard = useCallback((rawId: string, draft: CardDraft) => {
    if (!file) return;
    // v0.34.8: editing a COPY edits the card it mirrors, so every copy updates together. That is what
    // makes a copy a window onto one card rather than a snapshot that drifts.
    const id = contentIdOf(rawId, file);
    const patch = { title: draft.title, text: draft.text, imageUri: draft.imageUri, color: draft.color, effects: draft.effects, typeLabel: draft.typeLabel, fullImage: draft.fullImage };
    commitFile({
      ...file,
      customCards: file.customCards?.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      inventoryCustom: file.inventoryCustom?.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      notes: file.notes?.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      experiences: file.experiences?.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
    setEditCardId(null);
  }, [file, commitFile]);
  const onDeleteEditedCard = useCallback((id: string) => {
    onDeleteCards([id]);
    setEditCardId(null);
  }, [onDeleteCards]);
  // Save effects edited in the Modifiers panel (#278): a custom card updates its OWN effects; a catalog
  // card writes a per-card override (keyed by catalog id, so all copies share). Re-derives the sheet.
  const onEditCardEffects = useCallback((rawId: string, effects: CardEffect[]) => {
    if (!file) return;
    const id = contentIdOf(rawId, file); // a copy edits the card it mirrors (v0.34.8)
    if (findEditableCard(file, id)) {
      commitFile({
        ...file,
        customCards: file.customCards?.map((c) => (c.id === id ? { ...c, effects } : c)),
        inventoryCustom: file.inventoryCustom?.map((c) => (c.id === id ? { ...c, effects } : c)),
        notes: file.notes?.map((c) => (c.id === id ? { ...c, effects } : c)),
        experiences: file.experiences?.map((c) => (c.id === id ? { ...c, effects } : c)),
      });
    } else {
      commitFile({ ...file, cardEffectOverrides: { ...(file.cardEffectOverrides ?? {}), [catalogIdOf(id)]: effects } });
    }
  }, [file, commitFile]);
  // Card types (#246): add / remove the player's custom middle-ribbon types.
  const customCardTypes = useMemo(() => file?.customCardTypes ?? [], [file]);
  const onAddCardType = useCallback((label: string) => {
    const v = label.trim();
    if (!v) return;
    mutateFile({ customCardTypes: [...new Set([...(file?.customCardTypes ?? []), v])] });
  }, [file, mutateFile]);
  const onDeleteCardType = useCallback((label: string) => {
    mutateFile({ customCardTypes: (file?.customCardTypes ?? []).filter((t) => t !== label) });
  }, [file, mutateFile]);
  // Add a card targeted at a specific category (#246): open New Card with that category preselected.
  const [newCardCat, setNewCardCat] = useState<CardCategory | null>(null);
  // v0.9.8: how the New Card overlay was opened — 'menu' (float-menu / per-category, with the catalog
  // option), 'card' (sheet Add Card badge: author only, no catalog), 'gear' (sheet Add Gear badge:
  // straight into the catalog). Drives onAcquire + initialMode below.
  const [newCardEntry, setNewCardEntry] = useState<'menu' | 'card' | 'gear'>('menu');
  const onAddCardInCategory = useCallback((key: CardCategory) => {
    setNewCardCat(key);
    setNewCardEntry('menu');
    setFloatKind('custom');
  }, []);
  // The sheet's Add Card / Add Gear badges (v0.9.8) — both target the CURRENT carousel category
  // (categoryOverride left null → NewCardFlow uses the live category).
  const onAddCard = useCallback(() => { setNewCardCat(null); setNewCardEntry('card'); setFloatKind('custom'); }, []);
  const onAddGear = useCallback(() => { setNewCardCat(null); setNewCardEntry('gear'); setFloatKind('custom'); }, []);
  // Enabled/equipped cards (#175): the set drives the corner check; toggling re-derives the build
  // stats via the modifier engine while keeping in-play resource positions (clamped to the new maxes).
  const enabledIds = useMemo(() => new Set(file?.enabledCardIds ?? []), [file]);
  /**
   * v0.32.0: what each card IS, beyond equipped, for the carousel's corner and its action row.
   *
   * Built over every card the character HOLDS rather than only the equipped ones, because a permanent
   * card in the vault still wants its gold corner: that is precisely the state the card is telling you
   * to put it in.
   */
  const cardStates = useMemo(() => {
    /**
     * Built from `deckFile`, not `file` (v0.34.5).
     *
     * This walks every card the character has and asks three questions of each, and each of those
     * resolves that card's effects. Hanging it off `file` meant every die roll and every token drop
     * redid the lot, which is part of what made a die feel like treacle in a browser. `deckFile` is
     * the same object unless something other than the cosmetic token fields changed.
     */
    const file = deckFile;
    const permanent = new Set<string>();
    const numberInput = new Set<string>();
    const domain = new Set<string>();
    const toggleable = new Set<string>();
    if (file) {
      /**
       * Every card ON SCREEN, not every card the character holds (v0.34.5).
       *
       * `heldCardIds` is a list of the slots a character fills, and it is not the same list as the
       * deck: a card acquired at a level-up, a copy, a card moved into a custom category, all of them
       * ride the carousel without being in it. Their action row was therefore built from nothing, so
       * they lost the Toggle and the "#" that their own modifiers had earned. Reading the decks makes
       * the row true for whatever the carousel is actually showing, by construction.
       */
      const seen = new Set<string>(heldCardIds(file));
      for (const deck of Object.values(carouselDecks ?? {})) for (const c of deck) seen.add(c.ref ?? c.id);
      for (const raw of seen) {
        const ref = refOf(raw, file);
        if (isPermanentCard(ref, file)) permanent.add(ref);
        if (cardTakesNumberInput(ref, file)) numberInput.add(ref);
        const kind = cardById(catalogIdOf(ref))?.kind;
        /**
         * What may be switched off (owner, v0.38).
         *
         * Two rules, and no exceptions to either:
         *
         *  - **A card that carries a modifier can be toggled.** v0.34.5 held back the cards that say
         *    who you are, on the grounds that an ancestry is not a thing you switch off. The owner
         *    disagrees, and it is their sheet: a Human's extra Stress slot is a modifier like any
         *    other, and an ancestry that grants one with no way to quiet it is the only card on the
         *    sheet whose numbers cannot be checked against the table's.
         *  - **Every domain card can be toggled, modifier or not.** A domain card is a spell you have
         *    prepared; whether the app happens to model its rule as a number is not the player's
         *    concern, and a hand where some domain cards have the control and others do not reads as
         *    a bug rather than as a rule.
         */
        if (kind === 'domain') { domain.add(ref); toggleable.add(ref); }
        if (cardHasEffects(ref, file)) toggleable.add(ref);
      }
    }
    return { permanent, numberInput, domain, toggleable, modsOff: new Set(file?.modifiersOffCardIds ?? []) };
  }, [deckFile, carouselDecks]);
  // v0.19.1 item 8: ONE ref-based toggle implementation, shared by manual taps AND bulk equip. Reading +
  // writing fileRef/characterRef synchronously lets a staggered bulk sequence compose correctly (a
  // stale `file` closure would make every step start from the same original file). `force` makes it
  // directional for bulk: 'on' only equips, 'off' only unequips; a card already in the target state is
  // skipped so nothing toggles the wrong way — the result is byte-for-byte the same as manual selection.
  /**
   * Save a new file and re-derive the sheet from it, keeping the in-play resources (v0.32.0).
   *
   * This was the tail of `toggleOneFromRefs` and nothing else could reach it, so every later feature
   * that changes a derived number (muting a card's modifiers, typing the number Ferocity reads,
   * marking Stress while Eldritch Flesh is on) would have had to copy it. `adjust` is the one hook
   * the Beastform stress cost needs, applied before the toasts so it toasts the truth.
   */
  const applyFileToSheet = useCallback(
    (next: CharacterFile, adjust?: (c: Character) => Character) => {
      setFile(next);
      fileRef.current = next; // keep the ref fresh so a staggered bulk step reads the accumulated file
      saveFileRef.current(next);
      const c = characterRef.current;
      const d = toSheetCharacter(next);
      // Gaining Max HP fills the new heart(s) (#233 item 5): hp follows the gain so the added slot
      // animates filling; on a loss hp clamps down (the burst shows the heart breaking).
      const hpGain = Math.max(0, d.maxHp - c.maxHp);
      // Gaining Armor Score fills the new slot(s) (#328) — armor.active follows the score gain exactly
      // like hp follows maxHp above, so equipping flies the new shields IN and unequipping bursts them
      // OUT via burstResources' armor burst (the same silent visual path HP uses — no extra sound).
      const armorGain = Math.max(0, d.armorScore - c.armorScore);
      const base: Character = {
        ...d,
        hp: Math.min(d.maxHp, c.hp + hpGain),
        stress: { ...d.stress, active: Math.min(c.stress.active, d.stress.total - (d.stress.locked ?? 0)) },
        armor: { ...d.armor, active: Math.min(d.armorScore, c.armor.active + armorGain) },
        hope: { ...d.hope, active: Math.min(c.hope.active, d.hope.total - (d.hope.locked ?? 0)) },
        gold: c.gold,
        portraitUri: c.portraitUri,
        portraitTransform: c.portraitTransform,
      };
      const result = adjust ? adjust(base) : base;
      // Toast each attribute the change made (#233 item 1): "+1 Finesse", "−2 Evasion", …
      pushToasts(c, result);
      // animate any track whose value the change moved (e.g. +1 Max HP at full HP, removed)
      burstResources(c, result);
      setCharacter(result);
      characterRef.current = result; // keep fresh for the next staggered bulk step
      return result;
    },
    [burstResources, pushToasts],
  );
  const toggleOneFromRefs = useCallback(
    // v0.31.0: `cents` pitches this step's equip/unequip sound. A bulk run walks it up as cards come
    // on and down as they go off, so a cascade reads as one rising (or falling) run rather than the
    // same click N times. Zero for a single tap, which is unchanged.
    (id: string, force?: 'on' | 'off', cents = 0) => {
      const file = fileRef.current;
      if (!file) return;
      // #277: enable + effects key by the card's REF (its catalog/custom id), so all copies of a card
      // share one equip and apply their effect once. `id` is the tapped instance; `ref` the underlying card.
      const ref = refOf(id, file);
      const wasEnabled = (file.enabledCardIds ?? []).includes(ref);
      if (force === 'on' && wasEnabled) return; // bulk equip: already on
      if (force === 'off' && !wasEnabled) return; // bulk unequip: already off
      const isWs = isWildshapeId(ref);
      const cur = new Set(file.enabledCardIds ?? []);
      // Beastform state (#279): the one enabled wildshape (if any) = "transformed".
      const activeWs = [...cur].find((x) => isWildshapeId(x));
      const transformed = !!activeWs;
      const cidWeapon = !!weaponById(ref);
      const cidDomain = cardById(ref)?.kind === 'domain';
      let beastformUnequipped = file.beastformUnequipped;
      let beastformDomainSnapshot = file.beastformDomainSnapshot;
      if (wasEnabled) {
        // Disabling is always allowed. Leaving the active form restores the auto-unequipped weapons.
        cur.delete(ref);
        if (isWs && ref === activeWs) {
          for (const w of file.beastformUnequipped ?? []) cur.add(w);
          beastformUnequipped = undefined;
          beastformDomainSnapshot = undefined;
        }
        domainOverrideRef.current = 0; // #318: any non-blocked toggle ends an exceed streak
        playSfx(isWs ? 'disableBeastform' : 'cardDisable', { cents });
        // v0.14.1: a CONSUMABLE is used up the moment you switch it off — offer to bin the depleted
        // card. Only offered, never automatic: the player may be holding several of the same potion,
        // and onDeleteCards drops exactly one copy from the multiset.
        // v0.31.0: bulk asks too, one prompt after another, instead of staying silent about it.
        if (lootById(catalogIdOf(id))?.kind === 'consumable') queueDepleted(id);
      } else {
        // v0.25.0: a card offering a CHOICE cannot be equipped until it is answered, because an
        // unanswered card grants nothing and doing that silently is worse than asking. Vitality is
        // the first: "permanently gain two of the following."
        if (cardChoiceFor(catalogIdOf(ref)) && !file.cardChoices?.[ref]) { queueChoice(ref); return; }
        // #279 equip rules while transformed — blocked actions play the negative (float-menu-close) sound.
        if (isWs && transformed) { playSfx('floatMenuClose'); return; } // can't switch forms — exit first
        if (transformed && cidWeapon) { playSfx('floatMenuClose'); return; } // no weapons while transformed
        if (transformed && cidDomain && !(beastformDomainSnapshot ?? []).includes(ref)) { playSfx('floatMenuClose'); return; } // no NEW domain cards
        // #318: at most 5 ENABLED domain cards (any domain). A 6th is blocked with a "Maximum 5 Domain
        // Cards" notice; insisting 3× in a row (without leaving fullscreen) overrides it (debug).
        // v0.25.0: permanent cards are exempt. Vitality's own text tells you to vault it, and it keeps
        // working from there, so it is not occupying one of the five loadout slots. Cards ALREADY
        // enabled that are permanent do not count towards the total either.
        if (cidDomain && !isPermanentCard(ref, file)) {
          const enabledDomains = [...cur].filter((x) => cardById(x)?.kind === 'domain' && !isPermanentCard(x, file)).length;
          if (enabledDomains >= 5) {
            if (force !== undefined) { playSfx('floatMenuClose'); return; } // bulk: respect the cap, skip this one
            domainOverrideRef.current += 1;
            if (domainOverrideRef.current < 3) { playSfx('floatMenuClose'); pushNotice('Maximum 5 Domain Cards'); return; }
            domainOverrideRef.current = 0; // 3rd insistence → let it through
          } else {
            domainOverrideRef.current = 0;
          }
        } else {
          domainOverrideRef.current = 0;
        }
        playSfx(isWs ? 'activateBeastform' : 'cardEnable', { cents });
        // Martial Form (#357): one active stance at a time — shifting into a stance ends the previous
        // one (the sheet rule: "…until you shift into another stance"). Direct switching is allowed.
        if (isMartialStanceId(ref)) for (const x of [...cur]) if (x !== ref && isMartialStanceId(x)) cur.delete(x);
        if (isWs) {
          // Transform: auto-unequip weapon cards (restored on exit); snapshot the enabled domain cards
          // so the player may re-equip one they drop mid-form (but not equip a brand-new domain).
          const weapons = [...cur].filter((x) => !!weaponById(catalogIdOf(x)));
          for (const w of weapons) cur.delete(w);
          beastformUnequipped = weapons;
          beastformDomainSnapshot = [...cur].filter((x) => cardById(catalogIdOf(x))?.kind === 'domain');
        }
        // Threshold SET conflict (#242 item 9): a card that SETS Major (or Severe) disables any other
        // enabled card that sets the same threshold — two "set major" can't both apply. Bonuses stack.
        const eff = effectsForCardId(ref, file);
        const setsMajor = eff.some((e) => e.target === 'majorThreshold' && e.mode === 'set');
        const setsSevere = eff.some((e) => e.target === 'severeThreshold' && e.mode === 'set');
        if (setsMajor || setsSevere) {
          for (const x of [...cur]) {
            if (x === ref) continue;
            const xe = effectsForCardId(x, file);
            if (setsMajor && xe.some((e) => e.target === 'majorThreshold' && e.mode === 'set')) cur.delete(x);
            if (setsSevere && xe.some((e) => e.target === 'severeThreshold' && e.mode === 'set')) cur.delete(x);
          }
        }
        cur.add(ref);
      }
      const next = { ...file, enabledCardIds: [...cur], beastformUnequipped, beastformDomainSnapshot };
      // Assuming a Beastform costs Stress (#214) — spill to HP when Stress is full, never lethal.
      applyFileToSheet(next, (result) => {
        if (!isWs || wasEnabled) return result;
        const ws = wildshapeById(id);
        if (!ws) return result;
        const { stressActive, hp } = applyWildshapeCost(
          { stressActive: result.stress.active, stressUnlocked: result.stress.total - (result.stress.locked ?? 0), hp: result.hp },
          ws.stress,
        );
        return { ...result, hp, stress: { ...result.stress, active: stressActive } };
      });
      // v0.32.0: a few cards need a word from the app when they come on, because what they grant is
      // not a number the sheet can show (Master of the Craft asks you to name the Experience).
      if (!wasEnabled) {
        const notice = equipNoticeFor(catalogIdOf(ref));
        if (notice) showToast(notice, 'info');
      }
    },
    [applyFileToSheet, pushNotice, queueChoice, queueDepleted],
  );
  // v0.26.0: is anything modal open? The keyboard scheme keeps its hands off the carousel when so.
  const anyOverlay = !!(floatKind || cardInfoId || editCardId || emptyPanel || incoming || moveReq || depletedId || newCardCat || choiceReq);
  const onToggleCard = useCallback((id: string) => toggleOneFromRefs(id), [toggleOneFromRefs]);
  /**
   * v0.32.0: switch an equipped card's modifiers off (or back on) without unequipping it.
   *
   * Writes through the same choke point everything else does, so it lands in history and the sheet
   * re-derives from it exactly like an equip. Newly equipped cards start LIVE, which is why this
   * stores the OFF ones: the default needs no entry at all.
   */
  const onToggleCardModifiers = useCallback((id: string) => {
    const cur = fileRef.current;
    if (!cur) return;
    const ref = refOf(id, cur);
    const off = new Set(cur.modifiersOffCardIds ?? []);
    const nowOff = !off.has(ref);
    if (nowOff) off.add(ref); else off.delete(ref);
    playSfx(nowOff ? 'cardDisable' : 'cardEnable');
    withIntent({ kind: 'equip', label: `${nowOff ? 'Muted' : 'Unmuted'} ${sourceLabelForCardId(ref, cur)}` });
    const next = { ...cur, modifiersOffCardIds: [...off] };
    applyFileToSheet(next);
  }, [applyFileToSheet]);
  /** v0.32.0: store the number a card's `input` formulas read. Per card, keyed by ref like everything. */
  const setNumberInput = useCallback((id: string, n: number) => {
    const cur = fileRef.current;
    if (!cur) return;
    const ref = refOf(id, cur);
    withIntent({ kind: 'equip', label: `Set ${sourceLabelForCardId(ref, cur)} to ${n}` });
    applyFileToSheet({ ...cur, numberInputs: { ...cur.numberInputs, [ref]: n } });
  }, [applyFileToSheet]);
  // item 8: bulk equip/unequip the raised selection. If every card is already equipped the whole set is
  // unequipped, otherwise the whole set is equipped — each firing BULK_STEP_MS after the last, LEFT→RIGHT in deck
  // order, so they cascade on visibly. When the queue drains, the selection clears all at once.
  const onBulkEquip = useCallback((ids: string[]) => {
    const cur = fileRef.current;
    if (!cur || !ids.length) return;
    const decksNow = carouselDecks ?? {};
    const cat = Object.keys(decksNow).find((k) => decksNow[k].some((c) => ids.includes(c.id)));
    const order = cat ? decksNow[cat].map((c) => c.id).filter((cid) => ids.includes(cid)) : ids;
    const enabled = new Set(cur.enabledCardIds ?? []);
    const target: 'on' | 'off' = order.every((cid) => enabled.has(refOf(cid, cur))) ? 'off' : 'on';
    // Each toggle is its own disk write; tag every one with the SAME intent so history folds them
    // into a single "Equipped 8 cards" rather than eight entries for one gesture.
    const label = `${target === 'on' ? 'Equipped' : 'Unequipped'} ${order.length} card${order.length === 1 ? '' : 's'}`;
    // v0.31.0: 130ms apart, not 35. At 35 the clicks piled into one smeared noise; at this spacing
    // each card lands as its own sound. The pitch walks a semitone-and-a-half per step, UP as cards
    // come on and DOWN as they go off, capped so a long selection does not climb out of the register.
    order.forEach((cid, i) =>
      setTimeout(() => {
        withIntent({ kind: 'equip', label });
        toggleOneFromRefs(cid, target, (target === 'on' ? 1 : -1) * Math.min(i, 8) * 150);
      }, i * BULK_STEP_MS),
    );
    setTimeout(() => carouselApiRef.current?.deselectAll(), order.length * BULK_STEP_MS + 90);
  }, [carouselDecks, toggleOneFromRefs]);
  // v0.10.7 Golden Gear Edit card-hold radial → action. Move/Delete open their sheets; Bulk Equip runs the
  // staggered equip; the rest fire immediately. Operates on the raised selection the carousel passes in.
  const onCardAction = useCallback((kind: CardMenuKind, ids: string[]) => {
    switch (kind) {
      case 'bulkEquip': onBulkEquip(ids); break; // item 8: replaces the old Duplicate slot
      case 'favorite': onFavoriteCards(ids); break;
      case 'move': setMoveReq(ids); break;
      case 'delete': setDeleteReq(ids); break;
      case 'nfc': onSendNfc(ids); break;
      case 'unfavorite': onUnfavorite(ids); break;
    }
  }, [onBulkEquip, onFavoriteCards, onSendNfc, onUnfavorite]);
  // Beastform auto-exit at 0 HP (#279): dropping to 0 ends the form — weapons re-equip, domain limits
  // lift. Reactive so it fires however HP reached 0 (damage panel, taps, etc.). Self-terminating: once
  // the form is gone there's no active wildshape, so it won't re-run.
  useEffect(() => {
    if (!file || character.hp > 0) return;
    const activeWs = (file.enabledCardIds ?? []).find((x) => isWildshapeId(x));
    if (!activeWs) return;
    const cur = new Set(file.enabledCardIds ?? []);
    cur.delete(activeWs);
    for (const w of file.beastformUnequipped ?? []) cur.add(w);
    const next = { ...file, enabledCardIds: [...cur], beastformUnequipped: undefined, beastformDomainSnapshot: undefined };
    setFile(next);
    saveFileRef.current(next);
    const d = toSheetCharacter(next);
    setCharacter((c) => ({
      ...d,
      hp: 0,
      stress: { ...d.stress, active: Math.min(c.stress.active, d.stress.total - (d.stress.locked ?? 0)) },
      armor: { ...d.armor, active: Math.min(c.armor.active, d.armor.total - (d.armor.locked ?? 0)) },
      hope: { ...d.hope, active: Math.min(c.hope.active, d.hope.total - (d.hope.locked ?? 0)) },
      gold: c.gold,
      portraitUri: c.portraitUri,
      portraitTransform: c.portraitTransform,
    }));
    playSfx('disableBeastform');
  }, [character.hp, file]);
  // Card tokens (#244): cosmetic buttons stuck on cards, keyed by deck-card id. They never feed the
  // modifier engine — pure decoration — so they don't re-derive `character`; they only persist.
  // Keyed on file.cardTokens (NOT the whole file, #297 perf): unrelated edits (HP, equips, level-up)
  // used to mint a new map ref every save, churning the entire carousel context + re-rendering every
  // slot. Now the context's token map only changes identity when a token actually changes.
  const cardTokens = useMemo(() => file?.cardTokens ?? {}, [file?.cardTokens]);
  const placeToken = useCallback((cardId: string, token: PlacedToken) => {
    setFile((f) => {
      if (!f) return f;
      const map = { ...(f.cardTokens ?? {}) };
      map[cardId] = [...(map[cardId] ?? []), token];
      const next = { ...f, cardTokens: map };
      saveFileRef.current(next);
      return next;
    });
  }, []);
  const removeToken = useCallback((cardId: string, tokenId: string) => {
    setFile((f) => {
      if (!f) return f;
      const cur = (f.cardTokens ?? {})[cardId];
      if (!cur) return f;
      const map = { ...(f.cardTokens ?? {}) };
      const left = cur.filter((t) => t.id !== tokenId);
      if (left.length) map[cardId] = left;
      else delete map[cardId];
      const next = { ...f, cardTokens: map };
      saveFileRef.current(next);
      return next;
    });
  }, []);
  // #293: patch a single placed token (a die's value cycling on tap).
  /**
   * A die's face changing is not a moment in the character's story (v0.34.5).
   *
   * Every roll and every tap on a die used to append a whole-character SNAPSHOT to the history and
   * then re-serialize the lot, mid-animation, on the JS thread. That is the browser's freeze, and it
   * got worse with every roll because the file it had to write grew each time. Placing and removing
   * a token are still recorded; what a die happens to be showing is not.
   */
  const updateToken = useCallback((cardId: string, tokenId: string, patch: Partial<PlacedToken>) => {
    intentRef.current = { system: true };
    setFile((f) => {
      if (!f) return f;
      const cur = (f.cardTokens ?? {})[cardId];
      if (!cur) return f;
      const map = { ...(f.cardTokens ?? {}) };
      map[cardId] = cur.map((t) => (t.id === tokenId ? { ...t, ...patch } : t));
      const next = { ...f, cardTokens: map };
      saveFileRef.current(next);
      return next;
    });
  }, []);
  /**
   * The moodboard (v0.34.0), opened by double-tapping the portrait.
   *
   * While it is open the sheet renders the board INSTEAD of itself, so the carousel, the forge stage
   * and every track come down. That is the owner's "everything gets unloaded for performance", and it
   * costs nothing to do it this way: the character's state and its save path are untouched, so
   * closing the board is a render rather than a reload.
   */
  const [boardOpen, setBoardOpen] = useState(false);
  const moodboard = useMemo(() => readMoodboard(file?.moodboard), [file?.moodboard]);
  const onMoodboard = useCallback((next: MoodboardItem[]) => mutateFile({ moodboard: next }), [mutateFile]);
  const onOpenBoard = useCallback(() => setBoardOpen(true), []);

  /**
   * The dice tray (v0.39.0, owner).
   *
   * Its state lives HERE rather than inside the tray because two things outside the tray answer to it:
   * the three vitals panels, which fade out to make room, and the trait row, which is rendered beside
   * the sheet body and becomes a way to throw the duality pair while the tray is up. Nothing about it
   * is saved: a handful of dice is not part of a character.
   */
  const [diceUp, setDiceUp] = useState(false);
  const trayRef = useRef<DiceTrayHandle | null>(null);
  const toggleDice = useCallback(() => {
    setDiceUp((v) => {
      playSfx(v ? 'panelClose' : 'panelOpen');
      return !v;
    });
  }, []);
  const rollTrait = useCallback((label: string, value: number) => trayRef.current?.rollDuality(label, value), []);

  /**
   * The three roll presets (v0.41.0, owner).
   *
   * They live on the character file, so they travel with an export and belong to the person whose
   * cards their variables read. Writing one goes through the same save path as everything else.
   */
  const presets = useMemo(() => slotsOf(file?.dicePresets), [file?.dicePresets]);
  const writePreset = useCallback((slot: number, preset: DicePreset | null) => {
    // Through the ONE save choke point, like every other change to the file: `setFile` alone updates
    // the screen and never reaches the disk, so a preset saved that way was gone on the next visit.
    const f = fileRef.current;
    if (f) commitFileRef.current({ ...f, dicePresets: writeSlot(f.dicePresets, slot, preset) });
  }, []);
  /** What the tray holds right now, asked for only while a preset dialog needs it. */
  const trayDice = useCallback(() => trayRef.current?.currentDice() ?? [], []);
  /**
   * Rolling a preset.
   *
   * Its modifier is resolved HERE, against the character as it stands, because that is the point of a
   * preset naming a variable: "+ Attack Rolls" should mean whatever the cards you have equipped today
   * add, not whatever they added the day it was saved.
   */
  const playPreset = useCallback((preset: DicePreset) => {
    const ctx = {
      level: character.level,
      tier: tierForLevel(character.level),
      proficiency: character.proficiency,
      stress: character.stress.active,
      attackRoll: character.attackRoll ?? 0,
      spellcastRoll: character.spellcastRoll ?? 0,
      spellcast: character.spellcastTrait ? character.traits[character.spellcastTrait] ?? 0 : 0,
      traits: character.traits as Partial<Record<string, number>>,
    };
    trayRef.current?.playPreset(preset.dice, preset.name, modifierValue(preset.modifier, ctx));
  }, [character]);
  /**
   * Coming back from the board (v0.34.1).
   *
   * The sheet is remounted from nothing, so its cards, tracks and frame arrive over the next few
   * frames and the old cut from a dark canvas to bright parchment read as a flashbang with things
   * popping in behind it. `boardCover` holds the board's own ground over the sheet and fades it out,
   * so the sheet is already assembled by the time it is visible. Same trick the tour hand-back uses.
   */
  const boardCover = useSharedValue(0);
  const boardCoverStyle = useAnimatedStyle(() => ({ opacity: boardCover.value }));
  const closeBoard = useCallback(() => {
    boardCover.value = 1;
    setBoardOpen(false);
    boardCover.value = withDelay(140, withTiming(0, { duration: 460, easing: Easing.out(Easing.quad) }));
  }, [boardCover]);
  /** The captured board becomes the portrait, through the same path the picker uses. */
  const onBoardPortrait = useCallback(
    (uri: string) => {
      const reset = { scale: 1, x: 0, y: 0 };
      setCharacter((c) => ({ ...c, portraitUri: uri, portraitTransform: reset }));
      mutateFile({ portraitUri: uri, portraitTransform: reset });
    },
    [mutateFile],
  );
  /**
   * Turning "use as portrait" on and off again (owner, v0.34.3).
   *
   * Switching it ON files the portrait the board is about to replace; switching it OFF puts that
   * portrait back, crop and all. Exactly one is kept, so this undoes the board and nothing older: the
   * rewind screen says as much, because a portrait is not part of what history stores.
   */
  const onUseBoardPortrait = useCallback(
    (on: boolean) => {
      if (on) {
        mutateFile({ moodboardAsPortrait: true, portraitBefore: fileRef.current?.portraitUri ?? null, portraitBeforeTransform: fileRef.current?.portraitTransform });
        return;
      }
      const back = fileRef.current?.portraitBefore ?? null;
      const transform = fileRef.current?.portraitBeforeTransform ?? { scale: 1, x: 0, y: 0 };
      setCharacter((c) => ({ ...c, portraitUri: back, portraitTransform: transform }));
      mutateFile({ moodboardAsPortrait: false, portraitUri: back, portraitTransform: transform, portraitBefore: null, portraitBeforeTransform: undefined });
    },
    [mutateFile],
  );
  const setTokenColor = useCallback((color: string) => mutateFile({ tokenColor: color }), [mutateFile]);
  const moveTokenDrawer = useCallback((x: number) => mutateFile({ tokenDrawerX: x }), [mutateFile]);
  const onHp = useCallback(
    // No overhealing past the character's TRUE maximum (#107) — not the slot capacity.
    (n: number) => setCharacter((c) => ({ ...c, hp: Math.max(0, Math.min(c.maxHp, n)) })),
    [],
  );
  /**
   * v0.32.0: does any live card read the Stress track? Eldritch Flesh is the first.
   *
   * Checked before doing anything, because re-deriving the whole sheet on every Stress tap would be a
   * real cost paid by every character for one card almost nobody has equipped.
   */
  const stressDrivesStats = useMemo(
    () => !!file && [...new Set(file.enabledCardIds ?? [])].some((id) => usesFormulaVariable(effectsForCardId(id, file), 'stress')),
    [file],
  );
  const stressDrivesRef = useRef(stressDrivesStats);
  stressDrivesRef.current = stressDrivesStats;
  const onTrack = useCallback(
    (key: TrackKey, n: number) => {
      const c = characterRef.current;
      const t = c[key];
      const unlocked = t.total - (t.locked ?? 0);
      const active = Math.max(0, Math.min(unlocked, n));
      const moved: Character = { ...c, [key]: { ...t, active } };
      // The ref leads the state on purpose: `applyFileToSheet` reads it for the in-play resources, so
      // it has to already know the new Stress or the re-derive would clamp straight back to the old one.
      characterRef.current = moved;
      setCharacter(moved);
      // v0.32.0: marking Stress can change a STAT (Eldritch Flesh), so the sheet re-derives from the
      // file with the new value. The file's resources are only stamped at save time, so stamp them here.
      if (key !== 'stress' || !stressDrivesRef.current) return;
      const cur = fileRef.current;
      if (!cur) return;
      applyFileToSheet({ ...cur, resources: { hp: moved.hp, hope: moved.hope.active, armor: moved.armor.active, stress: active } });
    },
    [applyFileToSheet],
  );
  // Status bar clearance, third attempt (#54 D). On the owner's A54 + Expo Go BOTH inset APIs
  // (safe-area context AND StatusBar.currentHeight) report 0 — the device "acts as if there is no
  // status bar" while very much showing one. So: use whatever the APIs detect, but on Android
  // never less than a 32dp floor. The shift is a MARGIN (not padding): absolutely-positioned
  // children like the SheetFrame border anchor to the view's box, so a margin moves border and
  // content together, while padding can leave absolute children at the physical top.
  // v0.23.0: the stage's own rect, so the parchment matte and the gold border can follow the DESIGN
  // instead of the container. On a phone the two are nearly the same shape, so this resolves to the
  // full container and nothing changes.
  const [stageBox, setStageBox] = useState<{ w: number; h: number } | null>(null);
  // v0.24.1: the sheet is the one screen that does NOT paint ink at its edges. Its parchment matte
  // runs the full width between the inset bars, so the tablet margins must be parchment too or the
  // sheet reads as a pale column stranded between two dark strips.
  // The margins mirror the screen's EDGE, and the border band around the sheet is ink even here, so
  // the parchment must not leak into them: it read as a white gutter on tablet and web (#0.24.3).
  useScreenEdge(Rune.ink);
  const { isTablet } = useLayout();
  const frameRect = useMemo(() => {
    if (!isTablet || !stageBox || stageBox.w <= 0) return null;
    const m = computeStageScale({ availW: stageBox.w, availH: stageBox.h, designW: SHEET_DESIGN_WIDTH, designH: SHEET_DESIGN_HEIGHT });
    return { left: m.offsetX, top: m.offsetY, width: m.scaledW, height: m.scaledH };
  }, [isTablet, stageBox]);

  const insets = useSafeAreaInsets();
  const detected = Math.max(insets.top, Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) : 0);
  const topInset = Platform.OS === 'android' && detected < 24 ? 32 : detected;
  // Bottom mirror (#59): the same device reports a 0 BOTTOM inset too, so the sheet (and the
  // gears' spill) ran under the 3-button nav bar. Floor at the standard 48dp bar height whenever
  // Android detection is implausibly small; gesture-nav devices report ~16-34 and keep it.
  const bottomInset = Platform.OS === 'android' && insets.bottom < 16 ? 48 : insets.bottom;
  if (boardOpen)
    return (
      <MoodboardScreen
        items={moodboard}
        usePortrait={!!file?.moodboardAsPortrait}
        onChange={onMoodboard}
        onSetPortrait={onBoardPortrait}
        onUsePortrait={onUseBoardPortrait}
        background={file?.moodboardColor}
        onBackground={(color) => mutateFile({ moodboardColor: color })}
        onClose={closeBoard}
      />
    );
  return (
    <AccentProvider>
      <CarouselProvider decks={carouselDecks} categoryMeta={categoryMeta} ring={ring} validRing={validRing} originIndices={originIndices} enabledIds={enabledIds} cardStates={cardStates} crossOuts={crossOuts} onToggleCard={onToggleCard} onToggleCardModifiers={onToggleCardModifiers} onEditNumberInput={setNumberCardId} onShowCardInfo={setCardInfoId} onLeaveFullscreen={() => { domainOverrideRef.current = 0; }} cardTokens={cardTokens} tokenColor={file?.tokenColor} tokenDrawerX={file?.tokenDrawerX} onPlaceToken={placeToken} onRemoveToken={removeToken} onUpdateToken={updateToken} onSetTokenColor={setTokenColor} onMoveTokenDrawer={moveTokenDrawer} onReorderCards={onReorderCards} onCardAction={onCardAction} nfcAvailable={nfcModulesPresent()} isCardFavorited={isCardFavoritedFn} onEmptyFavorites={() => pushNotice('Add a card to favorites!')} onEmptyOpen={() => setEmptyPanel('root')} apiRef={carouselApiRef}>
       {/* v0.29.1: the south wedge is CHARACTERS, the way out. It is not an interface, it raises the
           SAME leave confirm the back button already uses rather than adding a second prompt that
           could drift from it. */}
       <FloatMenuProvider onOpenInterface={(k) => { if (k === 'characters') { setLeaveConfirm(true); return; } if (k === 'custom') setNewCardEntry('menu'); setFloatKind(k); }}>
        <SheetBackGuard
          leaveConfirm={leaveConfirm}
          editCardId={editCardId}
          cardInfoId={cardInfoId}
          damageOpen={damageOpen}
          floatKind={floatKind}
          onCloseLeave={() => setLeaveConfirm(false)}
          onCloseEdit={() => setEditCardId(null)}
          onCloseCardInfo={() => setCardInfoId(null)}
          onCloseDamage={() => setDamageOpen(false)}
          onCloseFloat={() => { setFloatKind(null); setNewCardCat(null); }}
          onLeave={() => setLeaveConfirm(true)}
        />
        {/* v0.13.2 (#359): always-on NFC card receiving. Inside the providers so it can read carousel
            `editing`; suppressed only while a focused interface is open (never by card view state). */}
        <SheetNfcReceiver
          present={nfcModulesPresent()}
          flags={{
            floatOpen: floatKind !== null,
            damageOpen,
            cardInfoOpen: cardInfoId !== null,
            editCardOpen: editCardId !== null,
            emptyPanelOpen: emptyPanel !== null,
            leaveConfirm,
            sending: nfcSend !== null,
            receiving: incoming !== null,
          }}
          onCard={onNfcCard}
          onReject={onNfcReject}
        />
        <View style={{ flex: 1, backgroundColor: Rune.ink }}>
          {/**
            * Everything in the sheet can put a dialog at THIS level (v0.41.2, owner).
            *
            * The preset editor is written inside `DesignStage`, whose content is a scaled box, so its
            * `absoluteFill` scrim covered the design box and nothing else. On a phone whose aspect is
            * not 412x892 that leaves a strip of the parchment matte above and below, undimmed, which
            * is the "white sections on my device while the Save to slot 1 pop-up is active".
            *
            * `OverlayHost` draws a published dialog here instead, outside the stage and outside the
            * safe-area insets, so its scrim is the screen. See `components/overlay-host`; the modifier
            * panel has been doing this since v0.39 for the same reason.
            */}
          <OverlayHost>
          <View
            style={{ flex: 1, marginTop: topInset, marginBottom: bottomInset }}
            onLayout={(e) => setStageBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
            {/* Parchment matte: any letterbox margin reads as sheet, never ink, so the full-bleed gold
                frame frames parchment instead of a dark gap (#1).
                v0.23.0 TABLET: on a tablet the matte is confined to the stage rather than the whole
                container, so the sheet reads as the phone's sheet, centred, rather than a page
                stretched to a different shape. */}
            <View style={[frameRect ?? StyleSheet.absoluteFill, { position: 'absolute', backgroundColor: Rune.sheet }]} />
            {/* clip off: the expand/focus dims overdraw past the stage to reach the screen edges.
                The safe-area inset pushes everything (border included) below the status bar; the
                strip above reads as the root's ink navy. Web's inset is 0, so the layouts are the
                SAME design, mobile-first (#43 A — replaces the old web-only 26px shift).
                marginTop pushes the DESIGN down INSIDE the border (#61): once the top+bottom bars
                ate the container height, the stage's natural letterbox vanished and the border's
                top band started covering the top of the name (authored at design y14). 18px keeps
                the design clear of the band at any container height. */}
            <DesignStage
              designWidth={SHEET_DESIGN_WIDTH}
              designHeight={SHEET_DESIGN_HEIGHT}
              clip={false}
              style={{ marginTop: 18 }}>
              <RedesignedBody character={character} onHp={onHp} onTrack={onTrack} onInfo={onInfo} heartRef={heartRef} stressRef={stressRef} armorRef={armorRef} hopeRef={hopeRef} onPortraitTransform={onPortraitTransform} onPortraitReplace={onPortraitReplace} onOpenBoard={onOpenBoard} onAddCard={onAddCard} onAddGear={onAddGear} onFavoritesBlocked={onFavoritesBlocked} diceUp={diceUp} />
              {/* v0.39.0: the dice tray sits between the sheet and the traits, so its panels cover the
                  vitals fading out behind them and the cards still ride over everything. */}
              <DiceTray up={diceUp} onToggle={toggleDice} handleRef={trayRef} />
              {/* The presets sit in the Evasion panel while the tray is up, over the faded contents. */}
              {diceUp ? <DicePresetSlots presets={presets} trayDice={trayDice} onWrite={writePreset} onPlay={playPreset} /> : null}
              <TraitBanners character={character} modifierSize={22} groupTop={614} onRoll={diceUp ? rollTrait : undefined} />
              <ExpandVeil />
              <EditHud file={file ?? undefined} />
              {/* v0.26.0: keyboard control, web only. Inside the provider because it drives the
                  carousel; a no-op on a phone. */}
              <KeyboardControl overlay={anyOverlay} />
              {/* Gears now live INSIDE the carousel (#62 D): above the veil and the fullscreen dim,
                  never above a card — and the inner gear is the grind-scroll control. */}
              {/* Unload the sheet carousel while Level-Up (#203) or the Cards panel (#227) is open —
                  Level-Up owns the screen; the Cards panel may disable the current category, so the
                  hand must be down to land safely on an enabled one when it reopens. */}
              {/* Unload the carousel + token board for every FULL-SCREEN interface (#252): Level Up,
                  Cards management, and New Card (incl. the catalog reached from it) all cover the sheet. */}
              {/* #276 item 4: stay mounted while editing a card from fullscreen so it remains fullscreen
                  behind the editor — only the full-screen INTERFACES (level/cards/New Card) unload it. */}
              {floatKind === 'level' || floatKind === 'cards' || floatKind === 'custom' ? null : <CardCarousel />}
              {floatKind === 'level' || floatKind === 'cards' || floatKind === 'custom' ? null : (
                <CarouselTokenBoard onEditCard={setEditCardId} onDeleteCard={(id) => onDeleteCards([id])} editableIds={editableIds} />
              )}
              {/* radial float menu (#161): dim + connector + fanned options, above the carousel */}
              <FloatMenuOverlay />
              {/* DOWNED, at 0 hit points. The sheet wears the same colourless wash a fully scarred
                  character does, because being down should look like it, but the two things a player
                  needs to READ while down keep their colour: the hit points panel, so the way back up
                  is legible, and their own portrait.

                  v0.29.0: the bands are DIRECT children of the stage. They were wrapped in a plain
                  positioned View before, and that is the whole bug: a blend mode blends with the
                  backdrop of the nearest ancestor forming an isolated group, and a wrapper is always
                  one. On web react-native-web gives EVERY View `position: relative; z-index: 0`, and
                  on Android any group holding a blended child gets its own saveLayer. So the bands
                  were blending against an empty layer, and grey blended with nothing is just grey:
                  the sheet came out as a flat opaque slab with rectangles cut out of it.

                  zIndex 25 is the gap the sheet's stacking contract already leaves between the expand
                  veil (20) and the cards (30). The body washes; a focused card or the float menu
                  drawn above it does not get a colour window punched through it. */}
              {character.hp <= 0 && (character.scars ?? 0) < character.hope.total
                ? washBands(412, 892, [
                    ...(character.portraitUri ? [{ left: 16, top: 15, width: 148, height: 222 }] : []),
                    { left: 21, top: 301, width: 373, height: 84 },
                  ]).map((b, i) => (
                    <View
                      key={i}
                      pointerEvents="none"
                      style={{ position: 'absolute', left: b.left, top: b.top, width: b.width, height: b.height, backgroundColor: '#8A8A8A', mixBlendMode: 'saturation', zIndex: 25 }}
                    />
                  ))
                : null}
            </DesignStage>
            {/* Stat-change toasts (#233): pinned at the top, UNDER the gold border (rendered before
                SheetFrame) so the border overlays them — layer + position per owner. */}
            <StatToastHost toasts={toasts} onExpire={(id) => setToasts((list) => list.filter((t) => t.id !== id))} />
            {/* v0.10.7 Golden Gear Edit: the ever-present controls bar is gone — actions live on the
                card-hold radial (tap the gear to exit). Move/Delete still confirm through their sheets. */}
            {/* v0.12.1 item 10: the radial-menu pop-ups fade in (they used to POP). */}
            {moveReq ? (
              <Animated.View style={StyleSheet.absoluteFill} pointerEvents="box-none" entering={FadeIn.duration(170)}>
                <MoveSheet count={moveReq.length} ordered={moveTargets} customCategories={customCategories} onMove={(key) => { onMoveCards(moveReq, key); setMoveReq(null); }} onCopy={(key) => { onDuplicateCards(moveReq, key); setMoveReq(null); }} onClose={() => setMoveReq(null)} />
              </Animated.View>
            ) : null}
            {deleteReq ? (
              <Animated.View style={StyleSheet.absoluteFill} pointerEvents="box-none" entering={FadeIn.duration(170)}>
                <Confirm title={deleteReq.length > 1 ? `Delete ${deleteReq.length} cards?` : 'Delete this card?'} body="The selected cards are permanently removed. This can't be undone." confirmLabel="Delete" onCancel={() => setDeleteReq(null)} onConfirm={() => { onDeleteCards(deleteReq); setDeleteReq(null); }} />
              </Animated.View>
            ) : null}
            {/* v0.14.1: a consumable switched off has been used up — offer to discard the spent card. */}
            {depletedId ? (
              <Animated.View style={StyleSheet.absoluteFill} pointerEvents="box-none" entering={FadeIn.duration(170)}>
                <Confirm
                  title="Used it up?"
                  body={`${lootById(catalogIdOf(depletedId))?.name ?? 'That consumable'} is spent. Discard the card, or keep it if you're still carrying another.`}
                  confirmLabel="Discard"
                  onCancel={nextDepleted}
                  onConfirm={() => { onDeleteCards([depletedId]); nextDepleted(); }}
                />
              </Animated.View>
            ) : null}
            {/* v0.32.0: the number a card like Ferocity reads. Range 0..99 because it stands for
                something at the table (Hit Points marked, tokens placed), not a sheet stat with a
                known ceiling, and 0 has to be sayable so the bonus can be cleared. */}
            {numberCardId ? (
              <NumberKeypad
                title={sourceLabelForCardId(numberCardId, file ?? undefined)}
                subtitle="The number this card's modifiers read."
                min={0}
                max={99}
                initial={numberInputFor(file ?? undefined, numberCardId)}
                onSubmit={(n) => { setNumberInput(numberCardId, n); setNumberCardId(null); }}
                onClose={() => setNumberCardId(null)}
              />
            ) : null}
            {/* v0.13.2 (#359): the received-card landing ceremony (confirm → drop from top → tuck into the hand). */}
            {/* v0.25.0: the card asks its question before it can be equipped. Answering stores the
                pick and equips in one step, so the tap the player made is the tap that happens. */}
            {/* Keyed on the card, so the next queued question starts from a clean selection. */}
            {choiceReq ? <CardChoicePrompt key={choiceReq} id={choiceReq} file={file} onCancel={nextChoice} onPick={(options) => {
              const cur = fileRef.current;
              nextChoice();
              if (!cur) return;
              const next = { ...cur, cardChoices: { ...cur.cardChoices, [choiceReq]: options } };
              setFile(next);
              fileRef.current = next;
              saveFileRef.current(next);
              toggleOneFromRefs(choiceReq, 'on');
            }} /> : null}
            {incoming ? <NfcReceiveCeremony card={incoming} destinations={moveTargets} customCategories={customCategories} onCommit={commitReceived} onDismiss={() => setIncoming(null)} /> : null}
            {/* Gold border is a full-bleed overlay ON TOP of the scaled content (stretched to the
                screen edges). The card hand is clipped to the design box, so it stays behind it. */}
            {/* The gold border is a raster authored at 753x1500 (aspect 0.502). Stretched to a
                CONTAINER it smears whenever the container's aspect differs, which on a phone it
                barely does and on a tablet it very much does. Pinning it to the stage box keeps it
                at the aspect it was drawn for. */}
            <View style={[frameRect ?? StyleSheet.absoluteFill, { position: 'absolute' }]} pointerEvents="none">
              <SheetFrame />
            </View>
          </View>
          {/* EXPLICIT bars painted over the status-bar and nav-control strips (#54 D, #59): even if
              some layer below misbehaves, both strips always read as the border's ink navy. The
              bottom one is load-bearing — the stage is unclipped (the dims must overdraw), so the
              gears/card spill below the design box can only be COVERED, not clipped. */}
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: topInset, backgroundColor: Rune.ink }} />
          <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: bottomInset, backgroundColor: Rune.ink }} />
          {/* Unified overlay dim (#239 item 9): one fading scrim shared by the float-menu panels +
              the per-card modifier sheet, so transitions never flashbang the bright sheet. */}
          <SheetDim up={floatKind !== null || cardInfoId !== null || damageOpen || editCardId !== null} />
          {/* damage-threshold keypad (#128): full-screen overlay above everything; on confirm it
              animates out, then bursts the lost hearts via the HeartTrack handle */}
          {damageOpen ? <DamagePanel thresholds={character.damageThresholds} onApply={onApplyDamage} onClose={() => setDamageOpen(false)} /> : null}
          {/* offscreen forge stage: captures the class-feature cards to bitmaps (#104) */}
          {forgeStage}
          {/* v0.35: the same capture, on demand, for a card the printer needs and the forge queue has
              not reached. Renders nothing until a print job asks for one. */}
          <PrintStage ref={printRef} />
          {/* v0.35.1: the print job's progress, its Cancel and its back guard. */}
          {printJob.node}
          {/* entry loader (#150): covers the whole sheet while the cards forge, then fades to reveal */}
          {loaderUp ? <RuneLoader done={sheetReady} onHidden={() => setLoaderUp(false)} caption="Summoning the sheet" /> : null}
          {/* radial-menu interfaces (#161/#164): New Card is live; Rest / Level Up / Settings still
              open a placeholder until their PRs. Above everything, like the damage keypad. */}
          {/* v0.13.2 (#359): the "Add Card" badge (entry 'card') now ALSO offers "Add card from catalog"
              for parity with the float-menu "New Card" flow — the acquire callbacks are always passed;
              only 'gear' opens straight into the catalog. */}
          {floatKind === 'custom' ? (
            <NewCardFlow categoryOverride={newCardCat ?? undefined} customTypes={customCardTypes} initialMode={newCardEntry === 'gear' ? 'catalog' : 'author'} quick={newCardEntry === 'card'} destinations={moveTargets} customCategories={customCategories} onSave={onAddCustomCard} onCancel={() => { setFloatKind(null); setNewCardCat(null); }} onAcquire={onAcquireCard} onAcquireCustom={onAcquireCustom} acquiredIds={acquiredIds} enabledExpansionIds={file?.enabledExpansionIds} experiences={file?.experiences} />
          ) : floatKind === 'rest' ? (
            <RestPanel character={character} moveLimit={restMoveLimit(character.restMoves)} onApply={(next) => { withIntent({ kind: 'rest', label: 'Rested' }); burstResources(characterRef.current, next); setCharacter(next); }} onClose={() => setFloatKind(null)} />
          ) : floatKind === 'modifiers' && file ? (
            <StatePanel file={file} history={historyRef.current} onRewind={rewindTo} onCompact={compactTimeline} onClose={() => setFloatKind(null)} />
          ) : floatKind === 'cards' && file ? (
            <CardManagementPanel
              trash={trashList}
              onRestoreCard={onRestoreCard}
              onNotice={pushNotice}
              isDruid={hasBeastform(file)}
              hasCompanion={hasCompanion(file)}
              hasMartialForm={hasMartialForm(file)}
              hidden={hidden}
              order={file.categoryOrder}
              customCategories={customCategories}
              customTypes={customCardTypes}
              onToggle={onToggleCategory}
              onCreateCategory={onCreateCategory}
              onUpdateCategory={onUpdateCategory}
              onDeleteCategory={onDeleteCategory}
              onReorder={onReorderCategories}
              onReorderCards={onReorderCards}
              onDeleteCards={onDeleteCards}
              onAddCardInCategory={onAddCardInCategory}
              onAddType={onAddCardType}
              onDeleteType={onDeleteCardType}
              onEditCard={(id) => { setFloatKind(null); setEditCardId(id); }}
              onDuplicate={onDuplicateCards}
              onShare={onSendNfc}
              onFavorite={onFavoriteCards}
              editableIds={editableIds}
              onClose={() => setFloatKind(null)}
            />
          ) : floatKind === 'level' && file ? (
            <LevelUpPanel file={file} defaults={levelData.defaults} domainOptions={levelData.domainOptions} classOptions={levelData.classOptions} companion={companionOf(file)} companionPicks={companionPicksPerLevel(file)} onApply={onApplyLevelUp} onClose={() => setFloatKind(null)} />
          ) : floatKind ? (
            <FloatPlaceholder kind={floatKind} onClose={() => setFloatKind(null)} />
          ) : null}
          {/**
            * Sharing, in FRONT of the panel that raised it (v0.37, owner).
            *
            * This modal used to render inside the stage container, two levels below the full-screen
            * Cards panel, and `zIndex` only ranks SIBLINGS: its 10020 was competing with nothing while
            * the panel's 10000 competed with the container. So picking cards and pressing Share put an
            * unreachable share sheet underneath an opaque interface. Same fix, same reason, as the
            * restore prompt below it.
            */}
          {nfcSend ? <NfcSendModal content={nfcSend.content} label={nfcSend.label} onPdf={() => onPrintCards(nfcSend.ids)} onClose={() => setNfcSend(null)} /> : null}
          {/**
            * Where a restored card goes back (v0.34.8, owner).
            *
            * This prompt used to be nested INSIDE the move sheet's block, so it only rendered while a
            * card move happened to be in progress. Pressing Restore in the trash therefore did nothing
            * at all: no dialog, no card back, no notice, and the entry stayed in the list because the
            * card never came alive. It sits with the panel that raises it now, so it is drawn OVER the
            * full-screen Cards panel rather than behind it.
            */}
          {restoreAsk ? (
            <CardDestination
              title="Where does it go back?"
              cardTitle={restoreAsk.title}
              categories={moveTargets}
              customCategories={customCategories}
              suggested={undefined}
              cancelLabel="Not now"
              onPick={(key) => { const r = restoreAsk; setRestoreAsk(null); doRestore(r.id, key); }}
              onCancel={() => setRestoreAsk(null)}
            />
          ) : null}
          {/* edit a player-authored card (#264 item 5): from the gallery's Edit or the fullscreen pencil.
              From fullscreen the carousel stays mounted+fullscreen behind this editor (#276 item 4). */}
          {editCardId && file ? (
            <EditCardFlow key={editCardId} file={file} cardId={editCardId} customTypes={customCardTypes} onSave={onSaveEditedCard} onDelete={onDeleteEditedCard} onCancel={() => setEditCardId(null)} />
          ) : null}
          {/* per-card modifier view (#175): opened by the focused card's "Modifiers" button */}
          {cardInfoId && file ? (
            <CardModifiersSheet
              cardId={cardInfoId}
              file={file}
              character={character}
              enabled={enabledIds.has(refOf(cardInfoId, file))}
              canEdit={!isWildshapeId(catalogIdOf(cardInfoId))}
              onToggle={onToggleCard}
              onSaveEffects={onEditCardEffects}
              onCollapseGroups={(keys) => setFile((f) => { if (!f) return f; const next = { ...f, collapsedModifierGroups: keys }; saveFileRef.current(next); return next; })}
              onClose={() => setCardInfoId(null)}
            />
          ) : null}
          {/* v0.13.0 item 10: empty-category panel — appears SILENTLY (mute, and SheetDim isn't gated
              on it) instead of the fan/dim/gear ritual when the current deck has no cards. */}
          {emptyPanel === 'root' ? (
            <OverlayShell title="There is nothing here" subtitle="Switch to a category or create the first card?" onClose={() => setEmptyPanel(null)} scroll={false} mute width={312}>
              <RuneButton label="Change category" kind="primary" height={44} onPress={() => setEmptyPanel('cats')} />
              <RuneButton label="Add from Catalogue" kind="ghost" height={44} onPress={() => { setEmptyPanel(null); onAddGear(); }} />
              <RuneButton label="Create Card" kind="ghost" height={44} onPress={() => { setEmptyPanel(null); onAddCard(); }} />
            </OverlayShell>
          ) : emptyPanel === 'cats' ? (
            <OverlayShell title="Change category" subtitle="Only categories that have cards" onClose={() => setEmptyPanel(null)} mute width={312}>
              {ring.map((k) => (
                <RuneButton
                  key={k}
                  label={`${categoryMeta?.[k]?.label ?? categoryLabel(k)}  ·  ${carouselDecks?.[k]?.length ?? 0}`}
                  kind="ghost"
                  height={44}
                  onPress={() => { setEmptyPanel(null); carouselApiRef.current?.setCategory(k, 'start'); }}
                />
              ))}
            </OverlayShell>
          ) : null}
          {/* leave-to-character-selection confirmation (#297): device back on the bare sheet */}
          {/* Covers the trip back to the character list, so the sheet does not sit there looking
              live while the route changes underneath it (v0.29.1). */}
          {leaving ? (
            <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 100001 }}>
              <LoadingScreen label="Rolling up the sheet" />
            </View>
          ) : null}
          {leaveConfirm ? (
            <LeaveConfirm
              onConfirm={() => {
                setLeaveConfirm(false);
                // v0.29.1: cover the trip back. The roster reads its characters from disk, and on a
                // slow device that is a beat of bright parchment giving way to nothing.
                setLeaving(true);
                requestAnimationFrame(() => { if (router.canGoBack()) router.back(); else router.replace('/'); });
              }}
              onCancel={() => setLeaveConfirm(false)}
            />
          ) : null}
          {/* v0.13.0 SCARS, fully scarred: every Hope slot is dead → the WHOLE sheet loses color until
              a scar card is unequipped. A gray saturation-blend wash (RN New Arch mixBlendMode) truly
              desaturates everything beneath — still fully interactive (pointerEvents none). */}
          {(character.scars ?? 0) >= character.hope.total ? (
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#8A8A8A', mixBlendMode: 'saturation', zIndex: 99999 }} />
          ) : null}
          </OverlayHost>
        </View>
       </FloatMenuProvider>
      </CarouselProvider>
      {/* The moodboard's ground, held over the sheet for a beat as it rebuilds (v0.34.1). */}
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: file?.moodboardColor || MOODBOARD_BG, zIndex: 99999 }, boardCoverStyle]} />
    </AccentProvider>
  );
}

/** Resolves a card id to its choice and title, so the sheet's JSX stays a single line. */
/**
 * Mounts the keyboard scheme inside the carousel provider (v0.26.0). Renders nothing: it exists
 * because the hook needs carousel context and the sheet's own body sits outside the provider.
 */
function KeyboardControl({ overlay }: { overlay: boolean }) {
  useKeyboardControl({ overlay });
  return null;
}

function CardChoicePrompt({ id, file, onPick, onCancel }: { id: string; file: CharacterFile | undefined; onPick: (options: number[]) => void; onCancel: () => void }) {
  const choice = cardChoiceFor(catalogIdOf(id));
  if (!choice) return null;
  return <CardChoiceDialog choice={choice} cardTitle={sourceLabelForCardId(id, file ?? undefined)} onPick={onPick} onCancel={onCancel} />;
}
