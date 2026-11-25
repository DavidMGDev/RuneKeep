/**
 * The token chest (owner, v0.50.6): what it throws out as it is scrolled, and how far its landmine reaches.
 */
import { kindScale, TOKEN_COLORS, type TokenKind } from '../components/card-tokens-data';

import type { TokenInfo } from './table-dice';

/** The tokens the token chest throws out as it is scrolled, smallest to biggest, then round again. */
export const TOKEN_STEPS: TokenKind[] = ['wood-s', 'bone-s', 'wood', 'iron-s', 'gold', 'bone', 'copper', 'wood-l', 'iron', 'bone-l', 'iron-l'];
/**
 * One round of the token chest: every size in order, a few of them swapped for a colour token of that same size
 * (owner: "a few random colours at random sizes, but always in order").
 */
export function tokenRound(rnd: () => number = Math.random): TokenInfo[] {
  return TOKEN_STEPS.map((kind) => (rnd() < 0.3 ? { kind: 'color', color: TOKEN_COLORS[Math.floor(rnd() * TOKEN_COLORS.length)], big: kindScale(kind) } : { kind }));
}
/** How far a mine's blast reaches (px) for the tokens it was made of; past the screen it is a big one. */
export const mineReach = (n: number) => 120 + 85 * n;
