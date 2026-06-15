/**
 * Card tokens (#244) — decorative "buttons" the player drags onto a fullscreen card. They imitate
 * grandma's sewing buttons: a round disc with a soft bevel, a baked-in drop shadow, and four center
 * holes. Purely cosmetic — tokens NEVER feed the modifier engine or change a card's functionality.
 *
 * The data shape + pure helpers live in `card-tokens-data.ts` (re-exported here); this module owns the
 * visual. There is ONE `TokenButton` used at every LOD — the SAME bevelled button near and far, it
 * just scales down with its slot (so a deck-far token is cheaper without ever looking different). No
 * separate flat LOD, no native elevation (the shadow is drawn inside the SVG) — both of which made
 * tokens look wrong far away and lag while "becoming HD".
 */
import { memo, useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { kindScale, type PlacedToken, TOKEN_FRAC, tokenFill } from './card-tokens-data';

export * from './card-tokens-data';

/** Mix a #rrggbb colour toward white (amt > 0) or black (amt < 0). */
function shade(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 0xff;
  let g = (n >> 8) & 0xff;
  let b = n & 0xff;
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  r = Math.round(r + (t - r) * p);
  g = Math.round(g + (t - g) * p);
  b = Math.round(b + (t - b) * p);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/**
 * One token, drawn as a bevelled sewing button — rim + radial-gradient face + four holes, over a soft
 * shadow ellipse baked into the SVG (so it reads as 3D at every size with no platform shadow cost).
 * The viewBox is padded so the shadow + the disc never clip. Used by the baked deck layer AND the
 * interactive board — identical at all sizes.
 */
export const TokenButton = memo(function TokenButton({ size, fill }: { size: number; fill: string }) {
  const gid = useId();
  // Author the button in a 100-unit box (12 units of padding all round for the shadow), scaled to size.
  const VB = 124;
  const c = VB / 2;
  const R = 50;
  const face = R * 0.9;
  const hole = R * 0.13;
  const off = R * 0.25;
  const rim = shade(fill, -0.32);
  const holeColor = shade(fill, -0.55);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`} pointerEvents="none">
      <Defs>
        <RadialGradient id={gid} cx="36%" cy="30%" r="80%">
          <Stop offset="0" stopColor={shade(fill, 0.5)} />
          <Stop offset="0.6" stopColor={fill} />
          <Stop offset="1" stopColor={shade(fill, -0.18)} />
        </RadialGradient>
      </Defs>
      {/* soft drop shadow, offset down */}
      <Ellipse cx={c} cy={c + R * 0.2} rx={R * 1.02} ry={R * 0.98} fill="rgba(0,0,0,0.32)" />
      {/* rim, then the gradient face */}
      <Circle cx={c} cy={c} r={R} fill={rim} />
      <Circle cx={c} cy={c} r={face} fill={`url(#${gid})`} />
      {/* four stitch holes */}
      <Circle cx={c - off} cy={c - off} r={hole} fill={holeColor} />
      <Circle cx={c + off} cy={c - off} r={hole} fill={holeColor} />
      <Circle cx={c - off} cy={c + off} r={hole} fill={holeColor} />
      <Circle cx={c + off} cy={c + off} r={hole} fill={holeColor} />
    </Svg>
  );
});

/**
 * The baked token layer (#244): every token on a card. Same `TokenButton` as the board, so it looks
 * identical in the deck and through rise/switch transitions (it rides the slot, next to
 * `EnabledCorner`). Per-kind sizes give the three defaults a subtle size step.
 */
export const BakedTokenLayer = memo(function BakedTokenLayer({ tokens, cardW, cardH }: { tokens: PlacedToken[] | undefined; cardW: number; cardH: number }) {
  if (!tokens || tokens.length === 0) return null;
  const base = cardW * TOKEN_FRAC;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {tokens.map((t) => {
        const size = base * kindScale(t.kind);
        return (
          <View key={t.id} style={{ position: 'absolute', left: t.x * cardW - size / 2, top: t.y * cardH - size / 2 }}>
            <TokenButton size={size} fill={tokenFill(t)} />
          </View>
        );
      })}
    </View>
  );
});
