import { memo, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { View as RNView } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { ArtImage } from '@/components/art-image';
import { ChamferBox } from '@/components/chamfer-box';
import { Portrait } from '@/components/portrait';
import { RuneButton } from '@/components/rune-button';
import { classColor } from '@/constants/identity';
import { Body, Display, Rune } from '@/constants/theme';
import { type DmCard, dmDecks } from '@/features/dm/dm-decks';
import { type CharacterFile, classLabel } from '@/lib/character-file';

/** The sheet's card, in its own design size; table cards are this, scaled. */
const CW = 230;
const CH = 322;

/**
 * The roster's right-hand pane on a desktop window (v0.45.0): who the selected character is, what they carry,
 * and what can be done with them. Only the two decks a player reaches for at the table, Arsenal and Inventory,
 * drawn as the real cards (printed art, or the live card the sheet draws), fanned and lifting under the pointer.
 */
export function RosterDossier({ file, onOpen, onShare, onRename, onMove, onDelete }: {
  file: CharacterFile;
  onOpen: () => void;
  onShare: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const decks = useMemo(() => decksOf(file), [file]);
  const tint = classColor(file.className);
  return (
    <Animated.View key={file.id} entering={FadeIn.duration(180)} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 34, paddingTop: 26, paddingBottom: 30, gap: 26 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-end' }}>
          <Portrait uri={file.portraitUri} size={132} chamfer={14} tint={tint.bright} fill={Rune.ink} />
          <View style={{ flex: 1, gap: 8, paddingBottom: 4 }}>
            <Text numberOfLines={1} style={{ color: Rune.ivory, fontSize: 40, fontFamily: Display.black, letterSpacing: 1.2, textTransform: 'uppercase' }}>{file.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 10, height: 10, backgroundColor: tint.bright, transform: [{ rotate: '45deg' }] }} />
              <Text style={{ color: Rune.goldText, fontSize: 14, fontFamily: Body.bold, letterSpacing: 1.6, textTransform: 'uppercase' }}>Lvl {file.level} {classLabel(file)}</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
              <RuneButton label="Open sheet" kind="primary" height={42} style={{ minWidth: 160 }} onPress={onOpen} />
              <RuneButton label="Share file" kind="secondary" height={42} onPress={onShare} />
              <RuneButton label="Rename" kind="secondary" height={42} onPress={onRename} />
              <RuneButton label="Move to folder" kind="secondary" height={42} onPress={onMove} />
              <RuneButton label="Delete" kind="ghost" height={42} onPress={onDelete} />
            </View>
          </View>
        </View>
        <DeckRow title="Arsenal" cards={decks.abilities ?? []} />
        <DeckRow title="Inventory" cards={decks.inventory ?? []} />
      </ScrollView>
    </Animated.View>
  );
}

/** Built decks per character file object, so flicking between characters does not rebuild what was already built. */
const deckCache = new WeakMap<CharacterFile, Record<string, DmCard[]>>();
function decksOf(file: CharacterFile) {
  let d = deckCache.get(file);
  if (!d) { d = dmDecks(file); deckCache.set(file, d); }
  return d;
}

const SHOW_W = 150;
/** The tightest a fan packs before it scrolls sideways instead. */
const MIN_STEP = 40;

/** One deck, fanned: the cards overlap more as the deck grows so the row never scrolls sideways. */
function DeckRow({ title, cards }: { title: string; cards: DmCard[] }) {
  const [rowW, setRowW] = useState(0);
  const step = cards.length > 1 ? Math.min(SHOW_W - 30, Math.max(MIN_STEP, (rowW - SHOW_W) / (cards.length - 1))) : 0;
  const fanW = SHOW_W + Math.max(0, cards.length - 1) * step + 12;
  const scrolls = rowW > 0 && fanW > rowW;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12 }}>
        <Text style={{ color: Rune.ivory, fontSize: 16, fontFamily: Display.black, letterSpacing: 1.6, textTransform: 'uppercase' }}>{title}</Text>
        <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.bold }}>{cards.length} {cards.length === 1 ? 'card' : 'cards'}</Text>
      </View>
      <View onLayout={(e) => setRowW(e.nativeEvent.layout.width)} style={{ height: SHOW_W * 1.4 + 26, paddingTop: 20 }}>
        {cards.length === 0 ? (
          <ChamferBox chamfer={10} fill="rgba(14,17,22,0.6)" stroke="rgba(218,162,73,0.3)" strokeWidth={1.2} style={{ width: SHOW_W, height: SHOW_W * 1.4, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.medium }}>Empty</Text>
          </ChamferBox>
        ) : rowW > 0 ? (
          // A deck too long to fan in the width scrolls sideways rather than running off the pane.
          <ScrollView horizontal scrollEnabled={scrolls} showsHorizontalScrollIndicator={scrolls} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} contentContainerStyle={{ width: Math.max(fanW, rowW) }}>
            {cards.map((c, i) => <FannedCard key={c.id} card={c} left={i * step} index={i} />)}
          </ScrollView>
        ) : null}
      </View>
    </View>
  );
}

/** A card in a deck row: dealt in left to right, lifting and coming to the front under the pointer. */
const FannedCard = memo(function FannedCard({ card, left, index }: { card: DmCard; left: number; index: number }) {
  const reduced = useReducedMotion();
  const lift = useSharedValue(0);
  const deal = useSharedValue(reduced ? 1 : 0);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(() => { deal.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }); }, Math.min(index, 14) * 28);
    return () => clearTimeout(t);
  }, [deal, index, reduced]);
  const dealStyle = useAnimatedStyle(() => ({ opacity: deal.value, transform: [{ translateY: (1 - deal.value) * 18 }] }));
  const liftStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -lift.value * 18 }, { scale: 1 + lift.value * 0.06 }] }));
  const k = SHOW_W / CW;
  return (
    <Animated.View
      style={[{ position: 'absolute', left, top: 20, width: SHOW_W, height: SHOW_W * 1.4, zIndex: hover ? 100 : index }, dealStyle]}>
      {/* The hit area stays where the card rests; only the art lifts, so a pointer near the edge never loses it. */}
      <Pressable
        focusable={false}
        {...({ tabIndex: -1 } as object)}
        onHoverIn={() => { setHover(true); lift.value = reduced ? 1 : withTiming(1, { duration: 150, easing: Easing.out(Easing.cubic) }); }}
        onHoverOut={() => { setHover(false); lift.value = reduced ? 0 : withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) }); }}
        accessibilityLabel={card.label}
        style={{ width: SHOW_W, height: SHOW_W * 1.4 }}>
        <Animated.View style={[{ width: SHOW_W, height: SHOW_W * 1.4, borderRadius: 6, overflow: 'hidden', backgroundColor: Rune.ink }, liftStyle]}>
          {card.source || card.thumb ? (
            <ArtImage source={(card.thumb ?? card.source) as number} fit="cover" />
          ) : (
            // A preview, not a card in play: its own controls (Gold's steppers) are out of reach and out of the Tab order.
            <View ref={inertRef} pointerEvents="none" style={{ width: CW, height: CH, transform: [{ scale: k }], transformOrigin: [0, 0, 0] }}>{card.node}</View>
          )}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
});

/** Marks a preview's subtree inert (web): nothing inside it can take focus or input. */
function inertRef(el: RNView | null) {
  (el as unknown as HTMLElement | null)?.setAttribute?.('inert', '');
}
