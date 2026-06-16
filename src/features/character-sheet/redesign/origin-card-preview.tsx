import { useEffect, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RuneButton } from '@/components/rune-button';
import { Body, Rune } from '@/constants/theme';
import { playSfx } from '@/lib/sfx';

import { EnabledCorner } from '../components/enabled-corner';
import { TokenBoard } from '../components/card-token-board';
import { type PlacedToken, TOKEN_COLORS } from '../components/card-tokens';

/**
 * Origin card preview (#242 item 4) — the Subclass / Ancestry / Community badges no longer drive the
 * carousel. Instead they spawn a STANDALONE copy of that card here: it fades + rises in (like a card
 * lifting out of the hand) over the shared sheet dim, and can be equipped / unequipped exactly like in
 * the carousel — it's bound to the SAME enabled-card id, so the corner mark + modifiers stay in sync.
 * The live carousel and its current category are never touched.
 */
export function OriginCardPreview({
  source,
  label,
  enabled,
  onToggle,
  onClose,
  tokens,
  drawerColor,
  drawerX,
  onPlaceToken,
  onRemoveToken,
  onSetTokenColor,
  onMoveTokenDrawer,
}: {
  source: number | { uri: string };
  label: string;
  enabled: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** Card tokens (#244): a screen-space board lets the player decorate this card too. */
  tokens?: PlacedToken[];
  drawerColor?: string;
  drawerX?: number;
  onPlaceToken?: (t: PlacedToken) => void;
  onRemoveToken?: (id: string) => void;
  onSetTokenColor?: (color: string) => void;
  onMoveTokenDrawer?: (x: number) => void;
}) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cardW = Math.min(290, screenW * 0.72, (screenH * 0.6 * 5) / 7);
  const cardH = (cardW * 7) / 5;

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
      <Animated.View style={[{ width: cardW, height: cardH }, cardStyle]} pointerEvents="none" onLayout={(e) => { const l = e.nativeEvent.layout; setCardRect({ left: l.x, top: l.y, width: l.width, height: l.height }); }}>
        <Image source={source} style={{ width: '100%', height: '100%', borderRadius: 10 }} contentFit="contain" transition={120} />
        {enabled ? <EnabledCorner width={cardW} height={cardH} /> : null}
      </Animated.View>
      <Animated.View style={[{ marginTop: 18, width: cardW, gap: 10 }, ctrlStyle]}>
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
      {/* token board (#244): the same drawer + draggable tokens, in screen space (scale 1) */}
      {cardRect && onPlaceToken && onRemoveToken && onSetTokenColor && onMoveTokenDrawer ? (
        <TokenBoard
          cardRect={cardRect}
          width={screenW}
          height={screenH}
          drawerTop={Math.max(insets.top, 24) + 16}
          tokens={tokens ?? []}
          drawerColor={drawerColor || TOKEN_COLORS[0]}
          drawerX={drawerX ?? 0.5}
          scale={1}
          onPlace={onPlaceToken}
          onRemove={onRemoveToken}
          onSetDrawerColor={onSetTokenColor}
          onMoveDrawer={onMoveTokenDrawer}
        />
      ) : null}
    </View>
  );
}
