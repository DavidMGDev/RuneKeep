import { memo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Body, Rune } from '@/constants/theme';
import { playSfx } from '@/lib/sfx';

import { useCarousel } from '../carousel-context';
import { cardMenuOptions } from '../card-menu';
import { FAVORITES_CATEGORY } from '@/lib/favorites';
import { cardMenuAngle, CARD_MENU_PH, CARD_MENU_PW, CARD_MENU_RIN, CARD_MENU_RLABEL, CARD_MENU_ROUT } from '../carousel-geometry';

/**
 * The Golden Gear Edit card-hold radial (v0.10.7) — the float menu's full-circle cousin. Hold a raised
 * card and this spray-wheel blooms around it (kept inside the screen edges); drag toward an option and
 * release to fire it, release in the middle to cancel. The carousel pan drives the finger/highlight
 * shared values; this only RENDERS (wedges + labels) and dispatches on the highlight the pan reports.
 * Rendered INSIDE the carousel's DesignStage container, so all coords are design px.
 */

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
  const { cardMenuOpen, cardMenuAnchorX, cardMenuAnchorY, cardMenuFingerX, cardMenuFingerY, cardMenuHighlight, category, nfcAvailable } = useCarousel();
  const options = cardMenuOptions(category === FAVORITES_CATEGORY, nfcAvailable);
  const n = options.length;

  // Mount only while the wheel is animating open/closed (mirrors the sheet dims): a JS flag lit by the
  // shared open value, so a closed menu costs nothing and there's no per-frame SVG under the edit dim.
  const [visible, setVisible] = useState(false);
  useAnimatedReaction(
    () => cardMenuOpen.value > 0.001,
    (v, prev) => { if (v !== prev) runOnJS(setVisible)(v); },
  );
  // The lit wedge, synced to JS so the sectors re-render (a tick per new wedge, like the float menu).
  const [hl, setHl] = useState(-1);
  useAnimatedReaction(
    () => cardMenuHighlight.value,
    (v, prev) => {
      if (v !== prev) {
        runOnJS(setHl)(v);
        if (v >= 0) runOnJS(playSfx)('floatMenuHighlight');
      }
    },
  );

  // The whole wheel rides the anchor + blooms with open (scale 0.62 → 1, fade in).
  const wheel = useAnimatedStyle(() => {
    const p = cardMenuOpen.value;
    return { opacity: p, transform: [{ translateX: cardMenuAnchorX.value }, { translateY: cardMenuAnchorY.value }, { scale: 0.62 + 0.38 * p }] };
  });
  // A soft extra dim so the wheel reads over the busy edit row (on top of the edit veil).
  const dim = useAnimatedStyle(() => ({ opacity: cardMenuOpen.value * 0.28 }));
  // Connector line from the anchor toward the finger, + the finger dot (drag feedback). ONE animated
  // style each — a second `transform` in the style array would clobber the first.
  const line = useAnimatedStyle(() => {
    const ax = cardMenuAnchorX.value;
    const ay = cardMenuAnchorY.value;
    const dx = cardMenuFingerX.value - ax;
    const dy = cardMenuFingerY.value - ay;
    return { width: Math.hypot(dx, dy), opacity: cardMenuOpen.value, transform: [{ translateX: ax }, { translateY: ay }, { rotateZ: `${Math.atan2(dy, dx)}rad` }] };
  });
  const dot = useAnimatedStyle(() => ({ opacity: cardMenuOpen.value, transform: [{ translateX: cardMenuFingerX.value - 7 }, { translateY: cardMenuFingerY.value - 7 }] }));

  if (!visible || n === 0) return null;
  const half = 360 / n / 2;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 6000 }]} pointerEvents="none">
      <Animated.View style={[{ position: 'absolute', top: -400, bottom: -400, left: -400, right: -400, backgroundColor: '#06080d' }, dim]} />
      {/* connector + dot live in the design box (anchor/finger are design px) */}
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, height: 3, marginTop: -1.5, backgroundColor: Rune.goldBright, transformOrigin: 'left center' }, line]} />
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: Rune.goldBright }, dot]} />
      {/* the wheel: wedge ring + label pucks, translated to the anchor */}
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: 0, height: 0 }, wheel]}>
        <View style={{ position: 'absolute', left: -R, top: -R, width: 2 * R, height: 2 * R }}>
          <Svg width={2 * R} height={2 * R}>
            {options.map((o, i) => {
              const c = cardMenuAngle(i, n);
              const sel = hl === i;
              return (
                <Path
                  key={o.kind}
                  d={sector(c - half + 1.5, c + half - 1.5, CARD_MENU_RIN, R)}
                  fill={sel ? 'rgba(200,27,24,0.5)' : 'rgba(20,24,31,0.6)'}
                  stroke={sel ? Rune.goldBright : 'rgba(218,162,73,0.5)'}
                  strokeWidth={sel ? 2 : 1.2}
                  strokeLinejoin="round"
                />
              );
            })}
          </Svg>
        </View>
        {options.map((o, i) => <Puck key={o.kind} label={o.label} angle={cardMenuAngle(i, n)} lit={hl === i} />)}
      </Animated.View>
    </View>
  );
}

const Puck = memo(function Puck({ label, angle, lit }: { label: string; angle: number; lit: boolean }) {
  const a = (angle * Math.PI) / 180;
  const x = CARD_MENU_RLABEL * Math.cos(a);
  const y = CARD_MENU_RLABEL * Math.sin(a);
  return (
    <View
      style={{
        position: 'absolute',
        left: x - CARD_MENU_PW / 2,
        top: y - CARD_MENU_PH / 2,
        width: CARD_MENU_PW,
        height: CARD_MENU_PH,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 9,
        backgroundColor: lit ? 'rgba(46,16,16,0.96)' : 'rgba(12,14,19,0.94)',
        borderWidth: 1.4,
        borderColor: lit ? Rune.goldBright : Rune.goldEdge,
      }}>
      <Text numberOfLines={1} style={{ color: lit ? Rune.goldBright : Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.4, textTransform: 'uppercase' }}>
        {label}
      </Text>
    </View>
  );
});
