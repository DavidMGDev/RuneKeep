import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import type { View as RNView } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { ArtImage } from '@/components/art-image';
import { ChamferBox } from '@/components/chamfer-box';
import { Portrait } from '@/components/portrait';
import { RuneButton } from '@/components/rune-button';
import { classColor } from '@/constants/identity';
import { DesktopPortal } from '@/components/desktop-portal';
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
  // v0.50.6 (owner): a click on one of the character's cards shows it full size, over the whole window.
  const [viewing, setViewing] = useState<DmCard | null>(null);
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
        <DeckRow title="Arsenal" cards={decks.abilities ?? []} onView={setViewing} />
        <DeckRow title="Inventory" cards={decks.inventory ?? []} onView={setViewing} />
      </ScrollView>
      {viewing ? <CardView card={viewing} onClose={() => setViewing(null)} /> : null}
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
const SHOW_H = SHOW_W * 1.4;
/** Room between cards, and around the row so a card lifting under the pointer is never cut off. */
const GAP = 9;
const PAD_X = 14;
const LIFT_ROOM = 28;
const FADE = 56;

/**
 * One deck as a row of same-size cards you look along (v0.45.0, owner): no overlap, a clear gap, and a deck
 * longer than the pane scrolls sideways with the mouse wheel. Each edge fades while there is more to see that
 * way, so a card at the border dissolves instead of being cut.
 */
function DeckRow({ title, cards, onView }: { title: string; cards: DmCard[]; onView: (c: DmCard) => void }) {
  const [rowW, setRowW] = useState(0);
  const [x, setX] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const wrapRef = useRef<View>(null);
  const contentW = PAD_X * 2 + cards.length * SHOW_W + Math.max(0, cards.length - 1) * GAP;
  const maxX = Math.max(0, contentW - rowW);

  // The wheel scrolls the row sideways (a vertical wheel included) while the row has somewhere to go.
  useEffect(() => {
    const el = wrapRef.current as unknown as HTMLElement | null;
    const node = (scrollRef.current as unknown as { getScrollableNode?: () => HTMLElement } | null)?.getScrollableNode?.();
    if (Platform.OS !== 'web' || !el?.addEventListener || !node) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * (e.deltaMode === 1 ? 40 : 1);
      const atEdge = (d < 0 && node.scrollLeft <= 0) || (d > 0 && node.scrollLeft >= node.scrollWidth - node.clientWidth - 1);
      if (atEdge) return; // nothing further this way: let the page scroll
      e.preventDefault();
      node.scrollBy({ left: d * 1.6, behavior: 'smooth' });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [rowW, cards.length]);

  // The edges fade only where the row continues.
  useEffect(() => {
    const el = wrapRef.current as unknown as HTMLElement | null;
    if (Platform.OS !== 'web' || !el?.style) return;
    const l = x > 2 ? FADE : 0;
    const r = x < maxX - 2 ? FADE : 0;
    const mask = l || r ? `linear-gradient(to right, transparent 0, #000 ${l}px, #000 calc(100% - ${r}px), transparent 100%)` : '';
    el.style.setProperty('mask-image', mask);
    el.style.setProperty('-webkit-mask-image', mask);
  }, [x, maxX]);

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12 }}>
        <Text style={{ color: Rune.ivory, fontSize: 16, fontFamily: Display.black, letterSpacing: 1.6, textTransform: 'uppercase' }}>{title}</Text>
        <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.bold }}>{cards.length} {cards.length === 1 ? 'card' : 'cards'}</Text>
      </View>
      <View ref={wrapRef} onLayout={(e) => setRowW(e.nativeEvent.layout.width)} style={{ marginHorizontal: -PAD_X }}>
        {cards.length === 0 ? (
          <View style={{ paddingHorizontal: PAD_X, paddingTop: LIFT_ROOM, paddingBottom: 10 }}>
            <ChamferBox chamfer={10} fill="rgba(14,17,22,0.6)" stroke="rgba(218,162,73,0.3)" strokeWidth={1.2} style={{ width: SHOW_W, height: SHOW_H, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.medium }}>Empty</Text>
            </ChamferBox>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={32}
            onScroll={(e) => setX(e.nativeEvent.contentOffset.x)}
            contentContainerStyle={{ paddingHorizontal: PAD_X, paddingTop: LIFT_ROOM, paddingBottom: 10, gap: GAP }}>
            {cards.map((c, i) => <FannedCard key={c.id} card={c} index={i} onView={onView} />)}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

/** A card in a deck row: dealt in left to right, lifting under the pointer. */
const FannedCard = memo(function FannedCard({ card, index, onView }: { card: DmCard; index: number; onView: (c: DmCard) => void }) {
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
    <Animated.View style={[{ width: SHOW_W, height: SHOW_H, zIndex: hover ? 1 : 0 }, dealStyle]}>
      {/* The hit area stays where the card rests; only the art lifts, so a pointer near the edge never loses it. */}
      <Pressable
        focusable={false}
        {...({ tabIndex: -1 } as object)}
        onHoverIn={() => { setHover(true); lift.value = reduced ? 1 : withTiming(1, { duration: 150, easing: Easing.out(Easing.cubic) }); }}
        onHoverOut={() => { setHover(false); lift.value = reduced ? 0 : withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) }); }}
        accessibilityLabel={card.label}
        onPress={() => onView(card)}
        style={{ width: SHOW_W, height: SHOW_W * 1.4, cursor: 'zoom-in' } as object}>
        <Animated.View style={[{ width: SHOW_W, height: SHOW_W * 1.4, overflow: 'hidden', backgroundColor: Rune.ink }, liftStyle]}>
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

/**
 * One card full size over the whole window (v0.50.6): as tall as the window allows, a multi-page card's pages
 * stepped through with the buttons under it. A click outside it or Escape closes it.
 */
function CardView({ card, onClose }: { card: DmCard; onClose: () => void }) {
  const { height } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const pages = 1 + (card.faces?.length ?? 0);
  const h = Math.max(320, Math.min(height - 150, 860));
  const w = h / 1.4;
  const k = h / CH;
  const live = page === 0 ? card.node : card.faces?.[page - 1];
  // Escape closes it (the page's own layers never see this one).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const art = page === 0 ? card.source ?? card.thumb : undefined;
  return (
    <DesktopPortal to="modal" priority="dialog" onDismiss={onClose}>
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable onPress={onClose} accessibilityLabel="Close the card" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,8,13,0.82)' }} />
      <View style={{ alignItems: 'center', gap: 14 }}>
        <View accessibilityLabel={card.label} style={{ width: w, height: h, overflow: 'hidden', backgroundColor: Rune.ink }}>
          {art ? <ArtImage source={art as number} fit="cover" /> : (
            <View ref={inertRef} pointerEvents="none" style={{ width: CW, height: CH, transform: [{ scale: k }], transformOrigin: [0, 0, 0] }}>{live}</View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {pages > 1 ? <RuneButton label="Previous page" kind="secondary" height={38} disabled={page === 0} onPress={() => setPage((p) => Math.max(0, p - 1))} /> : null}
          {pages > 1 ? <Text style={{ color: Rune.muted, fontSize: 13, fontFamily: Body.bold, minWidth: 90, textAlign: 'center' }}>Page {page + 1} of {pages}</Text> : null}
          {pages > 1 ? <RuneButton label="Next page" kind="secondary" height={38} disabled={page === pages - 1} onPress={() => setPage((p) => Math.min(pages - 1, p + 1))} /> : null}
          <RuneButton label="Close" kind="ghost" height={38} onPress={onClose} />
        </View>
      </View>
    </View>
    </DesktopPortal>
  );
}

/** Marks a preview's subtree inert (web): nothing inside it can take focus or input. */
function inertRef(el: RNView | null) {
  (el as unknown as HTMLElement | null)?.setAttribute?.('inert', '');
}
