import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Line, Polyline } from 'react-native-svg';

import { ArtImage } from '@/components/art-image';
import { AppScreen } from '@/components/app-screen';
import { ChamferBox } from '@/components/chamfer-box';
import { LoadingScreen } from '@/components/loading-screen';
import { RuneChip } from './components/rune-chip';
import { type ClassName, classColor, type DomainName, DOMAINS, DomainColors } from '@/constants/identity';
import { Body, Rune } from '@/constants/theme';
import { playSfx } from '@/lib/sfx';
import { CATALOG, type CatalogCard, type CatalogKind } from '@/data/catalog';
import { featurePages } from '@/data/class-data';
import { ALL_ARMOR, ALL_WEAPONS, type ArmorDef, type WeaponDef } from '@/data/equipment-data';
import { FORGED_H, FORGED_W, ForgedArmorCard, ForgedCard, ForgedTextCard, ForgedWeaponCard } from '@/features/create/components/forged-card';
import { CLASS_CARDS, type ClassCardDef } from '@/features/create/components/class-cards';

// The archive browses catalog cards AND equipment. Weapons/armor have no image assets — they render
// live via the forged components — so the grid item is a union (v0.10.0, owner: "all weapons and armor
// for all tiers" were missing because the gallery only ever read CATALOG).
type GalleryKind = CatalogKind | 'weapon' | 'armor' | 'class';
type GalleryItem =
  | { type: 'card'; id: string; label: string; card: CatalogCard }
  | { type: 'weapon'; id: string; label: string; weapon: WeaponDef }
  | { type: 'armor'; id: string; label: string; armor: ArmorDef }
  | { type: 'class'; id: string; label: string; def: ClassCardDef };

const KINDS: { key: GalleryKind; label: string }[] = [
  { key: 'domain', label: 'Domains' },
  { key: 'ancestry', label: 'Ancestry' },
  { key: 'community', label: 'Community' },
  { key: 'class', label: 'Class' },
  { key: 'subclass', label: 'Subclass' },
  { key: 'weapon', label: 'Weapons' },
  { key: 'armor', label: 'Armor' },
];
const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const TIERS = [1, 2, 3, 4];

interface Filters {
  kinds: Set<GalleryKind>;
  domains: Set<DomainName>;
  levels: Set<number>;
  tiers: Set<number>; // tier 1–4, equipment only
}

function applyFilters(f: Filters): GalleryItem[] {
  const wantKind = (k: GalleryKind) => !f.kinds.size || f.kinds.has(k);
  // domains/levels are catalog-domain dimensions; tiers is an equipment dimension. Selecting one set
  // narrows to that family (mirrors the existing level→domain behavior).
  const catalogDim = f.domains.size > 0 || f.levels.size > 0;
  const equipDim = f.tiers.size > 0;
  const out: GalleryItem[] = [];
  if (!equipDim) {
    for (const c of CATALOG) {
      if (!wantKind(c.kind)) continue;
      if (f.domains.size && (c.kind !== 'domain' || !f.domains.has(c.domain!))) continue;
      if (f.levels.size && (c.kind !== 'domain' || !f.levels.has(c.level!))) continue;
      out.push({ type: 'card', id: c.id, label: c.label, card: c });
    }
  }
  // Class cards (v0.10.2): forged multi-page cards, not in CATALOG. They're neither a catalog-domain nor
  // an equipment dimension, so they show only when no domain/level/tier filter is narrowing the grid.
  if (!catalogDim && !equipDim && wantKind('class')) {
    for (const c of CLASS_CARDS) out.push({ type: 'class', id: `class-${c.key}`, label: c.title, def: c });
  }
  if (!catalogDim && wantKind('weapon')) {
    for (const w of ALL_WEAPONS) {
      if (f.tiers.size && !f.tiers.has(w.tier)) continue;
      out.push({ type: 'weapon', id: w.id, label: w.name, weapon: w });
    }
  }
  if (!catalogDim && wantKind('armor')) {
    for (const a of ALL_ARMOR) {
      if (f.tiers.size && !f.tiers.has(a.tier)) continue;
      out.push({ type: 'armor', id: a.id, label: a.name, armor: a });
    }
  }
  return out;
}

/** A forged equipment card (no image asset) scaled to fill `width`, clipped to the 5:7 cell. */
function ScaledForged({ item, width }: { item: Extract<GalleryItem, { type: 'weapon' | 'armor' }>; width: number }) {
  const s = width / FORGED_W;
  const h = FORGED_H * s;
  return (
    <View style={{ width, height: h, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', left: (width - FORGED_W) / 2, top: (h - FORGED_H) / 2, width: FORGED_W, height: FORGED_H, transform: [{ scale: s }] }}>
        {item.type === 'weapon' ? <ForgedWeaponCard weapon={item.weapon} /> : <ForgedArmorCard armor={item.armor} />}
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
  const pagerStyle = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 40 }] }));
  const { width, height } = Dimensions.get('window');
  const w = Math.min(width - 36, (height - 160) * (5 / 7));
  const h = w * 1.4;
  const s = w / FORGED_W;
  const pages = featurePages(def.key);
  const total = 1 + pages.length;
  const deep = classColor(def.key).deep;
  const faces: ReactNode[] = [
    <ForgedCard title={def.title} kindLabel="Class" body={def.body} accentDeep={deep} Banner={def.Banner} pageMark={`1/${total}`} classKey={def.key} />,
    ...pages.map((pg) => <ForgedTextCard title={def.title} kindLabel="Features" pageMark={`${pg.pageIndex + 2}/${total}`} sections={pg.sections} accentDeep={deep} Banner={def.Banner} classKey={def.key} />),
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

/** Fullscreen reader: full-res card over a dim veil; tap or swipe-down closes (the sheet's focus feel). */
function CardReader({ card, onClose }: { card: Extract<GalleryItem, { type: 'card' | 'weapon' | 'armor' }>; onClose: () => void }) {
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
  const veil = useAnimatedStyle(() => ({ opacity: p.value * 0.88 }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * 60 + dragY.value }, { scale: 0.92 + p.value * 0.08 }],
  }));
  const { width, height } = Dimensions.get('window');
  const w = Math.min(width - 36, (height - 160) * (5 / 7));
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 100 }}>
      <Pressable style={{ flex: 1 }} onPress={close} accessibilityRole="button" accessibilityLabel="Close card">
        <Animated.View style={[{ flex: 1, backgroundColor: '#06080d' }, veil]} />
      </Pressable>
      <GestureDetector gesture={pan}>
        <Animated.View
          pointerEvents="box-only"
          style={[{ position: 'absolute', alignSelf: 'center', top: '50%', marginTop: -(w * 1.4) / 2, width: w, height: w * 1.4 }, cardStyle]}>
          <Pressable style={{ flex: 1 }} onPress={close}>
            {card.type === 'card' ? <ArtImage source={card.card.source} fit="contain" /> : <ScaledForged item={card} width={w} />}
          </Pressable>
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
export function GalleryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kinds?: string; levels?: string; domains?: string }>();
  const [ready, setReady] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [reading, setReading] = useState<GalleryItem | null>(null);
  const [filters, setFilters] = useState<Filters>(() => ({
    kinds: new Set((params.kinds?.split(',').filter(Boolean) as GalleryKind[]) ?? []),
    domains: new Set((params.domains?.split(',').filter(Boolean) as DomainName[]) ?? []),
    levels: new Set(params.levels?.split(',').filter(Boolean).map(Number) ?? []),
    tiers: new Set<number>(),
  }));
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 250);
    return () => clearTimeout(t);
  }, []);

  const cards = useMemo(() => applyFilters(filters), [filters]);
  const toggle = useCallback(<T,>(set: Set<T>, v: T): Set<T> => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  }, []);

  const activeCount = filters.kinds.size + filters.domains.size + filters.levels.size + filters.tiers.size;
  const { width } = Dimensions.get('window');
  const cols = 3;
  const cellW = Math.floor((width - 36 - (cols - 1) * 10) / cols);
  const cellH = Math.round(cellW * 1.4);

  if (!ready) return <LoadingScreen label="Opening the archive" />;

  return (
    <AppScreen
      title="Card archive"
      onBack={() => router.back()}
      headerRight={
        <Pressable
          onPress={() => { playSfx('buttonTap'); setDrawerOpen((o) => !o); }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityState={{ expanded: drawerOpen }}
          accessibilityLabel={`Filters, ${activeCount} active`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Svg width={14} height={13} viewBox="0 0 18 16">
            <Line x1={1} y1={3} x2={17} y2={3} stroke={Rune.goldEdge} strokeWidth={2} />
            <Line x1={4} y1={8} x2={14} y2={8} stroke={Rune.goldEdge} strokeWidth={2} />
            <Line x1={7} y1={13} x2={11} y2={13} stroke={Rune.goldEdge} strokeWidth={2} />
          </Svg>
          <Text style={{ color: activeCount ? Rune.red : Rune.goldText, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.8 }}>
            {activeCount ? `FILTERS · ${activeCount}` : 'FILTERS'}
          </Text>
          <Svg width={9} height={6} viewBox="0 0 10 7" style={{ transform: [{ rotate: drawerOpen ? '180deg' : '0deg' }] }}>
            <Polyline points="1,1 5,6 9,1" fill="none" stroke={Rune.goldEdge} strokeWidth={1.6} />
          </Svg>
        </Pressable>
      }>
      {drawerOpen ? (
        <ChamferBox chamfer={10} fill="rgba(14,17,22,0.96)" stroke="rgba(218,162,73,0.4)" strokeWidth={1.2} style={{ paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, gap: 8 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {KINDS.map((k) => (
              <RuneChip key={k.key} label={k.label} active={filters.kinds.has(k.key)} onPress={() => setFilters((f) => ({ ...f, kinds: toggle(f.kinds, k.key) }))} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {DOMAINS.map((d) => (
              <RuneChip
                key={d}
                label={d}
                tint={DomainColors[d].deep}
                active={filters.domains.has(d)}
                onPress={() => setFilters((f) => ({ ...f, kinds: new Set(f.kinds).add('domain'), domains: toggle(f.domains, d) }))}
              />
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {LEVELS.map((l) => (
              <RuneChip key={l} label={`L${l}`} active={filters.levels.has(l)} onPress={() => setFilters((f) => ({ ...f, kinds: new Set(f.kinds).add('domain'), levels: toggle(f.levels, l) }))} />
            ))}
          </View>
          {/* tier chips narrow weapons/armor (equipment only); tapping one switches the grid to equipment */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {TIERS.map((t) => (
              <RuneChip
                key={`tier-${t}`}
                label={`Tier ${t}`}
                active={filters.tiers.has(t)}
                onPress={() => setFilters((f) => ({ ...f, kinds: new Set(f.kinds).add('weapon').add('armor'), tiers: toggle(f.tiers, t) }))}
              />
            ))}
          </View>
        </ChamferBox>
      ) : null}

      <FlatList
        data={cards}
        keyExtractor={(c) => c.id}
        numColumns={cols}
        columnWrapperStyle={{ gap: 10 }}
        contentContainerStyle={{ gap: 12, paddingBottom: 28, paddingTop: 2 }}
        showsVerticalScrollIndicator={false}
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
        renderItem={({ item }) => (
          <Pressable onPress={() => setReading(item)} accessibilityRole="button" accessibilityLabel={`${item.label}, open card`} style={{ width: cellW }}>
            <View style={{ width: cellW, height: cellH }}>
              {item.type === 'card' ? (
                <ArtImage source={item.card.thumb} fit="contain" recyclingKey={item.id} />
              ) : item.type === 'class' ? (
                <ScaledCard width={cellW}>
                  <ForgedCard title={item.def.title} kindLabel="Class" body={item.def.body} accentDeep={classColor(item.def.key).deep} Banner={item.def.Banner} classKey={item.def.key} />
                </ScaledCard>
              ) : (
                <ScaledForged item={item} width={cellW} />
              )}
            </View>
            <Text numberOfLines={1} style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.medium, letterSpacing: 0.4, textAlign: 'center', marginTop: 4 }}>
              {item.label}
            </Text>
          </Pressable>
        )}
      />

      {reading ? (
        reading.type === 'class' ? (
          <ClassReader def={reading.def} onClose={() => setReading(null)} />
        ) : (
          <CardReader card={reading} onClose={() => setReading(null)} />
        )
      ) : null}
    </AppScreen>
  );
}
