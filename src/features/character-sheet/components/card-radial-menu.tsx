import { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { playSfx } from '@/lib/sfx';

import { useCarousel } from '../carousel-context';
import { cardMenuOptions, type CardMenuKind } from '../card-menu';
import { FAVORITES_CATEGORY } from '@/lib/favorites';
import { cardMenuAngle, CARD_MENU_ICON, CARD_MENU_RICON, CARD_MENU_RIN, CARD_MENU_ROUT } from '../carousel-geometry';

/**
 * The Golden Gear Edit card-hold radial (v0.11.1) — a SPRAY wheel, worked exactly like the sheet float
 * menu: hold a card → the wheel blooms → drag the finger to a wedge → release to fire (release in the
 * center/off the ring cancels). The carousel pan drives the finger + highlight shared values; this only
 * renders (wedges + connector + dot) and dispatches on the highlight the pan reports. Differences from
 * the float menu: options go ALL the way around, they're ICON-only, the icons are bigger, and the whole
 * thing is desaturated (light gray) to match the Edit Mode chrome. Rendered inside the carousel's
 * DesignStage container, so all coords are design px.
 */

// Desaturated (Edit Mode) palette.
const GRAY = '#C4C8D0';
const GRAY_LIT = '#F0F1F4';
const WEDGE = 'rgba(28,32,40,0.85)'; // v0.11.2: only ~15% transparent (was too see-through)
const WEDGE_LIT = 'rgba(74,82,92,0.92)';
const R = CARD_MENU_ROUT; // local SVG canvas is 2R×2R, centre at (R,R)

function sector(a0: number, a1: number, ri: number, ro: number): string {
  const p = (r: number, aDeg: number) => {
    const a = (aDeg * Math.PI) / 180;
    return [R + r * Math.cos(a), R + r * Math.sin(a)];
  };
  const [x0, y0] = p(ro, a0);
  const [x1, y1] = p(ro, a1);
  const [x2, y2] = p(ri, a1);
  const [x3, y3] = p(ri, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0},${y0} A${ro},${ro} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${ri},${ri} 0 ${large} 0 ${x3},${y3} Z`;
}

export function CardRadialMenu() {
  const { cardMenuOpen, cardMenuAnchorX, cardMenuAnchorY, cardMenuFingerX, cardMenuFingerY, cardMenuHighlight, category, nfcAvailable, selectionAllFavorited } = useCarousel();
  const options = cardMenuOptions(category === FAVORITES_CATEGORY, nfcAvailable, selectionAllFavorited);
  const n = options.length;

  const [visible, setVisible] = useState(false);
  useAnimatedReaction(
    () => cardMenuOpen.value > 0.001,
    (v, prev) => { if (v !== prev) runOnJS(setVisible)(v); },
  );
  const [hl, setHl] = useState(-1);
  useAnimatedReaction(
    () => cardMenuHighlight.value,
    (v, prev) => {
      if (v !== prev) {
        runOnJS(setHl)(v);
        if (v >= 0) runOnJS(playSfx)('floatMenuHighlight'); // a tick each time a wedge is entered
      }
    },
  );

  // A soft extra dim under the wheel (the edit veil is already dark), + the wheel riding the anchor.
  const dim = useAnimatedStyle(() => ({ opacity: cardMenuOpen.value * 0.28 }));
  const wheel = useAnimatedStyle(() => {
    const p = cardMenuOpen.value;
    return { opacity: p, transform: [{ translateX: cardMenuAnchorX.value }, { translateY: cardMenuAnchorY.value }, { scale: 0.7 + 0.3 * p }] };
  });
  // Connector line (anchor → finger) + finger dot — the drag feedback (like the float menu).
  const line = useAnimatedStyle(() => {
    const ax = cardMenuAnchorX.value;
    const ay = cardMenuAnchorY.value;
    const dx = cardMenuFingerX.value - ax;
    const dy = cardMenuFingerY.value - ay;
    return { width: Math.hypot(dx, dy), opacity: cardMenuOpen.value, transform: [{ translateX: ax }, { translateY: ay - 1.5 }, { rotateZ: `${Math.atan2(dy, dx)}rad` }] };
  });
  const dot = useAnimatedStyle(() => ({ opacity: cardMenuOpen.value, transform: [{ translateX: cardMenuFingerX.value - 7 }, { translateY: cardMenuFingerY.value - 7 }] }));

  if (!visible || n === 0) return null;
  const half = 360 / n / 2;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 6000 }]} pointerEvents="none">
      <Animated.View style={[{ position: 'absolute', top: -400, bottom: -400, left: -400, right: -400, backgroundColor: '#06080d' }, dim]} />
      {/* the wheel: wedge ring + icons, translated to the anchor */}
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: 0, height: 0 }, wheel]}>
        <View style={{ position: 'absolute', left: -R, top: -R, width: 2 * R, height: 2 * R }}>
          <Svg width={2 * R} height={2 * R}>
            {options.map((o, i) => {
              const c = cardMenuAngle(i, n);
              const sel = hl === i;
              return (
                <Path
                  key={o.kind}
                  d={sector(c - half + 1.4, c + half - 1.4, CARD_MENU_RIN, R)}
                  fill={sel ? WEDGE_LIT : WEDGE}
                  stroke={sel ? GRAY_LIT : 'rgba(196,200,208,0.5)'}
                  strokeWidth={sel ? 2 : 1.2}
                  strokeLinejoin="round"
                />
              );
            })}
          </Svg>
        </View>
        {options.map((o, i) => {
          const a = (cardMenuAngle(i, n) * Math.PI) / 180;
          const x = CARD_MENU_RICON * Math.cos(a);
          const y = CARD_MENU_RICON * Math.sin(a);
          return (
            <View key={o.kind} style={{ position: 'absolute', left: x - CARD_MENU_ICON / 2, top: y - CARD_MENU_ICON / 2, width: CARD_MENU_ICON, height: CARD_MENU_ICON, alignItems: 'center', justifyContent: 'center' }}>
              <CardMenuIcon kind={o.kind} allFav={selectionAllFavorited} size={CARD_MENU_ICON} color={hl === i ? GRAY_LIT : GRAY} />
            </View>
          );
        })}
      </Animated.View>
      {/* connector + dot live in the design box (anchor/finger are design px) */}
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, height: 3, backgroundColor: GRAY, transformOrigin: 'left center' }, line]} />
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: GRAY }, dot]} />
    </View>
  );
}

/** SVG glyph per option (item 10: icons, not text). Bigger than the float menu's. */
const CardMenuIcon = memo(function CardMenuIcon({ kind, allFav, size, color }: { kind: CardMenuKind; allFav: boolean; size: number; color: string }) {
  const sw = 1.9;
  if (kind === 'nfc') {
    // Reuse the NFC send-panel symbol (broadcast waves) — clear at this size (item 6).
    return (
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Path d="M12 16c8-6 16-6 24 0M14 23c6-4 14-4 20 0M16 30c4-3 12-3 16 0" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {kind === 'bulkEquip' ? (
        // item 8: bulk equip/unequip — a stack of cards with a check, reading "apply to all at once".
        <>
          <Path d="M6 4 H15 V15 H6 Z" fill="none" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Path d="M9 7 H18 V18 H9" fill="none" stroke={color} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" />
          <Path d="M11 12.5 L13.4 15 L18 9.4" fill="none" stroke={color} strokeWidth={sw + 0.3} strokeLinejoin="round" strokeLinecap="round" />
        </>
      ) : kind === 'move' ? (
        <>
          <Path d="M12 4 V20 M4 12 H20" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M12 3 L15 6 M12 3 L9 6 M12 21 L15 18 M12 21 L9 18 M3 12 L6 9 M3 12 L6 15 M21 12 L18 9 M21 12 L18 15" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : kind === 'delete' ? (
        // v0.12.1 item 9: thinner strokes + inner bars spaced wider so the trash reads cleanly.
        <>
          <Path d="M4.5 7 H19.5 M9.3 7 V4.6 H14.7 V7 M6.6 7 L7.6 20.5 H16.4 L17.4 7" fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
          <Path d="M9.4 10.4 V17 M14.6 10.4 V17" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
        </>
      ) : (
        // favorite / unfavorite — a star; unfavorite adds a DIAGONAL crossout. v0.12.1 item 9: bigger,
        // more-spread points + thinner strokes so it's legible at wheel size.
        <>
          <Path d="M12 3.2 L14.6 9 L20.6 9.5 L16 13.5 L17.3 19.4 L12 16.2 L6.7 19.4 L8 13.5 L3.4 9.5 L9.4 9 Z" fill={allFav ? color : 'none'} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
          {allFav ? <Path d="M4 20 L20 4" stroke={color} strokeWidth={2} strokeLinecap="round" /> : null}
        </>
      )}
    </Svg>
  );
});
