import { dedupeIds } from './card-data';

describe('dedupeIds (#269)', () => {
  it('leaves unique ids untouched', () => {
    expect(dedupeIds(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });
  it('keeps the first occurrence and suffixes repeats positionally', () => {
    expect(dedupeIds(['x', 'x', 'x'])).toEqual(['x', 'x#2', 'x#3']);
  });
  it('handles interleaved duplicates', () => {
    expect(dedupeIds(['x', 'y', 'x', 'y', 'x'])).toEqual(['x', 'y', 'x#2', 'y#2', 'x#3']);
  });
  it('is a no-op on an empty list', () => {
    expect(dedupeIds([])).toEqual([]);
  });
});
