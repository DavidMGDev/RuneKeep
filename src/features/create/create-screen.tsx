import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, Text, TextInput, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';

import { AppScreen } from '@/components/app-screen';
import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { type ClassName, classColor, classInfo } from '@/constants/identity';
import { Body, Rune } from '@/constants/theme';
import { CATALOG } from '@/features/cards/catalog';
import { newCharacterId } from '@/lib/character-file';
import { saveCharacter } from '@/lib/character-store';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { CLASS_CARDS } from './class-cards';
import { ForgedCard } from './forged-card';
import { StraightCarousel, type StraightItem } from './straight-carousel';

// ---------- draft ----------

type DeckKey = 'class' | 'subclass' | 'ancestry' | 'community' | 'domains';

interface Draft {
  name: string;
  portraitUri: string | null;
  className: ClassName | null;
  subclassCardId: string | null;
  ancestryCardId: string | null;
  communityCardId: string | null;
  domainCardIds: string[];
}

const EMPTY: Draft = { name: '', portraitUri: null, className: null, subclassCardId: null, ancestryCardId: null, communityCardId: null, domainCardIds: [] };

function deckDone(deck: DeckKey, d: Draft): boolean {
  switch (deck) {
    case 'class':
      return !!d.className;
    case 'subclass':
      return !!d.subclassCardId;
    case 'ancestry':
      return !!d.ancestryCardId;
    case 'community':
      return !!d.communityCardId;
    case 'domains':
      return d.domainCardIds.length === 2;
  }
}

// ---------- deck tab glyphs ----------

function DeckGlyph({ deck, color }: { deck: DeckKey; color: string }) {
  const s = { fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinejoin: 'miter' as const };
  switch (deck) {
    case 'class':
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          <Polygon points="11,1 20,5 20,12 11,21 2,12 2,5" {...s} />
          <Line x1={11} y1={6} x2={11} y2={14} {...s} />
        </Svg>
      );
    case 'subclass':
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          <Polygon points="11,1 20,5 20,12 11,21 2,12 2,5" {...s} />
          <Polygon points="11,6 15.5,8.5 15.5,11.5 11,16 6.5,11.5 6.5,8.5" fill={color} stroke="none" />
        </Svg>
      );
    case 'ancestry':
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          <Line x1={11} y1={21} x2={11} y2={8} {...s} />
          <Path d="M 11 8 Q 5 8 4 2 Q 11 2 11 8 Q 11 2 18 2 Q 17 8 11 8" {...s} />
        </Svg>
      );
    case 'community':
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          <Polyline points="2,20 2,9 8,4 14,9 14,20" {...s} />
          <Polyline points="14,12 20,12 20,20" {...s} />
        </Svg>
      );
    case 'domains':
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          <Rect x={3} y={4} width={10} height={14} {...s} />
          <Rect x={9} y={2} width={10} height={14} transform="rotate(8 14 9)" {...s} />
        </Svg>
      );
  }
}

const DECKS: { key: DeckKey; label: string }[] = [
  { key: 'class', label: 'Class' },
  { key: 'subclass', label: 'Subclass' },
  { key: 'ancestry', label: 'Ancestry' },
  { key: 'community', label: 'Community' },
  { key: 'domains', label: 'Domains' },
];

function DeckTab({ deck, label, active, done, locked, pulseToken, onPress }: { deck: DeckKey; label: string; active: boolean; done: boolean; locked: boolean; pulseToken: number; onPress: () => void }) {
  const pulse = useSharedValue(1);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (pulseToken > 0 && !reduced) {
      pulse.value = withSequence(withTiming(1.16, { duration: 180, easing: Easing.out(Easing.quad) }), withSpring(1, { damping: 12, stiffness: 180 }));
    }
  }, [pulseToken, pulse, reduced]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const color = locked ? Rune.muted : active ? Rune.goldBright : done ? Rune.goldText : Rune.muted;
  return (
    <Pressable
      onPress={onPress}
      disabled={locked}
      style={{ flex: 1, minWidth: 0 }}
      accessibilityRole="tab"
      accessibilityState={{ selected: active, disabled: locked }}
      accessibilityLabel={`${label} cards${locked ? ', locked. Pick a class first' : done ? ', chosen' : ''}`}>
      <Animated.View style={anim}>
        <ChamferBox
          chamfer={7}
          fill={active ? 'rgba(224,181,99,0.12)' : 'transparent'}
          stroke={active ? Rune.goldBright : done ? 'rgba(218,162,73,0.55)' : 'rgba(147,142,136,0.3)'}
          strokeWidth={active ? 1.6 : 1.1}
          style={{ alignItems: 'center', paddingVertical: 7, gap: 3, opacity: locked ? 0.45 : 1, overflow: 'hidden' }}>
          <View>
            <DeckGlyph deck={deck} color={color} />
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
          <Text numberOfLines={1} style={{ color, fontSize: 7.5, fontFamily: Body.bold, letterSpacing: 0.3, textTransform: 'uppercase', maxWidth: '100%' }}>
            {label}
          </Text>
        </ChamferBox>
      </Animated.View>
    </Pressable>
  );
}

/** A section seam: plain gold hairlines flanking the label — the app's own divider language.
 *  (The ornamental CardDivider is for CARDS only, per owner.) */
function SectionDivider({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(218,162,73,0.5)' }} />
      <Text style={{ color: Rune.goldText, fontSize: 10, fontFamily: Body.bold, letterSpacing: 2.4, textTransform: 'uppercase' }}>{label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(218,162,73,0.5)' }} />
    </View>
  );
}

/** Sigil pulse shown while a deck swap loads (cards faded out). */
function DeckLoader() {
  const pulse = useSharedValue(0.35);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      pulse.value = 0.8;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) }), -1, true);
  }, [pulse, reduced]);
  const glow = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View style={[{ position: 'absolute', alignSelf: 'center', top: '42%' }, glow]} pointerEvents="none">
      <Svg width={44} height={44} viewBox="0 0 56 56">
        <Polygon points="28,2 50,24 50,32 28,54 6,32 6,24" fill="none" stroke={Rune.goldEdge} strokeWidth={2} strokeLinejoin="miter" />
        <Polygon points="28,16 39,27 39,29 28,40 17,29 17,27" fill={Rune.gold} opacity={0.85} />
      </Svg>
    </Animated.View>
  );
}

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
  const [deckVisible, setDeckVisible] = useState(true);
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

  // Deck switch: fade ALL cards out in place -> swap ONLY once fully invisible (timing callback,
  // not a racy timeout — a mid-fade swap let the old deck's cards flash among the new, owner) ->
  // short paint grace while the loader pulses -> fade all back in at once. No vertical travel.
  const finishFade = useCallback(
    (next: DeckKey) => {
      setDeck(next);
      setDeckVisible(false);
      setTimeout(() => {
        setDeckVisible(true);
        setPendingDeck(null);
        fade.value = withTiming(1, { duration: 200 });
      }, 240);
    },
    [fade],
  );
  const switchDeck = useCallback(
    (next: DeckKey) => {
      if (next === deck || pendingDeck) return;
      setPendingDeck(next);
      const apply = () => finishFade(next);
      fade.value = withTiming(0, { duration: 150 }, (finished) => {
        if (finished) runOnJS(apply)();
      });
    },
    [deck, pendingDeck, fade, finishFade],
  );

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  const items: StraightItem[] = useMemo(() => {
    switch (deck) {
      case 'class':
        return CLASS_CARDS.map((c) => ({
          id: `class-${c.key}`,
          label: c.title,
          custom: <ForgedCard title={c.title} kindLabel="Class" body={c.body} accentDeep={classColor(c.key).deep} Banner={c.Banner} />,
        }));
      case 'subclass':
        return CATALOG.filter((c) => c.kind === 'subclass' && c.className === draft.className && c.tier === 1).map((c) => ({ id: c.id, label: c.label, thumb: c.thumb, source: c.source }));
      case 'ancestry':
        return CATALOG.filter((c) => c.kind === 'ancestry').map((c) => ({ id: c.id, label: c.label, thumb: c.thumb, source: c.source }));
      case 'community':
        return CATALOG.filter((c) => c.kind === 'community').map((c) => ({ id: c.id, label: c.label, thumb: c.thumb, source: c.source }));
      case 'domains': {
        if (!draft.className) return [];
        const pair = classInfo(draft.className).domains;
        return pair.flatMap((d) => CATALOG.filter((c) => c.kind === 'domain' && c.domain === d && c.level === 1)).map((c) => ({ id: c.id, label: c.label, thumb: c.thumb, source: c.source }));
      }
    }
  }, [deck, draft.className]);

  const selectedIds = useMemo(() => {
    switch (deck) {
      case 'class':
        return draft.className ? [`class-${draft.className}`] : [];
      case 'subclass':
        return draft.subclassCardId ? [draft.subclassCardId] : [];
      case 'ancestry':
        return draft.ancestryCardId ? [draft.ancestryCardId] : [];
      case 'community':
        return draft.communityCardId ? [draft.communityCardId] : [];
      case 'domains':
        return draft.domainCardIds;
    }
  }, [deck, draft]);

  const onToggle = useCallback(
    (id: string) => {
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
        case 'ancestry':
          set({ ancestryCardId: draft.ancestryCardId === id ? null : id });
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
    [deck, draft, set],
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
      ancestryCardId: draft.ancestryCardId!,
      communityCardId: draft.communityCardId!,
      domainCardIds: draft.domainCardIds,
      level: 1,
    });
    router.replace({ pathname: '/sheet', params: { id } });
  }, [complete, draft, router]);

  const pickPortrait = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (!res.canceled && res.assets[0]) set({ portraitUri: res.assets[0].uri });
  }, [set]);

  const locked = (k: DeckKey) => (k === 'subclass' || k === 'domains') && !draft.className;
  const maxSelect = deck === 'domains' ? 2 : 1;
  const noun = deck === 'class' ? 'class' : deck === 'domains' ? 'card' : deck;

  return (
    <AppScreen
      title="New hero"
      onBack={() => router.back()}
      contentAboveFrame
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
                style={{ width: 96, height: 96, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {draft.portraitUri ? (
                  <Image source={{ uri: draft.portraitUri }} style={{ width: 96, height: 96 }} resizeMode="cover" />
                ) : (
                  <Svg width={30} height={30} viewBox="0 0 26 26">
                    <Circle cx={13} cy={9} r={4.4} fill="none" stroke={Rune.goldEdge} strokeWidth={1.8} />
                    <Path d="M 3.5 23 Q 13 14 22.5 23" fill="none" stroke={Rune.goldEdge} strokeWidth={1.8} />
                  </Svg>
                )}
              </ChamferBox>
            )}
          </Pressable>
          {/* name + caption (right) */}
          <View style={{ flex: 1, gap: 6 }}>
            <ChamferBox chamfer={8} fill="rgba(14,17,22,0.9)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.2} style={{ height: 48, justifyContent: 'center', paddingHorizontal: 13 }}>
              <TextInput
                value={draft.name}
                onChangeText={(name) => set({ name })}
                placeholder="Name — who steps forward?"
                placeholderTextColor={Rune.muted}
                selectionColor={Rune.goldBright}
                maxLength={40}
                style={{ color: Rune.sheet, fontSize: 16, fontFamily: Body.semibold, letterSpacing: 0.4, padding: 0 }}
                accessibilityLabel="Character name"
              />
            </ChamferBox>
            <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.medium, lineHeight: 14 }}>Portrait optional — it sits in the sheet's frame for now.</Text>
            <RuneButton label={draft.portraitUri ? 'Change image' : 'Add image'} kind="ghost" height={32} onPress={pickPortrait} />
          </View>
        </View>

        {/* ---- origin ---- */}
        <View style={{ marginTop: 12 }}>
          <SectionDivider label="Origin" />
        </View>
        <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
          {DECKS.map((d) => (
            <DeckTab
              key={d.key}
              deck={d.key}
              label={d.label}
              active={deck === d.key}
              done={deckDone(d.key, draft)}
              locked={locked(d.key)}
              pulseToken={d.key === 'domains' || d.key === 'subclass' ? unlockPulse : 0}
              onPress={() => switchDeck(d.key)}
            />
          ))}
        </View>

        {/* ---- the forge carousel ---- */}
        <Animated.View style={[{ flex: 1, marginTop: 2 }, fadeStyle]}>
          {deckVisible && items.length > 0 ? (
            <StraightCarousel
              key={deck + (deck === 'subclass' || deck === 'domains' ? draft.className ?? '' : '')}
              items={items}
              selectedIds={selectedIds}
              maxSelect={maxSelect}
              onToggle={onToggle}
              initialIndex={deckIndexes.current[deck] ?? 0}
              onIndexChange={(i) => {
                deckIndexes.current[deck] = i;
              }}
              selectNoun={noun}
            />
          ) : null}
        </Animated.View>
        {pendingDeck ? <DeckLoader /> : null}
      </View>
    </AppScreen>
  );
}
