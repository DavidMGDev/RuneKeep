/**
 * Card-token DATA + pure helpers (#244) — no React / React Native imports, so it's unit-testable and
 * safe to import from the serializable CharacterFile. The visuals live in `card-tokens.tsx`, which
 * re-exports everything here.
 */

/** The four token kinds: three fixed "default" buttons + the single custom-COLOUR button (#244). */
export type TokenKind = 'wood' | 'bone' | 'iron' | 'color';

/** A token stuck on a card. `x`/`y` are normalized [0,1] to the card rect (the token's CENTER), so
 *  the same token rides every LOD/scale unchanged. `color` is frozen at placement for `color` tokens. */
export interface PlacedToken {
  id: string;
  kind: TokenKind;
  color?: string;
  x: number;
  y: number;
}

/** The three default button materials (a new "material" palette — no Rune entry fits sewing buttons). */
export const TOKEN_BASE: Record<Exclude<TokenKind, 'color'>, string> = {
  wood: '#9A6B3C',
  bone: '#E7DCC3',
  iron: '#6E747E',
};

/** The draggable defaults shown in the drawer, in order (the colour button is appended separately). */
export const DEFAULT_TOKEN_KINDS: Exclude<TokenKind, 'color'>[] = ['wood', 'bone', 'iron'];

/** Curated, pleasant button colours the custom-colour button cycles through (#244 item 5). */
export const TOKEN_COLORS: string[] = [
  '#C95B5B', '#D98E3A', '#E0B563', '#6FA86B', '#4FA3A3',
  '#5C7CC2', '#9B6FC2', '#C26FA0', '#B5A079', '#7A8590',
];

/** Token diameter as a fraction of the card's width — same on every LOD so it never jumps. */
export const TOKEN_FRAC = 0.17;

/** The token's base fill: the material for a default kind, or the frozen custom colour. */
export function tokenFill(t: { kind: TokenKind; color?: string }): string {
  if (t.kind === 'color') return t.color ?? TOKEN_COLORS[0];
  return TOKEN_BASE[t.kind];
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
