import { useEffect } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { RuneButton } from '@/components/rune-button';
import { Body, Rune } from '@/constants/theme';

import { EnabledCorner } from '../components/enabled-corner';

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
}: {
  source: number | { uri: string };
  label: string;
  enabled: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const cardW = Math.min(290, screenW * 0.72, (screenH * 0.6 * 5) / 7);
  const cardH = (cardW * 7) / 5;

  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = reduced ? 1 : withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) });
  }, [p, reduced]);
  const cardStyle = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 40 }, { scale: 0.9 + 0.1 * p.value }] }));
  const ctrlStyle = useAnimatedStyle(() => ({ opacity: p.value }));

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
      {/* transparent tap-catcher (the shared SheetDim darkens the screen); tap outside to close */}
      <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <Animated.View style={[{ width: cardW, height: cardH }, cardStyle]} pointerEvents="none">
        <Image source={source} style={{ width: '100%', height: '100%', borderRadius: 10 }} contentFit="contain" transition={120} />
        {enabled ? <EnabledCorner width={cardW} height={cardH} /> : null}
      </Animated.View>
      <Animated.View style={[{ marginTop: 18, width: cardW, gap: 10 }, ctrlStyle]}>
        <RuneButton
          label={enabled ? 'Unequip' : 'Equip'}
          kind={enabled ? 'secondary' : 'primary'}
          height={46}
          onPress={onToggle}
          accessibilityLabel={`${enabled ? 'Unequip' : 'Equip'} ${label}`}
        />
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" style={{ alignSelf: 'center', padding: 6 }}>
          <Text style={{ color: Rune.muted, fontSize: 12.5, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>Close</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
