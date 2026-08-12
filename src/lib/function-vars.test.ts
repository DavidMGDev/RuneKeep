import type { CardFunction } from './card-functions';
import { cycleNumbers, functionValue, functionVarKey, functionVars, functionVarValues, isNumericFunction, type VarCard } from './function-vars';

const counter = (over: Partial<CardFunction> = {}): CardFunction => ({ id: 'c', kind: 'counter', title: 'Charges', start: 2, ...over });
const cycle = (options: string[]): CardFunction => ({ id: 'y', kind: 'cycle', title: 'Combo Die', options, startIndex: 0 });
const text = (): CardFunction => ({ id: 't', kind: 'text', title: 'Notes' });

describe('cycleNumbers', () => {
  it('reads a die list, because the digits are the value', () => {
    expect(cycleNumbers(cycle(['d4', 'd6', 'd12']))).toEqual([4, 6, 12]);
  });

  it('reads plain numbers', () => {
    expect(cycleNumbers(cycle(['1', '2', '3']))).toEqual([1, 2, 3]);
  });

  it('refuses a list of words', () => {
    expect(cycleNumbers(cycle(['Calm', 'Roused']))).toBeNull();
  });

  it('refuses a MIXED list, because a variable cannot be a word on Wednesday', () => {
    expect(cycleNumbers(cycle(['d4', 'Raging']))).toBeNull();
  });

  it('refuses an empty list', () => {
    expect(cycleNumbers(cycle([]))).toBeNull();
  });
});

describe('isNumericFunction', () => {
  it('accepts a counter', () => {
    expect(isNumericFunction(counter())).toBe(true);
  });

  it('accepts a numeric cycle and refuses a worded one', () => {
    expect(isNumericFunction(cycle(['d4', 'd6']))).toBe(true);
    expect(isNumericFunction(cycle(['On', 'Off']))).toBe(false);
  });

  it('never accepts a text field', () => {
    expect(isNumericFunction(text())).toBe(false);
  });
});

describe('functionValue', () => {
  it('is the counter the player has set', () => {
    expect(functionValue(counter(), { n: 5 })).toBe(5);
  });

  it('falls back to the author default when the player has not touched it', () => {
    expect(functionValue(counter({ start: 3 }), undefined)).toBe(3);
  });

  it('is the number the cycle is showing', () => {
    expect(functionValue(cycle(['d4', 'd6', 'd8']), { i: 2 })).toBe(8);
  });

  it('clamps an index past the end rather than reading undefined', () => {
    expect(functionValue(cycle(['d4', 'd6']), { i: 9 })).toBe(6);
  });

  it('is null for anything that is not a number', () => {
    expect(functionValue(text(), { s: 'hi' })).toBeNull();
    expect(functionValue(cycle(['On', 'Off']), { i: 0 })).toBeNull();
  });
});

describe('functionVars', () => {
  const card = (over: Partial<VarCard> = {}): VarCard => ({ id: 'card1', title: 'Brawler', functions: [counter(), text()], ...over });

  it('offers the numeric elements and nothing else', () => {
    const vars = functionVars([card()], undefined, []);
    expect(vars.map((v) => v.title)).toEqual(['Charges']);
  });

  it('names the card, so two cards with a Charges can be told apart', () => {
    expect(functionVars([card()], undefined, [])[0].cardTitle).toBe('Brawler');
  });

  it('reads the player live value', () => {
    expect(functionVars([card()], { card1: { c: { n: 7 } } }, [])[0].value).toBe(7);
  });

  it('folds a level advancement in, so a raised Combo Die reads as what it is now', () => {
    const die = card({
      id: 'combo',
      functions: [cycle(['d4', 'd6', 'd8'])],
      advances: [{ id: 'up', label: 'up', functionId: 'y', tiers: [], perTier: 1, effect: { kind: 'step', by: 1 } }],
    });
    expect(functionVars([die], undefined, [{ key: 'combo|up', tier: 2 }])[0].value).toBe(6);
  });

  it('says nothing about a card with no elements', () => {
    expect(functionVars([{ id: 'x', title: 'Plain' }], undefined, [])).toEqual([]);
  });
});

describe('functionVarKey / functionVarValues', () => {
  it('keys by card and element, so one title on two cards is two variables', () => {
    expect(functionVarKey('a', 'b')).toBe('a|b');
  });

  it('flattens to the map a formula resolves against', () => {
    expect(functionVarValues([{ key: 'a|b', title: 't', cardTitle: 'c', value: 3 }])).toEqual({ 'a|b': 3 });
  });
});
