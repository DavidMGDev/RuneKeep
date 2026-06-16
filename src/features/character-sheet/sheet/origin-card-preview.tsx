import { type ReactNode, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RuneButton } from '@/components/rune-button';
import { Body, Rune } from '@/constants/theme';
import { playSfx } from '@/lib/sfx';

import { EnabledCorner } from '../components/enabled-corner';
import { TraitCrossOut } from '../components/trait-cross-out';
import { TokenBoard } from '../components/card-token-board';
import { type PlacedToken, TOKEN_COLORS } from '../components/card-tokens';

/** One page of an origin preview (#297): a forged card image (or a live node, pre-forge), plus the
 *  optional per-line strike-through for a mixed-ancestry card (catalogId + which trait is crossed). */
export interface OriginPage {
  source?: number | { uri: string };
  custom?: ReactNode;
  catalogId?: string;
  crossTrait?: 1 | 2;
}

/**
 * Origin card preview (#242 item 4 / #297) — the Subclass / Ancestry / Community badges spawn a
 * STANDALONE copy of that card here (never touching the carousel). It now supports MULTIPLE pages
 * (#297): the Subclass badge shows the subclass then the class card + every feature page; a mixed
 * ancestry shows both ancestry cards, each with the trait it loses struck through. Tap the left/right
 * half of the card to page; diamond dots sit between the card and the controls (so Equip/Close never
 * collide with them). No rounded card corners. Equip/unequip is bound to the primary origin card id.
 */
export function OriginCardPreview({
  pages,
  label,
  enabled,
  onToggle,
  onClose,
  tokens,
  drawerColor,
  onPlaceToken,
  onRemoveToken,
  onUpdateToken,
  onSetTokenColor,
}: {
  pages: OriginPage[];
  label: string;
  enabled: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** Card tokens (#244): a screen-space board lets the player decorate the primary card too. */
  tokens?: PlacedToken[];
  drawerColor?: string;
  onPlaceToken?: (t: PlacedToken) => void;
  onRemoveToken?: (id: string) => void;
  onUpdateToken?: (id: string, patch: Partial<PlacedToken>) => void;
  onSetTokenColor?: (color: string) => void;
}) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cardW = Math.min(290, screenW * 0.72, (screenH * 0.6 * 5) / 7);
  const cardH = (cardW * 7) / 5;

  const multi = pages.length > 1;
  const [pageIdx, setPageIdx] = useState(0);
  const page = pages[Math.min(pageIdx, pages.length - 1)] ?? pages[0];
  const flip = (dir: number) => {
    if (!multi) return;
    playSfx('gearScroll2');
    setPageIdx((p) => (p + dir + pages.length) % pages.length);
  };

  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = reduced ? 1 : withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) });
  }, [p, reduced]);
  // #258: the origin badges open a fullscreen-style card → use the same enter/leave chimes.
  useEffect(() => {
    playSfx('cardFullscreenEnter');
  }, []);
  const close = () => {
    playSfx('transitionIconFilled');
    onClose();
  };
  const cardStyle = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 40 }, { scale: 0.9 + 0.1 * p.value }] }));
  const ctrlStyle = useAnimatedStyle(() => ({ opacity: p.value }));
  // The card isn't screen-centered (the controls sit below it), so MEASURE its real on-screen box and
  // anchor the token board to that — otherwise tokens would land offset from the card (#244).
  const [cardRect, setCardRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
      {/* tap-catcher (SheetDim darkens the screen). #258r3: occluding bg + collapsable so GH's hit-test
          can't reach the stat tracks underneath. tap outside to close. */}
      <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,8,13,0.01)' }} collapsable={false} onPress={close} accessibilityRole="button" accessibilityLabel="Close" />
      <Animated.View
        style={[{ width: cardW, height: cardH }, cardStyle]}
        pointerEvents={multi ? 'box-none' : 'none'}
        onLayout={(e) => { const l = e.nativeEvent.layout; setCardRect({ left: l.x, top: l.y, width: l.width, height: l.height }); }}>
        {/* NO borderRadius (#297): no card in this UI has rounded corners. */}
        {page?.source ? (
          <Image source={page.source} style={{ width: '100%', height: '100%' }} contentFit="contain" transition={120} />
        ) : page?.custom ? (
          <View style={{ width: '100%', height: '100%', overflow: 'hidden' }}>{page.custom}</View>
        ) : null}
        {/* mixed-ancestry strike-through (#265/#297): the trait this card loses, drawn over its image. */}
        {page?.crossTrait && page?.catalogId ? <TraitCrossOut width={cardW} height={cardH} catalogId={page.catalogId} crossedTrait={page.crossTrait} /> : null}
        {/* equipped mark on the PRIMARY card (page 0) — equip is bound to that card. */}
        {enabled && pageIdx === 0 ? <EnabledCorner width={cardW} height={cardH} /> : null}
        {/* page flip: tap the left/right half of the card (#297) — only for multi-page previews. */}
        {multi ? (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={(e) => flip(e.nativeEvent.locationX < cardW / 2 ? -1 : 1)}
            accessibilityRole="button"
            accessibilityLabel={`Page ${pageIdx + 1} of ${pages.length}. Tap left or right to turn the page.`}
          />
        ) : null}
      </Animated.View>
      {/* page dots in their OWN row between the card and the controls (#297): never overlapping Equip. */}
      {multi ? (
        <Animated.View style={[{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12, height: 9, alignItems: 'center' }, ctrlStyle]} pointerEvents="none">
          {pages.map((_, i) => (
            <View key={i} style={{ width: 7, height: 7, transform: [{ rotate: '45deg' }], backgroundColor: i === pageIdx ? Rune.red : 'rgba(147,142,136,0.55)' }} />
          ))}
        </Animated.View>
      ) : null}
      <Animated.View style={[{ marginTop: multi ? 12 : 18, width: cardW, gap: 10 }, ctrlStyle]}>
        <RuneButton
          label={enabled ? 'Unequip' : 'Equip'}
          kind={enabled ? 'secondary' : 'primary'}
          height={46}
          muteSfx
          onPress={onToggle}
          accessibilityLabel={`${enabled ? 'Unequip' : 'Equip'} ${label}`}
        />
        <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" style={{ alignSelf: 'center', padding: 6 }}>
          <Text style={{ color: Rune.muted, fontSize: 12.5, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>Close</Text>
        </Pressable>
      </Animated.View>
      {/* token board (#244): the same drawer + draggable tokens, in screen space (scale 1). Only on the
          primary card (page 0) — tokens belong to that card id. */}
      {cardRect && pageIdx === 0 && onPlaceToken && onRemoveToken && onSetTokenColor ? (
        <TokenBoard
          cardRect={cardRect}
          width={screenW}
          height={screenH}
          drawerTop={Math.max(insets.top, 24) + 16}
          tokens={tokens ?? []}
          drawerColor={drawerColor || TOKEN_COLORS[0]}
          scale={1}
          onPlace={onPlaceToken}
          onRemove={onRemoveToken}
          onUpdate={onUpdateToken}
          onSetDrawerColor={onSetTokenColor}
        />
      ) : null}
    </View>
  );
}
