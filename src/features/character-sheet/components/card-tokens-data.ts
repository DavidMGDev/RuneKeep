/**
 * Card-token DATA + pure helpers (#244) — no React / React Native imports, so it's unit-testable and
 * safe to import from the serializable CharacterFile. The visuals live in `card-tokens.tsx`, which
 * re-exports everything here.
 */

/** Token kinds: three "default" buttons, the custom-COLOUR button (#244), and the DIE (#293). */
export type TokenKind = 'wood' | 'bone' | 'iron' | 'color' | 'die';

/**
 * Die sizes (#293).
 *
 * v0.34.4 adds two, at the owner's request, for players with no dice on the table:
 *
 *  - `d100`, a twenty-sided outline that reads as a disc at token size, rolling 1-100;
 *  - `duality`, which is NOT one die. It is the Hope and Fear pair, and it is a single token holding
 *    two independent d12s, because they are always rolled together and always removed together. A
 *    pair of separate tokens would have needed a link between them that nothing else in this file
 *    has, and the link would be the thing that broke.
 *
 * This does not make RuneKeep roll for you. The app still never rolls a check: these are dice you
 * put on a card and press, exactly like the ones already here.
 */
export type DieType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100' | 'duality';

/** A token stuck on a card. `x`/`y` are normalized [0,1] to the card rect (the token's CENTER), so
 *  the same token rides every LOD/scale unchanged. `color` is frozen at placement for `color` tokens;
 *  `dieType`/`dieValue` carry the die's size + shown number for `die` tokens (#293). `dieValue2` is the
 *  FEAR die of a duality token (v0.34.4); `dieValue` is its Hope die. */
export interface PlacedToken {
  id: string;
  kind: TokenKind;
  color?: string;
  dieType?: DieType;
  dieValue?: number;
  /** v0.34.4: the second die of a `duality` token (Fear). Absent on every other kind. */
  dieValue2?: number;
  x: number;
  y: number;
}

/** The dice (#293), in cycle order. Each has a fixed colour + max so it reads at a glance. */
export const DIE_TYPES: DieType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100', 'duality'];
/** A duality token's max is a d12's: both of its dice are d12s. */
export const DIE_MAX: Record<DieType, number> = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20, d100: 100, duality: 12 };
/** Hope is gold with dark purple numbers; Fear is dark purple with light gold numbers (owner). */
export const HOPE_GOLD = '#D2A03C';
export const FEAR_PURPLE = '#3A2150';
export const HOPE_INK = '#2A1436';
export const FEAR_INK = '#F0D79A';
export const DIE_COLOR: Record<DieType, string> = {
  d4: '#C95B5B', d6: '#D98E3A', d8: '#8A6FC4', d10: '#6FA86B', d12: '#4FA3A3', d20: '#5C7CC2',
  d100: '#B5793F', duality: HOPE_GOLD,
};
/** The ink a die's number is written in. Anything absent uses the shared parchment white. */
export const DIE_INK: Partial<Record<DieType, string>> = { duality: HOPE_INK };
// Font size as a fraction of the token size. d6/d8/d10/d12/d20 share ONE size (#293 owner) so the
// digit height is consistent across every die and digit count; the narrow d4 triangle keeps a smaller
// digit so it doesn't bleed out the edges.
// d100 prints three digits at its widest, so its number is smaller; a duality die is one of a PAIR
// inside the same box, so its number is sized to the half it sits on rather than to the box.
const DIE_NUM_FRAC: Record<DieType, number> = { d4: 0.30, d6: 0.275, d8: 0.275, d10: 0.275, d12: 0.275, d20: 0.275, d100: 0.21, duality: 0.16 };
export function dieNumberFrac(type: DieType): number {
  return DIE_NUM_FRAC[type];
}
// Per-die number nudge in 124-box units (#293 owner: d4's digit reads better shifted left + up). Scales
// with the token since it's expressed in design-box units.
//
// v0.32.0: the d4's digit sat 2px too far left on a focused card. A placed die renders at
// CARD_W(230) x TOKEN_FRAC(0.17) x DIE_PLACED_MULT(2) = 78 card px, magnified by FS_FOCUS_SCALE(1.79)
// to ~140 design px, so one box unit is ~1.13 px on screen and 2px is ~1.8 units: -3 becomes -1.
const DIE_NUM_OFFSET: Partial<Record<DieType, { dx: number; dy: number }>> = { d4: { dx: -1, dy: -6 } };
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
  // v0.34.4: twenty sides, which at token size reads as a disc with a faint faceting, exactly the
  // owner's "a polygon that closely resembles a circle due to the amount of sides it has".
  d100: { n: 20, rot: -90 },
  // A duality token draws a PAIR (see `dualityGeometry`); this entry is the shape of each of them,
  // and is what a generic single-die consumer falls back to.
  duality: { n: 5, rot: -90 },
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

/**
 * The two dice of a duality token, inside the same {@link DIE_BOX} (v0.34.4).
 *
 * They are smaller than a lone die and they sit at DIFFERENT centres, which is the point: the owner
 * asked for two dice that "do not share a common center for rotation", so each one turns about its
 * own middle and the pair reads as two objects on a table rather than one glyph. Fear sits low and
 * right of Hope, the way two dice actually land.
 *
 * Each half carries its own centre so a renderer can rotate it in place, and its own number position.
 */
export interface DualityDie {
  points: string;
  /** Centre of THIS die, in box units: the pivot its rotation turns about. */
  cx: number;
  cy: number;
  numberY: number;
}

/**
 * How big each duality die is, and how far apart they sit (owner, v0.34.5).
 *
 * They used to sit diagonally, 51 units apart, which read as one die photobombing another. They are
 * LEVEL now, a quarter further apart. The span is bounded by the box, because a die turns about its
 * own centre and its corners sweep out to its circumradius (about 0.53 of the span for a pentagon).
 *
 * v0.34.7: bigger dice, same centres (owner: "keep the spacing, consider how the gap will shrink").
 * The span can only grow so far before a die's corners sweep outside the box as it spins: at 56 the
 * circumradius is 29.4 against a 30-unit margin, which is the last whole number that never clips. The
 * rest of the increase comes from the TOKEN growing (see `dieSizeMult`), which costs nothing at all.
 */
const DUALITY_SPAN = 56;

function pentagon(span: number, cx: number, cy: number): DualityDie {
  const raw: [number, number][] = [];
  for (let k = 0; k < 5; k++) {
    const a = ((-90 + k * 72) * Math.PI) / 180;
    raw.push([Math.cos(a), Math.sin(a)]);
  }
  const xs = raw.map((p) => p[0]);
  const ys = raw.map((p) => p[1]);
  const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  const s = span / Math.max(maxx - minx, maxy - miny);
  const bcx = ((minx + maxx) / 2) * s;
  const bcy = ((miny + maxy) / 2) * s;
  const pts = raw.map(([x, y]) => `${(x * s - bcx + cx).toFixed(2)},${(y * s - bcy + cy).toFixed(2)}`);
  return { points: pts.join(' '), cx, cy, numberY: cy - bcy };
}

/** Hope left, Fear right, LEVEL with each other and clear of each other (v0.34.5). */
export function dualityGeometry(): { hope: DualityDie; fear: DualityDie } {
  return { hope: pentagon(DUALITY_SPAN, 30, DIE_C), fear: pentagon(DUALITY_SPAN, 94, DIE_C) };
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
/**
 * Per-die size, on top of everything else (v0.34.7).
 *
 * A duality token holds TWO dice in the space one die gets, so each of them is inevitably smaller
 * than a d20 on the same card. Growing the token is the half of the answer that does not cost the
 * gap between them: the geometry inside is untouched, so the pair keeps its proportions and simply
 * arrives bigger.
 */
const DIE_SIZE_MULT: Partial<Record<DieType, number>> = { duality: 1.32 };
export function dieSizeMult(dieType?: DieType): number {
  return (dieType && DIE_SIZE_MULT[dieType]) ?? 1;
}
export function placedKindScale(kind: TokenKind, dieType?: DieType): number {
  return kindScale(kind) * (kind === 'die' ? DIE_PLACED_MULT * dieSizeMult(dieType) : 1);
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
