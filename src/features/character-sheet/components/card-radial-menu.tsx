import { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { Rune } from '@/constants/theme';

import { useCarousel } from '../carousel-context';
import { cardMenuOptions, type CardMenuKind } from '../card-menu';
import { FAVORITES_CATEGORY } from '@/lib/favorites';
import { cardMenuAngle, CARD_MENU_BTN, CARD_MENU_HUB, CARD_MENU_RING } from '../carousel-geometry';

/**
 * The Golden Gear Edit card-hold radial (v0.11.0 rework) — a MODAL wheel of round icon buttons that
 * blooms around the held card. Hold a card to open it; it stays open (finger stillness never closes it),
 * tap an icon to fire the action, or tap the dim backdrop to cancel. No rectangular panels, no text —
 * just icons (items 7 + 10). The carousel pan freezes while it's open, so cards can't be selected behind
 * it. Rendered INSIDE the carousel's DesignStage container, so all coords are design px.
 */
export function CardRadialMenu() {
  const { cardMenuOpen, cardMenuAnchorX, cardMenuAnchorY, category, nfcAvailable, selectionAllFavorited, selectCardMenu, closeCardMenu } = useCarousel();
  const options = cardMenuOptions(category === FAVORITES_CATEGORY, nfcAvailable, selectionAllFavorited);
  const n = options.length;

  // Mount only while the wheel is animating open/closed (mirrors the sheet dims): a JS flag lit by the
  // shared open value, so a closed menu costs nothing and there's no per-frame SVG under the edit dim.
  const [visible, setVisible] = useState(false);
  useAnimatedReaction(
    () => cardMenuOpen.value > 0.001,
    (v, prev) => { if (v !== prev) runOnJS(setVisible)(v); },
  );

  // Backdrop dim (fades with the wheel) + the wheel itself (rides the anchor, blooms scale 0.7→1).
  const dim = useAnimatedStyle(() => ({ opacity: cardMenuOpen.value * 0.5 }));
  const wheel = useAnimatedStyle(() => {
    const p = cardMenuOpen.value;
    return { opacity: p, transform: [{ translateX: cardMenuAnchorX.value }, { translateY: cardMenuAnchorY.value }, { scale: 0.7 + 0.3 * p }] };
  });

  if (!visible || n === 0) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 6000 }]} pointerEvents="box-none">
      {/* backdrop: darkens the busy edit row AND catches a tap-outside to cancel (item 3 + item 7). */}
      <Pressable style={StyleSheet.absoluteFill} onPress={closeCardMenu} accessibilityRole="button" accessibilityLabel="Close menu">
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#06080d' }, dim]} />
      </Pressable>
      {/* the wheel: a decorative hub + a ring of round icon buttons, translated to the anchor. */}
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: 0, height: 0 }, wheel]} pointerEvents="box-none">
        <View style={{ position: 'absolute', left: -CARD_MENU_HUB, top: -CARD_MENU_HUB, width: 2 * CARD_MENU_HUB, height: 2 * CARD_MENU_HUB, borderRadius: CARD_MENU_HUB, backgroundColor: 'rgba(12,14,19,0.92)', borderWidth: 1.4, borderColor: Rune.goldEdge }} pointerEvents="none" />
        {options.map((o, i) => (
          <MenuButton key={o.kind} kind={o.kind} allFav={selectionAllFavorited} label={o.label} angle={cardMenuAngle(i, n)} onPress={() => selectCardMenu(i)} />
        ))}
      </Animated.View>
    </View>
  );
}

const MenuButton = memo(function MenuButton({ kind, allFav, label, angle, onPress }: { kind: CardMenuKind; allFav: boolean; label: string; angle: number; onPress: () => void }) {
  const a = (angle * Math.PI) / 180;
  const x = CARD_MENU_RING * Math.cos(a);
  const y = CARD_MENU_RING * Math.sin(a);
  const danger = kind === 'delete';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => ({
        position: 'absolute',
        left: x - CARD_MENU_BTN / 2,
        top: y - CARD_MENU_BTN / 2,
        width: CARD_MENU_BTN,
        height: CARD_MENU_BTN,
        borderRadius: CARD_MENU_BTN / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? (danger ? 'rgba(120,20,18,0.98)' : 'rgba(46,34,14,0.98)') : 'rgba(12,14,19,0.96)',
        borderWidth: 1.6,
        borderColor: pressed ? Rune.goldBright : danger ? 'rgba(200,60,50,0.75)' : Rune.goldEdge,
        transform: [{ scale: pressed ? 1.12 : 1 }],
      })}>
      <CardMenuIcon kind={kind} allFav={allFav} size={28} color={danger ? '#e8837a' : Rune.goldText} />
    </Pressable>
  );
});

/** SVG glyph per option (item 10: icons, not text). 24×24 viewBox, stroked in the button's colour. */
function CardMenuIcon({ kind, allFav, size, color }: { kind: CardMenuKind; allFav: boolean; size: number; color: string }) {
  const sw = 1.7;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {kind === 'duplicate' ? (
        <>
          <Path d="M9 9 H19 V19 H9 Z" fill="none" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Path d="M6 15 H5 V5 H15 V6" fill="none" stroke={color} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" />
        </>
      ) : kind === 'move' ? (
        <>
          <Path d="M12 4 V20 M4 12 H20" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M12 3 L15 6 M12 3 L9 6 M12 21 L15 18 M12 21 L9 18 M3 12 L6 9 M3 12 L6 15 M21 12 L18 9 M21 12 L18 15" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : kind === 'delete' ? (
        <>
          <Path d="M5 7 H19 M9 7 V5 H15 V7 M7 7 L8 20 H16 L17 7" fill="none" stroke={color} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" />
          <Path d="M10 10 V17 M14 10 V17" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </>
      ) : kind === 'nfc' ? (
        <>
          <Path d="M7 15 C5.5 13.5 5.5 10.5 7 9" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M10 17.5 C7 15 7 9 10 6.5" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M13 19 C8.5 15.5 8.5 8.5 13 5" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Circle cx={17} cy={12} r={1.6} fill={color} />
        </>
      ) : (
        // favorite / unfavorite — a star; a "minus" bar overlays it when the selection is all-favorited.
        <>
          <Path d="M12 4 L14.3 9 L19.6 9.6 L15.6 13.2 L16.7 18.5 L12 15.8 L7.3 18.5 L8.4 13.2 L4.4 9.6 L9.7 9 Z" fill={allFav ? color : 'none'} stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          {allFav ? <Path d="M8.5 12 H15.5" stroke={Rune.ink} strokeWidth={2.2} strokeLinecap="round" /> : null}
        </>
      )}
    </Svg>
  );
}
