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
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Display } from '@/constants/theme';
import { DIE_BOX, DIE_COLOR, DIE_INK, DIE_MAX, type DieType, dieGeometry, dieNumberFrac, dieNumberOffset, dualityGeometry, FEAR_INK, FEAR_PURPLE, HOPE_GOLD, HOPE_INK, placedKindScale, type PlacedToken, type TokenKind, TOKEN_FRAC, tokenFill } from './card-tokens-data';

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

/** Inset a polygon's points toward the box centre by `pad` units (for the rim/bevel rings). */
function scalePts(pts: string, pad: number): string {
  const c = DIE_BOX / 2;
  return pts.split(' ').map((p) => { const [x, y] = p.split(',').map(Number); return `${c + (x - c) * (1 - pad / 43)},${c + (y - c) * (1 - pad / 43)}`; }).join(' ');
}

/** A die token (#293) in the same sewing-button language: a silhouette drop-shadow, a rim ring, and a
 *  radial-gradient face in the die's shape, with the number drawn as a centred RN Text (crisp, reliably
 *  centred). Geometry comes from {@link dieGeometry} so the shape is centred in its slot and the number
 *  sits on the shape's centroid. */
/**
 * A die's NUMBER on its own (v0.32.0), in the same typography and at the same offset the die draws it.
 *
 * Split out so the roll can cross-fade two of them over one die face. Doing it any other way meant
 * either re-rendering the whole gradient SVG per frame or duplicating the offset maths, and the second
 * copy would drift from this one the first time a die's nudge was tuned.
 */
export const DieNumber = memo(function DieNumber({ size, dieType, value }: { size: number; dieType: DieType; value: number }) {
  const geo = dieGeometry(dieType);
  const noff = dieNumberOffset(dieType);
  const rim = shade(DIE_COLOR[dieType], -0.34);
  return (
    <Text
      allowFontScaling={false}
      style={{ color: DIE_INK[dieType] ?? '#F2ECDC', fontFamily: Display.black, fontSize: size * dieNumberFrac(dieType), textAlign: 'center', textShadowColor: rim, textShadowRadius: 1, textShadowOffset: { width: 0, height: 1 }, transform: [{ translateX: (noff.dx / DIE_BOX) * size }, { translateY: ((geo.numberY - DIE_BOX / 2 + noff.dy) / DIE_BOX) * size }] }}>
      {value}
    </Text>
  );
});

/**
 * ONE die of a duality pair (v0.34.4), drawn on its own so the caller can animate it on its own.
 *
 * Its whole face lives inside the shared {@link DIE_BOX} viewBox rather than a box of its own, which
 * is what keeps the two halves in the right places relative to each other however the token is
 * scaled. `spin` and `swell` are applied by the CALLER around this, because the two dice roll 50ms
 * apart and about separate centres.
 */
export const DualityDieFace = memo(function DualityDieFace({ size, side, white }: { size: number; side: 'hope' | 'fear'; /** v0.34.5: the critical's white wash, drawn OVER the face at rising opacity. */ white?: boolean }) {
  const gid = useId();
  const geo = dualityGeometry()[side];
  const fill = white ? '#FFFFFF' : side === 'hope' ? HOPE_GOLD : FEAR_PURPLE;
  const rim = shade(fill, side === 'hope' ? -0.34 : -0.3);
  const inset = (pad: number) => geo.points.split(' ').map((p) => { const [x, y] = p.split(',').map(Number); return `${geo.cx + (x - geo.cx) * (1 - pad / 31)},${geo.cy + (y - geo.cy) * (1 - pad / 31)}`; }).join(' ');
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${DIE_BOX} ${DIE_BOX}`} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id={gid} cx="36%" cy="30%" r="80%">
          <Stop offset="0" stopColor={shade(fill, side === 'hope' ? 0.45 : 0.35)} />
          <Stop offset="0.6" stopColor={fill} />
          <Stop offset="1" stopColor={shade(fill, -0.16)} />
        </RadialGradient>
      </Defs>
      <G transform="translate(0 4)"><Polygon points={geo.points} fill="rgba(0,0,0,0.30)" /></G>
      <Polygon points={geo.points} fill={rim} strokeLinejoin="round" />
      <Polygon points={inset(6)} fill={`url(#${gid})`} stroke={shade(fill, -0.42)} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
});

/**
 * A duality die's number, on ITS pentagon (v0.34.6).
 *
 * The digit used to hang from the TOP of the token box and be pushed down by a translate, so it sat
 * low on the die and drifted with the font's own metrics. It is centred in a box the size of the
 * token instead, and that box is then moved onto the die: whatever the digit's height, its middle is
 * the die's middle.
 */
export const DualityNumber = memo(function DualityNumber({ size, side, value }: { size: number; side: 'hope' | 'fear'; value: number }) {
  const geo = dualityGeometry()[side];
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ translateX: ((geo.cx - DIE_BOX / 2) / DIE_BOX) * size }, { translateY: ((geo.numberY - DIE_BOX / 2) / DIE_BOX) * size }],
      }}>
      <Text
        allowFontScaling={false}
        style={{ color: side === 'hope' ? HOPE_INK : FEAR_INK, fontFamily: Display.black, fontSize: size * 0.17, textAlign: 'center', includeFontPadding: false }}>
        {value}
      </Text>
    </View>
  );
});

export const DieButton = memo(function DieButton({ size, dieType, value, value2, hideNumber }: { size: number; dieType: DieType; value: number; /** v0.34.4: the Fear die of a duality token. */ value2?: number; /** v0.32.0: the roll draws its own cross-fading numbers over the face. */ hideNumber?: boolean }) {
  if (dieType === 'duality') {
    return (
      <View style={{ width: size, height: size }} pointerEvents="none">
        <DualityDieFace size={size} side="hope" />
        <DualityDieFace size={size} side="fear" />
        {hideNumber ? null : (
          <>
            <DualityNumber size={size} side="hope" value={value} />
            <DualityNumber size={size} side="fear" value={value2 ?? value} />
          </>
        )}
      </View>
    );
  }
  return <SingleDie size={size} dieType={dieType} value={value} hideNumber={hideNumber} />;
});

const SingleDie = memo(function SingleDie({ size, dieType, value, hideNumber }: { size: number; dieType: DieType; value: number; hideNumber?: boolean }) {
  const gid = useId();
  const fill = DIE_COLOR[dieType];
  const rim = shade(fill, -0.34);
  const geo = dieGeometry(dieType);
  const face = (pad: number, fillv: string, stroke?: string, sw?: number) =>
    geo.rect ? (
      <Rect x={geo.rect[0] + pad} y={geo.rect[1] + pad} width={geo.rect[2] - 2 * pad} height={geo.rect[3] - 2 * pad} rx={geo.rect[4]} fill={fillv} stroke={stroke} strokeWidth={sw} />
    ) : (
      <Polygon points={scalePts(geo.points!, pad)} fill={fillv} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
    );
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
      <Svg width={size} height={size} viewBox={`0 0 ${DIE_BOX} ${DIE_BOX}`} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={gid} cx="36%" cy="30%" r="80%">
            <Stop offset="0" stopColor={shade(fill, 0.55)} />
            <Stop offset="0.6" stopColor={fill} />
            <Stop offset="1" stopColor={shade(fill, -0.16)} />
          </RadialGradient>
        </Defs>
        {/* drop shadow = the silhouette itself, nudged down, so it hugs every shape */}
        <G transform="translate(0 5)">{face(0, 'rgba(0,0,0,0.30)')}</G>
        {face(2, rim)}
        {face(8, `url(#${gid})`, shade(fill, -0.42), 2)}
      </Svg>
      {hideNumber ? null : <DieNumber size={size} dieType={dieType} value={value} />}
    </View>
  );
});

/** Render any token at `size`: a die gets the DieButton, everything else the sewing button. Memoized
 *  (#293 perf): the baked deck layer renders these gradient SVGs per token, so skipping re-renders when
 *  props are unchanged keeps decorated decks cheap to composite (e.g. under the float-menu dim). */
export const TokenGlyph = memo(function TokenGlyph({ size, token }: { size: number; token: { kind: TokenKind; color?: string; dieType?: DieType; dieValue?: number; dieValue2?: number } }) {
  if (token.kind === 'die') {
    const dt = token.dieType ?? 'd6';
    return <DieButton size={size} dieType={dt} value={token.dieValue ?? DIE_MAX[dt]} value2={token.dieValue2} />;
  }
  return <TokenButton size={size} fill={tokenFill(token)} />;
});

/**
 * The baked token layer (#244): every token on a card. Same glyphs as the board, so it looks identical
 * in the deck and through rise/switch transitions (it rides the slot, next to `EnabledCorner`).
 */
export const BakedTokenLayer = memo(function BakedTokenLayer({ tokens, cardW, cardH }: { tokens: PlacedToken[] | undefined; cardW: number; cardH: number }) {
  if (!tokens || tokens.length === 0) return null;
  const base = cardW * TOKEN_FRAC;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {tokens.map((t) => {
        const size = base * placedKindScale(t.kind, t.dieType);
        return (
          <View key={t.id} style={{ position: 'absolute', left: t.x * cardW - size / 2, top: t.y * cardH - size / 2 }}>
            <TokenGlyph size={size} token={t} />
          </View>
        );
      })}
    </View>
  );
});
