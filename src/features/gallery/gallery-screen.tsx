import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, FlatList, Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Line, Polyline } from 'react-native-svg';

import { ArtImage } from '@/components/art-image';
import { AppScreen } from '@/components/app-screen';
import { ChamferBox } from '@/components/chamfer-box';
import { LoadingScreen } from '@/components/loading-screen';
import { RuneChip } from './components/rune-chip';
import { type DomainName, DOMAINS, DomainColors } from '@/constants/identity';
import { Body, Rune } from '@/constants/theme';
import { playSfx } from '@/lib/sfx';
import { CATALOG, type CatalogCard, type CatalogKind } from '@/features/cards/catalog';

const KINDS: { key: CatalogKind; label: string }[] = [
  { key: 'domain', label: 'Domains' },
  { key: 'ancestry', label: 'Ancestry' },
  { key: 'community', label: 'Community' },
  { key: 'subclass', label: 'Subclass' },
];
const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

interface Filters {
  kinds: Set<CatalogKind>;
  domains: Set<DomainName>;
  levels: Set<number>;
}

function applyFilters(f: Filters): CatalogCard[] {
  return CATALOG.filter((c) => {
    if (f.kinds.size && !f.kinds.has(c.kind)) return false;
    if (f.domains.size && (c.kind !== 'domain' || !f.domains.has(c.domain!))) return false;
    if (f.levels.size && (c.kind !== 'domain' || !f.levels.has(c.level!))) return false;
    return true;
  });
}

/** Fullscreen reader: full-res card over a dim veil; tap or swipe-down closes (the sheet's focus feel). */
function CardReader({ card, onClose }: { card: CatalogCard; onClose: () => void }) {
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
            <ArtImage source={card.source} fit="contain" />
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
  const [reading, setReading] = useState<CatalogCard | null>(null);
  const [filters, setFilters] = useState<Filters>(() => ({
    kinds: new Set((params.kinds?.split(',').filter(Boolean) as CatalogKind[]) ?? []),
    domains: new Set((params.domains?.split(',').filter(Boolean) as DomainName[]) ?? []),
    levels: new Set(params.levels?.split(',').filter(Boolean).map(Number) ?? []),
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

  const activeCount = filters.kinds.size + filters.domains.size + filters.levels.size;
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
              <ArtImage source={item.thumb} fit="contain" recyclingKey={item.id} />
            </View>
            <Text numberOfLines={1} style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.medium, letterSpacing: 0.4, textAlign: 'center', marginTop: 4 }}>
              {item.label}
            </Text>
          </Pressable>
        )}
      />

      {reading ? <CardReader card={reading} onClose={() => setReading(null)} /> : null}
    </AppScreen>
  );
}
