/**
 * The three shapes a modifier's amount can take, and how far each number may go (#325; pulled out in v0.50.0 so the
 * phone's editor and the desktop's are one set of rules). Pure.
 */
import type { CardEffect } from './modifiers';

export type EffectShape = 'flat' | 'formula' | 'byTier';
export type Limit = readonly [lo: number, hi: number];

export const LIMIT = {
  bonus: [-9, 12],
  set: [0, 40],
  times: [1, 9],
  plus: [-20, 40],
  tier: [-9, 40],
} as const satisfies Record<string, Limit>;

export const within = (n: number, [lo, hi]: Limit): number => Math.max(lo, Math.min(hi, n));

export const shapeOf = (e: CardEffect): EffectShape => (e.dynamic === 'formula' ? 'formula' : e.byTier ? 'byTier' : 'flat');

/** Switching seeds sensible defaults and clears the other shapes, so what is saved is unambiguous. */
export function withShape(e: CardEffect, shape: EffectShape): CardEffect {
  if (shape === 'flat') return { ...e, delta: e.delta ?? 1, dynamic: undefined, formula: undefined, byTier: undefined };
  if (shape === 'formula') return { ...e, dynamic: 'formula', formula: e.formula ?? { variable: 'level', multiply: 1, divide: 1 }, delta: undefined, byTier: undefined };
  return { ...e, byTier: e.byTier ?? [1, 1, 1, 1], delta: undefined, dynamic: undefined, formula: undefined };
}

/** An amount in words, for a list: "Proficiency × 2 + 1", "1 / 2 / 3 / 4 by tier". `variable` is its name. */
export function amountText(e: CardEffect, variable: string): string {
  if (e.target === 'scar') return 'Takes one Hope slot';
  if (e.dynamic === 'formula' && e.formula) {
    const { multiply = 1, divide = 1, plus = 0, floor } = e.formula;
    let out = variable;
    if (multiply !== 1) out += ` × ${multiply}`;
    if (divide > 1) out += ` ÷ ${divide}, rounded ${floor ? 'down' : 'up'}`;
    if (plus) out += `${divide > 1 ? ', then' : ''} ${plus > 0 ? '+' : '−'} ${Math.abs(plus)}`;
    return out;
  }
  if (e.byTier) return `${e.byTier.join(' / ')} by tier`;
  return 'A fixed amount';
}
