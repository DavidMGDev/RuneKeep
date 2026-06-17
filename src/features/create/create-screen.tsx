import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, Text, TextInput, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { AppScreen } from '@/components/app-screen';
import { CardEditor } from '@/components/card-editor';
import { ChamferBox } from '@/components/chamfer-box';
import { ChamferedImage } from './components/chamfered-image';
import { RuneButton } from '@/components/rune-button';
import { type ClassName, classColor, classInfo } from '@/constants/identity';
import { Body, Rune } from '@/constants/theme';
import { CATALOG } from '@/data/catalog';
import { type TraitKey } from '@/features/character-sheet/character';
import { newCharacterId } from '@/lib/character-file';
import { saveCharacter } from '@/lib/character-store';
import { playSfx } from '@/lib/sfx';
import { CLASS_CARDS } from './components/class-cards';
import { featurePages } from '@/data/class-data';
import { ForgedArmorCard, ForgedCard, ForgedTextCard, ForgedWeaponCard } from './components/forged-card';
import { PRIMARY_WEAPONS, SECONDARY_WEAPONS, TIER1_ARMOR, type WeaponKind, weaponById } from '@/data/equipment-data';
import { CLASS_INVENTORY, itemOptionId, itemTitle } from '@/data/class-inventory-data';
import { itemColor } from '@/data/item-colors';

import { useForgedSnapshots } from './components/forged-snapshots';
import { StraightCarousel, type StraightCarouselHandle, type StraightFace, type StraightItem } from './components/straight-carousel';
import { type DeckKey, type Draft, isCardDeck, isCarouselDeck } from './create-types';
import { DECKS, deckDone, EMPTY, MIXED_ANCESTRY_ID, SINGLE_ANCESTRY_ID } from './create-constants';
import { CreateLoader, DeckLoader } from './create-loaders';
import { DeckRail } from './create-rail';
import { AddItemCard, DeckTab, SectionDivider, Segmented } from './create-ui';
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
export function CreateScreen() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [deck, setDeck] = useState<DeckKey>('class');
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

  // Pre-render every forged card to a bitmap pair on device (#104 perf): the live components
  // double as the loading state and swap to image cards as each capture lands.
  const snapshotJobs = useMemo(
    () => [
      ...CLASS_CARDS.map((c) => ({
        key: `class-${c.key}`,
        // deck-wide mark (#110): the class card is page 1 of (1 class + feature pages)
        node: <ForgedCard title={c.title} kindLabel="Class" body={c.body} accentDeep={classColor(c.key).deep} Banner={c.Banner} pageMark={`1/${1 + featurePages(c.key).length}`} classKey={c.key} />,
      })),
      ...CLASS_CARDS.flatMap((c) => {
        const total = 1 + featurePages(c.key).length;
        return featurePages(c.key).map((p) => ({
          key: `feat-${c.key}-${p.pageIndex}`,
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
    [],
  );
  const { sources, stage } = useForgedSnapshots(snapshotJobs);

  // Entry loader (#110): hold the veil until the first class card is painted (forged on device,
  // live on web), then a hard fallback so it can never hang.
  const [loaderDone, setLoaderDone] = useState(false);
  const [loaderUp, setLoaderUp] = useState(true);
  const firstClassKey = `class-${CLASS_CARDS[0].key}`;
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
  const [editingItem, setEditingItem] = useState<number | 'new' | null>(null); // inventory custom item (#128)
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
        if (editingItem != null) {
          setEditingItem(null);
          return true;
        }
        if (carouselRef.current?.closeIfFullscreen()) return true;
        return false;
      });
      return () => sub.remove();
    }, [editingExperience, editingItem]),
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
      const list = weaponSlot === 'secondary' ? SECONDARY_WEAPONS : PRIMARY_WEAPONS.filter((w) => w.kind === weaponKind);
      return list.map((w) => forgedItem(w.id, w.name, <ForgedWeaponCard weapon={w} />));
    }
    if (deck === 'armor') {
      return TIER1_ARMOR.map((a) => forgedItem(a.id, a.name, <ForgedArmorCard armor={a} />));
    }
    if (deck === 'inventory') {
      // Creation inventory is MANDATORY and shows ONLY the player's CHOICES (#136): the per-class
      // optional items (pick two of the four) + custom items + the "add" card. The default kit
      // (torch/rope/supplies) and gold are NOT shown here — they belong to the sheet.
      const cinv = draft.className ? CLASS_INVENTORY[draft.className] : null;
      const cap = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
      const optionCards: StraightItem[] = (cinv?.choices.flat() ?? []).map((name) => ({
        id: itemOptionId(name),
        label: name,
        custom: <ForgedCard title={itemTitle(name)} kindLabel="Item" body={`${cap(name)}.`} accentDeep={Rune.panel} colorArt={itemColor(name)} multilineTitle />,
      }));
      const customs: StraightItem[] = draft.inventoryCustom.map((it) => ({
        id: it.id,
        label: it.title || 'Item',
        custom: <ForgedCard title={it.title || 'Item'} kindLabel="Item" body={it.text} accentDeep={Rune.panel} imageUri={it.imageUri} colorArt={it.color} multilineTitle />,
      }));
      const add: StraightItem = { id: 'item-add', label: 'Add item', custom: <AddItemCard /> };
      return [...optionCards, ...customs, add];
    }
    if (!isCardDeck(deck)) return [];
    switch (deck) {
      case 'class':
        // Each class card is a FLIP-DECK (#110): face 0 = the class card, then one face per feature
        // page. Tapping the focused card flips through them in 3D — no separate features button.
        return CLASS_CARDS.map((c) => {
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
        return CATALOG.filter((c) => c.kind === 'subclass' && c.className === draft.className && c.tier === 1).map((c) => ({ id: c.id, label: c.label, thumb: c.thumb, source: c.source }));
      case 'ancestry': {
        const base = CATALOG.filter((c) => c.kind === 'ancestry').map((c) => ({ id: c.id, label: c.label, thumb: c.thumb, source: c.source }));
        // #265: the last card flips the mode — "Mixed Ancestry" enters mixed mode, "Single Ancestry" leaves it.
        const toggle: StraightItem = draft.mixedAncestry
          ? { id: SINGLE_ANCESTRY_ID, label: 'Single Ancestry', custom: <ForgedCard title="Single Ancestry" kindLabel="Ancestry" body="Go back to choosing a single ancestry." accentDeep={Rune.panel} colorArt="#2A3340" multilineTitle /> }
          : { id: MIXED_ANCESTRY_ID, label: 'Mixed Ancestry', custom: <ForgedCard title="Mixed Ancestry" kindLabel="Ancestry" body="Combine two ancestries: take the first trait of one and the second trait of the other. Pick two — order decides which trait you keep." accentDeep={Rune.panel} colorArt="#3A2A4A" multilineTitle /> };
        return [...base, toggle];
      }
      case 'community':
        return CATALOG.filter((c) => c.kind === 'community').map((c) => ({ id: c.id, label: c.label, thumb: c.thumb, source: c.source }));
      case 'domains': {
        if (!draft.className) return [];
        const pair = classInfo(draft.className).domains;
        return pair.flatMap((d) => CATALOG.filter((c) => c.kind === 'domain' && c.domain === d && c.level === 1)).map((c) => ({ id: c.id, label: c.label, thumb: c.thumb, source: c.source }));
      }
    }
  }, [deck, draft.className, draft.inventoryCustom, draft.mixedAncestry, sources, weaponKind, weaponSlot, forgedItem]);

  const selectedIds = useMemo(() => {
    if (deck === 'weapons') {
      const id = weaponSlot === 'secondary' ? draft.weaponSecondaryId : draft.weaponPrimaryId;
      return id ? [id] : [];
    }
    if (deck === 'armor') return draft.armorId ? [draft.armorId] : [];
    if (deck === 'inventory') return [...draft.inventoryItemIds, ...draft.inventoryCustom.map((i) => i.id)]; // auto-owned start items + gold are NOT counted/selected (#128)
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
        if (weaponSlot === 'secondary') {
          if (!secondaryAllowed) return; // only a 1H primary may carry a secondary
          set({ weaponSecondaryId: draft.weaponSecondaryId === id ? null : id });
        } else {
          if (draft.weaponPrimaryId === id) {
            set({ weaponPrimaryId: null, weaponSecondaryId: null });
          } else {
            const w = weaponById(id);
            // a Two-Handed primary leaves no hand for a secondary → clear it
            set({ weaponPrimaryId: id, ...(w?.burden === 'Two-Handed' ? { weaponSecondaryId: null } : {}) });
          }
        }
        return;
      }
      if (deck === 'armor') {
        set({ armorId: draft.armorId === id ? null : id });
        return;
      }
      if (deck === 'inventory') {
        if (id === 'item-add') {
          setEditingItem('new');
          return;
        }
        const ci = draft.inventoryCustom.findIndex((i) => i.id === id);
        if (ci >= 0) {
          setEditingItem(ci); // tap a custom item to edit it
          return;
        }
        // optional items: pick up to TWO (#136), replacing the oldest like domains
        const has = draft.inventoryItemIds.includes(id);
        if (has) set({ inventoryItemIds: draft.inventoryItemIds.filter((x) => x !== id) });
        else if (draft.inventoryItemIds.length < 2) set({ inventoryItemIds: [...draft.inventoryItemIds, id] });
        else set({ inventoryItemIds: [draft.inventoryItemIds[1], id] });
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
    [deck, draft, set, weaponSlot, secondaryAllowed],
  );

  const complete = DECKS.every((d) => deckDone(d.key, draft)) && draft.name.trim().length > 0;

  const forge = useCallback(async () => {
    if (!complete || !draft.className) return;
    const id = newCharacterId();
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
      weaponPrimaryId: draft.weaponPrimaryId!,
      weaponSecondaryId: draft.weaponSecondaryId,
      armorId: draft.armorId!,
      inventoryItemIds: draft.inventoryItemIds,
      inventoryCustom: draft.inventoryCustom,
      gold: draft.gold,
      level: 1,
    });
    router.replace({ pathname: '/sheet', params: { id } });
  }, [complete, draft, router]);

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
  const centerInvAdd = deck === 'inventory' && centerItem?.id === 'item-add';
  const centerInvCustom = deck === 'inventory' && draft.inventoryCustom.some((i) => i.id === centerItem?.id);

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
          {deck === 'traits' ? <TraitsTab traits={draft.traits} onTraits={(traits) => set({ traits })} /> : null}
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
      {editingItem != null ? (
        <CardEditor
          kindLabel="Item"
          initial={typeof editingItem === 'number' && draft.inventoryCustom[editingItem] ? { title: draft.inventoryCustom[editingItem].title, text: draft.inventoryCustom[editingItem].text, imageUri: draft.inventoryCustom[editingItem].imageUri, color: draft.inventoryCustom[editingItem].color ?? null, effects: draft.inventoryCustom[editingItem].effects ?? [] } : undefined}
          onCancel={() => setEditingItem(null)}
          onSave={(d) => {
            const next = [...draft.inventoryCustom];
            if (editingItem === 'new') next.push({ id: `itm-${Date.now().toString(36)}`, title: d.title, text: d.text, imageUri: d.imageUri, color: d.color, effects: d.effects });
            else next[editingItem] = { ...next[editingItem], title: d.title, text: d.text, imageUri: d.imageUri, color: d.color, effects: d.effects };
            set({ inventoryCustom: next });
            setEditingItem(null);
          }}
        />
      ) : null}
      {/* ---- THE select controls: the screen's TOP layer (#106) — above the carousel veil AND
          the features reader, never dimmed, always tappable, one spot. Card decks only. Hierarchy
          top-to-bottom (#108): SELECT (primary, biggest) → CLASS FEATURES → the n/n counter. */}
      {isCarouselDeck(deck) ? (
        <Animated.View style={[{ position: 'absolute', left: 0, right: 0, bottom: 56, zIndex: 600, alignItems: 'center', gap: 6 }, fadeStyle]} pointerEvents="box-none">
          <RuneButton
            label={centerInvAdd ? 'Create item' : centerInvCustom ? 'Edit item' : centerSelected ? 'Deselect' : `Select ${noun}`}
            kind={centerSelected && !centerInvAdd && !centerInvCustom ? 'ghost' : 'primary'}
            height={40}
            muteSfx
            onPress={() => {
              if (!centerItem) return;
              // #258: selecting a card uses the card-select/deselect chime, not the generic tap.
              if (centerInvAdd || centerInvCustom) playSfx('buttonTap');
              else playSfx(centerSelected ? 'cardDeselect' : 'cardSelect');
              onToggle(centerItem.id);
            }}
            accessibilityLabel={centerInvAdd ? 'Create a custom item' : centerInvCustom ? 'Edit item' : centerSelected ? `Deselect ${centerItem?.label ?? noun}` : `Select ${centerItem?.label ?? noun}`}
          />
          {deck === 'class' ? (
            <Text style={{ color: Rune.muted, fontSize: 9.5, fontFamily: Body.medium, letterSpacing: 0.4 }}>Tap the card to flip through its features</Text>
          ) : null}
          {deck === 'weapons' ? (
            <Text style={{ color: Rune.muted, fontSize: 9.5, fontFamily: Body.medium, letterSpacing: 0.4, textAlign: 'center' }}>
              {primaryWeapon ? (secondaryAllowed ? 'One-handed primary — a secondary is optional' : 'Two-handed primary — no secondary') : 'Pick a primary weapon'}
            </Text>
          ) : null}
          <Text style={{ color: (deck === 'inventory' ? draft.inventoryItemIds.length : selectedIds.length) >= maxSelect ? Rune.goldBright : Rune.muted, fontSize: 11, fontFamily: Body.bold, letterSpacing: 1.2 }}>
            {deck === 'inventory' ? `${draft.inventoryItemIds.length}/2` : `${selectedIds.length}/${maxSelect}`}
          </Text>
        </Animated.View>
      ) : null}
      {stage}
      {loaderUp ? <CreateLoader done={loaderDone} onHidden={() => setLoaderUp(false)} /> : null}
    </AppScreen>
  );
}
