import * as ImagePicker from 'expo-image-picker';

import { ownImage } from '@/lib/owned-image';
import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, Text, TextInput, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';

import { AppScreen } from '@/components/app-screen';
import { CardEditor, type CardDraft } from '@/components/card-editor';
import { ChamferBox } from '@/components/chamfer-box';
import { intentFor } from '@/lib/keybinds';
import { ChamferedImage } from './components/chamfered-image';
import { PopupDialog } from '@/components/popup-dialog';
import { RuneButton } from '@/components/rune-button';
import { showToast } from '@/components/toast';
import { type ClassName, classColor, classInfo, isVoidClass } from '@/constants/identity';
import { Body, Rune } from '@/constants/theme';
import { CATALOG, cardById } from '@/data/catalog';
import { type TraitKey } from '@/features/character-sheet/character';
import { type CharacterFile, type CustomCardDef, newCharacterId, toSheetCharacter } from '@/lib/character-file';
import { getCharacter, saveCharacter } from '@/lib/character-store';
import { classExpansion, seedOfficialExpansions } from '@/lib/expansions';
import { contentForCreation, type CreationContent, type Expansion, featureSectionIndexes, isEnabledForCreation, type LibraryCard, subclassFamilyKey } from '@/lib/library';
import { hasStrikeLines } from '@/data/ancestry-trait-regions';
import { VOID_ANCESTRY_FACE } from '@/data/void-ancestries';
import { LibraryForgedCard } from './components/library-forged-card';
import { listExpansions } from '@/lib/library-store';
import { BASE_PICK_ID, ExpansionPicker } from './expansion-picker';
import { playSfx } from '@/lib/sfx';
import { CLASS_CARDS } from './components/class-cards';
import { featurePages, spellcastTraitForSubclass } from '@/data/class-data';
import { ForgedArmorCard, ForgedCard, ForgedLootCard, ForgedTextCard, ForgedWeaponCard } from './components/forged-card';
import { lootById } from '@/data/loot-data';
import { PRIMARY_WEAPONS, SECONDARY_WEAPONS, TIER1_ARMOR, type WeaponKind, weaponById } from '@/data/equipment-data';
import { CLASS_INVENTORY, isConsumableName, itemOptionId, itemTitle } from '@/data/class-inventory-data';
import { itemColor } from '@/data/item-colors';

import { useForgedSnapshots } from './components/forged-snapshots';
import { StraightCarousel, type StraightCarouselHandle, type StraightFace, type StraightItem } from './components/straight-carousel';
import { type DeckKey, type Draft, isCardDeck, isCarouselDeck, nextMixSlot } from './create-types';
import { clearDraft, isResumable, loadDraft, saveDraft } from '@/lib/draft-store';
import { shouldShow } from '@/lib/onboarding-store';

import { DECKS, deckDone, decksFor, EMPTY, MIXED_ANCESTRY_ID, SINGLE_ANCESTRY_ID } from './create-constants';
import { CharacterizeTraitsTab, LevelTab } from './characterize-tabs';
import { carriesThresholds, carryItems, type CarryItem, itemHoldEffects, keptItems, keptLevel, levelForStatBlock } from '@/lib/characterize';
import { addTemplate, loadAdversaries, saveAdversaries } from '@/lib/adversary-library';
import { addMembers, type Party } from '@/lib/party';
import { getParty, saveParty } from '@/lib/party-store';
import { type Combatant } from '@/lib/session';
import { getEncounter, getSession, saveEncounter } from '@/lib/session-store';
import { initialVitals } from '@/lib/dm-vitals';
import { randomCardColor } from '@/components/card-editor';
import { CreateLoader, DeckLoader } from './create-loaders';
import { DeckRail } from './create-rail';
import { DeckTab, SectionDivider, Segmented } from './create-ui';
import { ExperiencesTab } from './experiences-tab';
import { QuickCardFlow } from '@/features/character-sheet/sheet/quick-card-flow';
import type { CardEffect } from '@/lib/modifiers';
import { TraitsTab } from './traits-tab';

// ---------- screen ----------

/**
 * Character creation, forge edition (#102, impeccable craft): a centered column — Details under
 * its divider plaque (name, portrait, full-width add-image), then the Origin divider with five
 * deck tabs, then the STRAIGHT carousel where every choice is made by reading actual cards.
 * Class picks are FORGED cards; deck swaps fade out → load → fade all back in (no travel);
 * selections per deck are remembered, FORGE arms when all five are set.
 */
// v0.10.2 (Feature 3): inline "Skip" cards that end the weapons/armor/inventory carousels. Selecting one
// sets the matching skip flag so the step counts as done with nothing equipped. Module-scope so the
// `items` memo keeps a stable reference.
const SKIP_WEAPONS: StraightItem = { id: 'weapons-skip', label: 'Skip weapons', custom: <ForgedCard title="No weapon" kindLabel="Weapon" body="Skip, start with no weapon equipped." accentDeep={Rune.panel} colorArt="#262A32" multilineTitle /> };
const SKIP_ARMOR: StraightItem = { id: 'armor-skip', label: 'Skip armor', custom: <ForgedCard title="No armor" kindLabel="Armor" body="Skip, start with no armor equipped." accentDeep={Rune.panel} colorArt="#262A32" multilineTitle /> };
/**
 * The "take nothing here" card, one per inventory choice (v0.26.0).
 *
 * Worth spelling out rather than just saying "skip": a player who leaves a choice empty has usually
 * either decided they do not need it or agreed something else with their GM, and both are perfectly
 * ordinary. Saying so stops the option reading like a mistake.
 */
const skipInventoryCard = (choice: 0 | 1): StraightItem => ({
  id: `inventory-skip-${choice}`,
  label: 'No items / Custom',
  custom: (
    <ForgedCard
      title="No items / Custom"
      kindLabel="Item"
      body="Take nothing for this choice, either because you do not need it or because your GM has agreed you carry something of your own instead. You can add your own cards later."
      accentDeep={Rune.panel}
      colorArt="#262A32"
      multilineTitle
    />
  ),
});


// v0.10.3 (B4): a homebrew library card as a creation carousel item — rendered live (no webp) like the
// other forged cards. Stats for weapon/armor are folded into the body.
// `struckIndex` (v0.12.4): strike a section's text (mixed-ancestry crossed-out feature) live in the
// creation carousel — structured ancestries have no webp to overlay, so the cross-out rides the markdown.
const libCardItem = (lc: LibraryCard, struckIndex?: number): StraightItem => {
  /**
   * A PRINTED FACE is ONE image (v0.33.0, corrected v0.33.1).
   *
   * The Hope and Fear ancestries are single bundled bitmaps: there is nothing to lay out and nothing
   * to forge. Handing them over as `custom` made them a live component anyway, and the carousel only
   * mounts a window of slots, so grinding past them rebuilt the element every time the window moved.
   *
   * v0.33.0 gave them `thumb` AND `source`, which made it worse rather than better. Those are meant
   * to be a LOD PAIR of two different files, and the carousel mounts the `source` layer only within
   * two slots of the centre, so every card you passed mounted a SECOND image view onto the very same
   * bundled asset and unmounted it again a moment later. Two views sharing one decoded bitmap, one of
   * them being torn down on a timer, is a blank card waiting to happen, and with a run of these
   * ancestries side by side it happens to several at once, which is what reads as the whole carousel
   * blinking. There is no LOD to have here anyway: both halves were the same picture.
   *
   * So: one persistent image, mounted for as long as the slot is, never swapped. `struckIndex` is
   * deliberately ignored, because a printed face has no text blocks to strike and the carousel draws
   * the mixed-ancestry cross-out over the bitmap itself.
   */
  const face = VOID_ANCESTRY_FACE[lc.id];
  if (face) return { id: lc.id, label: lc.title || 'Card', thumb: face };
  return { id: lc.id, label: lc.title || 'Card', custom: <LibraryForgedCard card={lc} struckIndex={struckIndex} /> };
};

/**
 * A draft is worth persisting/resuming only if SOMETHING was chosen — otherwise resuming would show
 * an empty creator and ask the player to decide about nothing.
 */
function draftHasContent(d: unknown): boolean {
  const x = d as Draft | undefined;
  if (!x) return false;
  return !!x.name?.trim() || DECKS.some((k) => deckDone(k.key, x));
}

/**
 * Height reserved at the bottom of the carousel rail for the SELECT / RANDOM cluster, and the offset
 * the cluster itself sits at. v0.23.0: previously the rail used its full height, so the centred card
 * (the biggest one) grew down into the buttons. Weapons no longer needs its own smaller offset --
 * reserving the band handles the taller filter row for free.
 */
/**
 * v0.27.3: 96 -> 102, and the cluster itself moved from `bottom: 20` to 14.
 *
 * The SELECT / RANDOM cluster is an absolute child, so it ignores AppScreen's padding and its top
 * edge landed a few dp INSIDE the rail, painting over the bottom of the golden gear that rides the
 * rail's edge. 14 is the floor for the cluster: AppScreen reserves 14 at the bottom to clear the
 * frame's gold line. Between the two the gear clears the buttons by about 8dp.
 *
 * Known cost, since the last release bought headroom above the card: the rail is 6dp shorter, and the
 * card rests at a FRACTION of the rail, so roughly 2dp of that headroom goes back.
 */
const CONTROLS_BAND = 102;

/**
 * Reverse the mixed-ancestry pair (v0.29.0).
 *
 * Two arrows passing each other, which is the plainest way to draw "these two change places". It is
 * disabled, and visibly so, until BOTH ancestries are chosen: with one or none there is no pair to
 * reverse, and the control would be a promise the screen cannot keep.
 */
function MixReverseButton({ mixed, onReverse }: { mixed: { first: string | null; second: string | null }; onReverse: () => void }) {
  const ready = !!mixed.first && !!mixed.second;
  const tint = ready ? Rune.goldBright : 'rgba(147,142,136,0.45)';
  return (
    <Pressable
      onPress={ready ? onReverse : undefined}
      disabled={!ready}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ disabled: !ready }}
      accessibilityLabel="Reverse the ancestry order"
      accessibilityHint={ready ? 'Swaps which ancestry gives its first feature and which gives its second' : 'Pick both ancestries first'}>
      {({ pressed }) => (
        <ChamferBox
          chamfer={6}
          fill={pressed ? 'rgba(218,162,73,0.22)' : 'rgba(20,24,31,0.7)'}
          stroke={ready ? Rune.goldEdge : 'rgba(147,142,136,0.3)'}
          strokeWidth={1}
          style={{ width: 34, height: 30, alignItems: 'center', justifyContent: 'center', opacity: ready ? 1 : 0.55 }}>
          <Svg width={18} height={18} viewBox="0 0 24 24">
            {/* upper arrow pointing right, lower arrow pointing left */}
            <Polyline points="4,9 20,9" fill="none" stroke={tint} strokeWidth={2} strokeLinecap="round" />
            <Polyline points="16,5 20,9 16,13" fill="none" stroke={tint} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            <Polyline points="20,17 4,17" fill="none" stroke={tint} strokeWidth={2} strokeLinecap="round" />
            <Polyline points="8,13 4,17 8,21" fill="none" stroke={tint} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </ChamferBox>
      )}
    </Pressable>
  );
}

export function CreateScreen() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  // v0.22.0: the draft used to live ONLY here, so the back chevron, hardware back, a phone call or a
  // low-memory kill destroyed ten steps of work in silence. It is now persisted and guarded.
  const nameRef = useRef<TextInput>(null);
  const draftRef = useRef<Draft>(EMPTY);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [resumeOffer, setResumeOffer] = useState<{ draft: Draft; deck?: string; savedAt: string } | null>(null);
  const [resumeChecked, setResumeChecked] = useState(false);
  const [deck, setDeck] = useState<DeckKey>('class');
  // v0.12.2: per-character EXPANSION PICKER — which content packs this hero can draw from. `picked` holds
  // the chosen expansion ids plus the implicit BASE_PICK_ID; it gates every class/origin/domain list below.
  // v0.13.0 item 6: the picker now lives on the CHARACTER SELECT screen, which passes the picks as the
  // `exp` route param (may be '' = base-only). The in-screen picker remains only as the fallback for
  // entry paths that skip the roster (deep links / older routes).
  /**
   * CHARACTERIZE (v0.36, owner): which encounter entry this creation is replacing.
   *
   * Ids rather than a payload, deliberately. The stat block is read back out of the encounter, so
   * nothing large travels through a URL, a reload cannot lose it, and there is exactly one copy of
   * the truth right up until Forge writes the character.
   */
  const params = useLocalSearchParams<{ exp?: string; encId?: string; cid?: string; side?: string }>();
  const characterizing = !!params.encId && !!params.cid;
  const [statBlock, setStatBlock] = useState<Combatant | null>(null);
  const [expansions, setExpansions] = useState<Expansion[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set([BASE_PICK_ID, ...(typeof params.exp === 'string' ? params.exp.split(',').filter(Boolean) : [])]),
  );
  const [pickerOpen, setPickerOpen] = useState(typeof params.exp !== 'string');
  useEffect(() => {
    let live = true;
    // seed the bundled official expansions (The Void) so they show in the picker, then list all installed.
    seedOfficialExpansions().catch(() => {}).then(() => listExpansions()).then((all) => { if (live) setExpansions(all); });
    return () => { live = false; };
  }, []);
  // v0.10.3 (B4): homebrew content offered in the matching decks — now intersected with the PICKED set, so
  // only content from expansions this hero opted into shows. An official pack contributes nothing here (its
  // cards live in the catalog, gated by the same `picked`); custom expansions contribute their cards.
  const libContent = useMemo<CreationContent | null>(
    () => (expansions ? contentForCreation(expansions.filter((e) => picked.has(e.id))) : null),
    [expansions, picked],
  );
  const [pendingDeck, setPendingDeck] = useState<DeckKey | null>(null);
  /** The ally prompt, raised after a characterized ALLY is forged (never for an adversary). */
  const [joinParty, setJoinParty] = useState<{ charId: string; name: string; party: Party } | null>(null);
  const [forging, setForging] = useState(false);
  const [unlockPulse, setUnlockPulse] = useState(0);
  const hadClass = useRef(false);
  const deckIndexes = useRef<Partial<Record<DeckKey, number>>>({});
  const fade = useSharedValue(1);
  const set = useCallback((p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p })), []);

  /**
   * Read the stat block, and seed everything it already knows.
   *
   * Name and portrait come across because retyping them is work the DM has already done, and the
   * level arrives worked out from the tier and difficulty so the common case needs no thought.
   * Traits come across only when there are some, which is the case when the thing being
   * characterized was characterized before; a plain stat block has none and everything starts at 0.
   */
  useEffect(() => {
    if (!characterizing) return;
    let live = true;
    void getEncounter(params.encId!).then((enc) => {
      if (!enc || !live) return;
      const npc = enc.allies.flatMap((a) => (a.kind === 'npc' ? [a.combatant] : []));
      const c = [...enc.adversaries, ...npc].find((x) => x.id === params.cid);
      if (!c) return;
      setStatBlock(c);
      // Open ON the review step: what the stat block hands over should be settled first.
      setDeck('carry');
      setCenterIdx(0);
      setDraft((d) => ({
        ...d,
        name: d.name || c.name,
        portraitUri: d.portraitUri ?? c.portraitUri ?? null,
        level: d.level ?? levelForStatBlock(c.tier, c.difficulty),
        characterize: { encounterId: params.encId!, combatantId: params.cid!, side: params.side === 'ally' ? 'ally' : 'adversary' },
      }));
    });
    return () => { live = false; };
  }, [characterizing, params.encId, params.cid, params.side]);

  /** Everything the stat block hands over, and what the DM has greyed out of it. */
  const carry = useMemo<CarryItem[]>(() => (statBlock ? carryItems(statBlock) : []), [statBlock]);
  const carryOff = useMemo(() => new Set(draft.carryDisabled ?? []), [draft.carryDisabled]);
  /** One colour per carried card, picked once, so the review carousel and the forged card match. */
  const carryColors = useRef<Record<string, string>>({});
  const carryColor = useCallback((id: string) => (carryColors.current[id] ??= randomCardColor()), []);
  /** The traits Reset restores: whatever the stat block carried, or nothing. */
  const inheritedTraits = useMemo(() => ({ ...(statBlock as unknown as { traits?: Partial<Record<TraitKey, number>> } | null)?.traits }), [statBlock]);
  /** Transformations follow the APP's expansion switch, not this character's picks (owner). */
  const transformationsOn = !!expansions?.some((e) => e.id === 'void' && isEnabledForCreation(e));
  const deckList = useMemo(() => decksFor(characterizing, transformationsOn), [characterizing, transformationsOn]);

  useEffect(() => {
    if (draft.className && !hadClass.current) {
      hadClass.current = true;
      setUnlockPulse((n) => n + 1);
    }
  }, [draft.className]);

  // Deck switch (#108: cards must LOAD then fade in, never pop): fade the old deck out → mount the
  // new deck while still INVISIBLE (the loader keeps pulsing) → hold a real paint grace so the new
  // thumbs actually decode at opacity 0 → only THEN hide the loader and fade the ready cards in
  // slowly. The carousel stays mounted (deckVisible true) so the key-change remount is hidden under
  // the fade, not flashed.
  const finishFade = useCallback(
    (next: DeckKey) => {
      setDeck(next);
      setCenterIdx(deckIndexes.current[next] ?? 0);
      // a real grace (#150): the freshly mounted thumbs/cards decode at opacity 0 behind the loader
      // before we reveal them — long enough that nothing is seen assembling.
      setTimeout(() => {
        setPendingDeck(null); // cards are painted → drop the loader
        fade.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) });
      }, 260);
    },
    [fade],
  );
  const switchDeck = useCallback(
    (next: DeckKey) => {
      if (next === deck || pendingDeck) return;
      setPendingDeck(next);
      const apply = () => finishFade(next);
      // fade EVERYTHING (cards + the SELECT controls) out before the swap so no button morphs (#150)
      //
      // v0.27.3: run `apply` whether or not the fade FINISHED. `finished` is false whenever the
      // animation is interrupted, and on that path nothing cleared `pendingDeck` -- so `switchDeck`
      // returned early for every later tap, the loader stayed mounted, and `fade` never came back to
      // 1. Since `fade` drives both the carousel and the SELECT/RANDOM cluster, one interrupted
      // 140ms fade left the creator looking half-dead with no way back. There is nothing to skip on
      // an interrupt: the swap still has to happen.
      fade.value = withTiming(0, { duration: 140, easing: Easing.in(Easing.quad) }, () => {
        runOnJS(apply)();
      });
    },
    [deck, pendingDeck, fade, finishFade],
  );

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  /**
   * v0.27.3: hoisted out of the carousel's props. As an inline arrow it was a new function on every
   * render of this screen, which made the carousel's own `onCenter` new too, and reanimated builds a
   * derived value's dependencies from its worklet closure -- so the mapper that publishes the centred
   * index was torn down and restarted on every single render, and each restart forces a re-sort of
   * every mapper in the app on the next UI frame.
   */
  const onCenterIdx = useCallback(
    (i: number) => {
      deckIndexes.current[deck] = i;
      setCenterIdx(i);
    },
    [deck],
  );

  // v0.12.2: the class list the creator offers, gated by the PICKED expansions (base classes always; a
  // Void class only when 'void' is picked). Replaces the old base-only CREATION_CLASS_CARDS module const.
  const creationClassCards = useMemo(
    () => CLASS_CARDS.filter((c) => { const e = classExpansion(c.key); return !e || picked.has(e); }),
    [picked],
  );

  // Pre-render every forged card to a bitmap pair on device (#104 perf): the live components
  // double as the loading state and swap to image cards as each capture lands. Class-card jobs follow the
  // picked set (base-only creation never forges a Void class — no extra work until The Void is chosen).
  /**
   * v0.27.3: forge only the deck that is ON SCREEN.
   *
   * This used to queue every class card, every feature page and every tier-1 weapon and armour at
   * once -- about ninety captures -- regardless of which step the player was looking at. Since
   * v0.24.0 the cache key carries the app version, so a release re-runs the whole queue, and each
   * capture is two `captureRef` calls on the UI thread. Tapping Ancestry therefore queued the deck
   * switch behind sixty unrelated snapshots, which is the long wait.
   *
   * `settled` in useForgedSnapshots is a ref keyed by job, so coming back to a deck re-captures
   * nothing, and a deck never opened costs nothing. Equipment follows `picked` the way the carousel
   * items already do, so an expansion the player did not choose is not forged either.
   */
  const snapshotJobs = useMemo(
    () => [
      ...(deck !== 'class' ? [] : creationClassCards.map((c) => ({
        key: `class-${c.key}`,
        // deck-wide mark (#110): the class card is page 1 of (1 class + feature pages)
        node: <ForgedCard title={c.title} kindLabel="Class" body={c.body} accentDeep={classColor(c.key).deep} Banner={c.Banner} pageMark={`1/${1 + featurePages(c.key).length}`} classKey={c.key} />,
        // Void banners are expo-image rasters (async decode) — settle before capture or the art zone forges blank.
        raster: isVoidClass(c.key),
      }))),
      ...(deck !== 'class' ? [] : creationClassCards.flatMap((c) => {
        const total = 1 + featurePages(c.key).length;
        return featurePages(c.key).map((p) => ({
          key: `feat-${c.key}-${p.pageIndex}`,
          raster: isVoidClass(c.key),
          node: (
            <ForgedTextCard
              title={c.title}
              kindLabel="Features"
              pageMark={`${p.pageIndex + 2}/${total}`}
              sections={p.sections}
              accentDeep={classColor(c.key).deep}
              Banner={c.Banner}
              classKey={c.key}
            />
          ),
        }));
      })),
      // weapon + armor cards (#121) — vector (no raster settle), forged for LOD perf in the carousel
      ...(deck !== 'weapons'
        ? []
        : [...PRIMARY_WEAPONS, ...SECONDARY_WEAPONS]
            .filter((w) => !w.expansion || picked.has(w.expansion))
            .map((w) => ({ key: w.id, node: <ForgedWeaponCard weapon={w} /> }))),
      ...(deck !== 'armor'
        ? []
        : TIER1_ARMOR.filter((a) => !a.expansion || picked.has(a.expansion)).map((a) => ({ key: a.id, node: <ForgedArmorCard armor={a} /> }))),
    ],
    [deck, picked, creationClassCards],
  );
  const { sources, stage } = useForgedSnapshots(snapshotJobs);

  // Entry loader (#110): hold the veil until the first class card is painted (forged on device,
  // live on web), then a hard fallback so it can never hang.
  const [loaderDone, setLoaderDone] = useState(false);
  const [loaderUp, setLoaderUp] = useState(true);
  const firstClassKey = `class-${creationClassCards[0].key}`;
  useEffect(() => {
    if (loaderDone) return;
    // `deck !== 'class'` (v0.27.3): now that the forge is scoped to the deck on screen, a resumed
    // draft that opens on some other deck never forges the first class card, so waiting on it would
    // hold the veil for the whole 2200ms fallback.
    if (Platform.OS === 'web' || deck !== 'class' || sources[firstClassKey]) {
      const t = setTimeout(() => setLoaderDone(true), 260);
      return () => clearTimeout(t);
    }
  }, [sources, loaderDone, firstClassKey, deck]);
  useEffect(() => {
    const t = setTimeout(() => setLoaderDone(true), 2200);
    return () => clearTimeout(t);
  }, []);
  // Bulletproof unmount: drop the loader 380ms after it's flagged done even if the reanimated fade
  // completion callback never fires (web headless can strand exit anims) — it can never get stuck.
  useEffect(() => {
    if (!loaderDone) return;
    const t = setTimeout(() => setLoaderUp(false), 380);
    return () => clearTimeout(t);
  }, [loaderDone]);

  /**
   * The body is INVISIBLE until the veil lifts, and is revealed BY the veil lifting (v0.29.0).
   *
   * The loader only ever COVERED the body, it never hid it, so "loader first" was a property of paint
   * order rather than something this screen guaranteed. In a browser that is a race with nothing
   * holding it: nothing is forged on web, so the wait collapses to a plain timer, while the body
   * underneath is finished and fully drawn the whole time. Anything that covers the screen while that
   * clock runs, and the creation tour is pushed one tick after mount and does exactly that, spends the
   * loader out of sight and then uncovers a body the loader was supposed to be hiding. What the owner
   * saw was the loader flashing on over a creator that was already there.
   *
   * Cross-fading the body in on the same flag that fades the veil out makes the order structural
   * rather than incidental: there is nothing underneath to see early.
   */
  const entry = useSharedValue(0);
  useEffect(() => {
    if (loaderDone) entry.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) });
  }, [loaderDone, entry]);
  const entryStyle = useAnimatedStyle(() => ({ opacity: entry.value }));

  const [centerIdx, setCenterIdx] = useState(0);
  const [editingExperience, setEditingExperience] = useState<number | null>(null);
  /** The draft handed to the full editor when the player asks for Advanced, or null while quick. */
  const [expAdvanced, setExpAdvanced] = useState<CardDraft | null>(null);
  // Weapons deck UI (#121): which kind of primary to browse, and whether we're picking the primary
  // or the (optional, 1H-only) secondary.
  const [weaponKind, setWeaponKind] = useState<WeaponKind>('physical');
  const [weaponSlot, setWeaponSlot] = useState<'primary' | 'secondary'>('primary');
  // v0.26.0: the class guides offer TWO separate choices (a potion, then a keepsake), and the step
  // showed all four cards at once as "pick any two". That let a player take two potions and no
  // keepsake, which is not a choice the book offers, and it never said the two picks were separate
  // questions. Presented like primary and secondary weapons now: one carousel per choice.
  const [invChoice, setInvChoice] = useState<0 | 1>(0);
  const primaryWeapon = draft.weaponPrimaryId ? weaponById(draft.weaponPrimaryId) : null;
  const secondaryAllowed = primaryWeapon?.burden === 'One-Handed';
  // a 2H primary (or no primary) can't have a secondary — snap the toggle back to primary
  useEffect(() => {
    if (weaponSlot === 'secondary' && !secondaryAllowed) setWeaponSlot('primary');
  }, [weaponSlot, secondaryAllowed]);
  const carouselRef = useRef<StraightCarouselHandle>(null);
  // v0.10.6 (Feature 3): when BOTH mixed-ancestry slots are full, Random alternates which one it
  // re-rolls (first, then second, then first…). Empty slots always fill first, so a deselect just works.
  const mixRollNext = useRef<'first' | 'second'>('first');

  // Device back must CLOSE an open overlay before it navigates (#108: backing out of a fullscreen
  // card used to leave a leaked veil that froze the next screen). Priority: editor → features →
  // focused card → default back.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (editingExperience != null) {
          setEditingExperience(null);
          return true;
        }
        if (carouselRef.current?.closeIfFullscreen()) return true;
        // v0.22.0: hardware back used to pop the route and destroy the draft silently.
        if (draftHasContent(draftRef.current)) {
          setLeaveConfirm(true);
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, [editingExperience]),
  );

  /**
   * A forged equipment card item: the bitmap pair once captured, the live card meanwhile (#121).
   *
   * v0.27.0: the returned object is CACHED, so a card that has not changed keeps the same identity.
   *
   * Cards forge one at a time, and each one finishing changes `sources`, which rebuilt the whole
   * deck's item list. Every item was a brand new object, so every memoized carousel slot saw new
   * props and re-rendered, and a deck of a hundred domain cards re-rendered a hundred times over the
   * course of the forge. That is the stutter: it is at its worst on a fresh install, which is the
   * first time anyone makes a character. Now only the card that actually gained a bitmap changes.
   */
  const itemCache = useRef(new Map<string, StraightItem>());
  /**
   * Keep one object per card, so a card that has not changed keeps its identity across rebuilds.
   *
   * The carousel's slots are memoized, which does nothing when every rebuild hands them a freshly
   * built object. The cache key has to name everything the card's appearance depends on, so a card
   * that DID change still gets a new object.
   */
  const keep = useCallback((cacheKey: string, make: () => StraightItem): StraightItem => {
    const hit = itemCache.current.get(cacheKey);
    if (hit) return hit;
    const made = make();
    itemCache.current.set(cacheKey, made);
    return made;
  }, []);
  /**
   * A LIBRARY card item, cached by everything that changes how it looks.
   *
   * v0.27.2: these were allocated fresh on every rebuild, which is every time any card finishes
   * forging, so a homebrew-heavy deck re-rendered all of its slots throughout the forge even though
   * the v0.27.0 cache was already sparing the catalog ones.
   */
  const keepLib = useCallback(
    (lc: LibraryCard, struckIndex?: number) => keep(`lib|${lc.id}|${lc.title}|${(lc.sections ?? []).length}|${struckIndex ?? ''}`, () => libCardItem(lc, struckIndex)),
    [keep],
  );
  const forgedItem = useCallback(
    (key: string, label: string, live: ReactNode): StraightItem => {
      const pre = sources[key];
      const cacheKey = `${key}|${pre?.full.uri ?? ''}`;
      const hit = itemCache.current.get(cacheKey);
      if (hit) return hit;
      const made: StraightItem = pre ? { id: key, label, thumb: pre.thumb, source: pre.full } : { id: key, label, custom: live };
      // A card only ever moves from live to forged, so an entry is superseded rather than stale; the
      // map is bounded by the number of cards on offer either way.
      itemCache.current.set(cacheKey, made);
      return made;
    },
    [sources],
  );

  const items: StraightItem[] = useMemo(() => {
    if (deck === 'carry') {
      // A greyed card is DIMMED rather than outlined: an outline is what selection looks like
      // everywhere else in the creator, and here selecting a card is how you throw it away.
      return carry.map((it) =>
        keep(`carry|${it.id}|${carryOff.has(it.id) ? 'off' : 'on'}`, () => ({
          id: it.id,
          label: it.title,
          custom: (
            <View style={{ opacity: carryOff.has(it.id) ? 0.3 : 1 }}>
              <ForgedCard title={it.title} kindLabel={it.cardLabel} body={it.text} accentDeep={Rune.panel} colorArt={carryColor(it.id)} multilineTitle />
            </View>
          ),
        })),
      );
    }
    if (deck === 'weapons') {
      // v0.19.2 item 5: HF (Hope and Fear) starting weapons only when that pack was picked for this hero.
      const base = weaponSlot === 'secondary' ? SECONDARY_WEAPONS : PRIMARY_WEAPONS.filter((w) => w.kind === weaponKind);
      const list = base.filter((w) => !w.expansion || picked.has(w.expansion));
      const cards = list.map((w) => forgedItem(w.id, w.name, <ForgedWeaponCard weapon={w} />));
      // Skip only on the primary slot — a secondary is already optional (v0.10.2).
      return weaponSlot === 'primary' ? [...cards, SKIP_WEAPONS] : cards;
    }
    if (deck === 'armor') {
      return [...TIER1_ARMOR.filter((a) => !a.expansion || picked.has(a.expansion)).map((a) => forgedItem(a.id, a.name, <ForgedArmorCard armor={a} />)), ...(libContent?.armor ?? []).map((lc) => keepLib(lc)), SKIP_ARMOR];
    }
    if (deck === 'inventory') {
      // Creation inventory shows ONLY the player's per-class CHOICES (#136). The default kit
      // (torch/rope/supplies) and gold are NOT shown here — they belong to the sheet. Custom
      // in-creation items were removed; homebrew items come from Library expansions.
      //
      // v0.26.0: ONE choice at a time. `invChoice` selects which of the guide's two groups is on
      // screen, so choice 1 offers the first pair and choice 2 the second.
      const cinv = draft.className ? CLASS_INVENTORY[draft.className] : null;
      const cap = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
      const group = cinv?.choices[invChoice] ?? [];
      // v0.27.0: an option that exists in the ARCHIVE is offered as its archive card, so the player
      // is choosing the printed potion ("Clear 1d4 HP") rather than a card that only names itself.
      const optionCards: StraightItem[] = group.map((name) => {
        const id = itemOptionId(name);
        const archive = lootById(id);
        return keep(`inv|${id}`, () => ({
          id,
          label: name,
          custom: archive ? <ForgedLootCard loot={archive} /> : <ForgedCard title={itemTitle(name)} kindLabel={isConsumableName(name) ? 'Consumable' : 'Item'} body={`${cap(name)}.`} accentDeep={Rune.panel} colorArt={itemColor(name)} multilineTitle />,
        }));
      });
      // Homebrew inventory rides the first choice, so it is offered once rather than twice.
      const lib = invChoice === 0 ? (libContent?.inventory ?? []).map((c) => keepLib(c)) : [];
      return [...optionCards, ...lib, keep(`invskip|${invChoice}`, () => skipInventoryCard(invChoice))];
    }
    if (!isCardDeck(deck)) return [];
    switch (deck) {
      case 'class':
        // Each class card is a FLIP-DECK (#110): face 0 = the class card, then one face per feature
        // page. Tapping the focused card flips through them in 3D — no separate features button.
        return creationClassCards.map((c) => {
          const total = 1 + featurePages(c.key).length;
          const classPre = sources[`class-${c.key}`];
          // Every face this card would show, named by whether it has forged yet. Fifteen classes with
          // several feature pages each rebuilt on every single forge before this.
          const forgeKey = [classPre?.full.uri ?? '', ...featurePages(c.key).map((p) => sources[`feat-${c.key}-${p.pageIndex}`]?.full.uri ?? '')].join(',');
          return keep(`class|${c.key}|${forgeKey}`, () => {
            const classFace: StraightFace = classPre
              ? { thumb: classPre.thumb, source: classPre.full }
              : { custom: <ForgedCard title={c.title} kindLabel="Class" body={c.body} accentDeep={classColor(c.key).deep} Banner={c.Banner} pageMark={`1/${total}`} classKey={c.key} /> };
            const featureFaces: StraightFace[] = featurePages(c.key).map((p) => {
              const fpre = sources[`feat-${c.key}-${p.pageIndex}`];
              return fpre
                ? { thumb: fpre.thumb, source: fpre.full }
                : {
                    custom: (
                      <ForgedTextCard
                        title={c.title}
                        kindLabel="Features"
                        pageMark={`${p.pageIndex + 2}/${total}`}
                        sections={p.sections}
                        accentDeep={classColor(c.key).deep}
                        Banner={c.Banner}
                        classKey={c.key}
                      />
                    ),
                  };
            });
            const faces = [classFace, ...featureFaces];
            return { id: `class-${c.key}`, label: c.title, thumb: classFace.thumb, source: classFace.source, custom: classFace.custom, faces };
          });
        });
      case 'subclass':
        return [
          ...CATALOG.filter((c) => c.kind === 'subclass' && c.className === draft.className && c.tier === 1 && (!c.expansion || picked.has(c.expansion))).map((c) => keep(`cat|${c.id}`, () => ({ id: c.id, label: c.label, thumb: c.thumb, source: c.source }))),
          ...(libContent?.subclasses ?? []).filter((c) => (!c.tier || c.tier === 1) && (!c.className || c.className === draft.className)).map((lc) => keepLib(lc)),
        ];
      case 'ancestry': {
        const base = CATALOG.filter((c) => c.kind === 'ancestry' && (!c.expansion || picked.has(c.expansion))).map((c) => keep(`cat|${c.id}`, () => ({ id: c.id, label: c.label, thumb: c.thumb, source: c.source })));
        // #265: the last card flips the mode — "Mixed Ancestry" enters mixed mode, "Single Ancestry" leaves it.
        const toggle: StraightItem = draft.mixedAncestry
          ? { id: SINGLE_ANCESTRY_ID, label: 'Single Ancestry', custom: <ForgedCard title="Single Ancestry" kindLabel="Ancestry" body="Go back to choosing a single ancestry." accentDeep={Rune.panel} colorArt="#2A3340" multilineTitle /> }
          : { id: MIXED_ANCESTRY_ID, label: 'Mixed Ancestry', custom: <ForgedCard title="Mixed Ancestry" kindLabel="Ancestry" body="Combine two ancestries: take the first trait of one and the second trait of the other. Pick two, order decides which trait you keep." accentDeep={Rune.panel} colorArt="#3A2A4A" multilineTitle /> };
        // mixed-ancestry cross-out for STRUCTURED ancestries: first-picked keeps Feature 1 (strike
        // Feature 2), second-picked keeps Feature 2 (strike Feature 1) — mirrors ancestryCrossOuts for
        // the image cards. v0.13.0: the struck FEATURE resolves to its actual section index (features
        // can sit anywhere among the sections) via featureSectionIndexes.
        const mix = draft.mixedAncestry;
        // v0.25.0: skip printed-face ancestries — StraightCarousel already draws TraitCrossOut's
        // measured lines over those, and striking the text as well would cross the feature twice.
        const struckIdx = (lc: LibraryCard): number | undefined =>
          hasStrikeLines(lc.id) ? undefined : mix?.first === lc.id ? featureSectionIndexes(lc)[1] : mix?.second === lc.id ? featureSectionIndexes(lc)[0] : undefined;
        return [...base, ...(libContent?.ancestries ?? []).map((lc) => keepLib(lc, struckIdx(lc))), toggle];
      }
      case 'transformation':
        return CATALOG.filter((c) => c.kind === 'transformation').map((c) => keep(`cat|${c.id}`, () => ({ id: c.id, label: c.label, thumb: c.thumb, source: c.source })));
      case 'community':
        return [...CATALOG.filter((c) => c.kind === 'community' && (!c.expansion || picked.has(c.expansion))).map((c) => keep(`cat|${c.id}`, () => ({ id: c.id, label: c.label, thumb: c.thumb, source: c.source }))), ...(libContent?.communities ?? []).map((lc) => keepLib(lc))];
      case 'domains': {
        if (!draft.className) return [];
        const pair = classInfo(draft.className).domains;
        return [
          ...pair.flatMap((d) => CATALOG.filter((c) => c.kind === 'domain' && c.domain === d && c.level === 1 && (!c.expansion || picked.has(c.expansion)))).map((c) => keep(`cat|${c.id}`, () => ({ id: c.id, label: c.label, thumb: c.thumb, source: c.source }))),
          ...(libContent?.domains ?? []).map((lc) => keepLib(lc)),
        ];
      }
    }
  }, [deck, draft.className, draft.mixedAncestry, sources, weaponKind, weaponSlot, invChoice, forgedItem, keep, keepLib, libContent, picked, creationClassCards, carry, carryOff, carryColor]);

  const selectedIds = useMemo(() => {
    // The carry step never outlines anything: greying is its whole vocabulary (see `items`).
    if (deck === 'carry') return [];
    if (deck === 'weapons') {
      if (weaponSlot === 'primary' && draft.weaponsSkipped) return ['weapons-skip'];
      const id = weaponSlot === 'secondary' ? draft.weaponSecondaryId : draft.weaponPrimaryId;
      return id ? [id] : [];
    }
    if (deck === 'armor') return draft.armorSkipped ? ['armor-skip'] : draft.armorId ? [draft.armorId] : [];
    if (deck === 'inventory') {
      // Only THIS choice's answer is highlighted, since only this choice is on screen.
      const skipped = (draft.inventorySkips ?? []).includes(invChoice) || (draft.inventorySkipped ?? false);
      return skipped ? [`inventory-skip-${invChoice}`] : [...draft.inventoryItemIds, ...draft.inventoryLibIds];
    }
    if (!isCardDeck(deck)) return [];
    switch (deck) {
      case 'class':
        return draft.className ? [`class-${draft.className}`] : [];
      case 'subclass':
        return draft.subclassCardId ? [draft.subclassCardId] : [];
      case 'ancestry':
        return draft.mixedAncestry
          ? [draft.mixedAncestry.first, draft.mixedAncestry.second].filter((x): x is string => !!x)
          : draft.ancestryCardId ? [draft.ancestryCardId] : [];
      case 'transformation':
        return draft.transformationCardId ? [draft.transformationCardId] : [];
      case 'community':
        return draft.communityCardId ? [draft.communityCardId] : [];
      case 'domains':
        return draft.domainCardIds;
    }
  }, [deck, draft, weaponSlot, invChoice]);

  // #265: live cross-out while picking a mix — the 1st pick keeps trait 1 (cross its trait 2), the 2nd
  // keeps trait 2 (cross its trait 1).
  const ancestryCrossOuts = useMemo<Record<string, 1 | 2>>(() => {
    const m = draft.mixedAncestry;
    if (!m) return {};
    const o: Record<string, 1 | 2> = {};
    if (m.first) o[m.first] = 2;
    if (m.second) o[m.second] = 1;
    return o;
  }, [draft.mixedAncestry]);
  // Fade the ancestry carousel when toggling single↔mixed so the swap never flickers (#265): dip to 0,
  // (the items + selection update under the dip), then rise back — the same hide-until-ready idea as the
  // sheet's ghost-free switch, at the container level.
  const mixedActive = !!draft.mixedAncestry;
  const modeFade = useSharedValue(1);
  const modeFirst = useRef(true);
  useEffect(() => {
    if (modeFirst.current) { modeFirst.current = false; return; }
    modeFade.value = withSequence(withTiming(0, { duration: 150, easing: Easing.in(Easing.cubic) }), withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) }));
  }, [mixedActive, modeFade]);
  const modeFadeStyle = useAnimatedStyle(() => ({ opacity: modeFade.value }));

  /** Answering a step un-skips it: a Skip is the DM saying nothing, and this is them saying something. */
  const unskip = useCallback((k: DeckKey) => {
    setDraft((d) => (d.skipped?.includes(k) ? { ...d, skipped: d.skipped.filter((x) => x !== k) } : d));
  }, []);

  const onToggle = useCallback(
    (id: string) => {
      unskip(deck);
      if (deck === 'carry') {
        const off = new Set(draft.carryDisabled ?? []);
        if (off.has(id)) off.delete(id); else off.add(id);
        set({ carryDisabled: [...off] });
        return;
      }
      if (deck === 'weapons') {
        if (id === 'weapons-skip') { set({ weaponsSkipped: !draft.weaponsSkipped, weaponPrimaryId: null, weaponSecondaryId: null }); return; }
        if (weaponSlot === 'secondary') {
          if (!secondaryAllowed) return; // only a 1H primary may carry a secondary
          set({ weaponSecondaryId: draft.weaponSecondaryId === id ? null : id });
        } else {
          if (draft.weaponPrimaryId === id) {
            set({ weaponPrimaryId: null, weaponSecondaryId: null });
          } else {
            const w = weaponById(id);
            // a Two-Handed primary leaves no hand for a secondary → clear it. Selecting a weapon clears skip.
            set({ weaponPrimaryId: id, weaponsSkipped: false, ...(w?.burden === 'Two-Handed' ? { weaponSecondaryId: null } : {}) });
          }
        }
        return;
      }
      if (deck === 'armor') {
        if (id === 'armor-skip') { set({ armorSkipped: !draft.armorSkipped, armorId: null }); return; }
        // v0.36 (owner): armor SETS damage thresholds, and a characterized adversary is holding the
        // ones its stat block had. Say so rather than letting the number quietly move.
        if (draft.armorId !== id && carriesThresholds(carry, carryOff)) {
          showToast('This one carries its own damage thresholds. Armor sets them instead, and with the level bonuses on top they will likely come out higher.');
        }
        set({ armorId: draft.armorId === id ? null : id, armorSkipped: false });
        return;
      }
      if (deck === 'inventory') {
        // v0.26.0: taking nothing answers THIS choice, and clears whatever it had chosen.
        if (id.startsWith('inventory-skip')) {
          const skips = new Set(draft.inventorySkips ?? []);
          const group = CLASS_INVENTORY[draft.className!]?.choices[invChoice] ?? [];
          const ids = new Set(group.map(itemOptionId));
          if (skips.has(invChoice)) skips.delete(invChoice);
          else skips.add(invChoice);
          set({ inventorySkips: [...skips], inventorySkipped: false, inventoryItemIds: draft.inventoryItemIds.filter((x) => !ids.has(x)) });
          return;
        }
        // v0.10.3: a homebrew inventory card toggles into the loose picks (no 2-item cap; clears skip).
        if ((libContent?.inventory ?? []).some((c) => c.id === id)) {
          const had = draft.inventoryLibIds.includes(id);
          set({ inventoryLibIds: had ? draft.inventoryLibIds.filter((x) => x !== id) : [...draft.inventoryLibIds, id], inventorySkipped: false });
          return;
        }
        // optional items: pick up to TWO (#136), replacing the oldest like domains. Any pick clears skip.
        // One pick per choice: choosing replaces whatever this choice held, rather than filling a
        // shared pool of two. That pool let a player take both potions and no keepsake.
        const group = CLASS_INVENTORY[draft.className!]?.choices[invChoice] ?? [];
        const ids = new Set(group.map(itemOptionId));
        const others = draft.inventoryItemIds.filter((x) => !ids.has(x));
        const has = draft.inventoryItemIds.includes(id);
        set({
          inventoryItemIds: has ? others : [...others, id],
          inventorySkips: (draft.inventorySkips ?? []).filter((c) => c !== invChoice),
          inventorySkipped: false,
        });
        return;
      }
      if (!isCardDeck(deck)) return;
      switch (deck) {
        case 'class': {
          const key = id.replace('class-', '') as ClassName;
          if (draft.className === key) set({ className: null, subclassCardId: null, domainCardIds: [] });
          else set({ className: key, subclassCardId: null, domainCardIds: [] });
          return;
        }
        case 'subclass':
          set({ subclassCardId: draft.subclassCardId === id ? null : id });
          return;
        case 'ancestry': {
          // #265 mode toggle cards.
          if (id === MIXED_ANCESTRY_ID) { set({ mixedAncestry: { first: null, second: null }, ancestryCardId: null }); return; }
          if (id === SINGLE_ANCESTRY_ID) { set({ mixedAncestry: null }); return; }
          if (draft.mixedAncestry) {
            // Ordered two-pick: 1st filled slot keeps trait 1, 2nd keeps trait 2. Tapping a picked card
            // frees its slot. A card can't fill both slots (tapping it just toggles its own).
            const { first, second } = draft.mixedAncestry;
            if (id === first) { set({ mixedAncestry: { first: null, second } }); return; }
            if (id === second) { set({ mixedAncestry: { first, second: null } }); return; }
            if (!first) { set({ mixedAncestry: { first: id, second } }); return; }
            if (!second) { set({ mixedAncestry: { first, second: id } }); return; }
            return; // both slots full → ignore until one is freed
          }
          set({ ancestryCardId: draft.ancestryCardId === id ? null : id });
          return;
        }
        case 'transformation':
          set({ transformationCardId: draft.transformationCardId === id ? null : id });
          return;
        case 'community':
          set({ communityCardId: draft.communityCardId === id ? null : id });
          return;
        case 'domains': {
          const has = draft.domainCardIds.includes(id);
          if (has) set({ domainCardIds: draft.domainCardIds.filter((x) => x !== id) });
          else if (draft.domainCardIds.length < 2) set({ domainCardIds: [...draft.domainCardIds, id] });
          else set({ domainCardIds: [draft.domainCardIds[1], id] });
          return;
        }
      }
    },
    [deck, draft, set, weaponSlot, invChoice, secondaryAllowed, libContent, unskip, carry, carryOff],
  );

  // v0.23.0: teach the creator when the creator opens, not on first launch.
  useEffect(() => {
    // v0.26.0: DEFERRED out of the mount tick, deliberately.
    //
    // Pushing the tour while the creator's own navigation is still settling made both history
    // entries in the same tick, and Firefox collapses those into one. Going back from the tour then
    // went back PAST the creator and landed on the character list, which is empty for a new player,
    // so making a character looked like it had failed. Chrome kept both entries, which is why it only
    // ever happened in one browser.
    //
    // One frame is enough for the creator's entry to exist in its own right. Returning still uses
    // back(), which keeps the creator mounted with everything the player has already chosen; sending
    // them forward to a fresh copy instead would re-ask which expansions they wanted.
    if (!shouldShow('creation')) return;
    const t = setTimeout(() => router.push('/onboarding?tour=creation' as Href), 0);
    return () => clearTimeout(t);
  }, [router]);

  useEffect(() => {
    if (resumeChecked) return;
    setResumeChecked(true);
    // A characterize draft belongs to ONE combatant, so offering an unrelated hero back into it
    // would put someone else's class on this adversary. Neither offered nor saved (below).
    if (characterizing) return;
    const stored = loadDraft<Draft>();
    if (isResumable(stored, draftHasContent) && stored) setResumeOffer({ draft: stored.draft, deck: stored.deck, savedAt: stored.savedAt });
    else clearDraft();
  }, [resumeChecked, characterizing]);

  // Persist after every edit. Cheap (one small JSON) and it means the draft survives anything.
  useEffect(() => {
    if (!resumeChecked || resumeOffer || characterizing) return; // don't overwrite a draft we're still offering back
    if (draftHasContent(draft)) saveDraft(draft, { deck, picked: [...picked] });
  }, [draft, deck, picked, resumeChecked, resumeOffer, characterizing]);

  draftRef.current = draft;
  const complete = deckList.every((d) => deckDone(d.key, draft)) && draft.name.trim().length > 0;
  // Aggregate progress (v0.22.0). The rail showed per-step ticks but nothing showed how close you
  // were overall, and the NAME requirement had no representation on the rail at all — so a player
  // could hold ten gold ticks and a disabled Forge button with no explanation of why.
  const steps = deckList.length + 1; // +1 for the name
  const stepsDone = deckList.filter((d) => deckDone(d.key, draft)).length + (draft.name.trim().length > 0 ? 1 : 0);
  const missingLabel = !draft.name.trim() ? 'a name' : (deckList.find((d) => !deckDone(d.key, draft))?.label.toLowerCase() ?? null);

  /** Tapping Forge while incomplete jumps to the first unmet step instead of doing nothing. */
  const jumpToMissing = useCallback(() => {
    playSfx('buttonTap');
    const next = deckList.find((d) => !deckDone(d.key, draft));
    if (next) switchDeck(next.key);
    else nameRef.current?.focus(); // every deck is done, so the name is what's left
  }, [draft, switchDeck, deckList]);

  const forge = useCallback(async () => {
    if (!complete || !draft.className) return;
    const id = newCharacterId();
    // v0.10.3 (B4): embed a self-contained COPY of every picked homebrew card so the character renders +
    // resolves effects with no expansion installed and survives it being disabled/deleted. Derived from
    // the slot ids + loose inventory picks. A creation with no homebrew picks leaves this undefined.
    const libById = new Map<string, LibraryCard>();
    if (libContent) for (const arr of [libContent.ancestries, libContent.communities, libContent.subclasses, libContent.domains, libContent.armor, libContent.inventory]) for (const c of arr) libById.set(c.id, c);
    const pickedIds = [draft.mixedAncestry ? draft.mixedAncestry.first : draft.ancestryCardId, draft.mixedAncestry?.second, draft.subclassCardId, draft.communityCardId, draft.armorId, ...draft.domainCardIds, ...draft.inventoryLibIds].filter((x): x is string => !!x);
    const libraryCards = [...new Set(pickedIds)].map((pid) => libById.get(pid)).filter((c): c is LibraryCard => !!c);
    // v0.10.5: a custom subclass FOUNDATION drags its specialization + mastery siblings along (same family
    // + class) so the subclass-upgrade advancement can add them on level-up. They stay hidden on the sheet
    // until acquired.
    // v0.14.0: family matching goes through subclassFamilyKey, which falls back to the card TITLE — an
    // author who named all three cards the same and left the family field blank used to get no siblings.
    const subFoundation = draft.subclassCardId ? libById.get(draft.subclassCardId) : undefined;
    if (subFoundation?.contentType === 'subclass') {
      const famKey = subclassFamilyKey(subFoundation);
      for (const sib of libContent?.subclasses ?? []) {
        if (subclassFamilyKey(sib) === famKey && (sib.tier ?? 1) !== 1 && !libraryCards.some((c) => c.id === sib.id)) libraryCards.push(sib);
      }
    }
    // enable custom origin/armor cards so their effects apply (armor score/thresholds, ancestry passive).
    // v0.26.0: the CHOSEN ARMOR is equipped too. A new character arrived with an armor card sitting
    // inert in their arsenal and an Armor Score of zero, because equipping is a hold the player has
    // not learned yet. Armor is the one starting card whose whole purpose is its numbers, so leaving
    // it off made a fresh sheet simply wrong. Onboarding recommends tidying the rest away afterwards.
    const enabledCustom = [
      ...libraryCards.filter((c) => (c.effects?.length ?? 0) > 0 || c.contentType === 'armor').map((c) => c.id),
      ...(draft.armorId ? [draft.armorId] : []),
    ];
    // v0.12.2: record which EXPANSIONS this hero was created with (real ids only — the implicit base is
    // dropped). Omitted when empty so a base-only save stays byte-identical / back-compat.
    const enabledExpansionIds = [...picked].filter((id) => id !== BASE_PICK_ID);
    await saveCharacter({
      schemaVersion: 1,
      id,
      createdAt: new Date().toISOString(),
      name: draft.name.trim(),
      portraitUri: draft.portraitUri,
      className: draft.className,
      subclassCardId: draft.subclassCardId!,
      // #265: mixed ancestry — `first` is the primary ancestry (drives the name), `second` rides along as
      // an acquired card; both carry their cross-out + half-applied modifiers via `mixedAncestry`.
      ancestryCardId: draft.mixedAncestry ? draft.mixedAncestry.first! : draft.ancestryCardId!,
      // Both ancestry cards land in Arsenal, side by side (#276 item 3): the first is the origin card
      // (already in abilities); the second rides in via acquiredCardIds, so pin it to abilities too.
      ...(draft.mixedAncestry ? { mixedAncestry: { first: draft.mixedAncestry.first!, second: draft.mixedAncestry.second! }, acquiredCardIds: [draft.mixedAncestry.second!], cardCategory: { [draft.mixedAncestry.second!]: 'abilities' } } : {}),
      communityCardId: draft.communityCardId!,
      domainCardIds: draft.domainCardIds,
      traits: draft.traits as Record<TraitKey, number>, // complete ⇒ all six assigned
      experiences: draft.experiences,
      // v0.10.2: weapon/armor may be skipped → left undefined (the fields are optional on CharacterFile).
      weaponPrimaryId: draft.weaponPrimaryId ?? undefined,
      weaponSecondaryId: draft.weaponSecondaryId,
      armorId: draft.armorId ?? undefined,
      inventoryItemIds: draft.inventoryItemIds,
      ...(libraryCards.length ? { libraryCards } : {}),
      ...(enabledCustom.length ? { enabledCardIds: enabledCustom } : {}),
      ...(enabledExpansionIds.length ? { enabledExpansionIds } : {}),
      gold: draft.gold,
      level: 1,
    }).catch((e: unknown) => {
      // v0.22.0: this was awaited with NO catch, so a failed write produced no feedback at all.
      // Put the draft back so nothing is lost, and say what happened.
      saveDraft(draft, { deck, picked: [...picked] });
      showToast('Could not save your hero. Your draft is safe, try Forge again.', 'error');
      throw e;
    });
    clearDraft(); // only now: the draft has become a character and must not be offered back
    router.replace({ pathname: '/sheet', params: { id } });
  }, [complete, draft, router, libContent, picked]);

  /**
   * Forge a CHARACTERIZED adversary or ally (v0.36, owner).
   *
   * Three things happen that ordinary creation does not do, and the order between them matters:
   *
   *  1. Every carried item that survived the first step becomes a custom card in the Arsenal, with
   *     its full text so the DM can read what it does, and the colour it was shown in.
   *  2. The sheet is computed ONCE from everything else the character has, and only then are the
   *     carried thresholds and vitals written as the single difference. That is what makes an 8/14
   *     adversary read 8/14 whatever the class, the level bonuses and the chosen cards come to.
   *  3. The combatant in the encounter is replaced by an entry naming this character, on the side it
   *     was already fighting on, and the character joins both the roster and the adversary library.
   */
  const forgeCharacterized = useCallback(async () => {
    const ch = draftRef.current.characterize;
    const d = draftRef.current;
    if (!d.className || !ch) return;
    setForging(true);
    const id = newCharacterId();
    const kept = keptItems(carry, carryOff);
    // Greying the level card out sends them to level 1 (owner); otherwise the Level step's number
    // wins, falling back to what the tier and difficulty worked out to.
    const level = carryOff.has('carry-level') ? 1 : (d.level ?? keptLevel(carry, carryOff));
    // The level is the character's LEVEL, not a card. Everything else becomes one.
    const carded = kept.filter((it) => it.kind !== 'level');
    const cardOf = (it: CarryItem, effects: CardEffect[]): CustomCardDef => ({
      id: `cz-${it.id}`,
      title: it.title,
      text: it.text,
      imageUri: null,
      color: carryColor(it.id),
      typeLabel: it.cardLabel,
      target: 'arsenal',
      ...(effects.length ? { effects } : {}),
    });

    const libById = new Map<string, LibraryCard>();
    if (libContent) for (const arr of [libContent.ancestries, libContent.communities, libContent.subclasses, libContent.domains, libContent.armor, libContent.inventory]) for (const c of arr) libById.set(c.id, c);
    const pickedIds = [d.mixedAncestry ? d.mixedAncestry.first : d.ancestryCardId, d.mixedAncestry?.second, d.subclassCardId, d.communityCardId, d.armorId, ...d.domainCardIds, ...d.inventoryLibIds].filter((x): x is string => !!x);
    const libraryCards = [...new Set(pickedIds)].map((pid) => libById.get(pid)).filter((c): c is LibraryCard => !!c);
    const acquired = d.transformationCardId ? [d.transformationCardId] : [];

    const common = {
      schemaVersion: 1 as const,
      id,
      createdAt: new Date().toISOString(),
      name: d.name.trim(),
      portraitUri: d.portraitUri,
      className: d.className,
      subclassCardId: d.subclassCardId ?? '',
      ancestryCardId: (d.mixedAncestry ? d.mixedAncestry.first : d.ancestryCardId) ?? '',
      communityCardId: d.communityCardId ?? '',
      domainCardIds: d.domainCardIds,
      traits: d.traits as Record<TraitKey, number>,
      experiences: d.experiences,
      weaponPrimaryId: d.weaponPrimaryId ?? undefined,
      weaponSecondaryId: d.weaponSecondaryId,
      armorId: d.armorId ?? undefined,
      inventoryItemIds: d.inventoryItemIds,
      ...(libraryCards.length ? { libraryCards } : {}),
      ...(acquired.length ? { acquiredCardIds: acquired } : {}),
      ...([...picked].filter((x) => x !== BASE_PICK_ID).length ? { enabledExpansionIds: [...picked].filter((x) => x !== BASE_PICK_ID) } : {}),
      gold: d.gold,
      level,
      characterized: true as const,
      arsenalOnly: true as const,
      // "A characterized adversary that skips the inventory step must have no inventory cards at
      // all, no torches, no rope, no potions" (owner). Working through the step still takes the kit.
      skipStartingKit: !!d.skipped?.includes('inventory'),
    };

    // Pass 1: the same file with the carried cards carrying NOTHING, so the sheet reports what
    // everything else adds up to.
    const provisional = { ...common, customCards: carded.map((it) => cardOf(it, [])) } as CharacterFile;
    const sheet = toSheetCharacter(provisional);
    const have = {
      majorThreshold: sheet.damageThresholds.major,
      severeThreshold: sheet.damageThresholds.severe,
      maxHp: sheet.maxHp,
      stressMax: sheet.stress.total - (sheet.stress.locked ?? 0),
    };
    const customCards = carded.map((it) => cardOf(it, itemHoldEffects(it, have)));
    // Everything on, at once: a DM reading this sheet wants the true numbers, not a character with
    // its own domain cards and armor switched off waiting to be discovered mid-fight.
    const enabledCardIds = [
      ...customCards.map((c) => c.id),
      ...libraryCards.filter((c) => (c.effects?.length ?? 0) > 0 || c.contentType === 'armor').map((c) => c.id),
      ...(d.armorId ? [d.armorId] : []),
      ...(d.weaponPrimaryId ? [d.weaponPrimaryId] : []),
      ...(d.weaponSecondaryId ? [d.weaponSecondaryId] : []),
      ...d.domainCardIds,
      ...acquired,
    ];
    const file = { ...common, customCards, enabledCardIds: [...new Set(enabledCardIds)] } as CharacterFile;

    try {
      await saveCharacter(file);
      // The encounter entry: same combatant, same side, now naming a character.
      const enc = await getEncounter(ch.encounterId);
      if (enc) {
        const swap = (c: Combatant): Combatant => (c.id === ch.combatantId ? { ...c, charId: id, name: file.name, portraitUri: file.portraitUri ?? c.portraitUri } : c);
        await saveEncounter({
          ...enc,
          adversaries: enc.adversaries.map(swap),
          allies: enc.allies.map((a) => (a.kind === 'npc' ? { kind: 'npc' as const, combatant: swap(a.combatant) } : a)),
          charVitals: { ...(enc.charVitals ?? {}), [id]: initialVitals(file) },
        });
        // Into the library too, in its own section, so it can be brought back in a later fight.
        const held = [...enc.adversaries, ...enc.allies.flatMap((a) => (a.kind === 'npc' ? [a.combatant] : []))].find((c) => c.id === ch.combatantId);
        if (held) {
          const lib = await loadAdversaries();
          await saveAdversaries(addTemplate(lib, { ...held, charId: id, name: file.name }));
        }
        // An ALLY is offered to the party; an adversary is not, because the app should not suggest
        // recruiting the villain. Either way the character is on the roster and can be added by hand.
        if (ch.side === 'ally') {
          const ses = await getSession(enc.sessionId);
          const party = ses ? await getParty(ses.partyId) : null;
          if (party && !party.memberIds.includes(id)) {
            setForging(false);
            setJoinParty({ charId: id, name: file.name, party });
            return;
          }
        }
      }
    } catch (e: unknown) {
      setForging(false);
      showToast('Could not save this character. Nothing was changed.', 'error');
      throw e;
    }
    clearDraft();
    router.replace(`/encounter?id=${ch.encounterId}` as Href);
  }, [carry, carryOff, carryColor, libContent, picked, router]);

  /** Write an experience into its slot. Shared so the quick flow and the full editor cannot drift. */
  const saveExperience = useCallback((slot: number, d: { title: string; imageUri: string | null; color: string | null; effects?: CardEffect[] }) => {
    const next = [...draft.experiences];
    const existing = next[slot];
    next[slot] = { id: existing?.id ?? `exp-${Date.now().toString(36)}`, title: d.title, text: '', imageUri: d.imageUri, color: d.color, effects: d.effects, modifier: existing?.modifier ?? 2 };
    set({ experiences: next.filter(Boolean) });
    setEditingExperience(null);
  }, [draft.experiences, set]);

  const pickPortrait = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 }); // no forced crop (#155) — positioned in the portrait mask instead
    // v0.26.0: copy it somewhere the app owns first. The picker returns a path into the CACHE
    // directory, which an app update is free to clear, and that is exactly why portraits kept
    // disappearing from the roster after an update while the character file itself was fine.
    if (!res.canceled && res.assets[0]) set({ portraitUri: await ownImage(res.assets[0].uri) });
  }, [set]);

  const locked = (k: DeckKey) =>
    ((k === 'subclass' || k === 'domains') && !draft.className) || !!deckList.find((d) => d.key === k)?.stub; // stubs land next issue
  const maxSelect = deck === 'domains' || deck === 'inventory' || (deck === 'ancestry' && !!draft.mixedAncestry) ? 2 : 1;
  // 'domains' used to fall back to the word 'card' — the least specific label in the app, on the one
  // step where you pick two. It only shows now when the centred card's own name is too long to fit.
  const noun = deck === 'weapons' ? weaponSlot : deck === 'class' ? 'class' : deck === 'domains' ? 'domain card' : deck === 'armor' ? 'armor' : deck;
  const centerItem = items[Math.min(centerIdx, Math.max(0, items.length - 1))];
  const allCarryOff = carry.length > 0 && carryOff.size >= carry.length;
  /**
   * SKIP (v0.36, owner): answer a step with nothing and move on.
   *
   * Characterize only, and never on Class, which is the one thing a character cannot be without. It
   * sits beside Random because that is where the thumb already is, and because the two are the same
   * kind of control: a way past a decision you do not want to make card by card.
   */
  const skipStep = useCallback(() => {
    const k = deckRef.current;
    playSfx('buttonTap');
    setDraft((d) => ({ ...d, skipped: [...new Set([...(d.skipped ?? []), k])] }));
    const order = decksRef.current.filter((x) => !x.stub);
    const at = order.findIndex((x) => x.key === k);
    const next = order.slice(at + 1).find((x) => !deckDone(x.key, { ...draftRef.current, skipped: [...(draftRef.current.skipped ?? []), k] }));
    if (next) switchDeckRef.current(next.key);
  }, []);
  const SkipStep = useCallback(
    () => (characterizing && deck !== 'class' && deck !== 'carry' ? <RuneButton label={draft.skipped?.includes(deck) ? 'Skipped' : 'Skip'} kind="ghost" dense height={30} muteSfx onPress={skipStep} accessibilityLabel={`Skip ${deck}`} /> : null),
    [characterizing, deck, draft.skipped, skipStep],
  );
  const centerSelected = !!centerItem && selectedIds.includes(centerItem.id);
  // Live mirrors for the keyboard listener, which is registered once and must never close over a
  // stale render. `overlayUp` is everything that covers the creator and therefore owns the keyboard.
  const overlayUpRef = useRef(false);
  overlayUpRef.current = leaveConfirm || !!resumeOffer || pickerOpen || editingExperience !== null || !!expAdvanced || loaderUp;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;
  const deckRef = useRef(deck);
  deckRef.current = deck;
  const switchDeckRef = useRef(switchDeck);
  switchDeckRef.current = switchDeck;
  const decksRef = useRef(deckList);
  decksRef.current = deckList;

  /**
   * Keyboard control for the creator (v0.29.0). Web only, and a no-op on a phone.
   *
   * The sheet has had this since v0.26.0 and the creator never did, so on a desktop the one screen
   * where you look through a hundred cards was the one screen you had to drag through with a mouse.
   * The meaning of each key comes from the same pure resolver the sheet uses (`intentFor`), so the
   * two screens cannot drift apart and every awkward case stays a table test.
   *
   * The intents map onto what a creator can actually do: move along the deck, open and close a card,
   * SELECT the centred card (Space, the same key that equips on the sheet), and cross sections with
   * Shift plus up or down, which is what changing category means here.
   */
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const intent = intentFor(
        { key: e.key, shift: e.shiftKey, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey },
        {
          typing: tag === 'INPUT' || tag === 'TEXTAREA' || !!t?.isContentEditable,
          // Anything covering the creator owns the keyboard: a card editor, the expansion picker,
          // the leave prompt, the tour.
          overlay: overlayUpRef.current,
          focused: !!carouselRef.current?.isFullscreen(),
          editing: false, // the creator has no edit mode
        },
      );
      if (!intent) return;
      const car = carouselRef.current;
      switch (intent.kind) {
        case 'move':
          car?.stepBy(intent.step);
          break;
        case 'focus':
          car?.focusCentre();
          break;
        case 'unfocus':
          car?.closeIfFullscreen();
          break;
        case 'toggle': {
          // Space picks the card in the middle, which is the creator's whole job.
          const it = itemsRef.current[Math.min(car?.centerIndex() ?? 0, Math.max(0, itemsRef.current.length - 1))];
          if (it) {
            playSfx(selectedIdsRef.current.includes(it.id) ? 'cardDeselect' : 'cardSelect');
            onToggleRef.current(it.id);
          }
          break;
        }
        case 'category': {
          const order = decksRef.current.filter((d) => !d.stub).map((d) => d.key);
          const at = order.indexOf(deckRef.current);
          const to = order[Math.min(order.length - 1, Math.max(0, at + intent.step))];
          if (to && to !== deckRef.current) switchDeckRef.current(to);
          break;
        }
        case 'dismiss':
          if (!car?.closeIfFullscreen()) return; // nothing of ours was open; let the app handle it
          break;
        default:
          return; // confirm and the rest belong to whatever is on top
      }
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // v0.10.2 (Feature 2): a per-section Random button. Picks a valid random choice for the CURRENT deck,
  // honoring dependencies (subclass/domains follow the class). Experiences stay manual (freeform text).
  /**
   * Swap which mixed ancestry keeps its FIRST trait and which keeps its SECOND (v0.29.0).
   *
   * The whole selection is derived from this one pair: which effects survive
   * (`isAncestryEffectDisabled` compares the slot against ANCESTRY_EFFECT_TRAIT), which half of each
   * card is struck through, and which card is the origin card on the sheet. So the swap is the swap,
   * and everything else follows on the next render. Nothing is baked into a card bitmap either: the
   * cross-out is drawn as an overlay over the card, so no cached picture goes stale.
   *
   * Guarded on both slots being filled, which is also what greys the button out. Swapping a half-made
   * pair would move the one pick to the far slot, which is a confusing way to lose your place.
   */
  const reverseMix = useCallback(() => {
    const m = draftRef.current.mixedAncestry;
    if (!m?.first || !m?.second) return;
    playSfx('cardSelect');
    set({ mixedAncestry: { first: m.second, second: m.first } });
  }, [set]);

  const randomize = useCallback(() => {
    const pick = <T,>(a: T[]): T | undefined => (a.length ? a[Math.floor(Math.random() * a.length)] : undefined);
    const two = <T,>(a: T[]): T[] => { const p = [...a]; const o: T[] = []; while (p.length && o.length < 2) o.push(p.splice(Math.floor(Math.random() * p.length), 1)[0]); return o; };
    playSfx('cardSelect');
    let focusId: string | undefined; // the picked card to recenter the carousel on (Feature 2)
    switch (deck) {
      case 'class': { const k = pick(creationClassCards.map((c) => c.key)); if (k) { set({ className: k, subclassCardId: null, domainCardIds: [] }); focusId = `class-${k}`; } break; }
      case 'subclass': { if (!draft.className) break; const id = pick(CATALOG.filter((c) => c.kind === 'subclass' && c.className === draft.className && c.tier === 1 && (!c.expansion || picked.has(c.expansion))).map((c) => c.id)); if (id) { set({ subclassCardId: id }); focusId = id; } break; }
      case 'ancestry': {
        const anc = CATALOG.filter((c) => c.kind === 'ancestry' && (!c.expansion || picked.has(c.expansion))).map((c) => c.id);
        if (draft.mixedAncestry) {
          // Feature 3: fill the first EMPTY slot in order; if both are full, alternate which one re-rolls.
          // Re-rolling avoids the other slot's card AND its own current card so the pick visibly changes.
          const { first, second } = draft.mixedAncestry;
          const { slot, alt } = nextMixSlot(first, second, mixRollNext.current);
          mixRollNext.current = alt;
          const other = slot === 'first' ? second : first;
          const current = slot === 'first' ? first : second;
          const fresh = anc.filter((id) => id !== other && id !== current);
          const id = pick(fresh.length ? fresh : anc.filter((x) => x !== other));
          if (id) { set({ mixedAncestry: { ...draft.mixedAncestry, [slot]: id } }); focusId = id; }
          break;
        }
        const id = pick(anc); if (id) { set({ ancestryCardId: id, mixedAncestry: null }); focusId = id; }
        break;
      }
      case 'community': { const id = pick(CATALOG.filter((c) => c.kind === 'community' && (!c.expansion || picked.has(c.expansion))).map((c) => c.id)); if (id) { set({ communityCardId: id }); focusId = id; } break; }
      case 'domains': { if (!draft.className) break; const pool = classInfo(draft.className).domains.flatMap((d) => CATALOG.filter((c) => c.kind === 'domain' && c.domain === d && c.level === 1 && (!c.expansion || picked.has(c.expansion)))).map((c) => c.id); const picks = two(pool); set({ domainCardIds: picks }); focusId = picks[picks.length - 1]; break; }
      case 'weapons': { const w = pick(PRIMARY_WEAPONS.filter((x) => x.kind === weaponKind && (!x.expansion || picked.has(x.expansion)))); if (w) { set({ weaponPrimaryId: w.id, weaponsSkipped: false, ...(w.burden === 'Two-Handed' ? { weaponSecondaryId: null } : {}) }); focusId = w.id; } break; }
      case 'armor': { const id = pick(TIER1_ARMOR.filter((a) => !a.expansion || picked.has(a.expansion)).map((a) => a.id)); if (id) { set({ armorId: id, armorSkipped: false }); focusId = id; } break; }
      case 'inventory': { if (!draft.className) break; const groups = CLASS_INVENTORY[draft.className]?.choices ?? []; const picks = groups.map((g) => itemOptionId(g[Math.floor(Math.random() * g.length)])); set({ inventoryItemIds: picks, inventorySkips: [], inventorySkipped: false }); focusId = picks[invChoice] ?? picks[picks.length - 1]; break; }
    }
    if (focusId) {
      const idx = items.findIndex((it) => it.id === focusId);
      if (idx >= 0) carouselRef.current?.scrollTo(idx);
    }
  }, [deck, draft.className, draft.mixedAncestry, weaponKind, invChoice, items, set, picked, creationClassCards]);

  return (
    <AppScreen
      title="New hero"
      onBack={() => { if (draftHasContent(draft)) setLeaveConfirm(true); else { clearDraft(); router.back(); } }}
      // v0.25.0: Forge is DIM until the character is finished, so the button reports readiness instead
      // of claiming it from the first screen. It stays tappable on purpose: tapping it while
      // incomplete jumps to the step that is missing, which is more use than a dead control, and a
      // truly dead Forge with no explanation is the thing this replaced in the first place.
      headerRight={<RuneButton label="Forge" kind={complete ? 'primary' : 'ghost'} height={26} dense onPress={() => { if (!complete) { jumpToMissing(); return; } void (characterizing ? forgeCharacterized() : forge()); }} accessibilityLabel={complete ? 'Create character' : `Create character, still needs ${missingLabel ?? 'more'}`} />}>
      <Animated.View style={[{ flex: 1 }, entryStyle]}>
        {/* ---- details ---- */}
        <SectionDivider label="Details" />
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
          {/* portrait well (left) */}
          <Pressable onPress={pickPortrait} accessibilityRole="button" accessibilityLabel={draft.portraitUri ? 'Change portrait' : 'Add a portrait'}>
            {({ pressed }) => (
              <ChamferBox
                chamfer={10}
                fill={pressed ? 'rgba(20,24,31,0.95)' : 'rgba(14,17,22,0.9)'}
                stroke="rgba(218,162,73,0.5)"
                strokeWidth={1.2}
                style={{ width: 100, height: 128, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {draft.portraitUri ? (
                  <ChamferedImage uri={draft.portraitUri} width={100} height={128} chamfer={10} />
                ) : (
                  <Svg width={30} height={30} viewBox="0 0 26 26">
                    <Circle cx={13} cy={9} r={4.4} fill="none" stroke={Rune.goldEdge} strokeWidth={1.8} />
                    <Path d="M 3.5 23 Q 13 14 22.5 23" fill="none" stroke={Rune.goldEdge} strokeWidth={1.8} />
                  </Svg>
                )}
              </ChamferBox>
            )}
          </Pressable>
          {/* name + caption (top) and the add-image button pinned to the BOTTOM so its lower edge
              lines up with the bottom of the (now portrait-oriented) frame (#135). */}
          <View style={{ flex: 1, justifyContent: 'space-between' }}>
            <View style={{ gap: 6 }}>
              <ChamferBox chamfer={8} fill="rgba(14,17,22,0.9)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ height: 48, justifyContent: 'center', paddingHorizontal: 13 }}>
                <TextInput
                  value={draft.name}
                  onChangeText={(name) => set({ name })}
                  ref={nameRef}
                  placeholder="Name"
                  placeholderTextColor={Rune.muted}
                  selectionColor={Rune.goldBright}
                  maxLength={40}
                  style={{ color: Rune.sheet, fontSize: 16, fontFamily: Body.semibold, letterSpacing: 0.4, padding: 0 }}
                  accessibilityLabel="Character name"
                />
              </ChamferBox>
              <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.medium, lineHeight: 14 }}>Portrait optional — it sits in the {"sheet's"} portrait frame.</Text>
            </View>
            <RuneButton label={draft.portraitUri ? 'Change image' : 'Add image'} kind="ghost" height={32} onPress={pickPortrait} />
          </View>
        </View>

        {/* ---- cards ---- */}
        <View style={{ marginTop: 6 }}>
          <SectionDivider label="Cards" />
        </View>
        {/* v0.22.0: aggregate progress. The rail carried per-step ticks but nothing said how close
            you were overall, and the NAME requirement wasn't on the rail at all — so ten gold ticks
            plus a dead Forge button had no explanation. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, marginBottom: 2 }}>
          <Text style={{ color: complete ? Rune.goldBright : Rune.bronze, fontSize: 10, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>
            {stepsDone} / {steps}
          </Text>
          <View style={{ flex: 1, height: 2, backgroundColor: 'rgba(218,162,73,0.2)' }}>
            <View style={{ width: `${(stepsDone / steps) * 100}%`, height: 2, backgroundColor: complete ? Rune.goldBright : Rune.gold }} />
          </View>
          <Text numberOfLines={1} style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.medium, maxWidth: 150 }}>
            {complete ? 'Ready to forge' : `Next: ${missingLabel}`}
          </Text>
        </View>
        {/* The deck rail (#107, nine steps): fixed-width tabs, free scroll. A thin custom scroll
            indicator (#110) tracks position instead of the old static chevron. */}
        <DeckRail>
          {deckList.map((d) => (
            <DeckTab
              key={d.key}
              deck={d.key}
              label={d.label}
              active={deck === d.key}
              done={!d.stub && deckDone(d.key, draft)}
              locked={locked(d.key)}
              pulseToken={d.key === 'domains' || d.key === 'subclass' ? unlockPulse : 0}
              onPress={() => switchDeck(d.key)}
            />
          ))}
        </DeckRail>

        {/* ---- the forge content: card carousel, or the traits/experiences builders ---- */}
        {/* a relative container so the deck-swap loader can sit AT the card rest position, not the
            top of the content (#150 follow-up) */}
        <View style={{ flex: 1, marginTop: 0 }}>
        <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, fadeStyle]}>
          {/* weapons filter toggles (#121): physical/magic primaries, plus primary/secondary slot.
              flexWrap so the two controls can NEVER overflow the screen margins onto the SVG border
              (#121, owner) — they wrap to a second centered row on a narrow width instead. */}
          {deck === 'weapons' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 4, paddingHorizontal: 4 }}>
              {weaponSlot === 'primary' ? (
                <Segmented
                  options={[
                    { key: 'physical', label: 'Physical' },
                    { key: 'magic', label: 'Magic' },
                  ]}
                  value={weaponKind}
                  onChange={setWeaponKind}
                />
              ) : null}
              <Segmented
                options={[
                  { key: 'primary', label: 'Primary' },
                  { key: 'secondary', label: 'Secondary', disabled: !secondaryAllowed },
                ]}
                value={weaponSlot}
                onChange={setWeaponSlot}
              />
            </View>
          ) : null}
          {/* v0.26.0: the guide's two inventory choices, one at a time, presented exactly like the
              weapon slots above so the pattern is already familiar by the time it appears. */}
          {deck === 'inventory' && (draft.className ? CLASS_INVENTORY[draft.className].choices.length > 1 : false) ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 4, paddingHorizontal: 4 }}>
              <Segmented
                options={[
                  { key: '0', label: 'Choice 1' },
                  { key: '1', label: 'Choice 2' },
                ]}
                value={String(invChoice)}
                onChange={(k) => setInvChoice(k === '1' ? 1 : 0)}
              />
            </View>
          ) : null}
          {isCarouselDeck(deck) && items.length > 0 ? (
            <Animated.View style={[{ flex: 1 }, modeFadeStyle]}>
              <StraightCarousel
                ref={carouselRef}
                key={deck + (deck === 'weapons' ? `${weaponKind}-${weaponSlot}` : deck === 'inventory' ? String(invChoice) : deck === 'subclass' || deck === 'domains' ? (draft.className ?? '') : '')}
                items={items}
                selectedIds={selectedIds}
                crossOuts={deck === 'ancestry' ? ancestryCrossOuts : undefined}
                reserveBottom={CONTROLS_BAND}
                initialIndex={deckIndexes.current[deck] ?? Math.floor(items.length / 2)}
                onIndexChange={onCenterIdx}
              />
            </Animated.View>
          ) : null}
          {deck === 'traits' ? (
            characterizing ? (
              <CharacterizeTraitsTab traits={draft.traits} initial={inheritedTraits} onTraits={(traits) => { unskip('traits'); set({ traits }); }} footer={<SkipStep />} />
            ) : (
              <TraitsTab traits={draft.traits} onTraits={(traits) => set({ traits })} spellcastTrait={spellcastTraitForSubclass(draft.subclassCardId ? cardById(draft.subclassCardId)?.subclass : undefined)} />
            )
          ) : null}
          {deck === 'level' ? (
            <LevelTab
              level={carryOff.has('carry-level') ? 1 : (draft.level ?? levelForStatBlock(statBlock?.tier, statBlock?.difficulty))}
              derived={carryOff.has('carry-level') ? 1 : levelForStatBlock(statBlock?.tier, statBlock?.difficulty)}
              onLevel={(n) => { unskip('level'); set({ level: n }); }}
              footer={<SkipStep />}
            />
          ) : null}
          {deck === 'experiences' ? <ExperiencesTab experiences={draft.experiences} onEdit={(slot) => setEditingExperience(slot)} /> : null}
          {deck === 'experiences' && characterizing ? (
            <View style={{ alignItems: 'center', paddingBottom: 14 }}>
              <SkipStep />
            </View>
          ) : null}
        </Animated.View>
        {pendingDeck ? <DeckLoader /> : null}
        </View>
      </Animated.View>
      {/* v0.26.0: experiences are authored through the SAME quick flow as cards on the sheet.
          Two ways to make a thing was one too many, and the quick flow is the better one here: an
          experience is a short phrase, which is exactly what it is built for. Advanced is one tap
          away and carries the draft, so nothing that was possible before has been taken away. */}
      {editingExperience != null ? (
        expAdvanced ? (
          <CardEditor
            kindLabel="Experience"
            experienceMode
            modifier={draft.experiences[editingExperience]?.modifier ?? 2}
            initial={expAdvanced}
            onCancel={() => { setExpAdvanced(null); setEditingExperience(null); }}
            onSave={(d) => { saveExperience(editingExperience, d); setExpAdvanced(null); }}
          />
        ) : (
          <QuickCardFlow
            kindLabel="Experience"
            initial={draft.experiences[editingExperience] ? { title: draft.experiences[editingExperience].title, text: draft.experiences[editingExperience].text, imageUri: draft.experiences[editingExperience].imageUri, color: draft.experiences[editingExperience].color ?? null, effects: draft.experiences[editingExperience].effects ?? [] } : undefined}
            onCancel={() => setEditingExperience(null)}
            onAdvanced={(d) => setExpAdvanced(d)}
            onSave={(d) => saveExperience(editingExperience, d)}
          />
        )
      ) : null}
      {/* ---- THE select controls: the screen's TOP layer (#106) — above the carousel veil AND
          the features reader, never dimmed, always tappable, one spot. Card decks only. Hierarchy
          top-to-bottom (#108): SELECT (primary, biggest) → CLASS FEATURES → the n/n counter. */}
      {isCarouselDeck(deck) ? (
        // Weapons sits its cluster lower (the filter toggles push its carousel down, so the cards
        // reach further into this band) — the buttons must never overlap the carousel (owner).
        <Animated.View style={[{ position: 'absolute', left: 0, right: 0, bottom: 14, zIndex: 600, alignItems: 'center', gap: 6 }, fadeStyle]} pointerEvents="box-none">
          <RuneButton
            label={
              deck === 'carry'
                ? carryOff.has(centerItem?.id ?? '') ? 'Keep this' : 'Do not carry this'
                : centerSelected ? 'Deselect' : `Select ${centerItem?.label && centerItem.label.length <= 16 ? centerItem.label : noun}`
            }
            kind={deck === 'carry' ? (carryOff.has(centerItem?.id ?? '') ? 'primary' : 'ghost') : centerSelected ? 'ghost' : 'primary'}
            height={40}
            muteSfx
            onPress={() => {
              if (!centerItem) return;
              // #258: selecting a card uses the card-select/deselect chime, not the generic tap.
              playSfx(centerSelected || (deck === 'carry' && !carryOff.has(centerItem.id)) ? 'cardDeselect' : 'cardSelect');
              onToggle(centerItem.id);
            }}
            accessibilityLabel={deck === 'carry' ? (carryOff.has(centerItem?.id ?? '') ? `Carry ${centerItem?.label ?? 'this'}` : `Do not carry ${centerItem?.label ?? 'this'}`) : centerSelected ? `Deselect ${centerItem?.label ?? noun}` : `Select ${centerItem?.label ?? noun}`}
          />
          {/* v0.10.2 (Feature 2): roll a random valid choice for this section. */}
          {/* v0.29.0: on the ancestry step in MIXED mode, the reverse control sits BESIDE Random rather
              than under it. The controls band is a fixed 102dp and the existing stack already uses 95
              of it, so a new row would push the cards up; a 30dp square next to a 30dp dense button
              costs nothing. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {/* v0.36: the carry step has no Random. Nothing here is a choice to roll for, it is a
                review of what the stat block said, so its second control clears the lot instead. */}
            {deck === 'carry' ? (
              <RuneButton
                label={allCarryOff ? 'Reset' : 'Select all'}
                kind="ghost"
                dense
                height={30}
                muteSfx
                onPress={() => { playSfx(allCarryOff ? 'cardSelect' : 'cardDeselect'); set({ carryDisabled: allCarryOff ? [] : carry.map((it) => it.id) }); }}
                accessibilityLabel={allCarryOff ? 'Carry everything again' : 'Carry nothing'}
              />
            ) : (
              <RuneButton label="Random" kind="ghost" dense height={30} muteSfx onPress={randomize} accessibilityLabel={`Random ${noun}`} />
            )}
            {deck === 'ancestry' && draft.mixedAncestry ? <MixReverseButton mixed={draft.mixedAncestry} onReverse={reverseMix} /> : null}
            <SkipStep />
          </View>
          {/* v0.10.6: the class/weapons hint tooltips were removed — they pushed these buttons up into
              the card carousel (owner). */}
          <Text style={{ color: (deck === 'inventory' ? draft.inventoryItemIds.length : selectedIds.length) >= maxSelect ? Rune.goldBright : Rune.muted, fontSize: 11, fontFamily: Body.bold, letterSpacing: 1.2 }}>
            {deck === 'carry' ? `Carrying ${carry.length - carryOff.size}/${carry.length}` : deck === 'inventory' ? `Picked ${draft.inventoryItemIds.length}/2` : `Picked ${selectedIds.length}/${maxSelect}`}
          </Text>
        </Animated.View>
      ) : null}
      {stage}
      {loaderUp ? <CreateLoader done={loaderDone} onHidden={() => setLoaderUp(false)} /> : null}
      {/* v0.12.2: the per-character expansion picker — shown once the entry loader clears and the installed
          expansions are known. Base defaults checked (plus any expansion enabled-for-creation); confirming
          finalizes `picked`, which gates every content list above. */}
      {pickerOpen && expansions && !loaderUp ? (
        <ExpansionPicker
          expansions={expansions}
          initial={new Set([BASE_PICK_ID, ...expansions.filter(isEnabledForCreation).map((e) => e.id)])}
          onConfirm={(p) => { setPicked(p); setPickerOpen(false); }}
        />
      ) : null}

      {/* v0.22.0: leaving used to discard everything with no prompt. */}
      {leaveConfirm ? (
        <PopupDialog
          title="Leave character creation?"
          body="Your progress is saved as a draft, you can pick it up next time you start a new hero. Discard it instead to start clean."
          confirmLabel="Keep draft & leave"
          onConfirm={() => { setLeaveConfirm(false); router.back(); }}
          onCancel={() => setLeaveConfirm(false)}>
          <View style={{ marginTop: 16 }}>
            <RuneButton label="Discard draft" kind="ghost" height={40} onPress={() => { clearDraft(); setLeaveConfirm(false); router.back(); }} />
          </View>
        </PopupDialog>
      ) : null}

      {forging ? <CreateLoader done={false} onHidden={() => {}} /> : null}
      {joinParty ? (
        <PopupDialog
          title={`Add ${joinParty.name} to ${joinParty.party.name}?`}
          body="They are a character now, so they can be a member of the party like anyone else. Either way they stay in this encounter and on your character list, and you can add them later from the party editor."
          confirmLabel="Add to party"
          cancelLabel="Not now"
          onConfirm={() => {
            const j = joinParty;
            setJoinParty(null);
            void (async () => {
              const f = await getCharacter(j.charId);
              if (f) await saveParty(addMembers(j.party, [{ charId: j.charId, vitals: initialVitals(f) }]));
              clearDraft();
              router.replace(`/encounter?id=${draftRef.current.characterize?.encounterId}` as Href);
            })();
          }}
          onCancel={() => {
            const enc = draftRef.current.characterize?.encounterId;
            setJoinParty(null);
            clearDraft();
            router.replace(`/encounter?id=${enc}` as Href);
          }}
        />
      ) : null}

      {resumeOffer ? (
        <PopupDialog
          title="Resume your draft?"
          body="You left a hero part-way through. Pick up where you stopped, or start a new one."
          confirmLabel="Resume"
          onConfirm={() => {
            const o = resumeOffer;
            setDraft(o.draft);
            if (o.deck) setDeck(o.deck as DeckKey);
            setResumeOffer(null);
          }}
          onCancel={() => { clearDraft(); setResumeOffer(null); }}
          cancelLabel="Start fresh"
        />
      ) : null}
    </AppScreen>
  );
}
