/**
 * Card-token DATA + pure helpers (#244) — no React / React Native imports, so it's unit-testable and
 * safe to import from the serializable CharacterFile. The visuals live in `card-tokens.tsx`, which
 * re-exports everything here.
 */

/** Token kinds: three "default" buttons, the custom-COLOUR button (#244), and the DIE (#293). */
export type TokenKind = 'wood' | 'bone' | 'iron' | 'color' | 'die';

/** Die sizes (#293). */
export type DieType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';

/** A token stuck on a card. `x`/`y` are normalized [0,1] to the card rect (the token's CENTER), so
 *  the same token rides every LOD/scale unchanged. `color` is frozen at placement for `color` tokens;
 *  `dieType`/`dieValue` carry the die's size + shown number for `die` tokens (#293). */
export interface PlacedToken {
  id: string;
  kind: TokenKind;
  color?: string;
  dieType?: DieType;
  dieValue?: number;
  x: number;
  y: number;
}

/** The dice (#293), in cycle order. Each has a fixed colour + max so it reads at a glance. */
export const DIE_TYPES: DieType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
export const DIE_MAX: Record<DieType, number> = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 };
export const DIE_COLOR: Record<DieType, string> = {
  d4: '#C95B5B', d6: '#D98E3A', d8: '#8A6FC4', d10: '#6FA86B', d12: '#4FA3A3', d20: '#5C7CC2',
};
// Font size as a fraction of the token size. d6/d8/d10/d12/d20 share ONE size (#293 owner) so the
// digit height is consistent across every die and digit count; the narrow d4 triangle keeps a smaller
// digit so it doesn't bleed out the edges.
const DIE_NUM_FRAC: Record<DieType, number> = { d4: 0.30, d6: 0.275, d8: 0.275, d10: 0.275, d12: 0.275, d20: 0.275 };
export function dieNumberFrac(type: DieType): number {
  return DIE_NUM_FRAC[type];
}
// Per-die number nudge in 124-box units (#293 owner: d4's digit reads better shifted left + up). Scales
// with the token since it's expressed in design-box units.
const DIE_NUM_OFFSET: Partial<Record<DieType, { dx: number; dy: number }>> = { d4: { dx: -3, dy: -6 } };
export function dieNumberOffset(type: DieType): { dx: number; dy: number } {
  return DIE_NUM_OFFSET[type] ?? { dx: 0, dy: 0 };
}
/** Tap the source die → next size; tap a placed die → next value (1..max, wrapping). */
export function nextDieType(cur: DieType): DieType {
  return DIE_TYPES[(DIE_TYPES.indexOf(cur) + 1) % DIE_TYPES.length];
}
export function nextDieValue(type: DieType, cur: number): number {
  return cur >= DIE_MAX[type] ? 1 : cur + 1;
}

/** The token box the die is authored in (square; matches TokenButton's viewBox). */
export const DIE_BOX = 124;
const DIE_C = DIE_BOX / 2; // 62
const DIE_SPAN = 86; // every die's bounding box spans this, so they read the same size
/** Each die as a regular n-gon: `n` sides, vertex 0 at `rot` degrees (−90 = a point straight up). */
const DIE_NGON: Record<Exclude<DieType, 'd6'>, { n: number; rot: number }> = {
  d4: { n: 3, rot: -90 }, // triangle, point up
  d8: { n: 4, rot: -90 }, // diamond
  d10: { n: 5, rot: 90 }, // pentagon, point down
  d12: { n: 5, rot: -90 }, // pentagon, point up
  d20: { n: 6, rot: -90 }, // hexagon, point up
};

export interface DieGeometry {
  points?: string; // polygon points "x,y x,y …" (absent for d6)
  rect?: [number, number, number, number, number]; // x,y,w,h,r (d6 only)
  numberY: number; // y of the silhouette's centroid — where the digit is drawn
}

/**
 * Die silhouette geometry (#293) inside the {@link DIE_BOX} box. Builds the regular polygon, scales it
 * uniformly so its bounding box spans {@link DIE_SPAN}, then translates so that bounding box is centred
 * at (62,62) — this is what guarantees the die sits centred in its slot. `numberY` is the polygon
 * centroid (mean of vertices), which after the same shift is where the number must sit to read centred
 * on the shape. d6 is an axis-aligned rounded square (its own centred rect).
 */
export function dieGeometry(type: DieType): DieGeometry {
  if (type === 'd6') return { rect: [25, 25, 74, 74, 16], numberY: DIE_C };
  const { n, rot } = DIE_NGON[type];
  const raw: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const a = ((rot + (k * 360) / n) * Math.PI) / 180;
    raw.push([Math.cos(a), Math.sin(a)]);
  }
  const xs = raw.map((p) => p[0]);
  const ys = raw.map((p) => p[1]);
  const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  const s = DIE_SPAN / Math.max(maxx - minx, maxy - miny);
  const bcx = ((minx + maxx) / 2) * s; // bbox centre after scaling
  const bcy = ((miny + maxy) / 2) * s;
  // A regular polygon's centroid is the mean of its vertices = (0,0) here, so after the centring shift
  // (DIE_C - bc) the centroid lands at (DIE_C - bcx, DIE_C - bcy).
  const pts = raw.map(([x, y]) => `${(x * s - bcx + DIE_C).toFixed(2)},${(y * s - bcy + DIE_C).toFixed(2)}`);
  return { points: pts.join(' '), numberY: DIE_C - bcy };
}

/** The three default button materials (a new "material" palette — no Rune entry fits sewing buttons). */
export const TOKEN_BASE: Record<Exclude<TokenKind, 'color' | 'die'>, string> = {
  wood: '#9A6B3C',
  bone: '#E7DCC3',
  iron: '#6E747E',
};

/** The draggable defaults shown in the drawer, in order (the colour button is appended separately). */
export const DEFAULT_TOKEN_KINDS: Exclude<TokenKind, 'color' | 'die'>[] = ['wood', 'bone', 'iron'];

/** Curated, pleasant button colours the custom-colour button cycles through (#244 item 5). */
export const TOKEN_COLORS: string[] = [
  '#C95B5B', '#D98E3A', '#E0B563', '#6FA86B', '#4FA3A3',
  '#5C7CC2', '#9B6FC2', '#C26FA0', '#B5A079', '#7A8590',
];

/** Token diameter as a fraction of the card's width — same on every LOD so it never jumps. */
export const TOKEN_FRAC = 0.17;

/** Per-kind size multiplier (#244 follow-up): wood smallest, bone baseline, iron largest; colour
 *  standard. A subtle ~20% step between the three defaults. */
export function kindScale(kind: TokenKind): number {
  switch (kind) {
    case 'wood': return 0.8;
    case 'iron': return 1.2;
    default: return 1; // bone + color + die
  }
}

/** Placed dice render twice the size of their drawer source (#293 owner: on-card dice were too small).
 *  Only the PLACED/baked glyphs use this; the drawer source keeps {@link kindScale}. */
export const DIE_PLACED_MULT = 2;
export function placedKindScale(kind: TokenKind): number {
  return kindScale(kind) * (kind === 'die' ? DIE_PLACED_MULT : 1);
}

/** The token's base fill: the material for a default kind, the frozen custom colour, or the die colour. */
export function tokenFill(t: { kind: TokenKind; color?: string; dieType?: DieType }): string {
  if (t.kind === 'die') return DIE_COLOR[t.dieType ?? 'd6'];
  if (t.kind === 'color') return t.color ?? TOKEN_COLORS[0];
  return TOKEN_BASE[t.kind as Exclude<TokenKind, 'color' | 'die'>];
}

/**
 * Pick the NEXT custom colour (#244 item 5). Pure + deterministic for a given `rnd` in [0,1) so it's
 * unit-testable: choose a palette colour by `rnd`, and if it equals `prev` step to the next one — so
 * a tap always visibly changes the colour.
 */
export function pickTokenColor(prev: string | undefined, rnd: number): string {
  const n = TOKEN_COLORS.length;
  let idx = Math.floor(Math.max(0, Math.min(0.999999, rnd)) * n);
  if (idx >= n) idx = n - 1;
  if (TOKEN_COLORS[idx] === prev) idx = (idx + 1) % n;
  return TOKEN_COLORS[idx];
}

/** Convenience wrapper over `pickTokenColor` using the platform RNG (impure — not unit-tested). */
export function randomTokenColor(prev?: string): string {
  return pickTokenColor(prev, Math.random());
}

/** Stable hash of a token id → used to vary the drop direction/spin without Math.random (pure). */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295; // → [0,1)
}
