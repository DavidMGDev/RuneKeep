import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RuneButton } from '@/components/rune-button';
import { Body, Rune } from '@/constants/theme';
import { focusHaptic } from '@/lib/haptics';
import { playSfx } from '@/lib/sfx';
import { PAGE_FLIP_VOLUME } from '@/lib/sfx-config';

import { EnabledCorner } from '../components/enabled-corner';
import { TraitCrossOut } from '../components/trait-cross-out';
import { TokenBoard } from '../components/card-token-board';
import { type PlacedToken, TOKEN_COLORS } from '../components/card-tokens';

/** Press-and-hold duration to toggle equip on the preview (#318) — matches the carousel's HOLD_MS. */
const HOLD_MS = 760;

/** One page of an origin preview (#297): a forged card image (or a live node, pre-forge), plus the
 *  optional per-line strike-through for a mixed-ancestry card (catalogId + which trait is crossed). */
export interface OriginPage {
  source?: number | { uri: string };
  custom?: ReactNode;
  catalogId?: string;
  crossTrait?: 1 | 2;
  /** #320: the card id this PAGE equips. Each page equips independently (a mixed ancestry's two cards
   *  enable separately); pages sharing an id (e.g. the class-feature pages) sync. Absent → not equippable. */
  enableId?: string;
}

/**
 * Origin card preview (#242 item 4 / #297) — the Subclass / Ancestry / Community badges spawn a
 * STANDALONE copy of that card here (never touching the carousel). It now supports MULTIPLE pages
 * (#297): the Subclass badge shows the subclass then the class card + every feature page; a mixed
 * ancestry shows both ancestry cards, each with the trait it loses struck through. Tap the left/right
 * half of the card to page; diamond dots sit between the card and the controls (so Equip/Close never
 * collide with them). No rounded card corners. Equip/unequip targets the CURRENT page's card id (#320),
 * so each page (e.g. a mixed ancestry's two cards) equips independently.
 */
export function OriginCardPreview({
  pages,
  label,
  enabledIds,
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
  /** #320: the set of enabled card ids — the preview reads/toggles the CURRENT page's `enableId`. */
  enabledIds: Set<string>;
  onToggle: (id: string) => void;
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
  // #320: equip targets THIS page's card — each page enables independently (or syncs when pages share an id).
  const curEnableId = page?.enableId;
  const enabled = !!curEnableId && enabledIds.has(curEnableId);
  const flip = useCallback((dir: number) => {
    if (!multi) return;
    // #306: match the carousel's QUIET multi-page flip (was full volume here, far too loud on the badges).
    playSfx('gearScroll2', { volume: PAGE_FLIP_VOLUME });
    setPageIdx((prev) => (prev + dir + pages.length) % pages.length);
  }, [multi, pages.length]);

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

  // #318: behave like the carousel — PRESS-AND-HOLD the card to equip/unequip it (a bottom-to-top gold
  // scan-fill, then the corner check). The Equip button stays as an explicit alternative. A quick tap
  // still turns the page on a multi-page preview.
  const holdProgress = useSharedValue(0);
  const commitToggle = useCallback(() => { if (curEnableId) { onToggle(curEnableId); focusHaptic(); } }, [onToggle, curEnableId]);
  const hold = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(HOLD_MS)
        .maxDistance(12)
        .onBegin(() => {
          'worklet';
          // quartic ease-in: barely moves in the first ~40%, so a quick tap (page flip) never starts it
          holdProgress.value = withTiming(1, { duration: HOLD_MS, easing: Easing.in(Easing.poly(4)) });
        })
        .onStart(() => {
          'worklet';
          runOnJS(commitToggle)();
          holdProgress.value = withTiming(0, { duration: 240 }); // snap out → reveal the corner check
        })
        .onFinalize(() => {
          'worklet';
          cancelAnimation(holdProgress);
          if (holdProgress.value !== 0) holdProgress.value = withTiming(0, { duration: 160 });
        }),
    [commitToggle, holdProgress],
  );
  const tapFlip = useMemo(
    () => Gesture.Tap().maxDuration(250).onEnd((e) => { 'worklet'; if (multi) runOnJS(flip)(e.x < cardW / 2 ? -1 : 1); }),
    [multi, cardW, flip],
  );
  const cardGesture = useMemo(() => Gesture.Race(hold, tapFlip), [hold, tapFlip]);
  const fillStyle = useAnimatedStyle(() => ({ height: holdProgress.value * cardH, opacity: Math.min(1, holdProgress.value * 14) }));
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
        pointerEvents="box-none"
        onLayout={(e) => { const l = e.nativeEvent.layout; setCardRect({ left: l.x, top: l.y, width: l.width, height: l.height }); }}>
        {/* hold-to-equip + tap-to-flip (#318): one gesture surface over the card, like the carousel. */}
        <GestureDetector gesture={cardGesture}>
          <View
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel={`${label}. ${enabled ? 'Equipped' : 'Not equipped'}. Hold to ${enabled ? 'unequip' : 'equip'}.${multi ? ` Page ${pageIdx + 1} of ${pages.length} — tap left or right to turn the page.` : ''}`}>
            {/* NO borderRadius (#297): no card in this UI has rounded corners. */}
            {page?.source ? (
              <Image source={page.source} style={{ width: '100%', height: '100%' }} contentFit="contain" transition={120} />
            ) : page?.custom ? (
              <View style={{ width: '100%', height: '100%', overflow: 'hidden' }}>{page.custom}</View>
            ) : null}
            {/* mixed-ancestry strike-through (#265/#297): the trait this card loses, drawn over its image. */}
            {page?.crossTrait && page?.catalogId ? <TraitCrossOut width={cardW} height={cardH} catalogId={page.catalogId} crossedTrait={page.crossTrait} /> : null}
            {/* press-and-hold scan-fill (#318): a translucent gold sheet rising from the bottom. */}
            <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(224,181,99,0.45)', borderTopWidth: 2, borderTopColor: Rune.goldBright }, fillStyle]} />
            {/* equipped mark on whichever page's card is enabled (#320) — each page tracks its own card. */}
            {enabled ? <EnabledCorner width={cardW} height={cardH} /> : null}
          </View>
        </GestureDetector>
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
        {curEnableId ? (
          <RuneButton
            label={enabled ? 'Unequip' : 'Equip'}
            kind={enabled ? 'secondary' : 'primary'}
            height={46}
            muteSfx
            onPress={() => onToggle(curEnableId)}
            accessibilityLabel={`${enabled ? 'Unequip' : 'Equip'} ${label}`}
          />
        ) : null}
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
