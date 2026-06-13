import { modSum, type StatModifier } from './character-file';

describe('modSum', () => {
  const mods: StatModifier[] = [
    { id: 'a', target: 'evasion', delta: -1, label: 'Heavy armor' },
    { id: 'b', target: 'evasion', delta: 2, label: 'Cloak' },
    { id: 'c', target: 'agility', delta: 1, label: 'Boots' },
  ];
  it('sums only the modifiers aimed at the target', () => {
    expect(modSum(mods, 'evasion')).toBe(1);
    expect(modSum(mods, 'agility')).toBe(1);
    expect(modSum(mods, 'strength')).toBe(0);
  });
  it('is 0 for an empty or missing list', () => {
    expect(modSum([], 'evasion')).toBe(0);
    expect(modSum(undefined, 'evasion')).toBe(0);
  });
});
