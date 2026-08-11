import { DIE_MAX } from '@/features/character-sheet/components/card-tokens-data';
import { addDie, dieVerdicts, dualityVerdict, hasDuality, type PoolDie, poolGrid, poolTotal, layoutRolled, removeDie, rollBand, rollCentsSeries, rollTally, rollVoice, staggerScale, sortPool } from './dice-pool';

const die = (type: PoolDie['type'], value: number | null = null, side?: PoolDie['side'], id = `${type}-${Math.random()}`): PoolDie => ({ id, type, value, side });

describe('sortPool', () => {
  it('puts the smaller die first however it was added', () => {
    const pool = [die('d20'), die('d8'), die('d20'), die('d8')];
    expect(sortPool(pool).map((d) => d.type)).toEqual(['d8', 'd8', 'd20', 'd20']);
  });

  it('keeps dice of the same size in the order they were added', () => {
    const a = die('d6', null, undefined, 'a'), b = die('d6', null, undefined, 'b'), c = die('d6', null, undefined, 'c');
    expect(sortPool([a, b, c]).map((d) => d.id)).toEqual(['a', 'b', 'c']);
    expect(sortPool([c, a, b]).map((d) => d.id)).toEqual(['c', 'a', 'b']);
  });

  it('leads the duality pair with Hope', () => {
    expect(sortPool([die('d12', 4, 'fear'), die('d12', 9, 'hope')]).map((d) => d.side)).toEqual(['hope', 'fear']);
  });

  it('does not mutate its argument', () => {
    const pool = [die('d20'), die('d4')];
    const before = pool.map((d) => d.type);
    sortPool(pool);
    expect(pool.map((d) => d.type)).toEqual(before);
  });
});

describe('poolGrid', () => {
  it('is empty for no dice', () => {
    expect(poolGrid(0, 340, 140).slots).toEqual([]);
  });

  it('gives one die the biggest box the panel allows, up to the cap', () => {
    const one = poolGrid(1, 340, 140, { gap: 8, max: 96 });
    expect(one.cols).toBe(1);
    expect(one.cell).toBe(96);
  });

  it('shrinks the dice as the pool fills', () => {
    const sizes = [1, 2, 5, 12].map((n) => poolGrid(n, 340, 140).cell);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1]);
  });

  it('lays a wide panel out in rows rather than columns', () => {
    // 340x140 is nearly two and a half times as wide as it is tall: six dice belong in two rows.
    const g = poolGrid(6, 340, 140);
    expect(g.cols).toBe(3);
    expect(g.rows).toBe(2);
  });

  it('gives every die a slot, inside the panel', () => {
    const g = poolGrid(7, 340, 140);
    expect(g.slots).toHaveLength(7);
    for (const s of g.slots) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.x + g.cell).toBeLessThanOrEqual(340.001);
      expect(s.y + g.cell).toBeLessThanOrEqual(140.001);
    }
  });

  it('centres a short last row', () => {
    const g = poolGrid(7, 340, 140);
    const lastRow = g.slots.filter((s) => s.y === g.slots[g.slots.length - 1].y);
    expect(lastRow.length).toBeLessThan(g.cols); // it IS short, or the test proves nothing
    const left = lastRow[0].x;
    const right = lastRow[lastRow.length - 1].x + g.cell;
    expect((left + right) / 2).toBeCloseTo(170, 3);
  });
});

describe('poolTotal', () => {
  it('adds the faces and the modifier', () => {
    expect(poolTotal([die('d6', 4), die('d20', 17)], 2)).toBe(23);
  });

  it('counts an unrolled die as nothing', () => {
    expect(poolTotal([die('d6'), die('d6', 3)])).toBe(3);
  });
});

describe('dualityVerdict', () => {
  it('reads Hope when Hope is higher', () => {
    expect(dualityVerdict([die('d12', 9, 'hope'), die('d12', 4, 'fear')])).toBe('hope');
  });

  it('reads Fear when Fear is higher', () => {
    expect(dualityVerdict([die('d12', 2, 'hope'), die('d12', 11, 'fear')])).toBe('fear');
  });

  it('reads a critical when they match', () => {
    expect(dualityVerdict([die('d12', 7, 'hope'), die('d12', 7, 'fear')])).toBe('critical');
  });

  it('says nothing about a pool with no pair in it', () => {
    expect(dualityVerdict([die('d6', 3), die('d6', 5)])).toBeNull();
  });

  it('says nothing until both halves have landed', () => {
    expect(dualityVerdict([die('d12', null, 'hope'), die('d12', 5, 'fear')])).toBeNull();
  });
});

describe('rollCentsSeries', () => {
  const rising = (cents: number[]) => cents.every((c, i) => i === 0 || c >= cents[i - 1]);

  it('never goes down when the kind of die changes', () => {
    // The owner's report: the last d4 is a 4 of 4 and the first d6 a 1 of 6, and the pitch fell off
    // a cliff between them.
    const pool = [die('d4', 1, undefined, 'a'), die('d4', 4, undefined, 'b'), die('d6', 1, undefined, 'c'), die('d6', 6, undefined, 'd')];
    const cents = rollCentsSeries(pool);
    expect(rising(cents)).toBe(true);
    expect(cents[2]).toBeGreaterThan(cents[1]);
  });

  it('never goes down for any ordering of any handful', () => {
    const kinds = ['d4', 'd6', 'd8', 'd12', 'd20'] as const;
    for (let seed = 1; seed <= 60; seed++) {
      const pool = Array.from({ length: (seed % 9) + 1 }, (_, i) => {
        const t = kinds[(seed * 7 + i * 3) % kinds.length];
        return die(t, ((seed * 13 + i * 5) % DIE_MAX[t]) + 1, undefined, `d${i}`);
      });
      expect(rising(rollCentsSeries(sortPool(pool)))).toBe(true);
    }
  });

  it('spans the same range however many dice there are', () => {
    const two = rollCentsSeries([die('d6', 1, undefined, 'a'), die('d6', 6, undefined, 'b')]);
    const many = rollCentsSeries(Array.from({ length: 20 }, (_, i) => die('d6', (i % 6) + 1, undefined, `d${i}`)));
    // The last die of a twenty-strong throw is no higher than the last of a pair: the ceiling is the
    // ceiling, so a big handful cannot climb out of hearing.
    expect(Math.max(...many)).toBeLessThanOrEqual(Math.max(...two));
  });

  it('still deepens a bad face and lifts a good one', () => {
    expect(rollCentsSeries([die('d20', 1, undefined, 'a')])[0]).toBeLessThan(rollCentsSeries([die('d20', 20, undefined, 'a')])[0]);
  });

  it('gives the same face on the same kind of die the same pitch', () => {
    const cents = rollCentsSeries([die('d6', 4, undefined, 'a'), die('d6', 4, undefined, 'b')]);
    expect(cents[0]).toBe(cents[1]);
  });

  it('has nothing to say about an empty pool', () => {
    expect(rollCentsSeries([])).toEqual([]);
  });
});

describe('layoutRolled', () => {
  it('deals each kind of die out low to high', () => {
    const pool = layoutRolled([
      die('d4', 3, undefined, 'a'), die('d4', 1, undefined, 'b'), die('d4', 4, undefined, 'c'),
      die('d6', 5, undefined, 'd'), die('d6', 2, undefined, 'e'),
    ]);
    expect(pool.map((d) => d.value)).toEqual([1, 3, 4, 2, 5]);
  });

  it('keeps the total exactly', () => {
    const before = [die('d8', 7, undefined, 'a'), die('d8', 2, undefined, 'b'), die('d4', 4, undefined, 'c')];
    expect(poolTotal(layoutRolled(before), 3)).toBe(poolTotal(before, 3));
  });

  it('never moves a duality face, because the pair is not interchangeable', () => {
    const pool = layoutRolled([
      { id: 'h', type: 'd12', value: 11, side: 'hope', pairId: 'p' },
      { id: 'f', type: 'd12', value: 2, side: 'fear', pairId: 'p' },
    ]);
    expect(pool.map((d) => d.value)).toEqual([11, 2]);
    expect(dualityVerdict(pool)).toBe('hope');
  });

  it('leaves an unrolled pool alone', () => {
    expect(layoutRolled([die('d6'), die('d6')]).map((d) => d.value)).toEqual([null, null]);
  });
});

describe('staggerScale', () => {
  it('stretches a pair by three fifths', () => {
    expect(staggerScale(2)).toBeCloseTo(1.6);
  });

  it('gives a twentieth back per extra die', () => {
    expect(staggerScale(3)).toBeCloseTo(1.55);
    expect(staggerScale(4)).toBeCloseTo(1.5);
  });

  it('reaches the ordinary pace at fourteen and never goes below it', () => {
    expect(staggerScale(14)).toBeCloseTo(1);
    expect(staggerScale(30)).toBe(1);
  });
});

describe('rollVoice', () => {
  const pair = (h: number, f: number) => [
    { id: 'h', type: 'd12' as const, value: h, side: 'hope' as const, pairId: 'p' },
    { id: 'f', type: 'd12' as const, value: f, side: 'fear' as const, pairId: 'p' },
  ];

  it('never celebrates a Fear roll, however high it lands', () => {
    // 11 + 12 is 23 of a possible 24, deep in the top quarter, and it is still a Fear roll.
    expect(rollVoice(pair(11, 12))).toBe('fear');
  });

  it('mutes an ordinary critical that came with Fear', () => {
    expect(rollVoice([...pair(3, 9), die('d20', 20, undefined, 'x')])).toBe('muted');
  });

  it('lets an ordinary critical ring out when the pair rolled with Hope', () => {
    expect(rollVoice([...pair(9, 3), die('d20', 20, undefined, 'x')])).toBe('critical');
  });

  it('says Hope and Fear when nothing else happened', () => {
    expect(rollVoice(pair(9, 3))).toBe('hope');
    expect(rollVoice(pair(3, 9))).toBe('fear');
  });

  it('calls a matched pair critical', () => {
    expect(rollVoice(pair(7, 7))).toBe('critical');
  });

  it('falls back to the bands with no pair in the pool', () => {
    expect(rollVoice([die('d20', 20, undefined, 'x')])).toBe('critical');
    expect(rollVoice([die('d4', 4, undefined, 'a'), die('d8', 8, undefined, 'b'), die('d12', 10, undefined, 'c')])).toBe('critical');
    expect(rollVoice([die('d20', 2, undefined, 'x')])).toBe('bad');
    expect(rollVoice([die('d20', 10, undefined, 'x')])).toBe('plain');
  });
});

describe('rollBand', () => {
  // d4 + d8 + d12 = 24, so the top quarter starts at 18 and the bottom one ends at 6 (owner).
  const mixed = (a: number, b: number, c: number) => [die('d4', a), die('d8', b), die('d12', c)];

  it('calls the top quarter high', () => {
    expect(rollBand(mixed(4, 8, 12))).toBe('high');
    expect(rollBand(mixed(3, 5, 10))).toBe('high'); // exactly 18
  });

  it('calls the bottom quarter low', () => {
    expect(rollBand(mixed(1, 1, 1))).toBe('low');
    expect(rollBand(mixed(2, 2, 2))).toBe('low'); // exactly 6
  });

  it('calls everything between them middling', () => {
    expect(rollBand(mixed(2, 2, 3))).toBe('mid');
    expect(rollBand(mixed(3, 5, 9))).toBe('mid'); // one under the top quarter
  });

  it('ignores the modifier, because a flat bonus says nothing about the dice', () => {
    expect(rollBand([die('d20', 3)])).toBe('low');
  });

  it('has no opinion about an empty pool', () => {
    expect(rollBand([])).toBe('mid');
  });
});

describe('addDie / removeDie', () => {
  const ids = (base: string) => (n: number) => `${base}-${n}`;

  it('adds one die for an ordinary type', () => {
    const pool = addDie([], 'd20', ids('a'));
    expect(pool.map((d) => d.type)).toEqual(['d20']);
    expect(pool[0].pairId).toBeUndefined();
  });

  it('adds TWO bound dice for the duality entry', () => {
    const pool = addDie([], 'duality', ids('a'));
    expect(pool).toHaveLength(2);
    expect(pool.map((d) => d.type)).toEqual(['d12', 'd12']);
    expect(pool.map((d) => d.side)).toEqual(['hope', 'fear']);
    expect(pool[0].pairId).toBe(pool[1].pairId);
    expect(pool[0].id).not.toBe(pool[1].id);
  });

  it('takes the partner out with either half', () => {
    const pool = addDie(addDie([], 'd6', ids('a')), 'duality', ids('b'));
    expect(pool).toHaveLength(3);
    const hope = pool.find((d) => d.side === 'hope')!;
    const fear = pool.find((d) => d.side === 'fear')!;
    expect(removeDie(pool, hope.id).map((d) => d.type)).toEqual(['d6']);
    expect(removeDie(pool, fear.id).map((d) => d.type)).toEqual(['d6']);
  });

  it('leaves a lone die alone when a pair is removed', () => {
    const pool = addDie(addDie([], 'duality', ids('a')), 'd20', ids('b'));
    const hope = pool.find((d) => d.side === 'hope')!;
    expect(removeDie(pool, hope.id).map((d) => d.type)).toEqual(['d20']);
  });

  it('never leaves an odd half in the pool', () => {
    let pool = addDie(addDie(addDie([], 'd6', ids('a')), 'duality', ids('b')), 'd20', ids('c'));
    expect(pool).toHaveLength(4);
    pool = removeDie(pool, pool.find((d) => d.side === 'fear')!.id);
    expect(pool.map((d) => d.type)).toEqual(['d6', 'd20']);
    expect(pool.some((d) => d.side)).toBe(false);
  });

  it('ignores an id that is not in the pool', () => {
    const pool = addDie([], 'd6', ids('a'));
    expect(removeDie(pool, 'nope')).toBe(pool);
  });
});

describe('dieVerdicts', () => {
  it('calls an ordinary die at its maximum a critical', () => {
    expect(dieVerdicts([die('d20', 20, undefined, 'x')]).x).toBe('critical');
    expect(dieVerdicts([die('d6', 6, undefined, 'x')]).x).toBe('critical');
  });

  it('gives an ordinary die that rolls one the fear treatment', () => {
    expect(dieVerdicts([die('d20', 1, undefined, 'x')]).x).toBe('fear');
  });

  it('keeps everything in between quiet', () => {
    for (const v of [2, 7, 19]) expect(dieVerdicts([die('d20', v, undefined, 'x')]).x).toBe('plain');
  });

  it('says nothing about a die that has not been rolled', () => {
    expect(dieVerdicts([die('d20', null, undefined, 'x')]).x).toBe('plain');
  });

  it('moves only the winner of a duality pair', () => {
    const hope: PoolDie = { id: 'h', type: 'd12', value: 9, side: 'hope', pairId: 'p' };
    const fear: PoolDie = { id: 'f', type: 'd12', value: 4, side: 'fear', pairId: 'p' };
    const v = dieVerdicts([hope, fear]);
    expect(v.h).toBe('hope');
    expect(v.f).toBe('plain');
  });

  it('moves the fear die when Fear wins', () => {
    const v = dieVerdicts([
      { id: 'h', type: 'd12', value: 2, side: 'hope', pairId: 'p' },
      { id: 'f', type: 'd12', value: 11, side: 'fear', pairId: 'p' },
    ]);
    expect(v.f).toBe('fear');
    expect(v.h).toBe('plain');
  });

  it('moves both on a critical', () => {
    const v = dieVerdicts([
      { id: 'h', type: 'd12', value: 7, side: 'hope', pairId: 'p' },
      { id: 'f', type: 'd12', value: 7, side: 'fear', pairId: 'p' },
    ]);
    expect(v.h).toBe('critical');
    expect(v.f).toBe('critical');
  });

  it('does not give a duality d12 the ordinary maximum critical', () => {
    // A 12 on the Hope die is not a critical on its own — only a matching pair is.
    const v = dieVerdicts([
      { id: 'h', type: 'd12', value: 12, side: 'hope', pairId: 'p' },
      { id: 'f', type: 'd12', value: 3, side: 'fear', pairId: 'p' },
    ]);
    expect(v.h).toBe('hope');
  });
});

describe('one duality pair at a time (v0.40.1)', () => {
  const ids = (base: string) => (n: number) => `${base}-${n}`;

  it('refuses a second pair, unchanged', () => {
    const one = addDie([], 'duality', ids('a'));
    expect(addDie(one, 'duality', ids('b'))).toBe(one);
  });

  it('still takes ordinary dice alongside the pair', () => {
    let pool = addDie([], 'duality', ids('a'));
    pool = addDie(pool, 'd4', ids('b'));
    pool = addDie(pool, 'd4', ids('c'));
    expect(pool).toHaveLength(4);
    expect(hasDuality(pool)).toBe(true);
  });

  it('lets a new pair in once the first is taken out', () => {
    const one = addDie([], 'duality', ids('a'));
    const gone = removeDie(one, one[0].id);
    expect(hasDuality(gone)).toBe(false);
    expect(addDie(gone, 'duality', ids('b'))).toHaveLength(2);
  });
});

describe('dualityVerdict in company (v0.40.1)', () => {
  const pair = (h: number, f: number): PoolDie[] => [
    { id: 'h', type: 'd12', value: h, side: 'hope', pairId: 'p' },
    { id: 'f', type: 'd12', value: f, side: 'fear', pairId: 'p' },
  ];

  it('still reads Hope with two d4 alongside', () => {
    expect(dualityVerdict([...pair(9, 4), die('d4', 3, undefined, 'a'), die('d4', 1, undefined, 'b')])).toBe('hope');
  });

  it('still reads Fear with company', () => {
    expect(dualityVerdict([...pair(2, 11), die('d20', 19, undefined, 'a')])).toBe('fear');
  });

  it('still reads a critical with company', () => {
    expect(dualityVerdict([...pair(7, 7), die('d6', 6, undefined, 'a')])).toBe('critical');
  });

  it('says nothing when there is no pair', () => {
    expect(dualityVerdict([die('d12', 12, undefined, 'a'), die('d12', 3, undefined, 'b')])).toBeNull();
  });

  it('totals everything, pair included', () => {
    expect(poolTotal([...pair(9, 4), die('d4', 3, undefined, 'a')], 2)).toBe(18);
  });
});

describe('rollTally', () => {
  it('counts maximums as successes and ones as failures', () => {
    const pool = [die('d20', 20, undefined, 'a'), die('d20', 1, undefined, 'b'), die('d20', 20, undefined, 'c'), die('d20', 11, undefined, 'd')];
    expect(rollTally(pool)).toEqual({ crits: 2, fails: 1 });
  });

  it('counts a matched pair as ONE success, not two', () => {
    expect(rollTally([
      { id: 'h', type: 'd12', value: 7, side: 'hope', pairId: 'p' },
      { id: 'f', type: 'd12', value: 7, side: 'fear', pairId: 'p' },
    ])).toEqual({ crits: 1, fails: 0 });
  });

  it('never counts a Fear roll as a failure', () => {
    expect(rollTally([
      { id: 'h', type: 'd12', value: 2, side: 'hope', pairId: 'p' },
      { id: 'f', type: 'd12', value: 11, side: 'fear', pairId: 'p' },
    ])).toEqual({ crits: 0, fails: 0 });
  });

  it('counts nothing for a quiet handful', () => {
    expect(rollTally([die('d20', 11, undefined, 'a'), die('d6', 3, undefined, 'b')])).toEqual({ crits: 0, fails: 0 });
  });

  it('adds the pair success to the ordinary dice', () => {
    expect(rollTally([
      { id: 'h', type: 'd12', value: 7, side: 'hope', pairId: 'p' },
      { id: 'f', type: 'd12', value: 7, side: 'fear', pairId: 'p' },
      die('d6', 6, undefined, 'a'),
      die('d6', 1, undefined, 'b'),
    ])).toEqual({ crits: 2, fails: 1 });
  });
});
