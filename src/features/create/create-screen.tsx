import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, Text, TextInput, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { AppScreen } from '@/components/app-screen';
import { CardEditor } from '@/components/card-editor';
import { ChamferBox } from '@/components/chamfer-box';
import { ChamferedImage } from './components/chamfered-image';
import { RuneButton } from '@/components/rune-button';
import { type ClassName, classColor, classInfo, isVoidClass } from '@/constants/identity';
import { Body, Rune } from '@/constants/theme';
import { CATALOG, cardById } from '@/data/catalog';
import { type TraitKey } from '@/features/character-sheet/character';
import { newCharacterId } from '@/lib/character-file';
import { saveCharacter } from '@/lib/character-store';
import { classExpansion, seedOfficialExpansions } from '@/lib/expansions';
import { contentForCreation, type CreationContent, type Expansion, featureSectionIndexes, isEnabledForCreation, type LibraryCard, subclassFamilyKey } from '@/lib/library';
import { LibraryForgedCard } from './components/library-forged-card';
import { listExpansions } from '@/lib/library-store';
import { BASE_PICK_ID, ExpansionPicker } from './expansion-picker';
import { playSfx } from '@/lib/sfx';
import { CLASS_CARDS } from './components/class-cards';
import { featurePages, spellcastTraitForSubclass } from '@/data/class-data';
import { ForgedArmorCard, ForgedCard, ForgedTextCard, ForgedWeaponCard } from './components/forged-card';
import { PRIMARY_WEAPONS, SECONDARY_WEAPONS, TIER1_ARMOR, type WeaponKind, weaponById } from '@/data/equipment-data';
import { CLASS_INVENTORY, itemOptionId, itemTitle } from '@/data/class-inventory-data';
import { itemColor } from '@/data/item-colors';

import { useForgedSnapshots } from './components/forged-snapshots';
import { StraightCarousel, type StraightCarouselHandle, type StraightFace, type StraightItem } from './components/straight-carousel';
import { type DeckKey, type Draft, isCardDeck, isCarouselDeck, nextMixSlot } from './create-types';
import { DECKS, deckDone, EMPTY, MIXED_ANCESTRY_ID, SINGLE_ANCESTRY_ID } from './create-constants';
import { CreateLoader, DeckLoader } from './create-loaders';
import { DeckRail } from './create-rail';
import { DeckTab, SectionDivider, Segmented } from './create-ui';
import { ExperiencesTab } from './experiences-tab';
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
const SKIP_WEAPONS: StraightItem = { id: 'weapons-skip', label: 'Skip weapons', custom: <ForgedCard title="No weapon" kindLabel="Weapon" body="Skip — start with no weapon equipped." accentDeep={Rune.panel} colorArt="#262A32" multilineTitle /> };
const SKIP_ARMOR: StraightItem = { id: 'armor-skip', label: 'Skip armor', custom: <ForgedCard title="No armor" kindLabel="Armor" body="Skip — start with no armor equipped." accentDeep={Rune.panel} colorArt="#262A32" multilineTitle /> };
const SKIP_INVENTORY: StraightItem = { id: 'inventory-skip', label: 'Skip inventory', custom: <ForgedCard title="No items" kindLabel="Item" body="Skip — start with no chosen inventory items." accentDeep={Rune.panel} colorArt="#262A32" multilineTitle /> };

// v0.10.3 (B4): a homebrew library card as a creation carousel item — rendered live (no webp) like the
// other forged cards. Stats for weapon/armor are folded into the body.
// `struckIndex` (v0.12.4): strike a section's text (mixed-ancestry crossed-out feature) live in the
// creation carousel — structured ancestries have no webp to overlay, so the cross-out rides the markdown.
const libCardItem = (lc: LibraryCard, struckIndex?: number): StraightItem => ({
  id: lc.id,
  label: lc.title || 'Card',
  custom: <LibraryForgedCard card={lc} struckIndex={struckIndex} />,
});

export function CreateScreen() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [deck, setDeck] = useState<DeckKey>('class');
  // v0.12.2: per-character EXPANSION PICKER — which content packs this hero can draw from. `picked` holds
  // the chosen expansion ids plus the implicit BASE_PICK_ID; it gates every class/origin/domain list below.
  // v0.13.0 item 6: the picker now lives on the CHARACTER SELECT screen, which passes the picks as the
  // `exp` route param (may be '' = base-only). The in-screen picker remains only as the fallback for
  // entry paths that skip the roster (deep links / older routes).
  const params = useLocalSearchParams<{ exp?: string }>();
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
  const [unlockPulse, setUnlockPulse] = useState(0);
  const hadClass = useRef(false);
  const deckIndexes = useRef<Partial<Record<DeckKey, number>>>({});
  const fade = useSharedValue(1);
  const set = useCallback((p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p })), []);

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
        fade.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) });
      }, 620);
    },
    [fade],
  );
  const switchDeck = useCallback(
    (next: DeckKey) => {
      if (next === deck || pendingDeck) return;
      setPendingDeck(next);
      const apply = () => finishFade(next);
      // fade EVERYTHING (cards + the SELECT controls) out before the swap so no button morphs (#150)
      fade.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.quad) }, (finished) => {
        if (finished) runOnJS(apply)();
      });
    },
    [deck, pendingDeck, fade, finishFade],
  );

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  // v0.12.2: the class list the creator offers, gated by the PICKED expansions (base classes always; a
  // Void class only when 'void' is picked). Replaces the old base-only CREATION_CLASS_CARDS module const.
  const creationClassCards = useMemo(
    () => CLASS_CARDS.filter((c) => { const e = classExpansion(c.key); return !e || picked.has(e); }),
    [picked],
  );

  // Pre-render every forged card to a bitmap pair on device (#104 perf): the live components
  // double as the loading state and swap to image cards as each capture lands. Class-card jobs follow the
  // picked set (base-only creation never forges a Void class — no extra work until The Void is chosen).
  const snapshotJobs = useMemo(
    () => [
      ...creationClassCards.map((c) => ({
        key: `class-${c.key}`,
        // deck-wide mark (#110): the class card is page 1 of (1 class + feature pages)
        node: <ForgedCard title={c.title} kindLabel="Class" body={c.body} accentDeep={classColor(c.key).deep} Banner={c.Banner} pageMark={`1/${1 + featurePages(c.key).length}`} classKey={c.key} />,
        // Void banners are expo-image rasters (async decode) — settle before capture or the art zone forges blank.
        raster: isVoidClass(c.key),
      })),
      ...creationClassCards.flatMap((c) => {
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
      }),
      // weapon + armor cards (#121) — vector (no raster settle), forged for LOD perf in the carousel
      ...PRIMARY_WEAPONS.map((w) => ({ key: w.id, node: <ForgedWeaponCard weapon={w} /> })),
      ...SECONDARY_WEAPONS.map((w) => ({ key: w.id, node: <ForgedWeaponCard weapon={w} /> })),
      ...TIER1_ARMOR.map((a) => ({ key: a.id, node: <ForgedArmorCard armor={a} /> })),
    ],
    [creationClassCards],
  );
  const { sources, stage } = useForgedSnapshots(snapshotJobs);

  // Entry loader (#110): hold the veil until the first class card is painted (forged on device,
  // live on web), then a hard fallback so it can never hang.
  const [loaderDone, setLoaderDone] = useState(false);
  const [loaderUp, setLoaderUp] = useState(true);
  const firstClassKey = `class-${creationClassCards[0].key}`;
  useEffect(() => {
    if (loaderDone) return;
    if (Platform.OS === 'web' || sources[firstClassKey]) {
      const t = setTimeout(() => setLoaderDone(true), 260);
      return () => clearTimeout(t);
    }
  }, [sources, loaderDone, firstClassKey]);
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

  const [centerIdx, setCenterIdx] = useState(0);
  const [editingExperience, setEditingExperience] = useState<number | null>(null);
  // Weapons deck UI (#121): which kind of primary to browse, and whether we're picking the primary
  // or the (optional, 1H-only) secondary.
  const [weaponKind, setWeaponKind] = useState<WeaponKind>('physical');
  const [weaponSlot, setWeaponSlot] = useState<'primary' | 'secondary'>('primary');
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
        return false;
      });
      return () => sub.remove();
    }, [editingExperience]),
  );

  // A forged equipment card item: the bitmap pair once captured, the live card meanwhile (#121).
  const forgedItem = useCallback(
    (key: string, label: string, live: ReactNode): StraightItem => {
      const pre = sources[key];
      return pre ? { id: key, label, thumb: pre.thumb, source: pre.full } : { id: key, label, custom: live };
    },
    [sources],
  );

  const items: StraightItem[] = useMemo(() => {
    if (deck === 'weapons') {
      // v0.19.2 item 5: HF (Hope and Fear) starting weapons only when that pack was picked for this hero.
      const base = weaponSlot === 'secondary' ? SECONDARY_WEAPONS : PRIMARY_WEAPONS.filter((w) => w.kind === weaponKind);
      const list = base.filter((w) => !w.expansion || picked.has(w.expansion));
      const cards = list.map((w) => forgedItem(w.id, w.name, <ForgedWeaponCard weapon={w} />));
      // Skip only on the primary slot — a secondary is already optional (v0.10.2).
      return weaponSlot === 'primary' ? [...cards, SKIP_WEAPONS] : cards;
    }
    if (deck === 'armor') {
      return [...TIER1_ARMOR.filter((a) => !a.expansion || picked.has(a.expansion)).map((a) => forgedItem(a.id, a.name, <ForgedArmorCard armor={a} />)), ...(libContent?.armor ?? []).map(libCardItem), SKIP_ARMOR];
    }
    if (deck === 'inventory') {
      // Creation inventory shows ONLY the player's per-class CHOICES (#136): pick two of four, or Skip
      // (v0.10.2). Custom in-creation items were removed — homebrew items come from Library expansions.
      // The default kit (torch/rope/supplies) and gold are NOT shown here — they belong to the sheet.
      const cinv = draft.className ? CLASS_INVENTORY[draft.className] : null;
      const cap = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
      const optionCards: StraightItem[] = (cinv?.choices.flat() ?? []).map((name) => ({
        id: itemOptionId(name),
        label: name,
        custom: <ForgedCard title={itemTitle(name)} kindLabel="Item" body={`${cap(name)}.`} accentDeep={Rune.panel} colorArt={itemColor(name)} multilineTitle />,
      }));
      return [...optionCards, ...(libContent?.inventory ?? []).map(libCardItem), SKIP_INVENTORY];
    }
    if (!isCardDeck(deck)) return [];
    switch (deck) {
      case 'class':
        // Each class card is a FLIP-DECK (#110): face 0 = the class card, then one face per feature
        // page. Tapping the focused card flips through them in 3D — no separate features button.
        return creationClassCards.map((c) => {
          const total = 1 + featurePages(c.key).length;
          const classPre = sources[`class-${c.key}`];
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
      case 'subclass':
        return [
          ...CATALOG.filter((c) => c.kind === 'subclass' && c.className === draft.className && c.tier === 1 && (!c.expansion || picked.has(c.expansion))).map((c) => ({ id: c.id, label: c.label, thumb: c.thumb, source: c.source })),
          ...(libContent?.subclasses ?? []).filter((c) => (!c.tier || c.tier === 1) && (!c.className || c.className === draft.className)).map(libCardItem),
        ];
      case 'ancestry': {
        const base = CATALOG.filter((c) => c.kind === 'ancestry' && (!c.expansion || picked.has(c.expansion))).map((c) => ({ id: c.id, label: c.label, thumb: c.thumb, source: c.source }));
        // #265: the last card flips the mode — "Mixed Ancestry" enters mixed mode, "Single Ancestry" leaves it.
        const toggle: StraightItem = draft.mixedAncestry
          ? { id: SINGLE_ANCESTRY_ID, label: 'Single Ancestry', custom: <ForgedCard title="Single Ancestry" kindLabel="Ancestry" body="Go back to choosing a single ancestry." accentDeep={Rune.panel} colorArt="#2A3340" multilineTitle /> }
          : { id: MIXED_ANCESTRY_ID, label: 'Mixed Ancestry', custom: <ForgedCard title="Mixed Ancestry" kindLabel="Ancestry" body="Combine two ancestries: take the first trait of one and the second trait of the other. Pick two — order decides which trait you keep." accentDeep={Rune.panel} colorArt="#3A2A4A" multilineTitle /> };
        // mixed-ancestry cross-out for STRUCTURED ancestries: first-picked keeps Feature 1 (strike
        // Feature 2), second-picked keeps Feature 2 (strike Feature 1) — mirrors ancestryCrossOuts for
        // the image cards. v0.13.0: the struck FEATURE resolves to its actual section index (features
        // can sit anywhere among the sections) via featureSectionIndexes.
        const mix = draft.mixedAncestry;
        const struckIdx = (lc: LibraryCard): number | undefined =>
          mix?.first === lc.id ? featureSectionIndexes(lc)[1] : mix?.second === lc.id ? featureSectionIndexes(lc)[0] : undefined;
        return [...base, ...(libContent?.ancestries ?? []).map((lc) => libCardItem(lc, struckIdx(lc))), toggle];
      }
      case 'community':
        return [...CATALOG.filter((c) => c.kind === 'community' && (!c.expansion || picked.has(c.expansion))).map((c) => ({ id: c.id, label: c.label, thumb: c.thumb, source: c.source })), ...(libContent?.communities ?? []).map(libCardItem)];
      case 'domains': {
        if (!draft.className) return [];
        const pair = classInfo(draft.className).domains;
        return [
          ...pair.flatMap((d) => CATALOG.filter((c) => c.kind === 'domain' && c.domain === d && c.level === 1 && (!c.expansion || picked.has(c.expansion)))).map((c) => ({ id: c.id, label: c.label, thumb: c.thumb, source: c.source })),
          ...(libContent?.domains ?? []).map(libCardItem),
        ];
      }
    }
  }, [deck, draft.className, draft.mixedAncestry, sources, weaponKind, weaponSlot, forgedItem, libContent, picked, creationClassCards]);

  const selectedIds = useMemo(() => {
    if (deck === 'weapons') {
      if (weaponSlot === 'primary' && draft.weaponsSkipped) return ['weapons-skip'];
      const id = weaponSlot === 'secondary' ? draft.weaponSecondaryId : draft.weaponPrimaryId;
      return id ? [id] : [];
    }
    if (deck === 'armor') return draft.armorSkipped ? ['armor-skip'] : draft.armorId ? [draft.armorId] : [];
    if (deck === 'inventory') return draft.inventorySkipped ? ['inventory-skip'] : [...draft.inventoryItemIds, ...draft.inventoryLibIds]; // gold/start kit are not counted (#128)
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
      case 'community':
        return draft.communityCardId ? [draft.communityCardId] : [];
      case 'domains':
        return draft.domainCardIds;
    }
  }, [deck, draft, weaponSlot]);

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

  const onToggle = useCallback(
    (id: string) => {
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
        set({ armorId: draft.armorId === id ? null : id, armorSkipped: false });
        return;
      }
      if (deck === 'inventory') {
        if (id === 'inventory-skip') { set({ inventorySkipped: !draft.inventorySkipped, inventoryItemIds: [] }); return; }
        // v0.10.3: a homebrew inventory card toggles into the loose picks (no 2-item cap; clears skip).
        if ((libContent?.inventory ?? []).some((c) => c.id === id)) {
          const had = draft.inventoryLibIds.includes(id);
          set({ inventoryLibIds: had ? draft.inventoryLibIds.filter((x) => x !== id) : [...draft.inventoryLibIds, id], inventorySkipped: false });
          return;
        }
        // optional items: pick up to TWO (#136), replacing the oldest like domains. Any pick clears skip.
        const has = draft.inventoryItemIds.includes(id);
        if (has) set({ inventoryItemIds: draft.inventoryItemIds.filter((x) => x !== id) });
        else if (draft.inventoryItemIds.length < 2) set({ inventoryItemIds: [...draft.inventoryItemIds, id], inventorySkipped: false });
        else set({ inventoryItemIds: [draft.inventoryItemIds[1], id], inventorySkipped: false });
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
    [deck, draft, set, weaponSlot, secondaryAllowed, libContent],
  );

  const complete = DECKS.every((d) => deckDone(d.key, draft)) && draft.name.trim().length > 0;

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
    const enabledCustom = libraryCards.filter((c) => (c.effects?.length ?? 0) > 0 || c.contentType === 'armor').map((c) => c.id);
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
    });
    router.replace({ pathname: '/sheet', params: { id } });
  }, [complete, draft, router, libContent, picked]);

  const pickPortrait = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 }); // no forced crop (#155) — positioned in the portrait mask instead
    if (!res.canceled && res.assets[0]) set({ portraitUri: res.assets[0].uri });
  }, [set]);

  const locked = (k: DeckKey) =>
    ((k === 'subclass' || k === 'domains') && !draft.className) || !!DECKS.find((d) => d.key === k)?.stub; // stubs land next issue
  const maxSelect = deck === 'domains' || deck === 'inventory' || (deck === 'ancestry' && !!draft.mixedAncestry) ? 2 : 1;
  const noun = deck === 'weapons' ? weaponSlot : deck === 'class' ? 'class' : deck === 'domains' ? 'card' : deck === 'armor' ? 'armor' : deck;
  const centerItem = items[Math.min(centerIdx, Math.max(0, items.length - 1))];
  const centerSelected = !!centerItem && selectedIds.includes(centerItem.id);

  // v0.10.2 (Feature 2): a per-section Random button. Picks a valid random choice for the CURRENT deck,
  // honoring dependencies (subclass/domains follow the class). Experiences stay manual (freeform text).
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
      case 'inventory': { if (!draft.className) break; const opts = (CLASS_INVENTORY[draft.className]?.choices.flat() ?? []).map(itemOptionId); const picks = two(opts); set({ inventoryItemIds: picks, inventorySkipped: false }); focusId = picks[picks.length - 1]; break; }
    }
    if (focusId) {
      const idx = items.findIndex((it) => it.id === focusId);
      if (idx >= 0) carouselRef.current?.scrollTo(idx);
    }
  }, [deck, draft.className, draft.mixedAncestry, weaponKind, items, set, picked, creationClassCards]);

  return (
    <AppScreen
      title="New hero"
      onBack={() => router.back()}
      headerRight={<RuneButton label="Forge" kind="primary" height={26} dense disabled={!complete} onPress={forge} accessibilityLabel="Create character" />}>
      <View style={{ flex: 1 }}>
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
        <View style={{ marginTop: 12 }}>
          <SectionDivider label="Cards" />
        </View>
        {/* The deck rail (#107, nine steps): fixed-width tabs, free scroll. A thin custom scroll
            indicator (#110) tracks position instead of the old static chevron. */}
        <DeckRail>
          {DECKS.map((d) => (
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
        <View style={{ flex: 1, marginTop: 2 }}>
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
          {isCarouselDeck(deck) && items.length > 0 ? (
            <Animated.View style={[{ flex: 1 }, modeFadeStyle]}>
              <StraightCarousel
                ref={carouselRef}
                key={deck + (deck === 'weapons' ? `${weaponKind}-${weaponSlot}` : deck === 'subclass' || deck === 'domains' ? (draft.className ?? '') : '')}
                items={items}
                selectedIds={selectedIds}
                crossOuts={deck === 'ancestry' ? ancestryCrossOuts : undefined}
                initialIndex={deckIndexes.current[deck] ?? Math.floor(items.length / 2)}
                onIndexChange={(i) => {
                  deckIndexes.current[deck] = i;
                  setCenterIdx(i);
                }}
              />
            </Animated.View>
          ) : null}
          {deck === 'traits' ? <TraitsTab traits={draft.traits} onTraits={(traits) => set({ traits })} spellcastTrait={spellcastTraitForSubclass(draft.subclassCardId ? cardById(draft.subclassCardId)?.subclass : undefined)} /> : null}
          {deck === 'experiences' ? <ExperiencesTab experiences={draft.experiences} onEdit={(slot) => setEditingExperience(slot)} /> : null}
        </Animated.View>
        {pendingDeck ? <DeckLoader /> : null}
        </View>
      </View>
      {editingExperience != null ? (
        <CardEditor
          kindLabel="Experience"
          experienceMode
          modifier={draft.experiences[editingExperience]?.modifier ?? 2}
          initial={draft.experiences[editingExperience] ? { title: draft.experiences[editingExperience].title, text: draft.experiences[editingExperience].text, imageUri: draft.experiences[editingExperience].imageUri, color: draft.experiences[editingExperience].color ?? null, effects: draft.experiences[editingExperience].effects ?? [] } : undefined}
          onCancel={() => setEditingExperience(null)}
          onSave={(d) => {
            const next = [...draft.experiences];
            const existing = next[editingExperience];
            next[editingExperience] = { id: existing?.id ?? `exp-${Date.now().toString(36)}`, title: d.title, text: '', imageUri: d.imageUri, color: d.color, effects: d.effects, modifier: existing?.modifier ?? 2 };
            set({ experiences: next.filter(Boolean) });
            setEditingExperience(null);
          }}
        />
      ) : null}
      {/* ---- THE select controls: the screen's TOP layer (#106) — above the carousel veil AND
          the features reader, never dimmed, always tappable, one spot. Card decks only. Hierarchy
          top-to-bottom (#108): SELECT (primary, biggest) → CLASS FEATURES → the n/n counter. */}
      {isCarouselDeck(deck) ? (
        // Weapons sits its cluster lower (the filter toggles push its carousel down, so the cards
        // reach further into this band) — the buttons must never overlap the carousel (owner).
        <Animated.View style={[{ position: 'absolute', left: 0, right: 0, bottom: deck === 'weapons' ? 40 : 56, zIndex: 600, alignItems: 'center', gap: 6 }, fadeStyle]} pointerEvents="box-none">
          <RuneButton
            label={centerSelected ? 'Deselect' : `Select ${noun}`}
            kind={centerSelected ? 'ghost' : 'primary'}
            height={40}
            muteSfx
            onPress={() => {
              if (!centerItem) return;
              // #258: selecting a card uses the card-select/deselect chime, not the generic tap.
              playSfx(centerSelected ? 'cardDeselect' : 'cardSelect');
              onToggle(centerItem.id);
            }}
            accessibilityLabel={centerSelected ? `Deselect ${centerItem?.label ?? noun}` : `Select ${centerItem?.label ?? noun}`}
          />
          {/* v0.10.2 (Feature 2): roll a random valid choice for this section. */}
          <RuneButton label="Random" kind="ghost" dense height={30} muteSfx onPress={randomize} accessibilityLabel={`Random ${noun}`} />
          {/* v0.10.6: the class/weapons hint tooltips were removed — they pushed these buttons up into
              the card carousel (owner). */}
          <Text style={{ color: (deck === 'inventory' ? draft.inventoryItemIds.length : selectedIds.length) >= maxSelect ? Rune.goldBright : Rune.muted, fontSize: 11, fontFamily: Body.bold, letterSpacing: 1.2 }}>
            {deck === 'inventory' ? `${draft.inventoryItemIds.length}/2` : `${selectedIds.length}/${maxSelect}`}
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
    </AppScreen>
  );
}
