import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';

import { ArtImage } from '@/components/art-image';
import { AppScreen } from '@/components/app-screen';
import { FilterBand } from '@/components/filter-band';
import { ChamferBox } from '@/components/chamfer-box';
import { LoadingScreen } from '@/components/loading-screen';
import { gridColumns, useLayout } from '@/hooks/use-layout';
import { RuneChip } from './components/rune-chip';
import { classColor, type DomainName, DomainColors } from '@/constants/identity';
import { Body, Rune } from '@/constants/theme';
import { playSfx } from '@/lib/sfx';
import { catalogFor, classExpansion, globallyEnabledExpansionIds } from '@/lib/expansions';
import { type CatalogCard, type CatalogKind } from '@/data/catalog';
import { featurePages } from '@/data/class-data';
import { ALL_ARMOR, ALL_WEAPONS, type ArmorDef, type WeaponDef } from '@/data/equipment-data';
import { ALL_LOOT, type LootDef } from '@/data/loot-data';
import { FORGED_H, FORGED_W, ForgedArmorCard, ForgedCard, ForgedLootCard, ForgedTextCard, ForgedWeaponCard } from '@/features/create/components/forged-card';
import { CLASS_CARDS, type ClassCardDef } from '@/features/create/components/class-cards';
import { NfcSendModal } from '@/features/share/nfc-modal';
import { focusHaptic } from '@/lib/haptics';
import { type Expansion, type LibraryCard, type LibraryContentType } from '@/lib/library';
import { listExpansions } from '@/lib/library-store';
import { isEnabledForCreation } from '@/lib/library';
import { LibraryForgedCard } from '@/features/create/components/library-forged-card';
import { imageForPrint, type PdfCard } from '@/lib/card-pdf';
import { PrintableImage, PrintStage, type PrintStageHandle } from '@/features/create/components/print-stage';
import { usePrintJob } from '@/features/share/print-job';
import { type RkpContent } from '@/lib/rkp';
import { useScreenDim } from '@/lib/screen-dim';

// The archive browses catalog cards AND equipment. Weapons/armor have no image assets — they render
// live via the forged components — so the grid item is a union (v0.10.0, owner: "all weapons and armor
// for all tiers" were missing because the gallery only ever read CATALOG).
// v0.14.1: loot + consumables were missing here for the same reason weapons/armor once were — the
// archive only read CATALOG and the equipment arrays. They browse and share like equipment.
type GalleryKind = CatalogKind | 'weapon' | 'armor' | 'class' | 'loot' | 'consumable';
type GalleryItem =
  | { type: 'card'; id: string; label: string; card: CatalogCard }
  /** v0.32.2: a card from an installed expansion. It lives in whichever kind its content is, not in a
   *  Homebrew corner of its own, so a custom weapon is found by looking under Weapons. */
  | { type: 'lib'; id: string; label: string; lib: LibraryCard }
  | { type: 'weapon'; id: string; label: string; weapon: WeaponDef }
  | { type: 'armor'; id: string; label: string; armor: ArmorDef }
  | { type: 'loot'; id: string; label: string; loot: LootDef }
  | { type: 'class'; id: string; label: string; def: ClassCardDef };

const KINDS: { key: GalleryKind; label: string }[] = [
  { key: 'domain', label: 'Domains' },
  { key: 'ancestry', label: 'Ancestry' },
  { key: 'community', label: 'Community' },
  { key: 'class', label: 'Class' },
  { key: 'subclass', label: 'Subclass' },
  { key: 'transformation', label: 'Transformations' },
  { key: 'weapon', label: 'Weapons' },
  { key: 'armor', label: 'Armor' },
  { key: 'loot', label: 'Loot' },
  { key: 'consumable', label: 'Consumables' },
];
const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const TIERS = [1, 2, 3, 4];

interface Filters {
  kinds: Set<GalleryKind>;
  domains: Set<DomainName>;
  levels: Set<number>;
  tiers: Set<number>; // tier 1–4, equipment only
  /** v0.32.2: where the card came from. Empty = both, which is the default and stays it. */
  sources: Set<'official' | 'homebrew'>;
  /**
   * v0.35.2 (owner): WHICH pack, by expansion id, with the base game as `base`.
   *
   * Every card in the archive belongs to exactly one, and the archive already shows several packs at
   * once, so "show me only what The Void added" had no way to be asked before. Empty = all of them.
   */
  packs: Set<string>;
}

/** The pack a finished grid item belongs to. Derived at the end rather than threaded through each
 *  branch above, because every branch already knows its own expansion field and none of them agree
 *  on where it lives. */
function packOfItem(it: GalleryItem, libPack: Map<string, string>): string {
  switch (it.type) {
    case 'card': return it.card.expansion ?? BASE_PACK;
    case 'weapon': return it.weapon.expansion ?? BASE_PACK;
    case 'armor': return it.armor.expansion ?? BASE_PACK;
    case 'loot': return it.loot.expansion ?? BASE_PACK;
    case 'class': return classExpansion(it.def.key) ?? BASE_PACK;
    case 'lib': return libPack.get(it.lib.id) ?? BASE_PACK;
  }
}

/** The base game is not an expansion, but it IS a pack you can filter to. */
export const BASE_PACK = 'base';

/** The gallery kind an installed expansion card belongs under. `generic` has no macro home of its own,
 *  so it joins Loot, the archive's bucket for what you carry (v0.32.2). */
export function libraryKind(t: LibraryContentType): GalleryKind {
  return t === 'weapon' ? 'weapon' : t === 'armor' ? 'armor' : t === 'inventory' || t === 'generic' ? 'loot' : (t as GalleryKind);
}

function applyFilters(f: Filters, catalog: CatalogCard[], enabledExp: Set<string>, library: LibraryCard[] = [], libPack: Map<string, string> = new Map()): GalleryItem[] {
  const wantKind = (k: GalleryKind) => !f.kinds.size || f.kinds.has(k);
  const wantSource = (src: 'official' | 'homebrew') => !f.sources.size || f.sources.has(src);
  // domains/levels are catalog-domain dimensions; tiers is an equipment dimension. Selecting one set
  // narrows to that family (mirrors the existing level→domain behavior).
  const catalogDim = f.domains.size > 0 || f.levels.size > 0;
  const equipDim = f.tiers.size > 0;
  const out: GalleryItem[] = [];
  if (!equipDim && wantSource('official')) {
    for (const c of catalog) {
      if (!wantKind(c.kind)) continue;
      if (f.domains.size && (c.kind !== 'domain' || !f.domains.has(c.domain!))) continue;
      if (f.levels.size && (c.kind !== 'domain' || !f.levels.has(c.level!))) continue;
      out.push({ type: 'card', id: c.id, label: c.label, card: c });
    }
  }
  // Class cards (v0.10.2): forged multi-page cards, not in CATALOG. They're neither a catalog-domain nor
  // an equipment dimension, so they show only when no domain/level/tier filter is narrowing the grid.
  // v0.13.0: expansion classes (the Void six) show only when their pack is globally enabled.
  if (!catalogDim && !equipDim && wantKind('class') && wantSource('official')) {
    for (const c of CLASS_CARDS) {
      const exp = classExpansion(c.key);
      if (exp && !enabledExp.has(exp)) continue;
      out.push({ type: 'class', id: `class-${c.key}`, label: c.title, def: c });
    }
  }
  if (!catalogDim && wantKind('weapon') && wantSource('official')) {
    for (const w of ALL_WEAPONS) {
      if (w.expansion && !enabledExp.has(w.expansion)) continue; // v0.19.2 item 5: HF gear needs its pack enabled
      if (f.tiers.size && !f.tiers.has(w.tier)) continue;
      out.push({ type: 'weapon', id: w.id, label: w.name, weapon: w });
    }
  }
  if (!catalogDim && wantKind('armor') && wantSource('official')) {
    for (const a of ALL_ARMOR) {
      if (a.expansion && !enabledExp.has(a.expansion)) continue;
      if (f.tiers.size && !f.tiers.has(a.tier)) continue;
      out.push({ type: 'armor', id: a.id, label: a.name, armor: a });
    }
  }
  // v0.14.1: loot has NO tier and no domain/level (the rulebook indexes it by table roll), so it shows
  // only when neither dimension is narrowing the grid — the same guard the class cards use.
  if (!catalogDim && !equipDim && wantSource('official')) {
    for (const l of ALL_LOOT) {
      if (l.expansion && !enabledExp.has(l.expansion)) continue;
      if (!wantKind(l.kind)) continue;
      out.push({ type: 'loot', id: l.id, label: l.name, loot: l });
    }
  }
  // Installed expansions, filed under the kind their content belongs to (v0.32.2). Tier applies to
  // custom gear the same way it does to published gear; the domain/level axes apply to custom domains.
  if (wantSource('homebrew')) {
    for (const c of library) {
      const k = libraryKind(c.contentType);
      if (!wantKind(k)) continue;
      if (f.tiers.size) {
        const t = c.weapon?.tier ?? c.armor?.tier;
        if (t == null || !f.tiers.has(t)) continue;
      } else if (equipDim) continue;
      if (f.domains.size && (c.contentType !== 'domain' || !c.domain || !f.domains.has(c.domain as DomainName))) continue;
      if (f.levels.size && (c.contentType !== 'domain' || c.level == null || !f.levels.has(c.level))) continue;
      out.push({ type: 'lib', id: c.id, label: c.title || 'Untitled', lib: c });
    }
  }
  return f.packs.size ? out.filter((it) => f.packs.has(packOfItem(it, libPack))) : out;
}

/** A forged equipment card (no image asset) scaled to fill `width`, clipped to the 5:7 cell. */
function ScaledForged({ item, width }: { item: Extract<GalleryItem, { type: 'weapon' | 'armor' | 'loot' }>; width: number }) {
  const s = width / FORGED_W;
  const h = FORGED_H * s;
  return (
    <View style={{ width, height: h, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', left: (width - FORGED_W) / 2, top: (h - FORGED_H) / 2, width: FORGED_W, height: FORGED_H, transform: [{ scale: s }] }}>
        {item.type === 'weapon' ? <ForgedWeaponCard weapon={item.weapon} /> : item.type === 'armor' ? <ForgedArmorCard armor={item.armor} /> : <ForgedLootCard loot={item.loot} />}
      </View>
    </View>
  );
}

/** Scale an arbitrary forged card node to fill `width`, clipped to the 5:7 cell (class-card thumbnails). */
function ScaledCard({ width, children }: { width: number; children: ReactNode }) {
  const s = width / FORGED_W;
  const h = FORGED_H * s;
  return (
    <View style={{ width, height: h, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', left: (width - FORGED_W) / 2, top: (h - FORGED_H) / 2, width: FORGED_W, height: FORGED_H, transform: [{ scale: s }] }}>
        {children}
      </View>
    </View>
  );
}

/**
 * Fullscreen reader for a multi-page CLASS card (v0.10.2): a horizontal pager over [class face, ...feature
 * pages], reusing the same ForgedCard/ForgedTextCard the creator forges. Tap anywhere (veil or a face) to
 * close; swipe left/right to page through the class's rules.
 */
function ClassReader({ def, onClose }: { def: ClassCardDef; onClose: () => void }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withSpring(1, { damping: 18, stiffness: 120, mass: 0.9 });
  }, [p]);
  const close = useCallback(() => {
    p.value = withTiming(0, { duration: 160 }, (fin) => {
      if (fin) runOnJS(onClose)();
    });
  }, [p, onClose]);
  const veil = useAnimatedStyle(() => ({ opacity: p.value * 0.9 }));
  // v0.24.1: declare it so the tablet margins darken with the screen (lib/screen-dim).
  useScreenDim(0.9);
  const pagerStyle = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 40 }] }));
  const { width, height } = useLayout();
  const w = Math.min(width - 36, (height - 160) * (5 / 7));
  const h = w * 1.4;
  const s = w / FORGED_W;
  const pages = featurePages(def.key);
  const total = 1 + pages.length;
  const deep = classColor(def.key).deep;
  const faces: ReactNode[] = [
    <ForgedCard key="face-0" title={def.title} kindLabel="Class" body={def.body} accentDeep={deep} Banner={def.Banner} pageMark={`1/${total}`} classKey={def.key} />,
    ...pages.map((pg) => <ForgedTextCard key={`face-${pg.pageIndex + 1}`} title={def.title} kindLabel="Features" pageMark={`${pg.pageIndex + 2}/${total}`} sections={pg.sections} accentDeep={deep} Banner={def.Banner} classKey={def.key} />),
  ];
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 100 }}>
      <Pressable style={{ flex: 1 }} onPress={close} accessibilityRole="button" accessibilityLabel="Close card">
        <Animated.View style={[{ flex: 1, backgroundColor: '#06080d' }, veil]} />
      </Pressable>
      <Animated.View pointerEvents="box-none" style={[{ position: 'absolute', top: '50%', left: 0, right: 0, marginTop: -h / 2, height: h }, pagerStyle]}>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }}>
          {faces.map((face, i) => (
            <Pressable key={i} onPress={close} style={{ width, height: h, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: w, height: h, overflow: 'hidden' }}>
                <View style={{ position: 'absolute', left: (w - FORGED_W) / 2, top: (h - FORGED_H) / 2, width: FORGED_W, height: FORGED_H, transform: [{ scale: s }] }}>{face}</View>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

/** v0.13.1 (#357): a DM shares any archive card by holding the fullscreened card — same hold feel as
 *  enabling a carousel card. Catalog cards travel as a tiny catalog-reference payload (the receiving
 *  phone resolves the id against its own bundled catalog for the real art); equipment travels with its
 *  full structured stats. */
function toShareCard(item: Extract<GalleryItem, { type: 'card' | 'weapon' | 'armor' | 'loot' }>): LibraryCard {
  // v0.14.1: loot travels as a reference (like catalog cards) — the receiving phone resolves the id
  // against its own bundled loot table, so it lands as REAL loot with its chest/flask card, not a
  // flattened inventory note. The text/effects ride along as a fallback for an older receiver.
  if (item.type === 'loot') {
    const l = item.loot;
    return {
      id: `share-${l.id}`, contentType: 'inventory', title: l.name, imageUri: null,
      effects: l.effects ?? [], text: l.text, catalogId: l.id,
      typeLabel: l.kind === 'consumable' ? 'Consumable' : 'Loot',
    };
  }
  if (item.type === 'weapon') {
    const w = item.weapon;
    return {
      id: `share-${w.id}`, contentType: 'weapon', title: w.name, imageUri: null, effects: w.effects,
      text: w.feature ? `**${w.feature.name}:** ${w.feature.text}` : '',
      weapon: { trait: w.trait, range: w.range, damage: w.damage, damageType: w.damageType, burden: w.burden, kind: w.kind, slot: w.slot, tier: w.tier },
    };
  }
  if (item.type === 'armor') {
    const a = item.armor;
    return {
      id: `share-${a.id}`, contentType: 'armor', title: a.name, imageUri: null, effects: a.effects,
      text: a.feature ? `**${a.feature.name}:** ${a.feature.text}` : '',
      armor: { baseScore: a.baseScore, thresholds: a.thresholds, tier: a.tier },
    };
  }
  const c = item.card;
  const kindMap: Partial<Record<CatalogKind, LibraryContentType>> = { domain: 'domain', ancestry: 'ancestry', community: 'community', subclass: 'subclass' };
  return {
    id: `share-${c.id}`, contentType: kindMap[c.kind] ?? 'generic', title: c.label, text: '', imageUri: null,
    catalogId: c.id, domain: c.domain, level: c.level,
    ...(kindMap[c.kind] ? {} : { typeLabel: cap(c.kind) }),
  };
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Fullscreen reader: full-res card over a dim veil; tap or swipe-down closes (the sheet's focus feel).
 *  v0.13.1: hold the card to share it via NFC (`onHoldShare`) — the carousel's bottom-to-top gold fill. */
function CardReader({ card, onClose, onHoldShare }: { card: Extract<GalleryItem, { type: 'card' | 'lib' | 'weapon' | 'armor' | 'loot' }>; onClose: () => void; onHoldShare: () => void }) {
  const p = useSharedValue(0);
  const dragY = useSharedValue(0);
  useEffect(() => {
    p.value = withSpring(1, { damping: 18, stiffness: 120, mass: 0.9 });
  }, [p]);
  const close = useCallback(() => {
    dragY.value = withTiming(0, { duration: 160 });
    p.value = withTiming(0, { duration: 160 }, (fin) => {
      if (fin) runOnJS(onClose)();
    });
  }, [p, dragY, onClose]);
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => {
          dragY.value = Math.max(0, e.translationY);
        })
        .onEnd((e) => {
          if (e.translationY > 70 || e.velocityY > 600) runOnJS(close)();
          else dragY.value = withSpring(0, { damping: 18, stiffness: 160 });
        }),
    [dragY, close],
  );
  // Hold-to-share (#357): the carousel's hold-to-toggle scan fill, verbatim feel — 760ms quartic
  // ease-in so a tap never visibly starts the fill; any real movement (the close pan) cancels it.
  const holdProgress = useSharedValue(0);
  const commitShare = useCallback(() => { focusHaptic(); playSfx('cardEnable'); onHoldShare(); }, [onHoldShare]);
  const hold = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(760)
        .maxDistance(12)
        .onBegin(() => {
          'worklet';
          holdProgress.value = withTiming(1, { duration: 760, easing: Easing.in(Easing.poly(4)) });
        })
        .onStart(() => {
          'worklet';
          holdProgress.value = withTiming(0, { duration: 240 });
          runOnJS(commitShare)();
        })
        .onFinalize(() => {
          'worklet';
          cancelAnimation(holdProgress);
          if (holdProgress.value !== 0) holdProgress.value = withTiming(0, { duration: 160 });
        }),
    [holdProgress, commitShare],
  );
  const { width: winW, height: winH } = useLayout();
  const cardH = Math.min(winW - 36, (winH - 160) * (5 / 7)) * 1.4;
  const fillStyle = useAnimatedStyle(() => ({ height: holdProgress.value * cardH, opacity: Math.min(1, holdProgress.value * 14) }));
  const veil = useAnimatedStyle(() => ({ opacity: p.value * 0.88 }));
  // v0.24.1: declare it so the tablet margins darken with the screen (lib/screen-dim).
  useScreenDim(0.88);
  const cardStyle = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * 60 + dragY.value }, { scale: 0.92 + p.value * 0.08 }],
  }));
  const { width, height } = useLayout();
  const w = Math.min(width - 36, (height - 160) * (5 / 7));
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 100 }}>
      <Pressable style={{ flex: 1 }} onPress={close} accessibilityRole="button" accessibilityLabel="Close card">
        <Animated.View style={[{ flex: 1, backgroundColor: '#06080d' }, veil]} />
      </Pressable>
      <GestureDetector gesture={Gesture.Race(hold, pan)}>
        <Animated.View
          pointerEvents="box-only"
          style={[{ position: 'absolute', alignSelf: 'center', top: '50%', marginTop: -(w * 1.4) / 2, width: w, height: w * 1.4 }, cardStyle]}>
          <Pressable style={{ flex: 1 }} onPress={close}>
            {card.type === 'card' ? (
              <ArtImage source={card.card.source} fit="contain" />
            ) : card.type === 'lib' ? (
              <ScaledCard width={w}><LibraryForgedCard card={card.lib} /></ScaledCard>
            ) : (
              <ScaledForged item={card} width={w} />
            )}
          </Pressable>
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(224,181,99,0.26)' }, fillStyle]}>
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2.5, backgroundColor: Rune.goldBright }} />
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/**
 * The card library: every card, scrolling forever; filter chips in a collapsible drawer on top.
 * LOD thumbs in the grid; full-res only in the reader. Accepts initial filters via route params
 * (the creation flow deep-links here with all level-1 domain cards preselected).
 */
/**
 * One card in the grid, memoized (v0.27.2).
 *
 * `renderItem` was an inline arrow, so every mounted cell in a list of a thousand re-rendered
 * whenever anything on the screen changed: opening the drawer, tapping a chip, the count in the
 * header. The equipment and class cells are the expensive ones, since each is a live forged card
 * rather than a picture, so the whole archive was paying that price for a state change that had
 * nothing to do with any of them.
 */
const GalleryCell = memo(function GalleryCell({ item, cellW, cellH, selecting, selected, onOpen, onHold }: { item: GalleryItem; cellW: number; cellH: number; selecting?: boolean; selected?: boolean; onOpen: (item: GalleryItem) => void; onHold?: (item: GalleryItem) => void }) {
  return (
    <Pressable
      onPress={() => onOpen(item)}
      onLongPress={onHold ? () => onHold(item) : undefined}
      delayLongPress={420}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={selecting ? `${item.label}, ${selected ? 'selected' : 'not selected'}` : `${item.label}, open card`}
      style={{ width: cellW }}>
      <View style={{ width: cellW, height: cellH, opacity: selecting && !selected ? 0.55 : 1 }}>
        {item.type === 'card' ? (
          <ArtImage source={item.card.thumb} fit="contain" recyclingKey={item.id} />
        ) : item.type === 'lib' ? (
          <ScaledCard width={cellW}><LibraryForgedCard card={item.lib} /></ScaledCard>
        ) : item.type === 'class' ? (
          <ScaledCard width={cellW}>
            <ForgedCard title={item.def.title} kindLabel="Class" body={item.def.body} accentDeep={classColor(item.def.key).deep} Banner={item.def.Banner} classKey={item.def.key} />
          </ScaledCard>
        ) : (
          <ScaledForged item={item} width={cellW} />
        )}
        {/* v0.35: the check rides the art, not the label, so a long name cannot push it off. */}
        {selected ? (
          <View style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: Rune.red, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={12} height={12} viewBox="0 0 12 12"><Polyline points="2,6 5,9 10,3" fill="none" stroke={Rune.ivory} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={{ color: selected ? Rune.goldBright : Rune.muted, fontSize: 10, fontFamily: Body.medium, letterSpacing: 0.4, textAlign: 'center', marginTop: 4 }}>
        {item.label}
      </Text>
    </Pressable>
  );
});

/**
 * One filter axis: a name, then its chips on a single line you can scroll sideways (v0.27.2).
 *
 * The drawer used to be four unlabelled bands of wrapped chips, about 344 dp of them, which left less
 * than two rows of cards visible underneath: you could not see what a chip had done without closing
 * the thing you had just used. Nothing said what any band was for either, and a level chip sat beside
 * a tier chip looking identical.
 *
 * Naming the axes lets the numbers lose their prefixes ("L1" and "Tier 1" become 1 and 1 under
 * "Level" and "Tier"), which is what makes each band fit on one line in the first place.
 */
export function GalleryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kinds?: string; levels?: string; domains?: string }>();
  const [ready, setReady] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [reading, setReading] = useState<GalleryItem | null>(null);
  // v0.13.1 (#357): hold-to-share — the NFC send panel for the held card (DMs granting cards).
  const [nfcSend, setNfcSend] = useState<{ content: RkpContent; label: string; items?: GalleryItem[] } | null>(null);
  /**
   * v0.35 (owner): SELECT mode, next to the filters.
   *
   * A DM handing three cards to a player did it three times, because the only way to share from here
   * was to open one card and hold it. Tapping selects now, and holding any selected card shares the
   * lot through the same panel a single card uses.
   */
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2200);
    return () => clearTimeout(t);
  }, [notice]);
  const onHoldShare = useCallback(() => {
    const r = reading;
    if (!r || r.type === 'class') return;
    // v0.30.0: no longer refused without an NFC radio. The panel offers a `.rune` export instead,
    // which is the only way a browser could ever share one of these.
    const payload = r.type === 'lib' ? r.lib : toShareCard(r);
    setNfcSend({ content: { kind: 'card', payload }, label: payload.title || 'card' });
  }, [reading]);
  const [filters, setFilters] = useState<Filters>(() => ({
    sources: new Set(),
    kinds: new Set((params.kinds?.split(',').filter(Boolean) as GalleryKind[]) ?? []),
    domains: new Set((params.domains?.split(',').filter(Boolean) as DomainName[]) ?? []),
    levels: new Set(params.levels?.split(',').filter(Boolean).map(Number) ?? []),
    tiers: new Set<number>(),
    packs: new Set<string>(),
  }));
  const clearFilters = useCallback(() => setFilters({ kinds: new Set(), domains: new Set(), levels: new Set(), tiers: new Set(), sources: new Set(), packs: new Set() }), []);
  // v0.13.0: the archive respects the GLOBAL expansion toggles — Void cards (and their Blood/Dread
  // filter chips) appear only while The Void is enabled in the Card Library.
  const [enabledExp, setEnabledExp] = useState<Set<string> | null>(null);
  useEffect(() => {
    let live = true;
    globallyEnabledExpansionIds().then((s) => { if (live) setEnabledExp(s); }).catch(() => { if (live) setEnabledExp(new Set()); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    // v0.27.2: a frame, not a quarter of a second. The delay was there to let the grid build behind a
    // loader, but with the list windowed there is no longer a burst of work to hide, and a fixed wait
    // is a cost every single visit pays whether or not there was anything to wait for.
    const t = setTimeout(() => setReady(true), 16);
    return () => clearTimeout(t);
  }, []);

  const gated = useMemo(() => catalogFor(enabledExp ?? new Set()), [enabledExp]);
  // Domain chips derive from the gated catalog (base order preserved; Void domains join at the end).
  const domainChips = useMemo(() => [...new Set(gated.filter((c) => c.kind === 'domain' && c.domain).map((c) => c.domain!))], [gated]);
  // v0.32.2: the archive shows INSTALLED EXPANSIONS too, filed under the kind their content belongs
  // to. It only ever listed bundled cards, so a homebrew weapon was invisible here however you filtered.
  const [library, setLibrary] = useState<LibraryCard[]>([]);
  /** v0.35.2: which pack each installed card came from, and the packs themselves for the chips. The
   *  flat card list loses the expansion it belonged to, which is exactly what the filter needs. */
  const [libPack, setLibPack] = useState<Map<string, string>>(() => new Map());
  const [packs, setPacks] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    let live = true;
    void listExpansions().then((exps) => {
      if (!live) return;
      const on = exps.filter(isEnabledForCreation);
      setLibrary(on.flatMap((e) => e.cards));
      setLibPack(new Map(on.flatMap((e) => e.cards.map((c) => [c.id, e.id] as const))));
      setPacks([{ id: BASE_PACK, name: 'Base game' }, ...on.map((e) => ({ id: e.id, name: e.name }))]);
    });
    return () => { live = false; };
  }, []);
  const cards = useMemo(() => applyFilters(filters, gated, enabledExp ?? new Set(), library, libPack), [filters, gated, enabledExp, library, libPack]);
  const toggle = useCallback(<T,>(set: Set<T>, v: T): Set<T> => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  }, []);

  const activeCount = filters.kinds.size + filters.domains.size + filters.levels.size + filters.tiers.size + filters.packs.size;
  const { width, isTablet, maxContent } = useLayout();
  // v0.23.0: the grid lives inside AppScreen's measured column, so size cells against THAT, and add
  // columns rather than inflating each cell. Phones keep the 3 they have always had.
  const gridW = Math.min(width, maxContent);
  const cols = gridColumns(gridW, isTablet);
  const cellW = Math.floor((gridW - 36 - (cols - 1) * 10) / cols);
  const cellH = Math.round(cellW * 1.4);
  /**
   * Virtualisation (v0.27.2).
   *
   * The grid is a FlatList over six hundred to a thousand cards and it carried no windowing
   * configuration at all, so it kept React Native's defaults: roughly ten screens of cells mounted in
   * each direction. Telling it the row height up front is what lets it skip straight to a scroll
   * position instead of measuring its way there, and the rest simply bounds how far ahead it builds.
   */
  const rowH = cellH + 12 + 17; // cell + list gap + the label under it
  const getRowLayout = useCallback((_: unknown, i: number) => ({ length: rowH, offset: rowH * i, index: i }), [rowH]);
  /**
   * Share a set of archive cards: one card travels as a card, several travel as a pack.
   *
   * The same shapes the character sheet sends, so a card handed over from here is indistinguishable
   * from one handed over from a hand of cards. A class card is skipped: it is multi-page bundled
   * content with no portable form (the same rule the single-card hold has always followed).
   */
  /**
   * The archive's own print path (v0.35; watched v0.35.1).
   *
   * A catalog card is already a bitmap of the right size, so it goes straight on the page. Everything
   * else here (weapons, armour, loot, homebrew) is drawn by the app, so it is captured at print size
   * first, exactly as the character sheet does, and that is slow enough to deserve a progress bar.
   */
  const printRef = useRef<PrintStageHandle>(null);
  const printJob = usePrintJob(setNotice);
  const onPrintItems = useCallback((items: GalleryItem[]) => {
    printJob.run({
      total: items.length,
      subject: 'RuneKeep',
      build: async (step, cancelled) => {
        const out: PdfCard[] = [];
        for (const it of items) {
          if (cancelled()) return [];
          const base = { title: it.label, typeLabel: 'Card', body: '', color: null as string | null, art: null as string | null };
          if (it.type === 'card') {
            // Bundled artwork has no bytes to inline on Android, so it is drawn and captured instead.
            const bytes = await imageForPrint(it.card.source);
            out.push({ ...base, image: bytes ?? (await printRef.current?.capture(<PrintableImage source={it.card.source} />)) ?? null });
            step();
            continue;
          }
          const node =
            it.type === 'lib' ? <LibraryForgedCard card={it.lib} />
            : it.type === 'weapon' ? <ForgedWeaponCard weapon={it.weapon} />
            : it.type === 'armor' ? <ForgedArmorCard armor={it.armor} />
            : it.type === 'loot' ? <ForgedLootCard loot={it.loot} />
            : <ForgedCard title={it.def.title} kindLabel="Class" body={it.def.body} accentDeep={classColor(it.def.key).deep} Banner={it.def.Banner} classKey={it.def.key} />;
          out.push({ ...base, image: (await printRef.current?.capture(node)) ?? null });
          step();
        }
        return out;
      },
    });
  }, [printJob]);

  const shareItems = useCallback((items: GalleryItem[]) => {
    const usable = items.filter((i) => i.type !== 'class') as Exclude<GalleryItem, { type: 'class' }>[];
    if (!usable.length) { setNotice('Class cards cannot be shared'); return; }
    playSfx('buttonTap');
    const payloads = usable.map((i) => (i.type === 'lib' ? i.lib : toShareCard(i)));
    if (payloads.length === 1) {
      setNfcSend({ content: { kind: 'card', payload: payloads[0] }, label: payloads[0].title || 'card', items: usable });
      return;
    }
    const exp: Expansion = {
      id: `arc-${Date.now().toString(36)}`,
      name: `${payloads.length} cards`,
      author: '',
      description: `${payloads.length} cards from the card archive`,
      version: 1,
      createdAt: new Date().toISOString(),
      cards: payloads,
    };
    setNfcSend({ content: { kind: 'expansion', payload: exp }, label: `${payloads.length} cards`, items: usable });
  }, []);

  /** Holding a selected card shares the whole selection; holding an unselected one shares just it. */
  const onHoldGroup = useCallback((item: GalleryItem) => {
    focusHaptic();
    const ids = selected.has(item.id) ? selected : new Set([item.id]);
    shareItems(cards.filter((c) => ids.has(c.id)));
  }, [selected, cards, shareItems]);

  const openCard = useCallback((item: GalleryItem) => {
    if (!selecting) { setReading(item); return; }
    playSfx(selected.has(item.id) ? 'cardDeselect' : 'cardSelect');
    setSelected((s) => { const n = new Set(s); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n; });
  }, [selecting, selected]);
  const renderCard = useCallback(
    ({ item }: { item: GalleryItem }) => (
      <GalleryCell item={item} cellW={cellW} cellH={cellH} selecting={selecting} selected={selected.has(item.id)} onOpen={openCard} onHold={selecting ? onHoldGroup : undefined} />
    ),
    [cellW, cellH, openCard, selecting, selected, onHoldGroup],
  );

  if (!ready || !enabledExp) return <LoadingScreen label="Opening the archive" />;

  return (
    <AppScreen
      title="Card archive"
      onBack={() => router.back()}
      headerRight={
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => { playSfx('buttonTap'); router.push('/adversary-library' as Href); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Adversary library">
            <Svg width={20} height={20} viewBox="0 0 24 24">
              <Path d="M12 3 C7 3 4 6.6 4 11 C4 13.7 5.2 15.2 6 16.3 L6 19 H8.5 V17 H10.5 V19 H13.5 V17 H15.5 V19 H18 L18 16.3 C18.8 15.2 20 13.7 20 11 C20 6.6 17 3 12 3 Z" fill="none" stroke={Rune.goldText} strokeWidth={1.5} strokeLinejoin="round" />
              <Circle cx={9} cy={11.2} r={1.7} fill={Rune.goldText} />
              <Circle cx={15} cy={11.2} r={1.7} fill={Rune.goldText} />
            </Svg>
          </Pressable>
        </View>
      }>
      {/* v0.23.0: the filter control lives in the content, not the header corner. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Pressable
          onPress={() => { playSfx('buttonTap'); setDrawerOpen((o) => !o); }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ expanded: drawerOpen }}
          accessibilityLabel={`Filters, ${activeCount} active`}>
          <ChamferBox chamfer={5} fill={activeCount ? 'rgba(200,27,24,0.16)' : 'transparent'} stroke={activeCount ? Rune.red : Rune.goldEdge} strokeWidth={1.1} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, height: 30 }}>
            <Svg width={14} height={13} viewBox="0 0 18 16">
              <Line x1={1} y1={3} x2={17} y2={3} stroke={Rune.goldEdge} strokeWidth={2} />
              <Line x1={4} y1={8} x2={14} y2={8} stroke={Rune.goldEdge} strokeWidth={2} />
              <Line x1={7} y1={13} x2={11} y2={13} stroke={Rune.goldEdge} strokeWidth={2} />
            </Svg>
            <Text style={{ color: activeCount ? Rune.goldBright : Rune.goldText, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>
              {activeCount ? `Filters · ${activeCount}` : 'Filters'}
            </Text>
            <Svg width={9} height={6} viewBox="0 0 10 7" style={{ transform: [{ rotate: drawerOpen ? '180deg' : '0deg' }] }}>
              <Polyline points="1,1 5,6 9,1" fill="none" stroke={Rune.goldEdge} strokeWidth={1.6} />
            </Svg>
          </ChamferBox>
        </Pressable>
        {activeCount ? (
          <Pressable onPress={() => { playSfx('buttonTap'); clearFilters(); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear filters">
            <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>Clear</Text>
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }} />
        {/* v0.35 (owner): pick several cards, then hold one of them to share the lot. */}
        <Pressable
          onPress={() => { playSfx('buttonTap'); setSelecting((v) => { if (v) setSelected(new Set()); return !v; }); }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ selected: selecting }}
          accessibilityLabel={selecting ? 'Stop selecting' : 'Select cards'}>
          <ChamferBox chamfer={5} fill={selecting ? 'rgba(200,27,24,0.16)' : 'transparent'} stroke={selecting ? Rune.red : Rune.goldEdge} strokeWidth={1.1} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, height: 30 }}>
            <Text style={{ color: selecting ? Rune.goldBright : Rune.goldText, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>
              {selecting ? (selected.size ? `${selected.size} picked` : 'Done') : 'Select'}
            </Text>
          </ChamferBox>
        </Pressable>
      </View>
      {selecting ? (
        <Text style={{ color: Rune.muted, fontSize: 10.5, fontFamily: Body.regular, marginBottom: 8 }}>
          Tap cards to pick them, then hold any one of them to share the set.
        </Text>
      ) : null}
      {drawerOpen ? (
        <ChamferBox chamfer={10} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.4)" strokeWidth={1.2} style={{ paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, gap: 9 }}>
          {/* v0.32.2: SOURCE is a filter inside the archive, not a category of its own. Neither chip
              lit shows both, which is why there is no "All". */}
          {/* v0.34.0: with no expansions installed there is no homebrew to filter to, and a lit chip
              over an empty archive reads as a broken catalogue. The whole band goes, because with
              only official cards there is nothing to choose between. */}
          {library.length ? (
            <FilterBand label="Source">
              <RuneChip label="Official" active={filters.sources.has('official')} onPress={() => setFilters((f) => ({ ...f, sources: toggle(f.sources, 'official' as const) }))} />
              <RuneChip label="Homebrew" active={filters.sources.has('homebrew')} onPress={() => setFilters((f) => ({ ...f, sources: toggle(f.sources, 'homebrew' as const) }))} />
            </FilterBand>
          ) : null}
          {/* v0.35.2 (owner): one chip per pack the device has switched on, plus the base game. With
              only the base game there is nothing to choose between, so the band does not appear. */}
          {packs.length > 1 ? (
            <FilterBand label="Pack">
              {packs.map((k) => (
                <RuneChip key={k.id} label={k.name} active={filters.packs.has(k.id)} onPress={() => setFilters((f) => ({ ...f, packs: toggle(f.packs, k.id) }))} />
              ))}
            </FilterBand>
          ) : null}
          <FilterBand label="Type">
            {KINDS.map((k) => (
              <RuneChip key={k.key} label={k.label} active={filters.kinds.has(k.key)} onPress={() => setFilters((f) => ({ ...f, kinds: toggle(f.kinds, k.key) }))} />
            ))}
          </FilterBand>
          <FilterBand label="Domain">
            {domainChips.map((d) => (
              <RuneChip
                key={d}
                label={d}
                tint={DomainColors[d].deep}
                active={filters.domains.has(d)}
                onPress={() => setFilters((f) => ({ ...f, kinds: new Set(f.kinds).add('domain'), domains: toggle(f.domains, d) }))}
              />
            ))}
          </FilterBand>
          <FilterBand label="Level">
            {LEVELS.map((l) => (
              <RuneChip key={l} label={String(l)} active={filters.levels.has(l)} onPress={() => setFilters((f) => ({ ...f, kinds: new Set(f.kinds).add('domain'), levels: toggle(f.levels, l) }))} />
            ))}
          </FilterBand>
          {/* tier chips narrow weapons/armor (equipment only); tapping one switches the grid to equipment */}
          <FilterBand label="Tier">
            {TIERS.map((t) => (
              <RuneChip
                key={`tier-${t}`}
                label={String(t)}
                active={filters.tiers.has(t)}
                onPress={() => setFilters((f) => ({ ...f, kinds: new Set(f.kinds).add('weapon').add('armor'), tiers: toggle(f.tiers, t) }))}
              />
            ))}
          </FilterBand>
        </ChamferBox>
      ) : null}

      <FlatList
        data={cards}
        keyExtractor={(c) => c.id}
        numColumns={cols}
        columnWrapperStyle={{ gap: 10 }}
        contentContainerStyle={{ gap: 12, paddingBottom: 28, paddingTop: 2 }}
        showsVerticalScrollIndicator={false}
        windowSize={5}
        initialNumToRender={12}
        maxToRenderPerBatch={6}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={Platform.OS === 'android'}
        getItemLayout={getRowLayout}
        ListHeaderComponent={
          <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.medium, letterSpacing: 0.6, marginBottom: 2 }}>
            {cards.length} card{cards.length === 1 ? '' : 's'}
          </Text>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 80, gap: 8 }}>
            <Text style={{ color: Rune.ivory, fontSize: 16, fontFamily: Body.bold, letterSpacing: 1 }}>Nothing matches</Text>
            <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.medium }}>Loosen a filter to see more of the archive.</Text>
          </View>
        }
        renderItem={renderCard}
      />

      {reading ? (
        reading.type === 'class' ? (
          <ClassReader def={reading.def} onClose={() => setReading(null)} />
        ) : (
          <CardReader card={reading} onClose={() => setReading(null)} onHoldShare={onHoldShare} />
        )
      ) : null}
      {notice ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 24, right: 24, bottom: 34, zIndex: 200, alignItems: 'center' }}>
          <ChamferBox chamfer={8} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.5)" strokeWidth={1} style={{ paddingHorizontal: 14, paddingVertical: 9 }}>
            <Text style={{ color: Rune.ivory, fontSize: 12, fontFamily: Body.medium, textAlign: 'center' }}>{notice}</Text>
          </ChamferBox>
        </View>
      ) : null}
      <PrintStage ref={printRef} />
      {printJob.node}
      {nfcSend ? (
        <NfcSendModal
          content={nfcSend.content}
          label={nfcSend.label}
          onPdf={nfcSend.items ? () => onPrintItems(nfcSend.items!) : undefined}
          onClose={() => setNfcSend(null)}
        />
      ) : null}
    </AppScreen>
  );
}
