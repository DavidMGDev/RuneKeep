import { dualityVerdict, type PoolDie, poolGrid, poolTotal, rollCents, sortPool } from './dice-pool';

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

  it('says nothing about a pool that is not the pair', () => {
    expect(dualityVerdict([die('d6', 3), die('d6', 5)])).toBeNull();
    expect(dualityVerdict([die('d12', 3, 'hope'), die('d12', 5, 'fear'), die('d6', 2)])).toBeNull();
    expect(dualityVerdict([die('d12', null, 'hope'), die('d12', 5, 'fear')])).toBeNull();
  });
});

describe('rollCents', () => {
  it('climbs across the throw', () => {
    const pool = [die('d6'), die('d6'), die('d6')];
    expect(rollCents(pool, 1)).toBeGreaterThan(rollCents(pool, 0));
    expect(rollCents(pool, 2)).toBeGreaterThan(rollCents(pool, 1));
  });

  it('climbs further when the die size changes', () => {
    const same = [die('d6'), die('d6')];
    const grown = [die('d6'), die('d20')];
    expect(rollCents(grown, 1) - rollCents(grown, 0)).toBeGreaterThan(rollCents(same, 1) - rollCents(same, 0));
  });
});
