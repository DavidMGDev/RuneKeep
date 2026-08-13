import { type DieSpec, diceSummary, diceTotal, dieSides, resolveDice, specCount, specSummary, withGrantedDice } from './card-dice';

const spec = (over: Partial<DieSpec> = {}): DieSpec => ({ id: 's1', type: 'd6', ...over });
const noVars = () => 0;
const vars = (map: Record<string, number>) => (v: string) => map[v] ?? 0;

describe('specCount', () => {
  it('is one die unless the author says otherwise', () => {
    expect(specCount(spec(), noVars)).toBe(1);
  });

  it('is the count the author set', () => {
    expect(specCount(spec({ count: 3 }), noVars)).toBe(3);
  });

  it('MULTIPLIES by the variable, which is the owner example: a d6 per Proficiency', () => {
    expect(specCount(spec({ variable: 'proficiency' }), vars({ proficiency: 2 }))).toBe(2);
  });

  it('multiplies the count as well, so 2d4 per Agility 3 is six dice', () => {
    expect(specCount(spec({ type: 'd4', count: 2, variable: 'agility' }), vars({ agility: 3 }))).toBe(6);
  });

  it('yields NOTHING when the variable is zero, which is the honest answer', () => {
    expect(specCount(spec({ variable: 'proficiency' }), vars({ proficiency: 0 }))).toBe(0);
  });

  it('never goes negative', () => {
    expect(specCount(spec({ count: -4 }), noVars)).toBe(0);
    expect(specCount(spec({ variable: 'agility' }), vars({ agility: -3 }))).toBe(0);
  });
});

describe('resolveDice', () => {
  it('repeats each entry as many times as it resolves to, in the authored order', () => {
    const out = resolveDice([spec({ id: 'a', type: 'd6', variable: 'proficiency' }), spec({ id: 'b', type: 'd4', variable: 'agility' })], vars({ proficiency: 2, agility: 3 }));
    expect(out.map((d) => d.type)).toEqual(['d6', 'd6', 'd4', 'd4', 'd4']);
  });

  it('gives every die its own id, so each can animate on its own', () => {
    const out = resolveDice([spec({ count: 3 })], noVars);
    expect(new Set(out.map((d) => d.id)).size).toBe(3);
  });

  it('caps, so a climbing variable cannot ask for ninety dice', () => {
    expect(resolveDice([spec({ count: 500 })], noVars)).toHaveLength(24);
  });

  it('is empty for an element nobody has configured', () => {
    expect(resolveDice(undefined, noVars)).toEqual([]);
  });
});

describe('dieSides', () => {
  it('reads the number out of the name', () => {
    expect(dieSides('d4')).toBe(4);
    expect(dieSides('d20')).toBe(20);
    expect(dieSides('d100')).toBe(100);
  });
});

describe('diceSummary', () => {
  it('groups by kind, the way anybody would write it', () => {
    expect(diceSummary(resolveDice([spec({ id: 'a', count: 2 }), spec({ id: 'b', type: 'd8' })], noVars))).toBe('2d6 + 1d8');
  });

  it('says so when there are none', () => {
    expect(diceSummary([])).toBe('No dice');
  });
});

describe('specSummary', () => {
  it('reads as dice notation', () => {
    expect(specSummary(spec({ count: 2, type: 'd8' }))).toBe('2d8');
  });

  it('names the variable when there is one', () => {
    expect(specSummary(spec({ variable: 'proficiency' }), 'Proficiency')).toBe('1d6 per Proficiency');
  });
});

describe('diceTotal', () => {
  it('adds them up', () => {
    expect(diceTotal([3, 4, 5])).toBe(12);
    expect(diceTotal([])).toBe(0);
  });
});

describe('withGrantedDice', () => {
  it('ADDS what an advancement grants, never replacing what was there', () => {
    const out = withGrantedDice([spec({ id: 'base' })], [spec({ id: 'g', type: 'd8' })], 't1');
    expect(out.map((s) => s.type)).toEqual(['d6', 'd8']);
  });

  it('keeps two takes of the same advancement apart, which is what twice per tier means', () => {
    const once = withGrantedDice([spec({ id: 'base' })], [spec({ id: 'g' })], 't1');
    const twice = withGrantedDice(once, [spec({ id: 'g' })], 't2');
    expect(twice).toHaveLength(3);
    expect(new Set(twice.map((s) => s.id)).size).toBe(3);
  });

  it('changes nothing when an advancement grants no dice', () => {
    const base = [spec()];
    expect(withGrantedDice(base, undefined, 't1')).toBe(base);
  });
});
