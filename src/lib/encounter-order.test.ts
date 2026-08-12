import { applyOrder, moveTo, nudge, pruneOrder } from './encounter-order';

const items = (...ids: string[]) => ids.map((id) => ({ id }));
const ids = <T extends { id: string }>(list: T[]) => list.map((x) => x.id);

describe('applyOrder', () => {
  it('leaves a fight nobody has reordered exactly as it was', () => {
    expect(ids(applyOrder(items('a', 'b', 'c'), undefined))).toEqual(['a', 'b', 'c']);
    expect(ids(applyOrder(items('a', 'b', 'c'), []))).toEqual(['a', 'b', 'c']);
  });

  it('sorts by the saved order', () => {
    expect(ids(applyOrder(items('a', 'b', 'c'), ['c', 'a', 'b']))).toEqual(['c', 'a', 'b']);
  });

  it('drops an entry the order has never heard of to the END', () => {
    // A new adversary must arrive at the bottom, not shuffle the ones already placed.
    expect(ids(applyOrder(items('a', 'b', 'new'), ['b', 'a']))).toEqual(['b', 'a', 'new']);
  });

  it('keeps two unknown entries in the order they arrived', () => {
    expect(ids(applyOrder(items('x', 'a', 'y'), ['a']))).toEqual(['a', 'x', 'y']);
  });

  it('ignores an id in the order that is no longer in the fight', () => {
    expect(ids(applyOrder(items('a', 'b'), ['gone', 'b', 'a']))).toEqual(['b', 'a']);
  });
});

describe('moveTo', () => {
  it('moves one entry and leaves the rest in sequence', () => {
    expect(moveTo(['a', 'b', 'c', 'd'], 'd', 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(moveTo(['a', 'b', 'c', 'd'], 'a', 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('clamps past either end rather than dropping the entry', () => {
    expect(moveTo(['a', 'b', 'c'], 'a', -5)).toEqual(['a', 'b', 'c']);
    expect(moveTo(['a', 'b', 'c'], 'a', 99)).toEqual(['b', 'c', 'a']);
  });

  it('does nothing for an id that is not there', () => {
    expect(moveTo(['a', 'b'], 'zzz', 0)).toEqual(['a', 'b']);
  });

  it('names every entry afterwards, so the next drag is simple', () => {
    expect(moveTo(['a', 'b', 'c'], 'c', 0)).toHaveLength(3);
  });
});

describe('nudge', () => {
  it('moves one place either way', () => {
    expect(nudge(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(nudge(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
  });

  it('at the top, up does nothing', () => {
    expect(nudge(['a', 'b'], 'a', -1)).toEqual(['a', 'b']);
  });

  it('at the bottom, down does nothing', () => {
    expect(nudge(['a', 'b'], 'b', 1)).toEqual(['a', 'b']);
  });
});

describe('pruneOrder', () => {
  it('drops ids that have left the fight', () => {
    expect(pruneOrder(['a', 'gone', 'b'], ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('becomes nothing when the fight is empty', () => {
    expect(pruneOrder(['a'], [])).toBeUndefined();
    expect(pruneOrder(undefined, ['a'])).toBeUndefined();
  });
});
