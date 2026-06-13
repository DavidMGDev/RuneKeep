import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, Text, TextInput, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';

import { AppScreen } from '@/components/app-screen';
import { ArtImage } from '@/components/art-image';
import { CardEditor } from '@/components/card-editor';
import { ChamferBox } from '@/components/chamfer-box';
import { ChamferedImage } from '@/components/chamfered-image';
import { RuneButton } from '@/components/rune-button';
import { type ClassName, classColor, classInfo } from '@/constants/identity';
import { Body, Display, Rune } from '@/constants/theme';
import { CATALOG } from '@/features/cards/catalog';
import { Art } from '@/features/character-sheet/art';
import { formatModifier, TRAIT_ORDER, type TraitKey } from '@/features/character-sheet/character';
import { type ExperienceDef, newCharacterId } from '@/lib/character-file';
import { saveCharacter } from '@/lib/character-store';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { CLASS_CARDS } from './class-cards';
import { featurePages } from './class-data';
import { ForgedArmorCard, ForgedCard, ForgedTextCard, ForgedWeaponCard, FORGED_H, FORGED_W } from './forged-card';
import { PRIMARY_WEAPONS, SECONDARY_WEAPONS, TIER1_ARMOR, type WeaponKind, weaponById } from './equipment-data';
import { CLASS_INVENTORY, itemOptionId, itemTitle } from './class-inventory-data';
import { type GoldAmount, GOLD_DEFAULT } from './gold-card';

// Default art for a custom inventory item with no player image (#128, owner-provided).
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const ITEM_DEFAULT_ART = require('../../../assets/temp/ItemCardImage.jpg') as number;
import { useForgedSnapshots } from './forged-snapshots';
import { StraightCarousel, type StraightCarouselHandle, type StraightFace, type StraightItem } from './straight-carousel';

// ---------- draft ----------

type CardDeckKey = 'class' | 'subclass' | 'ancestry' | 'community' | 'domains';
type DeckKey = CardDeckKey | 'traits' | 'experiences' | 'weapons' | 'armor' | 'inventory';

const isCardDeck = (k: DeckKey): k is CardDeckKey => k === 'class' || k === 'subclass' || k === 'ancestry' || k === 'community' || k === 'domains';
/** Decks that drive the STRAIGHT carousel (card scans + forged cards), incl. weapons/armor/inventory. */
const isCarouselDeck = (k: DeckKey): boolean => isCardDeck(k) || k === 'weapons' || k === 'armor' || k === 'inventory';

/** The rulebook's starting spread (#107): one +2, two +1, two 0, one −1, any order. */
export const TRAIT_POOL = [2, 1, 1, 0, 0, -1];

interface Draft {
  name: string;
  portraitUri: string | null;
  className: ClassName | null;
  subclassCardId: string | null;
  ancestryCardId: string | null;
  communityCardId: string | null;
  domainCardIds: string[];
  traits: Partial<Record<TraitKey, number>>;
  experiences: ExperienceDef[];
  weaponPrimaryId: string | null;
  weaponSecondaryId: string | null;
  armorId: string | null;
  /** Inventory (#128): selected suggested-item ids (+ a synthetic 'item-gold'), and user-authored
   *  custom item cards. */
  inventoryItemIds: string[];
  inventoryCustom: ExperienceDef[];
  gold: GoldAmount;
}

const EMPTY: Draft = {
  name: '',
  portraitUri: null,
  className: null,
  subclassCardId: null,
  ancestryCardId: null,
  communityCardId: null,
  domainCardIds: [],
  traits: {},
  experiences: [],
  weaponPrimaryId: null,
  weaponSecondaryId: null,
  armorId: null,
  inventoryItemIds: [],
  inventoryCustom: [],
  gold: GOLD_DEFAULT,
};

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
    case 'traits':
      return TRAIT_ORDER.every((t) => d.traits[t.key] !== undefined);
    case 'experiences':
      return d.experiences.length === 2;
    case 'weapons':
      return !!d.weaponPrimaryId; // a primary is required; a secondary is optional (1H primary only)
    case 'armor':
      return !!d.armorId;
    case 'inventory':
      return d.inventoryItemIds.length === 2; // MANDATORY (#136): pick two optional items
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
    case 'traits':
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          <Polygon points="11,2 16,7 16,12 11,20 6,12 6,7" {...s} />
          <Line x1={8.5} y1={10} x2={13.5} y2={10} {...s} />
          <Line x1={11} y1={7.5} x2={11} y2={12.5} {...s} />
        </Svg>
      );
    case 'experiences':
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          {/* quill */}
          <Path d="M 4 18 Q 6 10 18 3 Q 14 12 8 16 Z" {...s} />
          <Line x1={4} y1={18} x2={9} y2={13} {...s} />
        </Svg>
      );
    case 'weapons':
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          {/* sword */}
          <Line x1={11} y1={2} x2={11} y2={14} {...s} />
          <Line x1={7.5} y1={14} x2={14.5} y2={14} {...s} />
          <Line x1={11} y1={14} x2={11} y2={20} {...s} />
        </Svg>
      );
    case 'armor':
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          <Path d="M 11 2 L 19 5 V 11 Q 19 17 11 20 Q 3 17 3 11 V 5 Z" {...s} />
        </Svg>
      );
    case 'inventory':
      return (
        <Svg width={20} height={20} viewBox="0 0 22 22">
          <Path d="M 4 8 H 18 L 17 19 H 5 Z" {...s} />
          <Path d="M 8 8 V 5 a 3 3 0 0 1 6 0 v 3" {...s} />
        </Svg>
      );
  }
}

const DECKS: { key: DeckKey; label: string; stub?: boolean }[] = [
  { key: 'class', label: 'Class' },
  { key: 'subclass', label: 'Subclass' },
  { key: 'ancestry', label: 'Ancestry' },
  { key: 'community', label: 'Community' },
  { key: 'domains', label: 'Domains' },
  { key: 'traits', label: 'Traits' },
  { key: 'experiences', label: 'Experiences' },
  { key: 'weapons', label: 'Weapons' },
  { key: 'armor', label: 'Armor' },
  { key: 'inventory', label: 'Inventory' },
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
      style={{ width: 74 }}
      accessibilityRole="tab"
      accessibilityState={{ selected: active, disabled: locked }}
      accessibilityLabel={`${label}${locked ? ', locked' : done ? ', done' : ''}`}>
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

/** A small square-cornered segmented toggle (#121) — the app language is chamfered/flat, no radius. */
function Segmented<T extends string>({ options, value, onChange }: { options: { key: T; label: string; disabled?: boolean }[]; value: T; onChange: (k: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: 'rgba(218,162,73,0.4)' }}>
      {options.map((o, i) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            disabled={o.disabled}
            onPress={() => onChange(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: o.disabled }}
            style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: active ? 'rgba(224,181,99,0.16)' : 'transparent', borderLeftWidth: i ? 1 : 0, borderLeftColor: 'rgba(218,162,73,0.3)', opacity: o.disabled ? 0.4 : 1 }}>
            <Text style={{ color: active ? Rune.goldBright : Rune.muted, fontSize: 9.5, fontFamily: Body.bold, letterSpacing: 0.5, textTransform: 'uppercase' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The "create a custom item" card that lives at the end of the inventory deck (#128). */
function AddItemCard() {
  return (
    <ChamferBox chamfer={14} fill="rgba(14,17,22,0.92)" stroke="rgba(218,162,73,0.5)" strokeWidth={1.4} style={{ width: FORGED_W, height: FORGED_H, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Svg width={40} height={40} viewBox="0 0 40 40">
        <Line x1={20} y1={8} x2={20} y2={32} stroke={Rune.goldEdge} strokeWidth={2.6} />
        <Line x1={8} y1={20} x2={32} y2={20} stroke={Rune.goldEdge} strokeWidth={2.6} />
      </Svg>
      <Text style={{ color: Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 1.4, textTransform: 'uppercase' }}>Custom item</Text>
    </ChamferBox>
  );
}

/** The horizontal deck rail with a thin custom scroll indicator (#110): a faint track with a gold
 *  thumb sized to the visible fraction, tracking scroll position — replaces the old static chevron. */
function DeckRail({ children }: { children: ReactNode }) {
  const scrollX = useSharedValue(0);
  const [viewW, setViewW] = useState(0);
  const [contentW, setContentW] = useState(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });
  const overflow = contentW > viewW + 2;
  const trackW = Math.max(0, viewW - 4); // track sits inside 2px side margins
  const thumbW = overflow ? Math.max(28, trackW * (viewW / contentW)) : 0;
  const thumbStyle = useAnimatedStyle(() => {
    const maxScroll = Math.max(1, contentW - viewW);
    const x = Math.min(1, Math.max(0, scrollX.value / maxScroll)) * (trackW - thumbW);
    return { transform: [{ translateX: x }] };
  });
  return (
    <View style={{ marginTop: 6 }}>
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onLayout={(e) => setViewW(e.nativeEvent.layout.width)}
        onContentSizeChange={(w) => setContentW(w)}
        contentContainerStyle={{ gap: 4, paddingRight: 8 }}>
        {children}
      </Animated.ScrollView>
      {overflow ? (
        <View style={{ height: 2.5, marginTop: 5, marginHorizontal: 2, borderRadius: 2, backgroundColor: 'rgba(147,142,136,0.18)', overflow: 'hidden' }}>
          <Animated.View style={[{ height: '100%', width: thumbW, borderRadius: 2, backgroundColor: Rune.goldEdge }, thumbStyle]} />
        </View>
      ) : null}
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

/**
 * Full-screen entry loader (#110): the create screen has real warm-up cost (forging the nine class
 * cards to bitmaps, mounting the carousel) and the owner could watch the pieces pop in. This veil
 * covers the WHOLE screen — a slowly turning rune ring around a pulsing core — until the first deck
 * is painted, then fades out, so nothing is ever seen assembling. Self-unmounts after the fade.
 */
function CreateLoader({ done, onHidden }: { done: boolean; onHidden: () => void }) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0.4);
  const spin = useSharedValue(0);
  const fade = useSharedValue(1);
  useEffect(() => {
    if (reduced) {
      pulse.value = 0.85;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 760, easing: Easing.inOut(Easing.quad) }), -1, true);
    spin.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.linear }), -1, false);
  }, [pulse, spin, reduced]);
  useEffect(() => {
    if (done) fade.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.quad) }, (f) => f && runOnJS(onHidden)());
  }, [done, fade, onHidden]);
  const glow = useAnimatedStyle(() => ({ opacity: 0.45 + 0.55 * pulse.value, transform: [{ scale: 0.92 + 0.12 * pulse.value }] }));
  const ring = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const veil = useAnimatedStyle(() => ({ opacity: fade.value }));
  return (
    <Animated.View
      pointerEvents={done ? 'none' : 'auto'}
      style={[{ position: 'absolute', top: -80, bottom: -120, left: -60, right: -60, zIndex: 900, backgroundColor: '#06080d', alignItems: 'center', justifyContent: 'center', gap: 26 }, veil]}>
      <View style={{ width: 104, height: 104, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }, ring]}>
          <Svg width={104} height={104} viewBox="0 0 92 92">
            <Polygon points="46,4 84,25 84,67 46,88 8,67 8,25" fill="none" stroke={Rune.goldEdge} strokeWidth={2} strokeLinejoin="miter" opacity={0.5} />
            <Polygon points="46,16 72,31 72,61 46,76 20,61 20,31" fill="none" stroke="rgba(218,162,73,0.25)" strokeWidth={1} strokeLinejoin="miter" />
          </Svg>
        </Animated.View>
        <Animated.View style={glow}>
          <Svg width={46} height={46} viewBox="0 0 56 56">
            <Polygon points="28,8 46,27 46,29 28,48 10,29 10,27" fill={Rune.gold} />
          </Svg>
        </Animated.View>
      </View>
      <Text style={{ color: Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 3, textTransform: 'uppercase' }}>Preparing the forge</Text>
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
      // grace: let the freshly mounted thumbs paint at opacity 0 before revealing them
      setTimeout(() => {
        setPendingDeck(null); // cards are painted → drop the loader
        fade.value = withTiming(1, { duration: 340, easing: Easing.out(Easing.quad) });
      }, 360);
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
        custom: <ForgedCard title={itemTitle(name)} kindLabel="Item" body={`${cap(name)}.`} accentDeep={Rune.panel} fallbackArt={ITEM_DEFAULT_ART} multilineTitle />,
      }));
      const customs: StraightItem[] = draft.inventoryCustom.map((it) => ({
        id: it.id,
        label: it.title || 'Item',
        custom: <ForgedCard title={it.title || 'Item'} kindLabel="Item" body={it.text} accentDeep={Rune.panel} imageUri={it.imageUri} fallbackArt={ITEM_DEFAULT_ART} multilineTitle />,
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
  }, [deck, draft.className, draft.inventoryCustom, sources, weaponKind, weaponSlot, forgedItem]);

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
        return draft.ancestryCardId ? [draft.ancestryCardId] : [];
      case 'community':
        return draft.communityCardId ? [draft.communityCardId] : [];
      case 'domains':
        return draft.domainCardIds;
    }
  }, [deck, draft, weaponSlot]);

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
      ancestryCardId: draft.ancestryCardId!,
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
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (!res.canceled && res.assets[0]) set({ portraitUri: res.assets[0].uri });
  }, [set]);

  const locked = (k: DeckKey) =>
    ((k === 'subclass' || k === 'domains') && !draft.className) || !!DECKS.find((d) => d.key === k)?.stub; // stubs land next issue
  const maxSelect = deck === 'domains' || deck === 'inventory' ? 2 : 1;
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
        <Animated.View style={[{ flex: 1, marginTop: 2 }, fadeStyle]}>
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
            <StraightCarousel
              ref={carouselRef}
              key={deck + (deck === 'weapons' ? `${weaponKind}-${weaponSlot}` : deck === 'subclass' || deck === 'domains' ? (draft.className ?? '') : '')}
              items={items}
              selectedIds={selectedIds}
              initialIndex={deckIndexes.current[deck] ?? 0}
              onIndexChange={(i) => {
                deckIndexes.current[deck] = i;
                setCenterIdx(i);
              }}
            />
          ) : null}
          {deck === 'traits' ? <TraitsTab traits={draft.traits} onTraits={(traits) => set({ traits })} /> : null}
          {deck === 'experiences' ? <ExperiencesTab experiences={draft.experiences} onEdit={(slot) => setEditingExperience(slot)} /> : null}
        </Animated.View>
        {pendingDeck ? <DeckLoader /> : null}
      </View>
      {editingExperience != null ? (
        <CardEditor
          kindLabel="Experience"
          initial={draft.experiences[editingExperience] ? { title: draft.experiences[editingExperience].title, text: draft.experiences[editingExperience].text, imageUri: draft.experiences[editingExperience].imageUri } : undefined}
          onCancel={() => setEditingExperience(null)}
          onSave={(d) => {
            const next = [...draft.experiences];
            const existing = next[editingExperience];
            next[editingExperience] = { id: existing?.id ?? `exp-${Date.now().toString(36)}`, title: d.title, text: d.text, imageUri: d.imageUri };
            set({ experiences: next.filter(Boolean) });
            setEditingExperience(null);
          }}
        />
      ) : null}
      {editingItem != null ? (
        <CardEditor
          kindLabel="Item"
          initial={typeof editingItem === 'number' && draft.inventoryCustom[editingItem] ? { title: draft.inventoryCustom[editingItem].title, text: draft.inventoryCustom[editingItem].text, imageUri: draft.inventoryCustom[editingItem].imageUri } : undefined}
          onCancel={() => setEditingItem(null)}
          onSave={(d) => {
            const next = [...draft.inventoryCustom];
            if (editingItem === 'new') next.push({ id: `itm-${Date.now().toString(36)}`, title: d.title, text: d.text, imageUri: d.imageUri });
            else next[editingItem] = { ...next[editingItem], title: d.title, text: d.text, imageUri: d.imageUri };
            set({ inventoryCustom: next });
            setEditingItem(null);
          }}
        />
      ) : null}
      {/* ---- THE select controls: the screen's TOP layer (#106) — above the carousel veil AND
          the features reader, never dimmed, always tappable, one spot. Card decks only. Hierarchy
          top-to-bottom (#108): SELECT (primary, biggest) → CLASS FEATURES → the n/n counter. */}
      {isCarouselDeck(deck) ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 56, zIndex: 600, alignItems: 'center', gap: 6 }} pointerEvents="box-none">
          <RuneButton
            label={centerInvAdd ? 'Create item' : centerInvCustom ? 'Edit item' : centerSelected ? 'Deselect' : `Select ${noun}`}
            kind={centerSelected && !centerInvAdd && !centerInvCustom ? 'ghost' : 'primary'}
            height={40}
            onPress={() => centerItem && onToggle(centerItem.id)}
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
        </View>
      ) : null}
      {stage}
      {loaderUp ? <CreateLoader done={loaderDone} onHidden={() => setLoaderUp(false)} /> : null}
    </AppScreen>
  );
}

// ---------- traits ----------

/**
 * Trait distribution (#107, rulebook step 3): the pool chips (+2, +1, +1, 0, 0, −1) arm on tap;
 * tapping a trait banner places the armed value (swapping any previous value back to the pool);
 * tapping an assigned banner with nothing armed clears it. The banners are the sheet's own.
 */
function TraitsTab({ traits, onTraits }: { traits: Partial<Record<TraitKey, number>>; onTraits: (t: Partial<Record<TraitKey, number>>) => void }) {
  const [armed, setArmed] = useState<number | null>(null);

  const assignedValues = TRAIT_ORDER.map((t) => traits[t.key]).filter((v): v is number => v !== undefined);
  const pool: number[] = [...TRAIT_POOL];
  for (const v of assignedValues) {
    const i = pool.indexOf(v);
    if (i >= 0) pool.splice(i, 1);
  }
  const assignedCount = assignedValues.length;

  const placeOn = (key: TraitKey) => {
    const next = { ...traits };
    if (armed !== null) {
      next[key] = armed;
      setArmed(null);
    } else if (next[key] !== undefined) {
      delete next[key];
    } else {
      return;
    }
    onTraits(next);
  };

  return (
    <View style={{ flex: 1, paddingTop: 8 }}>
      {/* the pool */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, minHeight: 40, alignItems: 'center' }}>
        {pool.length ? (
          pool.map((v, i) => {
            const isArmed = armed === v && pool.indexOf(v) === i; // arm ONE instance of a duplicate
            return (
              <Pressable
                key={`${v}-${i}`}
                onPress={() => setArmed(isArmed ? null : v)}
                accessibilityRole="button"
                accessibilityState={{ selected: isArmed }}
                accessibilityLabel={`Modifier ${formatModifier(v)}${isArmed ? ', armed. Tap a trait to place it' : ''}`}>
                <ChamferBox
                  chamfer={8}
                  fill={isArmed ? Rune.red : 'rgba(14,17,22,0.95)'}
                  stroke={isArmed ? 'transparent' : 'rgba(218,162,73,0.55)'}
                  strokeWidth={1.3}
                  style={{ width: 44, height: 38, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: isArmed ? Rune.ivory : Rune.goldText, fontSize: 16, fontFamily: Display.black }}>{formatModifier(v)}</Text>
                </ChamferBox>
              </Pressable>
            );
          })
        ) : (
          <Text style={{ color: Rune.goldBright, fontSize: 11, fontFamily: Body.bold, letterSpacing: 1.4, textTransform: 'uppercase' }}>All modifiers placed</Text>
        )}
      </View>
      <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.medium, textAlign: 'center', marginTop: 2 }}>
        {armed !== null ? `Tap a trait to place ${formatModifier(armed)}` : pool.length ? 'Tap a modifier, then a trait — tap a trait to clear it' : `${assignedCount}/6 set`}
      </Text>
      {/* the banners — the sheet's own art */}
      <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignContent: 'center', columnGap: 14, rowGap: 6 }}>
        {TRAIT_ORDER.map((t) => {
          const v = traits[t.key];
          return (
            <Pressable
              key={t.key}
              onPress={() => placeOn(t.key)}
              accessibilityRole="button"
              accessibilityLabel={`${t.label}, ${v !== undefined ? formatModifier(v) : 'unassigned'}`}
              style={{ width: 92, height: 150 }}>
              <View style={{ position: 'absolute', left: 6, top: 16, width: 80, height: 128, opacity: v !== undefined ? 1 : 0.55 }}>
                <ArtImage source={Art.traitBanner} fit="fill" />
              </View>
              <View style={{ position: 'absolute', left: 22, top: 0, width: 48, height: 50 }}>
                <ArtImage source={t.icon} fit="contain" />
              </View>
              <Text style={{ position: 'absolute', top: 56, left: 0, right: 0, textAlign: 'center', color: Rune.goldText, fontSize: 10, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                {t.label.slice(0, 3)}
              </Text>
              <Text
                style={{
                  position: 'absolute',
                  top: 76,
                  left: 0,
                  right: 0,
                  textAlign: 'center',
                  color: v !== undefined ? (v < 0 ? '#E2705A' : Rune.ivory) : 'rgba(147,142,136,0.7)',
                  fontSize: v !== undefined ? 24 : 18,
                  fontFamily: Display.black,
                }}>
                {v !== undefined ? formatModifier(v) : '·'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------- experiences ----------

/** Two experience slots (#107): player-authored cards. Empty = forge prompt; filled = the card
 *  at reading size with the EDIT control in its lower-left corner (owner spec). */
function ExperiencesTab({ experiences, onEdit }: { experiences: ExperienceDef[]; onEdit: (slot: number) => void }) {
  const CARD_SCALE_X = 0.62;
  return (
    <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
      {[0, 1].map((slot) => {
        const exp = experiences[slot];
        return (
          <View key={slot} style={{ width: 230 * CARD_SCALE_X, height: 322 * CARD_SCALE_X }}>
            {exp ? (
              <>
                <View style={{ transform: [{ scale: CARD_SCALE_X }], width: 230, height: 322, marginLeft: (230 * (CARD_SCALE_X - 1)) / 2, marginTop: (322 * (CARD_SCALE_X - 1)) / 2 }}>
                  <ForgedCard title={exp.title} kindLabel="Experience" body={exp.text} accentDeep={Rune.panel} imageUri={exp.imageUri} multilineTitle />
                </View>
                {/* the lower-left EDIT control */}
                <Pressable
                  onPress={() => onEdit(slot)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${exp.title}`}
                  style={{ position: 'absolute', left: -6, bottom: -6 }}>
                  <ChamferBox chamfer={6} fill={Rune.red} style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
                    <Svg width={14} height={14} viewBox="0 0 12 12">
                      <Path d="M 1 11 L 3 6 L 9 0 L 12 3 L 6 9 Z" fill={Rune.ivory} />
                    </Svg>
                  </ChamferBox>
                </Pressable>
              </>
            ) : (
              <Pressable onPress={() => onEdit(slot)} accessibilityRole="button" accessibilityLabel={`Add experience ${slot + 1}`} style={{ flex: 1 }}>
                {({ pressed }) => (
                  <ChamferBox
                    chamfer={12}
                    fill={pressed ? 'rgba(200,27,24,0.12)' : 'rgba(14,17,22,0.9)'}
                    stroke="rgba(218,162,73,0.5)"
                    strokeWidth={1.3}
                    style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    <Svg width={30} height={30} viewBox="0 0 30 30">
                      <Line x1={15} y1={5} x2={15} y2={25} stroke={Rune.goldEdge} strokeWidth={2.4} />
                      <Line x1={5} y1={15} x2={25} y2={15} stroke={Rune.goldEdge} strokeWidth={2.4} />
                    </Svg>
                    <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center' }}>
                      Experience {slot + 1}
                    </Text>
                  </ChamferBox>
                )}
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

