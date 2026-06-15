/**
 * Card tokens (#244) — decorative "buttons" the player drags onto a fullscreen card. They imitate
 * grandma's sewing buttons: a round disc with a soft bevel, a drop shadow, and four center holes.
 * Purely cosmetic — tokens NEVER feed the modifier engine or change a card's functionality.
 *
 * The data shape + pure colour helpers live in `card-tokens-data.ts` (re-exported here); this module
 * owns the visuals: the interactive HD `TokenButton` (SVG bevel + shadow) and the cheap
 * `BakedTokenLayer` that rides every carousel slot as a flat LOD so a card covered in tokens still
 * composites for almost nothing.
 */
import { memo, useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { type PlacedToken, TOKEN_FRAC, tokenFill } from './card-tokens-data';

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
 * One token, drawn as a bevelled sewing button. `lod` draws a cheap flat disc (no gradient, no
 * shadow) for the carousel; the interactive HD variant adds a radial highlight + a drop shadow so the
 * focused card's tokens read as little 3D buttons.
 */
export const TokenButton = memo(function TokenButton({ size, fill, lod = false }: { size: number; fill: string; lod?: boolean }) {
  const gid = useId();
  const c = size / 2;
  const R = size * 0.46;
  const face = R * 0.9;
  const hole = R * 0.12;
  const off = R * 0.24;
  const rim = shade(fill, -0.3);
  const holeColor = shade(fill, -0.55);
  const svg = (
    <Svg width={size} height={size} pointerEvents="none">
      {!lod ? (
        <Defs>
          <RadialGradient id={gid} cx="36%" cy="30%" r="78%">
            <Stop offset="0" stopColor={shade(fill, 0.45)} />
            <Stop offset="0.62" stopColor={fill} />
            <Stop offset="1" stopColor={shade(fill, -0.16)} />
          </RadialGradient>
        </Defs>
      ) : null}
      {/* rim (catches the shadow), then the button face */}
      <Circle cx={c} cy={c} r={R} fill={rim} />
      <Circle cx={c} cy={c} r={face} fill={lod ? fill : `url(#${gid})`} />
      {/* four stitch holes */}
      <Circle cx={c - off} cy={c - off} r={hole} fill={holeColor} />
      <Circle cx={c + off} cy={c - off} r={hole} fill={holeColor} />
      <Circle cx={c - off} cy={c + off} r={hole} fill={holeColor} />
      <Circle cx={c + off} cy={c + off} r={hole} fill={holeColor} />
    </Svg>
  );
  if (lod) return svg;
  // HD: a soft drop shadow under the disc sells the 3D button (elevation on Android, shadow on iOS).
  return (
    <View
      style={{
        width: size,
        height: size,
        shadowColor: '#000',
        shadowOpacity: 0.4,
        shadowRadius: size * 0.1,
        shadowOffset: { width: 0, height: size * 0.07 },
        elevation: Math.max(2, Math.round(size * 0.12)),
      }}>
      {svg}
    </View>
  );
});

/**
 * A LOD token (#244): a plain-View disc (NO SVG, gradient, or shadow) so the whole deck's baked
 * tokens composite for almost nothing — every carousel slot always mounts, so this runs across the
 * entire deck at once.
 */
const LodToken = memo(function LodToken({ size, fill }: { size: number; fill: string }) {
  const c = size / 2;
  const off = size * 0.22;
  const hole = size * 0.1;
  const holeColor = shade(fill, -0.55);
  const dot = (left: number, top: number) => ({ position: 'absolute' as const, left, top, width: hole, height: hole, borderRadius: hole / 2, backgroundColor: holeColor });
  return (
    <View style={{ width: size, height: size, borderRadius: c, backgroundColor: fill, borderWidth: size * 0.07, borderColor: shade(fill, -0.3) }}>
      <View style={dot(c - off - hole / 2, c - off - hole / 2)} />
      <View style={dot(c + off - hole / 2, c - off - hole / 2)} />
      <View style={dot(c - off - hole / 2, c + off - hole / 2)} />
      <View style={dot(c + off - hole / 2, c + off - hole / 2)} />
    </View>
  );
});

/**
 * The baked LOD layer (#244 item 9): every token on a card, drawn as flat discs, non-interactive.
 * Mounted INSIDE a carousel slot next to `EnabledCorner`, so it scales/translates with the slot and
 * stays visible through rise/switch transitions. Cheap enough to leave on for the whole deck.
 */
export const BakedTokenLayer = memo(function BakedTokenLayer({ tokens, cardW, cardH }: { tokens: PlacedToken[] | undefined; cardW: number; cardH: number }) {
  if (!tokens || tokens.length === 0) return null;
  const size = cardW * TOKEN_FRAC;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {tokens.map((t) => (
        <View key={t.id} style={{ position: 'absolute', left: t.x * cardW - size / 2, top: t.y * cardH - size / 2 }}>
          <LodToken size={size} fill={tokenFill(t)} />
        </View>
      ))}
    </View>
  );
});
