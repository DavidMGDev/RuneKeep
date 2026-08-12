import { advancedFunctions, advancedStates, advanceKey, advanceSummary, hasCardAdvances, offeredAdvances, type AdvanceCard } from './card-advances';

const DIE: AdvanceCard = {
  id: 'combo',
  title: 'Combo Die',
  functions: [{ id: 'd', kind: 'counter', placement: 'below', label: 'Combo Die', start: 4, min: 4, max: 4 }],
  advances: [{ id: 'up', label: 'Combo Die goes up a size', functionId: 'd', tiers: [2, 3, 4], perTier: 1, effect: { kind: 'step', by: 2 } }],
};

describe('offeredAdvances', () => {
  it('offers what a card carries', () => {
    expect(offeredAdvances([DIE], 2, []).map((o) => o.key)).toEqual(['combo|up']);
  });

  it('withholds it outside its tiers', () => {
    expect(offeredAdvances([DIE], 1, [])).toEqual([]);
  });

  it('withholds it once taken at that tier, and offers it again at the next', () => {
    const taken = [{ key: 'combo|up', tier: 2 }];
    expect(offeredAdvances([DIE], 2, taken)).toEqual([]);
    expect(offeredAdvances([DIE], 3, taken)).toHaveLength(1);
  });

  it('counts twice-per-tier properly', () => {
    const twice: AdvanceCard = { ...DIE, advances: [{ ...DIE.advances![0], perTier: 2 }] };
    expect(offeredAdvances([twice], 2, [{ key: 'combo|up', tier: 2 }])).toHaveLength(1);
    expect(offeredAdvances([twice], 2, [{ key: 'combo|up', tier: 2 }, { key: 'combo|up', tier: 2 }])).toEqual([]);
  });

  it('counts a pending pick, so a chosen option leaves the list at once', () => {
    expect(offeredAdvances([DIE], 2, [], ['combo|up'])).toEqual([]);
  });

  it('says nothing for a card with no advancements', () => {
    expect(hasCardAdvances([{ id: 'x', title: 'Plain' }], 2, [])).toBe(false);
  });
});

describe('advancedFunctions', () => {
  it('leaves an untaken card exactly as authored', () => {
    expect(advancedFunctions(DIE, [])).toBe(DIE.functions);
  });

  it('moves the whole range, which is what "a size bigger" means', () => {
    const [f] = advancedFunctions(DIE, [{ key: 'combo|up', tier: 2 }]);
    expect([f.start, f.min, f.max]).toEqual([6, 6, 6]);
  });

  it('stacks two takes', () => {
    const [f] = advancedFunctions(DIE, [{ key: 'combo|up', tier: 2 }, { key: 'combo|up', tier: 3 }]);
    expect(f.max).toBe(8);
  });

  it('ignores a take whose advancement the author has deleted', () => {
    expect(advancedFunctions({ ...DIE, advances: [] }, [{ key: 'combo|up', tier: 2 }])).toBe(DIE.functions);
  });

  it('ignores the takes of another card', () => {
    expect(advancedFunctions(DIE, [{ key: 'other|up', tier: 2 }])).toBe(DIE.functions);
  });
});

describe('advancedStates', () => {
  it('moves a value the player has set', () => {
    expect(advancedStates(DIE, { d: { n: 4 } }, [{ key: 'combo|up', tier: 2 }])).toEqual({ d: { n: 6 } });
  });

  it('leaves an untouched element alone, because its default derives from the advanced element', () => {
    expect(advancedStates(DIE, {}, [{ key: 'combo|up', tier: 2 }])).toEqual({});
  });
});

describe('advanceKey', () => {
  it('names the card and the advancement, so two cards can offer the same one', () => {
    expect(advanceKey('a', 'b')).toBe('a|b');
  });
});

describe('advanceSummary', () => {
  it('says the card and what changes', () => {
    expect(advanceSummary(offeredAdvances([DIE], 2, [])[0])).toBe('Combo Die: +2');
  });
});
