import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';

import { ArtImage } from '@/components/art-image';
import { AppScreen, SectionLabel } from '@/components/app-screen';
import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { type ClassName, CLASSES, classColor, classInfo, DomainColors } from '@/constants/identity';
import { Body, Display, Rune } from '@/constants/theme';
import { CATALOG, type CatalogCard } from '@/features/cards/catalog';
import { newCharacterId } from '@/lib/character-file';
import { saveCharacter } from '@/lib/character-store';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

// ---------- draft state ----------

interface Draft {
  name: string;
  portraitUri: string | null;
  className: ClassName | null;
  subclassCardId: string | null;
  ancestryCardId: string | null;
  communityCardId: string | null;
  domainCardIds: string[];
}

type TabKey = 'details' | 'class' | 'ancestry' | 'community' | 'domains';

const EMPTY: Draft = { name: '', portraitUri: null, className: null, subclassCardId: null, ancestryCardId: null, communityCardId: null, domainCardIds: [] };

function tabDone(tab: TabKey, d: Draft): boolean {
  switch (tab) {
    case 'details':
      return d.name.trim().length > 0;
    case 'class':
      return !!d.className && !!d.subclassCardId;
    case 'ancestry':
      return !!d.ancestryCardId;
    case 'community':
      return !!d.communityCardId;
    case 'domains':
      return d.domainCardIds.length === 2;
  }
}

// ---------- tab rail ----------

function TabGlyph({ tab, color }: { tab: TabKey; color: string }) {
  const s = { fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinejoin: 'miter' as const };
  switch (tab) {
    case 'details':
      return (
        <Svg width={22} height={22} viewBox="0 0 22 22">
          <Circle cx={11} cy={7.5} r={4} {...s} />
          <Path d="M 3 19 Q 11 12 19 19" {...s} />
        </Svg>
      );
    case 'class':
      return (
        <Svg width={22} height={22} viewBox="0 0 22 22">
          <Polygon points="11,1 20,5 20,12 11,21 2,12 2,5" {...s} />
          <Line x1={11} y1={6} x2={11} y2={14} {...s} />
        </Svg>
      );
    case 'ancestry':
      return (
        <Svg width={22} height={22} viewBox="0 0 22 22">
          <Line x1={11} y1={21} x2={11} y2={8} {...s} />
          <Path d="M 11 8 Q 5 8 4 2 Q 11 2 11 8 Q 11 2 18 2 Q 17 8 11 8" {...s} />
        </Svg>
      );
    case 'community':
      return (
        <Svg width={22} height={22} viewBox="0 0 22 22">
          <Polyline points="2,20 2,9 8,4 14,9 14,20" {...s} />
          <Polyline points="14,12 20,12 20,20" {...s} />
        </Svg>
      );
    case 'domains':
      return (
        <Svg width={22} height={22} viewBox="0 0 22 22">
          <Rect x={3} y={4} width={10} height={14} {...s} />
          <Rect x={9} y={2} width={10} height={14} transform="rotate(8 14 9)" {...s} />
        </Svg>
      );
  }
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'details', label: 'Details' },
  { key: 'class', label: 'Class' },
  { key: 'ancestry', label: 'Ancestry' },
  { key: 'community', label: 'Community' },
  { key: 'domains', label: 'Domains' },
];

function TabRail({ current, draft, unlockedPulse, onSelect }: { current: TabKey; draft: Draft; unlockedPulse: number; onSelect: (t: TabKey) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4, marginBottom: 12 }}>
      {TABS.map((t) => {
        const locked = t.key === 'domains' && !draft.className;
        const done = tabDone(t.key, draft);
        const active = current === t.key;
        const color = locked ? Rune.muted : active ? Rune.goldBright : done ? Rune.goldText : Rune.muted;
        return (
          <TabCell
            key={t.key}
            label={t.label}
            tab={t.key}
            locked={locked}
            done={done}
            active={active}
            color={color}
            pulseToken={t.key === 'domains' ? unlockedPulse : 0}
            onPress={() => !locked && onSelect(t.key)}
          />
        );
      })}
    </View>
  );
}

function TabCell({ label, tab, locked, done, active, color, pulseToken, onPress }: { label: string; tab: TabKey; locked: boolean; done: boolean; active: boolean; color: string; pulseToken: number; onPress: () => void }) {
  const pulse = useSharedValue(1);
  const reduced = useReducedMotion();
  useEffect(() => {
    // The unlock ceremony: when the Domains tab first unlocks it swells once and settles.
    if (pulseToken > 0 && !reduced) {
      pulse.value = withSequence(withTiming(1.18, { duration: 180, easing: Easing.out(Easing.quad) }), withSpring(1, { damping: 12, stiffness: 180 }));
    }
  }, [pulseToken, pulse, reduced]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <Pressable
      onPress={onPress}
      style={{ flex: 1, minWidth: 0 }}
      accessibilityRole="tab"
      accessibilityState={{ selected: active, disabled: locked }}
      accessibilityLabel={`${label}${locked ? ', locked. Pick a class first' : done ? ', complete' : ', incomplete'}`}>
      <Animated.View style={anim}>
        <ChamferBox
          chamfer={7}
          fill={active ? 'rgba(224,181,99,0.12)' : 'transparent'}
          stroke={active ? Rune.goldBright : done ? 'rgba(218,162,73,0.55)' : 'rgba(147,142,136,0.35)'}
          strokeWidth={active ? 1.6 : 1.1}
          // overflow hidden + tiny type: five cells must NEVER push the rail past the screen
          // (web glyphs run wide; the rail overflowing shoved the whole page sideways).
          style={{ alignItems: 'center', paddingVertical: 8, gap: 4, opacity: locked ? 0.45 : 1, overflow: 'hidden' }}>
          <View>
            <TabGlyph tab={tab} color={color} />
            {locked ? (
              <Svg width={10} height={10} viewBox="0 0 10 10" style={{ position: 'absolute', right: -7, top: -3 }}>
                <Rect x={1.5} y={4.5} width={7} height={5} fill={Rune.muted} />
                <Path d="M 3 4.5 V 3 a 2 2 0 0 1 4 0 v 1.5" fill="none" stroke={Rune.muted} strokeWidth={1.4} />
              </Svg>
            ) : done ? (
              <Svg width={11} height={11} viewBox="0 0 11 11" style={{ position: 'absolute', right: -8, top: -4 }}>
                <Polygon points="5.5,0 11,5.5 5.5,11 0,5.5" fill={Rune.gold} />
                <Polyline points="3,5.5 5,7.5 8.2,3.6" fill="none" stroke={Rune.ink} strokeWidth={1.5} />
              </Svg>
            ) : null}
          </View>
          <Text numberOfLines={1} style={{ color, fontSize: 8, fontFamily: Body.bold, letterSpacing: 0.3, textTransform: 'uppercase', maxWidth: '100%' }}>
            {label}
          </Text>
        </ChamferBox>
      </Animated.View>
    </Pressable>
  );
}

// ---------- shared card picker tile ----------

function CardPick({ card, selected, width, onPress }: { card: CatalogCard; selected: boolean; width: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${card.label}${selected ? ', selected' : ''}`} style={{ width }}>
      <ChamferBox chamfer={8} stroke={selected ? Rune.red : 'rgba(218,162,73,0.35)'} strokeWidth={selected ? 2 : 1.1} style={{ padding: 4 }}>
        <View style={{ width: '100%', aspectRatio: 5 / 7 }}>
          <ArtImage source={card.thumb} fit="contain" recyclingKey={card.id} />
        </View>
        {selected ? (
          <View style={{ position: 'absolute', right: 7, top: 7 }}>
            <Svg width={20} height={20} viewBox="0 0 20 20">
              <Polygon points="10,0 20,10 10,20 0,10" fill={Rune.red} />
              <Polyline points="5.5,10 8.8,13.4 14.6,6.8" fill="none" stroke={Rune.ivory} strokeWidth={2} />
            </Svg>
          </View>
        ) : null}
      </ChamferBox>
      <Text numberOfLines={1} style={{ color: selected ? Rune.goldBright : Rune.muted, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.5, textAlign: 'center', marginTop: 4, textTransform: 'uppercase' }}>
        {card.label}
      </Text>
    </Pressable>
  );
}

function CardPickGrid({ cards, cols, selectedIds, onToggle }: { cards: CatalogCard[]; cols: number; selectedIds: string[]; onToggle: (id: string) => void }) {
  const [rowW, setRowW] = useState(0);
  const gap = 10;
  const w = rowW ? Math.floor((rowW - (cols - 1) * gap) / cols) : 0;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }} onLayout={(e) => setRowW(e.nativeEvent.layout.width)}>
      {w > 0 ? cards.map((c) => <CardPick key={c.id} card={c} width={w} selected={selectedIds.includes(c.id)} onPress={() => onToggle(c.id)} />) : null}
    </View>
  );
}

// ---------- tabs ----------

function DetailsTab({ draft, set }: { draft: Draft; set: (p: Partial<Draft>) => void }) {
  const pick = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (!res.canceled && res.assets[0]) set({ portraitUri: res.assets[0].uri });
  }, [set]);
  return (
    <View style={{ gap: 22, paddingTop: 8 }}>
      <View style={{ gap: 8 }}>
        <SectionLabel>Name</SectionLabel>
        <ChamferBox chamfer={8} fill="rgba(14,17,22,0.9)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ height: 52, justifyContent: 'center', paddingHorizontal: 14 }}>
          <TextInput
            value={draft.name}
            onChangeText={(name) => set({ name })}
            placeholder="Who steps forward?"
            placeholderTextColor={Rune.muted}
            maxLength={40}
            style={{ color: Rune.ivory, fontSize: 18, fontFamily: Display.bold, letterSpacing: 0.6, padding: 0 }}
            accessibilityLabel="Character name"
          />
        </ChamferBox>
      </View>
      <View style={{ gap: 8 }}>
        <SectionLabel>Portrait</SectionLabel>
        <Pressable onPress={pick} accessibilityRole="button" accessibilityLabel={draft.portraitUri ? 'Change portrait' : 'Add a portrait'}>
          {({ pressed }) => (
            <ChamferBox
              chamfer={12}
              fill={pressed ? 'rgba(20,24,31,0.95)' : 'rgba(14,17,22,0.9)'}
              stroke="rgba(218,162,73,0.5)"
              strokeWidth={1.2}
              style={{ width: 148, height: 148, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {draft.portraitUri ? (
                <Image source={{ uri: draft.portraitUri }} style={{ width: 148, height: 148 }} resizeMode="cover" />
              ) : (
                <View style={{ alignItems: 'center', gap: 8 }}>
                  <Svg width={34} height={34} viewBox="0 0 34 34">
                    <Line x1={17} y1={6} x2={17} y2={28} stroke={Rune.goldEdge} strokeWidth={2.4} />
                    <Line x1={6} y1={17} x2={28} y2={17} stroke={Rune.goldEdge} strokeWidth={2.4} />
                  </Svg>
                  <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>Add image</Text>
                </View>
              )}
            </ChamferBox>
          )}
        </Pressable>
        <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.medium, lineHeight: 16 }}>Optional. It will sit in the sheet's portrait for now.</Text>
      </View>
    </View>
  );
}

function ClassTab({ draft, set }: { draft: Draft; set: (p: Partial<Draft>) => void }) {
  const foundations = useMemo(
    () => (draft.className ? CATALOG.filter((c) => c.kind === 'subclass' && c.className === draft.className && c.tier === 1) : []),
    [draft.className],
  );
  return (
    <View style={{ gap: 18, paddingTop: 8 }}>
      <SectionLabel>Choose a class</SectionLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
        {CLASSES.map((c) => {
          const sel = draft.className === c.key;
          const col = classColor(c.key);
          return (
            <Pressable
              key={c.key}
              onPress={() => set({ className: c.key, subclassCardId: null, domainCardIds: [] })}
              accessibilityRole="button"
              accessibilityState={{ selected: sel }}
              accessibilityLabel={`${c.label}, domains ${c.domains[0]} and ${c.domains[1]}`}
              style={{ width: '31%', flexGrow: 1 }}>
              <ChamferBox
                chamfer={9}
                fill={sel ? col.deep : 'rgba(14,17,22,0.9)'}
                stroke={sel ? col.bright : 'rgba(218,162,73,0.4)'}
                strokeWidth={sel ? 1.8 : 1.1}
                style={{ alignItems: 'center', paddingVertical: 13, gap: 7 }}>
                <View style={{ width: 14, height: 14, backgroundColor: sel ? col.bright : Rune.gold, transform: [{ rotate: '45deg' }], opacity: sel ? 1 : 0.55 }} />
                <Text numberOfLines={1} style={{ color: sel ? Rune.ivory : Rune.goldText, fontSize: 12, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>
                  {c.label}
                </Text>
                <View style={{ flexDirection: 'row', gap: 5 }}>
                  {c.domains.map((d) => (
                    <View key={d} style={{ width: 7, height: 7, borderRadius: 0, backgroundColor: DomainColors[d].bright, transform: [{ rotate: '45deg' }], opacity: sel ? 1 : 0.6 }} />
                  ))}
                </View>
              </ChamferBox>
            </Pressable>
          );
        })}
      </View>

      {draft.className ? (
        <View style={{ gap: 10, marginTop: 6 }}>
          <SectionLabel>Foundation — pick your subclass</SectionLabel>
          <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.medium, marginTop: -4 }}>
            Specialization and Mastery unlock by leveling, later.
          </Text>
          <CardPickGrid cards={foundations} cols={2} selectedIds={draft.subclassCardId ? [draft.subclassCardId] : []} onToggle={(id) => set({ subclassCardId: id })} />
        </View>
      ) : null}
    </View>
  );
}

function DomainsTab({ draft, set, onGallery }: { draft: Draft; set: (p: Partial<Draft>) => void; onGallery: () => void }) {
  const cls = draft.className ? classInfo(draft.className) : null;
  if (!cls) return null;
  const toggle = (id: string) => {
    const has = draft.domainCardIds.includes(id);
    if (has) set({ domainCardIds: draft.domainCardIds.filter((x) => x !== id) });
    else if (draft.domainCardIds.length < 2) set({ domainCardIds: [...draft.domainCardIds, id] });
    else set({ domainCardIds: [draft.domainCardIds[1], id] }); // third pick replaces the oldest
  };
  return (
    <View style={{ gap: 16, paddingTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionLabel>Pick two level-1 cards</SectionLabel>
        <Text style={{ color: draft.domainCardIds.length === 2 ? Rune.goldBright : Rune.muted, fontSize: 12, fontFamily: Body.bold, letterSpacing: 1 }}>
          {draft.domainCardIds.length} / 2
        </Text>
      </View>
      {cls.domains.map((d) => (
        <View key={d} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 9, height: 9, backgroundColor: DomainColors[d].bright, transform: [{ rotate: '45deg' }] }} />
            <Text style={{ color: Rune.goldText, fontSize: 12, fontFamily: Body.bold, letterSpacing: 1.6, textTransform: 'uppercase' }}>{d}</Text>
          </View>
          <CardPickGrid
            cards={CATALOG.filter((c) => c.kind === 'domain' && c.domain === d && c.level === 1)}
            cols={3}
            selectedIds={draft.domainCardIds}
            onToggle={toggle}
          />
        </View>
      ))}
      <RuneButton label="Browse all level-1 cards" kind="ghost" height={42} onPress={onGallery} />
    </View>
  );
}

// ---------- screen ----------

/**
 * Character creation: five tabs on top (Details, Class, Ancestry, Community, Domains — Domains
 * locked until a class is chosen, with a small unlock ceremony). Per-tab completion reads at a
 * glance on the rail; FORGE goes live only when everything is set. All characters start at
 * level 1 (PRD: leveling is a later feature).
 */
export function CreateScreen() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [tab, setTab] = useState<TabKey>('details');
  const [unlockedPulse, setUnlockedPulse] = useState(0);
  const hadClass = useRef(false);
  const set = useCallback((p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p })), []);

  useEffect(() => {
    if (draft.className && !hadClass.current) {
      hadClass.current = true;
      setUnlockedPulse((n) => n + 1);
    }
  }, [draft.className]);

  const complete = TABS.every((t) => tabDone(t.key, draft));

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
      ancestryCardId: draft.ancestryCardId!,
      communityCardId: draft.communityCardId!,
      domainCardIds: draft.domainCardIds,
      level: 1,
    });
    router.replace({ pathname: '/sheet', params: { id } });
  }, [complete, draft, router]);

  const ancestries = useMemo(() => CATALOG.filter((c) => c.kind === 'ancestry'), []);
  const communities = useMemo(() => CATALOG.filter((c) => c.kind === 'community'), []);

  return (
    <AppScreen
      title="New hero"
      onBack={() => router.back()}
      headerRight={<RuneButton label="Forge" kind="primary" height={36} disabled={!complete} onPress={forge} accessibilityLabel="Create character" />}>
      <TabRail current={tab} draft={draft} unlockedPulse={unlockedPulse} onSelect={setTab} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
        {tab === 'details' ? <DetailsTab draft={draft} set={set} /> : null}
        {tab === 'class' ? <ClassTab draft={draft} set={set} /> : null}
        {tab === 'ancestry' ? (
          <View style={{ gap: 12, paddingTop: 8 }}>
            <SectionLabel>Choose an ancestry</SectionLabel>
            <CardPickGrid cards={ancestries} cols={3} selectedIds={draft.ancestryCardId ? [draft.ancestryCardId] : []} onToggle={(id) => set({ ancestryCardId: id })} />
          </View>
        ) : null}
        {tab === 'community' ? (
          <View style={{ gap: 12, paddingTop: 8 }}>
            <SectionLabel>Choose a community</SectionLabel>
            <CardPickGrid cards={communities} cols={3} selectedIds={draft.communityCardId ? [draft.communityCardId] : []} onToggle={(id) => set({ communityCardId: id })} />
          </View>
        ) : null}
        {tab === 'domains' ? (
          <DomainsTab draft={draft} set={set} onGallery={() => router.push({ pathname: '/gallery', params: { kinds: 'domain', levels: '1' } })} />
        ) : null}
      </ScrollView>
    </AppScreen>
  );
}
