import { SAMPLE_CHARACTER, type Character } from '@/features/character-sheet/character';
import { applyRestMoves, movesFor, restMoveById, tierForLevel } from './rest';

/** A wounded test character with room to heal/clear/repair on every track. */
function wounded(over: Partial<Character> = {}): Character {
  return {
    ...SAMPLE_CHARACTER,
    level: 4, // tier 2
    hp: 4,
    maxHp: 12,
    stress: { active: 8, total: 12, locked: 1 }, // unlocked 11
    armor: { active: 3, total: 12, locked: 4 }, // unlocked 8
    hope: { active: 2, total: 6 },
    ...over,
  };
}

describe('tierForLevel', () => {
  it('maps levels to tiers (T1=1, T2=2-4, T3=5-7, T4=8-10)', () => {
    expect(tierForLevel(1)).toBe(1);
    expect([2, 3, 4].map(tierForLevel)).toEqual([2, 2, 2]);
    expect([5, 6, 7].map(tierForLevel)).toEqual([3, 3, 3]);
    expect([8, 9, 10].map(tierForLevel)).toEqual([4, 4, 4]);
  });
});

describe('move catalog', () => {
  it('short rest has 4 moves, long rest has 5', () => {
    expect(movesFor('short').map((m) => m.id)).toEqual(['tend', 'clear-stress', 'repair', 'prepare']);
    expect(movesFor('long')).toHaveLength(5);
  });
});

describe('short rest moves (1d4 + tier)', () => {
  const tier = 2;
  it('Tend to Wounds heals roll + tier, capped at maxHp', () => {
    const { character, log } = applyRestMoves(wounded(), tier, [{ moveId: 'tend', roll: 3 }]);
    expect(character.hp).toBe(4 + 3 + 2); // 9
    expect(log[0].amount).toBe(5);
  });
  it('Tend to Wounds never overheals past maxHp', () => {
    const { character } = applyRestMoves(wounded({ hp: 11, maxHp: 12 }), tier, [{ moveId: 'tend', roll: 4 }]);
    expect(character.hp).toBe(12);
  });
  it('Clear Stress reduces active by roll + tier, floored at 0', () => {
    const { character } = applyRestMoves(wounded(), tier, [{ moveId: 'clear-stress', roll: 2 }]);
    expect(character.stress.active).toBe(8 - 4); // 4
  });
  it('Repair Armor raises active by roll + tier, capped at unlocked', () => {
    const { character } = applyRestMoves(wounded(), tier, [{ moveId: 'repair', roll: 4 }]);
    expect(character.armor.active).toBe(8); // 3 + 4 + 2 = 9 -> capped at unlocked 8
  });
  it('Prepare gains 1 Hope, or 2 with party, capped at total', () => {
    expect(applyRestMoves(wounded(), tier, [{ moveId: 'prepare' }]).character.hope.active).toBe(3);
    expect(applyRestMoves(wounded(), tier, [{ moveId: 'prepare', withParty: true }]).character.hope.active).toBe(4);
    expect(applyRestMoves(wounded({ hope: { active: 6, total: 6 } }), tier, [{ moveId: 'prepare', withParty: true }]).character.hope.active).toBe(6);
  });
});

describe('long rest moves (clear all)', () => {
  it('Tend to All Wounds restores full HP', () => {
    expect(applyRestMoves(wounded(), 2, [{ moveId: 'tend-all' }]).character.hp).toBe(12);
  });
  it('Clear All Stress empties stress', () => {
    expect(applyRestMoves(wounded(), 2, [{ moveId: 'clear-all-stress' }]).character.stress.active).toBe(0);
  });
  it('Repair All Armor fills to unlocked', () => {
    expect(applyRestMoves(wounded(), 2, [{ moveId: 'repair-all' }]).character.armor.active).toBe(8);
  });
  it('Work on a Project has no mechanical effect', () => {
    const c = wounded();
    const { character, log } = applyRestMoves(c, 2, [{ moveId: 'project' }]);
    expect(character).toEqual(c);
    expect(log[0].amount).toBe(0);
  });
});

describe('multiple selections (owner rule: 1 or 2 moves, same move twice)', () => {
  it('applies the same move twice, stacking', () => {
    const { character } = applyRestMoves(wounded(), 2, [
      { moveId: 'tend', roll: 1 }, // +3 -> 7
      { moveId: 'tend', roll: 2 }, // +4 -> 11
    ]);
    expect(character.hp).toBe(11);
  });
  it('a single move is allowed', () => {
    const { log } = applyRestMoves(wounded(), 2, [{ moveId: 'prepare' }]);
    expect(log).toHaveLength(1);
  });
  it('ignores unknown move ids', () => {
    const c = wounded();
    const { character, log } = applyRestMoves(c, 2, [{ moveId: 'nope' }]);
    expect(character).toEqual(c);
    expect(log).toHaveLength(0);
  });
});

describe('restMoveById', () => {
  it('finds a move or returns undefined', () => {
    expect(restMoveById('tend')?.title).toBe('Tend to Wounds');
    expect(restMoveById('xxx')).toBeUndefined();
  });
});
