import { addDie, type PoolDie } from './dice-pool';
import { diceOf, diceSummary, hasModifier, modifierValue, poolOf, type PresetContext, presetInitial, slotsOf, writeSlot } from './dice-presets';

const ids = (base: string) => (n: number) => `${base}-${n}`;

const CTX: PresetContext = {
  level: 5, tier: 3, proficiency: 3, stress: 2,
  attackRoll: 4, spellcastRoll: 1, spellcast: 2,
  traits: { agility: 1, strength: -1 },
};

describe('diceOf', () => {
  it('reads an ordinary pool back as its kinds', () => {
    let pool: PoolDie[] = [];
    pool = addDie(pool, 'd6', ids('a'));
    pool = addDie(pool, 'd20', ids('b'));
    expect(diceOf(pool)).toEqual(['d6', 'd20']);
  });

  it('reads a duality pair back as ONE entry, not two d12', () => {
    const pool = addDie(addDie([], 'duality', ids('a')), 'd4', ids('b'));
    expect(diceOf(pool)).toEqual(['duality', 'd4']);
  });

  it('survives a round trip through a preset', () => {
    const dice = diceOf(addDie(addDie(addDie([], 'd4', ids('a')), 'duality', ids('b')), 'd4', ids('c')));
    const back = poolOf({ id: 'p', name: 'x', dice }, (n) => `r-${n}`);
    expect(back).toHaveLength(4); // two d4 and the pair
    expect(diceOf(back)).toEqual(dice);
    expect(back.filter((d) => d.pairId)).toHaveLength(2);
  });
});

describe('slots', () => {
  it('is always three long, with holes', () => {
    expect(slotsOf(undefined)).toEqual([null, null, null]);
  });

  it('writes and clears one slot without touching the others', () => {
    const p = { id: 'a', name: 'Strike', dice: ['d20' as const] };
    const one = writeSlot(undefined, 1, p);
    expect(one).toEqual([null, p, null]);
    expect(writeSlot(one, 1, null)).toEqual([null, null, null]);
  });

  it('ignores a slot that does not exist', () => {
    expect(writeSlot(undefined, 7, { id: 'a', name: 'x', dice: [] })).toEqual([null, null, null]);
  });
});

describe('modifierValue', () => {
  it('is nothing when there is no modifier', () => {
    expect(modifierValue(undefined, CTX)).toBe(0);
  });

  it('is the flat amount on its own', () => {
    expect(modifierValue({ value: 3 }, CTX)).toBe(3);
  });

  it('adds the variable to the amount', () => {
    expect(modifierValue({ value: 2, variable: 'attackRoll' }, CTX)).toBe(6);
    expect(modifierValue({ value: 0, variable: 'spellcastRoll' }, CTX)).toBe(1);
    expect(modifierValue({ value: 1, variable: 'proficiency' }, CTX)).toBe(4);
  });

  it('reads a trait', () => {
    expect(modifierValue({ value: 0, variable: 'agility' }, CTX)).toBe(1);
    expect(modifierValue({ value: 2, variable: 'strength' }, CTX)).toBe(1);
  });

  it('carries a penalty', () => {
    expect(modifierValue({ value: -2, variable: 'tier' }, CTX)).toBe(1);
  });

  it('refuses the per-card number input, which no preset can have', () => {
    expect(modifierValue({ value: 2, variable: 'input' }, CTX)).toBe(2);
  });
});

describe('the small answers', () => {
  it('knows when a modifier is worth showing', () => {
    expect(hasModifier(undefined)).toBe(false);
    expect(hasModifier({ value: 0 })).toBe(false);
    expect(hasModifier({ value: 0, variable: 'level' })).toBe(true);
    expect(hasModifier({ value: -1 })).toBe(true);
  });

  it('falls back to the name\'s first letter', () => {
    expect(presetInitial('  strike')).toBe('S');
    expect(presetInitial('')).toBe('?');
  });

  it('summarises a handful the way you would say it', () => {
    expect(diceSummary(['d6', 'd6', 'd20'])).toBe('2d6, d20');
    expect(diceSummary(['duality', 'd4'])).toBe('d4, Hope and Fear');
    expect(diceSummary([])).toBe('No dice');
  });
});
