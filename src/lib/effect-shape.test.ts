import { amountText, LIMIT, shapeOf, withShape, within } from './effect-shape';
import type { CardEffect } from './modifiers';

describe('the shape of a modifier', () => {
  const flat: CardEffect = { target: 'evasion', delta: 3, group: 'Storm', permanent: true };

  it('leaves one shape and keeps everything that is not the amount', () => {
    const f = withShape(flat, 'formula');
    expect(shapeOf(f)).toBe('formula');
    expect(f).toMatchObject({ group: 'Storm', permanent: true, delta: undefined });
    const t = withShape(f, 'byTier');
    expect(shapeOf(t)).toBe('byTier');
    expect(t.formula).toBeUndefined();
    expect(withShape(t, 'flat')).toMatchObject({ delta: 1, byTier: undefined, group: 'Storm' });
  });

  it('keeps a typed number in range', () => {
    expect(within(99, LIMIT.set)).toBe(40);
    expect(within(-30, LIMIT.bonus)).toBe(-9);
  });

  it('says an amount in words', () => {
    expect(amountText({ target: 'evasion', dynamic: 'formula', formula: { variable: 'agility', divide: 2 } }, 'Agility')).toBe('Agility ÷ 2, rounded up');
    expect(amountText({ target: 'evasion', dynamic: 'formula', formula: { variable: 'level', multiply: 2, plus: -1 } }, 'Level')).toBe('Level × 2 − 1');
    expect(amountText({ target: 'evasion', byTier: [1, 2, 3, 4] }, '')).toBe('1 / 2 / 3 / 4 by tier');
  });
});
